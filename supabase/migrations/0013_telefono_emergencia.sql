-- Teléfono de contacto de cada estudiante en la lista de la gira: el organizador lee a los encargados
-- y sus vínculos, igual que puede buscar estudiantes del colegio. Se puede correr más de una vez.

drop policy if exists organizador_ve_encargados on encargados;
create policy organizador_ve_encargados on encargados for select using (exists (
  select 1 from giras g join personal p on p.id = g.organizador_id
  where p.usuario_id = auth.uid() and g.colegio_id = encargados.colegio_id));

drop policy if exists organizador_ve_vinculos on estudiante_encargado;
create policy organizador_ve_vinculos on estudiante_encargado for select using (exists (
  select 1 from giras g join personal p on p.id = g.organizador_id join estudiantes e on e.id = estudiante_encargado.estudiante_id
  where p.usuario_id = auth.uid() and g.colegio_id = e.colegio_id));
