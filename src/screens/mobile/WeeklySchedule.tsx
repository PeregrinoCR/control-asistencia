import { useState } from 'react';
import { Badge, Segmented } from '../../components';
import { FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { CHILDREN, type Child } from '../../data/family';
import { NOW_MINUTES, SCHOOL_DAYS, TIMETABLES, TODAY, dayTimetable, type DayId } from '../../data/schedule';
import { EXAMS } from '../../data/settings';

/** Familia · Horario semanal of each child's section, with today's changes and upcoming tests. */
export function WeeklySchedule() {
  const [childId, setChildId] = useState<Child['id']>('M');
  const [day, setDay] = useState<DayId>(TODAY);
  const child = CHILDREN.find((c) => c.id === childId)!;
  const rows = dayTimetable(child.section, day);
  const isToday = day === TODAY;
  const exams = EXAMS.filter((x) => x.section === child.section && x.published);

  return (
    <MobileScreen>
      <ScreenHeader title="Horario" subtitle={`Sección ${child.section} · jornada nocturna · ${TIMETABLES[child.section].room}`} />
      <div className="screen-body gap-14">
        <Segmented
          label="Estudiante"
          fill
          value={childId}
          onChange={setChildId}
          options={CHILDREN.map((c) => ({ value: c.id, label: `${c.short} · ${c.section}` }))}
        />

        <div className="day-tabs" role="tablist" aria-label="Día">
          {SCHOOL_DAYS.map((d) => (
            <button key={d.id} type="button" role="tab" aria-selected={d.id === day} className="day-tabs__item" onClick={() => setDay(d.id)}>
              <span>{d.short}</span>
              {d.id === TODAY && <span className="day-tabs__today">Hoy</span>}
            </button>
          ))}
        </div>

        <section className="card card--mobile" style={{ padding: '6px 16px', gap: 0 }} aria-label={`Horario del ${SCHOOL_DAYS.find((d) => d.id === day)!.full}`}>
          {rows.map((r) => {
            const now = isToday && NOW_MINUTES >= r.from && NOW_MINUTES < r.to;
            const change = isToday ? child.today.find((l) => l.time === r.start)?.change : undefined;
            if (r.kind === 'break') {
              return (
                <div key={r.name} className="tt-row tt-row--break" data-now={now}>
                  <span className="tt-row__time">{r.start}</span>
                  <span className="text-sm muted">{r.name}</span>
                </div>
              );
            }
            return (
              <div key={r.name} className="tt-row" data-now={now} data-free={change?.kind === 'free'}>
                <span className="tt-row__time">
                  {r.start}
                  <span className="text-xs muted">{r.end}</span>
                </span>
                <span className="stack grow">
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{r.subject}</span>
                  <span className="text-xs muted">
                    {change?.kind === 'sub' ? `Sustituye: ${change.substitute}` : change?.kind === 'free' ? `${r.teacher} no viene hoy` : r.teacher}
                  </span>
                </span>
                {now && <Badge tone="blue">Ahora</Badge>}
                {change?.kind === 'free' && <Badge tone="amber">Libre</Badge>}
                {change?.kind === 'sub' && !now && <Badge tone="neutral">Sustituto</Badge>}
              </div>
            );
          })}
        </section>

        <section className="card card--mobile gap-8" aria-labelledby="pruebas-t">
          <h2 id="pruebas-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Próximas pruebas
          </h2>
          {exams.length === 0 ? (
            <span className="text-sm muted">No hay pruebas publicadas para la sección {child.section}.</span>
          ) : (
            exams.map((x) => (
              <div key={x.date + x.subject} className="list-row" style={{ padding: '8px 0' }}>
                <span className="stack grow">
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{x.subject}</span>
                  <span className="text-xs muted">
                    {x.teacher} · {x.room}
                  </span>
                </span>
                <span className="stack" style={{ textAlign: 'right' }}>
                  <span className="text-sm strong">{x.date}</span>
                  <span className="text-xs muted tabular">{x.time}</span>
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
