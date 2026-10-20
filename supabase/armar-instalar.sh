#!/bin/sh
# Arma supabase/instalar.sql: limpieza + todas las migraciones en orden + datos iniciales.
cd "$(dirname "$0")"
{
  cat <<'HDR'
-- INSTALACIÓN COMPLETA: pegar TODO este archivo en el SQL Editor de Supabase y presionar Run.
-- Borra lo que haya quedado a medias y crea todo de nuevo. Antes de correrlo, cambiar
-- [NOMBRE DEL COLEGIO], [NOMBRE DEL DIRECTOR(A)] y [CORREO] (al final del archivo).
-- ¡Ojo! Si el colegio ya tiene datos, NO use este archivo: corra solo las migraciones nuevas.

drop trigger if exists vincular_cuenta on auth.users;
drop view if exists asistencia_mes, asistencia_dia, docentes;
drop table if exists seguimientos, aviso_lecturas, avisos, gira_autorizaciones, giras, porton, salidas,
  bitacora, justificaciones, asistencia, horario, materias, carnes,
  estudiante_encargado, encargados, estudiantes, personal, roles, secciones, colegios cascade;
drop function if exists vincular_cuenta, solo_digitos, doy_leccion_en, mis_estudiantes, tiene_permiso, mi_colegio,
  soy_personal, crear_carne, nuevo_codigo_carne, reponer_carne cascade;

HDR
  for f in migrations/*.sql; do cat "$f"; echo; done
  cat seed.sql
} > instalar.sql
