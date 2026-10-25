-- Usuarios y permisos: roles editables por colegio, historial de cambios, último ingreso y fecha de invitación.
-- Corre sobre una base con 0001–0020. Es seguro correrla dos veces.

-- ---------- Fecha de invitación ----------
alter table personal add column if not exists creado timestamptz not null default now();

-- ---------- Roles editables por colegio ----------
-- La tabla `roles` trae lo de fábrica (igual para todos los colegios). Aquí el colegio guarda los permisos
-- que cambió de un rol; si no hay fila, vale lo de fábrica. El alcance por sección del profesor guía no se cambia.
create table if not exists roles_colegio (
  colegio_id uuid not null references colegios on delete cascade,
  rol_id text not null references roles on delete cascade,
  permisos text[] not null,
  actualizado timestamptz not null default now(),
  primary key (colegio_id, rol_id)
);
alter table roles_colegio enable row level security;

create or replace function soy_direccion() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from personal p where p.usuario_id = auth.uid() and p.activo and 'dir' = any (p.roles))
$$;

drop policy if exists ver on roles_colegio;
drop policy if exists escribir on roles_colegio;
create policy ver on roles_colegio for select using (colegio_id = mi_colegio());
-- Solo Dirección cambia lo que hace cada rol.
create policy escribir on roles_colegio for all
  using (colegio_id = mi_colegio() and soy_direccion())
  with check (colegio_id = mi_colegio() and soy_direccion());

create or replace function tocar_rol_colegio() returns trigger language plpgsql as $$
begin
  new.actualizado := now();
  return new;
end
$$;
drop trigger if exists tocar_rol_colegio on roles_colegio;
create trigger tocar_rol_colegio before insert or update on roles_colegio for each row execute function tocar_rol_colegio();

-- Los permisos de una persona: los de sus roles (con los cambios del colegio) más los extra.
-- Dirección siempre conserva "users" y "settings", para que nadie se quede sin poder arreglar los permisos.
create or replace function tiene_permiso(perm text, seccion uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal p
    where p.usuario_id = auth.uid() and p.activo and (
      ('dir' = any (p.roles) and perm in ('users', 'settings'))
      or (perm = any (p.permisos_extra)
        and (not ('gui' = any (p.roles))
             or (perm = any (array['viewAttendance','approveJust','earlyWarning'])
                 and seccion is not null and seccion = p.seccion_guia)))
      or exists (
        select 1 from roles r
        left join roles_colegio rc on rc.rol_id = r.id and rc.colegio_id = p.colegio_id
        where r.id = any (p.roles) and perm = any (coalesce(rc.permisos, r.permisos))
          and (not r.limitado_a_seccion or (seccion is not null and seccion = p.seccion_guia))
      )
    )
  )
$$;

-- ---------- Solo Dirección da el rol Dirección o los permisos de usuarios y configuración ----------
create or replace function proteger_personal() returns trigger language plpgsql security definer set search_path = public as $$
declare
  nuevos text[];
  viejos text[] := '{}';
begin
  -- Sin sesión (migraciones, vincular cuentas) o Dirección: sin restricción.
  if auth.uid() is null or soy_direccion() then return new; end if;
  select coalesce(array_agg(x order by x), '{}') into nuevos from unnest(new.permisos_extra) x where x in ('users', 'settings');
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(x order by x), '{}') into viejos from unnest(old.permisos_extra) x where x in ('users', 'settings');
  end if;
  if nuevos is distinct from viejos
     or ('dir' = any (new.roles)) is distinct from (tg_op = 'UPDATE' and 'dir' = any (old.roles)) then
    raise exception 'Solo Dirección puede dar el rol Dirección o los permisos de usuarios y de configuración.';
  end if;
  return new;
end
$$;
drop trigger if exists proteger_personal on personal;
create trigger proteger_personal before insert or update on personal for each row execute function proteger_personal();

-- ---------- Historial de cambios (en la bitácora) ----------
create or replace function registrar_cambio_personal() returns trigger language plpgsql security definer set search_path = public as $$
declare
  sec_antes text;
  sec_despues text;
begin
  if tg_op = 'INSERT' then
    insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (new.colegio_id, auth.uid(), 'personal.crear',
      jsonb_build_object('personal_id', new.id, 'nombre', new.nombre, 'roles', new.roles, 'extra', new.permisos_extra));
  elsif tg_op = 'DELETE' then
    insert into bitacora (colegio_id, usuario_id, accion, detalle)
    values (old.colegio_id, auth.uid(), 'personal.quitar', jsonb_build_object('personal_id', old.id, 'nombre', old.nombre));
    return old;
  else
    if new.roles is distinct from old.roles or new.permisos_extra is distinct from old.permisos_extra
       or new.activo is distinct from old.activo or new.seccion_guia is distinct from old.seccion_guia
       or new.nombre is distinct from old.nombre then
      select nombre into sec_antes from secciones where id = old.seccion_guia;
      select nombre into sec_despues from secciones where id = new.seccion_guia;
      insert into bitacora (colegio_id, usuario_id, accion, detalle)
      values (new.colegio_id, auth.uid(), 'personal.cambio', jsonb_build_object(
        'personal_id', new.id, 'nombre', new.nombre,
        'antes', jsonb_build_object('nombre', old.nombre, 'roles', old.roles, 'extra', old.permisos_extra, 'activo', old.activo, 'seccion', sec_antes),
        'despues', jsonb_build_object('nombre', new.nombre, 'roles', new.roles, 'extra', new.permisos_extra, 'activo', new.activo, 'seccion', sec_despues)));
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists registrar_cambio_personal on personal;
create trigger registrar_cambio_personal after insert or update or delete on personal for each row execute function registrar_cambio_personal();

create or replace function registrar_cambio_rol() returns trigger language plpgsql security definer set search_path = public as $$
declare
  rol text := coalesce(new.rol_id, old.rol_id);
  col uuid := coalesce(new.colegio_id, old.colegio_id);
  antes text[] := coalesce(old.permisos, (select permisos from roles where id = coalesce(new.rol_id, old.rol_id)));
  despues text[] := coalesce(new.permisos, (select permisos from roles where id = coalesce(new.rol_id, old.rol_id)));
begin
  insert into bitacora (colegio_id, usuario_id, accion, detalle)
  values (col, auth.uid(), 'rol.cambio', jsonb_build_object('rol_id', rol, 'antes', to_jsonb(antes), 'despues', to_jsonb(despues)));
  return coalesce(new, old);
end
$$;
drop trigger if exists registrar_cambio_rol on roles_colegio;
create trigger registrar_cambio_rol after insert or update or delete on roles_colegio for each row execute function registrar_cambio_rol();

-- Historial de una persona (o de todo el personal con `persona` vacío), del más nuevo al más viejo.
create or replace function historial_personal(persona uuid default null, limite int default 60)
returns table (cuando timestamptz, quien text, accion text, detalle jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_permiso('users') then raise exception 'Sin permiso para ver el historial.'; end if;
  return query
    select b.cuando, p.nombre, b.accion, b.detalle
    from bitacora b
    left join personal p on p.usuario_id = b.usuario_id and p.colegio_id = b.colegio_id
    where b.colegio_id = mi_colegio()
      and (b.accion like 'personal.%' or b.accion like 'rol.%')
      and (persona is null or b.detalle->>'personal_id' = persona::text)
    order by b.cuando desc
    limit least(coalesce(limite, 60), 200);
end
$$;

-- ---------- Último ingreso de cada persona del personal ----------
create or replace function ultimo_acceso()
returns table (personal_id uuid, ultimo timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_permiso('users') then raise exception 'Sin permiso para ver los ingresos.'; end if;
  return query
    select p.id, u.last_sign_in_at
    from personal p join auth.users u on u.id = p.usuario_id
    where p.colegio_id = mi_colegio();
end
$$;
