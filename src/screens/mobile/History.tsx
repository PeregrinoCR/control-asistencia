import { useState } from 'react';
import { ButtonLink, MiniStat } from '../../components';
import { MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { OCTOBER_GRID, OCTOBER_RECORDS, type DayKind } from '../../data/family';
import { routes } from '../../routes';
import { supabase } from '../../lib/supabase';
import { HistoryLive } from './HistoryLive';

const DOW = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const TITLES: Record<Exclude<DayKind, 'O'>, string> = {
  P: 'Presente',
  T: 'Llegada tardía',
  A: 'Ausente',
  J: 'Ausencia justificada',
  F: 'Feriado',
  X: 'Sin registro todavía',
};
const TAGS: Partial<Record<DayKind, string>> = { T: 'T', A: 'A', J: 'J', F: 'FER' };

/** Familia · Historial del mes */
export function History() {
  return supabase ? <HistoryLive /> : <HistorySample />;
}

/** The sample screen, shown while no server is configured. */
function HistorySample() {
  const [selected, setSelected] = useState(19);

  const kindOf = (day: number, inMonth: boolean): DayKind =>
    inMonth ? (OCTOBER_RECORDS[day]?.kind ?? 'X') : 'O';

  const index = OCTOBER_GRID.findIndex((d) => d.inMonth && d.day === selected);
  const record = OCTOBER_RECORDS[selected];
  const kind = record?.kind ?? 'X';
  const body =
    record?.note ?? (kind === 'P' ? 'Asistió a todas las lecciones a tiempo.' : 'Este día aún no ha ocurrido.');

  return (
    <MobileScreen>
      <ScreenHeader title="Historial de Mateo" subtitle="Octubre 2026 · Sección 10-2 · nocturna" />
      <div className="screen-body gap-14" style={{ paddingTop: 8, paddingBottom: 20 }}>
        <div className="grid-3">
          <MiniStat look="boxed" label="Asistencia" value="83 %" />
          <MiniStat look="boxed" label="Ausencias" value={2} ink="orange" />
          <MiniStat look="boxed" label="Tardías" value={2} ink="amber" />
        </div>

        <div className="card card--mobile gap-8" style={{ padding: 14 }}>
          <div className="cal" aria-hidden="true">
            {['L', 'K', 'M', 'J', 'V'].map((d) => (
              <span key={d} className="cal__dow">
                {d}
              </span>
            ))}
          </div>
          <div className="cal">
            {OCTOBER_GRID.map(({ day, inMonth }) => {
              const k = kindOf(day, inMonth);
              return (
                <button
                  key={`${day}-${inMonth}`}
                  type="button"
                  className="cal__day"
                  data-kind={k}
                  aria-pressed={inMonth && day === selected}
                  aria-label={inMonth ? `${day} de octubre: ${TITLES[k as Exclude<DayKind, 'O'>]}` : `${day} de septiembre`}
                  onClick={() => inMonth && setSelected(day)}
                >
                  <span>{day}</span>
                  <span className="cal__tag">{TAGS[k] ?? ''}</span>
                </button>
              );
            })}
          </div>
          <div className="legend" style={{ paddingTop: 6 }}>
            <span className="legend__item">
              <span className="swatch" style={{ background: 'var(--blue-bg)', border: '1px solid var(--blue)' }} />
              Presente
            </span>
            <span className="legend__item">
              <span className="swatch" style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber)' }} />
              Tarde (T)
            </span>
            <span className="legend__item">
              <span className="swatch" style={{ background: 'var(--orange)' }} />
              Ausente (A)
            </span>
            <span className="legend__item">
              <span className="swatch" style={{ background: 'var(--neutral-bg)' }} />
              Feriado
            </span>
          </div>
        </div>

        <section className="card card--mobile gap-8" aria-live="polite">
          <span className="eyebrow">
            {DOW[index % 5]} {selected} de octubre
          </span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{TITLES[kind]}</span>
          <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-2)' }}>{body}</p>
          {record?.canJustify && (
            <ButtonLink variant="danger" size="lg" to={routes.family.justify} block>
              Justificar esta ausencia
            </ButtonLink>
          )}
        </section>
      </div>
    </MobileScreen>
  );
}
