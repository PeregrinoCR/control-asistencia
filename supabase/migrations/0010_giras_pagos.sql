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
