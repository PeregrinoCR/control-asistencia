import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, InputField, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { SCHOOL_DAYS } from '../../data/schedule';
import { useAuth } from '../../lib/auth';
import { isWorking, propose, type ExamIn, type SlotIn, type StaffIn } from '../../lib/cuidos';
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
const cuidosText = (n: number) => `${n} ${n === 1 ? 'cuido' : 'cuidos'}`;
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
  const [msg, setMsg] = useFlash();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** People marked as unavailable per night (`colegios.config.cuidosNoDisponibles`), and teachers absent on the open night. */
  const [unavail, setUnavail] = useState<Record<string, Array<{ id: string; motivo: string }>>>({});
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<Map<string, { total: number; missing: number; published: boolean }>>(new Map());
  const [addId, setAddId] = useState('');
  const [addWhy, setAddWhy] = useState('');
  const [from, setFrom] = useState(`${localDate().slice(0, 4)}-01-01`);
  const [to, setTo] = useState(`${localDate().slice(0, 4)}-12-31`);

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
      setUnavail(cfg.cuidosNoDisponibles ?? {});
      if (exams[0]) setDate(exams[0].fecha);
    })();
  }, []);

  const loadNight = useCallback(async (d: string) => {
    const db = supabase!;
    const [night, all, abs] = await Promise.all([
      db.from('cuidos').select('*').eq('fecha', d).order('aula').order('desde'),
      db.from('cuidos').select('persona_id, desde, hasta').gte('fecha', `${d.slice(0, 4)}-01-01`).limit(5000),
      db.from('ausencias_docentes').select('docente_id').eq('fecha', d),
    ]);
    setAbsent(new Set((abs.data ?? []).map((a) => a.docente_id)));
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

  /** What is saved for every exam night, to show each night's state at the top. */
  const loadSummary = useCallback(async () => {
    if (!data) return;
    const dates = [...new Set(data.exams.map((x) => x.fecha))];
    const { data: saved } = await supabase!.from('cuidos').select('fecha, persona_id, estado').in('fecha', dates).limit(5000);
    const m = new Map<string, { total: number; missing: number; published: boolean }>();
    (saved ?? []).forEach((r) => {
      const x = m.get(r.fecha) ?? { total: 0, missing: 0, published: true };
      m.set(r.fecha, { total: x.total + 1, missing: x.missing + (r.persona_id ? 0 : 1), published: x.published && r.estado === 'publicado' });
    });
    setSummary(m);
  }, [data]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);
  const name = (id: string | null) => data?.staff.find((p) => p.id === id)?.name ?? 'Sin cuidador';

  const suggest = async () => {
    if (!data) return;
    if (rows.length && !confirm('Se reemplazará la propuesta de esta noche. ¿Seguir?')) return;
    const db = supabase!;
    const { data: abs } = await db.from('ausencias_docentes').select('docente_id').eq('fecha', date);
    const day = dayOf(date);
    const notAvailable = [...(abs ?? []).map((a) => a.docente_id), ...(unavail[date] ?? []).map((u) => u.id)];
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
      absent: new Set(notAvailable),
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
    await loadSummary();
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

  const shortDate = (d: string) => d.split('-').reverse().join('/');

  /** Cares and care lessons per person between two dates. */
  const report = async (pdf: boolean) => {
    if (!from || !to || from > to) return setMsg({ ok: false, text: 'Elija un periodo válido: «Desde» no puede ser después de «Hasta».' });
    setBusy(true);
    const { data: saved, error: e } = await supabase!.from('cuidos').select('persona_id, desde, hasta').gte('fecha', from).lte('fecha', to).limit(5000);
    setBusy(false);
    if (e) return setMsg({ ok: false, text: 'No se pudo armar el informe: ' + e.message });
    const t = new Map<string, { cares: number; lessons: number }>();
    (saved ?? []).forEach((r) => {
      if (!r.persona_id) return;
      const x = t.get(r.persona_id) ?? { cares: 0, lessons: 0 };
      t.set(r.persona_id, { cares: x.cares + 1, lessons: x.lessons + r.hasta - r.desde + 1 });
    });
    const header = ['Persona', 'Cuidos', 'Lecciones de cuido'];
    const body = (data?.staff ?? [])
      .map((p) => ({ name: p.name, ...(t.get(p.id) ?? { cares: 0, lessons: 0 }) }))
      .sort((a, b) => b.lessons - a.lessons || a.name.localeCompare(b.name))
      .map((r) => [r.name, r.cares, r.lessons]);
    if (pdf) printDocument(`Informe de cuidos · ${shortDate(from)} a ${shortDate(to)}`, tableHtml(header, body), { school: school?.nombre, logo: school?.logo ?? undefined });
    else downloadCsv(`cuidos-${from}-a-${to}.csv`, header, body);
  };

  // One card per room and exam; a change of person during the exam appears as a relevo inside the same card.
  const cards = [...rows.reduce((acc, r, i) => {
    const key = `${r.room}|${r.kind}|${r.examId}`;
    acc.set(key, [...(acc.get(key) ?? []), i]);
    return acc;
  }, new Map<string, number[]>()).values()];

  const published = rows.length > 0 && rows.every((r) => r.published) && !dirty;

  /** State of each night for the strip at the top: the open night comes from the screen, the others from what is saved. */
  const nightInfo = (n: string) => {
    const aulas = new Set((data?.exams ?? []).filter((x) => x.fecha === n).map((x) => x.aula || x.seccion)).size;
    const mine = n === date && rows.length > 0 ? { total: rows.length, missing: rows.filter((r) => !r.personId).length, published } : n === date ? undefined : summary.get(n);
    if (!mine || mine.total === 0) return { tone: 'neutral' as const, label: 'Sin proponer', note: `${aulas} aula${aulas === 1 ? '' : 's'}` };
    const note = mine.missing ? `${mine.missing} sin cuidador` : 'Completo';
    return mine.published ? { tone: 'green' as const, label: 'Publicado', note } : { tone: 'amber' as const, label: 'Borrador', note };
  };
  const pickNight = (n: string) => {
    if (n === date) return;
    if (dirty && !confirm('Hay cambios sin guardar. ¿Cambiar de noche?')) return;
    setDate(n);
  };

  // People the committee marked as unavailable tonight; teachers absent today count too.
  const unavailable = unavail[date] ?? [];
  const unavailableIds = new Set(unavailable.map((u) => u.id));
  const addable = (data?.staff ?? []).filter((p) => !unavailableIds.has(p.id));
  const saveUnavailable = async (next: Record<string, Array<{ id: string; motivo: string }>>) => {
    const db = supabase!;
    const { data: cur } = await db.from('colegios').select('config').maybeSingle();
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v.length > 0));
    const { error: e } = await db.from('colegios').update({ config: { ...(cur?.config ?? {}), cuidosNoDisponibles: clean } }).eq('id', school!.id);
    if (e) return setMsg({ ok: false, text: 'No se guardó: ' + e.message });
    setUnavail(clean);
  };
  const markUnavailable = async () => {
    if (!addId) return;
    await saveUnavailable({ ...unavail, [date]: [...unavailable, { id: addId, motivo: addWhy.trim() }] });
    setAddId('');
    setAddWhy('');
  };

  // What each person is doing at the lessons of a row, to choose a carer with the facts in view.
  const day = dayOf(date);
  const examSections = new Set((data?.exams ?? []).filter((x) => x.fecha === date).map((x) => data!.sections.get(x.seccion) ?? x.seccion));
  const slotsToday = (data?.timetable ?? []).filter((t) => t.day === day);
  const stateOf = (p: StaffIn, i: number): { rank: number; tone: 'green' | 'neutral' | 'amber' | 'orange'; text: string } => {
    const r = rows[i];
    if (unavailableIds.has(p.id)) return { rank: 4, tone: 'orange', text: 'No disponible' };
    if (absent.has(p.id)) return { rank: 4, tone: 'orange', text: 'Ausente hoy' };
    const other = rows.find((o, j) => j !== i && o.personId === p.id && o.from <= r.to && r.from <= o.to);
    if (other) return { rank: 3, tone: 'amber', text: `Ya cuida ${other.room}` };
    const teaching = slotsToday.find((t) => t.teacherId === p.id && t.lesson >= r.from && t.lesson <= r.to && !examSections.has(t.sectionId));
    if (teaching) return { rank: 2, tone: 'neutral', text: `Da lección ${teaching.lesson}.ª` };
    const lessons = Array.from({ length: r.to - r.from + 1 }, (_, k) => r.from + k);
    if (!lessons.every((l) => isWorking(p, day, slotsToday, l))) return { rank: 2, tone: 'neutral', text: 'Fuera de su horario' };
    return { rank: 0, tone: 'green', text: p.roles.includes('doc') ? 'Libre' : 'Libre · apoyo' };
  };

  return (
    <AdminLayout>
      <PageHeader kicker="Comité de evaluación · la app propone, ustedes ajustan y publican" title="Cuido de exámenes" />

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
          <div className="row wrap gap-10" role="group" aria-label="Noches de exámenes">
            {nights.map((n) => {
              const info = nightInfo(n);
              return (
                <button
                  key={n}
                  type="button"
                  className="card stack gap-4"
                  aria-pressed={n === date}
                  onClick={() => pickNight(n)}
                  style={{ textAlign: 'left', minWidth: 160, padding: '10px 14px', cursor: 'pointer', ...(n === date ? { outline: '2px solid var(--blue)' } : {}) }}
                >
                  <strong>{longDate(n).replace(/^./, (c) => c.toUpperCase())}</strong>
                  <span className="row gap-6">
                    <Badge tone={info.tone}>{info.label}</Badge>
                  </span>
                  <span className="text-xs muted">{info.note}</span>
                </button>
              );
            })}
          </div>

          <div className="row wrap gap-8">
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

          <section aria-label="No disponibles esta noche" className="card stack gap-8" style={{ padding: '12px 16px' }}>
            <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>No disponibles esta noche</strong>
              {unavailable.length === 0 && <span className="text-sm muted">Nadie marcado.</span>}
              {unavailable.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="chip chip--sm"
                  title="Quitar"
                  onClick={() => saveUnavailable({ ...unavail, [date]: unavailable.filter((x) => x.id !== u.id) })}
                >
                  {name(u.id)}
                  {u.motivo ? ` · ${u.motivo}` : ''} ×
                </button>
              ))}
            </div>
            <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="nd-persona" className="field__label">
                  Agregar persona
                </label>
                <select id="nd-persona" className="input" value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Elegir…</option>
                  {addable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <InputField id="nd-motivo" label="Motivo (opcional)" placeholder="Cita médica, permiso…" value={addWhy} onChange={(e) => setAddWhy(e.target.value)} />
              <Button regular disabled={!addId} onClick={markUnavailable}>
                Marcar
              </Button>
            </div>
            <span className="text-xs muted">La propuesta no los asigna. Los docentes ausentes de «Docentes ausentes» ya se saltan solos.</span>
          </section>

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
                      const options = [...data.staff]
                        .map((p) => ({ p, s: stateOf(p, i) }))
                        .sort((a, b) => a.s.rank - b.s.rank || (tally.get(a.p.id)?.cares ?? 0) - (tally.get(b.p.id)?.cares ?? 0) || a.p.name.localeCompare(b.p.name, 'es'));
                      const mine = r.personId ? options.find((o) => o.p.id === r.personId)?.s : undefined;
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
                          <span className="stack gap-4" style={{ minWidth: 260 }}>
                            <label htmlFor={`p-${i}`} className="sr-only">
                              Cuidador de {r.room}, {r.from}.ª a {r.to}.ª
                            </label>
                            <select id={`p-${i}`} className="input" value={r.personId ?? ''} onChange={(e) => setPerson(i, e.target.value || null)}>
                              <option value="">Sin cuidador</option>
                              {options.map(({ p, s }) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} · {cuidosText(tally.get(p.id)?.cares ?? 0)} · {s.text}
                                </option>
                              ))}
                            </select>
                            {!r.personId && <span className="text-xs strong ink-orange">Falta asignar</span>}
                            {mine && mine.rank > 0 && <Badge tone={mine.tone}>{mine.text}</Badge>}
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
              <div className="stack gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
                <strong style={{ fontSize: 14 }}>Informe de cuidos</strong>
                <div className="stack gap-8">
                  <InputField id="inf-desde" type="date" label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} />
                  <InputField id="inf-hasta" type="date" label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="row gap-8">
                  <Button regular disabled={busy} onClick={() => report(false)}>
                    Excel
                  </Button>
                  <Button regular disabled={busy} onClick={() => report(true)}>
                    PDF
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
