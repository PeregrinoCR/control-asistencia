import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, InputField, StatusBadge, Switch, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { ABSENCE_REASONS, COVERAGE, type Coverage } from '../../data/teacherAbsences';
import { SCHOOL_DAYS } from '../../data/schedule';
import { diaAnterior, fechaCorta, lectivos, prepararCoberturas, SUSTITUCION, type Sustitucion } from '../../lib/ausencias';
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

/** A long incapacity, with the state of the substitute the MEP may name. */
interface Incapacity {
  id: string;
  teacher: string;
  from: string;
  to: string;
  substitution: Sustitucion;
  substitute: string;
  substituteFrom: string | null;
  created: string;
}

/** What the director is editing on an incapacity: the substitute, or the end date. */
interface Edit {
  id: string;
  mode: 'sust' | 'fin';
  substitute: string;
  date: string;
}

/** Only these two exist for an ordinary absence: a colleague no longer covers lessons. */
const OPTIONS: Coverage[] = ['free', 'task'];
type Plan = Record<string, Coverage>;

const key = (s: Pick<Slot, 'sectionId' | 'lesson'>) => `${s.sectionId}-${s.lesson}`;
const dayOf = (date: string) => SCHOOL_DAYS[new Date(date + 'T00:00:00').getDay() - 1]?.id ?? null;
const INCAPACITY = 'Incapacidad';

/** Dirección · Ausencias de docentes: lessons stay free; only a long incapacity can get a substitute named by the MEP. */
export function TeacherAbsencesLive() {
  const { school, session } = useAuth();
  const [date, setDate] = useState(localDate());
  const [until, setUntil] = useState(localDate());
  const [teachers, setTeachers] = useState<Array<{ id: string; nombre: string }>>([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [students, setStudents] = useState<Map<string, number>>(new Map());
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [incapacities, setIncapacities] = useState<Incapacity[]>([]);
  const [threshold, setThreshold] = useState(0);
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState(ABSENCE_REASONS[1]);
  const [plan, setPlan] = useState<Plan>({});
  const [earlyExit, setEarlyExit] = useState(true);
  const [substitution, setSubstitution] = useState<Sustitucion>('ninguno');
  const [substituteId, setSubstituteId] = useState('');
  const [substituteFrom, setSubstituteFrom] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [msg, setMsg] = useFlash();
  const [busy, setBusy] = useState(false);
  const day = dayOf(date);
  const today = localDate();
  const isIncapacity = reason === INCAPACITY;

  const load = useCallback(async () => {
    const db = supabase!;
    // Today's lessons for a teacher on a long incapacity are created by the server; make sure they exist.
    await prepararCoberturas();
    const [p, h, st, a, inc, cfg] = await Promise.all([
      db.from('personal').select('id, nombre, roles').eq('activo', true).order('nombre'),
      day ? db.from('horario').select('seccion_id, leccion, docente_id, secciones(nombre), materias(nombre)').eq('dia', day) : Promise.resolve({ data: [] }),
      db.from('estudiantes').select('seccion_id').eq('activo', true),
      db.from('ausencias_docentes').select('id, motivo, personal!ausencias_docentes_docente_id_fkey(nombre), coberturas(seccion_id, leccion, tipo, sustituto_id)').eq('fecha', date),
      db
        .from('incapacidades')
        .select('id, desde, hasta, sustitucion, sustituto_desde, creado, personal!incapacidades_docente_id_fkey(nombre), sustituto:personal!incapacidades_sustituto_id_fkey(nombre)')
        .gte('hasta', today)
        .order('desde'),
      db.from('colegios').select('config').maybeSingle(),
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
    setIncapacities(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((inc.data ?? []) as any[]).map((x) => ({
        id: x.id,
        teacher: x.personal?.nombre ?? '',
        from: x.desde,
        to: x.hasta,
        substitution: x.sustitucion,
        substitute: x.sustituto?.nombre ?? '',
        substituteFrom: x.sustituto_desde,
        created: x.creado,
      })),
    );
    setThreshold(Number(cfg.data?.config?.institucion?.['c-incap-dias']) || 0);
  }, [date, day, today]);

  useEffect(() => {
    load();
  }, [load]);

  const withLessons = teachers.filter((t) => slots?.some((s) => s.teacherId === t.id));
  const current = teacherId || withLessons[0]?.id || '';
  const lessons = (slots ?? []).filter((s) => s.teacherId === current).sort((a, b) => a.lesson - b.lesson);
  const already = absences.some((a) => a.teacher === teachers.find((t) => t.id === current)?.nombre);
  const coverageOf = (s: Slot): Coverage => plan[key(s)] ?? 'free';
  const freeLessons = lessons.filter((s) => coverageOf(s) === 'free');
  const families = freeLessons.reduce((n, s) => n + (students.get(s.sectionId) ?? 0), 0);
  const candidates = teachers.filter((t) => t.id !== current);
  const days = isIncapacity ? lectivos(date, until).length : 1;
  const longEnough = threshold > 0 && days >= threshold && substitution === 'ninguno';

  const meId = async () => (await supabase!.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle()).data?.id ?? null;

  const saveShort = async () => {
    setBusy(true);
    const db = supabase!;
    const { data: abs, error } = await db
      .from('ausencias_docentes')
      .insert({ colegio_id: school!.id, docente_id: current, fecha: date, motivo: reason, salida_temprana: earlyExit, registrado_por: await meId() })
      .select('id')
      .single();
    if (error) {
      setBusy(false);
      return setMsg({ ok: false, text: error.code === '23505' ? 'Este docente ya tiene una ausencia registrada ese día.' : error.message });
    }
    const { error: e2 } = await db.from('coberturas').insert(
      lessons.map((s) => ({ ausencia_id: abs.id, seccion_id: s.sectionId, leccion: s.lesson, tipo: coverageOf(s), sustituto_id: null })),
    );
    setBusy(false);
    if (e2) return setMsg({ ok: false, text: e2.message });
    setMsg({ ok: true, text: families ? `Ausencia registrada. Se avisó a las familias de ${families} estudiantes.` : 'Ausencia registrada. El grupo queda con trabajo asignado.' });
    setPlan({});
    load();
  };

  const saveIncapacity = async () => {
    if (until < date) return setMsg({ ok: false, text: 'La fecha final no puede ser anterior a la inicial.' });
    if (substitution === 'nombrado' && !substituteId) return setMsg({ ok: false, text: 'Elija al sustituto nombrado. Si no está en la lista, agréguelo antes en Usuarios y permisos.' });
    setBusy(true);
    const { error } = await supabase!.rpc('registrar_incapacidad', {
      p_docente: current,
      p_desde: date,
      p_hasta: until,
      p_fechas: lectivos(date, until),
      p_estado: substitution,
      p_sustituto: substitution === 'nombrado' ? substituteId : null,
      p_sustituto_desde: substitution === 'nombrado' ? substituteFrom || date : null,
      p_registrada_por: await meId(),
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `Incapacidad registrada: ${days} ${days === 1 ? 'día lectivo' : 'días lectivos'}. Las lecciones quedan libres y se avisa a las familias cada día.` });
    setSubstitution('ninguno');
    setSubstituteId('');
    load();
  };

  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    const { error } = await supabase!.rpc(fn, args);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: ok });
    setEdit(null);
    load();
  };

  const remove = async (id: string) => {
    await supabase!.from('ausencias_docentes').delete().eq('id', id);
    load();
  };

  const lessonName = (n: number) => `${LESSONS[n - 1]?.name} · ${LESSONS[n - 1]?.start}`;
  const waiting = (c: string) => Math.max(0, Math.floor((Date.now() - new Date(c).getTime()) / 86400000));

  return (
    <AdminLayout>
      <PageHeader kicker="Un docente ausente no se reemplaza: sus lecciones quedan libres. Solo una incapacidad larga puede tener sustituto del MEP" title="Ausencias de docentes" />

      {incapacities.length > 0 && (
        <section aria-labelledby="inc-t" className="card gap-10">
          <h2 id="inc-t" className="title-section">
            Incapacidades vigentes
          </h2>
          <div className="stack">
            {incapacities.map((i) => {
              const st = SUSTITUCION[i.substitution];
              const total = lectivos(i.from, i.to).length;
              const editing = edit?.id === i.id ? edit : null;
              return (
                <div key={i.id} className="stack gap-8" style={{ padding: '12px 0', borderTop: '1px solid var(--border-soft)' }}>
                  <div className="row wrap between gap-8">
                    <span className="stack">
                      <strong style={{ fontSize: 15 }}>{i.teacher}</strong>
                      <span className="text-sm muted">
                        {fechaCorta(i.from)} a {fechaCorta(i.to)} · {total} {total === 1 ? 'día lectivo' : 'días lectivos'}
                      </span>
                    </span>
                    <span className="stack" style={{ alignItems: 'flex-end' }}>
                      <StatusBadge status={st} size="md" />
                      {i.substitution === 'nombrado' && (
                        <span className="text-sm muted">
                          {i.substitute}
                          {i.substituteFrom && ` · desde ${fechaCorta(i.substituteFrom)}`}
                        </span>
                      )}
                      {i.substitution === 'esperando' && <span className="text-sm muted">Pedido hace {waiting(i.created)} {waiting(i.created) === 1 ? 'día' : 'días'}</span>}
                    </span>
                  </div>
                  <span className="text-sm muted">{st.help}</span>
                  <div className="row wrap gap-8">
                    {i.substitution === 'ninguno' && (
                      <Button onClick={() => run('marcar_sustitucion', { p_inc: i.id, p_estado: 'esperando' }, 'Quedó como "esperando al MEP".')}>Pedí un sustituto al MEP</Button>
                    )}
                    {i.substitution === 'esperando' && (
                      <Button onClick={() => run('marcar_sustitucion', { p_inc: i.id, p_estado: 'ninguno' }, 'Quedó sin sustituto.')}>Ya no se pedirá</Button>
                    )}
                    <Button
                      variant={i.substitution === 'esperando' ? 'primary' : 'secondary'}
                      onClick={() => setEdit({ id: i.id, mode: 'sust', substitute: '', date: i.substituteFrom ?? today })}
                    >
                      {i.substitution === 'nombrado' ? 'Cambiar sustituto' : 'Registrar sustituto nombrado'}
                    </Button>
                    <Button onClick={() => setEdit({ id: i.id, mode: 'fin', substitute: '', date: i.to })}>Cambiar fecha final</Button>
                    <Button
                      variant="ghost-danger"
                      onClick={() => run('ajustar_incapacidad', { p_inc: i.id, p_hasta: diaAnterior(today), p_fechas: [] }, 'La incapacidad terminó: el docente regresa.')}
                    >
                      Ya regresó
                    </Button>
                  </div>
                  {editing?.mode === 'sust' && (
                    <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
                      <div className="field" style={{ minWidth: 220 }}>
                        <label htmlFor={`sus-${i.id}`} className="field__label">
                          Sustituto nombrado
                        </label>
                        <select id={`sus-${i.id}`} className="input" value={editing.substitute} onChange={(e) => setEdit({ ...editing, substitute: e.target.value })}>
                          <option value="">Elegir…</option>
                          {teachers
                            .filter((t) => t.nombre !== i.teacher)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.nombre}
                              </option>
                            ))}
                        </select>
                      </div>
                      <InputField id={`susd-${i.id}`} label="Da lecciones desde" type="date" value={editing.date} onChange={(e) => setEdit({ ...editing, date: e.target.value })} style={{ width: 170 }} />
                      <Button
                        variant="primary"
                        disabled={!editing.substitute}
                        onClick={() => run('nombrar_sustituto', { p_inc: i.id, p_sustituto: editing.substitute, p_desde: editing.date }, 'Sustituto registrado: recibe las lecciones en su pase de lista.')}
                      >
                        Guardar sustituto
                      </Button>
                      <Button onClick={() => setEdit(null)}>Cancelar</Button>
                      <span className="text-xs muted" style={{ flexBasis: '100%' }}>
                        Si el sustituto no aparece, agréguelo primero en Usuarios y permisos con el rol Docente.
                      </span>
                    </div>
                  )}
                  {editing?.mode === 'fin' && (
                    <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
                      <InputField id={`fin-${i.id}`} label="Nueva fecha final" type="date" min={i.from} value={editing.date} onChange={(e) => setEdit({ ...editing, date: e.target.value })} style={{ width: 170 }} />
                      <Button
                        variant="primary"
                        onClick={() => run('ajustar_incapacidad', { p_inc: i.id, p_hasta: editing.date, p_fechas: lectivos(i.to, editing.date) }, 'Fecha final actualizada.')}
                      >
                        Guardar fecha
                      </Button>
                      <Button onClick={() => setEdit(null)}>Cancelar</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="split">
        <section aria-labelledby="nueva-t" className="card card--roomy split__main">
          <h2 id="nueva-t" className="title-section">
            Registrar ausencia
          </h2>
          <div className="row wrap gap-12">
            <InputField id="d-fecha" label={isIncapacity ? 'Desde' : 'Fecha'} type="date" value={date} onChange={(e) => (setDate(e.target.value), setUntil(e.target.value > until ? e.target.value : until), setTeacherId(''), setPlan({}))} style={{ width: 180 }} />
            {isIncapacity && <InputField id="d-hasta" label="Hasta" type="date" min={date} value={until} onChange={(e) => setUntil(e.target.value)} style={{ width: 180 }} />}
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

          {isIncapacity ? (
            <>
              <div className="notice">
                {days} {days === 1 ? 'día lectivo' : 'días lectivos'} (de lunes a viernes; los feriados se cuentan, ajuste la fecha final si hace falta).
              </div>
              <fieldset className="fieldset">
                <legend>¿Habrá sustituto del MEP?</legend>
                <div className="row wrap gap-8">
                  {(Object.keys(SUSTITUCION) as Sustitucion[]).map((s) => (
                    <button key={s} type="button" className="chip" aria-pressed={substitution === s} onClick={() => setSubstitution(s)}>
                      {s === 'ninguno' ? 'No por ahora' : s === 'esperando' ? 'Lo estoy pidiendo al MEP' : 'Ya hay un sustituto nombrado'}
                    </button>
                  ))}
                </div>
                <span className="text-sm muted" style={{ display: 'block', marginTop: 8 }}>
                  {SUSTITUCION[substitution].help}
                </span>
                {longEnough && (
                  <span className="text-sm ink-amber" role="status" style={{ display: 'block', marginTop: 6 }}>
                    Con {threshold} días lectivos o más, normalmente conviene pedir un sustituto al MEP.
                  </span>
                )}
              </fieldset>
              {substitution === 'nombrado' && (
                <div className="row wrap gap-12" style={{ alignItems: 'flex-end' }}>
                  <div className="field" style={{ minWidth: 240 }}>
                    <label htmlFor="d-sust" className="field__label">
                      Sustituto
                    </label>
                    <select id="d-sust" className="input" value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
                      <option value="">Elegir…</option>
                      {candidates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <InputField id="d-sust-desde" label="Da lecciones desde" type="date" value={substituteFrom || date} onChange={(e) => setSubstituteFrom(e.target.value)} style={{ width: 180 }} />
                  <span className="text-xs muted" style={{ flexBasis: '100%' }}>
                    Si no aparece, agréguelo primero en Usuarios y permisos con el rol Docente.
                  </span>
                </div>
              )}
              <p className="text-sm muted">Cada día, las lecciones del docente quedan libres y se avisa a las familias, hasta que el sustituto empiece.</p>
            </>
          ) : (
            <div className="stack gap-10">
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>Lecciones de ese día</h3>
              {!slots && <span className="text-sm muted">Cargando…</span>}
              {slots && lessons.length === 0 && <span className="text-sm muted">Cargue el horario en Horarios y cargas para ver sus lecciones.</span>}
              {lessons.map((s) => {
                const c = coverageOf(s);
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
                      <StatusBadge status={COVERAGE[c]} />
                    </div>
                    <div className="row wrap gap-8" role="group" aria-label={`Qué pasa con ${s.subject} ${s.section}`}>
                      {OPTIONS.map((o) => (
                        <button key={o} type="button" className="chip chip--square" aria-pressed={c === o} onClick={() => (setPlan({ ...plan, [key(s)]: o }), setMsg(null))}>
                          {COVERAGE[o].label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs muted">{COVERAGE[c].help}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!isIncapacity && freeLessons.some((s) => s.last) && (
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
              <span className="text-sm muted">{!isIncapacity && already ? 'Este docente ya tiene una ausencia registrada ese día.' : 'El motivo solo lo ve dirección.'}</span>
            )}
            <Button
              variant="primary"
              style={{ height: 48, padding: '0 22px' }}
              onClick={isIncapacity ? saveIncapacity : saveShort}
              disabled={busy || !current || (!isIncapacity && (!lessons.length || already))}
            >
              {busy ? 'Guardando…' : isIncapacity ? 'Registrar incapacidad' : families > 0 ? `Registrar y avisar a ${families} familias` : 'Registrar ausencia'}
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
                        Anular este día
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
