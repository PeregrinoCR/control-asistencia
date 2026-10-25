import { useEffect, useState, type FormEvent } from 'react';
import { Avatar, Badge, Button, Icon, InputField, Segmented, Switch, useToast } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { LESSONS } from '../../lib/schedule';
import { useAuth } from '../../lib/auth';
import { routes } from '../../routes';
import { daysSince, describeChange, useStaff, whenLabel, type HistoryEntry } from '../../lib/staff';
import {
  PERMISSION_GROUPS,
  PERMISSION_LABEL,
  ROLES,
  GUIDE_EXTRA_SECTION,
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

type Tab = 'users' | 'roles' | 'history';

/** Dirección · Usuarios y permisos */
export function UsersPermissions() {
  const [tab, setTab] = useState<Tab>('users');
  const staff = useStaff();
  const [users, setUsers] = useState(USERS);
  const [localRoles, setLocalRoles] = useState(ROLES);
  const roles = staff.live ? staff.roles : localRoles;

  // With a server, the list comes from the school's real staff.
  useEffect(() => {
    if (staff.users) setUsers(staff.users);
  }, [staff.users]);

  const loading = staff.live && !staff.users;

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
          { value: 'users', label: `Personas · ${users.filter((u) => u.active).length}` },
          { value: 'roles', label: 'Qué puede hacer cada rol' },
          { value: 'history', label: 'Historial de cambios' },
        ]}
      />
      <div role="tabpanel">
        {staff.error ? (
          <p className="notice" role="alert">
            No se pudo cargar el personal: {staff.error}
          </p>
        ) : loading ? (
          <p className="text-sm muted">Cargando…</p>
        ) : staff.live && users.length === 0 ? (
          <p className="text-sm muted">Todavía no hay personal registrado para su colegio.</p>
        ) : tab === 'users' ? (
          <UsersTab users={users} setUsers={setUsers} roles={roles} staff={staff} />
        ) : tab === 'roles' ? (
          <RolesTab roles={roles} users={users} staff={staff} setLocalRoles={setLocalRoles} />
        ) : (
          <HistoryTab staff={staff} />
        )}
      </div>
    </AdminLayout>
  );
}

type Staff = ReturnType<typeof useStaff>;

type StatusFilter = 'all' | 'nocuenta' | 'off';
type FichaTab = 'permisos' | 'invitacion' | 'historial';

/** Account state of a person: whether they can sign in, are still invited or were switched off. */
function statusOf(u: User): { label: string; tone: 'green' | 'amber' | 'neutral' } {
  if (!u.active) return { label: 'Desactivada', tone: 'neutral' };
  if (u.account === false) return { label: 'Invitada, sin cuenta', tone: 'amber' };
  return { label: 'Con cuenta', tone: 'green' };
}

function UsersTab({ users, setUsers, roles, staff }: { users: User[]; setUsers: (u: User[]) => void; roles: Role[]; staff: Staff }) {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | RoleId>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<User['id'] | 'new'>(staff.live ? (users[0]?.id ?? 'new') : 2);
  const [fichaTab, setFichaTab] = useState<FichaTab>('permisos');
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // What is saved for each person, to know which edits are still pending.
  const [snapshot, setSnapshot] = useState<Map<User['id'], User>>(() => new Map(users.map((u) => [u.id, u])));
  useEffect(() => {
    if (staff.users) setSnapshot(new Map(staff.users.map((u) => [u.id, u])));
  }, [staff.users]);
  const sections = staff.live ? staff.sections : SECTION_IDS;
  const noAccount = users.filter((u) => u.active && u.account === false).length;

  const list = users.filter(
    (u) =>
      (roleFilter === 'all' || u.roles.includes(roleFilter)) &&
      (statusFilter === 'all' || (statusFilter === 'off' ? !u.active : u.active && u.account === false)) &&
      (u.name + u.contact).toLowerCase().includes(query.toLowerCase()),
  );
  const selected = selectedId === 'new' ? null : users.find((u) => u.id === selectedId) ?? users[0];

  const pick = (id: User['id']) => {
    setSelectedId(id);
    setFichaTab('permisos');
    setSaved(false);
    setSaveError('');
  };

  const update = (u: User) => {
    setUsers(users.map((x) => (x.id === u.id ? u : x)));
    setSaved(false);
    setSaveError('');
  };

  const save = async () => {
    if (!selected) return;
    if (!staff.live) {
      setSnapshot(new Map(snapshot).set(selected.id, selected));
      setSaved(true);
      return toast('Cambios guardados');
    }
    const error = await staff.save(selected);
    setSaveError(error);
    setSaved(!error);
    if (!error) toast('Cambios guardados');
  };

  const pending = (u: User) => {
    const was = snapshot.get(u.id);
    const key = (x: User) => JSON.stringify([x.name, x.roles, x.section ?? '', x.extra, x.active, x.work ?? null]);
    return !!was && key(was) !== key(u);
  };

  // Removes the selected person from the staff; the list falls back to the first remaining one.
  const remove = async () => {
    if (!selected) return;
    const error = await staff.remove(String(selected.id));
    setSaveError(error);
    if (!error) pick(users.find((u) => u.id !== selected.id)?.id ?? 'new');
  };

  return (
    <div className="split">
      <section aria-label="Lista de personas" className="card split__side gap-10" style={{ padding: 12, flexBasis: 340 }}>
        <div className="row gap-8">
          <div className="search grow">
            <Icon name="search" size={18} />
            <label htmlFor="u-buscar" className="sr-only">
              Buscar persona
            </label>
            <input id="u-buscar" type="search" className="input" placeholder="Buscar persona" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button variant="primary" onClick={() => { setSelectedId('new'); setSaveError(''); }}>
            Invitar
          </Button>
        </div>
        <div className="row wrap gap-6">
          <button type="button" className="chip chip--sm" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
            Todas
          </button>
          <button type="button" className="chip chip--sm" aria-pressed={statusFilter === 'nocuenta'} onClick={() => setStatusFilter('nocuenta')}>
            Sin cuenta · {noAccount}
          </button>
          <button type="button" className="chip chip--sm" aria-pressed={statusFilter === 'off'} onClick={() => setStatusFilter('off')}>
            Desactivadas
          </button>
          <label htmlFor="u-rol" className="sr-only">
            Filtrar por rol
          </label>
          <select id="u-rol" className="input" style={{ width: 'auto', height: 32, fontSize: 13 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | RoleId)}>
            <option value="all">Todos los roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="stack gap-4" role="list">
          {list.map((u) => {
            const st = statusOf(u);
            return (
              <button
                key={u.id}
                type="button"
                role="listitem"
                aria-current={u.id === selectedId}
                className="row-button"
                style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: u.id === selectedId ? '1px solid var(--blue)' : '1px solid transparent', background: u.id === selectedId ? 'var(--blue-bg)' : undefined, opacity: u.active ? 1 : 0.7 }}
                onClick={() => pick(u.id)}
              >
                <Avatar name={u.name.replace(/[^\p{L} ]/gu, '').trim()} size="sm" />
                <span className="stack grow" style={{ minWidth: 0 }}>
                  <span className="row gap-6" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="strong">{u.name}</span>
                    {st.tone !== 'green' && <Badge tone={st.tone}>{st.label}</Badge>}
                  </span>
                  <span className="text-xs muted" style={{ fontWeight: 400 }}>
                    {u.roles.map((r) => roles.find((x) => x.id === r)?.name).filter(Boolean).join(' · ') || 'Sin roles'}
                    {u.section ? ` ${u.section}` : ''} · {u.lastSeen}
                  </span>
                </span>
              </button>
            );
          })}
          {list.length === 0 && <p className="text-sm muted" style={{ padding: 8 }}>Nadie coincide con la búsqueda.</p>}
        </div>
      </section>

      {selected ? (
        <UserPanel
          key={selected.id}
          user={selected}
          roles={roles}
          sections={sections}
          schoolName={staff.school?.nombre ?? '[NOMBRE DEL COLEGIO]'}
          live={staff.live}
          loadHistory={staff.history}
          tab={fichaTab}
          setTab={setFichaTab}
          onChange={update}
          saved={saved}
          error={saveError}
          onSave={save}
          dirty={pending(selected)}
          onDiscard={() => {
            const was = snapshot.get(selected.id);
            if (was) update(was);
          }}
          onRemove={staff.live && selected.contact.toLowerCase() !== session?.user.email?.toLowerCase() ? remove : undefined}
        />
      ) : (
        <InvitePanel
          roles={roles}
          sections={sections}
          onInvite={async (u) => {
            if (staff.live) {
              const { id, error } = await staff.invite(u);
              if (id) {
                setSelectedId(id);
                setFichaTab('invitacion');
              }
              return error;
            }
            const id = Math.max(...users.map((x) => Number(x.id))) + 1;
            setUsers([...users, { ...u, id }]);
            setSelectedId(id);
            setFichaTab('invitacion');
            return '';
          }}
          onCancel={() => pick(users[0]?.id ?? 'new')}
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
        Una persona puede tener varios roles, por ejemplo docente y docente guía.
      </span>
    </fieldset>
  );
}

function SectionPicker({ value, onChange, sections }: { value?: string; onChange: (s: string) => void; sections: string[] }) {
  return (
    <div className="field" style={{ maxWidth: 220 }}>
      <label htmlFor="u-seccion" className="field__label">
        Sección a cargo (docente guía)
      </label>
      <select id="u-seccion" className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Elegir sección
        </option>
        {sections.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

interface UserPanelProps {
  user: User;
  roles: Role[];
  sections: string[];
  schoolName: string;
  live: boolean;
  loadHistory: (id?: string) => Promise<HistoryEntry[] | null>;
  tab: FichaTab;
  setTab: (t: FichaTab) => void;
  onChange: (u: User) => void;
  saved: boolean;
  error: string;
  onSave: () => void;
  /** The person has changes that are not saved yet, and how to drop them. */
  dirty: boolean;
  onDiscard: () => void;
}

const WEEK = [
  ['L', 'Lun'],
  ['K', 'Mar'],
  ['M', 'Mié'],
  ['J', 'Jue'],
  ['V', 'Vie'],
] as const;

/** Working hours of staff who don't teach, in lessons; used to assign exam care. */
function WorkHours({ value, onChange }: { value?: User['work']; onChange: (w: User['work']) => void }) {
  const w = value ?? { dias: ['L', 'K', 'M', 'J', 'V'], desde: 1, hasta: LESSONS.length };
  return (
    <fieldset className="fieldset">
      <legend>Horario de trabajo</legend>
      <div className="row wrap gap-6">
        {WEEK.map(([id, label]) => {
          const on = w.dias.includes(id);
          return (
            <button key={id} type="button" className="chip chip--sm" aria-pressed={on} onClick={() => onChange({ ...w, dias: on ? w.dias.filter((d) => d !== id) : [...w.dias, id] })}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid-2" style={{ marginTop: 8 }}>
        {(['desde', 'hasta'] as const).map((k) => (
          <div key={k} className="field">
            <label htmlFor={`w-${k}`} className="field__label">
              {k === 'desde' ? 'Desde' : 'Hasta'}
            </label>
            <select id={`w-${k}`} className="input" value={w[k]} onChange={(e) => onChange({ ...w, [k]: Number(e.target.value) })}>
              {LESSONS.map((l) => (
                <option key={l.n} value={l.n}>
                  {k === 'desde' ? l.start : l.end} ({l.n}.ª)
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <span className="text-xs muted" style={{ display: 'block', marginTop: 6 }}>
        {value ? 'Se usa para proponer el cuido de exámenes.' : 'Sin dato: se toma toda la jornada. Cambie algo y guarde para fijarlo.'}
      </span>
    </fieldset>
  );
}

/** The text a person receives to create their account; Dirección pastes it into WhatsApp or an email. */
function inviteText(u: User, roles: Role[], schoolName: string) {
  const first = u.name.replace(/[^\p{L} ]/gu, '').trim() || 'hola';
  const isPhone = /^[\d\s+-]+$/.test(u.contact);
  const names = u.roles.map((r) => roles.find((x) => x.id === r)?.name).filter(Boolean).join(' y ');
  return `Hola ${first}, ${schoolName} le invita a usar la app de asistencia.\n\n1. Entre a ${window.location.origin}${routes.login}\n2. Cree su cuenta con este mismo ${isPhone ? 'número de teléfono' : 'correo'}: ${u.contact}\n\nAl entrar verá lo que le corresponde${names ? ` como ${names}` : ''}.`;
}

function UserPanel({ user, roles, sections, schoolName, live, loadHistory, tab, setTab, onChange, saved, error, onSave, dirty, onDiscard, onRemove }: UserPanelProps & { onRemove?: () => void }) {
  const { fromRoles, all } = effectivePermissions(user, roles);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const toast = useToast();
  const isGuide = user.roles.includes('gui');
  const noRoles = user.roles.length === 0;
  // Extra permissions of a guide teacher: some apply to their section only, the rest do nothing for them.
  const guideExtras = isGuide ? user.extra.filter((p) => SCOPED.has(p)) : [];
  const dead = guideExtras.filter((p) => !GUIDE_EXTRA_SECTION.has(p));
  const staffBlind = user.extra.includes('teacherAbs') && !user.roles.some((r) => r === 'dir' || r === 'adm');
  const st = statusOf(user);
  const text = inviteText(user, roles, schoolName);

  const toggleExtra = (p: PermissionId) =>
    onChange({ ...user, extra: user.extra.includes(p) ? user.extra.filter((x) => x !== p) : [...user.extra, p] });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Invitación copiada. Péguela en WhatsApp o en un correo.');
    } catch {
      toast('No se pudo copiar solo: seleccione el texto y cópielo.');
    }
  };

  return (
    <aside aria-labelledby="ficha-u" className="card split__main gap-14" style={{ padding: 20, flexBasis: 560 }}>
      <div className="row between gap-12" style={{ alignItems: 'flex-start' }}>
        <div className="row gap-12">
          <Avatar name={user.name.replace(/[^\p{L} ]/gu, '').trim()} size="lg" tone="blue" />
          <div className="stack">
            <h2 id="ficha-u" className="display" style={{ fontSize: 22 }}>
              {user.name}
            </h2>
            <span className="text-sm muted">{user.contact}</span>
          </div>
        </div>
        <div className="stack gap-2" style={{ alignItems: 'flex-end' }}>
          <Badge tone={st.tone}>{st.label}</Badge>
          <span className="text-xs muted">
            {user.account === false ? (user.invitedAt ? `Invitada hace ${daysSince(user.invitedAt)} días` : 'Aún no crea su cuenta') : user.lastLogin ? `Último ingreso: ${whenLabel(user.lastLogin)}` : user.lastSeen}
          </span>
        </div>
      </div>

      <div className="setting-row" style={{ borderTop: 'none', paddingTop: 0 }}>
        <span className="stack grow">
          <span className="setting-row__label">Cuenta activa</span>
          <span className="setting-row__help">Si se desactiva no puede entrar, pero su historial se conserva.</span>
        </span>
        <Switch label="Cuenta activa" checked={user.active} onChange={(v) => onChange({ ...user, active: v })} />
      </div>

      <Segmented
        mode="tabs"
        label="Datos de la persona"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'permisos', label: 'Roles y permisos' },
          { value: 'invitacion', label: 'Invitación' },
          { value: 'historial', label: 'Historial' },
        ]}
      />

      {tab === 'permisos' && (
        <>
          <RoleChecks value={user.roles} roles={roles} onChange={(r) => onChange({ ...user, roles: r, section: r.includes('gui') ? user.section : undefined })} />
          {isGuide && <SectionPicker value={user.section} sections={sections} onChange={(s) => onChange({ ...user, section: s })} />}
          {!user.roles.includes('doc') && <WorkHours value={user.work} onChange={(w) => onChange({ ...user, work: w })} />}

          <div className="stack gap-8">
            <h3 className="eyebrow">Permisos</h3>
            <span className="text-xs muted">Los marcados «por rol» vienen de sus roles. Puede sumar permisos extra solo para esta persona.</span>
            {noRoles && (
              <span className="text-sm ink-orange" role="alert">
                Sin roles, esta persona solo tendrá los permisos extra.
              </span>
            )}
            {dead.length > 0 && (
              <span className="text-sm ink-orange" role="alert">
                Es docente guía: {dead.map((p) => PERMISSION_LABEL[p]).join(', ')} no se puede dar como permiso extra. Para eso necesita el rol Secretaría.
              </span>
            )}
            {staffBlind && (
              <span className="text-sm ink-orange" role="alert">
                Solo Dirección y Secretaría ven la lista del personal, así que sin uno de esos roles no podrá elegir sustitutos.
              </span>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
              {PERMISSION_GROUPS.map((g) => {
                const active = g.permissions.filter((p) => all.has(p.id)).length;
                return (
                  <section key={g.id} aria-label={g.label} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div className="row between" style={{ marginBottom: 4 }}>
                      <strong style={{ fontSize: 14 }}>{g.label}</strong>
                      <span className="text-xs muted">
                        {active} de {g.permissions.length}
                      </span>
                    </div>
                    {g.permissions.map((p) => {
                      const byRole = fromRoles.has(p.id);
                      const has = all.has(p.id);
                      const scoped = has && isGuide && byRole && isSectionScoped(user, p.id, roles);
                      return (
                        <label key={p.id} className="row gap-8" style={{ minHeight: 34, fontSize: 13, cursor: byRole ? 'default' : 'pointer', alignItems: 'center' }}>
                          <input type="checkbox" className="checkbox" style={{ width: 18, height: 18, margin: 0 }} checked={has} disabled={byRole} onChange={() => toggleExtra(p.id)} />
                          <span className="grow" style={{ color: has ? 'var(--ink)' : 'var(--muted)' }}>
                            {p.label}
                          </span>
                          {byRole ? (
                            <Badge tone="soft">{scoped ? `Rol · solo ${user.section ?? 'su sección'}` : 'Rol'}</Badge>
                          ) : has ? (
                            <Badge tone="amber">{guideExtras.includes(p.id) ? (GUIDE_EXTRA_SECTION.has(p.id) ? `Extra · solo ${user.section ?? 'su sección'}` : 'Extra · sin efecto') : 'Extra'}</Badge>
                          ) : null}
                        </label>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}

      {tab === 'invitacion' && (
        <div className="stack gap-10">
          {user.account === false ? (
            <>
              <p className="text-sm">
                {user.name} todavía no tiene cuenta. Cuando cree una con <strong>{user.contact}</strong>, queda enlazada sola con esta ficha y entra con lo que le corresponde.
              </p>
              <textarea className="input" readOnly rows={6} aria-label="Texto de la invitación" style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)' }} value={text} />
              <div className="row gap-8">
                <Button variant="primary" onClick={copy}>
                  Copiar invitación
                </Button>
              </div>
              <span className="text-xs muted">La app no envía el mensaje: lo manda usted por WhatsApp o correo. {user.invitedAt && `Ficha creada hace ${daysSince(user.invitedAt)} días.`}</span>
            </>
          ) : (
            <p className="text-sm">
              {user.name} ya creó su cuenta{user.lastLogin ? ` y entró por última vez ${whenLabel(user.lastLogin).toLowerCase()}` : ''}. Si cambia de correo o de teléfono, hay que corregirlo en su ficha para que no pierda el acceso.
            </p>
          )}
        </div>
      )}

      {tab === 'historial' && <PersonHistory id={String(user.id)} live={live} load={loadHistory} />}

      {onRemove && (
        <div className="stack gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
          {!confirming ? (
            <Button variant="ghost-danger" onClick={() => setConfirming(true)}>
              Eliminar del personal
            </Button>
          ) : (
            <>
              <span className="text-sm">
                Se quita a <strong>{user.name}</strong> del personal. Su cuenta de inicio de sesión queda, sin acceso al colegio. Escriba ELIMINAR para confirmar.
              </span>
              <InputField id="del-word" label="Escriba ELIMINAR" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <div className="row gap-8">
                <Button variant="ghost-danger" disabled={typed.trim() !== 'ELIMINAR'} onClick={onRemove}>
                  Eliminar del personal
                </Button>
                <Button onClick={() => { setConfirming(false); setTyped(''); }}>Cancelar</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div
        className="row wrap between gap-8"
        style={{ position: 'sticky', bottom: 0, margin: '0 -20px -20px', padding: '12px 20px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)', zIndex: 2, alignItems: 'center' }}
      >
        {error ? (
          <span role="alert" className="text-sm ink-orange">
            No se guardó: {error}
          </span>
        ) : dirty ? (
          <span role="status" className="text-sm strong" style={{ color: 'var(--amber-ink)' }}>
            Tiene cambios sin guardar
          </span>
        ) : saved ? (
          <span role="status" className="text-sm strong ink-green">
            Cambios guardados
          </span>
        ) : (
          <span className="text-xs muted">
            Sin cambios · {all.size} de {PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0)} permisos
          </span>
        )}
        <span className="row gap-8">
          {dirty && <Button onClick={onDiscard}>Descartar</Button>}
          <Button variant="primary" onClick={onSave} disabled={!dirty || (isGuide && !user.section)}>
            Guardar cambios
          </Button>
        </span>
      </div>
    </aside>
  );
}

/** Lines of the change history, newest first. */
function HistoryList({ entries, withName }: { entries: HistoryEntry[]; withName?: boolean }) {
  return (
    <div className="stack">
      {entries.map((e, i) => (
        <div key={i} className="row gap-10" style={{ alignItems: 'flex-start', padding: '9px 0', borderTop: i ? '1px solid var(--border-soft)' : undefined }}>
          <span className="text-xs muted" style={{ width: 96, flexShrink: 0, fontWeight: 600 }}>
            {whenLabel(e.when)}
          </span>
          <span className="stack" style={{ fontSize: 14 }}>
            <span>{describeChange(e, withName)}</span>
            <span className="text-xs muted">{e.who ? `Por ${e.who}` : 'Por el sistema'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function PersonHistory({ id, live, load }: { id: string; live: boolean; load: (id?: string) => Promise<HistoryEntry[] | null> }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null | 'error'>(null);
  useEffect(() => {
    if (!live) return;
    load(id).then((r) => setEntries(r ?? 'error'));
  }, [id, live, load]);
  if (!live) return <p className="text-sm muted">El historial se guarda cuando el colegio usa el servidor.</p>;
  if (entries === null) return <p className="text-sm muted">Cargando…</p>;
  if (entries === 'error') return <p className="text-sm muted">No se pudo leer el historial. Falta aplicar la actualización 0021 del servidor.</p>;
  if (entries.length === 0) return <p className="text-sm muted">Todavía no hay cambios registrados para esta persona. Se anotan desde ahora.</p>;
  return <HistoryList entries={entries} />;
}

interface InvitePanelProps {
  roles: Role[];
  sections: string[];
  /** Resolves to an error message, or '' when the person was added. */
  onInvite: (u: Omit<User, 'id'>) => Promise<string>;
  onCancel: () => void;
}

function InvitePanel({ roles, sections, onInvite, onCancel }: InvitePanelProps) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [userRoles, setUserRoles] = useState<RoleId[]>(['doc']);
  const [section, setSection] = useState<string | undefined>();
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) return setError('Escriba el nombre y un correo o teléfono para enviar la invitación.');
    if (userRoles.length === 0) return setError('Elija al menos un rol.');
    if (userRoles.includes('gui') && !section) return setError('Elija la sección a cargo del docente guía.');
    setError(await onInvite({ name: name.trim(), contact: contact.trim(), roles: userRoles, section, extra: [], active: true, lastSeen: 'Invitación enviada' }));
  };

  return (
    <aside aria-labelledby="inv-t" className="card split__side gap-16" style={{ padding: 20, flexBasis: 380 }}>
      <form className="stack gap-16" onSubmit={submit}>
        <h2 id="inv-t" className="title-section">
          Invitar usuario
        </h2>
        <InputField id="inv-nombre" label="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} />
        <InputField id="inv-contacto" label="Correo o teléfono" hint="con este mismo dato crea su cuenta" value={contact} onChange={(e) => setContact(e.target.value)} />
        <RoleChecks value={userRoles} roles={roles} onChange={setUserRoles} />
        {userRoles.includes('gui') && <SectionPicker value={section} sections={sections} onChange={setSection} />}
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

function RolesTab({ roles, users, staff, setLocalRoles }: { roles: Role[]; users: User[]; staff: Staff; setLocalRoles: (r: Role[]) => void }) {
  const toast = useToast();
  const fresh = () => Object.fromEntries(roles.map((r) => [r.id, r.grants])) as Record<string, PermissionId[]>;
  const [draft, setDraft] = useState(fresh);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // After saving (or reloading) the roles, the table starts again from what the server has.
  useEffect(() => setDraft(fresh()), [roles]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = (id: RoleId) => ROLES.find((r) => r.id === id)!.grants;
  const same = (a: PermissionId[], b: PermissionId[]) => a.length === b.length && a.every((x) => b.includes(x));
  const current = (r: Role) => draft[r.id] ?? r.grants;
  const changed = roles.filter((r) => !same(current(r), r.grants));
  const count = (id: RoleId) => users.filter((u) => u.active && u.roles.includes(id)).length;
  const affected = users.filter((u) => u.active && u.roles.some((r) => changed.some((c) => c.id === r))).length;

  const toggle = (roleId: RoleId, p: PermissionId) =>
    setDraft((d) => {
      const now = d[roleId] ?? [];
      return { ...d, [roleId]: now.includes(p) ? now.filter((x) => x !== p) : [...now, p] };
    });

  const save = async () => {
    setBusy(true);
    setError('');
    const changes: Partial<Record<RoleId, PermissionId[] | null>> = {};
    changed.forEach((r) => (changes[r.id] = same(current(r), base(r.id)) ? null : current(r)));
    if (staff.live) {
      const err = await staff.saveRoles(changes);
      if (err) setError(err);
      else toast('Roles guardados');
    } else {
      setLocalRoles(roles.map((r) => (changed.includes(r) ? { ...r, grants: current(r) } : r)));
      toast('Roles guardados');
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="matriz-t" className="card gap-10">
      <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
        <h2 id="matriz-t" className="title-section">
          Qué puede hacer cada rol
        </h2>
        <span className="text-sm muted">Lo que marque aquí vale para todas las personas con ese rol. Dirección siempre conserva «Gestionar usuarios» y «Cambiar la configuración».</span>
      </div>
      {changed.length > 0 && (
        <div className="row wrap between gap-10" role="status" style={{ background: 'var(--amber-bg)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
          <span className="text-sm strong" style={{ color: 'var(--amber-ink)' }}>
            Cambios sin guardar en {changed.map((r) => r.name).join(', ')} · afectan a {affected} {affected === 1 ? 'persona' : 'personas'}
          </span>
          <span className="row gap-8">
            <Button onClick={() => setDraft(fresh())} disabled={busy}>
              Descartar
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar roles'}
            </Button>
          </span>
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          No se guardó: {error}
        </p>
      )}
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
                      {count(r.id)} {count(r.id) === 1 ? 'persona' : 'personas'}
                    </span>
                    {!same(current(r), base(r.id)) && (
                      <button type="button" className="link-button text-xs" onClick={() => setDraft((d) => ({ ...d, [r.id]: base(r.id) }))}>
                        Valores de fábrica
                      </button>
                    )}
                    {same(current(r), r.grants) && staff.overridden.has(r.id) && <span className="text-xs" style={{ fontWeight: 400, color: 'var(--amber-ink)' }}>Cambiado por el colegio</span>}
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
                        {SCOPED.has(p.id) ? ' · el docente guía solo en su sección' : ''}
                      </span>
                    </span>
                  </td>
                  {roles.map((r) => {
                    const on = current(r).includes(p.id);
                    const locked = r.id === 'dir' && (p.id === 'users' || p.id === 'settings');
                    return (
                      <td key={r.id} className="center">
                        <button type="button" role="checkbox" className="perm-check" aria-checked={on || locked} aria-label={`${r.name}: ${p.label}`} disabled={locked} onClick={() => toggle(r.id, p.id)}>
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

function HistoryTab({ staff }: { staff: Staff }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null | 'error'>(null);
  const load = () => {
    setEntries(null);
    staff.history().then((r) => setEntries(r ?? 'error'));
  };
  useEffect(() => {
    if (staff.live) load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-labelledby="hist-t" className="card gap-10">
      <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
        <h2 id="hist-t" className="title-section">
          Historial de cambios
        </h2>
        <span className="row gap-10" style={{ alignItems: 'baseline' }}>
          <span className="text-sm muted">Quién cambió roles, permisos y cuentas, y cuándo.</span>
          {staff.live && (
            <Button size="sm" onClick={load}>
              Actualizar
            </Button>
          )}
        </span>
      </div>
      {!staff.live ? (
        <p className="text-sm muted">El historial se guarda cuando el colegio usa el servidor.</p>
      ) : entries === null ? (
        <p className="text-sm muted">Cargando…</p>
      ) : entries === 'error' ? (
        <p className="text-sm muted">No se pudo leer el historial. Falta aplicar la actualización 0021 del servidor.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm muted">Todavía no hay cambios registrados. Se anotan desde ahora.</p>
      ) : (
        <HistoryList entries={entries} withName />
      )}
    </section>
  );
}
