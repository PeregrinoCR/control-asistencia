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
drop view if exists asistencia_leccion, asistencia_mes, asistencia_dia, docentes;
drop table if exists casos_alerta, cuidos, coberturas, ausencias_docentes, incapacidades, ausencia_avisos, notificaciones, suscripciones, ajustes_privados,
  seguimientos, aviso_lecturas, avisos, gira_autorizaciones, giras, porton, salidas,
  bitacora, justificaciones, asistencia, horario, materias, carnes,
  estudiante_encargado, encargados, estudiantes, personal, roles, secciones, colegios cascade;
drop function if exists vincular_cuenta, solo_digitos, doy_leccion_en, mis_estudiantes, tiene_permiso, es_direccion_o_admin, mi_colegio,
  soy_personal, crear_carne, nuevo_codigo_carne, reponer_carne, cr_hoy, vapid_publica, guardar_sms, sms_configurado,
  encolar, destinatarios, avisar_estudiante, regla, avisar_asistencia, avisar_aviso, avisar_salida,
  avisar_justificacion, sms_prueba, avisar_leccion_libre, avisar_cuido,
  generar_coberturas, registrar_incapacidad, marcar_sustitucion, nombrar_sustituto, ajustar_incapacidad,
  plazo_familia, plazo_docente, dias_habiles, proteger_justificacion, doy_esa_leccion, justificar_ausencia,
  quitar_justificacion, excepcion_justificacion, recordatorios_justificacion,
  estudiantes_de_gira, cancelar_gira, recordar_gira,
  fijar_aviso, destinatarios_aviso, retirar_cola_aviso, publicar_avisos_programados, lectura_avisos, pendientes_aviso, reenviar_aviso,
  tocar_caso_alerta, alerta_extra, avisar_familia, ausentismo_periodo cascade;

HDR
  for f in migrations/*.sql; do cat "$f"; echo; done
  cat seed.sql
} > instalar.sql
