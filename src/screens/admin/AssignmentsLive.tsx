import { useCallback, useEffect, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';
import { Button, InputField, Meter, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { SCHOOL_DAYS } from '../../data/schedule';
import { useAuth } from '../../lib/auth';
import { LESSONS, slotKey, useSchedule, type LoadLine, type Loads, type PlacedLesson, type Week } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

/** Weekly lessons above which a teacher's load shows in orange, unless the school sets another number in Configuración. */
const DEFAULT_MAX_LOAD = 30;

const cellBase: CSSProperties = {
  height: 72,
  borderRadius: 10,
  padding: '6px 8px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 2,
  font: 'inherit',
  fontSize: 13,
  textAlign: 'left',
  width: '100%',
  position: 'relative',
};

const CELL: Record<'fill' | 'mine' | 'ok' | 'busy' | 'empty', CSSProperties> = {
  fill: { ...cellBase, background: 'var(--blue-bg)', color: 'var(--blue-ink)', border: '1px solid transparent' },
  mine: { ...cellBase, background: 'var(--blue)', color: '#fff', border: '1px solid transparent' },
  ok: { ...cellBase, background: 'var(--green-bg)', color: 'var(--green-ink)', border: '2px dashed var(--green)' },
  busy: {
    ...cellBase,
    background: 'repeating-linear-gradient(45deg, var(--orange-bg), var(--orange-bg) 6px, var(--surface) 6px, var(--surface) 12px)',
    color: 'var(--orange-ink)',
    border: '1px solid var(--orange-line, var(--orange))',
    cursor: 'not-allowed',
  },
  empty: { ...cellBase, background: 'var(--bg)', color: 'var(--muted)', border: '1.5px dashed var(--border-input)' },
};

/** Dirección · Horarios y cargas: a board where each section's load is placed as cards. */
export function AssignmentsLive() {
  const data = useSchedule();
  const sections = data.sections ?? [];
  const [sectionId, setSectionId] = useState('');
  const [week, setWeek] = useState<Week>({});
  const [others, setOthers] = useState<PlacedLesson[]>([]);
  const [loads, setLoads] = useState<Loads>({});
  const [picked, setPicked] = useState<string | null>(null);
  const [focusTeacher, setFocusTeacher] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useFlash();
  const [busy, setBusy] = useState(false);
  const [maxLoad, setMaxLoad] = useState(DEFAULT_MAX_LOAD);

  useEffect(() => {
    supabase!
      .from('colegios')
      .select('config')
      .maybeSingle()
      .then(({ data: c }) => setMaxLoad(Number(c?.config?.institucion?.['c-carga-max']) || DEFAULT_MAX_LOAD));
  }, []);

  useEffect(() => {
    if (!sectionId && sections[0]) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const loadSection = useCallback(
    async (id: string) => {
      const [w, all, l] = await Promise.all([data.loadWeek(id), data.loadAll(), data.loadLoads()]);
      setWeek(w);
      setOthers(all.filter((x) => x.sectionId !== id));
      setLoads(l);
      setDirty(false);
      setPicked(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (sectionId) loadSection(sectionId);
  }, [sectionId, loadSection]);

  const teacherName = (id: string) => data.teachers.find((t) => t.id === id)?.nombre ?? 'Sin docente';
  const lines = loads[sectionId] ?? [];
  const placedOf = (l: LoadLine) => Object.values(week).filter((s) => s.subject === l.materia && s.teacherId === l.docenteId).length;
  const pickedLine = lines.find((l) => l.id === picked);
  // Lessons the teacher already gives in another section at that hour.
  const elsewhere = (teacherId: string, key: string) => others.find((o) => o.teacherId === teacherId && o.key === key);

  // Lessons a teacher already has placed in the whole school, this section included.
  const teacherTotal = (id: string) => others.filter((o) => o.teacherId === id).length + Object.values(week).filter((x) => x.teacherId === id).length;

  // Lessons still to place per section, from its load and the lessons saved for it (this section: what is on screen).
  const pendingOf = (sid: string) => {
    const planned = (loads[sid] ?? []).reduce((n, l) => n + l.lecciones, 0);
    const placed = sid === sectionId ? Object.keys(week).length : others.filter((o) => o.sectionId === sid).length;
    return Math.max(0, planned - placed);
  };

  const change = (next: Week) => {
    setWeek(next);
    setDirty(true);
    setMsg(null);
  };

  const place = (key: string, lineId: string) => {
    const l = lines.find((x) => x.id === lineId);
    if (!l) return;
    const clash = elsewhere(l.docenteId, key);
    if (clash) return setMsg({ ok: false, text: `${teacherName(l.docenteId)} ya da ${clash.subject} en ${sections.find((s) => s.id === clash.sectionId)?.nombre} a esa hora.` });
    change({ ...week, [key]: { subject: l.materia, teacherId: l.docenteId } });
    const total = teacherTotal(l.docenteId) + 1;
    if (total > maxLoad) setMsg({ ok: false, text: `${teacherName(l.docenteId)} llega a ${total} lecciones por semana; el máximo es ${maxLoad}.` });
    // Keep the card in hand until all its lessons are placed.
    if (placedOf(l) + 1 >= l.lecciones) setPicked(null);
  };

  const move = (from: string, to: string) => {
    const s = week[from];
    if (!s || from === to) return;
    const clash = elsewhere(s.teacherId, to);
    if (clash) return setMsg({ ok: false, text: `${teacherName(s.teacherId)} ya da lección en otra sección a esa hora.` });
    const next = { ...week, [to]: s };
    delete next[from];
    change(next);
  };

  const remove = (key: string) => {
    const next = { ...week };
    delete next[key];
    change(next);
  };

  const setLines = (next: LoadLine[]) => {
    setLoads({ ...loads, [sectionId]: next });
    setDirty(true);
    setMsg(null);
  };

  const copyFrom = async (fromId: string) => {
    if (!fromId) return;
    const w = await data.loadWeek(fromId);
    // Copy the load too, so the cards match; each section keeps its own copy.
    setLines((loads[fromId] ?? []).map((l) => ({ ...l, id: crypto.randomUUID() })));
    change(w);
    setMsg({ ok: true, text: 'Horario y carga copiados. Revise docentes y choques, luego Guardar.' });
  };

  const save = async () => {
    setBusy(true);
    const e1 = await data.saveLoads(loads);
    const e2 = e1 || (await data.saveWeek(sectionId, week));
    setBusy(false);
    if (e2) return setMsg({ ok: false, text: 'No se guardó: ' + e2 });
    setDirty(false);
    setMsg({ ok: true, text: 'Horario guardado.' });
  };

  // Each teacher: lessons placed across the school vs. lessons in their load.
  const allPlaced = [...others, ...Object.entries(week).map(([key, s]) => ({ sectionId, key, teacherId: s.teacherId, subject: s.subject }))];
  const teacherRows = data.teachers
    .map((t) => {
      const placed = allPlaced.filter((p) => p.teacherId === t.id).length;
      const planned = Object.values(loads)
        .flat()
        .filter((l) => l.docenteId === t.id)
        .reduce((n, l) => n + l.lecciones, 0);
      return { ...t, placed, planned };
    })
    .filter((t) => t.placed || t.planned);

  const onDrop = (key: string) => (e: DragEvent) => {
    e.preventDefault();
    const v = e.dataTransfer.getData('text/plain');
    if (v.startsWith('cell:')) move(v.slice(5), key);
    else place(key, v);
  };

  const sectionName = sections.find((s) => s.id === sectionId)?.nombre ?? '';
  const toPlace = lines.reduce((n, l) => n + Math.max(0, l.lecciones - placedOf(l)), 0);

  return (
    <AdminLayout>
      <PageHeader
        kicker="Jornada nocturna · arrastre cada tarjeta a una casilla, o tóquela y luego toque la casilla"
        title="Horarios y cargas"
        actions={
          <Button variant="primary" onClick={save} disabled={busy || !sectionId}>
            {busy ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
          </Button>
        }
      />

      {data.error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {data.error}
        </p>
      ) : !data.sections ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <>
          <div className="row wrap gap-10" style={{ alignItems: 'flex-end' }}>
            <div
              role="group"
              aria-label="Sección"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 8, flex: '1 1 100%' }}
            >
              {sections.map((s) => {
                const planned = (loads[s.id] ?? []).reduce((n, l) => n + l.lecciones, 0);
                const left = pendingOf(s.id);
                const on = s.id === sectionId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (dirty && !confirm('Hay cambios sin guardar en esta sección. ¿Salir sin guardar?')) return;
                      setSectionId(s.id);
                    }}
                    style={{
                      all: 'unset',
                      boxSizing: 'border-box',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '10px 12px',
                      minHeight: 72,
                      borderRadius: 12,
                      border: on ? '2px solid var(--blue)' : '1px solid var(--border)',
                      background: on ? 'var(--blue-bg)' : 'var(--surface)',
                    }}
                  >
                    <strong style={{ fontSize: 18 }}>{s.nombre}</strong>
                    <span className={planned === 0 ? 'text-xs strong muted' : left > 0 ? 'text-xs strong ink-orange' : 'text-xs strong ink-green'}>
                      {planned === 0 ? 'sin materias' : left > 0 ? `faltan ${left}` : 'completa'}
                    </span>
                    <span style={{ height: 6, borderRadius: 99, background: 'var(--neutral-bg)', overflow: 'hidden', display: 'block' }}>
                      <span style={{ display: 'block', height: '100%', width: `${planned ? 100 - (100 * left) / planned : 0}%`, background: left > 0 ? 'var(--orange)' : 'var(--green)' }} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="field" style={{ minWidth: 180 }}>
              <label htmlFor="h-copiar" className="field__label">
                Copiar de
              </label>
              <select id="h-copiar" className="input" value="" onChange={(e) => copyFrom(e.target.value)}>
                <option value="">Elegir sección…</option>
                {sections
                  .filter((s) => s.id !== sectionId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
              </select>
            </div>
            <NewSection />
          </div>

          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm strong ink-orange'} style={{ margin: 0 }}>
              {msg.text}
            </p>
          )}

            <section aria-label={`Materias de la sección ${sectionName}`} className="card stack gap-8" style={{ padding: '12px 14px' }}>
              <span className="eyebrow">
                {sectionName} · {lines.length === 0 ? 'sin materias' : toPlace ? `por colocar ${toPlace}` : 'todo colocado'}
              </span>
              <div className="row wrap gap-8" style={{ alignItems: 'stretch' }}>
              {lines.length === 0 && <span className="text-sm muted">Agregue las materias de esta sección: cada una se vuelve una tarjeta.</span>}
              {lines.map((l) => {
                const left = l.lecciones - placedOf(l);
                const on = picked === l.id;
                return (
                  <div
                    key={l.id}
                    draggable={left > 0}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', l.id);
                      setPicked(l.id);
                    }}
                    className="card"
                    style={{
                      flex: '0 1 230px',
                      padding: '10px 12px',
                      gap: 4,
                      border: on ? '2px solid var(--blue)' : undefined,
                      opacity: left > 0 ? 1 : 0.6,
                      cursor: left > 0 ? 'grab' : 'default',
                    }}
                  >
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={left <= 0}
                      onClick={() => setPicked(on ? null : l.id)}
                      style={{ all: 'unset', cursor: 'inherit', display: 'flex', flexDirection: 'column', gap: 2 }}
                    >
                      <span className="row between gap-8">
                        <strong style={{ fontSize: 15 }}>{l.materia}</strong>
                        <span className={left > 0 ? 'badge badge--amber' : 'badge badge--green'}>{left > 0 ? `faltan ${left}` : left < 0 ? `${-left} de más` : 'completa'}</span>
                      </span>
                      <span className="text-sm muted">
                        {teacherName(l.docenteId)} · {l.lecciones} por semana
                      </span>
                    </button>
                    <button type="button" className="link-button text-xs" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                      Quitar materia
                    </button>
                  </div>
                );
              })}
              <AddLine subjects={data.subjects} teachers={data.teachers} onAdd={(l) => setLines([...lines, l])} />
              </div>
              <span className="text-xs muted">Toque una materia y luego una casilla verde, o arrástrela.</span>
            </section>

          <div className="row gap-16" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>

            <section aria-label={`Semana de la sección ${sectionName}`} className="card gap-8" style={{ flex: '999 1 560px', minWidth: 0, padding: 16 }}>
              <div className="table-wrap">
                <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(5, minmax(0, 1fr))', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
                    <span>Lección</span>
                    {SCHOOL_DAYS.map((d) => (
                      <span key={d.id}>{d.full}</span>
                    ))}
                  </div>
                  {LESSONS.map((lesson) => (
                    <div key={lesson.n} style={{ display: 'grid', gridTemplateColumns: '90px repeat(5, minmax(0, 1fr))', gap: 8 }}>
                      <span className="stack" style={{ justifyContent: 'center', fontSize: 13 }}>
                        <strong>{lesson.n}.ª</strong>
                        <span className="muted">{lesson.start}</span>
                      </span>
                      {SCHOOL_DAYS.map((d) => {
                        const key = slotKey(d.id, lesson.n);
                        const slot = week[key];
                        const clash = pickedLine && !slot ? elsewhere(pickedLine.docenteId, key) : undefined;
                        const focused = focusTeacher && slot?.teacherId === focusTeacher;
                        const style = slot ? (focused ? CELL.mine : CELL.fill) : pickedLine ? (clash ? CELL.busy : CELL.ok) : CELL.empty;
                        const label = `${d.full}, ${lesson.name}: ${slot ? `${slot.subject}, ${teacherName(slot.teacherId)}` : clash ? 'docente ocupado' : 'libre'}`;
                        return (
                          <div key={key} onDragOver={(e) => e.preventDefault()} onDrop={onDrop(key)} style={{ position: 'relative' }}>
                            {slot ? (
                              <div
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('text/plain', `cell:${key}`)}
                                style={{ ...style, cursor: 'grab' }}
                                aria-label={label}
                              >
                                <strong style={{ fontSize: 13 }}>{slot.subject}</strong>
                                <span style={{ fontSize: 12, opacity: 0.85 }}>{teacherName(slot.teacherId)}</span>
                                <button
                                  type="button"
                                  aria-label={`Quitar ${slot.subject} del ${d.full}, ${lesson.name}`}
                                  onClick={() => remove(key)}
                                  style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 6, border: 0, background: 'rgba(255,255,255,.7)', color: 'inherit', cursor: 'pointer' }}
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <button type="button" aria-label={label} style={style} disabled={!!clash} onClick={() => pickedLine && place(key, pickedLine.id)}>
                                {clash ? (
                                  <>
                                    <strong>Ocupado</strong>
                                    <span style={{ fontSize: 12 }}>{sections.find((s) => s.id === clash.sectionId)?.nombre}</span>
                                  </>
                                ) : pickedLine ? (
                                  'Colocar aquí'
                                ) : (
                                  'Libre'
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <span className="text-xs muted">
                {pickedLine
                  ? `Colocando ${pickedLine.materia} · ${teacherName(pickedLine.docenteId)}: verde = libre, rayado = ese docente da lección en otra sección.`
                  : 'Toque una tarjeta para colocarla. Arrastre una lección para moverla; la × la quita.'}
              </span>
            </section>

            <aside aria-label="Carga por docente" className="card gap-8" style={{ flex: '1 1 260px', minWidth: 240, padding: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Carga por docente</h2>
              <span className="text-xs muted">Lecciones colocadas en todas las secciones / lecciones de su carga. Toque uno para ver sus lecciones aquí.</span>
              {teacherRows.length === 0 && <span className="text-sm muted">Aún no hay lecciones asignadas.</span>}
              {teacherRows.map((t) => {
                const over = t.placed > maxLoad;
                const on = focusTeacher === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFocusTeacher(on ? null : t.id)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: on ? '2px solid var(--blue)' : '1px solid var(--border-soft)',
                    }}
                  >
                    <span className="row between gap-8" style={{ fontSize: 14 }}>
                      <strong>{t.nombre}</strong>
                      <span className={over || t.placed > t.planned ? 'strong ink-orange' : t.placed === t.planned ? 'strong ink-green' : 'strong'}>
                        {t.placed} de {t.planned || '—'}
                      </span>
                    </span>
                    <Meter wide percent={t.planned ? Math.min(100, (100 * t.placed) / t.planned) : 0} label={
                        over
                          ? `Más de ${maxLoad}`
                          : t.placed === t.planned
                            ? 'Completa'
                            : t.placed > t.planned
                              ? `${t.placed - t.planned} fuera de su carga`
                              : `Faltan ${t.planned - t.placed}`
                      } />
                  </button>
                );
              })}
            </aside>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

/** Adds a subject to the section's load: who teaches it and how many lessons a week. */
function AddLine({ subjects, teachers, onAdd }: { subjects: string[]; teachers: Array<{ id: string; nombre: string }>; onAdd: (l: LoadLine) => void }) {
  const [open, setOpen] = useState(false);
  const [materia, setMateria] = useState('');
  const [docente, setDocente] = useState('');
  const [n, setN] = useState('4');
  const [error, setError] = useState('');

  if (!open)
    return (
      <Button variant="dashed" size="md" onClick={() => setOpen(true)}>
        + Agregar materia
      </Button>
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!materia.trim() || !docente || !(Number(n) > 0)) return setError('Complete materia, docente y lecciones por semana.');
    onAdd({ id: crypto.randomUUID(), materia: materia.trim(), docenteId: docente, lecciones: Number(n) });
    setMateria('');
    setError('');
    setOpen(false);
  };

  return (
    <form className="card gap-10" style={{ padding: 12 }} onSubmit={submit}>
      <InputField id="c-materia" label="Materia" list="c-materias" value={materia} onChange={(e) => setMateria(e.target.value)} />
      <datalist id="c-materias">
        {subjects.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="field">
        <label htmlFor="c-docente" className="field__label">
          Docente
        </label>
        <select id="c-docente" className="input" value={docente} onChange={(e) => setDocente(e.target.value)}>
          <option value="">Elegir…</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>
      <InputField id="c-n" label="Lecciones por semana" type="number" min={1} max={30} value={n} onChange={(e) => setN(e.target.value)} />
      {teachers.length === 0 && <span className="text-xs ink-orange">Registre docentes en Usuarios y permisos con el rol "Docente".</span>}
      {error && (
        <span className="text-sm ink-orange" role="alert">
          {error}
        </span>
      )}
      <div className="grid-2">
        <Button onClick={() => setOpen(false)}>Cancelar</Button>
        <Button type="submit" variant="primary">
          Agregar
        </Button>
      </div>
    </form>
  );
}

/** Adds a section, like "7-3". */
function NewSection() {
  const { school } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const { error } = await supabase!.from('secciones').insert({ colegio_id: school!.id, nombre: name.trim() });
    if (error) return setError(error.code === '23505' ? 'Esa sección ya existe.' : error.message);
    // Reload so every list picks up the new section.
    window.location.reload();
  };

  return (
    <form className="row gap-8" style={{ alignItems: 'flex-end', marginLeft: 'auto' }} onSubmit={submit}>
      <InputField id="h-nueva" label="Nueva sección" placeholder="7-3" style={{ width: 110 }} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" regular>
        Agregar
      </Button>
      {error && (
        <span role="alert" className="text-sm ink-orange">
          {error}
        </span>
      )}
    </form>
  );
}
