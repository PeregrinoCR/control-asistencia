-- INSTALACIÓN COMPLETA: pegar TODO este archivo en el SQL Editor de Supabase y presionar Run.
-- Borra lo que haya quedado a medias y crea todo de nuevo. Antes de correrlo, cambiar
-- [NOMBRE DEL COLEGIO], [NOMBRE DEL DIRECTOR(A)] y [CORREO] (al final del archivo).
-- ¡Ojo! Si el colegio ya tiene datos, NO use este archivo: corra solo las migraciones nuevas.

drop trigger if exists vincular_cuenta on auth.users;
drop view if exists asistencia_mes, asistencia_dia, docentes;
drop table if exists cuidos, coberturas, ausencias_docentes, notificaciones, suscripciones, ajustes_privados,
  seguimientos, aviso_lecturas, avisos, gira_autorizaciones, giras, porton, salidas,
  bitacora, justificaciones, asistencia, horario, materias, carnes,
  estudiante_encargado, encargados, estudiantes, personal, roles, secciones, colegios cascade;
drop function if exists vincular_cuenta, solo_digitos, doy_leccion_en, mis_estudiantes, tiene_permiso, mi_colegio,
  soy_personal, crear_carne, nuevo_codigo_carne, reponer_carne, cr_hoy, vapid_publica, guardar_sms, sms_configurado,
  encolar, destinatarios, avisar_estudiante, regla, avisar_asistencia, avisar_aviso, avisar_salida,
  avisar_justificacion, sms_prueba, avisar_leccion_libre, avisar_cuido cascade;

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

-- Datos iniciales: roles (igual que src/data/users.ts) y el colegio piloto.

insert into roles (id, nombre, permisos, limitado_a_seccion) values
  ('dir', 'Dirección', array['rollCall','viewAttendance','approveJust','teacherAbs','assign','trips','gate',
    'notices','sms','earlyWarning','saber','payments','cards','reports','users','settings'], false),
  ('doc', 'Docente', array['rollCall'], false),
  ('gui', 'Profesor guía', array['viewAttendance','approveJust','trips','notices','earlyWarning'], true),
  ('ori', 'Orientación', array['viewAttendance','approveJust','notices','earlyWarning','saber','reports'], false),
  ('adm', 'Administrativo', array['viewAttendance','approveJust','teacherAbs','notices','payments','cards','reports'], false),
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
