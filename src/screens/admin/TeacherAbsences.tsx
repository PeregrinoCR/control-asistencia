import { useState } from 'react';
import { Badge, Button, EmptyState, InputField, Stat, StatusBadge, Switch } from '../../components';
import { IncapacityCard } from './IncapacityCard';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { lectivos, SUSTITUCION, type Sustitucion } from '../../lib/ausencias';
import { supabase } from '../../lib/supabase';
import { TeacherAbsencesLive } from './TeacherAbsencesLive';
import { SCHOOL_NAME } from '../../data/school';
import {
  ABSENCE_REASONS,
  COVERAGE,
  TEACHERS_WITH_LESSONS,
  TEACHER_ABSENCES,
  TEACHER_INCAPACITIES,
  TEACHER_LESSONS_TODAY,
  type Coverage,
  type TeacherAbsence,
} from '../../data/teacherAbsences';

type Plan = Record<number, { coverage: Coverage }>;

/** A colleague no longer covers lessons: they stay free, or the group works in the classroom. */
const OPTIONS: Coverage[] = ['free', 'task'];

const freshPlan = (teacher: string): Plan =>
  Object.fromEntries(TEACHER_LESSONS_TODAY[teacher].map((_, i) => [i, { coverage: 'free' }]));

/** Families get a message only for lessons that change for them. */
function familyMessage(a: Pick<TeacherAbsence, 'lessons'>, earlyExit: boolean) {
  const free = a.lessons.filter((l) => l.coverage === 'free');
  if (free.length === 0) return null;
  const l = free[0];
  return {
    title: `${l.subject} (${l.section}) no tendrá lección hoy`,
    body:
      `La lección de las ${l.time} queda libre por ausencia del docente.` +
      (l.last && earlyExit
        ? ' Los menores de edad pueden salir antes si usted lo autoriza en la app; si no, se quedan en el colegio hasta la hora de salida.'
        : ' El grupo permanece en el colegio.'),
  };
}

/** Dirección · Ausencias de docentes */
export function TeacherAbsences() {
  return supabase ? <TeacherAbsencesLive /> : <TeacherAbsencesSample />;
}

/** The sample screen, shown while no server is configured. */
function TeacherAbsencesSample() {
  const [absences, setAbsences] = useState(TEACHER_ABSENCES);
  const [teacher, setTeacher] = useState('Karla Montero');
  const [reason, setReason] = useState(ABSENCE_REASONS[1]);
  const [from] = useState('2026-10-19');
  const [until, setUntil] = useState('2026-10-30');
  const [substitution, setSubstitution] = useState<Sustitucion>('ninguno');
  const isIncapacity = reason === 'Incapacidad';
  const days = lectivos(from, until).length;
  const [plan, setPlan] = useState<Plan>(freshPlan('Karla Montero'));
  const [earlyExit, setEarlyExit] = useState(true);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  const lessons = TEACHER_LESSONS_TODAY[teacher];
  const draft = { lessons: lessons.map((l, i) => ({ ...l, ...plan[i] })) };
  const message = familyMessage(draft, earlyExit);
  const families = draft.lessons.filter((l) => l.coverage === 'free').reduce((n, l) => n + l.students, 0);
  const alreadyReported = absences.some((a) => a.teacher === teacher);

  const pickTeacher = (t: string) => {
    setTeacher(t);
    setPlan(freshPlan(t));
    setJustSaved(null);
  };

  const save = () => {
    setAbsences([
      ...absences,
      {
        id: absences.length + 1,
        teacher,
        reason,
        date: 'Lun 19 oct',
        reportedBy: 'Dirección · ahora',
        lessons: draft.lessons,
        notified: families > 0,
        incapacity: isIncapacity ? { from: 'lun 19 oct', to: 'vie 30 oct', days, substitution } : undefined,
      },
    ]);
    setJustSaved(
      isIncapacity
        ? `Incapacidad registrada: ${days} días lectivos. Las lecciones quedan libres y se avisa a las familias cada día.`
        : families > 0
          ? `Ausencia registrada. Se avisó a ${families} familias y estudiantes.`
          : 'Ausencia registrada. El grupo queda con trabajo asignado.',
    );
  };

  const freeToday = absences.reduce((n, a) => n + a.lessons.filter((l) => l.coverage === 'free').length, 0);
  const waiting = TEACHER_INCAPACITIES.filter((i) => i.substitution === 'esperando').length;

  return (
    <AdminLayout>
      <PageHeader kicker="Lunes 19 de octubre · jornada nocturna" title="Ausencias de docentes" />

      <div className="grid-tiles">
        <Stat label="Ausentes hoy" value={String(absences.length)} />
        <Stat label="Incapacidades en curso" value={String(TEACHER_INCAPACITIES.length)} />
        <Stat label="Esperan sustituto del MEP" value={String(waiting)} ink={waiting ? 'amber' : undefined} />
        <Stat label="Lecciones libres hoy" value={String(freeToday)} />
      </div>

      <div className="split">
        <div className="split__main stack gap-16" style={{ flex: '1 1 420px' }}>
          <section aria-labelledby="inc-t" className="card gap-10">
            <h2 id="inc-t" className="title-section">
              Incapacidades en curso
            </h2>
            {TEACHER_INCAPACITIES.map((i) => (
              <IncapacityCard key={i.teacher} {...i} elapsed={i.elapsed} total={i.total}>
                <div className="row wrap gap-8">
                  {i.substitution === 'esperando' && <Button variant="primary">Registrar sustituto nombrado</Button>}
                  {i.substitution === 'nombrado' && <Button>Cambiar sustituto</Button>}
                  <Button>Cambiar fecha final</Button>
                  <Button variant="ghost-danger">Ya regresó</Button>
                </div>
              </IncapacityCard>
            ))}
          </section>

          <section aria-labelledby="hoy-t" className="card gap-10">
            <h2 id="hoy-t" className="title-section">
              Ausentes hoy
            </h2>
            {absences.length === 0 ? (
              <EmptyState title="Nadie falta hoy">Registre una ausencia en el panel de la derecha.</EmptyState>
            ) : (
              <div className="stack">
                {absences.map((a) => (
                  <div key={a.id} className="absence-row">
                    <span className="stack">
                      <strong style={{ fontSize: 15 }}>{a.teacher}</strong>
                      <span className="text-sm muted">
                        {a.reason}
                        {a.incapacity && ` · día ${a.incapacity.substitution === 'nombrado' ? 6 : 1} de ${a.incapacity.days}`}
                      </span>
                    </span>
                    <span className="row wrap gap-6 absence-lessons">
                      {a.lessons.map((l) => (
                        <StatusBadge
                          key={l.section + l.time}
                          size="md"
                          status={{ label: `${l.section} · ${l.time} · ${l.coverage === 'sub' ? `da ${l.substitute}` : l.coverage === 'task' ? 'trabajo asignado' : 'libre'}`, tone: COVERAGE[l.coverage].tone }}
                        />
                      ))}
                    </span>
                    <span className="absence-status">{a.notified ? <Badge tone="green">Familias avisadas</Badge> : <span className="text-sm muted">Sin aviso: no cambia nada</span>}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside aria-labelledby="nueva-t" className="split__side split__side--sticky stack gap-16" style={{ flex: '1 1 480px' }}>
          <section className="card gap-12" style={{ padding: 20 }}>
            <h2 id="nueva-t" className="title-section">
              Registrar ausencia
            </h2>
          <div className="field">
            <label htmlFor="d-docente" className="field__label">
              Docente
            </label>
            <select id="d-docente" className="input" value={teacher} onChange={(e) => pickTeacher(e.target.value)}>
              {TEACHERS_WITH_LESSONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>

          <fieldset className="fieldset">
            <legend>Motivo</legend>
            <div className="row wrap gap-8">
              {ABSENCE_REASONS.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={r === reason} onClick={() => setReason(r)}>
                  {r}
                </button>
              ))}
            </div>
            <span className="text-sm muted" style={{ display: 'block', marginTop: 8 }}>
              Las familias no ven el motivo, solo que la lección cambia.
            </span>
          </fieldset>

          {isIncapacity ? (
            <>
              <div className="row wrap gap-12">
                <InputField id="d-desde" label="Desde" type="date" value={from} readOnly style={{ width: 180 }} />
                <InputField id="d-hasta" label="Hasta" type="date" min={from} value={until} onChange={(e) => setUntil(e.target.value)} style={{ width: 180 }} />
              </div>
              <div className="notice">{days} días lectivos (de lunes a viernes; los feriados se cuentan, ajuste la fecha final si hace falta).</div>
              <fieldset className="fieldset">
                <legend>¿Habrá sustituto del MEP?</legend>
                <div className="row wrap gap-8">
                  {(Object.keys(SUSTITUCION) as Sustitucion[]).map((x) => (
                    <button key={x} type="button" className="chip" aria-pressed={substitution === x} onClick={() => setSubstitution(x)}>
                      {x === 'ninguno' ? 'No por ahora' : x === 'esperando' ? 'Lo estoy pidiendo al MEP' : 'Ya hay un sustituto nombrado'}
                    </button>
                  ))}
                </div>
                <span className="text-sm muted" style={{ display: 'block', marginTop: 8 }}>
                  {SUSTITUCION[substitution].help}
                </span>
              </fieldset>
            </>
          ) : (
          <div className="stack gap-10">
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Lecciones de hoy</h3>
            {lessons.map((l, i) => {
              const p = plan[i];
              return (
                <div key={l.section + l.time} className="stack gap-10" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <div className="row wrap between gap-8">
                    <span className="stack">
                      <span className="title-item">
                        {l.subject} · {l.section}
                      </span>
                      <span className="text-sm muted">
                        {l.time} · {l.students} estudiantes{l.last ? ' · última lección del día' : ''}
                      </span>
                    </span>
                    <StatusBadge status={COVERAGE[p.coverage]} />
                  </div>
                  <div className="row wrap gap-8" role="group" aria-label={`Qué pasa con ${l.subject} ${l.section}`}>
                    {OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="chip chip--square"
                        aria-pressed={p.coverage === c}
                        onClick={() => setPlan({ ...plan, [i]: { coverage: c } })}
                      >
                        {COVERAGE[c].label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs muted">{COVERAGE[p.coverage].help}</span>
                </div>
              );
            })}
          </div>
          )}

          {!isIncapacity && draft.lessons.some((l) => l.coverage === 'free' && l.last) && (
            <div className="setting-row">
              <span className="stack grow">
                <span className="setting-row__label">Ofrecer salida anticipada</span>
                <span className="setting-row__help">
                  Los encargados de menores pueden autorizarla desde el aviso. Los mayores de edad salen sin autorización.
                </span>
              </span>
              <Switch label="Ofrecer salida anticipada" checked={earlyExit} onChange={setEarlyExit} />
            </div>
          )}

          <div className="row wrap between gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            {justSaved ? (
              <span role="status" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-ink)' }}>
                {justSaved}
              </span>
            ) : (
              <span className="text-sm muted">
                {alreadyReported ? 'Este docente ya tiene una ausencia registrada hoy.' : 'Un docente ausente no se reemplaza: sus lecciones quedan libres.'}
              </span>
            )}
            <Button variant="primary" style={{ height: 48, padding: '0 22px' }} onClick={save} disabled={!!justSaved}>
              {isIncapacity ? 'Registrar incapacidad' : families > 0 ? `Registrar y avisar a ${families} familias` : 'Registrar ausencia'}
            </Button>
          </div>
          </section>

          <div className="card card--night gap-10">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7, color: 'var(--night-ink-3)' }}>
              Así llega a las familias
            </span>
            {message ? (
              <div className="notif" style={{ borderRadius: 18, padding: 14 }}>
                <div className="row gap-8">
                  <span className="notif__app" style={{ background: 'var(--amber)' }} />
                  <span className="notif__meta grow" style={{ fontWeight: 600 }}>
                    Lecciones · {SCHOOL_NAME}
                  </span>
                  <span className="notif__meta">ahora</span>
                </div>
                <span className="notif__title">{message.title}</span>
                <span className="notif__body" style={{ fontSize: 14 }}>
                  {message.body}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: 14, color: 'var(--night-ink-4)' }}>
                Todas las lecciones quedan cubiertas. Las familias no reciben aviso.
              </span>
            )}
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
