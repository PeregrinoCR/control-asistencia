-- INSTALACIÓN COMPLETA: pegar TODO este archivo en el SQL Editor de Supabase y presionar Run.
-- Borra lo que haya quedado a medias y crea todo de nuevo. Antes de correrlo, cambiar
-- [NOMBRE DEL COLEGIO], [NOMBRE DEL DIRECTOR(A)] y [CORREO] (al final del archivo).
-- ¡Ojo! Si el colegio ya tiene datos, NO use este archivo: corra solo las migraciones nuevas.

drop trigger if exists vincular_cuenta on auth.users;
drop view if exists asistencia_mes, asistencia_dia, docentes;
drop table if exists seguimientos, aviso_lecturas, avisos, gira_autorizaciones, giras, porton, salidas,
  bitacora, justificaciones, asistencia, horario, materias, carnes,
  estudiante_encargado, encargados, estudiantes, personal, roles, secciones, colegios cascade;
drop function if exists vincular_cuenta, solo_digitos, doy_leccion_en, mis_estudiantes, tiene_permiso, mi_colegio,
  soy_personal, crear_carne, nuevo_codigo_carne, reponer_carne cascade;

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
