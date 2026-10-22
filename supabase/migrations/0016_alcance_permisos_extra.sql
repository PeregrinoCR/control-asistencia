-- Alcance de los permisos extra:
-- 1. Un profesor guía con un permiso extra de asistencia, justificaciones o alerta temprana lo usa solo
--    en su sección. Giras y avisos no se consultan por sección: para un guía el extra no tiene efecto.
-- 2. Solo Dirección y Administrativos ven la lista completa del personal (aunque tengan otro permiso).
-- Se puede correr más de una vez.

create or replace function tiene_permiso(perm text, seccion uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal p
    where p.usuario_id = auth.uid() and p.activo and (
      (perm = any (p.permisos_extra)
        and (not ('gui' = any (p.roles))
             or (perm = any (array['viewAttendance','approveJust','earlyWarning'])
                 and seccion is not null and seccion = p.seccion_guia)))
      or exists (
        select 1 from roles r
        where r.id = any (p.roles) and perm = any (r.permisos)
          and (not r.limitado_a_seccion or (seccion is not null and seccion = p.seccion_guia))
      )
    )
  )
$$;

create or replace function es_direccion_o_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from personal p
    where p.usuario_id = auth.uid() and p.activo and p.roles && array['dir','adm']
  )
$$;

drop policy if exists ver on personal;
create policy ver on personal for select
  using (colegio_id = mi_colegio() and (
    usuario_id = auth.uid() or tiene_permiso('users') or (tiene_permiso('teacherAbs') and es_direccion_o_admin())));
