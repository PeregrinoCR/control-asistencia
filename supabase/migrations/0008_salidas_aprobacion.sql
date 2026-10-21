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
