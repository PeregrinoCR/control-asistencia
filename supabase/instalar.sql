-- INSTALACIÓN COMPLETA: pegar TODO este archivo en el SQL Editor de Supabase y presionar Run.
-- Borra lo que haya quedado a medias y crea todo de nuevo. Antes de correrlo, cambiar
-- [NOMBRE DEL COLEGIO], [NOMBRE DEL DIRECTOR(A)] y [CORREO] (al final del archivo).

drop trigger if exists vincular_cuenta on auth.users;
drop table if exists bitacora, justificaciones, asistencia, horario, materias, carnes,
  estudiante_encargado, encargados, estudiantes, personal, roles, secciones, colegios cascade;
drop function if exists vincular_cuenta, solo_digitos, doy_leccion_en, mis_estudiantes, tiene_permiso, mi_colegio cascade;

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
