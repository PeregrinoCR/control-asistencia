-- Ausencias y tardías del mes por estudiante, calculadas en el servidor.
-- security_invoker: respeta las reglas de permisos de quien consulta.
create or replace view asistencia_mes with (security_invoker = true) as
select estudiante_id,
  count(*) filter (where marca = 'A') as ausencias,
  count(*) filter (where marca = 'T') as tardias
from asistencia
where fecha >= date_trunc('month', current_date)
group by estudiante_id;

grant select on asistencia_mes to authenticated;
