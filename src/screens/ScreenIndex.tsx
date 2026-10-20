import { Link } from 'react-router-dom';
import { routes } from '../routes';

const GROUPS = [
  {
    title: 'App móvil: docentes y familias',
    links: [
      { to: routes.teacher.rollCall, role: 'Docente', label: 'Pase de lista' },
      { to: routes.family.push, role: 'Padre', label: 'Notificación instantánea' },
      { to: routes.family.home, role: 'Padre', label: 'Inicio' },
      { to: routes.family.justify, role: 'Padre', label: 'Justificar ausencia' },
      { to: routes.family.history, role: 'Padre', label: 'Historial del mes' },
      { to: routes.family.trip, role: 'Padre', label: 'Autorizar gira' },
      { to: routes.family.earlyExit, role: 'Padre', label: 'Salida temprana y descargo' },
      { to: routes.family.card, role: 'Padre', label: 'Carné estudiantil (QR)' },
      { to: routes.guard.gate, role: 'Guarda', label: 'Control de portón' },
    ],
  },
  {
    title: 'Panel web para dirección',
    links: [
      { to: routes.admin.today, role: 'Dirección', label: 'Panel del día' },
      { to: routes.admin.assignments, role: 'Dirección', label: 'Profesores, secciones y horarios' },
      { to: routes.admin.teacherAbsences, role: 'Dirección', label: 'Ausencias de docentes' },
      { to: routes.admin.trips, role: 'Dirección', label: 'Giras y salidas tempranas' },
      { to: routes.admin.students, role: 'Dirección', label: 'Estudiantes' },
      { to: routes.admin.justifications, role: 'Dirección', label: 'Justificaciones' },
      { to: routes.admin.notices, role: 'Dirección', label: 'Avisos a familias' },
      { to: routes.admin.reports, role: 'Dirección', label: 'Reportes' },
      { to: routes.admin.settings, role: 'Dirección', label: 'Configuración' },
      { to: routes.admin.earlyWarning, role: 'Dirección', label: 'Alerta temprana' },
    ],
  },
];

/** Entry page listing every screen of the app. */
export function ScreenIndex() {
  return (
    <div className="index">
      <div className="stack gap-4">
        <span className="page-header__kicker">Control de asistencia</span>
        <h1 className="title-page">App de asistencia escolar</h1>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} className="stack gap-12" aria-labelledby={g.title}>
          <h2 id={g.title} className="title-section">
            {g.title}
          </h2>
          <div className="index__grid">
            {g.links.map((l) => (
              <Link key={l.to} to={l.to} className="index__link">
                <span className="text-sm muted strong">{l.role}</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{l.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
