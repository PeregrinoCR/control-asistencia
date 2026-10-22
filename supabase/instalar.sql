-- INSTALACIÓN COMPLETA: pegar TODO este archivo en el SQL Editor de Supabase y presionar Run.
-- Borra lo que haya quedado a medias y crea todo de nuevo. Antes de correrlo, cambiar
-- [NOMBRE DEL COLEGIO], [NOMBRE DEL DIRECTOR(A)] y [CORREO] (al final del archivo).
-- ¡Ojo! Si el colegio ya tiene datos, NO use este archivo: corra solo las migraciones nuevas.

drop trigger if exists vincular_cuenta on auth.users;
drop view if exists asistencia_mes, asistencia_dia, docentes;
drop table if exists cuidos, coberturas, ausencias_docentes, incapacidades, ausencia_avisos, notificaciones, suscripciones, ajustes_privados,
  seguimientos, aviso_lecturas, avisos, gira_autorizaciones, giras, porton, salidas,
  bitacora, justificaciones, asistencia, horario, materias, carnes,
  estudiante_encargado, encargados, estudiantes, personal, roles, secciones, colegios cascade;
drop function if exists vincular_cuenta, solo_digitos, doy_leccion_en, mis_estudiantes, tiene_permiso, mi_colegio,
  soy_personal, crear_carne, nuevo_codigo_carne, reponer_carne, cr_hoy, vapid_publica, guardar_sms, sms_configurado,
  encolar, destinatarios, avisar_estudiante, regla, avisar_asistencia, avisar_aviso, avisar_salida,
  avisar_justificacion, sms_prueba, avisar_leccion_libre, avisar_cuido,
  generar_coberturas, registrar_incapacidad, marcar_sustitucion, nombrar_sustituto, ajustar_incapacidad,
  plazo_familia, plazo_docente, dias_habiles, proteger_justificacion, doy_esa_leccion, justificar_ausencia,
  quitar_justificacion, excepcion_justificacion, recordatorios_justificacion cascade;

-- Control de asistencia: estructura inicial (Fase 1).
-- Todo cuelga de un colegio; las reglas de seguridad (RLS) hacen que cada persona
-- vea solo los datos de su colegio y lo que sus permisos le permiten.

create extension if not exists pgcrypto;

-- ---------- Colegio ----------

create table colegios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  sector text not null check (sector in ('public', 'private')),
  telefono text,
  modulos jsonb not null default '{"saber": false, "pagos": false, "sms": false}',
  creado timestamptz not null default now()
);

create table secciones (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  nombre text not null,             -- '10-2'
  jornada text not null default 'noc' check (jornada in ('noc', 'diu', 'sab')),
  aula text,
  unique (colegio_id, nombre)
);

-- ---------- Personal y permisos (espejo de src/data/users.ts) ----------

create table roles (
  id text primary key,              -- 'dir', 'doc', 'gui', 'ori', 'adm', 'gua'
  nombre text not null,
  permisos text[] not null,
  limitado_a_seccion boolean not null default false
);

create table personal (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  usuario_id uuid unique references auth.users on delete set null,
  nombre text not null,
  correo text,
  telefono text,
  roles text[] not null default '{}',
  permisos_extra text[] not null default '{}',
  seccion_guia uuid references secciones on delete set null,
  activo boolean not null default true
);

-- ---------- Estudiantes y familias ----------

create table estudiantes (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  seccion_id uuid references secciones on delete set null,
  nombre text not null,
  cedula text,
  nacimiento date,
  telefono text,                    -- propio, para mayores de edad
  usuario_id uuid unique references auth.users on delete set null,  -- mayor de edad con cuenta propia
  activo boolean not null default true
);

create table encargados (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  usuario_id uuid unique references auth.users on delete set null,
  nombre text not null,
  cedula text,
  correo text,
  telefono text
);

create table estudiante_encargado (
  estudiante_id uuid references estudiantes on delete cascade,
  encargado_id uuid references encargados on delete cascade,
  parentesco text,
  primary key (estudiante_id, encargado_id)
);

-- Carné: el QR guarda solo este código, nunca la cédula (Ley 8968).
create table carnes (
  codigo text primary key,
  estudiante_id uuid not null references estudiantes on delete cascade,
  revocado boolean not null default false,
  creado timestamptz not null default now()
);

-- ---------- Horario (una sola fuente) ----------

create table materias (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  nombre text not null,
  unique (colegio_id, nombre)
);

create table horario (
  id uuid primary key default gen_random_uuid(),
  seccion_id uuid not null references secciones on delete cascade,
  dia text not null check (dia in ('L', 'K', 'M', 'J', 'V', 'S')),
  leccion smallint not null check (leccion between 1 and 12),
  materia_id uuid not null references materias,
  docente_id uuid references personal on delete set null,
  unique (seccion_id, dia, leccion)
);

-- ---------- Asistencia ----------

create table asistencia (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references estudiantes on delete cascade,
  seccion_id uuid not null references secciones,
  fecha date not null,
  leccion smallint not null,
  marca text not null check (marca in ('P', 'T', 'A')),
  registrado_por uuid references personal,
  registrado timestamptz not null default now(),
  unique (estudiante_id, fecha, leccion)
);

create table justificaciones (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references estudiantes on delete cascade,
  tipo text not null check (tipo in ('Ausencia', 'Tardía')),
  desde date not null,
  hasta date not null,
  lecciones text,
  motivo text not null,
  comentario text,
  documento text,                   -- ruta en el almacenamiento de archivos
  enviado_por uuid references auth.users,
  enviado timestamptz not null default now(),
  estado text not null default 'p' check (estado in ('p', 'a', 'r', 'i')),
  revisado_por uuid references personal
);

-- Bitácora de cambios, útil ante reclamos.
create table bitacora (
  id bigint generated always as identity primary key,
  colegio_id uuid not null references colegios on delete cascade,
  usuario_id uuid references auth.users,
  accion text not null,
  detalle jsonb,
  cuando timestamptz not null default now()
);

create index on asistencia (seccion_id, fecha);
create index on asistencia (estudiante_id, fecha);
create index on estudiantes (seccion_id);

-- ---------- Funciones de permisos ----------

-- Colegio de quien está conectado (personal, encargado o estudiante adulto).
create function mi_colegio() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select colegio_id from personal where usuario_id = auth.uid() and activo),
    (select colegio_id from encargados where usuario_id = auth.uid()),
    (select colegio_id from estudiantes where usuario_id = auth.uid() and activo)
  )
$$;

-- ¿Tiene el permiso? Si se da una sección y el permiso solo viene de "Profesor guía",
-- vale únicamente para su propia sección.
create function tiene_permiso(perm text, seccion uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal p
    where p.usuario_id = auth.uid() and p.activo and (
      perm = any (p.permisos_extra)
      or exists (
        select 1 from roles r
        where r.id = any (p.roles) and perm = any (r.permisos)
          and (not r.limitado_a_seccion or seccion is null or seccion = p.seccion_guia)
      )
    )
  )
$$;

-- Estudiantes que puede ver una familia: sus hijos, o él mismo si es mayor de edad.
create function mis_estudiantes() returns setof uuid language sql stable security definer set search_path = public as $$
  select ee.estudiante_id from estudiante_encargado ee
    join encargados e on e.id = ee.encargado_id where e.usuario_id = auth.uid()
  union
  select id from estudiantes where usuario_id = auth.uid()
$$;

-- ¿Da lecciones en esa sección?
create function doy_leccion_en(seccion uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from horario h join personal p on p.id = h.docente_id
    where h.seccion_id = seccion and p.usuario_id = auth.uid()
  )
$$;

-- ---------- Reglas de seguridad ----------

alter table colegios enable row level security;
alter table secciones enable row level security;
alter table roles enable row level security;
alter table personal enable row level security;
alter table estudiantes enable row level security;
alter table encargados enable row level security;
alter table estudiante_encargado enable row level security;
alter table carnes enable row level security;
alter table materias enable row level security;
alter table horario enable row level security;
alter table asistencia enable row level security;
alter table justificaciones enable row level security;
alter table bitacora enable row level security;

create policy ver on colegios for select using (id = mi_colegio());
create policy editar on colegios for update using (id = mi_colegio() and tiene_permiso('settings'));

create policy ver on roles for select using (true);

create policy ver on secciones for select using (colegio_id = mi_colegio());
create policy editar on secciones for all using (colegio_id = mi_colegio() and tiene_permiso('assign'));

create policy ver on materias for select using (colegio_id = mi_colegio());
create policy editar on materias for all using (colegio_id = mi_colegio() and tiene_permiso('assign'));

create policy ver on horario for select
  using (seccion_id in (select id from secciones where colegio_id = mi_colegio()));
create policy editar on horario for all
  using (seccion_id in (select id from secciones where colegio_id = mi_colegio()) and tiene_permiso('assign'));

create policy ver on personal for select
  using (colegio_id = mi_colegio() and (usuario_id = auth.uid() or tiene_permiso('users') or tiene_permiso('teacherAbs')));
create policy editar on personal for all using (colegio_id = mi_colegio() and tiene_permiso('users'));

create policy ver on estudiantes for select using (
  colegio_id = mi_colegio() and (
    id in (select mis_estudiantes())
    or tiene_permiso('viewAttendance', seccion_id)
    or tiene_permiso('gate')
    or doy_leccion_en(seccion_id)
  )
);
create policy editar on estudiantes for all using (colegio_id = mi_colegio() and tiene_permiso('users'));

create policy ver on encargados for select
  using (colegio_id = mi_colegio() and (usuario_id = auth.uid() or tiene_permiso('viewAttendance')));
create policy editar on encargados for all using (colegio_id = mi_colegio() and tiene_permiso('users'));

create policy ver on estudiante_encargado for select
  using (estudiante_id in (select mis_estudiantes()) or tiene_permiso('viewAttendance'));
create policy editar on estudiante_encargado for all using (tiene_permiso('users'));

create policy ver on carnes for select
  using (estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or tiene_permiso('cards'));
create policy editar on carnes for all using (tiene_permiso('cards'));

create policy ver on asistencia for select using (
  estudiante_id in (select mis_estudiantes())
  or tiene_permiso('viewAttendance', seccion_id)
  or doy_leccion_en(seccion_id)
);
-- Pasar lista: solo en secciones donde da lecciones.
create policy pasar_lista on asistencia for insert
  with check (tiene_permiso('rollCall') and doy_leccion_en(seccion_id));
create policy corregir on asistencia for update
  using (tiene_permiso('rollCall') and doy_leccion_en(seccion_id));

create policy ver on justificaciones for select using (
  estudiante_id in (select mis_estudiantes())
  or exists (select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('approveJust', e.seccion_id))
);
create policy enviar on justificaciones for insert
  with check (estudiante_id in (select mis_estudiantes()) and enviado_por = auth.uid());
create policy revisar on justificaciones for update using (
  exists (select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('approveJust', e.seccion_id))
);

create policy ver on bitacora for select using (colegio_id = mi_colegio() and tiene_permiso('reports'));
create policy escribir on bitacora for insert with check (colegio_id = mi_colegio() and usuario_id = auth.uid());

-- ---------- Vincular cuentas ----------
-- Al crear una cuenta (por correo o teléfono), se une con el personal, encargado o
-- estudiante adulto que el colegio ya registró con ese mismo correo o teléfono.

create function solo_digitos(t text) returns text language sql immutable as $$
  select right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8)
$$;

create function vincular_cuenta() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update personal set usuario_id = new.id where usuario_id is null and (
    lower(correo) = lower(new.email) or (new.phone is not null and solo_digitos(telefono) = solo_digitos(new.phone)));
  update encargados set usuario_id = new.id where usuario_id is null and (
    lower(correo) = lower(new.email) or (new.phone is not null and solo_digitos(telefono) = solo_digitos(new.phone)));
  update estudiantes set usuario_id = new.id where usuario_id is null
    and new.phone is not null and solo_digitos(telefono) = solo_digitos(new.phone)
    and nacimiento <= current_date - interval '18 years';
  return new;
end
$$;

create trigger vincular_cuenta after insert on auth.users
  for each row execute function vincular_cuenta();

-- Ausencias y tardías del mes por estudiante, calculadas en el servidor.
-- security_invoker: respeta las reglas de permisos de quien consulta.
create or replace view asistencia_mes with (security_invoker = true) as
select estudiante_id,
  count(*) filter (where marca = 'A') as ausencias,
  count(*) filter (where marca = 'T') as tardias
from asistencia
where fecha >= date_trunc('month', current_date)
group by estudiante_id;

grant select on asistencia_mes to authenticated;

-- Familias, portón, giras, salidas tempranas, avisos, alerta temprana y configuración.
-- Se puede correr más de una vez.

-- ---------- Configuración del colegio ----------
-- Datos de la institución, calendario, módulos y reglas, en un solo campo flexible.
alter table colegios add column if not exists config jsonb not null default '{}';

-- ---------- Carnés: un código opaco por estudiante, creado solo ----------

create or replace function nuevo_codigo_carne() returns text language sql volatile as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 4) || '-' || substr(md5(gen_random_uuid()::text), 1, 4))
$$;

create or replace function crear_carne() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into carnes (codigo, estudiante_id) values (nuevo_codigo_carne(), new.id);
  return new;
end
$$;

drop trigger if exists crear_carne on estudiantes;
create trigger crear_carne after insert on estudiantes for each row execute function crear_carne();

insert into carnes (codigo, estudiante_id)
select nuevo_codigo_carne(), e.id from estudiantes e
where not exists (select 1 from carnes c where c.estudiante_id = e.id and not c.revocado);

-- Reponer un carné perdido: revoca el actual y crea uno nuevo.
create or replace function reponer_carne(estudiante uuid) returns text language plpgsql security definer set search_path = public as $$
declare codigo_nuevo text := nuevo_codigo_carne();
begin
  if not (tiene_permiso('cards') or estudiante in (select mis_estudiantes())) then
    raise exception 'Sin permiso';
  end if;
  update carnes set revocado = true where estudiante_id = estudiante and not revocado;
  insert into carnes (codigo, estudiante_id) values (codigo_nuevo, estudiante);
  return codigo_nuevo;
end
$$;

-- ---------- Nombres de docentes para las familias ----------
-- Las familias no ven la tabla de personal; solo nombres de docentes de su colegio.
create or replace view docentes as
select id, nombre from personal
where colegio_id = mi_colegio() and activo and 'doc' = any (roles);
grant select on docentes to authenticated;

-- ---------- Salidas tempranas ----------

create table if not exists salidas (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references estudiantes on delete cascade,
  fecha date not null,
  hora text not null,                 -- '8:00'
  modo text not null check (modo in ('pickup', 'alone')),
  motivo text,
  retira_nombre text,
  retira_cedula text,
  comprobante text not null default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  autorizado_por uuid references auth.users,
  creado timestamptz not null default now(),
  salio timestamptz,                  -- lo registra el guarda
  unique (estudiante_id, fecha)
);

-- ---------- Registros del portón ----------

create table if not exists porton (
  id bigint generated always as identity primary key,
  colegio_id uuid not null references colegios on delete cascade,
  estudiante_id uuid not null references estudiantes on delete cascade,
  tipo text not null check (tipo in ('in', 'out')),
  cuando timestamptz not null default now(),
  registrado_por uuid references personal
);
create index if not exists porton_dia on porton (colegio_id, cuando);

-- ---------- Giras ----------

create table if not exists giras (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  titulo text not null,
  destino text,
  fecha date not null,
  salida text,
  regreso text,
  costo text,                          -- texto libre; vacío si no tiene costo
  secciones uuid[] not null default '{}',
  fecha_limite date,
  creado_por uuid references personal,
  creado timestamptz not null default now()
);

create table if not exists gira_autorizaciones (
  gira_id uuid references giras on delete cascade,
  estudiante_id uuid references estudiantes on delete cascade,
  estado text not null check (estado in ('ok', 'no')),
  salud text,
  telefono text,                       -- contacto ese día
  firma text,                          -- imagen de la firma (data URL)
  firmado_por uuid references auth.users,
  firmado timestamptz not null default now(),
  pago text not null default 'none' check (pago in ('none', 'review', 'paid')),
  comprobante text,                    -- número o nota del comprobante SINPE
  primary key (gira_id, estudiante_id)
);

-- ---------- Avisos a familias ----------

create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  tipo text not null check (tipo in ('info', 'rem', 'urg', 'sus')),
  titulo text not null,
  cuerpo text not null,
  destino text not null check (destino in ('all', 'enc', 'adu', 'sec', 'doc')),
  secciones uuid[] not null default '{}',
  enviado_por uuid references personal,
  enviado timestamptz not null default now()
);

create table if not exists aviso_lecturas (
  aviso_id uuid references avisos on delete cascade,
  usuario_id uuid references auth.users on delete cascade,
  leido timestamptz not null default now(),
  primary key (aviso_id, usuario_id)
);

-- ---------- Alerta temprana: seguimiento de casos ----------

create table if not exists seguimientos (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references estudiantes on delete cascade,
  tipo text not null check (tipo in ('contacto', 'plan', 'nota', 'cerrado')),
  texto text not null,
  por uuid references personal,
  cuando timestamptz not null default now()
);

-- ---------- Totales por día (reportes) ----------

create or replace view asistencia_dia with (security_invoker = true) as
select fecha, seccion_id,
  count(*) filter (where marca = 'P') as presentes,
  count(*) filter (where marca = 'T') as tardias,
  count(*) filter (where marca = 'A') as ausencias
from asistencia
group by fecha, seccion_id;
grant select on asistencia_dia to authenticated;

-- ---------- Reglas de seguridad ----------

alter table salidas enable row level security;
alter table porton enable row level security;
alter table giras enable row level security;
alter table gira_autorizaciones enable row level security;
alter table avisos enable row level security;
alter table aviso_lecturas enable row level security;
alter table seguimientos enable row level security;

-- Personal activo del colegio (cualquier rol).
create or replace function soy_personal() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from personal where usuario_id = auth.uid() and activo)
$$;

drop policy if exists ver on salidas;
drop policy if exists autorizar on salidas;
drop policy if exists cambiar on salidas;
drop policy if exists anular on salidas;
create policy ver on salidas for select using (
  estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or tiene_permiso('trips') or tiene_permiso('viewAttendance'));
create policy autorizar on salidas for insert
  with check (estudiante_id in (select mis_estudiantes()) and autorizado_por = auth.uid());
-- La familia corrige su autorización; el guarda marca la hora de salida.
create policy cambiar on salidas for update using (estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate'));
create policy anular on salidas for delete using (estudiante_id in (select mis_estudiantes()) and salio is null);

drop policy if exists ver on porton;
drop policy if exists registrar on porton;
create policy ver on porton for select using (
  colegio_id = mi_colegio() and (estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or tiene_permiso('viewAttendance')));
create policy registrar on porton for insert with check (colegio_id = mi_colegio() and tiene_permiso('gate'));

drop policy if exists ver on giras;
drop policy if exists editar on giras;
create policy ver on giras for select using (colegio_id = mi_colegio());
create policy editar on giras for all using (colegio_id = mi_colegio() and tiene_permiso('trips'));

drop policy if exists ver on gira_autorizaciones;
drop policy if exists firmar on gira_autorizaciones;
drop policy if exists cambiar on gira_autorizaciones;
create policy ver on gira_autorizaciones for select using (
  estudiante_id in (select mis_estudiantes()) or tiene_permiso('trips') or tiene_permiso('payments'));
create policy firmar on gira_autorizaciones for insert
  with check (estudiante_id in (select mis_estudiantes()) and firmado_por = auth.uid());
create policy cambiar on gira_autorizaciones for update
  using (estudiante_id in (select mis_estudiantes()) or tiene_permiso('payments'));

drop policy if exists ver on avisos;
drop policy if exists enviar on avisos;
create policy ver on avisos for select using (colegio_id = mi_colegio() and (destino <> 'doc' or soy_personal()));
create policy enviar on avisos for insert with check (colegio_id = mi_colegio() and tiene_permiso('notices'));

drop policy if exists ver on aviso_lecturas;
drop policy if exists leer on aviso_lecturas;
create policy ver on aviso_lecturas for select using (usuario_id = auth.uid() or tiene_permiso('notices'));
create policy leer on aviso_lecturas for insert with check (usuario_id = auth.uid());

drop policy if exists ver on seguimientos;
drop policy if exists escribir on seguimientos;
create policy ver on seguimientos for select using (tiene_permiso('earlyWarning'));
create policy escribir on seguimientos for insert with check (tiene_permiso('earlyWarning'));

-- ---------- Archivos (comprobantes de justificaciones y SINPE) ----------
-- Carpeta = id del colegio. Lo ve quien lo subió o el personal del colegio.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false)
      on conflict (id) do nothing;
    drop policy if exists comprobantes_subir on storage.objects;
    drop policy if exists comprobantes_ver on storage.objects;
    create policy comprobantes_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = mi_colegio()::text);
    create policy comprobantes_ver on storage.objects for select to authenticated
      using (bucket_id = 'comprobantes' and (storage.foldername(name))[1] = mi_colegio()::text
        and (owner = auth.uid() or soy_personal()));
  end if;
end
$$;

-- Notificaciones (push y SMS de respaldo), ausencias de docentes con sustitutos y logo público.
-- Se puede correr más de una vez.

-- Fecha de hoy en Costa Rica (el servidor usa hora UTC: a las 6 p. m. en Costa Rica ya es "mañana").
create or replace function cr_hoy() returns date language sql stable as $$
  select (now() at time zone 'America/Costa_Rica')::date
$$;

-- ---------- Datos privados del servidor ----------
-- Claves de notificaciones y de la línea SMS. Sin reglas: solo el servidor las lee.
create table if not exists ajustes_privados (
  clave text primary key,
  valor jsonb not null
);
alter table ajustes_privados enable row level security;

-- La clave pública de notificaciones sí la necesita el teléfono para suscribirse.
create or replace function vapid_publica() returns text language sql stable security definer set search_path = public as $$
  select valor->>'publicKey' from ajustes_privados where clave = 'vapid'
$$;

-- Usuario y clave de la app "SMS Gateway for Android"; solo quien cambia la configuración.
create or replace function guardar_sms(usuario text, clave text, limite_hora int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('settings') then raise exception 'Sin permiso'; end if;
  insert into ajustes_privados (clave, valor)
  values ('sms', jsonb_build_object('usuario', usuario, 'clave', clave, 'limiteHora', limite_hora))
  on conflict (clave) do update set valor = excluded.valor;
end
$$;

create or replace function sms_configurado() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ajustes_privados where clave = 'sms' and valor->>'usuario' <> '')
$$;

-- ---------- Teléfonos suscritos a notificaciones ----------
create table if not exists suscripciones (
  endpoint text primary key,
  usuario_id uuid not null references auth.users on delete cascade,
  claves jsonb not null,
  creado timestamptz not null default now()
);
alter table suscripciones enable row level security;
drop policy if exists propias on suscripciones;
create policy propias on suscripciones for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- ---------- Cola de notificaciones ----------
create table if not exists notificaciones (
  id bigint generated always as identity primary key,
  colegio_id uuid not null references colegios on delete cascade,
  usuario_id uuid references auth.users on delete cascade,
  telefono text,
  tipo text not null,
  urgente boolean not null default false,
  titulo text not null,
  cuerpo text not null,
  url text not null default '/familia',
  creado timestamptz not null default now(),
  -- pendiente → enviado | sin_suscripcion | sin_cuenta | fallo
  push_estado text not null default 'pendiente',
  -- no (no aplica) | pendiente | enviado | no_necesario | fallo
  sms_estado text not null default 'no',
  sms_enviado timestamptz
);
create index if not exists notificaciones_pendientes on notificaciones (push_estado, sms_estado);
alter table notificaciones enable row level security;
drop policy if exists ver on notificaciones;
create policy ver on notificaciones for select using (
  usuario_id = auth.uid() or (colegio_id = mi_colegio() and (tiene_permiso('sms') or tiene_permiso('settings'))));

-- Encola un mensaje para una persona, decidiendo si lleva SMS de respaldo según la configuración.
create or replace function encolar(colegio uuid, usuario uuid, tel text, tipo_ text, titulo_ text, cuerpo_ text, url_ text, urgente_ boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  c colegios;
  reglas jsonb;
  con_sms boolean;
begin
  if usuario is null and coalesce(tel, '') = '' then return; end if;
  select * into c from colegios where id = colegio;
  reglas := coalesce(c.config->'avisosAutomaticos', '{}');
  con_sms := coalesce((c.modulos->>'sms')::boolean, false)
    and coalesce((reglas->>'sms')::boolean, true)
    and (not coalesce((c.modulos->>'smsUrgent')::boolean, false) or urgente_)
    and coalesce(tel, '') <> '';
  insert into notificaciones (colegio_id, usuario_id, telefono, tipo, urgente, titulo, cuerpo, url, push_estado, sms_estado)
  values (colegio, usuario, nullif(tel, ''), tipo_, urgente_, titulo_, cuerpo_, coalesce(url_, '/familia'),
    case when usuario is null then 'sin_cuenta' else 'pendiente' end,
    case when con_sms then 'pendiente' else 'no' end);
end
$$;

-- Quién recibe los avisos de un estudiante: él mismo si es mayor de edad; si no, sus encargados.
create or replace function destinatarios(est uuid) returns table (usuario_id uuid, telefono text)
language sql stable security definer set search_path = public as $$
  select e.usuario_id, e.telefono from estudiantes e
  where e.id = est and e.nacimiento <= cr_hoy() - interval '18 years'
  union
  select g.usuario_id, g.telefono from estudiante_encargado ee
    join encargados g on g.id = ee.encargado_id
    join estudiantes e on e.id = ee.estudiante_id
  where ee.estudiante_id = est and (e.nacimiento is null or e.nacimiento > cr_hoy() - interval '18 years')
$$;

-- Avisa a quien corresponda de un estudiante.
create or replace function avisar_estudiante(est uuid, tipo_ text, titulo_ text, cuerpo_ text, url_ text, urgente_ boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  d record;
  col uuid := (select colegio_id from estudiantes where id = est);
begin
  for d in select * from destinatarios(est) loop
    perform encolar(col, d.usuario_id, d.telefono, tipo_, titulo_, cuerpo_, url_, urgente_);
  end loop;
end
$$;

-- ¿Está activa esta regla de avisos automáticos del colegio? (por defecto sí, salvo "arr")
create or replace function regla(colegio uuid, regla_id text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((c.config->'avisosAutomaticos'->>regla_id)::boolean, regla_id <> 'arr') from colegios c where c.id = colegio
$$;

-- ---------- Disparadores ----------

-- Ausencia o llegada tardía en el pase de lista.
create or replace function avisar_asistencia() returns trigger language plpgsql security definer set search_path = public as $$
declare
  e estudiantes;
  materia text;
  hoy_dia text := (array['L','K','M','J','V','S','D'])[extract(isodow from new.fecha)::int];
begin
  if new.marca not in ('A', 'T') or (tg_op = 'UPDATE' and old.marca = new.marca) then return new; end if;
  select * into e from estudiantes where id = new.estudiante_id;
  if not regla(e.colegio_id, case new.marca when 'A' then 'abs' else 'late' end) then return new; end if;
  select m.nombre into materia from horario h join materias m on m.id = h.materia_id
    where h.seccion_id = new.seccion_id and h.dia = hoy_dia and h.leccion = new.leccion;
  perform avisar_estudiante(
    e.id,
    case new.marca when 'A' then 'ausencia' else 'tardia' end,
    case new.marca when 'A' then split_part(e.nombre, ' ', 1) || ' fue marcado(a) ausente'
                   else split_part(e.nombre, ' ', 1) || ' llegó tarde' end,
    coalesce(materia, 'Lección') || ', ' || new.leccion || '.ª lección.' ||
      case new.marca when 'A' then ' Puede justificar desde la app.' else '' end,
    '/familia',
    new.marca = 'A' and (e.nacimiento is null or e.nacimiento > cr_hoy() - interval '18 years'));
  return new;
end
$$;
drop trigger if exists avisar_asistencia on asistencia;
create trigger avisar_asistencia after insert or update of marca on asistencia
  for each row execute function avisar_asistencia();

-- Avisos publicados por dirección.
create or replace function avisar_aviso() returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  for d in
    select distinct x.usuario_id, x.telefono from (
      -- Encargados de menores
      select g.usuario_id, g.telefono from encargados g
        join estudiante_encargado ee on ee.encargado_id = g.id
        join estudiantes e on e.id = ee.estudiante_id and e.activo
      where g.colegio_id = new.colegio_id and new.destino in ('all', 'enc', 'sec')
        and (new.destino <> 'sec' or e.seccion_id = any (new.secciones))
      union
      -- Estudiantes mayores de edad
      select e.usuario_id, e.telefono from estudiantes e
      where e.colegio_id = new.colegio_id and e.activo and new.destino in ('all', 'adu', 'sec')
        and e.nacimiento <= cr_hoy() - interval '18 years'
        and (new.destino <> 'sec' or e.seccion_id = any (new.secciones))
      union
      -- Personal
      select p.usuario_id, p.telefono from personal p
      where p.colegio_id = new.colegio_id and p.activo and new.destino = 'doc'
    ) x
  loop
    perform encolar(new.colegio_id, d.usuario_id, d.telefono, 'aviso', new.titulo, new.cuerpo, '/familia', new.tipo in ('urg', 'sus'));
  end loop;
  return new;
end
$$;
drop trigger if exists avisar_aviso on avisos;
create trigger avisar_aviso after insert on avisos for each row execute function avisar_aviso();

-- Salida registrada en el portón.
create or replace function avisar_salida() returns trigger language plpgsql security definer set search_path = public as $$
declare e estudiantes;
begin
  if new.salio is null or old.salio is not null then return new; end if;
  select * into e from estudiantes where id = new.estudiante_id;
  if not regla(e.colegio_id, 'exit') then return new; end if;
  perform avisar_estudiante(e.id, 'salida', split_part(e.nombre, ' ', 1) || ' salió del colegio',
    'Salida registrada en el portón a las ' || to_char(new.salio at time zone 'America/Costa_Rica', 'FMHH12:MI') || ' p. m.',
    '/familia', true);
  return new;
end
$$;
drop trigger if exists avisar_salida on salidas;
create trigger avisar_salida after update of salio on salidas for each row execute function avisar_salida();

-- Justificación revisada: se avisa a quien la envió.
create or replace function avisar_justificacion() returns trigger language plpgsql security definer set search_path = public as $$
declare e estudiantes;
begin
  if new.estado = old.estado or new.estado not in ('a', 'r', 'i') or new.enviado_por is null then return new; end if;
  select * into e from estudiantes where id = new.estudiante_id;
  perform encolar(e.colegio_id, new.enviado_por, null, 'justificacion',
    case new.estado when 'a' then 'Justificación aprobada' when 'r' then 'Justificación rechazada' else 'El colegio pide más información' end,
    split_part(e.nombre, ' ', 1) || ': ' || lower(new.tipo) || ' del ' || to_char(new.desde, 'DD/MM') || '.',
    '/familia/historial', false);
  return new;
end
$$;
drop trigger if exists avisar_justificacion on justificaciones;
create trigger avisar_justificacion after update of estado on justificaciones for each row execute function avisar_justificacion();

-- SMS de prueba desde Configuración.
create or replace function sms_prueba(tel text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('settings') then raise exception 'Sin permiso'; end if;
  insert into notificaciones (colegio_id, telefono, tipo, urgente, titulo, cuerpo, push_estado, sms_estado)
  values (mi_colegio(), tel, 'prueba', true, 'Prueba', 'Mensaje de prueba de la app de asistencia.', 'sin_cuenta', 'pendiente');
end
$$;

-- ---------- Ausencias de docentes y sustitutos ----------

create table if not exists ausencias_docentes (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  docente_id uuid not null references personal on delete cascade,
  fecha date not null,
  motivo text not null,
  salida_temprana boolean not null default true,
  registrado_por uuid references personal,
  creado timestamptz not null default now(),
  unique (docente_id, fecha)
);

create table if not exists coberturas (
  ausencia_id uuid references ausencias_docentes on delete cascade,
  seccion_id uuid not null references secciones on delete cascade,
  leccion smallint not null,
  tipo text not null check (tipo in ('free', 'sub', 'task')),
  sustituto_id uuid references personal,
  primary key (ausencia_id, seccion_id, leccion)
);

alter table ausencias_docentes enable row level security;
alter table coberturas enable row level security;
drop policy if exists ver on ausencias_docentes;
drop policy if exists editar on ausencias_docentes;
create policy ver on ausencias_docentes for select using (colegio_id = mi_colegio());
create policy editar on ausencias_docentes for all using (colegio_id = mi_colegio() and tiene_permiso('teacherAbs'));
drop policy if exists ver on coberturas;
drop policy if exists editar on coberturas;
create policy ver on coberturas for select using (ausencia_id in (select id from ausencias_docentes where colegio_id = mi_colegio()));
create policy editar on coberturas for all using (
  ausencia_id in (select id from ausencias_docentes where colegio_id = mi_colegio()) and tiene_permiso('teacherAbs'));

-- El sustituto también pasa lista en las lecciones que cubre hoy.
create or replace function doy_leccion_en(seccion uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from horario h join personal p on p.id = h.docente_id
    where h.seccion_id = seccion and p.usuario_id = auth.uid()
  ) or exists (
    select 1 from coberturas c
      join ausencias_docentes a on a.id = c.ausencia_id
      join personal p on p.id = c.sustituto_id
    where c.seccion_id = seccion and p.usuario_id = auth.uid() and a.fecha = cr_hoy()
  )
$$;

-- Lección libre: se avisa a las familias de la sección.
create or replace function avisar_leccion_libre() returns trigger language plpgsql security definer set search_path = public as $$
declare
  a ausencias_docentes;
  e record;
  materia text;
  ultima boolean;
  hoy_dia text;
begin
  if new.tipo <> 'free' then return new; end if;
  select * into a from ausencias_docentes where id = new.ausencia_id;
  hoy_dia := (array['L','K','M','J','V','S','D'])[extract(isodow from a.fecha)::int];
  select m.nombre into materia from horario h join materias m on m.id = h.materia_id
    where h.seccion_id = new.seccion_id and h.dia = hoy_dia and h.leccion = new.leccion;
  ultima := not exists (select 1 from horario h where h.seccion_id = new.seccion_id and h.dia = hoy_dia and h.leccion > new.leccion);
  for e in select id from estudiantes where seccion_id = new.seccion_id and activo loop
    perform avisar_estudiante(e.id, 'leccion_libre',
      coalesce(materia, 'Una lección') || ' no tendrá lección hoy',
      'La ' || new.leccion || '.ª lección queda libre por ausencia del docente.' ||
        case when ultima and a.salida_temprana
          then ' Es la última: los menores pueden salir antes si usted lo autoriza en la app.'
          else ' El grupo permanece en el colegio.' end,
      case when ultima and a.salida_temprana then '/familia/salida' else '/familia' end,
      false);
  end loop;
  return new;
end
$$;
drop trigger if exists avisar_leccion_libre on coberturas;
create trigger avisar_leccion_libre after insert on coberturas for each row execute function avisar_leccion_libre();

-- ---------- Logo del colegio (público) ----------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('publico', 'publico', true) on conflict (id) do nothing;
    drop policy if exists publico_subir on storage.objects;
    drop policy if exists publico_cambiar on storage.objects;
    drop policy if exists publico_ver on storage.objects;
    create policy publico_ver on storage.objects for select using (bucket_id = 'publico');
    create policy publico_subir on storage.objects for insert to authenticated
      with check (bucket_id = 'publico' and (storage.foldername(name))[1] = mi_colegio()::text and tiene_permiso('settings'));
    create policy publico_cambiar on storage.objects for update to authenticated
      using (bucket_id = 'publico' and (storage.foldername(name))[1] = mi_colegio()::text and tiene_permiso('settings'));
  end if;
end
$$;

-- ---------- Envío automático cada minuto ----------
-- Llama a la función "enviar-avisos" (Edge Function) que manda las notificaciones y los SMS en cola.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'enviar-avisos';
    perform cron.schedule('enviar-avisos', '* * * * *', $c$
      select net.http_post(
        url := 'https://cvfmprnelubknjaguyua.supabase.co/functions/v1/enviar-avisos',
        body := '{}'::jsonb,
        headers := '{"Content-Type": "application/json"}'::jsonb)
    $c$);
  end if;
end
$$;

-- Cuido de exámenes: horario de trabajo del personal, estudiantes con adecuación y rol de cuidos.
-- Se puede correr más de una vez.

-- Horario de trabajo de quien no da lecciones: { "dias": ["L","K",...], "desde": 1, "hasta": 6 } (lecciones).
alter table personal add column if not exists horario_trabajo jsonb;

-- Rol de personal de apoyo, sin permisos especiales.
insert into roles (id, nombre, permisos, limitado_a_seccion) values ('aux', 'Auxiliar', '{}', false)
on conflict (id) do nothing;

alter table estudiantes add column if not exists adecuacion boolean not null default false;

create table if not exists cuidos (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  fecha date not null,
  prueba_id text,                       -- id de la prueba en colegios.config.pruebas
  aula text not null,
  tipo text not null default 'aula' check (tipo in ('aula', 'adecuacion')),
  nivel text,                           -- '7', '8'… para aulas de adecuación
  detalle text,                         -- secciones y materia, para el rol impreso
  desde smallint not null,
  hasta smallint not null,
  persona_id uuid references personal on delete set null,   -- null = sin cuidador
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado')),
  creado timestamptz not null default now()
);
create index if not exists cuidos_fecha on cuidos (colegio_id, fecha);

alter table cuidos enable row level security;
drop policy if exists ver on cuidos;
drop policy if exists editar on cuidos;
-- Lo ve el personal del colegio (cada docente, al menos, sus cuidos publicados).
create policy ver on cuidos for select using (
  colegio_id = mi_colegio() and (
    tiene_permiso('assign') or tiene_permiso('settings')
    or (estado = 'publicado' and soy_personal())));
create policy editar on cuidos for all using (colegio_id = mi_colegio() and (tiene_permiso('assign') or tiene_permiso('settings')));

-- Al publicar, se avisa a la persona asignada.
create or replace function avisar_cuido() returns trigger language plpgsql security definer set search_path = public as $$
declare p personal;
begin
  if new.estado <> 'publicado' or new.persona_id is null
     or (tg_op = 'UPDATE' and old.estado = 'publicado' and old.persona_id is not distinct from new.persona_id) then
    return new;
  end if;
  select * into p from personal where id = new.persona_id;
  perform encolar(new.colegio_id, p.usuario_id, p.telefono, 'cuido',
    'Cuido de examen: ' || to_char(new.fecha, 'DD/MM'),
    new.aula || ', ' || new.desde || '.ª a ' || new.hasta || '.ª lección' ||
      coalesce(' · ' || new.detalle, '') ||
      case when new.tipo = 'adecuacion' then ' (estudiantes con adecuación)' else '' end || '.',
    '/docente/pase-de-lista', false);
  return new;
end
$$;
drop trigger if exists avisar_cuido on cuidos;
create trigger avisar_cuido after insert or update of estado, persona_id on cuidos
  for each row execute function avisar_cuido();

-- Herramientas de desarrollo: borrar los datos del colegio para empezar limpio.
-- Solo quien tiene el permiso de configuración puede usarla. Conserva la cuenta del director,
-- los roles y los datos del colegio (nombre, módulos, institución). Se puede correr más de una vez.
-- Antes de la versión final se quita (ver Configuración › Desarrollo).

create or replace function borrar_datos_colegio() returns void language plpgsql security definer set search_path = public as $$
declare col uuid := mi_colegio();
begin
  if col is null or not tiene_permiso('settings') then
    raise exception 'Solo quien administra la configuración puede borrar los datos.';
  end if;
  -- Las tablas dependientes (horario, asistencia, carnes, justificaciones, salidas, lecturas…) se borran en cascada.
  delete from notificaciones where colegio_id = col;
  delete from cuidos where colegio_id = col;
  delete from ausencias_docentes where colegio_id = col;
  delete from avisos where colegio_id = col;
  delete from giras where colegio_id = col;
  delete from porton where colegio_id = col;
  delete from bitacora where colegio_id = col;
  delete from estudiantes where colegio_id = col;
  delete from encargados where colegio_id = col;
  -- Antes de las materias: los horarios dependen de ellas y se borran al borrar las secciones.
  delete from secciones where colegio_id = col;
  delete from materias where colegio_id = col;
  -- Se conserva la cuenta que hace el borrado; las demás personas del personal se eliminan.
  delete from personal where colegio_id = col and usuario_id is distinct from auth.uid();
  -- Configuración de cargas, calendario y aulas: vuelve a empezar; los datos del colegio se conservan.
  update colegios set config = config - 'cargas' - 'pruebas' - 'eventos' - 'aulas' - 'aulasAdecuacion' where id = col;
end
$$;

-- Firma dibujada en las salidas anticipadas: la imagen de la firma (PNG en data URL).
-- Las giras ya tienen la columna gira_autorizaciones.firma. Se puede correr más de una vez.
alter table salidas add column if not exists firma text;

-- Salida temprana pedida por la familia: queda pendiente hasta que dirección la aprueba o rechaza.
-- El guarda solo ve las aprobadas. Al decidir se avisa a la familia; al aprobar, también al docente de la sección
-- ese día. Se puede correr más de una vez.

alter table salidas add column if not exists estado text not null default 'aprobada'
  check (estado in ('pendiente', 'aprobada', 'rechazada'));
alter table salidas add column if not exists motivo_rechazo text;
alter table salidas add column if not exists decidido_por uuid references auth.users;
alter table salidas add column if not exists decidido_en timestamptz;

-- Dirección ve y decide las salidas del colegio.
drop policy if exists decidir on salidas;
create policy decidir on salidas for update using (
  estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()) and tiene_permiso('approveJust'));
drop policy if exists ver_direccion on salidas;
create policy ver_direccion on salidas for select using (
  estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()) and tiene_permiso('approveJust'));

-- Solo dirección aprueba o rechaza; la familia solo puede pedir (dejar la salida pendiente).
create or replace function control_salida() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not tiene_permiso('approveJust') then
    new.estado := 'pendiente';
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado and new.estado <> 'pendiente' and not tiene_permiso('approveJust') then
    raise exception 'Solo dirección aprueba o rechaza una salida.';
  end if;
  return new;
end
$$;
drop trigger if exists control_salida on salidas;
create trigger control_salida before insert or update on salidas
  for each row execute function control_salida();

-- Aviso a la familia cuando dirección decide, y al docente de la sección cuando se aprueba.
create or replace function avisar_decision_salida() returns trigger language plpgsql security definer set search_path = public as $$
declare d record; est record; aprobada boolean := new.estado = 'aprobada';
begin
  if new.estado = old.estado or new.estado not in ('aprobada', 'rechazada') then return new; end if;
  select e.colegio_id, e.nombre, e.seccion_id into est from estudiantes e where e.id = new.estudiante_id;
  for d in select * from destinatarios(new.estudiante_id) loop
    perform encolar(est.colegio_id, d.usuario_id, d.telefono, 'salida',
      'Salida de ' || est.nombre || (case when aprobada then ' autorizada' else ' no autorizada' end),
      case when aprobada then 'Sale a las ' || new.hora || '. Puede verlo en la app.'
           else 'Motivo: ' || coalesce(new.motivo_rechazo, 'sin detalle') || '.' end,
      '/familia/salida', true);
  end loop;
  if aprobada and est.seccion_id is not null then
    for d in
      select distinct p.usuario_id, p.telefono from horario h
      join personal p on p.id = h.docente_id
      where h.seccion_id = est.seccion_id and p.usuario_id is not null
        and h.dia = case extract(isodow from new.fecha) when 1 then 'L' when 2 then 'K' when 3 then 'M' when 4 then 'J' when 5 then 'V' end
    loop
      perform encolar(est.colegio_id, d.usuario_id, d.telefono, 'salida',
        'Salida anticipada: ' || est.nombre, 'Sale a las ' || new.hora || '.', '/docente/pase-de-lista', false);
    end loop;
  end if;
  return new;
end
$$;
drop trigger if exists avisar_decision_salida on salidas;
create trigger avisar_decision_salida after update of estado on salidas
  for each row execute function avisar_decision_salida();

-- Roles y accesos: un rol limitado a su sección ya no abre permisos de todo el colegio, las salidas
-- y la matrícula tienen permiso propio, y el profesor guía deja de enviar avisos y crear giras.
-- Se puede correr más de una vez.

-- 1. Un rol limitado a la sección solo vale cuando la consulta dice a qué sección se refiere.
--    Antes, sin sección, valía para todo el colegio.
create or replace function tiene_permiso(perm text, seccion uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal p
    where p.usuario_id = auth.uid() and p.activo and (
      perm = any (p.permisos_extra)
      or exists (
        select 1 from roles r
        where r.id = any (p.roles) and perm = any (r.permisos)
          and (not r.limitado_a_seccion or (seccion is not null and seccion = p.seccion_guia))
      )
    )
  )
$$;

-- 2. Roles (igual que supabase/seed.sql y src/data/users.ts).
insert into roles (id, nombre, permisos, limitado_a_seccion) values
  ('dir', 'Dirección', array['rollCall','viewAttendance','approveJust','approveExit','teacherAbs','assign','trips','gate',
    'notices','sms','earlyWarning','saber','payments','cards','students','reports','users','settings'], false),
  ('doc', 'Docente', array['rollCall'], false),
  ('gui', 'Profesor guía', array['viewAttendance','approveJust','earlyWarning'], true),
  ('ori', 'Orientación', array['viewAttendance','approveJust','notices','earlyWarning','saber','reports'], false),
  ('adm', 'Administrativo', array['viewAttendance','approveJust','approveExit','teacherAbs','trips','notices',
    'payments','cards','students','reports'], false),
  ('gua', 'Guarda de portón', array['gate'], false)
on conflict (id) do update set nombre = excluded.nombre, permisos = excluded.permisos,
  limitado_a_seccion = excluded.limitado_a_seccion;

-- 3. Matrícula: estudiantes y encargados con su propio permiso ("students"), no con "users".
drop policy if exists editar on estudiantes;
create policy editar on estudiantes for all using (colegio_id = mi_colegio() and tiene_permiso('students'));

drop policy if exists ver on encargados;
create policy ver on encargados for select using (
  colegio_id = mi_colegio() and (usuario_id = auth.uid() or tiene_permiso('students') or exists (
    select 1 from estudiante_encargado ee join estudiantes e on e.id = ee.estudiante_id
    where ee.encargado_id = encargados.id and tiene_permiso('viewAttendance', e.seccion_id))));
drop policy if exists editar on encargados;
create policy editar on encargados for all using (colegio_id = mi_colegio() and tiene_permiso('students'));

drop policy if exists ver on estudiante_encargado;
create policy ver on estudiante_encargado for select using (
  estudiante_id in (select mis_estudiantes()) or exists (
    select 1 from estudiantes e where e.id = estudiante_id
      and (tiene_permiso('students') or tiene_permiso('viewAttendance', e.seccion_id))));
drop policy if exists editar on estudiante_encargado;
create policy editar on estudiante_encargado for all using (
  exists (select 1 from estudiantes e where e.id = estudiante_id and e.colegio_id = mi_colegio())
  and tiene_permiso('students'));

-- 4. Salidas anticipadas: solo dirección y administración deciden; el profesor guía ve las de su sección.
create or replace function control_salida() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not tiene_permiso('approveExit') then
    new.estado := 'pendiente';
  elsif tg_op = 'UPDATE' and new.estado is distinct from old.estado and new.estado <> 'pendiente' and not tiene_permiso('approveExit') then
    raise exception 'Solo dirección aprueba o rechaza una salida.';
  end if;
  return new;
end
$$;

drop policy if exists decidir on salidas;
create policy decidir on salidas for update using (
  estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()) and tiene_permiso('approveExit'));
drop policy if exists ver_direccion on salidas;
create policy ver_direccion on salidas for select using (
  estudiante_id in (select id from estudiantes where colegio_id = mi_colegio()) and tiene_permiso('approveExit'));

drop policy if exists ver on salidas;
create policy ver on salidas for select using (
  estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or tiene_permiso('trips') or exists (
    select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('viewAttendance', e.seccion_id)));

drop policy if exists ver on porton;
create policy ver on porton for select using (
  colegio_id = mi_colegio() and (estudiante_id in (select mis_estudiantes()) or tiene_permiso('gate') or exists (
    select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('viewAttendance', e.seccion_id))));

-- 5. Alerta temprana: el seguimiento de cada estudiante lo ve quien tiene alerta temprana en su sección.
drop policy if exists ver on seguimientos;
create policy ver on seguimientos for select using (exists (
  select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('earlyWarning', e.seccion_id)));
drop policy if exists escribir on seguimientos;
create policy escribir on seguimientos for insert with check (exists (
  select 1 from estudiantes e where e.id = estudiante_id and tiene_permiso('earlyWarning', e.seccion_id)));

-- Giras: teléfono para pagos, docente organizador, pago en efectivo o SINPE, y edición por dirección.
-- Solo dirección (permiso trips) y el docente organizador de la gira marcan un pago como pagado.
-- Se puede correr más de una vez.

alter table giras add column if not exists telefono_pago text;
alter table giras add column if not exists organizador_id uuid references personal;

alter table gira_autorizaciones add column if not exists metodo text check (metodo in ('sinpe', 'efectivo'));
alter table gira_autorizaciones add column if not exists pagado_por uuid references auth.users;
alter table gira_autorizaciones add column if not exists pagado_en timestamptz;

-- ¿Es la persona conectada el docente organizador de esta gira?
create or replace function es_organizador(gira uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from giras g join personal p on p.id = g.organizador_id
    where g.id = gira and p.usuario_id = auth.uid() and p.activo)
$$;

-- Nadie más puede dejar un pago como pagado (una familia podría intentarlo con su propia autorización).
create or replace function control_pago_gira() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pago = 'paid' and (tg_op = 'INSERT' or new.pago is distinct from old.pago) then
    if not (tiene_permiso('trips') or tiene_permiso('payments') or es_organizador(new.gira_id)) then
      raise exception 'Solo dirección o el docente organizador marcan una gira como pagada.';
    end if;
    new.pagado_por := auth.uid();
    new.pagado_en := now();
  end if;
  return new;
end
$$;
drop trigger if exists control_pago_gira on gira_autorizaciones;
create trigger control_pago_gira before insert or update on gira_autorizaciones
  for each row execute function control_pago_gira();

-- El organizador ve las autorizaciones y a los estudiantes de las secciones de su gira.
drop policy if exists organizador_ve_autorizaciones on gira_autorizaciones;
create policy organizador_ve_autorizaciones on gira_autorizaciones for select using (es_organizador(gira_id));

drop policy if exists organizador_ve_estudiantes on estudiantes;
create policy organizador_ve_estudiantes on estudiantes for select using (exists (
  select 1 from giras g join personal p on p.id = g.organizador_id
  where p.usuario_id = auth.uid() and estudiantes.seccion_id = any (g.secciones)));

-- El organizador también puede corregir el pago (marcar pagado) de su gira.
drop policy if exists cambiar on gira_autorizaciones;
create policy cambiar on gira_autorizaciones for update
  using (estudiante_id in (select mis_estudiantes()) or tiene_permiso('payments') or tiene_permiso('trips') or es_organizador(gira_id));

-- Nombre del docente organizador para la familia que paga una gira (la tabla de personal no es legible para familias).
-- Solo devuelve el nombre, y solo a quien pertenece al colegio de la gira. Se puede correr más de una vez.

create or replace function nombre_organizador(gira uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.nombre from giras g join personal p on p.id = g.organizador_id
  where g.id = gira and g.colegio_id = mi_colegio()
$$;

-- Giras: estudiantes agregados fuera de las secciones, y bloqueo de desautorizar una gira ya pagada.
-- Se puede correr más de una vez.

create table if not exists gira_estudiantes (
  gira_id uuid not null references giras on delete cascade,
  estudiante_id uuid not null references estudiantes on delete cascade,
  primary key (gira_id, estudiante_id)
);
alter table gira_estudiantes enable row level security;

drop policy if exists ver on gira_estudiantes;
create policy ver on gira_estudiantes for select using (
  estudiante_id in (select mis_estudiantes()) or tiene_permiso('trips') or tiene_permiso('viewAttendance') or es_organizador(gira_id));
drop policy if exists editar on gira_estudiantes;
create policy editar on gira_estudiantes for all using (tiene_permiso('trips') or es_organizador(gira_id))
  with check (tiene_permiso('trips') or es_organizador(gira_id));

-- El organizador busca cualquier estudiante del colegio para agregarlo a su gira.
drop policy if exists organizador_busca_estudiantes on estudiantes;
create policy organizador_busca_estudiantes on estudiantes for select using (exists (
  select 1 from giras g join personal p on p.id = g.organizador_id
  where p.usuario_id = auth.uid() and g.colegio_id = estudiantes.colegio_id));

-- Una gira pagada no se puede desautorizar desde la familia: hay que contactar al colegio.
create or replace function control_pago_gira() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.pago = 'paid' and old.estado = 'ok' and new.estado = 'no'
     and not (tiene_permiso('trips') or tiene_permiso('payments') or es_organizador(new.gira_id)) then
    raise exception 'La gira ha sido pagada y autorizada, para cambiar el estado de esta gira debe contactar con el Colegio';
  end if;
  if new.pago = 'paid' and (tg_op = 'INSERT' or new.pago is distinct from old.pago) then
    if not (tiene_permiso('trips') or tiene_permiso('payments') or es_organizador(new.gira_id)) then
      raise exception 'Solo dirección o el docente organizador marcan una gira como pagada.';
    end if;
    new.pagado_por := auth.uid();
    new.pagado_en := now();
  end if;
  return new;
end
$$;

-- Teléfono de contacto de cada estudiante en la lista de la gira: el organizador lee a los encargados
-- y sus vínculos, igual que puede buscar estudiantes del colegio. Se puede correr más de una vez.

drop policy if exists organizador_ve_encargados on encargados;
create policy organizador_ve_encargados on encargados for select using (exists (
  select 1 from giras g join personal p on p.id = g.organizador_id
  where p.usuario_id = auth.uid() and g.colegio_id = encargados.colegio_id));

drop policy if exists organizador_ve_vinculos on estudiante_encargado;
create policy organizador_ve_vinculos on estudiante_encargado for select using (exists (
  select 1 from giras g join personal p on p.id = g.organizador_id join estudiantes e on e.id = estudiante_encargado.estudiante_id
  where p.usuario_id = auth.uid() and g.colegio_id = e.colegio_id));

-- Incapacidades de docentes.
-- Un docente ausente normalmente NO se reemplaza: sus lecciones quedan libres (o con trabajo asignado).
-- Solo en una incapacidad prolongada el MEP nombra a un sustituto; aquí se lleva el estado de ese trámite.

create table if not exists incapacidades (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  docente_id uuid not null references personal on delete cascade,
  desde date not null,
  hasta date not null,
  -- ninguno: no se pedirá sustituto · esperando: pedido al MEP, sin nombrar · nombrado: ya hay sustituto
  sustitucion text not null default 'ninguno' check (sustitucion in ('ninguno', 'esperando', 'nombrado')),
  sustituto_id uuid references personal,
  sustituto_desde date,
  registrado_por uuid references personal,
  creado timestamptz not null default now(),
  check (hasta >= desde)
);

alter table ausencias_docentes add column if not exists incapacidad_id uuid references incapacidades on delete cascade;

alter table incapacidades enable row level security;
drop policy if exists ver on incapacidades;
drop policy if exists editar on incapacidades;
create policy ver on incapacidades for select using (colegio_id = mi_colegio());
create policy editar on incapacidades for all using (colegio_id = mi_colegio() and tiene_permiso('teacherAbs'));

-- Crea las coberturas del día para los docentes con incapacidad: lección libre, o del sustituto
-- nombrado desde su fecha de inicio. Es repetible: no duplica. La corre un horario diario y también la app.
-- (Los parámetros llevan prefijo p_ para no chocar con nombres de columnas.)
create or replace function generar_coberturas(p_dia date default cr_hoy()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
  dia_id text := (array['L', 'K', 'M', 'J', 'V', 'S', 'D'])[extract(isodow from p_dia)::int];
  con_sustituto boolean;
begin
  for r in
    select a.id as ausencia_id, i.sustitucion, i.sustituto_id, i.sustituto_desde, h.seccion_id, h.leccion
    from ausencias_docentes a
      join incapacidades i on i.id = a.incapacidad_id
      join horario h on h.docente_id = a.docente_id and h.dia = dia_id
    where a.fecha = p_dia
      and not exists (
        select 1 from coberturas c where c.ausencia_id = a.id and c.seccion_id = h.seccion_id and c.leccion = h.leccion)
  loop
    con_sustituto := r.sustitucion = 'nombrado' and r.sustituto_id is not null and (r.sustituto_desde is null or r.sustituto_desde <= p_dia);
    insert into coberturas (ausencia_id, seccion_id, leccion, tipo, sustituto_id)
      values (r.ausencia_id, r.seccion_id, r.leccion, case when con_sustituto then 'sub' else 'free' end,
              case when con_sustituto then r.sustituto_id end);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Registra la incapacidad con un día de ausencia por cada fecha lectiva indicada.
create or replace function registrar_incapacidad(
  p_docente uuid, p_desde date, p_hasta date, p_fechas date[], p_estado text default 'ninguno',
  p_sustituto uuid default null, p_sustituto_desde date default null, p_registrada_por uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  col uuid := mi_colegio();
  inc uuid;
  f date;
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  if not exists (select 1 from personal where id = p_docente and colegio_id = col) then raise exception 'Docente no encontrado.'; end if;
  insert into incapacidades (colegio_id, docente_id, desde, hasta, sustitucion, sustituto_id, sustituto_desde, registrado_por)
    values (col, p_docente, p_desde, p_hasta, p_estado, case when p_estado = 'nombrado' then p_sustituto end,
            case when p_estado = 'nombrado' then coalesce(p_sustituto_desde, p_desde) end, p_registrada_por)
    returning id into inc;
  foreach f in array p_fechas loop
    insert into ausencias_docentes (colegio_id, docente_id, fecha, motivo, salida_temprana, registrado_por, incapacidad_id)
      values (col, p_docente, f, 'Incapacidad', true, p_registrada_por, inc)
      on conflict (docente_id, fecha) do nothing;
  end loop;
  perform generar_coberturas(cr_hoy());
  return inc;
end
$$;

-- Cambia el estado del trámite mientras no hay sustituto (ninguno <-> esperando).
create or replace function marcar_sustitucion(p_inc uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  if p_estado not in ('ninguno', 'esperando') then raise exception 'Estado no válido.'; end if;
  update incapacidades set sustitucion = p_estado, sustituto_id = null, sustituto_desde = null
    where id = p_inc and colegio_id = mi_colegio();
end
$$;

-- Registra al sustituto nombrado por el MEP: desde esa fecha recibe las lecciones del titular.
create or replace function nombrar_sustituto(p_inc uuid, p_sustituto uuid, p_desde date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  if not exists (select 1 from personal where id = p_sustituto and colegio_id = mi_colegio()) then
    raise exception 'Sustituto no encontrado: agréguelo primero en Usuarios y permisos.';
  end if;
  update incapacidades set sustitucion = 'nombrado', sustituto_id = p_sustituto, sustituto_desde = p_desde
    where id = p_inc and colegio_id = mi_colegio();
  -- Las lecciones que ya estaban libres desde esa fecha pasan al sustituto.
  update coberturas c set tipo = 'sub', sustituto_id = p_sustituto
    from ausencias_docentes a
    where c.ausencia_id = a.id and a.incapacidad_id = p_inc and c.tipo = 'free' and a.fecha >= greatest(p_desde, cr_hoy());
  perform generar_coberturas(cr_hoy());
end
$$;

-- Extiende o acorta la incapacidad. p_fechas son los días lectivos nuevos a agregar; se quitan los posteriores al nuevo fin.
create or replace function ajustar_incapacidad(p_inc uuid, p_hasta date, p_fechas date[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare
  i incapacidades;
  f date;
begin
  if not tiene_permiso('teacherAbs') then raise exception 'Sin permiso para registrar ausencias.'; end if;
  select * into i from incapacidades where id = p_inc and colegio_id = mi_colegio();
  if not found then raise exception 'Incapacidad no encontrada.'; end if;
  update incapacidades set hasta = greatest(p_hasta, i.desde) where id = p_inc;
  delete from ausencias_docentes where incapacidad_id = p_inc and fecha > p_hasta;
  foreach f in array p_fechas loop
    if f > i.hasta and f <= p_hasta then
      insert into ausencias_docentes (colegio_id, docente_id, fecha, motivo, salida_temprana, registrado_por, incapacidad_id)
        values (i.colegio_id, i.docente_id, f, 'Incapacidad', true, i.registrado_por, p_inc)
        on conflict (docente_id, fecha) do nothing;
    end if;
  end loop;
  perform generar_coberturas(cr_hoy());
end
$$;

-- Cada día a las 12:00 (hora de Costa Rica) se preparan las lecciones libres o del sustituto de ese día,
-- para que las familias reciban el aviso antes de la jornada nocturna.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'generar-coberturas';
    perform cron.schedule('generar-coberturas', '0 18 * * 1-5', $c$ select generar_coberturas() $c$);
  end if;
end
$$;

-- Justificación de ausencias por el docente.
-- El estudiante presenta el comprobante FÍSICO a cada profesor con quien faltó (plazo: 5 días hábiles).
-- Cada profesor decide por su lección y la marca pasa a "J" (ausencia justificada); tiene 10 días hábiles.
-- Pasado ese plazo la marca se bloquea y solo dirección puede cambiarla, dejando el motivo en la bitácora.
-- Los plazos (5 y 10) y los días no lectivos se configuran en colegios.config.justificacion:
--   { "diasFamilia": 5, "diasDocente": 10, "noLectivos": ["2026-11-02", ...] }

-- ---------- La marca "J" y lo que se guarda al justificar ----------
alter table asistencia drop constraint if exists asistencia_marca_check;
alter table asistencia add constraint asistencia_marca_check check (marca in ('P', 'T', 'A', 'J'));
alter table asistencia add column if not exists justificada_por uuid references personal;
alter table asistencia add column if not exists justificada_en timestamptz;
alter table asistencia add column if not exists comprobante boolean not null default false;
alter table asistencia add column if not exists nota_justificacion text;

-- ---------- Aviso de la familia (solo informativo) ----------
-- La familia cuenta el motivo; el docente lo ve al decidir. No reemplaza el comprobante físico.
create table if not exists ausencia_avisos (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  estudiante_id uuid not null references estudiantes on delete cascade,
  fecha date not null,
  motivo text not null,
  comentario text,
  enviado_por uuid references auth.users,
  enviado timestamptz not null default now(),
  unique (estudiante_id, fecha)
);
alter table ausencia_avisos enable row level security;
drop policy if exists ver on ausencia_avisos;
drop policy if exists enviar on ausencia_avisos;
drop policy if exists cambiar on ausencia_avisos;
create policy ver on ausencia_avisos for select using (
  estudiante_id in (select mis_estudiantes())
  or exists (select 1 from estudiantes e where e.id = estudiante_id and (tiene_permiso('viewAttendance', e.seccion_id) or doy_leccion_en(e.seccion_id)))
);
create policy enviar on ausencia_avisos for insert
  with check (estudiante_id in (select mis_estudiantes()) and enviado_por = auth.uid() and colegio_id = mi_colegio());
create policy cambiar on ausencia_avisos for update using (estudiante_id in (select mis_estudiantes()));

-- ---------- Plazos y días hábiles ----------
create or replace function plazo_familia(col uuid) returns integer language sql stable security definer set search_path = public as $$
  select coalesce((c.config->'justificacion'->>'diasFamilia')::integer, 5) from colegios c where c.id = col
$$;
create or replace function plazo_docente(col uuid) returns integer language sql stable security definer set search_path = public as $$
  select coalesce((c.config->'justificacion'->>'diasDocente')::integer, 10) from colegios c where c.id = col
$$;

-- Días hábiles transcurridos después de `desde`, hasta `hasta` inclusive: lunes a viernes menos los días no lectivos del colegio.
create or replace function dias_habiles(col uuid, desde date, hasta date) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from generate_series((desde + 1)::timestamp, hasta::timestamp, interval '1 day') as g(d)
  where extract(isodow from d) between 1 and 5
    and not exists (
      select 1 from colegios c, jsonb_array_elements_text(coalesce(c.config->'justificacion'->'noLectivos', '[]'::jsonb)) x
      where c.id = col and x::date = d::date)
$$;

-- ---------- Protección de la marca "J" ----------
-- La marca "J" solo se pone o se quita con las funciones de abajo, que revisan quién es y el plazo.
create or replace function proteger_justificacion() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('app.justificando', true) = '1' then return new; end if;
  if tg_op = 'INSERT' then
    -- Guardar una lista que ya trae esa marca no la cambia: se permite si la fila ya existe con "J".
    if new.marca = 'J' and not exists (
      select 1 from asistencia a where a.estudiante_id = new.estudiante_id and a.fecha = new.fecha and a.leccion = new.leccion and a.marca = 'J') then
      raise exception 'La marca "justificada" solo la pone el docente desde Por justificar.';
    end if;
    return new;
  end if;
  if new.marca is distinct from old.marca and (new.marca = 'J' or old.marca = 'J') then
    raise exception 'Esta ausencia está justificada: use "Quitar justificación" dentro del plazo, o pida a dirección que la reabra.';
  end if;
  return new;
end
$$;
drop trigger if exists proteger_justificacion on asistencia;
create trigger proteger_justificacion before insert or update of marca on asistencia
  for each row execute function proteger_justificacion();

-- ---------- Funciones ----------
-- ¿La persona conectada da esa lección (por horario, por cobertura de ese día o porque pasó la lista)?
create or replace function doy_esa_leccion(p_seccion uuid, p_fecha date, p_leccion smallint, p_registrada_por uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from horario h join personal p on p.id = h.docente_id
    where h.seccion_id = p_seccion and h.leccion = p_leccion and p.usuario_id = auth.uid()
      and h.dia = (array['L', 'K', 'M', 'J', 'V', 'S', 'D'])[extract(isodow from p_fecha)::int]
  ) or exists (
    select 1 from coberturas c join ausencias_docentes a on a.id = c.ausencia_id join personal p on p.id = c.sustituto_id
    where c.seccion_id = p_seccion and c.leccion = p_leccion and a.fecha = p_fecha and p.usuario_id = auth.uid()
  ) or exists (select 1 from personal p where p.id = p_registrada_por and p.usuario_id = auth.uid())
$$;

-- Marca como justificada una ausencia de su propia lección, dentro del plazo del docente.
create or replace function justificar_ausencia(
  p_estudiante uuid, p_fecha date, p_leccion smallint, p_comprobante boolean default true, p_nota text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  a asistencia;
  e estudiantes;
  yo uuid;
  materia text;
begin
  select * into a from asistencia where estudiante_id = p_estudiante and fecha = p_fecha and leccion = p_leccion;
  if not found then raise exception 'No hay una ausencia registrada en esa lección.'; end if;
  select * into e from estudiantes where id = p_estudiante;
  if e.colegio_id is distinct from mi_colegio() then raise exception 'Sin permiso.'; end if;
  if not (tiene_permiso('rollCall') and doy_esa_leccion(a.seccion_id, a.fecha, a.leccion, a.registrado_por)) then
    raise exception 'Solo el docente de esa lección puede justificarla.';
  end if;
  if a.marca not in ('A', 'J') then raise exception 'Solo se justifican ausencias.'; end if;
  if dias_habiles(e.colegio_id, a.fecha, cr_hoy()) > plazo_docente(e.colegio_id) then
    raise exception 'Pasó el plazo de % días hábiles: pida a dirección que la reabra.', plazo_docente(e.colegio_id);
  end if;
  select id into yo from personal where usuario_id = auth.uid();
  perform set_config('app.justificando', '1', true);
  update asistencia set marca = 'J', justificada_por = yo, justificada_en = now(), comprobante = coalesce(p_comprobante, false), nota_justificacion = nullif(trim(p_nota), '')
    where id = a.id;
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (e.colegio_id, auth.uid(), 'justificar_ausencia', jsonb_build_object('estudiante', p_estudiante, 'fecha', p_fecha, 'leccion', p_leccion, 'comprobante', p_comprobante, 'nota', p_nota));
  if a.marca = 'A' then
    select m.nombre into materia from horario h join materias m on m.id = h.materia_id
      where h.seccion_id = a.seccion_id and h.leccion = a.leccion
        and h.dia = (array['L', 'K', 'M', 'J', 'V', 'S', 'D'])[extract(isodow from a.fecha)::int];
    perform avisar_estudiante(e.id, 'justificacion', 'Ausencia justificada',
      split_part(e.nombre, ' ', 1) || ': la ausencia del ' || to_char(a.fecha, 'DD/MM') || ' (' || coalesce(materia, a.leccion || '.ª lección') || ') fue justificada por el docente.',
      '/familia/historial', false);
  end if;
end
$$;

-- Deshace la justificación (de su lección y dentro del plazo): la ausencia vuelve a "sin justificar".
create or replace function quitar_justificacion(p_estudiante uuid, p_fecha date, p_leccion smallint) returns void
language plpgsql security definer set search_path = public as $$
declare
  a asistencia;
  e estudiantes;
begin
  select * into a from asistencia where estudiante_id = p_estudiante and fecha = p_fecha and leccion = p_leccion and marca = 'J';
  if not found then raise exception 'Esa ausencia no está justificada.'; end if;
  select * into e from estudiantes where id = p_estudiante;
  if e.colegio_id is distinct from mi_colegio() then raise exception 'Sin permiso.'; end if;
  if not (tiene_permiso('rollCall') and doy_esa_leccion(a.seccion_id, a.fecha, a.leccion, a.registrado_por)) then
    raise exception 'Solo el docente de esa lección puede cambiarla.';
  end if;
  if dias_habiles(e.colegio_id, a.fecha, cr_hoy()) > plazo_docente(e.colegio_id) then
    raise exception 'Pasó el plazo de % días hábiles: pida a dirección que la reabra.', plazo_docente(e.colegio_id);
  end if;
  perform set_config('app.justificando', '1', true);
  update asistencia set marca = 'A', justificada_por = null, justificada_en = null, comprobante = false, nota_justificacion = null where id = a.id;
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (e.colegio_id, auth.uid(), 'quitar_justificacion', jsonb_build_object('estudiante', p_estudiante, 'fecha', p_fecha, 'leccion', p_leccion));
end
$$;

-- Excepción de dirección: justifica o quita la justificación en cualquier momento, con el motivo en la bitácora.
create or replace function excepcion_justificacion(
  p_estudiante uuid, p_fecha date, p_leccion smallint, p_justificar boolean, p_motivo text
) returns void language plpgsql security definer set search_path = public as $$
declare
  a asistencia;
  e estudiantes;
  yo uuid;
begin
  select * into e from estudiantes where id = p_estudiante;
  if e.colegio_id is distinct from mi_colegio() or not tiene_permiso('approveJust') then raise exception 'Sin permiso.'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escriba el motivo de la excepción.'; end if;
  select * into a from asistencia where estudiante_id = p_estudiante and fecha = p_fecha and leccion = p_leccion;
  if not found then raise exception 'No hay una ausencia registrada en esa lección.'; end if;
  if a.marca not in ('A', 'J') then raise exception 'Solo se cambian ausencias.'; end if;
  select id into yo from personal where usuario_id = auth.uid();
  perform set_config('app.justificando', '1', true);
  if p_justificar then
    update asistencia set marca = 'J', justificada_por = yo, justificada_en = now(), nota_justificacion = 'Excepción de dirección: ' || trim(p_motivo) where id = a.id;
  else
    update asistencia set marca = 'A', justificada_por = null, justificada_en = null, comprobante = false, nota_justificacion = null where id = a.id;
  end if;
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (e.colegio_id, auth.uid(), 'excepcion_justificacion',
            jsonb_build_object('estudiante', p_estudiante, 'fecha', p_fecha, 'leccion', p_leccion, 'justificar', p_justificar, 'motivo', p_motivo));
  if p_justificar and a.marca = 'A' then
    perform avisar_estudiante(e.id, 'justificacion', 'Ausencia justificada',
      split_part(e.nombre, ' ', 1) || ': la ausencia del ' || to_char(a.fecha, 'DD/MM') || ' fue justificada por la dirección.', '/familia/historial', false);
  end if;
end
$$;

-- ---------- Avisos ----------
-- Al marcar una ausencia se explica el plazo (comprobante físico en el colegio), no "justificar desde la app".
create or replace function avisar_asistencia() returns trigger language plpgsql security definer set search_path = public as $$
declare
  e estudiantes;
  materia text;
  hoy_dia text := (array['L','K','M','J','V','S','D'])[extract(isodow from new.fecha)::int];
begin
  if new.marca not in ('A', 'T') or (tg_op = 'UPDATE' and old.marca = new.marca) then return new; end if;
  select * into e from estudiantes where id = new.estudiante_id;
  if not regla(e.colegio_id, case new.marca when 'A' then 'abs' else 'late' end) then return new; end if;
  select m.nombre into materia from horario h join materias m on m.id = h.materia_id
    where h.seccion_id = new.seccion_id and h.dia = hoy_dia and h.leccion = new.leccion;
  perform avisar_estudiante(
    e.id,
    case new.marca when 'A' then 'ausencia' else 'tardia' end,
    case new.marca when 'A' then split_part(e.nombre, ' ', 1) || ' fue marcado(a) ausente'
                   else split_part(e.nombre, ' ', 1) || ' llegó tarde' end,
    coalesce(materia, 'Lección') || ', ' || new.leccion || '.ª lección.' ||
      case new.marca when 'A' then ' Para justificarla, presente el comprobante a ese profesor en el colegio en los próximos '
        || plazo_familia(e.colegio_id) || ' días hábiles.' else '' end,
    '/familia',
    new.marca = 'A' and (e.nacimiento is null or e.nacimiento > cr_hoy() - interval '18 years'));
  return new;
end
$$;

-- Recordatorios diarios: a la familia el último día de su plazo, y al docente cuando le quedan 2 días.
create or replace function recordatorios_justificacion() returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  -- Familia: queda 1 día hábil para presentar el comprobante.
  for r in
    select distinct a.estudiante_id, a.fecha, e.nombre, e.colegio_id
    from asistencia a join estudiantes e on e.id = a.estudiante_id
    where a.marca = 'A' and e.activo
      and dias_habiles(e.colegio_id, a.fecha, cr_hoy()) = plazo_familia(e.colegio_id) - 1
  loop
    perform avisar_estudiante(r.estudiante_id, 'recordatorio', 'Mañana vence el plazo del comprobante',
      split_part(r.nombre, ' ', 1) || ': la ausencia del ' || to_char(r.fecha, 'DD/MM') || ' se justifica presentando el comprobante al profesor.',
      '/familia/historial', false);
    n := n + 1;
  end loop;
  -- Docente: le quedan 2 días hábiles para decidir ausencias de las lecciones que pasó.
  for r in
    select p.usuario_id, p.telefono, p.colegio_id, count(*) as pendientes
    from asistencia a join personal p on p.id = a.registrado_por
    where a.marca = 'A' and p.activo and p.usuario_id is not null
      and dias_habiles(p.colegio_id, a.fecha, cr_hoy()) = plazo_docente(p.colegio_id) - 2
    group by p.usuario_id, p.telefono, p.colegio_id
  loop
    perform encolar(r.colegio_id, r.usuario_id, r.telefono, 'recordatorio', 'Ausencias por justificar',
      'Le quedan 2 días hábiles para decidir ' || r.pendientes || ' ausencias de sus lecciones.', '/docente/por-justificar', false);
    n := n + 1;
  end loop;
  return n;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'recordatorios-justificacion';
    -- 4:00 p. m. hora de Costa Rica (22:00 UTC), de lunes a viernes.
    perform cron.schedule('recordatorios-justificacion', '0 22 * * 1-5', $c$ select recordatorios_justificacion() $c$);
  end if;
end
$$;

-- ---------- Resumen del mes: justificadas aparte de las ausencias sin justificar ----------
create or replace view asistencia_mes with (security_invoker = true) as
select estudiante_id,
  count(*) filter (where marca = 'A') as ausencias,
  count(*) filter (where marca = 'T') as tardias,
  count(*) filter (where marca = 'J') as justificadas
from asistencia
where fecha >= date_trunc('month', current_date)
group by estudiante_id;
grant select on asistencia_mes to authenticated;

-- ---------- Dirección recuerda a un docente sus pendientes ----------
create or replace function recordar_docente(p_docente uuid) returns integer language plpgsql security definer set search_path = public as $$
declare
  p personal;
  pendientes integer;
begin
  if not tiene_permiso('approveJust') then raise exception 'Sin permiso.'; end if;
  select * into p from personal where id = p_docente and colegio_id = mi_colegio();
  if not found or p.usuario_id is null then raise exception 'Ese docente no tiene cuenta en la app.'; end if;
  select count(*) into pendientes from asistencia a
    where a.marca = 'A' and a.registrado_por = p.id
      and dias_habiles(p.colegio_id, a.fecha, cr_hoy()) <= plazo_docente(p.colegio_id);
  perform encolar(p.colegio_id, p.usuario_id, p.telefono, 'recordatorio', 'Ausencias por justificar',
    'Dirección le recuerda decidir ' || pendientes || ' ausencias de sus lecciones.', '/docente/por-justificar', false);
  return pendientes;
end
$$;
grant execute on function recordar_docente(uuid) to authenticated;

-- Datos iniciales: roles (igual que src/data/users.ts) y el colegio piloto.

insert into roles (id, nombre, permisos, limitado_a_seccion) values
  ('dir', 'Dirección', array['rollCall','viewAttendance','approveJust','approveExit','teacherAbs','assign','trips','gate',
    'notices','sms','earlyWarning','saber','payments','cards','students','reports','users','settings'], false),
  ('doc', 'Docente', array['rollCall'], false),
  ('gui', 'Profesor guía', array['viewAttendance','approveJust','earlyWarning'], true),
  ('ori', 'Orientación', array['viewAttendance','approveJust','notices','earlyWarning','saber','reports'], false),
  ('adm', 'Administrativo', array['viewAttendance','approveJust','approveExit','teacherAbs','trips','notices',
    'payments','cards','students','reports'], false),
  ('gua', 'Guarda de portón', array['gate'], false)
on conflict (id) do update set nombre = excluded.nombre, permisos = excluded.permisos,
  limitado_a_seccion = excluded.limitado_a_seccion;

-- Colegio piloto. Cambiar el nombre y el correo antes de correrlo.
with c as (
  insert into colegios (nombre, sector) values ('[NOMBRE DEL COLEGIO]', 'public') returning id
), s as (
  insert into secciones (colegio_id, nombre)
  select c.id, n from c, unnest(array['7-1','7-2','8-1','9-1','10-1','10-2','11-1','11-2']) n
)
insert into personal (colegio_id, nombre, correo, roles)
select c.id, '[NOMBRE DEL DIRECTOR(A)]', '[CORREO]', array['dir'] from c;
