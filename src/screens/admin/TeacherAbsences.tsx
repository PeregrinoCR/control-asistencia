import { useState } from 'react';
import { Badge, Button, InputField, StatusBadge, Switch } from '../../components';
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

  return (
    <AdminLayout>
      <PageHeader
        kicker="Lunes 19 de octubre · jornada nocturna"
        title="Ausencias de docentes"
      />

      <div className="split">
        <section aria-labelledby="nueva-t" className="card card--roomy split__main">
          <h2 id="nueva-t" className="title-section">
            Registrar ausencia
          </h2>

          <div className="field" style={{ maxWidth: 360 }}>
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
                      <span style={{ fontSize: 15, fontWeight: 700 }}>
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

        <aside className="split__side stack gap-16">
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

      <section aria-labelledby="hoy-t" className="card gap-10">
        <h2 id="hoy-t" className="title-section">
          Ausencias registradas hoy
        </h2>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Docente</th>
                <th>Motivo</th>
                <th>Lecciones</th>
                <th>Avisos</th>
                <th>Registró</th>
              </tr>
            </thead>
            <tbody>
              {absences.map((a) => (
                <tr key={a.id}>
                  <td className="strong">{a.teacher}</td>
                  <td>
                    {a.reason}
                    {a.incapacity && (
                      <span className="stack gap-4" style={{ marginTop: 4 }}>
                        <span className="text-sm muted">
                          {a.incapacity.from} a {a.incapacity.to} · {a.incapacity.days} días
                        </span>
                        <StatusBadge status={SUSTITUCION[a.incapacity.substitution]} />
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="stack gap-4">
                      {a.lessons.map((l) => (
                        <span key={l.section + l.time} className="row wrap gap-8">
                          <span>
                            {l.time} · {l.subject} {l.section}
                          </span>
                          <StatusBadge status={COVERAGE[l.coverage]} />
                          {l.substitute && <span className="text-sm muted">{l.substitute}</span>}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td>
                    <Badge tone={a.notified ? 'green' : 'neutral'}>{a.notified ? 'Familias avisadas' : 'Sin aviso'}</Badge>
                  </td>
                  <td className="text-sm muted">{a.reportedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
