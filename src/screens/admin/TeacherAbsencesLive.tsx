import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, InputField, StatusBadge, Switch } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { ABSENCE_REASONS, COVERAGE, type Coverage } from '../../data/teacherAbsences';
import { SCHOOL_DAYS } from '../../data/schedule';
import { useAuth } from '../../lib/auth';
import { LESSONS, localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

interface Slot {
  sectionId: string;
  section: string;
  lesson: number;
  subject: string;
  teacherId: string;
  last: boolean;
}

interface Absence {
  id: string;
  teacher: string;
  reason: string;
  lessons: Array<{ section: string; lesson: number; type: Coverage; substitute: string }>;
}

type Plan = Record<string, { coverage: Coverage; substitute: string }>;

const key = (s: Pick<Slot, 'sectionId' | 'lesson'>) => `${s.sectionId}-${s.lesson}`;
const dayOf = (date: string) => SCHOOL_DAYS[new Date(date + 'T00:00:00').getDay() - 1]?.id ?? null;

/** Dirección · Ausencias de docentes, with substitutes who take the roll call. */
export function TeacherAbsencesLive() {
  const { school, session } = useAuth();
  const [date, setDate] = useState(localDate());
  const [teachers, setTeachers] = useState<Array<{ id: string; nombre: string }>>([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [students, setStudents] = useState<Map<string, number>>(new Map());
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState(ABSENCE_REASONS[0]);
  const [plan, setPlan] = useState<Plan>({});
  const [earlyExit, setEarlyExit] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const day = dayOf(date);

  const load = useCallback(async () => {
    const db = supabase!;
    const [p, h, st, a] = await Promise.all([
      db.from('personal').select('id, nombre, roles').eq('activo', true).order('nombre'),
      day ? db.from('horario').select('seccion_id, leccion, docente_id, secciones(nombre), materias(nombre)').eq('dia', day) : Promise.resolve({ data: [] }),
      db.from('estudiantes').select('seccion_id').eq('activo', true),
      db.from('ausencias_docentes').select('id, motivo, personal!ausencias_docentes_docente_id_fkey(nombre), coberturas(seccion_id, leccion, tipo, sustituto_id)').eq('fecha', date),
    ]);
    const staff = (p.data ?? []).filter((x) => (x.roles as string[]).includes('doc'));
    setTeachers(staff);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((h.data ?? []) as any[]).filter((r) => r.docente_id);
    setSlots(
      rows.map((r) => ({
        sectionId: r.seccion_id,
        section: r.secciones?.nombre ?? '',
        lesson: r.leccion,
        subject: r.materias?.nombre ?? '',
        teacherId: r.docente_id,
        last: !rows.some((x) => x.seccion_id === r.seccion_id && x.leccion > r.leccion),
      })),
    );
    const counts = new Map<string, number>();
    (st.data ?? []).forEach((s) => counts.set(s.seccion_id, (counts.get(s.seccion_id) ?? 0) + 1));
    setStudents(counts);
    const names = new Map(staff.map((t) => [t.id, t.nombre]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secName = new Map(rows.map((r: any) => [r.seccion_id, r.secciones?.nombre ?? '']));
    setAbsences(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((a.data ?? []) as any[]).map((x) => ({
        id: x.id,
        teacher: x.personal?.nombre ?? '',
        reason: x.motivo,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lessons: (x.coberturas ?? []).map((c: any) => ({ section: secName.get(c.seccion_id) ?? '', lesson: c.leccion, type: c.tipo, substitute: names.get(c.sustituto_id) ?? '' })),
      })),
    );
  }, [date, day]);

  useEffect(() => {
    load();
  }, [load]);

  const withLessons = teachers.filter((t) => slots?.some((s) => s.teacherId === t.id));
  const current = teacherId || withLessons[0]?.id || '';
  const lessons = (slots ?? []).filter((s) => s.teacherId === current).sort((a, b) => a.lesson - b.lesson);
  const already = absences.some((a) => a.teacher === teachers.find((t) => t.id === current)?.nombre);
  // Teachers free at that lesson, so they can cover it.
  const freeAt = (lesson: number) => teachers.filter((t) => t.id !== current && !(slots ?? []).some((s) => s.teacherId === t.id && s.lesson === lesson));
  const planOf = (s: Slot) => plan[key(s)] ?? { coverage: (s.last ? 'free' : 'sub') as Coverage, substitute: freeAt(s.lesson)[0]?.id ?? '' };
  const setOne = (s: Slot, patch: Partial<Plan[string]>) => {
    setPlan({ ...plan, [key(s)]: { ...planOf(s), ...patch } });
    setMsg(null);
  };
  const freeLessons = lessons.filter((s) => planOf(s).coverage === 'free');
  const families = freeLessons.reduce((n, s) => n + (students.get(s.sectionId) ?? 0), 0);

  const save = async () => {
    if (lessons.some((s) => planOf(s).coverage === 'sub' && !planOf(s).substitute)) return setMsg({ ok: false, text: 'Elija un sustituto para cada lección con sustituto.' });
    setBusy(true);
    const db = supabase!;
    const { data: me } = await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle();
    const { data: abs, error } = await db
      .from('ausencias_docentes')
      .insert({ colegio_id: school!.id, docente_id: current, fecha: date, motivo: reason, salida_temprana: earlyExit, registrado_por: me?.id ?? null })
      .select('id')
      .single();
    if (error) {
      setBusy(false);
      return setMsg({ ok: false, text: error.code === '23505' ? 'Este docente ya tiene una ausencia registrada ese día.' : error.message });
    }
    const { error: e2 } = await db.from('coberturas').insert(
      lessons.map((s) => {
        const p = planOf(s);
        return { ausencia_id: abs.id, seccion_id: s.sectionId, leccion: s.lesson, tipo: p.coverage, sustituto_id: p.coverage === 'sub' ? p.substitute : null };
      }),
    );
    setBusy(false);
    if (e2) return setMsg({ ok: false, text: e2.message });
    setMsg({ ok: true, text: families ? `Ausencia registrada. Se avisó a las familias de ${families} estudiantes.` : 'Ausencia registrada. Los sustitutos ya la ven en su pase de lista.' });
    setPlan({});
    load();
  };

  const remove = async (id: string) => {
    await supabase!.from('ausencias_docentes').delete().eq('id', id);
    load();
  };

  const lessonName = (n: number) => `${LESSONS[n - 1]?.name} · ${LESSONS[n - 1]?.start}`;

  return (
    <AdminLayout>
      <PageHeader kicker="Jornada nocturna · los sustitutos pasan lista en las lecciones que cubren" title="Ausencias de docentes" />

      <div className="split">
        <section aria-labelledby="nueva-t" className="card card--roomy split__main">
          <h2 id="nueva-t" className="title-section">
            Registrar ausencia
          </h2>
          <div className="row wrap gap-12">
            <InputField id="d-fecha" label="Fecha" type="date" value={date} onChange={(e) => (setDate(e.target.value), setTeacherId(''), setPlan({}))} style={{ width: 180 }} />
            <div className="field" style={{ minWidth: 240 }}>
              <label htmlFor="d-docente" className="field__label">
                Docente
              </label>
              <select id="d-docente" className="input" value={current} onChange={(e) => (setTeacherId(e.target.value), setPlan({}), setMsg(null))}>
                {withLessons.length === 0 && <option value="">Nadie tiene lecciones ese día</option>}
                {withLessons.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
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

          <div className="stack gap-10">
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>Lecciones de ese día</h3>
            {!slots && <span className="text-sm muted">Cargando…</span>}
            {slots && lessons.length === 0 && <span className="text-sm muted">Cargue el horario en Profesores y secciones para ver sus lecciones.</span>}
            {lessons.map((s) => {
              const p = planOf(s);
              const options = freeAt(s.lesson);
              return (
                <div key={key(s)} className="stack gap-10" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                  <div className="row wrap between gap-8">
                    <span className="stack">
                      <span style={{ fontSize: 15, fontWeight: 700 }}>
                        {s.subject} · {s.section}
                      </span>
                      <span className="text-sm muted">
                        {lessonName(s.lesson)} · {students.get(s.sectionId) ?? 0} estudiantes{s.last ? ' · última lección del día' : ''}
                      </span>
                    </span>
                    <StatusBadge status={COVERAGE[p.coverage]} />
                  </div>
                  <div className="row wrap gap-8" role="group" aria-label={`Qué pasa con ${s.subject} ${s.section}`}>
                    {(Object.keys(COVERAGE) as Coverage[]).map((c) => (
                      <button key={c} type="button" className="chip chip--square" aria-pressed={p.coverage === c} onClick={() => setOne(s, { coverage: c })}>
                        {COVERAGE[c].label}
                      </button>
                    ))}
                  </div>
                  {p.coverage === 'sub' && (
                    <div className="row wrap gap-8">
                      <label htmlFor={`sub-${key(s)}`} className="text-sm" style={{ fontWeight: 600 }}>
                        Sustituto
                      </label>
                      <select id={`sub-${key(s)}`} className="input" style={{ height: 40, minWidth: 200 }} value={p.substitute} onChange={(e) => setOne(s, { substitute: e.target.value })}>
                        {options.length === 0 && <option value="">Nadie libre a esa hora</option>}
                        {options.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <span className="text-xs muted">{COVERAGE[p.coverage].help}</span>
                </div>
              );
            })}
          </div>

          {freeLessons.some((s) => s.last) && (
            <div className="setting-row">
              <span className="stack grow">
                <span className="setting-row__label">Ofrecer salida anticipada</span>
                <span className="setting-row__help">Los encargados de menores pueden autorizarla desde el aviso. Los mayores de edad salen sin autorización.</span>
              </span>
              <Switch label="Ofrecer salida anticipada" checked={earlyExit} onChange={setEarlyExit} />
            </div>
          )}

          <div className="row wrap between gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            {msg ? (
              <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
                {msg.text}
              </span>
            ) : (
              <span className="text-sm muted">{already ? 'Este docente ya tiene una ausencia registrada ese día.' : 'Los sustitutos reciben las lecciones en su pase de lista.'}</span>
            )}
            <Button variant="primary" style={{ height: 48, padding: '0 22px' }} onClick={save} disabled={busy || !lessons.length || already}>
              {busy ? 'Guardando…' : families > 0 ? `Registrar y avisar a ${families} familias` : 'Registrar ausencia'}
            </Button>
          </div>
        </section>
      </div>

      <section aria-labelledby="hoy-t" className="card gap-10">
        <h2 id="hoy-t" className="title-section">
          Ausencias registradas ese día
        </h2>
        {absences.length === 0 ? (
          <p className="text-sm muted">Ninguna.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Docente</th>
                  <th>Motivo</th>
                  <th>Lecciones</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {absences.map((a) => (
                  <tr key={a.id}>
                    <td className="strong">{a.teacher}</td>
                    <td>{a.reason}</td>
                    <td>
                      <span className="stack gap-4">
                        {a.lessons
                          .sort((x, y) => x.lesson - y.lesson)
                          .map((l) => (
                            <span key={l.section + l.lesson} className="row wrap gap-8">
                              <span>
                                {l.lesson}.ª · {l.section}
                              </span>
                              <StatusBadge status={COVERAGE[l.type]} />
                              {l.substitute && <span className="text-sm muted">{l.substitute}</span>}
                            </span>
                          ))}
                      </span>
                    </td>
                    <td>
                      {a.lessons.some((l) => l.type === 'free') && <Badge tone="green">Familias avisadas</Badge>}{' '}
                      <button type="button" className="link-button text-sm" onClick={() => remove(a.id)}>
                        Anular
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
