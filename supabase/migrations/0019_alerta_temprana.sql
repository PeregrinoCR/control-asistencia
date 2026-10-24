-- Alerta temprana: responsable y pasos por caso, criterios nuevos (caída de asistencia, avisos sin leer)
-- y aviso a una sola familia desde el caso. Corre sobre una base con 0001–0018. Es seguro correrla dos veces.

-- ---------- Responsable y pasos de cada caso ----------
create table if not exists casos_alerta (
  estudiante_id uuid primary key references estudiantes on delete cascade,
  responsable uuid references personal on delete set null,
  pasos jsonb not null default '[]',          -- [{"label": "Llamada al encargado", "done": true}]
  actualizado timestamptz not null default now()
);
alter table casos_alerta enable row level security;

drop policy if exists ver on casos_alerta;
drop policy if exists escribir on casos_alerta;
drop policy if exists cambiar on casos_alerta;
create policy ver on casos_alerta for select using (
  tiene_permiso('earlyWarning') and estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()));
create policy escribir on casos_alerta for insert with check (
  tiene_permiso('earlyWarning') and estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()));
create policy cambiar on casos_alerta for update using (
  tiene_permiso('earlyWarning') and estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()));

create or replace function tocar_caso_alerta() returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end
$$;
drop trigger if exists tocar_caso_alerta on casos_alerta;
create trigger tocar_caso_alerta before insert or update on casos_alerta for each row execute function tocar_caso_alerta();

-- ---------- Criterios que necesitan más datos que el pase de lista ----------
-- Por estudiante activo: asistencia de las últimas `semanas` y de las `semanas` anteriores (%),
-- y cuántos de los últimos 3 avisos enviados a su familia no ha abierto nadie.
create or replace function alerta_extra(semanas int default 4)
returns table (estudiante_id uuid, tasa_actual numeric, tasa_previa numeric, sin_leer int)
language plpgsql stable security definer set search_path = public as $$
declare
  hoy date := cr_hoy();
  corte date := cr_hoy() - (semanas * 7);
  corte_previo date := cr_hoy() - (semanas * 14);
begin
  if not tiene_permiso('earlyWarning') then raise exception 'Sin permiso para ver la alerta temprana.'; end if;
  return query
    select e.id,
      (select round(100.0 * count(*) filter (where x.marca in ('P', 'T')) / nullif(count(*) filter (where x.marca in ('P', 'T', 'A')), 0), 1)
         from asistencia x where x.estudiante_id = e.id and x.fecha > corte),
      (select round(100.0 * count(*) filter (where x.marca in ('P', 'T')) / nullif(count(*) filter (where x.marca in ('P', 'T', 'A')), 0), 1)
         from asistencia x where x.estudiante_id = e.id and x.fecha > corte_previo and x.fecha <= corte),
      (select count(*)::int from (
          select a.id from avisos a
          where a.colegio_id = e.colegio_id and a.estado = 'enviado' and a.destino <> 'doc'
            and (a.destino = 'all'
              or (a.destino = 'sec' and e.seccion_id = any (a.secciones))
              or (a.destino = 'enc' and not coalesce(e.nacimiento <= hoy - interval '18 years', false))
              or (a.destino = 'adu' and e.nacimiento <= hoy - interval '18 years'))
          order by a.enviado desc limit 3) r
        where not exists (
          select 1 from aviso_lecturas l join destinatarios(e.id) d on d.usuario_id = l.usuario_id where l.aviso_id = r.id))
    from estudiantes e
    where e.colegio_id = mi_colegio() and e.activo;
end
$$;

-- ---------- Aviso a una sola familia desde el caso ----------
-- Llega como notificación (y SMS de respaldo si está activo) a los encargados del estudiante,
-- o a él mismo si es mayor de edad, y queda anotado en la bitácora del caso.
create or replace function avisar_familia(estudiante uuid, titulo_ text, cuerpo_ text) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  yo uuid;
begin
  if not tiene_permiso('earlyWarning') then raise exception 'Sin permiso para avisar desde la alerta temprana.'; end if;
  if not exists (select 1 from estudiantes where id = estudiante and colegio_id = mi_colegio()) then
    raise exception 'Estudiante no encontrado.';
  end if;
  if coalesce(trim(titulo_), '') = '' or coalesce(trim(cuerpo_), '') = '' then raise exception 'Escriba el título y el mensaje.'; end if;
  select count(*) into n from destinatarios(estudiante);
  if n = 0 then raise exception 'Este estudiante no tiene a quién avisar: falta el teléfono o la cuenta del encargado.'; end if;
  perform avisar_estudiante(estudiante, 'aviso', trim(titulo_), trim(cuerpo_), '/familia', false);
  select id into yo from personal where usuario_id = auth.uid();
  insert into seguimientos (estudiante_id, tipo, texto, por)
    values (estudiante, 'contacto', 'Aviso a la familia: «' || trim(titulo_) || '»', yo);
  return n;
end
$$;
