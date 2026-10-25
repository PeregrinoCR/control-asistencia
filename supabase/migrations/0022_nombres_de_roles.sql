-- Nombres de los roles por función del colegio. Solo cambia la etiqueta: los códigos (dir, doc, gui, ori, adm, gua, aux)
-- y los permisos de cada rol quedan igual. Es seguro correrla más de una vez.
update roles set nombre = 'Docente guía' where id = 'gui';
update roles set nombre = 'Secretaría' where id = 'adm';
update roles set nombre = 'Portón' where id = 'gua';
update roles set nombre = 'Apoyo' where id = 'aux';
