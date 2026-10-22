# Control de asistencia — notas para Claude

App de asistencia escolar para Costa Rica: app móvil (docentes, familias, guarda de portón) y panel
web para dirección. React 19 + TypeScript + Vite, react-router. Ver README para rutas y estructura.

## Cómo trabajar

- Responder al usuario **en español**, claro y sin tecnicismos innecesarios. No es programador.
- Al terminar cada parte: `npx tsc --noEmit`, `npm run build`, commit y `git push origin main`.
- Comprobar en el navegador (Playwright) lo que se cambie antes de darlo por hecho.
- Pedir cambios agrupados y sesiones cortas: el usuario quiere ahorrar tokens.

## Producto

- Para colegios **públicos (MEP)** y **privados**. La app es **gratuita**; pagos opcionales por
  **SINPE Móvil** (registro manual con comprobante, la app no mueve dinero).
- Módulos por colegio en Configuración › Módulos: SABER (MEP), pagos SINPE, SMS de respaldo.
- Referencia de competencia más cercana: SICAI (sicai.cr).
- Mayores de edad reciben sus propios avisos; los menores necesitan autorización del encargado.
- Privacidad (Ley 8968): el QR del carné guarda un código opaco, nunca la cédula.

## Jornada nocturna (horario real del colegio)

6 lecciones de 35 min, 6:00–9:50 p. m.:
1.ª 6:00–6:35 · 2.ª 6:35–7:10 · Recreo 7:10–7:25 · 3.ª 7:25–8:00 · 4.ª 8:00–8:35 ·
Merienda 8:35–8:40 · 5.ª 8:40–9:15 · 6.ª 9:15–9:50.
Fuente única: `SHIFT_BLOCKS.noc` en `src/data/settings.ts`. Horas de salida temprana en `EXIT_HOURS`.

## Código

- Estilos: tokens en `src/styles/tokens.css`, clases compartidas en `global.css`,
  `layouts.css`, `screens.css`. Usar los componentes de `src/components/` (Button, Badge,
  Segmented, SettingRow, Stat, etc.) antes de crear nuevos.
- Datos de ejemplo en `src/data/` (sin servidor todavía). Texto entre corchetes, como
  `[NOMBRE DEL COLEGIO]`, es un dato que el colegio completa.
- Permisos y roles: `src/data/users.ts` (16 permisos, 6 roles, permisos extra por persona).
- Vista previa en línea: se construye con `VITE_ROUTER=memory` (MemoryRouter).

## Publicación

- El usuario autorizó subir **directo a `main`** (`git push origin HEAD:main`); Cloudflare Pages publica `main`
  y ya no hace vistas previas de ramas. Sin pull requests salvo que el usuario los pida.
- Reglas: (1) nunca subir con una migración pendiente: avisar, esperar a que el usuario la corra en Supabase y
  recién entonces subir; (2) subir solo pantallas terminadas y probadas (`tsc`, `build`, Playwright);
  (3) un push por pantalla, para no gastar publicaciones (500/mes); (4) avisar antes de subir si el cambio
  toca avisos a familias, portón o pagos.
- Si una sesión asigna una rama y prohíbe subir a `main`, respetarlo hasta que el usuario lo vuelva a autorizar.

## Pendiente

- **Servidor** (Supabase, ver `supabase/README.md`): Fase 1 hecha (tablas, permisos, vincular cuentas).
  Fase 2: inicio de sesión (`/entrar`, `src/lib/auth.tsx`) y con datos reales: Usuarios (`src/lib/staff.ts`), Estudiantes y encargados con importación CSV (`src/lib/students.ts`),
  horario por sección (`src/lib/schedule.ts`, tabla `horario`), pase de lista (`RollCallLive.tsx`), Hoy y
  Justificaciones. Al entrar, cada rol va a su pantalla (`homeFor` en `src/lib/auth.tsx`).
  Cada pantalla real vive en `*Live.tsx`; sin servidor se muestra la de ejemplo.
  Migración 0003: app de familias (`src/lib/family.ts`, `FamilyGate.tsx`), portón, giras, avisos,
  alerta temprana, reportes y configuración (`colegios.config`) con datos reales. Archivos en Storage
  (`comprobantes/<colegio>/…`). `supabase/armar-instalar.sh` regenera `instalar.sql`.
  Migración 0004: cola `notificaciones` llenada por disparadores; Edge Function `supabase/functions/enviar-avisos`
  (cada minuto por pg_cron) envía push (claves VAPID en `ajustes_privados`) y SMS por "SMS Gateway for Android".
  App instalable (PWA: `public/manifest.webmanifest`, `public/sw.js`, `src/lib/push.ts`). Docentes ausentes con
  sustitutos (`coberturas`); logo en bucket `publico`; impresión/PDF con `src/lib/print.ts`. Piloto: un colegio.
- Formato oficial de exportación SABER (validar columnas con el MEP).
- Probar notificaciones en teléfonos reales (Android y iPhone instalada) y la línea SMS.
- Cambiar horas de lecciones desde la app (hoy fijas en `SHIFT_BLOCKS`); firma dibujada en salidas y giras.
- Cuido de exámenes hecho (migración 0005, `src/lib/cuidos.ts`, `ExamCareLive.tsx` en `/direccion/cuidos`;
  horario de trabajo en la ficha del personal, casilla "adecuación" en estudiantes, aulas en Configuración).
  Diseño en `docs/cuido-de-examenes.md`. Falta: que el usuario corra 0005 en Supabase y lo pruebe con datos reales.
- Otros hechos recientes: Profesores y secciones es un tablero con tarjetas por carga (`colegios.config.cargas`)
  y panel "Carga por docente"; editar estudiantes/encargados en su ficha; en teléfono el panel usa barra
  superior + menú desplegable + accesos rápidos abajo. Diseños de referencia: https://claude.ai/artifact/Fbi3gH92QsBmK7natTNPR2
- Datos del entorno: app en https://control-asistencia-12b.pages.dev (Cloudflare Pages publica `main`; 500
  publicaciones/mes). Netlify (elcole.netlify.app) quedó en desuso por límite de créditos: publicar en lote, una vez por sesión; Supabase proyecto
  `cvfmprnelubknjaguyua`; migraciones 0001–0004 instaladas (0005 pendiente); Edge Function `enviar-avisos` publicada.

## UI/UX

- Skill `ui-ux-pro-max` en `.claude/skills/ui-ux-pro-max/`. Buscar con
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<términos en inglés>" --domain ux|style|color|typography`.
  Son recomendaciones: respetar los tokens de `src/styles/tokens.css` y los componentes de `src/components/`.
- Skill `grilling` en `.claude/skills/grilling/`: Claude entrevista al usuario por rondas de preguntas (con respuesta recomendada) para estresar un plan antes de actuar. Se activa con "grill me" o similar.
- Skill `frontend-design` en `.claude/skills/frontend-design/` (Anthropic): guía para diseño visual con identidad propia (paleta, tipografía, composición). Usarlo al proponer pantallas nuevas, respetando siempre los tokens de la app.

