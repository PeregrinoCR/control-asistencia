import { useEffect, useState } from 'react';
import { Badge } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { SHIFT_BLOCKS } from '../../data/settings';
import { SCHOOL_DAYS, type DayId } from '../../data/schedule';
import { sectionDay } from '../../lib/family';
import { todayId } from '../../lib/schedule';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

/** "8:00 p. m." → minutes since midnight. */
function toMinutes(t: string) {
  const m = t.match(/(\d+):(\d+)\s*([ap])/);
  if (!m) return 0;
  return ((Number(m[1]) % 12) + (m[3] === 'p' ? 12 : 0)) * 60 + Number(m[2]);
}

/** Familia · Horario semanal, from the school's real timetable. */
export function WeeklyScheduleLive() {
  return <FamilyGate>{(f) => <Schedule f={f} />}</FamilyGate>;
}

function Schedule({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const today = todayId();
  const [day, setDay] = useState<DayId>(today ?? 'L');
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof sectionDay>> | null>(null);

  useEffect(() => {
    setPlan(null);
    if (kid.sectionId) sectionDay(kid.sectionId, day).then(setPlan);
    else setPlan([]);
  }, [kid, day]);

  const now = new Date().getHours() * 60 + new Date().getMinutes();
  let lesson = 0;
  const rows = SHIFT_BLOCKS.noc.blocks.map(([name, start, end]) => {
    const isBreak = /Recreo|Merienda/.test(name);
    const n = isBreak ? 0 : ++lesson;
    return { name, start, end, isBreak, slot: plan?.find((p) => p.lesson === n), live: day === today && now >= toMinutes(start) && now < toMinutes(end) };
  });

  return (
    <MobileScreen>
      <ScreenHeader title="Horario" subtitle={`Sección ${kid.section} · jornada nocturna`} />
      <div className="screen-body gap-14">
        <KidPicker f={f} />
        <div className="day-tabs" role="tablist" aria-label="Día">
          {SCHOOL_DAYS.map((d) => (
            <button key={d.id} type="button" role="tab" aria-selected={d.id === day} className="day-tabs__item" onClick={() => setDay(d.id)}>
              <span>{d.short}</span>
              {d.id === today && <span className="day-tabs__today">Hoy</span>}
            </button>
          ))}
        </div>

        <section className="card card--mobile" style={{ padding: '6px 16px', gap: 0 }} aria-label={`Horario del ${SCHOOL_DAYS.find((d) => d.id === day)!.full}`}>
          {!plan ? (
            <p className="text-sm muted" style={{ padding: '12px 0' }}>
              Cargando…
            </p>
          ) : plan.length === 0 ? (
            <p className="text-sm muted" style={{ padding: '12px 0' }}>
              El colegio aún no ha cargado el horario de este día.
            </p>
          ) : (
            rows.map((r) =>
              r.isBreak ? (
                <div key={r.name} className="tt-row tt-row--break" data-now={r.live}>
                  <span className="tt-row__time">{r.start}</span>
                  <span className="text-sm muted">{r.name}</span>
                </div>
              ) : (
                <div key={r.name} className="tt-row" data-now={r.live}>
                  <span className="tt-row__time">
                    {r.start}
                    <span className="text-xs muted">{r.end}</span>
                  </span>
                  <span className="stack grow">
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.slot?.subject || 'Sin lección'}</span>
                    {r.slot?.teacher && <span className="text-xs muted">{r.slot.teacher}</span>}
                  </span>
                  {r.live && <Badge tone="blue">Ahora</Badge>}
                </div>
              ),
            )
          )}
        </section>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
