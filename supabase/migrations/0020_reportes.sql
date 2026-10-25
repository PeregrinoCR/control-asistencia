-- Reportes: asistencia por lección (mapa de lecciones y días, materias) y ausentismo por estudiante en un periodo.
-- Corre sobre una base con 0001–0019. Es seguro correrla dos veces.

-- Totales por día, sección y lección. Con la seguridad de quien consulta (como asistencia_dia).
create or replace view asistencia_leccion with (security_invoker = true) as
select fecha, seccion_id, leccion,
  count(*) filter (where marca = 'P') as presentes,
  count(*) filter (where marca = 'T') as tardias,
  count(*) filter (where marca = 'A') as ausencias,
  count(*) filter (where marca = 'J') as justificadas
from asistencia
group by fecha, seccion_id, leccion;
grant select on asistencia_leccion to authenticated;

-- Lecciones ausentes (sin justificar), justificadas y tardías de cada estudiante entre dos fechas.
-- Sin "security definer": cada persona ve solo lo que sus permisos le dejan ver en `asistencia`.
create or replace function ausentismo_periodo(desde date, hasta date)
returns table (estudiante_id uuid, ausencias int, justificadas int, tardias int)
language sql stable as $$
  select a.estudiante_id,
    (count(*) filter (where a.marca = 'A'))::int,
    (count(*) filter (where a.marca = 'J'))::int,
    (count(*) filter (where a.marca = 'T'))::int
  from asistencia a
  where a.fecha between desde and hasta
  group by a.estudiante_id
$$;
grant execute on function ausentismo_periodo(date, date) to authenticated;
