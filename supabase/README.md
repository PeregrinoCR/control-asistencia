# Servidor (Supabase)

## Crear la cuenta (una sola vez)

1. Entrar a https://supabase.com y crear una cuenta con su correo.
2. **New project**: nombre `control-asistencia`, región **East US** (la más cercana a Costa Rica),
   y una contraseña fuerte para la base de datos (guardarla).
3. Abrir **SQL Editor** › **New query**, pegar TODO el contenido de `instalar.sql` (antes cambiar los datos entre corchetes del final) y presionar **Run**.
4. **Authentication › Providers**: dejar activo **Email**. Teléfono queda para la Fase 4
   (el código llegará por la línea propia del colegio).
5. **Project Settings › API**: copiar *Project URL* y la clave *anon public* en un archivo
   `.env.local` (ver `.env.example`).

## Actualizaciones

Si ya instaló antes, solo corra en el SQL Editor los archivos nuevos de `migrations/`:

- `0002_asistencia_mes.sql`: totales de ausencias y tardías del mes.
- `0003_familias_y_modulos.sql`: app de familias, portón, giras, salidas, avisos, alerta temprana,
  configuración y archivos (comprobantes).
- `0004_notificaciones_y_sustitutos.sql`: notificaciones al teléfono y SMS de respaldo, docentes ausentes
  con sustitutos y logo del colegio.

## Notificaciones y SMS (una sola vez)

1. Correr `0004_notificaciones_y_sustitutos.sql` en el SQL Editor.
2. **Edge Functions › Deploy a new function › Via Editor**: nombre `enviar-avisos`, pegar
   `functions/enviar-avisos/index.ts` y **Deploy**. En los ajustes de la función, desactivar
   **Verify JWT** (la llama el propio servidor cada minuto).
3. SMS (opcional): teléfono Android con chip y SMS ilimitados + app "SMS Gateway for Android" en modo
   *Cloud server*; copiar usuario y contraseña en **Configuración › Módulos › Línea propia para SMS**.
4. Cada familia instala la app (Android: menú de Chrome › *Instalar app*; iPhone: Compartir ›
   *Agregar a inicio*) y toca **Activar notificaciones**.

## Primer ingreso del director

1. Abrir la app en `/entrar` › **Crear cuenta** con el correo puesto en `instalar.sql`.
2. Confirmar el correo con el enlace que llega y volver a `/entrar` › **Entrar**.
3. En **Usuarios y permisos**, registrar al personal (nombre, correo y roles). Cada persona crea
   luego su cuenta con ese mismo correo.

Para que el enlace del correo abra la app, en **Authentication › URL Configuration** poner como
*Site URL* la dirección donde está publicada la app (hoy https://control-asistencia-12b.pages.dev).

## Cómo se vinculan las cuentas

El colegio registra primero a su personal y a los encargados con su correo o teléfono.
Cuando esa persona crea su cuenta con el mismo dato, queda unida automáticamente.

## Fases

1. Base de datos ✔
2. Inicio de sesión ✔ y datos reales en la app ← **aquí** (hecho: Usuarios y permisos, Estudiantes,
   horarios, pase de lista, Hoy, Justificaciones, app de familias, portón, giras, avisos,
   alerta temprana, reportes y configuración; falta docentes ausentes)
3. Portón, comprobantes SINPE y bitácora
4. Avisos push y SMS con línea propia (teléfono Android como enviador)
5. Copias de seguridad, dominio y piloto
