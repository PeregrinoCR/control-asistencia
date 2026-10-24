-- Avisos a familias: borradores, programados, retirados, lectura por familia y reenvío a quien no lo abrió.
-- Corre sobre una base con 0001–0017. Es seguro correrla dos veces.

-- ---------- Estados del aviso ----------
alter table avisos add column if not exists estado text not null default 'enviado'
  check (estado in ('borrador', 'programado', 'enviado', 'retirado'));
alter table avisos add column if not exists programado_para timestamptz;
alter table avisos add column if not exists retirado timestamptz;
alter table avisos add column if not exists motivo_retiro text;
alter table avisos add column if not exists reenvios int not null default 0;
alter table avisos add column if not exists ultimo_reenvio timestamptz;
alter table avisos add column if not exists creado timestamptz not null default now();

-- "enviado" solo tiene fecha cuando el aviso salió de verdad.
alter table avisos alter column enviado drop not null;
alter table avisos alter column enviado drop default;
create index if not exists avisos_estado on avisos (colegio_id, estado, programado_para);

create or replace function fijar_aviso() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.estado in ('enviado', 'retirado') then
    -- Un aviso que ya salió no se edita: solo se retira o se reenvía.
    if new.titulo is distinct from old.titulo or new.cuerpo is distinct from old.cuerpo
       or new.tipo is distinct from old.tipo or new.destino is distinct from old.destino
       or new.secciones is distinct from old.secciones then
      raise exception 'Un aviso enviado no se puede editar. Retírelo y envíe uno corregido.';
    end if;
    if old.estado = 'retirado' and new.estado <> 'retirado' then
      raise exception 'Un aviso retirado no se puede volver a enviar. Copie el texto en uno nuevo.';
    end if;
    if new.estado not in ('enviado', 'retirado') then
      raise exception 'Un aviso enviado no vuelve a borrador.';
    end if;
  end if;
  if new.estado = 'enviado' and new.enviado is null then new.enviado := now(); end if;
  if new.estado = 'retirado' and new.retirado is null then new.retirado := now(); end if;
  if new.estado = 'programado' and (new.programado_para is null or new.programado_para <= now() - interval '1 minute') then
    raise exception 'Elija una fecha y hora futuras para programar el aviso.';
  end if;
  if new.estado = 'programado' and new.tipo in ('urg', 'sus') then
    raise exception 'Los avisos urgentes y de suspensión salen de inmediato; no se programan.';
  end if;
  return new;
end
$$;
drop trigger if exists fijar_aviso on avisos;
create trigger fijar_aviso before insert or update on avisos for each row execute function fijar_aviso();

-- ---------- Quién recibe un aviso ----------
create or replace function destinatarios_aviso(a avisos)
returns table (usuario_id uuid, telefono text, nombre text, detalle text)
language sql stable security definer set search_path = public as $$
  select x.usuario_id, x.telefono, x.nombre, string_agg(distinct x.detalle, ', ')
  from (
    select g.usuario_id, g.telefono, g.nombre,
      'de ' || split_part(e.nombre, ' ', 1) || coalesce(' (' || s.nombre || ')', '') as detalle
    from encargados g
      join estudiante_encargado ee on ee.encargado_id = g.id
      join estudiantes e on e.id = ee.estudiante_id and e.activo
      left join secciones s on s.id = e.seccion_id
    where g.colegio_id = a.colegio_id and a.destino in ('all', 'enc', 'sec')
      and (a.destino <> 'sec' or e.seccion_id = any (a.secciones))
      and (e.nacimiento is null or e.nacimiento > cr_hoy() - interval '18 years')
    union all
    select e.usuario_id, e.telefono, e.nombre, 'estudiante' || coalesce(' (' || s.nombre || ')', '')
    from estudiantes e left join secciones s on s.id = e.seccion_id
    where e.colegio_id = a.colegio_id and e.activo and a.destino in ('all', 'adu', 'sec')
      and e.nacimiento <= cr_hoy() - interval '18 years'
      and (a.destino <> 'sec' or e.seccion_id = any (a.secciones))
    union all
    select p.usuario_id, p.telefono, p.nombre, 'personal'
    from personal p
    where p.colegio_id = a.colegio_id and p.activo and a.destino = 'doc'
  ) x
  group by x.usuario_id, x.telefono, x.nombre
$$;

-- ---------- La cola de notificaciones recuerda de qué aviso viene ----------
alter table notificaciones add column if not exists aviso_id uuid references avisos on delete cascade;

drop function if exists encolar(uuid, uuid, text, text, text, text, text, boolean);
create or replace function encolar(colegio uuid, usuario uuid, tel text, tipo_ text, titulo_ text, cuerpo_ text, url_ text, urgente_ boolean, aviso_ uuid default null)
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
  insert into notificaciones (colegio_id, usuario_id, telefono, tipo, urgente, titulo, cuerpo, url, aviso_id, push_estado, sms_estado)
  values (colegio, usuario, nullif(tel, ''), tipo_, urgente_, titulo_, cuerpo_, coalesce(url_, '/familia'), aviso_,
    case when usuario is null then 'sin_cuenta' else 'pendiente' end,
    case when con_sms then 'pendiente' else 'no' end);
end
$$;

-- ---------- Disparador: al enviarse un aviso (nuevo o programado que llega a su hora) ----------
create or replace function avisar_aviso() returns trigger language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if new.estado <> 'enviado' then return new; end if;
  if tg_op = 'UPDATE' and old.estado = 'enviado' then return new; end if;
  for d in select * from destinatarios_aviso(new) loop
    perform encolar(new.colegio_id, d.usuario_id, d.telefono, 'aviso', new.titulo, new.cuerpo, '/familia', new.tipo in ('urg', 'sus'), new.id);
  end loop;
  return new;
end
$$;
drop trigger if exists avisar_aviso on avisos;
create trigger avisar_aviso after insert or update of estado on avisos for each row execute function avisar_aviso();

-- Al retirar un aviso, lo que aún no salió de la cola ya no sale.
create or replace function retirar_cola_aviso() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'retirado' and old.estado <> 'retirado' then
    update notificaciones set push_estado = 'retirado' where aviso_id = new.id and push_estado = 'pendiente';
    update notificaciones set sms_estado = 'no' where aviso_id = new.id and sms_estado = 'pendiente' and push_estado = 'retirado';
  end if;
  return new;
end
$$;
drop trigger if exists retirar_cola_aviso on avisos;
create trigger retirar_cola_aviso after update of estado on avisos for each row execute function retirar_cola_aviso();

-- ---------- Permisos ----------
drop policy if exists ver on avisos;
drop policy if exists cambiar on avisos;
drop policy if exists quitar on avisos;
-- Las familias y el resto del personal solo ven avisos enviados; quien envía avisos ve todos.
create policy ver on avisos for select using (
  colegio_id = mi_colegio()
  and (destino <> 'doc' or soy_personal())
  and (estado = 'enviado' or tiene_permiso('notices')));
create policy cambiar on avisos for update using (colegio_id = mi_colegio() and tiene_permiso('notices'));
create policy quitar on avisos for delete using (colegio_id = mi_colegio() and tiene_permiso('notices') and estado in ('borrador', 'programado'));

-- ---------- Publicar los programados cuando llega su hora ----------
create or replace function publicar_avisos_programados() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update avisos set estado = 'enviado', enviado = now() where estado = 'programado' and programado_para <= now();
  get diagnostics n = row_count;
  return n;
end
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'publicar-avisos';
    perform cron.schedule('publicar-avisos', '* * * * *', 'select publicar_avisos_programados()');
  end if;
end
$$;

-- ---------- Lectura por aviso ----------
-- Totales de varios avisos a la vez: cuántas personas lo reciben y cuántas ya lo abrieron.
create or replace function lectura_avisos(ids uuid[])
returns table (aviso_id uuid, total int, leidos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_permiso('notices') then raise exception 'Sin permiso para ver la lectura de avisos.'; end if;
  return query
    select a.id, count(d.*)::int,
      count(*) filter (where exists (select 1 from aviso_lecturas l where l.aviso_id = a.id and l.usuario_id = d.usuario_id))::int
    from avisos a, lateral destinatarios_aviso(a) d
    where a.id = any (ids) and a.colegio_id = mi_colegio() and a.estado in ('enviado', 'retirado')
    group by a.id;
end
$$;

-- Quién no ha abierto un aviso (con teléfono para llamar o mandar SMS).
create or replace function pendientes_aviso(aviso uuid)
returns table (nombre text, detalle text, telefono text, con_app boolean)
language plpgsql stable security definer set search_path = public as $$
declare a avisos;
begin
  if not tiene_permiso('notices') then raise exception 'Sin permiso para ver la lectura de avisos.'; end if;
  select * into a from avisos where id = aviso and colegio_id = mi_colegio();
  if not found then return; end if;
  return query
    select d.nombre, d.detalle, d.telefono, d.usuario_id is not null
    from destinatarios_aviso(a) d
    where not exists (select 1 from aviso_lecturas l where l.aviso_id = a.id and l.usuario_id = d.usuario_id)
    order by d.nombre;
end
$$;

-- Reenvía el aviso solo a quien no lo ha abierto. Máximo una vez por hora.
create or replace function reenviar_aviso(aviso uuid) returns int language plpgsql security definer set search_path = public as $$
declare a avisos; d record; n int := 0;
begin
  if not tiene_permiso('notices') then raise exception 'Sin permiso para reenviar avisos.'; end if;
  select * into a from avisos where id = aviso and colegio_id = mi_colegio();
  if not found or a.estado <> 'enviado' then raise exception 'Solo se pueden reenviar avisos enviados.'; end if;
  if a.ultimo_reenvio is not null and a.ultimo_reenvio > now() - interval '1 hour' then
    raise exception 'Ya se reenvió hace menos de una hora. Espere un poco para no saturar a las familias.';
  end if;
  for d in
    select * from destinatarios_aviso(a) x
    where not exists (select 1 from aviso_lecturas l where l.aviso_id = a.id and l.usuario_id = x.usuario_id)
  loop
    perform encolar(a.colegio_id, d.usuario_id, d.telefono, 'aviso', 'Recordatorio: ' || a.titulo, a.cuerpo, '/familia', a.tipo in ('urg', 'sus'), a.id);
    n := n + 1;
  end loop;
  update avisos set reenvios = reenvios + 1, ultimo_reenvio = now() where id = a.id;
  return n;
end
$$;
