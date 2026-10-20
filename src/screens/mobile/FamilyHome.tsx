import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, ButtonAnchor, ButtonLink, Icon, IconButton, MiniStat, Segmented, StatusBadge } from '../../components';
import { FamilyTabBar, MobileScreen } from '../../layouts/MobileScreen';
import { CHILDREN, GUARDIAN, type Child } from '../../data/family';
import { MARK_STATUS, SCHOOL_PHONE } from '../../data/school';
import { routes } from '../../routes';

/** Familia · Inicio */
export function FamilyHome() {
  const [childId, setChildId] = useState<Child['id']>('M');
  const child = CHILDREN.find((c) => c.id === childId)!;
  const tone = child.alert.mark === 'A' ? 'orange' : 'amber';

  return (
    <MobileScreen>
      <div className="screen-body gap-16" style={{ padding: '24px 16px 16px' }}>
        <div className="row between" style={{ padding: '0 4px' }}>
          <div className="stack">
            <span className="muted" style={{ fontSize: 14 }}>
              Buenas noches,
            </span>
            <h1 className="display" style={{ fontSize: 28, letterSpacing: -0.4 }}>
              {GUARDIAN.first}
            </h1>
          </div>
          <IconButton icon="bell" label="Notificaciones, 2 sin leer" dot />
        </div>

        <Segmented
          label="Estudiante"
          fill
          value={childId}
          onChange={setChildId}
          options={CHILDREN.map((c) => ({ value: c.id, label: `${c.short} · ${c.section}` }))}
        />

        <section className="alert-card" data-tone={tone} aria-live="polite">
          <div className="row gap-10">
            <div className="alert-card__icon">
              <Icon name="alert" size={22} strokeWidth={2.2} />
            </div>
            <div className="stack">
              <span className="alert-card__when">Hoy · {child.alert.time}</span>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{child.alert.title}</span>
            </div>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-2)' }}>{child.alert.body}</p>
          {child.alert.canJustify && (
            <div className="grid-2">
              <ButtonLink variant="danger" size="lg" to={routes.family.justify}>
                Justificar
              </ButtonLink>
              <ButtonAnchor
                variant="secondary"
                size="lg"
                href={`tel:${SCHOOL_PHONE}`}
                style={{ borderColor: 'var(--orange-line)' }}
              >
                <Icon name="phone" size={18} />
                Llamar
              </ButtonAnchor>
            </div>
          )}
        </section>

        <section className="card card--mobile gap-10">
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Permisos y autorizaciones</h2>
          <Link to={routes.family.trip} className="perm-link">
            <span className="perm-link__icon">
              <Icon name="bus" />
            </span>
            <span className="stack grow">
              <span style={{ fontSize: 15, fontWeight: 700 }}>Gira a [DESTINO]</span>
              <span className="text-sm muted">Vie 30 oct · firme antes del 26 oct</span>
            </span>
            <Badge tone="orange">Falta firma</Badge>
          </Link>
          <ButtonLink variant="outline-blue" to={routes.family.earlyExit} size="lg">
            <Icon name="logout" size={18} />
            Autorizar salida temprana
          </ButtonLink>
        </section>

        <section className="card card--mobile">
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Hoy, lección por lección</h2>
            <span className="text-sm muted">Lun 19 oct</span>
          </div>
          {child.today.map((l) => (
            <div key={l.time} className="row gap-12" style={{ minHeight: 40 }}>
              <span className="text-sm muted tabular" style={{ width: 76 }}>
                {l.time}
              </span>
              <span className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
                {l.subject}
              </span>
              <StatusBadge status={MARK_STATUS[l.mark]} size="md" />
            </div>
          ))}
        </section>

        <section className="card card--mobile">
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Este mes</h2>
            <Link to={routes.family.history} style={{ fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Ver historial
            </Link>
          </div>
          <div className="grid-3">
            <MiniStat label="Asistencia" value={child.month.pct} />
            <MiniStat label="Ausencias" value={child.month.absences} ink="orange" />
            <MiniStat label="Tardías" value={child.month.lates} ink="amber" />
          </div>
        </section>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
