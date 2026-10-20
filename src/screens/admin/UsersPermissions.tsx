import { useState, type FormEvent } from 'react';
import { Avatar, Badge, Button, Icon, InputField, Segmented, Switch } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import {
  PERMISSION_GROUPS,
  ROLES,
  SCOPED,
  SECTION_IDS,
  USERS,
  effectivePermissions,
  isSectionScoped,
  type PermissionId,
  type Role,
  type RoleId,
  type User,
} from '../../data/users';

type Tab = 'users' | 'roles';

/** Dirección · Usuarios y permisos */
export function UsersPermissions() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState(USERS);
  const [roles, setRoles] = useState(ROLES);

  return (
    <AdminLayout>
      <PageHeader
        kicker="Personal del colegio. Las familias y los estudiantes mayores de edad entran con su propia cuenta."
        title="Usuarios y permisos"
      />
      <Segmented
        label="Vista"
        mode="tabs"
        size="lg"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'users', label: `Usuarios · ${users.filter((u) => u.active).length}` },
          { value: 'roles', label: `Roles · ${roles.length}` },
        ]}
      />
      <div role="tabpanel">
        {tab === 'users' ? <UsersTab users={users} setUsers={setUsers} roles={roles} /> : <RolesTab roles={roles} setRoles={setRoles} users={users} />}
      </div>
    </AdminLayout>
  );
}

function UsersTab({ users, setUsers, roles }: { users: User[]; setUsers: (u: User[]) => void; roles: Role[] }) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | RoleId>('all');
  const [selectedId, setSelectedId] = useState<number | 'new'>(2);
  const [saved, setSaved] = useState(false);

  const list = users.filter(
    (u) => (roleFilter === 'all' || u.roles.includes(roleFilter)) && (u.name + u.contact).toLowerCase().includes(query.toLowerCase()),
  );
  const selected = selectedId === 'new' ? null : users.find((u) => u.id === selectedId) ?? users[0];

  const update = (u: User) => {
    setUsers(users.map((x) => (x.id === u.id ? u : x)));
    setSaved(false);
  };

  return (
    <div className="split">
      <section aria-label="Lista de usuarios" className="card split__main" style={{ padding: '14px 18px 18px', flexBasis: 560 }}>
        <div className="row wrap gap-10">
          <div className="search">
            <Icon name="search" size={18} />
            <label htmlFor="u-buscar" className="sr-only">
              Buscar usuario
            </label>
            <input id="u-buscar" type="search" className="input" placeholder="Buscar por nombre o correo" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label htmlFor="u-rol" className="sr-only">
            Filtrar por rol
          </label>
          <select id="u-rol" className="input" style={{ width: 'auto' }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | RoleId)}>
            <option value="all">Todos los roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => setSelectedId('new')} style={{ marginLeft: 'auto' }}>
            Invitar usuario
          </Button>
        </div>
        <div className="table-wrap">
          <table className="table table--compact" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Roles</th>
                <th>Sección</th>
                <th>Último acceso</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} aria-selected={u.id === selectedId} style={u.active ? undefined : { opacity: 0.6 }}>
                  <td>
                    <button type="button" className="row-button" onClick={() => setSelectedId(u.id)}>
                      <Avatar name={u.name.replace(/[^\p{L} ]/gu, '').trim()} size="sm" />
                      <span className="stack">
                        <span>{u.name}</span>
                        <span className="text-xs muted" style={{ fontWeight: 400 }}>
                          {u.contact}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="row wrap gap-4">
                      {u.active ? (
                        u.roles.map((r) => (
                          <Badge key={r} tone={r === 'dir' ? 'blue' : 'soft'}>
                            {roles.find((x) => x.id === r)!.name}
                          </Badge>
                        ))
                      ) : (
                        <Badge tone="neutral">Desactivado</Badge>
                      )}
                      {u.active && u.extra.length > 0 && <Badge tone="amber">+{u.extra.length} extra</Badge>}
                    </span>
                  </td>
                  <td>{u.section ?? '—'}</td>
                  <td className="text-sm muted">{u.lastSeen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <p className="text-sm muted" style={{ paddingTop: 12 }}>Ningún usuario coincide con la búsqueda.</p>}
      </section>

      {selected ? (
        <UserPanel key={selected.id} user={selected} roles={roles} onChange={update} saved={saved} onSave={() => setSaved(true)} />
      ) : (
        <InvitePanel
          roles={roles}
          onInvite={(u) => {
            const id = Math.max(...users.map((x) => x.id)) + 1;
            setUsers([...users, { ...u, id }]);
            setSelectedId(id);
          }}
          onCancel={() => setSelectedId(users[0].id)}
        />
      )}
    </div>
  );
}

function RoleChecks({ value, onChange, roles }: { value: RoleId[]; onChange: (r: RoleId[]) => void; roles: Role[] }) {
  return (
    <fieldset className="fieldset">
      <legend>Roles</legend>
      <div className="row wrap gap-8">
        {roles.map((r) => {
          const on = value.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              className="chip chip--square"
              aria-pressed={on}
              title={r.help}
              onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
            >
              <span className="chip__box">
                <Icon name="check" size={12} strokeWidth={3.2} />
              </span>
              {r.name}
            </button>
          );
        })}
      </div>
      <span className="text-xs muted" style={{ display: 'block', marginTop: 8 }}>
        Una persona puede tener varios roles, por ejemplo docente y profesor guía.
      </span>
    </fieldset>
  );
}

function SectionPicker({ value, onChange }: { value?: string; onChange: (s: string) => void }) {
  return (
    <div className="field" style={{ maxWidth: 220 }}>
      <label htmlFor="u-seccion" className="field__label">
        Sección a cargo (profesor guía)
      </label>
      <select id="u-seccion" className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Elegir sección
        </option>
        {SECTION_IDS.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

function UserPanel({ user, roles, onChange, saved, onSave }: { user: User; roles: Role[]; onChange: (u: User) => void; saved: boolean; onSave: () => void }) {
  const { fromRoles, all } = effectivePermissions(user, roles);
  const isGuide = user.roles.includes('gui');
  const noRoles = user.roles.length === 0;

  const toggleExtra = (p: PermissionId) =>
    onChange({ ...user, extra: user.extra.includes(p) ? user.extra.filter((x) => x !== p) : [...user.extra, p] });

  return (
    <aside aria-labelledby="ficha-u" className="card split__side gap-16" style={{ padding: 20, flexBasis: 380 }}>
      <div className="row gap-12">
        <Avatar name={user.name.replace(/[^\p{L} ]/gu, '').trim()} size="lg" tone="blue" />
        <div className="stack grow">
          <h2 id="ficha-u" className="display" style={{ fontSize: 20 }}>
            {user.name}
          </h2>
          <span className="text-sm muted">{user.contact}</span>
        </div>
      </div>

      <div className="setting-row" style={{ borderTop: 'none', paddingTop: 0 }}>
        <span className="stack grow">
          <span className="setting-row__label">Cuenta activa</span>
          <span className="setting-row__help">Si se desactiva no puede entrar, pero su historial se conserva.</span>
        </span>
        <Switch label="Cuenta activa" checked={user.active} onChange={(v) => onChange({ ...user, active: v })} />
      </div>

      <RoleChecks value={user.roles} roles={roles} onChange={(r) => onChange({ ...user, roles: r, section: r.includes('gui') ? user.section : undefined })} />
      {isGuide && <SectionPicker value={user.section} onChange={(s) => onChange({ ...user, section: s })} />}

      <div className="stack gap-8">
        <h3 className="eyebrow">Permisos</h3>
        <span className="text-xs muted">
          Los marcados "por rol" vienen de sus roles. Puede sumar permisos extra solo para esta persona.
        </span>
        {noRoles && (
          <span className="text-sm ink-orange" role="alert">
            Sin roles, esta persona solo tendrá los permisos extra.
          </span>
        )}
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.id} className="stack">
            <span className="text-xs strong muted" style={{ padding: '8px 0 2px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {g.label}
            </span>
            {g.permissions.map((p) => {
              const byRole = fromRoles.has(p.id);
              const has = all.has(p.id);
              const scoped = has && isGuide && byRole && isSectionScoped(user, p.id, roles);
              return (
                <label key={p.id} className="row gap-10" style={{ minHeight: 36, fontSize: 14, cursor: byRole ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    style={{ width: 18, height: 18, margin: 0 }}
                    checked={has}
                    disabled={byRole}
                    onChange={() => toggleExtra(p.id)}
                  />
                  <span className="grow" style={{ color: has ? 'var(--ink)' : 'var(--muted)' }}>
                    {p.label}
                  </span>
                  {byRole ? (
                    <Badge tone="soft">{scoped ? `Por rol · solo ${user.section ?? 'su sección'}` : 'Por rol'}</Badge>
                  ) : has ? (
                    <Badge tone="amber">Extra</Badge>
                  ) : null}
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="row wrap between gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
        {saved ? (
          <span role="status" className="text-sm strong ink-green">
            Cambios guardados
          </span>
        ) : (
          <span className="text-xs muted">{all.size} de {PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0)} permisos</span>
        )}
        <Button variant="primary" onClick={onSave} disabled={isGuide && !user.section}>
          Guardar cambios
        </Button>
      </div>
    </aside>
  );
}

function InvitePanel({ roles, onInvite, onCancel }: { roles: Role[]; onInvite: (u: Omit<User, 'id'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [userRoles, setUserRoles] = useState<RoleId[]>(['doc']);
  const [section, setSection] = useState<string | undefined>();
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) return setError('Escriba el nombre y un correo o teléfono para enviar la invitación.');
    if (userRoles.length === 0) return setError('Elija al menos un rol.');
    if (userRoles.includes('gui') && !section) return setError('Elija la sección a cargo del profesor guía.');
    onInvite({ name: name.trim(), contact: contact.trim(), roles: userRoles, section, extra: [], active: true, lastSeen: 'Invitación enviada' });
  };

  return (
    <aside aria-labelledby="inv-t" className="card split__side gap-16" style={{ padding: 20, flexBasis: 380 }}>
      <form className="stack gap-16" onSubmit={submit}>
        <h2 id="inv-t" className="title-section">
          Invitar usuario
        </h2>
        <InputField id="inv-nombre" label="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} />
        <InputField id="inv-contacto" label="Correo o teléfono" hint="recibe el enlace de acceso" value={contact} onChange={(e) => setContact(e.target.value)} />
        <RoleChecks value={userRoles} roles={roles} onChange={setUserRoles} />
        {userRoles.includes('gui') && <SectionPicker value={section} onChange={setSection} />}
        {error && (
          <span className="text-sm ink-orange" role="alert">
            {error}
          </span>
        )}
        <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="primary">
            Enviar invitación
          </Button>
        </div>
      </form>
    </aside>
  );
}

function RolesTab({ roles, setRoles, users }: { roles: Role[]; setRoles: (r: Role[]) => void; users: User[] }) {
  const toggle = (roleId: RoleId, p: PermissionId) =>
    setRoles(
      roles.map((r) =>
        r.id !== roleId ? r : { ...r, grants: r.grants.includes(p) ? r.grants.filter((x) => x !== p) : [...r.grants, p] },
      ),
    );
  const count = (id: RoleId) => users.filter((u) => u.active && u.roles.includes(id)).length;

  return (
    <section aria-labelledby="matriz-t" className="card gap-10">
      <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
        <h2 id="matriz-t" className="title-section">
          Qué puede hacer cada rol
        </h2>
        <span className="text-sm muted">
          Los cambios aplican a todas las personas con ese rol. Dirección siempre conserva "Gestionar usuarios".
        </span>
      </div>
      <div className="table-wrap">
        <table className="table table--dense" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th>Permiso</th>
              {roles.map((r) => (
                <th key={r.id} className="center">
                  <span className="stack">
                    <span>{r.name}</span>
                    <span className="text-xs" style={{ fontWeight: 400 }}>
                      {count(r.id)} {count(r.id) === 1 ? 'usuario' : 'usuarios'}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => [
              <tr key={g.id} data-tone="rest">
                <td colSpan={roles.length + 1} className="text-xs strong muted" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {g.label}
                </td>
              </tr>,
              ...g.permissions.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="stack">
                      <span className="strong">{p.label}</span>
                      <span className="text-xs muted">
                        {p.help}
                        {SCOPED.has(p.id) ? ' · el profesor guía solo en su sección' : ''}
                      </span>
                    </span>
                  </td>
                  {roles.map((r) => {
                    const on = r.grants.includes(p.id);
                    const locked = r.id === 'dir' && p.id === 'users';
                    return (
                      <td key={r.id} className="center">
                        <button
                          type="button"
                          role="checkbox"
                          className="perm-check"
                          aria-checked={on}
                          aria-label={`${r.name}: ${p.label}`}
                          disabled={locked}
                          onClick={() => toggle(r.id, p.id)}
                        >
                          <Icon name="check" size={16} strokeWidth={3} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}
