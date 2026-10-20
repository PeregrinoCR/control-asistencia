# Control de asistencia

Control de asistencia escolar: app móvil para docentes y familias, y panel web para dirección.
Built with React, TypeScript and Vite. All data is mock data in `src/data/`.

```sh
npm install
npm run dev        # http://localhost:5173 — index of every screen
npm run build      # type-checks, then builds to dist/
```

## Screens

| Route | Screen |
| --- | --- |
| `/docente/pase-de-lista` | Docente · Pase de lista |
| `/familia/notificacion` | Padre · Notificación instantánea |
| `/familia` | Padre · Inicio |
| `/familia/justificar` | Padre · Justificar ausencia |
| `/familia/historial` | Padre · Historial del mes |
| `/familia/gira` | Padre · Autorizar gira |
| `/familia/salida` | Padre · Salida temprana y descargo |
| `/familia/carne` | Padre · Carné estudiantil (QR) |
| `/porton` | Guarda · Control de portón |
| `/direccion` | Dirección · Panel del día |
| `/direccion/asignaciones` | Dirección · Profesores, secciones y horarios |
| `/direccion/docentes-ausentes` | Dirección · Ausencias de docentes |
| `/direccion/giras` | Dirección · Giras y salidas tempranas |
| `/direccion/estudiantes` | Dirección · Estudiantes |
| `/direccion/justificaciones` | Dirección · Justificaciones |
| `/direccion/avisos` | Dirección · Avisos a familias |
| `/direccion/reportes` | Dirección · Reportes |
| `/direccion/configuracion` | Dirección · Configuración |
| `/direccion/alerta-temprana` | Dirección · Alerta temprana |

## Structure

- `src/styles/tokens.css` — colors, type, radii from the design. Status tones: blue = presente,
  amber = tarde, orange = ausente, green = resuelto, neutral = sin marcar.
- `src/styles/global.css` — shared component classes (`.btn`, `.badge`, `.card`, `.chip`, `.table`…).
- `src/components/` — `Button`, `Badge`, `Segmented`, `Switch`/`SettingRow`, `Stat`, `Meter`, `Avatar`,
  form fields, `SignaturePad`, `LineChart`, `Icon`.
- `src/layouts/` — `MobileScreen` (390×844 device on desktop, full screen on phones) and
  `AdminLayout` (sidebar + main column).
- `src/screens/mobile`, `src/screens/admin` — one file per screen.
- `src/data/` — mock data, ready to be swapped for API calls.

## Modules

Each school turns parts of the app on or off in **Configuración › Módulos**. Choosing public (MEP) or
private loads recommended defaults:

- **Exportación para SABER**: downloads open early-warning cases as a CSV from Alerta temprana.
  The columns still need checking against the MEP's current template.
- **Pagos por SINPE Móvil**: families see the school's SINPE number on a trip, pay from their bank
  and upload the receipt; the school marks it paid in Giras. The app moves no money.
- **SMS de respaldo** and **SMS solo para avisos urgentes**: SMS has a per-message cost.

## Student card and gate

Each student has a QR card (`/familia/carne`, also printable). The QR holds an opaque card code,
never the cédula, so a lost card can be revoked without exposing personal data. The guard scans it
with the phone camera at `/porton` (via `jsqr`, works on iOS and Android browsers; the page must be
served over HTTPS for camera access), or types the code. The check in `src/data/gate.ts` lets
adults out, lets minors out only with an early exit authorized today, asks the guard to verify the
ID of whoever picks a student up, and rejects unknown or revoked cards.

Bracketed text such as `[NOMBRE DEL COLEGIO]` marks details the school fills in.
