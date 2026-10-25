-- Nombres de los roles por función del colegio y sus permisos:
--  · Docente guía suma «Pasar lista».
--  · Secretaría deja de aprobar salidas anticipadas.
--  · Solo Dirección y Auxiliares aprueban salidas anticipadas (Orientación no).
-- Los códigos (dir, doc, gui, ori, adm, gua, aux) no cambian. Es seguro correrla más de una vez.
-- Si el colegio ya cambió un rol en Usuarios y permisos (tabla roles_colegio), ese cambio vale sobre lo de fábrica.
update roles set nombre = 'Docente guía', permisos = array['rollCall','viewAttendance','approveJust','earlyWarning'] where id = 'gui';
update roles set nombre = 'Secretaría', permisos = array['viewAttendance','approveJust','teacherAbs','trips','notices','payments','cards','students','reports'] where id = 'adm';
update roles set nombre = 'Portón' where id = 'gua';
update roles set nombre = 'Auxiliares', permisos = array['approveExit'] where id = 'aux';
