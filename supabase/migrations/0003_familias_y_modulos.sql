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
