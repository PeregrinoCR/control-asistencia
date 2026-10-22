-- Roles y accesos: un rol limitado a su sección ya no abre permisos de todo el colegio, las salidas
-- y la matrícula tienen permiso propio, y el profesor guía deja de enviar avisos y crear giras.
-- Se puede correr más de una vez.

-- 1. Un rol limitado a la sección solo vale cuando la consulta dice a qué sección se refiere.
--    Antes, sin sección, valía para todo el colegio.
create or replace function tiene_permiso(perm text, seccion uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal p
    where p.usuario_id = auth.uid() and p.activo and (
      perm = any (p.permisos_extra)
      or exists (
        select 1 from roles r
        where r.id = any (p.roles) and perm = any (r.permisos)
          and (not r.limitado_a_seccion or (seccion is not null and seccion = p.seccion_guia))
      )
    )
  )
$$;

-- 2. Roles (igual que supabase/seed.sql y src/data/users.ts).
insert into roles (id, nombre, permisos, limitado_a_seccion) values
  ('dir', 'Dirección', array['rollCall','viewAttendance','approveJust','approveExit','teacherAbs','assign','trips','gate',
    'notices','sms','earlyWarning','saber','payments','cards','students','reports','users','settings'], false),
  ('doc', 'Docente', array['rollCall'], false),
  ('gui', 'Profesor guía', array['viewAttendance','approveJust','earlyWarning'], true),
  ('ori', 'Orientación', array['viewAttendance','approveJust','notices','earlyWarning','saber','reports'], false),
  ('adm', 'Administrativo', array['viewAttendance','approveJust','approveExit','teacherAbs','trips','notices',
    'payments','cards','students','reports'], false),
  ('gua', 'Guarda de portón', array['gate'], false)
on conflict (id) do update set nombre = excluded.nombre, permisos = excluded.permisos,
  limitado_a_seccion = excluded.limitado_a_seccion;

-- 3. Matrícula: estudiantes y encargados con su propio permiso ("students"), no con "users".
drop policy if exists editar on estudiantes;
create policy editar on estudiantes for all using (colegio_id = mi_colegio() and tiene_permiso('students'));

drop policy if exists ver on encargados;
create policy ver on encargados for select using (
  colegio_id = mi_colegio() and (usuario_id = auth.uid() or tiene_permiso('students') or exists (
    select 1 from estudiante_encargado ee join estudiantes e on e.id = ee.estudiante_id
    where ee.encargado_id = encargados.id and tiene_permiso('viewAttendance', e.seccion_id))));
drop policy if exists editar on encargados;
create policy editar on encargados for all using (colegio_id = mi_colegio() and tiene_permiso('students'));

drop policy if exists ver on estudiante_encargado;
create policy ver on estudiante_encargado for select using (
  estudiante_id in (select mis_estudiantes()) or exists (
    select 1 from estudiantes e where e.id = estudiante_id
      and (tiene_permiso('students') or tiene_permiso('viewAttendance', e.seccion_id))));
drop policy if exists editar on estudiante_encargado;
create policy editar on estudiante_encargado for all using (
  exists (select 1 from estudiantes e where e.id = estudiante_id and e.colegio_id = mi_colegio())
  and tiene_permiso('students'));

-- 4. Salidas anticipadas: solo dirección y administración deciden; el profesor guía ve las de su sección.
create or replace function control_salida() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not tiene_permiso('approveExit') then
    new.estado := 'pendiente';
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado and new.estado <> 'pendiente' and not tiene_permiso('approveExit') then
    raise exception 'Solo dirección aprueba o rechaza una salida.';
  end if;
  return new;
end
$$;

drop policy if exists decidir on salidas;
create policy decidir on salidas for update using (
  estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()) and tiene_permiso('approveExit'));
drop policy if exists ver_direccion on salidas;
create policy ver_direccion on salidas for select using (
  estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()) and tiene_permiso('approveExit'));

drop policy if exists ver on salidas;
create policy ver on salidas for select using (
  estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or tiene_permiso('trips') or exists (
    select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('viewAttendance', e.seccion_id)));

drop policy if exists ver on porton;
create policy ver on porton for select using (
  colegio_id = mi_colegio() and (estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or exists (
    select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('viewAttendance', e.seccion_id))));

-- 5. Alerta temprana: el seguimiento de cada estudiante lo ve quien tiene alerta temprana en su sección.
drop policy if exists ver on seguimientos;
create policy ver on seguimientos for select using (exists (
  select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('earlyWarning', e.seccion_id)));
drop policy if exists escribir on seguimientos;
create policy escribir on seguimientos for insert with check (exists (
  select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('earlyWarning', e.seccion_id)));
