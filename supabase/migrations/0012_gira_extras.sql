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
