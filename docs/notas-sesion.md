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

## Hecho en esta sesión (roles, salidas, giras, portón)
- Roles y accesos (0009): un rol limitado a su sección ya no abre datos de todo el colegio. Permisos propios:
  `approveExit` (salidas: dirección y administración), `students` (matrícula). El profesor guía no envía avisos
  ni crea giras. El menú y cada página del panel solo muestran lo que la persona puede usar.
- Cuenta sin vincular: al entrar, la app ya no vuelve a una ruta de otra área (por ejemplo, `/porton`).
- Salidas tempranas: la familia pide, dirección autoriza o no; el portón solo ve las autorizadas. La lista de
  «Giras y salidas» muestra solo las autorizadas de hoy.
- Giras completas (0010 a 0013):
  - Dirección edita la gira. Al crearla o editarla: teléfono para pagos y docente organizador.
  - Lista de estudiantes con filtro: todos, autorizados, pendientes, no autorizados.
  - La familia elige SINPE Móvil o efectivo. SINPE exige comprobante; sin él la autorización no se envía y
    dirección ve «Falta comprobante».
  - Marcar pagado: dirección o el docente organizador. La descripción del pago usa el nombre de la gira y
    «A nombre de» el organizador (función `nombre_organizador`).
  - Una gira pagada no se puede desautorizar desde la familia: aparece el aviso de contactar al colegio.
  - Agregar o quitar estudiantes fuera de las secciones (buscador por cédula o nombre).
  - Lista impresa de autorizados con el teléfono de contacto (encargado, o el propio si es mayor de edad).
- Portón: solo entra quien tiene permiso de portón (guarda y dirección). La familia va a su pantalla.

## Migraciones corridas en Supabase
0001 a 0013, confirmadas por el usuario. Para una instalación nueva usar `supabase/instalar.sql`.

## Pendientes abiertos
1. Notificaciones en teléfonos reales (Android y iPhone con la app instalada) y la línea SMS.
2. Formato oficial de exportación SABER: validar columnas con el MEP.
3. Horas de lección editables desde la app (hoy fijas en `SHIFT_BLOCKS`, `src/data/settings.ts`).
4. Cuido: probar con datos reales la noche de la captura (sin aula con dos cuidadores sin relevo visible).
5. Roles y accesos (migración 0009, corrida y verificada en Supabase):
   salidas con permiso `approveExit` (dirección y administración), `students` para matrícula, y el profesor guía
   sin avisos ni giras. Hecho (migración 0016, corrida en Supabase): los permisos extra de un profesor guía valen solo en su sección (asistencia, justificaciones, alerta temprana); giras y avisos no aplican a guías; solo Dirección y Administrativos ven la lista del personal. Antes: `teacherAbs` aún
   deja ver todo el personal.
11. El organizador de una gira puede buscar cualquier estudiante del colegio (para agregarlo). Revisar si debe
   limitarse a sus secciones.
12. La vista previa sin servidor no tiene las funciones de giras y salidas nuevas.
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
