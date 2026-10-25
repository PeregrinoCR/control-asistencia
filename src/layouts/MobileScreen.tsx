import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, IconLink, cx, type IconName } from '../components';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { routes } from '../routes';

interface MobileScreenProps {
  children: ReactNode;
  night?: boolean;
}

/** One screen of the mobile app: device-sized on desktop, full-screen on a phone. */
export function MobileScreen({ children, night }: MobileScreenProps) {
  return (
    <div className="phone-stage">
      <div className={cx('phone', night && 'phone--night')}>{children}</div>
    </div>
  );
}

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
}

/** Back button + title, used by the family app's inner screens. */
export function ScreenHeader({ title, subtitle, backTo = routes.family.home, backLabel = 'Volver al inicio' }: ScreenHeaderProps) {
  return (
    <div className="screen-header">
      <IconLink icon="chevronLeft" label={backLabel} to={backTo} />
      <div className="stack">
        <h1 className="title-screen">{title}</h1>
        {subtitle && <span className="screen-header__sub">{subtitle}</span>}
      </div>
    </div>
  );
}

interface DoneStateProps {
  title: string;
  children: ReactNode;
  tone?: 'success' | 'neutral' | 'alert';
  icon?: IconName;
  actions: ReactNode;
}

/** Confirmation shown in place of a form once it is sent. */
export function DoneState({ title, children, tone = 'success', icon = 'check', actions }: DoneStateProps) {
  return (
    <div className="done-state" role="status">
      <div className="done-state__icon" data-tone={tone}>
        <Icon name={icon} size={36} strokeWidth={2.2} />
      </div>
      <h2 className="done-state__title">{title}</h2>
      <div className="done-state__body">{children}</div>
      {actions}
    </div>
  );
}

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: routes.family.home, label: 'Inicio', icon: 'home' },
  { to: routes.family.history, label: 'Historial', icon: 'calendar' },
  { to: routes.family.trip, label: 'Permisos', icon: 'fileCheck' },
  { to: routes.family.settings, label: 'Ajustes', icon: 'settings' },
];

export function FamilyTabBar() {
  return (
    <nav aria-label="Navegación principal" className="tab-bar">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end className="tab-bar__item">
          <Icon name={t.icon} size={22} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

const TEACHER_TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: routes.teacher.rollCall, label: 'Lista', icon: 'check' },
  { to: routes.teacher.toJustify, label: 'Por justificar', icon: 'fileCheck' },
];

/** Bottom bar of the teacher's app. */
export function TeacherTabBar() {
  const { session } = useAuth();
  const [organizes, setOrganizes] = useState(false);
  // «Mis giras» only shows for a teacher who was named the organizer of a trip.
  useEffect(() => {
    if (!supabase || !session) return;
    (async () => {
      const { data: p } = await supabase!.from('personal').select('id').eq('usuario_id', session.user.id).maybeSingle();
      if (!p) return;
      const { count } = await supabase!.from('giras').select('id', { count: 'exact', head: true }).eq('organizador_id', p.id);
      setOrganizes((count ?? 0) > 0);
    })();
  }, [session]);
  const tabs = organizes ? [...TEACHER_TABS, { to: routes.teacher.myTrips, label: 'Mis giras', icon: 'bus' as IconName }] : TEACHER_TABS;
  return (
    <nav aria-label="Navegación del docente" className="tab-bar" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end className="tab-bar__item">
          <Icon name={t.icon} size={22} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
