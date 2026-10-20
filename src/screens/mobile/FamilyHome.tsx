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

        {child.freeLesson && (
          <section className="card card--mobile gap-10" aria-labelledby="libre-t" style={{ borderColor: 'var(--amber-bg)', background: 'var(--amber-bg)' }}>
            <div className="row gap-10">
              <span className="alert-card__icon" style={{ background: 'var(--amber)' }}>
                <Icon name="clock" size={22} strokeWidth={2.2} />
              </span>
              <span className="stack">
                <span className="alert-card__when" style={{ color: 'var(--amber-ink)' }}>
                  Hoy · {child.freeLesson.time}
                </span>
                <h2 id="libre-t" style={{ fontSize: 17, fontWeight: 700 }}>
                  {child.freeLesson.subject} no tendrá lección
                </h2>
              </span>
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-2)' }}>
              El docente no viene hoy.{' '}
              {child.freeLesson.authorizedExit
                ? `No necesita hacer nada: ya autorizó la salida de ${child.short} a las ${child.freeLesson.authorizedExit}`
                : child.freeLesson.last && child.freeLesson.exitAt
                ? `Es la última lección: ${child.short} puede salir a las ${child.freeLesson.exitAt} si usted lo autoriza. Si no, se queda en el colegio hasta la hora de salida.`
                : `${child.short} se queda en el colegio durante esa lección.`}
            </p>
            {child.freeLesson.last && child.freeLesson.exitAt && !child.freeLesson.authorizedExit && (
              <ButtonLink variant="dark" size="lg" to={routes.family.earlyExit} state={{ hour: child.freeLesson.exitHourIndex }}>
                Autorizar salida a las {child.freeLesson.exitAt}
              </ButtonLink>
            )}
          </section>
        )}

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
            <Link to={routes.family.schedule} style={{ fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              Ver horario
            </Link>
          </div>
          {child.today.map((l) => (
            <div key={l.time} className="row gap-12" style={{ minHeight: 40 }}>
              <span className="text-sm muted tabular" style={{ width: 76 }}>
                {l.time}
              </span>
              <span className="stack grow">
                <span style={{ fontSize: 15, fontWeight: 600 }}>{l.subject}</span>
                {l.change?.kind === 'sub' && <span className="text-xs muted">Sustituye: {l.change.substitute}</span>}
              </span>
              {l.change?.kind === 'free' ? (
                <Badge tone="amber" size="md">
                  Lección libre
                </Badge>
              ) : (
                <StatusBadge status={MARK_STATUS[l.mark]} size="md" />
              )}
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
