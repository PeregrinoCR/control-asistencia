import { useEffect, useState, type FormEvent } from 'react';
import { Button, InputField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { SCHOOL_DAYS } from '../../data/schedule';
import { LESSONS, slotKey, useSchedule, type Week } from '../../lib/schedule';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';

/** Dirección · Profesores, secciones y horarios, with the school's real timetable. */
export function AssignmentsLive() {
  const data = useSchedule();
  const sections = data.sections ?? [];
  const [sectionId, setSectionId] = useState('');
  const [week, setWeek] = useState<Week>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Start on the first section once they load.
  useEffect(() => {
    if (!sectionId && sections[0]) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setMsg(null);
    data.loadWeek(sectionId).then((w) => {
      setWeek(w);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const setSlot = (key: string, patch: Partial<Week[string]>) => {
    const cur = week[key] ?? { subject: '', teacherId: '' };
    setWeek({ ...week, [key]: { ...cur, ...patch } });
    setMsg(null);
  };

  const copyFrom = async (fromId: string) => {
    if (!fromId) return;
    setWeek(await data.loadWeek(fromId));
    setMsg({ ok: true, text: 'Horario copiado. Revise los docentes y presione Guardar.' });
  };

  const save = async () => {
    setBusy(true);
    const error = await data.saveWeek(sectionId, week);
    setBusy(false);
    setMsg(error ? { ok: false, text: 'No se guardó: ' + error } : { ok: true, text: 'Horario guardado.' });
  };

  const sectionName = sections.find((s) => s.id === sectionId)?.nombre ?? '';
  const filled = Object.values(week).filter((s) => s.subject.trim()).length;

  return (
    <AdminLayout>
      <PageHeader kicker="Jornada nocturna · 6 lecciones de 35 min" title="Profesores, secciones y horarios" />

      {data.error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {data.error}
        </p>
      ) : !data.sections ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <>
          <div className="row wrap gap-10" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: 160 }}>
              <label htmlFor="h-seccion" className="field__label">
                Sección
              </label>
              <select id="h-seccion" className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label htmlFor="h-copiar" className="field__label">
                Copiar horario de
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

          {data.teachers.length === 0 && (
            <p className="notice" role="note">
              Aún no hay docentes. Regístrelos en Usuarios y permisos con el rol "Docente" para asignarlos aquí.
            </p>
          )}

          <section aria-labelledby="h-t" className="card gap-12">
            <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
              <h2 id="h-t" className="title-section">
                Horario de la sección {sectionName}
              </h2>
              <span className="text-sm muted">{filled} de 30 lecciones con materia</span>
            </div>
            {loading ? (
              <p className="text-sm muted">Cargando horario…</p>
            ) : (
              <div className="table-wrap">
                <table className="table table--dense" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>Lección</th>
                      {SCHOOL_DAYS.map((d) => (
                        <th key={d.id}>{d.full}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {LESSONS.map((l) => (
                      <tr key={l.n}>
                        <td>
                          <span className="stack">
                            <span className="strong">{l.name}</span>
                            <span className="text-xs muted">{l.start}</span>
                          </span>
                        </td>
                        {SCHOOL_DAYS.map((d) => {
                          const key = slotKey(d.id, l.n);
                          const slot = week[key] ?? { subject: '', teacherId: '' };
                          return (
                            <td key={d.id}>
                              <span className="stack gap-4">
                                <input
                                  className="input"
                                  style={{ height: 34, fontSize: 13 }}
                                  list="h-materias"
                                  aria-label={`Materia, ${d.full}, ${l.name}`}
                                  placeholder="Materia"
                                  value={slot.subject}
                                  onChange={(e) => setSlot(key, { subject: e.target.value })}
                                />
                                <select
                                  className="input"
                                  style={{ height: 34, fontSize: 13 }}
                                  aria-label={`Docente, ${d.full}, ${l.name}`}
                                  value={slot.teacherId}
                                  onChange={(e) => setSlot(key, { teacherId: e.target.value })}
                                >
                                  <option value="">Docente…</option>
                                  {data.teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.nombre}
                                    </option>
                                  ))}
                                </select>
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <datalist id="h-materias">
                  {data.subjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            )}
            <div className="row wrap between gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
              {msg ? (
                <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
                  {msg.text}
                </span>
              ) : (
                <span className="text-xs muted">Escriba la materia y elija el docente. Las materias nuevas se guardan solas.</span>
              )}
              <Button variant="primary" onClick={save} disabled={busy || loading || !sectionId}>
                {busy ? 'Guardando…' : 'Guardar horario'}
              </Button>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
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
