# Notas para retomar el proyecto

Última actualización: cierre de la sesión de trabajo con el usuario (dirección del colegio piloto).

## Dónde está el código
- Repo `PeregrinoCR/control-asistencia`. Cloudflare Pages publica `main`.
- Rama de trabajo `claude/nice-edison-j0fjjp`, igual que `main` al cierre (fast-forward después de cada cambio).
- Para continuar: `git clone`, `git checkout claude/nice-edison-j0fjjp`, `npm install`, luego `npx tsc --noEmit` y `npm run build`.

## Reglas de trabajo acordadas
- Responder en español, claro y sin tecnicismos (el usuario no es programador).
- Cambios grandes: planear y pedir aprobación antes de programar.
- Publicar: `git push` a la rama, fast-forward a `main` y push.
- No hay acceso al Supabase del usuario desde aquí: verificar con tsc, build y el navegador en la versión sin servidor
  (`npx vite preview`, Playwright en `/opt/node-tools/node_modules/playwright`). Las pruebas con datos reales las hace el usuario.

## Base de datos (Supabase)
- Migraciones 0001–0008 instaladas y verificadas por el usuario (columnas y disparadores de salidas confirmados).
- `supabase/instalar.sql` se regenera con `sh supabase/armar-instalar.sh` (no correrlo en un colegio con datos).
- Edge Functions: `enviar-avisos` (notificaciones) y `crear-demos` (cuentas de demostración; se redespliega con el
  código de `main`, que incluye CORS).

## Cuentas de demostración
- Creadas desde Configuración › Desarrollo › «Crear cuentas de demostración». Contraseña `Demo-2026`:
  `profe@cole.local` (docente), `guia@cole.local` (profesor guía de 7-1), `guarda@cole.local` (portón),
  `padre@cole.local` (familia, encargado de Juan Pérez). Dirección usa su cuenta real.
- Desarrollo (datos de ejemplo, borrar datos, cuentas demo) se quita antes de la versión final.

## Hecho en esta sesión
- Menú de dirección por grupos (Día a día, Académico, Familias, Administración). Horarios y cargas en `/direccion/horarios`.
- Raíz `/` lleva a la pantalla según el rol; el catálogo de pantallas está en `/catalogo`.
- Calendario de pruebas agrupado (una prueba para varias secciones), aula por sección, filtro de adecuación.
- Secciones en orden 7-1, 7-2… 11-2 (`src/lib/secciones.ts`).
- Aulas: catálogo, aula fija por grupo, eventos de traslado; el horario del estudiante muestra el aula del día.
- Adecuación: lecciones distintas por estudiante, aula de adecuación por prueba, duración 1–6 lecciones.
- Cuido de exámenes: un cuidador por aula cuando es posible; relevos dentro de la misma tarjeta con etiqueta y línea
  de tiempo; aviso de choque de aula.
- Horarios especiales: salida anticipada con hora de término; alcance por secciones o nivel.
- Firma dibujada: el recuadro sigue editable entre trazos; «Confirmar firma» guarda el PNG.
- Salidas tempranas: la familia pide; dirección autoriza o no (con motivo); el portón solo ve las autorizadas; avisos a
  familia y docente. La familia ve el estado real en inicio e historial, con «Pedir la salida de nuevo» si fue rechazada.
  Texto e icono de alerta para no autorizada. Verificado por el usuario.
- Usuarios y permisos: eliminar una persona del personal (confirmación escrita).
- Estudiantes: imprimir el carné de una sola persona desde su ficha (con «Reponer carné» si no tiene); lista de
  hermanos y otros estudiantes del mismo encargado; «Vincular existente» para un encargado ya registrado.
- Familia: el saludo muestra «Encargado/a de:» y el nombre del estudiante.

## Pendientes abiertos
1. Notificaciones en teléfonos reales (Android y iPhone con la app instalada) y la línea SMS.
2. Formato oficial de exportación SABER: validar columnas con el MEP.
3. Horas de lección editables desde la app (hoy fijas en `SHIFT_BLOCKS`, `src/data/settings.ts`).
4. Cuido: probar con datos reales la noche de la captura (sin aula con dos cuidadores sin relevo visible).
5. Roles y accesos (migración 0009, hecho en código; falta correrla en Supabase y probar con cuentas de cada rol):
   salidas con permiso `approveExit` (dirección y administración), `students` para matrícula, y el profesor guía
   sin avisos ni giras. Pendiente: aviso en Usuarios cuando un permiso extra cambia el alcance; `teacherAbs` aún
   deja ver todo el personal.
6. Pase de lista: bloquear después de la hora de salida anticipada (decisión del usuario: por ahora no).
7. Horario de exámenes sigue dentro de Configuración; el plan era moverlo a Académico.
8. Email de confirmación de cuentas reales no llega: revisar en Supabase (Authentication › Logs / Users) y considerar
   un SMTP propio (Project Settings › Auth › SMTP). Las cuentas demo no lo necesitan.
9. Versión sin servidor (vista previa) no tiene todas las funciones nuevas; es solo vista previa.
10. Pendientes de CLAUDE.md: fases 3–5 (portón con comprobantes SINPE y bitácora, copias de seguridad, dominio, piloto).

## Archivos clave
- `src/screens/admin/SettingsLive.tsx`: Configuración, calendario de pruebas (`ExamsTab`), horarios especiales, `DevTab`.
- `src/screens/admin/StudentsLive.tsx`: estudiantes, ficha, carnés, hermanos, vincular encargado.
- `src/screens/admin/RoomsLive.tsx`, `src/lib/aulas.ts`: aulas y traslados.
- `src/lib/cuidos.ts` (motor `propose`), `src/screens/admin/ExamCareLive.tsx` (tarjetas y relevos).
- `src/screens/mobile/EarlyExitLive.tsx`, `GateLive.tsx`, `FamilyHomeLive.tsx`, `HistoryLive.tsx`, `src/screens/admin/ExitsLive.tsx`.
- `src/components/SignaturePad.tsx`, `src/layouts/MobileScreen.tsx` (DoneState).
- `src/screens/admin/UsersPermissions.tsx`, `src/lib/staff.ts`.
- `src/lib/devData.ts`, `supabase/functions/crear-demos/index.ts`, `supabase/ejemplos/estudiantes-ejemplo.csv`.
- `src/layouts/AdminLayout.tsx` (menú), `src/routes.ts`, `src/App.tsx`, `src/screens/Inicio.tsx`.
- `supabase/migrations/0005`–`0008`, `supabase/README.md`.
