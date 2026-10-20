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

## Cómo se vinculan las cuentas

El colegio registra primero a su personal y a los encargados con su correo o teléfono.
Cuando esa persona crea su cuenta con el mismo dato, queda unida automáticamente.

## Fases

1. Base de datos e inicio de sesión ← **aquí**
2. Usar los datos reales en la app (en lugar de `src/data/`) con permisos aplicados
3. Portón, comprobantes SINPE y bitácora
4. Avisos push y SMS con línea propia (teléfono Android como enviador)
5. Copias de seguridad, dominio y piloto
