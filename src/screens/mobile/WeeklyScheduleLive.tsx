import { useEffect, useState } from 'react';
import { Badge } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { SHIFT_BLOCKS } from '../../data/settings';
import { SCHOOL_DAYS, type DayId } from '../../data/schedule';
import { aulaDe, proximaFecha, SIN_CONFIG, type AulasConfig } from '../../lib/aulas';
import { sectionDay } from '../../lib/family';
import { localDate, todayId } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import type { Exam } from '../admin/SettingsLive';
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
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<AulasConfig>(SIN_CONFIG);

  useEffect(() => {
    supabase!
      .from('colegios')
      .select('config')
      .maybeSingle()
      .then(({ data }) => {
        const cfg = data?.config ?? {};
        setExams(
          ((cfg.pruebas ?? []) as Exam[])
            .filter((x) => x.publicada && x.seccion === kid.section && x.fecha >= localDate())
            .sort((a, b) => a.fecha.localeCompare(b.fecha)),
        );
        setRooms({ ...SIN_CONFIG, aulasGrupo: cfg.aulasGrupo ?? {}, eventosAula: cfg.eventosAula ?? [] });
      });
  }, [kid]);

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
    return {
      name,
      start,
      end,
      isBreak,
      slot: plan?.find((p) => p.lesson === n),
      room: aulaDe(rooms, kid.section, proximaFecha(day)),
      live: day === today && now >= toMinutes(start) && now < toMinutes(end),
    };
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
                    {r.slot && r.room && <span className="text-xs muted">{r.room}</span>}
                  </span>
                  {r.live && <Badge tone="blue">Ahora</Badge>}
                </div>
              ),
            )
          )}
        </section>

        <section className="card card--mobile gap-8" aria-labelledby="pruebas-t">
          <h2 id="pruebas-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Próximas pruebas
          </h2>
          {exams.length === 0 ? (
            <span className="text-sm muted">No hay pruebas publicadas para la sección {kid.section}.</span>
          ) : (
            exams.map((x) => (
              <div key={x.id} className="list-row" style={{ padding: '8px 0' }}>
                <span className="stack grow">
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{x.materia}</span>
                  {x.aula && <span className="text-xs muted">{x.aula}</span>}
                </span>
                <span className="stack" style={{ textAlign: 'right' }}>
                  <span className="text-sm strong">{new Date(x.fecha + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="text-xs muted tabular">{x.hora}</span>
                </span>
              </div>
            ))
          )}
        </section>
      </div>
      <FamilyTabBar />
    </MobileScreen>
  );
}
