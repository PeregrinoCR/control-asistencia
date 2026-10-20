import type { ReactNode } from 'react';
import { NavLink, Navigate } from 'react-router-dom';
import { Icon, cx } from '../components';
import { SCHOOL_NAME, navCounts } from '../data/school';
import { signOut, useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { routes } from '../routes';

const LINKS: Array<{ to: string; label: string; count?: { n: number; tone: 'blue' | 'orange' } }> = [
  { to: routes.admin.today, label: 'Hoy' },
  { to: routes.admin.assignments, label: 'Profesores y secciones' },
  { to: routes.admin.teacherAbsences, label: 'Docentes ausentes', count: { n: navCounts.teacherAbsences, tone: 'blue' } },
  { to: routes.admin.trips, label: 'Giras y salidas', count: { n: navCounts.trips, tone: 'blue' } },
  { to: routes.admin.students, label: 'Estudiantes' },
  { to: routes.admin.justifications, label: 'Justificaciones', count: { n: navCounts.justifications, tone: 'orange' } },
  { to: routes.admin.notices, label: 'Avisos a familias' },
  { to: routes.admin.earlyWarning, label: 'Alerta temprana', count: { n: navCounts.earlyWarning, tone: 'orange' } },
  { to: routes.admin.reports, label: 'Reportes' },
  { to: routes.admin.users, label: 'Usuarios y permisos' },
];

/** Shell for every page of the administration panel: dark sidebar + main column. */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { ready, session, school } = useAuth();
  // With a server configured, the panel needs a signed-in account.
  if (supabase && ready && !session) return <Navigate to={routes.login} replace />;
  if (supabase && !ready) return null;

  return (
    <div className="admin">
      <nav aria-label="Menú de dirección" className="admin__nav">
        <div className="admin__brand">
          <div className="admin__logo">
            <Icon name="checkSquare" strokeWidth={2.2} />
          </div>
          <div className="stack">
            <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Asistencia</span>
            <span className="text-xs" style={{ color: 'var(--night-ink-3)' }}>
              {school?.nombre ?? SCHOOL_NAME}
            </span>
          </div>
        </div>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end className="admin__link">
            {l.label}
            {l.count && <span className={cx('count', `count--${l.count.tone}`)}>{l.count.n}</span>}
          </NavLink>
        ))}
        <NavLink to={routes.admin.settings} className="admin__link admin__link--bottom">
          Configuración
        </NavLink>
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
