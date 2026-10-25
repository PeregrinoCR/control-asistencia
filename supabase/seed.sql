-- Datos iniciales: roles (igual que src/data/users.ts) y el colegio piloto.

insert into roles (id, nombre, permisos, limitado_a_seccion) values
  ('dir', 'Dirección', array['rollCall','viewAttendance','approveJust','approveExit','teacherAbs','assign','trips','gate',
    'notices','sms','earlyWarning','saber','payments','cards','students','reports','users','settings'], false),
  ('doc', 'Docente', array['rollCall'], false),
  ('gui', 'Docente guía', array['viewAttendance','approveJust','earlyWarning'], true),
  ('ori', 'Orientación', array['viewAttendance','approveJust','notices','earlyWarning','saber','reports'], false),
  ('adm', 'Secretaría', array['viewAttendance','approveJust','approveExit','teacherAbs','trips','notices',
    'payments','cards','students','reports'], false),
  ('gua', 'Portón', array['gate'], false)
on conflict (id) do update set nombre = excluded.nombre, permisos = excluded.permisos,
  limitado_a_seccion = excluded.limitado_a_seccion;

-- Colegio piloto. Cambiar el nombre y el correo antes de correrlo.
with c as (
  insert into colegios (nombre, sector) values ('[NOMBRE DEL COLEGIO]', 'public') returning id
), s as (
  insert into secciones (colegio_id, nombre)
  select c.id, n from c, unnest(array['7-1','7-2','8-1','9-1','10-1','10-2','11-1','11-2']) n
)
insert into personal (colegio_id, nombre, correo, roles)
select c.id, '[NOMBRE DEL DIRECTOR(A)]', '[CORREO]', array['dir'] from c;
