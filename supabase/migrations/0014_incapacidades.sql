-- Incapacidades de docentes.
-- Un docente ausente normalmente NO se reemplaza: sus lecciones quedan libres (o con trabajo asignado).
-- Solo en una incapacidad prolongada el MEP nombra a un sustituto; aquí se lleva el estado de ese trámite.

create table if not exists incapacidades (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  docente_id uuid not null references personal on delete cascade,
  desde date not null,
  hasta date not null,
  -- ninguno: no se pedirá sustituto · esperando: pedido al MEP, sin nombrar · nombrado: ya hay sustituto
  sustitucion text not null default 'ninguno' check (sustitucion in ('ninguno', 'esperando', 'nombrado')),
  sustituto_id uuid references personal,
  sustituto_desde date,
  registrado_por uuid references personal,
  creado timestamptz not null default now(),
  check (hasta >= desde)
);

alter table ausencias_docentes add column if not exists incapacidad_id uuid references incapacidades on delete cascade;

alter table incapacidades enable row level security;
drop policy if exists ver on incapacidades;
drop policy if exists editar on incapacidades;
create policy ver on incapacidades for select using (colegio_id = mi_colegio());
create policy editar on incapacidades for all using (colegio_id = mi_colegio() and tiene_permiso('teacherAbs'));

-- Crea las coberturas del día para los docentes con incapacidad: lección libre, o del sustituto
-- nombrado desde su fecha de inicio. Es repetible: no duplica. La corre un horario diario y también la app.
-- (Los parámetros llevan prefijo p_ para no chocar con nombres de columnas.)
create or replace function generar_coberturas(p_dia date default cr_hoy()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
  dia_id text := (array['L', 'K', 'M', 'J', 'V', 'S', 'D'])[extract(isodow from p_dia)::int];
  con_sustituto boolean;
begin
  for r in
    select a.id as ausencia_id, i.sustitucion, i.sustituto_id, i.sustituto_desde, h.seccion_id, h.leccion
    from ausencias_docentes a
      join incapacidades i on i.id = a.incapacidad_id
      join horario h on h.docente_id = a.docente_id and h.dia = dia_id
    where a.fecha = p_dia
      and not exists (
        select 1 from coberturas c where c.ausencia_id = a.id and c.seccion_id = h.seccion_id and c.leccion = h.leccion)
  loop
    con_sustituto := r.sustitucion = 'nombrado' and r.sustituto_id is not null and (r.sustituto_desde is null or r.sustituto_desde <= p_dia);
    insert into coberturas (ausencia_id, seccion_id, leccion, tipo, sustituto_id)
      values (r.ausencia_id, r.seccion_id, r.leccion, case when con_sustituto then 'sub' else 'free' end,
              case when con_sustituto then r.sustituto_id end);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Registra la incapacidad con un día de ausencia por cada fecha lectiva indicada.
create or replace function registrar_incapacidad(
  p_docente uuid, p_desde date, p_hasta date, p_fechas date[], p_estado text default 'ninguno',
  p_sustituto uuid default null, p_sustituto_desde date default null, p_registrada_por uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  col uuid := mi_colegio();
  inc uuid;
  f date;
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  if not exists (select 1 from personal where id = p_docente and colegio_id = col) then raise exception 'Docente no encontrado.'; end if;
  insert into incapacidades (colegio_id, docente_id, desde, hasta, sustitucion, sustituto_id, sustituto_desde, registrado_por)
    values (col, p_docente, p_desde, p_hasta, p_estado, case when p_estado = 'nombrado' then p_sustituto end,
            case when p_estado = 'nombrado' then coalesce(p_sustituto_desde, p_desde) end, p_registrada_por)
    returning id into inc;
  foreach f in array p_fechas loop
    insert into ausencias_docentes (colegio_id, docente_id, fecha, motivo, salida_temprana, registrado_por, incapacidad_id)
      values (col, p_docente, f, 'Incapacidad', true, p_registrada_por, inc)
      on conflict (docente_id, fecha) do nothing;
  end loop;
  perform generar_coberturas(cr_hoy());
  return inc;
end
$$;

-- Cambia el estado del trámite mientras no hay sustituto (ninguno <-> esperando).
create or replace function marcar_sustitucion(p_inc uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  if p_estado not in ('ninguno', 'esperando') then raise exception 'Estado no válido.'; end if;
  update incapacidades set sustitucion = p_estado, sustituto_id = null, sustituto_desde = null
    where id = p_inc and colegio_id = mi_colegio();
end
$$;

-- Registra al sustituto nombrado por el MEP: desde esa fecha recibe las lecciones del titular.
create or replace function nombrar_sustituto(p_inc uuid, p_sustituto uuid, p_desde date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  if not exists (select 1 from personal where id = p_sustituto and colegio_id = mi_colegio()) then
    raise exception 'Sustituto no encontrado: agréguelo primero en Usuarios y permisos.';
  end if;
  update incapacidades set sustitucion = 'nombrado', sustituto_id = p_sustituto, sustituto_desde = p_desde
    where id = p_inc and colegio_id = mi_colegio();
  -- Las lecciones que ya estaban libres desde esa fecha pasan al sustituto.
  update coberturas c set tipo = 'sub', sustituto_id = p_sustituto
    from ausencias_docentes a
    where c.ausencia_id = a.id and a.incapacidad_id = p_inc and c.tipo = 'free' and a.fecha >= greatest(p_desde, cr_hoy());
  perform generar_coberturas(cr_hoy());
end
$$;

-- Extiende o acorta la incapacidad. p_fechas son los días lectivos nuevos a agregar; se quitan los posteriores al nuevo fin.
create or replace function ajustar_incapacidad(p_inc uuid, p_hasta date, p_fechas date[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare
  i incapacidades;
  f date;
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  select * into i from incapacidades where id = p_inc and colegio_id = mi_colegio();
  if not found then raise exception 'Incapacidad no encontrada.'; end if;
  update incapacidades set hasta = greatest(p_hasta, i.desde) where id = p_inc;
  delete from ausencias_docentes where incapacidad_id = p_inc and fecha > p_hasta;
  foreach f in array p_fechas loop
    if f > i.hasta and f <= p_hasta then
      insert into ausencias_docentes (colegio_id, docente_id, fecha, motivo, salida_temprana, registrado_por, incapacidad_id)
        values (i.colegio_id, i.docente_id, f, 'Incapacidad', true, i.registrado_por, p_inc)
        on conflict (docente_id, fecha) do nothing;
    end if;
  end loop;
  perform generar_coberturas(cr_hoy());
end
$$;

-- Cada día a las 12:00 (hora de Costa Rica) se preparan las lecciones libres o del sustituto de ese día,
-- para que las familias reciban el aviso antes de la jornada nocturna.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'generar-coberturas';
    perform cron.schedule('generar-coberturas', '0 18 * * 1-5', $c$ select generar_coberturas() $c$);
  end if;
end
$$;
