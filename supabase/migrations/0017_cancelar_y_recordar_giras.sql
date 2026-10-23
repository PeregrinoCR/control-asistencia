-- Giras: cancelar con motivo (avisa a las familias que ya firmaron) y recordar a las que faltan por firmar.
-- Se puede correr más de una vez.

alter table giras add column if not exists cancelada boolean not null default false;
alter table giras add column if not exists motivo_cancelacion text;
alter table giras add column if not exists cancelada_en timestamptz;
alter table giras add column if not exists recordatorio_en timestamptz;

-- Estudiantes activos de una gira: los de sus secciones y los agregados a mano.
create or replace function estudiantes_de_gira(gira uuid) returns table (estudiante_id uuid)
language sql stable security definer set search_path = public as $$
  select e.id from estudiantes e join giras g on g.id = gira
  where e.activo and e.seccion_id = any (g.secciones)
  union
  select ge.estudiante_id from gira_estudiantes ge join estudiantes e on e.id = ge.estudiante_id
  where ge.gira_id = gira and e.activo
$$;

-- Cancela una gira y avisa a las familias que ya habían autorizado. Devuelve a cuántas se avisó.
create or replace function cancelar_gira(gira uuid, motivo_ text) returns int
language plpgsql security definer set search_path = public as $$
declare
  g giras;
  e record;
  n int := 0;
begin
  select * into g from giras where id = gira and colegio_id = mi_colegio();
  if not found then raise exception 'No se encontró la gira.'; end if;
  if not (tiene_permiso('trips') or es_organizador(gira)) then raise exception 'Sin permiso para cancelar giras.'; end if;
  if g.cancelada then raise exception 'La gira ya está cancelada.'; end if;
  if coalesce(trim(motivo_), '') = '' then raise exception 'Escriba el motivo de la cancelación.'; end if;

  update giras set cancelada = true, motivo_cancelacion = trim(motivo_), cancelada_en = now() where id = gira;

  for e in
    select a.estudiante_id from gira_autorizaciones a where a.gira_id = gira and a.estado = 'ok'
  loop
    perform avisar_estudiante(e.estudiante_id, 'gira', 'Gira cancelada: ' || g.titulo,
      'La gira del ' || to_char(g.fecha, 'DD/MM') || ' se canceló. Motivo: ' || trim(motivo_) ||
        case when coalesce(g.costo, '') <> '' then ' Si ya realizó un pago, el colegio se comunicará con usted.' else '' end,
      '/familia', true);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Recuerda la autorización a las familias que todavía no respondieron. No más de una vez cada 6 horas.
create or replace function recordar_gira(gira uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  g giras;
  e record;
  n int := 0;
begin
  select * into g from giras where id = gira and colegio_id = mi_colegio();
  if not found then raise exception 'No se encontró la gira.'; end if;
  if not (tiene_permiso('trips') or es_organizador(gira)) then raise exception 'Sin permiso para enviar recordatorios.'; end if;
  if g.cancelada then raise exception 'La gira está cancelada.'; end if;
  if g.fecha < cr_hoy() then raise exception 'La gira ya pasó.'; end if;
  if g.recordatorio_en is not null and g.recordatorio_en > now() - interval '6 hours' then
    raise exception 'Ya se envió un recordatorio hace poco. Espere unas horas para enviar otro.';
  end if;

  for e in
    select s.estudiante_id from estudiantes_de_gira(gira) s
    where not exists (select 1 from gira_autorizaciones a where a.gira_id = gira and a.estudiante_id = s.estudiante_id)
  loop
    perform avisar_estudiante(e.estudiante_id, 'gira', 'Falta su autorización: ' || g.titulo,
      'Firme la autorización para la gira del ' || to_char(g.fecha, 'DD/MM') ||
        case when g.fecha_limite is not null then ' antes del ' || to_char(g.fecha_limite, 'DD/MM') else '' end || '.',
      '/familia/gira', false);
    n := n + 1;
  end loop;
  update giras set recordatorio_en = now() where id = gira;
  return n;
end
$$;
