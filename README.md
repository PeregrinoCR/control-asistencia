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
| `/direccion` | Dirección · Panel del día |
| `/direccion/asignaciones` | Dirección · Profesores, secciones y horarios |
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

Bracketed text such as `[NOMBRE DEL COLEGIO]` marks details the school fills in.
