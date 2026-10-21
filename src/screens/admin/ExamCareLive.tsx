import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { SCHOOL_DAYS } from '../../data/schedule';
import { useAuth } from '../../lib/auth';
import { propose, type ExamIn, type SlotIn, type StaffIn } from '../../lib/cuidos';
import { printDocument, tableHtml } from '../../lib/print';
import { LESSONS, localDate, type Loads } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import type { Exam } from './SettingsLive';

interface Row {
  id?: string;
  room: string;
  kind: 'aula' | 'adecuacion';
  level: string | null;
  examId: string;
  detail: string;
  from: number;
  to: number;
  personId: string | null;
  published?: boolean;
}

interface Data {
  exams: Exam[];
  sections: Map<string, string>;
  staff: StaffIn[];
  /** Every timetable lesson of the week: section, day, lesson, teacher, subject. */
  timetable: Array<{ sectionId: string; day: string; lesson: number; teacherId: string; subject: string }>;
  loads: Loads;
  accommodations: Map<string, number>;
}

const longDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
const hours = (from: number, to: number) => `${LESSONS[from - 1]?.start} – ${LESSONS[to - 1]?.end}`;
const dayOf = (date: string) => SCHOOL_DAYS[new Date(date + 'T00:00:00').getDay() - 1]?.id ?? '';

function downloadCsv(name: string, header: string[], rows: Array<Array<string | number>>) {
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
}

/** Dirección · Cuido de exámenes: the app proposes, the committee adjusts, publishes and prints. */
export function ExamCareLive() {
  const { school } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [tally, setTally] = useState<Map<string, { cares: number; lessons: number }>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const db = supabase!;
    (async () => {
      const [c, st, secs, h, acc] = await Promise.all([
        db.from('colegios').select('config').maybeSingle(),
        db.from('personal').select('id, nombre, roles, horario_trabajo').eq('activo', true).order('nombre'),
        db.from('secciones').select('id, nombre'),
        db.from('horario').select('seccion_id, dia, leccion, docente_id, materias(nombre)').limit(5000),
        db.from('estudiantes').select('secciones(nombre)').eq('activo', true).eq('adecuacion', true),
      ]);
      if (st.error) return setError(st.error.message);
      const cfg = c.data?.config ?? {};
      const accommodations = new Map<string, number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((acc.data ?? []) as any[]).forEach((s) => {
        const sec = s.secciones?.nombre ?? '';
        if (sec) accommodations.set(sec, (accommodations.get(sec) ?? 0) + 1);
      });
      const exams = ((cfg.pruebas ?? []) as Exam[]).filter((x) => x.fecha >= localDate()).sort((a, b) => a.fecha.localeCompare(b.fecha));
      setData({
        exams,
        sections: new Map((secs.data ?? []).map((s) => [s.nombre, s.id])),
        // Gate guards stay at the gate.
        staff: (st.data ?? [])
          .filter((p) => !(p.roles as string[]).every((r) => r === 'gua'))
          .map((p) => ({ id: p.id, name: p.nombre, roles: p.roles, work: p.horario_trabajo })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        timetable: ((h.data ?? []) as any[])
          .filter((r) => r.docente_id)
          .map((r) => ({ sectionId: r.seccion_id, day: r.dia, lesson: r.leccion, teacherId: r.docente_id, subject: r.materias?.nombre ?? '' })),
        loads: cfg.cargas ?? {},
        accommodations,
      });
      if (exams[0]) setDate(exams[0].fecha);
    })();
  }, []);

  const loadNight = useCallback(async (d: string) => {
    const db = supabase!;
    const [night, all] = await Promise.all([
      db.from('cuidos').select('*').eq('fecha', d).order('aula').order('desde'),
      db.from('cuidos').select('persona_id, desde, hasta').gte('fecha', `${d.slice(0, 4)}-01-01`).limit(5000),
    ]);
    setRows(
      (night.data ?? []).map((r) => ({
        id: r.id,
        room: r.aula,
        kind: r.tipo,
        level: r.nivel,
        examId: r.prueba_id ?? '',
        detail: r.detalle ?? '',
        from: r.desde,
        to: r.hasta,
        personId: r.persona_id,
        published: r.estado === 'publicado',
      })),
    );
    const t = new Map<string, { cares: number; lessons: number }>();
    (all.data ?? []).forEach((r) => {
      if (!r.persona_id) return;
      const x = t.get(r.persona_id) ?? { cares: 0, lessons: 0 };
      t.set(r.persona_id, { cares: x.cares + 1, lessons: x.lessons + r.hasta - r.desde + 1 });
    });
    setTally(t);
    setDirty(false);
    setMsg(null);
  }, []);

  useEffect(() => {
    if (date) loadNight(date);
  }, [date, loadNight]);

  const nights = [...new Set((data?.exams ?? []).map((x) => x.fecha))];
  const name = (id: string | null) => data?.staff.find((p) => p.id === id)?.name ?? 'Sin cuidador';

  const suggest = async () => {
    if (!data) return;
    if (rows.length && !confirm('Se reemplazará la propuesta de esta noche. ¿Seguir?')) return;
    const db = supabase!;
    const { data: abs } = await db.from('ausencias_docentes').select('docente_id').eq('fecha', date);
    const day = dayOf(date);
    const exams: ExamIn[] = data.exams
      .filter((x) => x.fecha === date)
      .map((x) => ({
        id: x.id,
        sectionId: data.sections.get(x.seccion) ?? x.seccion,
        section: x.seccion,
        subject: x.materia,
        room: x.aula,
        from: x.desde ?? 4,
        lessons: x.lecciones ?? LESSONS.length - (x.desde ?? 4) + 1,
        lessonsAccommodated: x.leccionesAdecuacion,
        aulaAdecuacion: x.aulaAdecuacion,
        grupo: x.grupo,
      }));
    const slots: SlotIn[] = data.timetable.filter((t) => t.day === day);
    // Who teaches each subject in each section: the load, else the timetable.
    const subjectTeacher = new Map<string, string>();
    data.timetable.forEach((t) => subjectTeacher.set(`${t.sectionId}|${t.subject}`, t.teacherId));
    Object.entries(data.loads).forEach(([sid, lines]) => lines.forEach((l) => subjectTeacher.set(`${sid}|${l.materia}`, l.docenteId)));
    const counts = new Map([...tally].map(([k, v]) => [k, v.cares]));
    // This night's earlier proposal shouldn't count against anyone.
    rows.forEach((r) => r.personId && counts.set(r.personId, Math.max(0, (counts.get(r.personId) ?? 0) - 1)));
    const out = propose({
      day,
      exams,
      staff: data.staff,
      slots,
      subjectTeacher,
      absent: new Set((abs ?? []).map((a) => a.docente_id)),
      counts,
      accommodations: data.accommodations,
    });
    // Keep the saved rows' ids so saving updates them in place.
    setRows(out.map((o, i) => ({ ...o, id: rows[i]?.id, published: false })));
    setDirty(true);
    const missing = out.filter((o) => !o.personId).length;
    setMsg(missing ? { ok: false, text: `Propuesta lista. ${missing} sin cuidador: elija a alguien.` } : { ok: true, text: 'Propuesta lista. Revísela y guarde.' });
  };

  const setPerson = (i: number, personId: string | null) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, personId } : r)));
    setDirty(true);
    setMsg(null);
  };

  /** Saves the night as shown; `publish` also marks it published, which notifies each person. */
  const save = async (publish = false) => {
    setBusy(true);
    const db = supabase!;
    const { data: saved } = await db.from('cuidos').select('id').eq('fecha', date);
    const keep = new Set(rows.map((r) => r.id).filter(Boolean));
    const gone = (saved ?? []).map((s) => s.id).filter((id) => !keep.has(id));
    if (gone.length) await db.from('cuidos').delete().in('id', gone);
    for (const r of rows) {
      const row = {
        colegio_id: school!.id,
        fecha: date,
        prueba_id: r.examId,
        aula: r.room,
        tipo: r.kind,
        nivel: r.level,
        detalle: r.detail,
        desde: r.from,
        hasta: r.to,
        persona_id: r.personId,
        estado: publish || r.published ? 'publicado' : 'borrador',
      };
      const { error } = r.id ? await db.from('cuidos').update(row).eq('id', r.id) : await db.from('cuidos').insert(row);
      if (error) {
        setBusy(false);
        return setMsg({ ok: false, text: 'No se guardó: ' + error.message });
      }
    }
    setBusy(false);
    await loadNight(date);
    setMsg({ ok: true, text: publish ? 'Publicado: cada persona recibe el aviso en su teléfono.' : 'Borrador guardado.' });
  };

  const printNight = () =>
    printDocument(
      `Cuido de exámenes · ${longDate(date)}`,
      tableHtml(
        ['Aula', 'Grupo y materia', 'Horario', 'Cuidador'],
        rows.map((r) => [r.room + (r.kind === 'adecuacion' ? ' (adecuación)' : ''), r.detail, hours(r.from, r.to), name(r.personId)]),
      ),
      { school: school?.nombre, logo: school?.logo ?? undefined },
    );

  const reportRows = () =>
    (data?.staff ?? [])
      .map((p) => ({ name: p.name, ...(tally.get(p.id) ?? { cares: 0, lessons: 0 }) }))
      .sort((a, b) => b.lessons - a.lessons || a.name.localeCompare(b.name));

  const report = (pdf: boolean) => {
    const header = ['Persona', 'Cuidos', 'Lecciones de cuido'];
    const body = reportRows().map((r) => [r.name, r.cares, r.lessons]);
    if (pdf) printDocument(`Informe de cuidos ${date.slice(0, 4)}`, tableHtml(header, body), { school: school?.nombre, logo: school?.logo ?? undefined });
    else downloadCsv(`cuidos-${date.slice(0, 4)}.csv`, header, body);
  };

  // A person caring in two rooms at the same lesson.
  const clash = (i: number) => {
    const r = rows[i];
    return !!r.personId && rows.some((o, j) => j !== i && o.personId === r.personId && o.from <= r.to && r.from <= o.to);
  };

  // One card per room and exam; a change of person during the exam appears as a relevo inside the same card.
  const cards = [...rows.reduce((acc, r, i) => {
    const key = `${r.room}|${r.kind}|${r.examId}`;
    acc.set(key, [...(acc.get(key) ?? []), i]);
    return acc;
  }, new Map<string, number[]>()).values()];

  const published = rows.length > 0 && rows.every((r) => r.published) && !dirty;

  return (
    <AdminLayout>
      <PageHeader
        kicker="Comité de evaluación · la app propone, ustedes ajustan y publican"
        title="Cuido de exámenes"
        actions={
          <>
            <Button regular onClick={() => report(false)} disabled={!data}>
              Informe Excel
            </Button>
            <Button regular onClick={() => report(true)} disabled={!data}>
              Informe PDF
            </Button>
          </>
        }
      />

      {error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {error}
        </p>
      ) : !data ? (
        <p className="text-sm muted">Cargando…</p>
      ) : nights.length === 0 ? (
        <p className="card text-sm muted">
          No hay pruebas próximas. Agréguelas en Configuración › Horario de exámenes, con su aula, hora de inicio y duración.
        </p>
      ) : (
        <>
          <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label htmlFor="c-noche" className="field__label">
                Noche de exámenes
              </label>
              <select
                id="c-noche"
                className="input"
                value={date}
                onChange={(e) => {
                  if (dirty && !confirm('Hay cambios sin guardar. ¿Cambiar de noche?')) return;
                  setDate(e.target.value);
                }}
              >
                {nights.map((n) => (
                  <option key={n} value={n}>
                    {longDate(n)}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={suggest}>{rows.length ? 'Volver a proponer' : 'Proponer cuidadores'}</Button>
            <Button onClick={() => save(false)} disabled={busy || !rows.length}>
              Guardar borrador
            </Button>
            <Button variant="primary" onClick={() => save(true)} disabled={busy || !rows.length || rows.some((r) => !r.personId)}>
              {published ? 'Publicado' : 'Publicar y avisar'}
            </Button>
            <Button regular onClick={printNight} disabled={!rows.length}>
              Imprimir rol
            </Button>
          </div>
          {msg && (
            <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm strong ink-orange'} style={{ margin: 0 }}>
              {msg.text}
            </p>
          )}

          <div className="row gap-16" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <section aria-label="Aulas de la noche" className="stack gap-10" style={{ flex: '999 1 560px', minWidth: 0 }}>
              {rows.length === 0 && (
                <p className="card text-sm muted">
                  Exámenes de esta noche:{' '}
                  {data.exams
                    .filter((x) => x.fecha === date)
                    .map((x) => `${x.seccion} ${x.materia}${x.aula ? ` (${x.aula})` : ''}`)
                    .join(', ')}
                  . Presione "Proponer cuidadores".
                </p>
              )}
              {cards.map((idx) => {
                const first = rows[idx[0]];
                // Adecuación rooms clash when a normal room with the same name sits the same lessons.
                const choque =
                  first.kind === 'adecuacion' &&
                  rows.some((o) => o.kind === 'aula' && o.room === first.room && o.from <= first.to && first.from <= o.to);
                return (
                  <div key={idx.join('-')} className="card stack gap-8" style={{ padding: '12px 16px' }}>
                    <span className="row gap-8">
                      <strong style={{ fontSize: 15 }}>{first.room}</strong>
                      {first.kind === 'adecuacion' && <Badge tone="blue">Adecuación</Badge>}
                      {first.published && !dirty && <Badge tone="green">Publicado</Badge>}
                      {idx.length > 1 && <Badge tone="amber">Relevo a las {LESSONS[rows[idx[1]].from - 1]?.start}</Badge>}
                    </span>
                    <span className="text-sm muted">{first.detail}</span>
                    {choque && <span className="text-xs strong ink-orange">Choque: esta aula también aparece como aula normal a esa hora.</span>}
                    {idx.map((i, k) => {
                      const r = rows[i];
                      return (
                        <div
                          key={i}
                          className="row wrap between gap-10"
                          style={{ padding: '8px 0 8px 12px', borderLeft: `3px solid ${k ? 'var(--orange)' : 'var(--blue-ink)'}` }}
                        >
                          <span className="stack" style={{ minWidth: 200 }}>
                            <span className="text-sm">
                              <strong style={{ color: k ? 'var(--orange)' : 'var(--blue-ink)' }}>{k ? 'Relevo' : idx.length > 1 ? 'Cuidador inicial' : 'Cuidador'}</strong>
                              {' · '}
                              {r.from}.ª a {r.to}.ª · {hours(r.from, r.to)}
                            </span>
                          </span>
                          <span className="stack gap-4" style={{ minWidth: 220 }}>
                            <label htmlFor={`p-${i}`} className="sr-only">
                              Cuidador de {r.room}, {r.from}.ª a {r.to}.ª
                            </label>
                            <select id={`p-${i}`} className="input" value={r.personId ?? ''} onChange={(e) => setPerson(i, e.target.value || null)}>
                              <option value="">Sin cuidador</option>
                              {data.staff.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} · {tally.get(p.id)?.cares ?? 0} cuidos
                                </option>
                              ))}
                            </select>
                            {!r.personId && <span className="text-xs strong ink-orange">Falta asignar</span>}
                            {clash(i) && <span className="text-xs strong ink-orange">Esta persona ya cuida otra aula a esa hora</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>

            <aside aria-label="Cuidos por persona" className="card gap-6" style={{ flex: '1 1 260px', minWidth: 240, padding: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cuidos por persona</h2>
              <span className="text-xs muted">En el año, guardados. Para repartir parejo, la app prefiere a quien lleva menos.</span>
              {reportRows().map((p) => (
                <div key={p.name} className="row between gap-8" style={{ fontSize: 14, padding: '6px 0', borderTop: '1px solid var(--border-soft)' }}>
                  <span>{p.name}</span>
                  <span className="strong tabular">
                    {p.cares} · {p.lessons} lecc.
                  </span>
                </div>
              ))}
            </aside>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
