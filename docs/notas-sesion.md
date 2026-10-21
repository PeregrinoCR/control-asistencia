# Notas para retomar el proyecto (estado de la última sesión)

## Dónde está el código
- Repo: `PeregrinoCR/control-asistencia`. Publicado en `main` (Cloudflare Pages publica `main`), último commit `8ba0ee9`.
- Rama de trabajo: `claude/nice-edison-j0fjjp`, igual que `main` (sin cambios pendientes en el árbol).
- Para continuar: `git clone` del repo, `git checkout claude/nice-edison-j0fjjp`, `npm install`, luego `npx tsc --noEmit` y `npm run build`.
- Este documento es el resumen de la sesión (el plan detallado vivía fuera del repo).

## Reglas de trabajo acordadas con el usuario
- Responder en español, claro y sin tecnicismos (no es programador).
- Antes de implementar cambios grandes: planear y pedir aprobación. Modo planeación respetado.
- Cambios al sitio: `git push` a la rama, luego fast-forward a `main` y push (así lo pidió el usuario).
- No se puede probar con datos reales desde aquí (no hay acceso al Supabase del usuario). Verificar con tsc + build +
  navegador en la versión sin servidor (`npx vite preview`, Playwright en `/opt/node-tools/node_modules/playwright`).

## Migraciones de Supabase (SQL Editor)
- 0001–0004 instaladas. 0005 (cuido) y 0006 (desarrollo) corridas por el usuario.
- **Pendiente de correr por el usuario: 0007_firmas.sql** (columna `salidas.firma`) y **0008_salidas_aprobacion.sql**
  (estado pendiente/aprobada/rechazada, RLS, triggers y avisos). Sin 0008 las solicitudes de salida no se guardan como pendientes.
- `supabase/instalar.sql` se regenera con `sh supabase/armar-instalar.sh` (no correr en un colegio con datos).

## Hecho en esta sesión (resumen)
- Menú de dirección por grupos: Día a día, Académico, Familias, Administración. Ruta de horarios `/direccion/horarios`
  («Horarios y cargas»). Rutas nuevas: `/direccion/aulas` (Aulas y grupos, Académico), `/direccion/salidas`
  (Salidas tempranas, grupo Familias).
- Calendario de pruebas agrupado (una prueba para varias secciones, grupo id), aula por sección, filtro de adecuación,
  orden de secciones 7-1, 7-2… (`src/lib/secciones.ts`).
- Aulas: catálogo, aula fija por grupo, eventos de traslado; el horario del estudiante muestra el aula del día.
- Adecuación: lecciones de examen distintas para estudiantes con adecuación (fin de la prueba por estudiante); un aula de
  adecuación por prueba (botón «Adecuación»); duración 1–6 lecciones con aviso si pasa de 9:50 p. m.
- Cuido de exámenes: un cuidador por aula cuando se puede; relevos dentro de la misma tarjeta con etiqueta
  «Relevo a las HH:MM» y línea de tiempo; aviso de choque de aula.
- Horarios especiales: salida anticipada con hora de término; alcance por secciones o nivel.
- Desarrollo (Configuración): borrar datos del colegio (función `borrar_datos_colegio`, migración 0006) y cargar datos de
  ejemplo (secciones, docentes, materias, horarios; los estudiantes se importan con `estudiantes-ejemplo.csv`).
  Quitar antes de la versión final.
- Firma dibujada (canvas) en giras y salidas; imagen PNG guardada en `gira_autorizaciones.firma` y `salidas.firma`.
- Salida temprana pedida por la familia: queda pendiente; dirección autoriza o no (con motivo); el guarda solo ve las
  autorizadas; avisos a familia y a docente. Permiso de decisión actual: `approveJust` (incluye profesor guía:
  **pendiente de decidir** si debe ser solo dirección/administración).
- Usuarios y permisos: se puede eliminar una persona del personal (confirmación escrita), la cuenta de acceso queda.

## Pendientes abiertos (para la próxima sesión)
1. Correr 0007 y 0008 en Supabase y probar: firma, solicitud de salida → aprobación → portón → avisos.
2. Decidir permiso de aprobación de salidas (solo dirección/administración o también profesor guía).
3. Pase de lista: bloquear después de hora de salida anticipada (fuera de alcance, decisión del usuario: no por ahora).
4. Cuido: probar con datos reales la misma noche de la captura (verificar que no hay aula con dos cuidadores sin relevo visible).
5. Choque de aula de adecuación: aviso en el calendario (hecho) y en el rol (hecho); validar con datos.
6. Email de confirmación de cuentas no llega (Supabase): revisar en Authentication › Logs / Users; considerar SMTP propio.
   No se resolvió; el usuario debe revisar el panel de Supabase.
7. Pendientes del proyecto (de CLAUDE.md): notificaciones en teléfonos reales y SMS; formato SABER con el MEP;
   horas de lección editables desde la app (hoy fijas en `SHIFT_BLOCKS`); pendientes de fases 3–5.
8. Horario de exámenes sigue dentro de Configuración; el plan era moverlo a Académico (no hecho).
9. Versión de ejemplo (sin servidor) no tiene todas las funciones nuevas (p. ej. Horarios especiales con alcance); es solo vista previa.

## Archivos clave
- `src/screens/admin/SettingsLive.tsx` (Configuración, calendario de pruebas `ExamsTab`, horarios especiales `SpecialTab`, `DevTab`)
- `src/screens/admin/RoomsLive.tsx`, `src/lib/aulas.ts` (aulas, traslados)
- `src/lib/cuidos.ts` (motor del cuido: `propose`), `src/screens/admin/ExamCareLive.tsx` (tarjetas y relevos)
- `src/lib/secciones.ts` (orden de secciones), `src/lib/devData.ts` (borrar y cargar ejemplos)
- `src/components/SignaturePad.tsx` (firma dibujada)
- `src/screens/mobile/EarlyExitLive.tsx`, `GateLive.tsx`, `src/screens/admin/ExitsLive.tsx` (salidas)
- `src/screens/admin/UsersPermissions.tsx`, `src/lib/staff.ts` (personal)
- `src/layouts/AdminLayout.tsx` (menú), `src/routes.ts`, `src/App.tsx`
- `supabase/migrations/0005`–`0008`, `supabase/README.md`
