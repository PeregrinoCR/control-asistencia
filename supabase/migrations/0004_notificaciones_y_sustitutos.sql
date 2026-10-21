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
