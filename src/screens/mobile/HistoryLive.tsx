import { useEffect, useState } from 'react';
import { ButtonLink, IconButton, MiniStat } from '../../components';
import { MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { MARK_STATUS } from '../../data/school';
import { kidRecords, longDay, monthTotals, type DayRecord, type Exit, type Justif } from '../../lib/family';
import { LESSONS, localDate } from '../../lib/schedule';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

type Kind = 'P' | 'T' | 'A' | 'X' | 'O';

const TITLES: Record<Exclude<Kind, 'O'>, string> = { P: 'Presente', T: 'Llegada tardía', A: 'Ausente', X: 'Sin registro' };
const TAGS: Partial<Record<Kind, string>> = { T: 'T', A: 'A' };
const JUST_LABEL = { p: 'en revisión', a: 'aprobada', r: 'rechazada', i: 'el colegio pidió más información' };

const iso = (d: Date) => localDate(d);

/** Weekdays of a month, padded to start on Monday. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const last = new Date(year, month + 1, 0);
  const days: Array<{ date: string; day: number; inMonth: boolean }> = [];
  for (const d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push({ date: iso(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return days;
}

/** Familia · Historial del mes, from the real roll calls. */
export function HistoryLive() {
  return <FamilyGate>{(f) => <History f={f} />}</FamilyGate>;
}

function History({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(localDate());
  const [data, setData] = useState<{ days: Map<string, DayRecord>; justifs: Justif[]; exits: Exit[] } | null>(null);

  const grid = monthGrid(ym.y, ym.m);
  const from = grid.find((d) => d.inMonth)!.date;
  const to = [...grid].reverse().find((d) => d.inMonth)!.date;

  useEffect(() => {
    setData(null);
    kidRecords(kid.id, from, to).then(setData);
  }, [kid, from, to]);

  const today = localDate();
  const kindOf = (date: string, inMonth: boolean): Kind => {
    if (!inMonth) return 'O';
    const marks = data?.days.get(date)?.marks ?? [];
    if (marks.some((m) => m.mark === 'A')) return 'A';
    if (marks.some((m) => m.mark === 'T')) return 'T';
    return marks.length ? 'P' : 'X';
  };

  const move = (delta: number) => {
    const d = new Date(ym.y, ym.m + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  const totals = data ? monthTotals(data.days) : null;
  const rec = data?.days.get(selected);
  const kind = kindOf(selected, true);
  const justif = data?.justifs.find((j) => j.from <= selected && selected <= j.to);
  const exit = data?.exits.find((e) => e.date === selected);
  const monthName = new Date(ym.y, ym.m, 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });

  return (
    <MobileScreen>
      <ScreenHeader title={`Historial de ${kid.short}`} subtitle={`Sección ${kid.section}`} />
      <div className="screen-body gap-14" style={{ paddingTop: 8, paddingBottom: 20 }}>
        <KidPicker f={f} />
        <div className="grid-3">
          <MiniStat look="boxed" label="Asistencia" value={totals?.pct == null ? '—' : `${totals.pct} %`} />
          <MiniStat look="boxed" label="Ausencias" value={totals?.absences ?? 0} ink="orange" />
          <MiniStat look="boxed" label="Tardías" value={totals?.lates ?? 0} ink="amber" />
        </div>

        <div className="card card--mobile gap-8" style={{ padding: 14 }}>
          <div className="row between">
            <IconButton icon="chevronLeft" label="Mes anterior" onClick={() => move(-1)} />
            <span className="strong" style={{ textTransform: 'capitalize' }}>
              {monthName}
            </span>
            <IconButton
              icon="chevronLeft"
              label="Mes siguiente"
              style={{ transform: 'rotate(180deg)' }}
              disabled={ym.y === now.getFullYear() && ym.m === now.getMonth()}
              onClick={() => move(1)}
            />
          </div>
          <div className="cal" aria-hidden="true">
            {['L', 'K', 'M', 'J', 'V'].map((d) => (
              <span key={d} className="cal__dow">
                {d}
              </span>
            ))}
          </div>
          <div className="cal">
            {grid.map(({ date, day, inMonth }) => {
              const k = date > today && inMonth ? 'X' : kindOf(date, inMonth);
              return (
                <button
                  key={date}
                  type="button"
                  className="cal__day"
                  data-kind={k}
                  aria-pressed={date === selected}
                  aria-label={inMonth ? `${longDay(date)}: ${TITLES[k as Exclude<Kind, 'O'>]}` : longDay(date)}
                  onClick={() => inMonth && setSelected(date)}
                >
                  <span>{day}</span>
                  <span className="cal__tag">{TAGS[k] ?? ''}</span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="card card--mobile gap-8" aria-live="polite">
          <span className="eyebrow">{longDay(selected)}</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{selected > today ? 'Todavía no ocurre' : TITLES[kind as Exclude<Kind, 'O'>]}</span>
          {rec?.marks.map((m) => (
            <div key={m.lesson} className="row between" style={{ fontSize: 14 }}>
              <span>
                {LESSONS[m.lesson - 1]?.name} · {LESSONS[m.lesson - 1]?.start}
              </span>
              <span style={{ fontWeight: 600 }}>{MARK_STATUS[m.mark].label}</span>
            </div>
          ))}
          {!rec && selected <= today && <p className="text-sm muted">No hay pase de lista registrado este día.</p>}
          {justif && (
            <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>
              Justificación ({justif.reason.toLowerCase()}): {JUST_LABEL[justif.state]}.
            </p>
          )}
          {exit && (
            <p style={{ fontSize: 15, color: 'var(--ink-2)' }}>
              Salida temprana autorizada a las {exit.hour} p. m.{exit.left ? ' Salió del colegio.' : ''}
            </p>
          )}
          {(kind === 'A' || kind === 'T') && !justif && (
            <ButtonLink variant="danger" size="lg" to={routes.family.justify} state={{ date: selected }} block>
              Justificar {kind === 'A' ? 'esta ausencia' : 'esta llegada tardía'}
            </ButtonLink>
          )}
        </section>
      </div>
    </MobileScreen>
  );
}
