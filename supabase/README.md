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

## Primer ingreso del director

1. Abrir la app en `/entrar` › **Crear cuenta** con el correo puesto en `instalar.sql`.
2. Confirmar el correo con el enlace que llega y volver a `/entrar` › **Entrar**.
3. En **Usuarios y permisos**, registrar al personal (nombre, correo y roles). Cada persona crea
   luego su cuenta con ese mismo correo.

Para que el enlace del correo abra la app, en **Authentication › URL Configuration** poner como
*Site URL* la dirección donde está publicada la app.

## Cómo se vinculan las cuentas

El colegio registra primero a su personal y a los encargados con su correo o teléfono.
Cuando esa persona crea su cuenta con el mismo dato, queda unida automáticamente.

## Fases

1. Base de datos ✔
2. Inicio de sesión ✔ y datos reales en la app ← **aquí** (hecho: Usuarios y permisos;
   faltan Estudiantes, Hoy, pase de lista y el resto)
3. Portón, comprobantes SINPE y bitácora
4. Avisos push y SMS con línea propia (teléfono Android como enviador)
5. Copias de seguridad, dominio y piloto
