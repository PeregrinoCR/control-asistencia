-- Justificación de ausencias por el docente.
-- El estudiante presenta el comprobante FÍSICO a cada profesor con quien faltó (plazo: 5 días hábiles).
-- Cada profesor decide por su lección y la marca pasa a "J" (ausencia justificada); tiene 10 días hábiles.
-- Pasado ese plazo la marca se bloquea y solo dirección puede cambiarla, dejando el motivo en la bitácora.
-- Los plazos (5 y 10) y los días no lectivos se configuran en colegios.config.justificacion:
--   { "diasFamilia": 5, "diasDocente": 10, "noLectivos": ["2026-11-02", ...] }

-- ---------- La marca "J" y lo que se guarda al justificar ----------
alter table asistencia drop constraint if exists asistencia_marca_check;
alter table asistencia add constraint asistencia_marca_check check (marca in ('P', 'T', 'A', 'J'));
alter table asistencia add column if not exists justificada_por uuid references personal;
alter table asistencia add column if not exists justificada_en timestamptz;
alter table asistencia add column if not exists comprobante boolean not null default false;
alter table asistencia add column if not exists nota_justificacion text;

-- ---------- Aviso de la familia (solo informativo) ----------
-- La familia cuenta el motivo; el docente lo ve al decidir. No reemplaza el comprobante físico.
create table if not exists ausencia_avisos (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  estudiante_id uuid not null references estudiantes on delete cascade,
  fecha date not null,
  motivo text not null,
  comentario text,
  enviado_por uuid references auth.users,
  enviado timestamptz not null default now(),
  unique (estudiante_id, fecha)
);
alter table ausencia_avisos enable row level security;
drop policy if exists ver on ausencia_avisos;
drop policy if exists enviar on ausencia_avisos;
drop policy if exists cambiar on ausencia_avisos;
create policy ver on ausencia_avisos for select using (
  estudiante_id in (select mis_estudiantes())
  or exists (select 1 from estudiantes e where e.id = estudiante_id and (tiene_permiso('viewAttendance', e.seccion_id) or doy_leccion_en(e.seccion_id)))
);
create policy enviar on ausencia_avisos for insert
  with check (estudiante_id in (select mis_estudiantes()) and enviado_por = auth.uid() and colegio_id = mi_colegio());
create policy cambiar on ausencia_avisos for update using (estudiante_id in (select mis_estudiantes()));

-- ---------- Plazos y días hábiles ----------
create or replace function plazo_familia(col uuid) returns integer language sql stable security definer set search_path = public as $$
  select coalesce((c.config->'justificacion'->>'diasFamilia')::integer, 5) from colegios c where c.id = col
$$;
create or replace function plazo_docente(col uuid) returns integer language sql stable security definer set search_path = public as $$
  select coalesce((c.config->'justificacion'->>'diasDocente')::integer, 10) from colegios c where c.id = col
$$;

-- Días hábiles transcurridos después de `desde`, hasta `hasta` inclusive: lunes a viernes menos los días no lectivos del colegio.
create or replace function dias_habiles(col uuid, desde date, hasta date) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from generate_series((desde + 1)::timestamp, hasta::timestamp, interval '1 day') as g(d)
  where extract(isodow from d) between 1 and 5
    and not exists (
      select 1 from colegios c, jsonb_array_elements_text(coalesce(c.config->'justificacion'->'noLectivos', '[]'::jsonb)) x
      where c.id = col and x::date = d::date)
$$;

-- ---------- Protección de la marca "J" ----------
-- La marca "J" solo se pone o se quita con las funciones de abajo, que revisan quién es y el plazo.
create or replace function proteger_justificacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.justificando', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    -- Guardar una lista que ya trae esa marca no la cambia: se permite si la fila ya existe con "J".
    if new.marca = 'J' and not exists (
      select 1 from asistencia a where a.estudiante_id = new.estudiante_id and a.fecha = new.fecha and a.leccion = new.leccion and a.marca = 'J') then
      raise exception 'La marca "justificada" solo la pone el docente desde Por justificar.';
    end if;
    return new;
  end if;
  if new.marca is distinct from old.marca and (new.marca = 'J' or old.marca = 'J') then
    raise exception 'Esta ausencia está justificada: use "Quitar justificación" dentro del plazo, o pida a dirección que la reabra.';
  end if;
  return new;
end
$$;
drop trigger if exists proteger_justificacion on asistencia;
create trigger proteger_justificacion before insert or update of marca on asistencia
  for each row execute function proteger_justificacion();

-- ---------- Funciones ----------
-- ¿La persona conectada da esa lección (por horario, por cobertura de ese día o porque pasó la lista)?
create or replace function doy_esa_leccion(p_seccion uuid, p_fecha date, p_leccion smallint, p_registrada_por uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from horario h join personal p on p.id = h.docente_id
    where h.seccion_id = p_seccion and h.leccion = p_leccion and p.usuario_id = auth.uid()
      and h.dia = (array['L', 'K', 'M', 'J', 'V', 'S', 'D'])[extract(isodow from p_fecha)::int]
  ) or exists (
    select 1 from coberturas c join ausencias_docentes a on a.id = c.ausencia_id join personal p on p.id = c.sustituto_id
    where c.seccion_id = p_seccion and c.leccion = p_leccion and a.fecha = p_fecha and p.usuario_id = auth.uid()
  ) or exists (select 1 from personal p where p.id = p_registrada_por and p.usuario_id = auth.uid())
$$;

-- Marca como justificada una ausencia de su propia lección, dentro del plazo del docente.
create or replace function justificar_ausencia(
  p_estudiante uuid, p_fecha date, p_leccion smallint, p_comprobante boolean default true, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  a asistencia;
  e estudiantes;
  yo uuid;
  materia text;
begin
  select * into a from asistencia where estudiante_id = p_estudiante and fecha = p_fecha and leccion = p_leccion;
  if not found then raise exception 'No hay una ausencia registrada en esa lección.'; end if;
  select * into e from estudiantes where id = p_estudiante;
  if e.colegio_id is distinct from mi_colegio() then raise exception 'Sin permiso.'; end if;
  if not (tiene_permiso('rollCall') and doy_esa_leccion(a.seccion_id, a.fecha, a.leccion, a.registrado_por)) then
    raise exception 'Solo el docente de esa lección puede justificarla.';
  end if;
  if a.marca not in ('A', 'J') then raise exception 'Solo se justifican ausencias.'; end if;
  if dias_habiles(e.colegio_id, a.fecha, cr_hoy()) > plazo_docente(e.colegio_id) then
    raise exception 'Pasó el plazo de % días hábiles: pida a dirección que la reabra.', plazo_docente(e.colegio_id);
  end if;
  select id into yo from personal where usuario_id = auth.uid();
  perform set_config('app.justificando', '1', true);
  update asistencia set marca = 'J', justificada_por = yo, justificada_en = now(), comprobante = coalesce(p_comprobante, false), nota_justificacion = nullif(trim(p_nota), '')
    where id = a.id;
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (e.colegio_id, auth.uid(), 'justificar_ausencia', jsonb_build_object('estudiante', p_estudiante, 'fecha', p_fecha, 'leccion', p_leccion, 'comprobante', p_comprobante, 'nota', p_nota));
  if a.marca = 'A' then
    select m.nombre into materia from horario h join materias m on m.id = h.materia_id
      where h.seccion_id = a.seccion_id and h.leccion = a.leccion
        and h.dia = (array['L', 'K', 'M', 'J', 'V', 'S', 'D'])[extract(isodow from a.fecha)::int];
    perform avisar_estudiante(e.id, 'justificacion', 'Ausencia justificada',
      split_part(e.nombre, ' ', 1) || ': la ausencia del ' || to_char(a.fecha, 'DD/MM') || ' (' || coalesce(materia, a.leccion || '.ª lección') || ') fue justificada por el docente.',
      '/familia/historial', false);
  end if;
end
$$;

-- Deshace la justificación (de su lección y dentro del plazo): la ausencia vuelve a "sin justificar".
create or replace function quitar_justificacion(p_estudiante uuid, p_fecha date, p_leccion smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  a asistencia;
  e estudiantes;
begin
  select * into a from asistencia where estudiante_id = p_estudiante and fecha = p_fecha and leccion = p_leccion and marca = 'J';
  if not found then raise exception 'Esa ausencia no está justificada.'; end if;
  select * into e from estudiantes where id = p_estudiante;
  if e.colegio_id is distinct from mi_colegio() then raise exception 'Sin permiso.'; end if;
  if not (tiene_permiso('rollCall') and doy_esa_leccion(a.seccion_id, a.fecha, a.leccion, a.registrado_por)) then
    raise exception 'Solo el docente de esa lección puede cambiarla.';
  end if;
  if dias_habiles(e.colegio_id, a.fecha, cr_hoy()) > plazo_docente(e.colegio_id) then
    raise exception 'Pasó el plazo de % días hábiles: pida a dirección que la reabra.', plazo_docente(e.colegio_id);
  end if;
  perform set_config('app.justificando', '1', true);
  update asistencia set marca = 'A', justificada_por = null, justificada_en = null, comprobante = false, nota_justificacion = null where id = a.id;
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (e.colegio_id, auth.uid(), 'quitar_justificacion', jsonb_build_object('estudiante', p_estudiante, 'fecha', p_fecha, 'leccion', p_leccion));
end
$$;

-- Excepción de dirección: justifica o quita la justificación en cualquier momento, con el motivo en la bitácora.
create or replace function excepcion_justificacion(
  p_estudiante uuid, p_fecha date, p_leccion smallint, p_justificar boolean, p_motivo text
) returns void language plpgsql security definer set search_path = public as $$
declare
  a asistencia;
  e estudiantes;
  yo uuid;
begin
  select * into e from estudiantes where id = p_estudiante;
  if e.colegio_id is distinct from mi_colegio() or not tiene_permiso('approveJust') then raise exception 'Sin permiso.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escriba el motivo de la excepción.'; end if;
  select * into a from asistencia where estudiante_id = p_estudiante and fecha = p_fecha and leccion = p_leccion;
  if not found then raise exception 'No hay una ausencia registrada en esa lección.'; end if;
  if a.marca not in ('A', 'J') then raise exception 'Solo se cambian ausencias.'; end if;
  select id into yo from personal where usuario_id = auth.uid();
  perform set_config('app.justificando', '1', true);
  if p_justificar then
    update asistencia set marca = 'J', justificada_por = yo, justificada_en = now(), nota_justificacion = 'Excepción de dirección: ' || trim(p_motivo) where id = a.id;
  else
    update asistencia set marca = 'A', justificada_por = null, justificada_en = null, comprobante = false, nota_justificacion = null where id = a.id;
  end if;
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (e.colegio_id, auth.uid(), 'excepcion_justificacion',
            jsonb_build_object('estudiante', p_estudiante, 'fecha', p_fecha, 'leccion', p_leccion, 'justificar', p_justificar, 'motivo', p_motivo));
  if p_justificar and a.marca = 'A' then
    perform avisar_estudiante(e.id, 'justificacion', 'Ausencia justificada',
      split_part(e.nombre, ' ', 1) || ': la ausencia del ' || to_char(a.fecha, 'DD/MM') || ' fue justificada por la dirección.', '/familia/historial', false);
  end if;
end
$$;

-- ---------- Avisos ----------
-- Al marcar una ausencia se explica el plazo (comprobante físico en el colegio), no "justificar desde la app".
create or replace function avisar_asistencia() returns trigger language plpgsql security definer set search_path = public as $$
declare
  e estudiantes;
  materia text;
  hoy_dia text := (array['L','K','M','J','V','S','D'])[extract(isodow from new.fecha)::int];
begin
  if new.marca not in ('A', 'T') or (tg_op = 'UPDATE' and old.marca = new.marca) then return new; end if;
  select * into e from estudiantes where id = new.estudiante_id;
  if not regla(e.colegio_id, case new.marca when 'A' then 'abs' else 'late' end) then return new; end if;
  select m.nombre into materia from horario h join materias m on m.id = h.materia_id
    where h.seccion_id = new.seccion_id and h.dia = hoy_dia and h.leccion = new.leccion;
  perform avisar_estudiante(
    e.id,
    case new.marca when 'A' then 'ausencia' else 'tardia' end,
    case new.marca when 'A' then split_part(e.nombre, ' ', 1) || ' fue marcado(a) ausente'
                   else split_part(e.nombre, ' ', 1) || ' llegó tarde' end,
    coalesce(materia, 'Lección') || ', ' || new.leccion || '.ª lección.' ||
      case new.marca when 'A' then ' Para justificarla, presente el comprobante a ese profesor en el colegio en los próximos '
        || plazo_familia(e.colegio_id) || ' días hábiles.' else '' end,
    '/familia',
    new.marca = 'A' and (e.nacimiento is null or e.nacimiento > cr_hoy() - interval '18 years'));
  return new;
end
$$;

-- Recordatorios diarios: a la familia el último día de su plazo, y al docente cuando le quedan 2 días.
create or replace function recordatorios_justificacion() returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  -- Familia: queda 1 día hábil para presentar el comprobante.
  for r in
    select distinct a.estudiante_id, a.fecha, e.nombre, e.colegio_id
    from asistencia a join estudiantes e on e.id = a.estudiante_id
    where a.marca = 'A' and e.activo
      and dias_habiles(e.colegio_id, a.fecha, cr_hoy()) = plazo_familia(e.colegio_id) - 1
  loop
    perform avisar_estudiante(r.estudiante_id, 'recordatorio', 'Mañana vence el plazo del comprobante',
      split_part(r.nombre, ' ', 1) || ': la ausencia del ' || to_char(r.fecha, 'DD/MM') || ' se justifica presentando el comprobante al profesor.',
      '/familia/historial', false);
    n := n + 1;
  end loop;
  -- Docente: le quedan 2 días hábiles para decidir ausencias de las lecciones que pasó.
  for r in
    select p.usuario_id, p.telefono, p.colegio_id, count(*) as pendientes
    from asistencia a join personal p on p.id = a.registrado_por
    where a.marca = 'A' and p.activo and p.usuario_id is not null
      and dias_habiles(p.colegio_id, a.fecha, cr_hoy()) = plazo_docente(p.colegio_id) - 2
    group by p.usuario_id, p.telefono, p.colegio_id
  loop
    perform encolar(r.colegio_id, r.usuario_id, r.telefono, 'recordatorio', 'Ausencias por justificar',
      'Le quedan 2 días hábiles para decidir ' || r.pendientes || ' ausencias de sus lecciones.', '/docente/por-justificar', false);
    n := n + 1;
  end loop;
  return n;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'recordatorios-justificacion';
    -- 4:00 p. m. hora de Costa Rica (22:00 UTC), de lunes a viernes.
    perform cron.schedule('recordatorios-justificacion', '0 22 * * 1-5', $c$ select recordatorios_justificacion() $c$);
  end if;
end
$$;

-- ---------- Resumen del mes: justificadas aparte de las ausencias sin justificar ----------
create or replace view asistencia_mes with (security_invoker = true) as
select estudiante_id,
  count(*) filter (where marca = 'A') as ausencias,
  count(*) filter (where marca = 'T') as tardias,
  count(*) filter (where marca = 'J') as justificadas
from asistencia
where fecha >= date_trunc('month', current_date)
group by estudiante_id;
grant select on asistencia_mes to authenticated;

-- ---------- Dirección recuerda a un docente sus pendientes ----------
create or replace function recordar_docente(p_docente uuid) returns integer language plpgsql security definer set search_path = public as $$
declare
  p personal;
  pendientes integer;
begin
  if not tiene_permiso('approveJust') then raise exception 'Sin permiso.'; end if;
  select * into p from personal where id = p_docente and colegio_id = mi_colegio();
  if not found or p.usuario_id is null then raise exception 'Ese docente no tiene cuenta en la app.'; end if;
  select count(*) into pendientes from asistencia a
    where a.marca = 'A' and a.registrado_por = p.id
      and dias_habiles(p.colegio_id, a.fecha, cr_hoy()) <= plazo_docente(p.colegio_id);
  perform encolar(p.colegio_id, p.usuario_id, p.telefono, 'recordatorio', 'Ausencias por justificar',
    'Dirección le recuerda decidir ' || pendientes || ' ausencias de sus lecciones.', '/docente/por-justificar', false);
  return pendientes;
end
$$;
grant execute on function recordar_docente(uuid) to authenticated;
