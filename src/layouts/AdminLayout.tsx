import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { Icon, cx, type IconName } from '../components';
import { SCHOOL_NAME, navCounts } from '../data/school';
import type { PermissionId } from '../data/users';
import { hasPanel, homeFor, signOut, useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { routes } from '../routes';

type MenuLink = { to: string; label: string; perm: PermissionId | PermissionId[]; count?: { n: number; tone: 'blue' | 'orange' } };

/** The menu, by what the staff does with each page: day to day, the school year, families, administration. */
const GROUPS: Array<{ title: string; links: MenuLink[] }> = [
  {
    title: 'Día a día',
    links: [
      { to: routes.admin.today, label: 'Hoy', perm: 'viewAttendance' },
      { to: routes.admin.teacherAbsences, label: 'Docentes ausentes', perm: 'teacherAbs', count: { n: navCounts.teacherAbsences, tone: 'blue' } },
      { to: routes.admin.justifications, label: 'Justificaciones', perm: 'approveJust', count: { n: navCounts.justifications, tone: 'orange' } },
    ],
  },
  {
    title: 'Académico',
    links: [
      { to: routes.admin.schedules, label: 'Horarios y cargas', perm: 'assign' },
      { to: routes.admin.rooms, label: 'Aulas y grupos', perm: 'assign' },
      { to: routes.admin.students, label: 'Estudiantes', perm: 'viewAttendance' },
      { to: routes.admin.examCare, label: 'Cuido de exámenes', perm: 'assign' },
    ],
  },
  {
    title: 'Familias',
    links: [
      { to: routes.admin.trips, label: 'Giras y salidas', perm: ['trips', 'payments', 'approveExit'], count: { n: navCounts.trips, tone: 'blue' } },
      { to: routes.admin.notices, label: 'Avisos a familias', perm: 'notices' },
      { to: routes.admin.earlyWarning, label: 'Alerta temprana', perm: 'earlyWarning', count: { n: navCounts.earlyWarning, tone: 'orange' } },
    ],
  },
  {
    title: 'Administración',
    links: [
      { to: routes.admin.reports, label: 'Reportes', perm: 'reports' },
      { to: routes.admin.users, label: 'Usuarios y permisos', perm: 'users' },
    ],
  },
];

/** The permission each page needs. Pages not in the menu (Configuración) are included too. */
const PAGE_PERMS: Array<[string, PermissionId | PermissionId[]]> = [
  [routes.admin.today, 'viewAttendance'],
  [routes.admin.schedules, 'assign'],
  [routes.admin.rooms, 'assign'],
  [routes.admin.teacherAbsences, 'teacherAbs'],
  [routes.admin.examCare, 'assign'],
  [routes.admin.trips, ['trips', 'payments', 'approveExit']],
  [routes.admin.students, 'viewAttendance'],
  [routes.admin.justifications, 'approveJust'],
  [routes.admin.notices, 'notices'],
  [routes.admin.earlyWarning, 'earlyWarning'],
  [routes.admin.reports, 'reports'],
  [routes.admin.users, 'users'],
  [routes.admin.settings, 'settings'],
];

/** Most used pages, one tap away in the phone's bottom bar. */
const QUICK: Array<{ to: string; label: string; icon: IconName; perm: PermissionId }> = [
  { to: routes.admin.today, label: 'Hoy', icon: 'home', perm: 'viewAttendance' },
  { to: routes.admin.students, label: 'Estudiantes', icon: 'users', perm: 'viewAttendance' },
  { to: routes.admin.justifications, label: 'Justificaciones', icon: 'fileCheck', perm: 'approveJust' },
];

/**
 * Shell for every page of the administration panel. Wide screens: dark sidebar + main column.
 * Phones: a slim top bar, the menu as a drawer, and a bottom bar with the most used pages.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { ready, session, school, roles, family, perms } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the drawer on navigation and with Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // With a server configured, the panel needs a signed-in account.
  if (supabase && ready && !session) return <Navigate to={routes.login} replace />;
  if (supabase && !ready) return null;
  if (supabase && school && !hasPanel(roles, perms)) return <Navigate to={homeFor(roles, family)} replace />;

  // The menu shows only the pages this person can use (the preview without a server shows them all).
  const allowed = (perm: PermissionId | PermissionId[]) => !supabase || [perm].flat().some((p) => perms.includes(p));
  const visibleGroups = GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => allowed(l.perm)) })).filter((g) => g.links.length > 0);
  const visibleQuick = QUICK.filter((q) => allowed(q.perm));

  // Each page needs its permission, so a typed address can't open a module that wasn't assigned.
  const page = PAGE_PERMS.find(([to]) => (to === routes.admin.today ? pathname === to : pathname === to || pathname.startsWith(to + '/')));
  if (supabase && page && !allowed(page[1])) {
    const first = visibleGroups[0]?.links[0]?.to;
    if (first) return <Navigate to={first} replace />;
    return (
      <div className="screen-body" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <p className="text-sm muted">No tiene asignado ningún módulo del panel. Pida a dirección que le asigne sus permisos.</p>
        <button type="button" className="link-button" onClick={() => signOut()}>
          Salir
        </button>
      </div>
    );
  }

  const brand = (
    <div className="admin__brand">
      {school?.logo ? (
        <img src={school.logo} alt="" className="admin__logo" style={{ objectFit: 'contain', background: '#fff' }} />
      ) : (
        <div className="admin__logo">
          <Icon name="checkSquare" strokeWidth={2.2} />
        </div>
      )}
      <div className="stack" style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Asistencia</span>
        <span className="text-xs admin__school">{school?.nombre ?? SCHOOL_NAME}</span>
      </div>
    </div>
  );

  return (
    <div className="admin" data-menu={open ? 'open' : undefined}>
      <header className="admin__topbar">
        {brand}
        <button type="button" className="admin__menu-btn" aria-expanded={open} aria-controls="menu-direccion" onClick={() => setOpen(!open)}>
          <Icon name={open ? 'x' : 'menu'} size={22} />
          <span>Menú</span>
        </button>
      </header>
      {open && <button type="button" className="admin__scrim" aria-label="Cerrar menú" onClick={() => setOpen(false)} />}
      <nav id="menu-direccion" aria-label="Menú de dirección" className="admin__nav">
        {brand}
        {visibleGroups.map((g) => (
          <div key={g.title} className="admin__group">
            <span className="admin__group-title">{g.title}</span>
            {g.links.map((l) => (
              <NavLink key={l.to} to={l.to} end className="admin__link">
                {l.label}
                {l.count && !supabase && <span className={cx('count', `count--${l.count.tone}`)}>{l.count.n}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        {allowed('settings') && (
          <NavLink to={routes.admin.settings} className="admin__link admin__link--bottom">
            Configuración
          </NavLink>
        )}
        {session && (
          <button type="button" className="admin__link" onClick={() => signOut()} title={session.user.email}>
            Salir
          </button>
        )}
      </nav>
      <main className="admin__main">
        {session && !school && (
          <p className="notice" role="alert">
            Su cuenta ({session.user.email}) todavía no está vinculada a un colegio. Pida a dirección que lo registre
            con este mismo correo, o escriba a soporte.
          </p>
        )}
        {children}
      </main>
      <nav aria-label="Accesos rápidos" className="admin__tabs">
        {visibleQuick.map((q) => (
          <NavLink key={q.to} to={q.to} end className="admin__tab">
            <Icon name={q.icon} size={22} />
            {q.label}
          </NavLink>
        ))}
        <button type="button" className="admin__tab" aria-expanded={open} aria-controls="menu-direccion" onClick={() => setOpen(!open)}>
          <Icon name="menu" size={22} />
          Más
        </button>
      </nav>
    </div>
  );
}

interface PageHeaderProps {
  kicker: ReactNode;
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ kicker, title, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="stack gap-4">
        <span className="page-header__kicker">{kicker}</span>
        <h1 className="title-page">{title}</h1>
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
