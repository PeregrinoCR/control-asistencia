-- Cuido de exámenes: horario de trabajo del personal, estudiantes con adecuación y rol de cuidos.
-- Se puede correr más de una vez.

-- Horario de trabajo de quien no da lecciones: { "dias": ["L","K",...], "desde": 1, "hasta": 6 } (lecciones).
alter table personal add column if not exists horario_trabajo jsonb;

-- Rol de personal de apoyo, sin permisos especiales.
insert into roles (id, nombre, permisos, limitado_a_seccion) values ('aux', 'Auxiliar', '{}', false)
on conflict (id) do nothing;

alter table estudiantes add column if not exists adecuacion boolean not null default false;

create table if not exists cuidos (
  id uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references colegios on delete cascade,
  fecha date not null,
  prueba_id text,                       -- id de la prueba en colegios.config.pruebas
  aula text not null,
  tipo text not null default 'aula' check (tipo in ('aula', 'adecuacion')),
  nivel text,                           -- '7', '8'… para aulas de adecuación
  detalle text,                         -- secciones y materia, para el rol impreso
  desde smallint not null,
  hasta smallint not null,
  persona_id uuid references personal on delete set null,   -- null = sin cuidador
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado')),
  creado timestamptz not null default now()
);
create index if not exists cuidos_fecha on cuidos (colegio_id, fecha);

alter table cuidos enable row level security;
drop policy if exists ver on cuidos;
drop policy if exists editar on cuidos;
-- Lo ve el personal del colegio (cada docente, al menos, sus cuidos publicados).
create policy ver on cuidos for select using (
  colegio_id = mi_colegio() and (
    tiene_permiso('assign') or tiene_permiso('settings')
    or (estado = 'publicado' and soy_personal())));
create policy editar on cuidos for all using (colegio_id = mi_colegio() and (tiene_permiso('assign') or tiene_permiso('settings')));

-- Al publicar, se avisa a la persona asignada.
create or replace function avisar_cuido() returns trigger language plpgsql security definer set search_path = public as $$
declare p personal;
begin
  if new.estado <> 'publicado' or new.persona_id is null
     or (tg_op = 'UPDATE' and old.estado = 'publicado' and old.persona_id is not distinct from new.persona_id) then
    return new;
  end if;
  select * into p from personal where id = new.persona_id;
  perform encolar(new.colegio_id, p.usuario_id, p.telefono, 'cuido',
    'Cuido de examen: ' || to_char(new.fecha, 'DD/MM'),
    new.aula || ', ' || new.desde || '.ª a ' || new.hasta || '.ª lección' ||
      coalesce(' · ' || new.detalle, '') ||
      case when new.tipo = 'adecuacion' then ' (estudiantes con adecuación)' else '' end || '.',
    '/docente/pase-de-lista', false);
  return new;
end
$$;
drop trigger if exists avisar_cuido on cuidos;
create trigger avisar_cuido after insert or update of estado, persona_id on cuidos
  for each row execute function avisar_cuido();
