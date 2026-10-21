-- Herramientas de desarrollo: borrar los datos del colegio para empezar limpio.
-- Solo quien tiene el permiso de configuración puede usarla. Conserva la cuenta del director,
-- los roles y los datos del colegio (nombre, módulos, institución). Se puede correr más de una vez.
-- Antes de la versión final se quita (ver Configuración › Desarrollo).

create or replace function borrar_datos_colegio() returns void language plpgsql security definer set search_path = public as $$
declare col uuid := mi_colegio();
begin
  if col is null or not tiene_permiso('settings') then
    raise exception 'Solo quien administra la configuración puede borrar los datos.';
  end if;
  -- Las tablas dependientes (horario, asistencia, carnes, justificaciones, salidas, lecturas…) se borran en cascada.
  delete from notificaciones where colegio_id = col;
  delete from cuidos where colegio_id = col;
  delete from ausencias_docentes where colegio_id = col;
  delete from avisos where colegio_id = col;
  delete from giras where colegio_id = col;
  delete from porton where colegio_id = col;
  delete from bitacora where colegio_id = col;
  delete from estudiantes where colegio_id = col;
  delete from encargados where colegio_id = col;
  delete from materias where colegio_id = col;
  delete from secciones where colegio_id = col;
  -- Se conserva la cuenta que hace el borrado; las demás personas del personal se eliminan.
  delete from personal where colegio_id = col and usuario_id is distinct from auth.uid();
  -- Configuración de cargas, calendario y aulas: vuelve a empezar; los datos del colegio se conservan.
  update colegios set config = config - 'cargas' - 'pruebas' - 'eventos' - 'aulas' - 'aulasAdecuacion' where id = col;
end
$$;
