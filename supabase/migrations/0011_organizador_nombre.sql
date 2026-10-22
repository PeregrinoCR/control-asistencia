-- Nombre del docente organizador para la familia que paga una gira (la tabla de personal no es legible para familias).
-- Solo devuelve el nombre, y solo a quien pertenece al colegio de la gira. Se puede correr más de una vez.

create or replace function nombre_organizador(gira uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.nombre from giras g join personal p on p.id = g.organizador_id
  where g.id = gira and g.colegio_id = mi_colegio()
$$;
