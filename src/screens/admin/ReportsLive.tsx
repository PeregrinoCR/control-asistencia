import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Meter, Segmented, Skeleton, Stat } from '../../components';
import { LineChart, type ChartPoint } from '../../components/LineChart';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { NOTICE_TYPES } from '../../data/notices';
import { RISK } from '../../data/earlyWarning';
import { pct } from '../../data/school';
import { routes } from '../../routes';
import { loadAlerta } from '../../lib/alerta';
import { AUDIENCE_LABEL } from '../../lib/avisos';
import { fetchAll } from '../../lib/fetchAll';
import { useAuth } from '../../lib/auth';
import { esc, printDocument, tableHtml } from '../../lib/print';
import {
  PERIODS,
  bySubject,
  countChange,
  heatmap,
  inRange,
  levelOf,
  pointsChange,
  previousRange,
  rangeLabel,
  rangeOf,
  scopeSections,
  totals,
  WEEK,
  type Change,
  type LessonRow,
  type PeriodId,
  type Range,
  type Scope,
  type Slot,
} from '../../lib/reportes';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';

type Mode = 'w' | 'm';

interface Section {
  id: string;
  nombre: string;
}

interface Absentee {
  estudiante_id: string;
  ausencias: number;
  justificadas: number;
  tardias: number;
}

interface Student {
  id: string;
  nombre: string;
  cedula: string | null;
  seccion_id: string | null;
}

interface Table {
  file: string;
  header: string[];
  rows: Array<Array<string | number>>;
}

/** Monday of the week of a date. */
function monday(d: string) {
  const x = new Date(d + 'T00:00:00');
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return localDate(x);
}

function downloadCsv({ file, header, rows }: Table) {
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const TONE: Record<Change['tone'], string> = { good: 'ink-green', bad: 'ink-orange', flat: 'muted' };

/** Change line under a total: arrow, amount and what it is compared with. */
function ChangeNote({ c }: { c: Change | null }) {
  if (!c) return <span className="muted">Sin datos para comparar</span>;
  return <span className={`strong ${TONE[c.tone]}`}>{c.text}</span>;
}

/** Color of a cell of the lessons-by-day map, by the share of absences. */
const heat = (p: number | null) =>
  p === null ? { background: 'var(--neutral-bg)', color: 'var(--muted)' } : p < 4 ? { background: 'var(--blue-bg)', color: 'var(--blue-ink)' } : p < 7 ? { background: 'var(--amber-bg)', color: 'var(--amber-ink)' } : p < 10 ? { background: 'var(--orange-bg)', color: 'var(--orange-ink)' } : { background: 'var(--orange-line)', color: 'var(--orange-ink)' };

/** Dirección · Reportes, from the real roll calls of the school year. */
export function ReportsLive() {
  const { school, session } = useAuth();
  const [mode, setMode] = useState<Mode>('w');
  const [period, setPeriod] = useState<PeriodId>('mes');
  const [custom, setCustom] = useState<Range>({ from: '', to: '' });
  const [scope, setScope] = useState<Scope>('');
  const [teachersOn, setTeachersOn] = useState(false);
  const [rows, setRows] = useState<LessonRow[] | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [subjects, setSubjects] = useState<Map<string, string>>(new Map());
  const [teachers, setTeachers] = useState<Map<string, string>>(new Map());
  const [justified, setJustified] = useState<Array<{ desde: string; seccion: string | null }>>([]);
  const [institution, setInstitution] = useState<Record<string, string>>({});
  const [absentees, setAbsentees] = useState<Absentee[] | null>(null);
  const [error, setError] = useState('');
  const year = localDate().slice(0, 4);

  const range = rangeOf(period, custom);
  const prev = previousRange(range);

  useEffect(() => {
    const db = supabase!;
    (async () => {
      try {
        const [d, s, st, h, m, p, j, c] = await Promise.all([
          fetchAll<LessonRow>((a, b) => db.from('asistencia_leccion').select('fecha, seccion_id, leccion, presentes, tardias, ausencias, justificadas').gte('fecha', `${year}-01-01`).order('fecha').range(a, b)),
          db.from('secciones').select('id, nombre'),
          fetchAll<Student>((a, b) => db.from('estudiantes').select('id, nombre, cedula, seccion_id').range(a, b)),
          fetchAll<Slot>((a, b) => db.from('horario').select('seccion_id, dia, leccion, materia_id, docente_id').range(a, b)),
          db.from('materias').select('id, nombre'),
          db.from('personal').select('id, nombre'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fetchAll<any>((a, b) =>
            db.from('justificaciones').select('desde, estudiantes(seccion_id)').eq('estado', 'a').gte('desde', `${year}-01-01`).range(a, b),
          ),
          db.from('colegios').select('config').maybeSingle(),
        ]);
        setRows(d);
        setSections(ordenarSecciones(s.data));
        setStudents(st);
        setSlots(h);
        setSubjects(new Map((m.data ?? []).map((x) => [x.id, x.nombre])));
        setTeachers(new Map((p.data ?? []).map((x) => [x.id, x.nombre])));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setJustified(j.map((r: any) => ({ desde: r.desde, seccion: r.estudiantes?.seccion_id ?? null })));
        setInstitution(c.data?.config?.institucion ?? {});
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [year]);

  // Absences by student change with the period.
  useEffect(() => {
    setAbsentees(null);
    supabase!
      .rpc('ausentismo_periodo', { desde: range.from, hasta: range.to })
      .then(({ data, error: e }) => (e ? setError(e.message) : setAbsentees((data ?? []) as Absentee[])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  const inScope = useMemo(() => scopeSections(scope, sections), [scope, sections]);
  const ids = useMemo(() => new Set(inScope.map((s) => s.id)), [inScope]);
  const scoped = useMemo(() => (rows ?? []).filter((r) => ids.has(r.seccion_id)), [rows, ids]);
  const cur = useMemo(() => scoped.filter((r) => inRange(r.fecha, range)), [scoped, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => scoped.filter((r) => inRange(r.fecha, prev)), [scoped, prev.from, prev.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const tc = totals(cur);
  const tp = totals(before);
  const justCur = justified.filter((j) => j.seccion && ids.has(j.seccion) && inRange(j.desde, range)).length;
  const justPrev = justified.filter((j) => j.seccion && ids.has(j.seccion) && inRange(j.desde, prev)).length;

  const groups = new Map<string, LessonRow[]>();
  cur.forEach((r) => {
    const key = mode === 'w' ? monday(r.fecha) : r.fecha.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  });
  const series: ChartPoint[] = [...groups.entries()].map(([key, g]) => ({
    label: mode === 'w' ? new Date(key + 'T00:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }) : new Date(key + '-01T00:00:00').toLocaleDateString('es-CR', { month: 'short' }),
    value: Math.round((totals(g).pct ?? 0) * 10) / 10,
  }));
  const low = series.length ? Math.max(0, Math.floor((Math.min(...series.map((p) => p.value)) - 3) / 5) * 5) : 80;
  const ticks = [100, low + ((100 - low) * 2) / 3, low + (100 - low) / 3, low].map((t) => Math.round(t));

  const bySection = inScope.map((s) => {
    const a = totals(cur.filter((r) => r.seccion_id === s.id));
    const b = totals(before.filter((r) => r.seccion_id === s.id));
    return {
      section: s.nombre,
      pct: a.pct,
      change: pointsChange(a.pct, b.pct),
      absences: a.ausencias,
      lates: a.tardias,
      justified: justified.filter((j) => j.seccion === s.id && inRange(j.desde, range)).length,
    };
  });

  const map = useMemo(() => heatmap(cur), [cur]);
  const subjectRows = useMemo(() => bySubject(cur, slots, subjects, teachers).slice(0, 6), [cur, slots, subjects, teachers]);
  const studentName = new Map(students.map((s) => [s.id, s]));
  const secName = new Map(sections.map((s) => [s.id, s.nombre]));
  const top = (absentees ?? [])
    .filter((a) => a.ausencias > 0 && ids.has(studentName.get(a.estudiante_id)?.seccion_id ?? ''))
    .sort((a, b) => b.ausencias - a.ausencias || b.tardias - a.tardias)
    .slice(0, 10);

  const scopeText = !scope ? 'Todo el colegio' : scope.startsWith('s:') ? `Sección ${secName.get(scope.slice(2)) ?? ''}` : `Nivel ${scope.slice(2)}.º`;
  const periodText = `${rangeLabel(range)} de ${range.to.slice(0, 4)}`;
  const levels = [...new Set(sections.map((s) => levelOf(s.nombre)).filter((x): x is string => !!x))].sort((a, b) => Number(a) - Number(b));
  const file = `${range.from}_${range.to}`;

  const downloads: Array<{ title: string; help: string; data: () => Promise<Table> }> = [
    {
      title: 'Asistencia por sección',
      help: 'Del periodo y el filtro elegidos',
      data: async () => ({
        file: `asistencia-${file}`,
        header: ['Sección', 'Asistencia %', 'Lecciones ausentes', 'Lecciones tarde', 'Justificaciones aprobadas'],
        rows: bySection.map((r) => [r.section, r.pct == null ? '' : r.pct.toFixed(1), r.absences, r.lates, r.justified]),
      }),
    },
    {
      title: 'Ausentismo por estudiante',
      help: 'Ausencias y tardías del periodo',
      data: async () => ({
        file: `ausentismo-${file}`,
        header: ['Estudiante', 'Cédula', 'Sección', 'Lecciones ausentes', 'Lecciones justificadas', 'Lecciones tarde'],
        rows: (absentees ?? [])
          .filter((a) => ids.has(studentName.get(a.estudiante_id)?.seccion_id ?? ''))
          .map((a) => {
            const s = studentName.get(a.estudiante_id);
            return [s?.nombre ?? '', s?.cedula ?? '', secName.get(s?.seccion_id ?? '') ?? '', a.ausencias, a.justificadas, a.tardias];
          }),
      }),
    },
    {
      title: 'Alerta temprana',
      help: 'Casos de hoy con responsable y pasos',
      data: async () => {
        const d = await loadAlerta(session?.user.id);
        const owner = new Map(d.staff.map((p) => [p.id, p.nombre]));
        return {
          file: 'alerta-temprana',
          header: ['Estudiante', 'Sección', 'Riesgo', 'Estado', 'Ausencias sin justificar', 'Seguidas', 'Tardías', 'Motivos', 'Responsable', 'Pasos hechos', 'Último seguimiento'],
          rows: d.cases.map((c) => [
            c.name,
            c.section,
            RISK[c.level].label,
            c.closed ? 'Cerrado' : 'Abierto',
            c.unexcused,
            c.consecutive,
            c.lates,
            c.reasons.join('; '),
            owner.get(c.owner ?? '') ?? '',
            `${c.steps.filter((s) => s.done).length} de ${c.steps.length}`,
            c.notes[0] ? `${c.notes[0].when}: ${c.notes[0].text}` : 'Sin contactar',
          ]),
        };
      },
    },
    {
      title: 'Avisos enviados y lectura',
      help: 'Cuántas personas abrieron cada aviso',
      data: async () => {
        const db = supabase!;
        const { data } = await db.from('avisos').select('id, tipo, titulo, destino, secciones, enviado').eq('estado', 'enviado').gte('enviado', range.from + 'T00:00:00').lte('enviado', range.to + 'T23:59:59').order('enviado');
        const list = (data ?? []) as Array<{ id: string; tipo: string; titulo: string; destino: keyof typeof AUDIENCE_LABEL; secciones: string[]; enviado: string }>;
        const { data: read } = list.length ? await db.rpc('lectura_avisos', { ids: list.map((a) => a.id) }) : { data: [] };
        const lect = new Map(((read ?? []) as Array<{ aviso_id: string; total: number; leidos: number }>).map((r) => [r.aviso_id, r]));
        return {
          file: `avisos-${file}`,
          header: ['Fecha', 'Aviso', 'Tipo', 'Para', 'Personas', 'Lo abrieron', 'Sin abrir', 'Lectura %'],
          rows: list.map((a) => {
            const r = lect.get(a.id);
            return [
              new Date(a.enviado).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
              a.titulo,
              NOTICE_TYPES.find((n) => n.id === a.tipo)?.label ?? a.tipo,
              a.destino === 'sec' ? 'Secciones ' + a.secciones.map((id) => secName.get(id)).filter(Boolean).join(', ') : AUDIENCE_LABEL[a.destino],
              r?.total ?? '',
              r?.leidos ?? '',
              r ? r.total - r.leidos : '',
              r && r.total ? Math.round((100 * r.leidos) / r.total) : '',
            ];
          }),
        };
      },
    },
    {
      title: 'Salidas tempranas y descargos',
      help: 'Del periodo, con hora real de salida',
      data: async () => {
        const { data } = await supabase!
          .from('salidas')
          .select('fecha, hora, modo, motivo, retira_nombre, retira_cedula, comprobante, salio, estudiantes(nombre, secciones(nombre))')
          .gte('fecha', range.from)
          .lte('fecha', range.to)
          .order('fecha');
        return {
          file: `salidas-${file}`,
          header: ['Fecha', 'Estudiante', 'Sección', 'Hora autorizada', 'Cómo', 'Retira', 'Cédula', 'Motivo', 'Comprobante', 'Salió'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows: ((data ?? []) as any[]).map((r) => [
            r.fecha,
            r.estudiantes?.nombre ?? '',
            r.estudiantes?.secciones?.nombre ?? '',
            r.hora,
            r.modo === 'pickup' ? 'Lo retiran' : 'Solo',
            r.retira_nombre ?? '',
            r.retira_cedula ?? '',
            r.motivo ?? '',
            r.comprobante,
            r.salio ? new Date(r.salio).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' }) : '',
          ]),
        };
      },
    },
    {
      title: 'Giras y autorizaciones',
      help: 'Firmas, fecha y estado de pago',
      data: async () => {
        const { data } = await supabase!
          .from('gira_autorizaciones')
          .select('estado, salud, telefono, firma, firmado, pago, giras(titulo, fecha), estudiantes(nombre, secciones(nombre))')
          .order('firmado');
        return {
          file: 'giras-autorizaciones',
          header: ['Gira', 'Fecha', 'Estudiante', 'Sección', 'Respuesta', 'Salud', 'Teléfono', 'Firma', 'Pago'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows: ((data ?? []) as any[]).map((r) => [
            r.giras?.titulo ?? '',
            r.giras?.fecha ?? '',
            r.estudiantes?.nombre ?? '',
            r.estudiantes?.secciones?.nombre ?? '',
            r.estado === 'ok' ? 'Autorizó' : 'No autorizó',
            r.salud ?? '',
            r.telefono ?? '',
            r.firma ? 'Sí' : '',
            { none: 'Pendiente', review: 'En revisión', paid: 'Pagado' }[r.pago as string] ?? '',
          ]),
        };
      },
    },
  ];

  /** The report the school sends to its Dirección Regional: school data, totals with the comparison, a table by section and room for signature and seal. */
  const regionalReport = () => {
    const note = prompt('Observaciones para el informe (opcional). Puede dejarlo vacío.\n\nEj.: «9-1 baja por…»');
    if (note === null) return;
    const change = (c: Change | null) => (c ? ` <span style="color:#555">(${esc(c.text)})</span>` : '');
    const box = (label: string, value: string, c: Change | null) => `<div class="box"><div class="sub">${esc(label)}</div><strong>${esc(value)}</strong>${change(c)}</div>`;
    const body = `
      <table class="meta">
        <tr><td>Institución</td><td><strong>${esc(school?.nombre ?? '')}</strong></td><td>Código presupuestario</td><td>${esc(institution['c-codigo'] || '[CÓDIGO]')}</td></tr>
        <tr><td>Dirección Regional</td><td>${esc(institution['c-dre'] || '[DIRECCIÓN REGIONAL]')}</td><td>Circuito</td><td>${esc(institution['c-circ'] || '[CIRCUITO]')}</td></tr>
        <tr><td>Periodo</td><td>${esc(periodText)}</td><td>Alcance</td><td>${esc(scopeText)}</td></tr>
      </table>
      <div class="boxes">
        ${box('Asistencia', tc.pct == null ? '—' : pct(tc.pct), pointsChange(tc.pct, tp.pct))}
        ${box('Lecciones ausentes', String(tc.ausencias), countChange(tc.ausencias, tp.ausencias))}
        ${box('Lecciones con tardía', String(tc.tardias), countChange(tc.tardias, tp.tardias))}
        ${box('Justificaciones aprobadas', String(justCur), null)}
      </div>
      <h2>Asistencia por sección</h2>
      ${tableHtml(['Sección', 'Asistencia', 'Lecciones ausentes', 'Lecciones tarde', 'Justificaciones', 'Frente al periodo anterior'], bySection.map((r) => [r.section, r.pct == null ? 'Sin lista' : pct(r.pct), r.absences, r.lates, r.justified, r.change?.text ?? '—']))}
      <p class="sub">Comparado con ${esc(rangeLabel(prev))}. La asistencia cuenta las lecciones con el estudiante presente o tarde sobre las lecciones con lista guardada.</p>
      <h2>Observaciones</h2>
      <p style="min-height:60px">${note.trim() ? esc(note.trim()) : '&nbsp;'}</p>
      <div class="sig"><div>${esc(institution['c-dir'] || '[NOMBRE DEL DIRECTOR(A)]')}<br>Director(a)</div><div class="seal">Sello</div></div>`;
    printDocument('Informe de asistencia', body, {
      school: school?.nombre,
      logo: school?.logo ?? undefined,
      css: `.meta td { border: 0; padding: 3px 8px 3px 0; } .meta td:nth-child(odd) { color: #555; width: 18%; }
        .boxes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; } .box { border: 1px solid #ccc; border-radius: 8px; padding: 8px 10px; } .box strong { font-size: 20px; display: block; }
        h2 { font-size: 14px; margin: 18px 0 6px; } .sig { display: flex; align-items: flex-end; gap: 40px; margin-top: 50px; } .sig > div:first-child { flex: 1; border-top: 1px solid #111; padding-top: 6px; text-align: center; }
        .seal { width: 120px; height: 90px; border: 1px dashed #888; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #888; }`,
    });
  };

  return (
    <AdminLayout>
      <PageHeader
        kicker={`Jornada nocturna · curso lectivo ${year}`}
        title="Reportes"
        actions={
          <>
            <select aria-label="Periodo" className="input" style={{ height: 40, width: 'auto' }} value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {period === 'rango' && (
              <>
                <input aria-label="Desde" type="date" className="input" style={{ height: 40, width: 'auto' }} value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                <input aria-label="Hasta" type="date" className="input" style={{ height: 40, width: 'auto' }} value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              </>
            )}
            <select aria-label="Sección o nivel" className="input" style={{ height: 40, width: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="">Todo el colegio</option>
              {levels.map((l) => (
                <option key={l} value={`n:${l}`}>
                  Nivel {l}.º
                </option>
              ))}
              {sections.map((s) => (
                <option key={s.id} value={`s:${s.id}`}>
                  Sección {s.nombre}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={regionalReport} disabled={!rows}>
              Informe para la Dirección Regional
            </Button>
          </>
        }
      />

      {error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {error}
        </p>
      ) : !rows ? (
        <>
          <Skeleton variant="tiles" label="Cargando los reportes" />
          <Skeleton count={6} label="Cargando el gráfico y las tablas" />
        </>
      ) : (
        <>
          <p className="text-sm muted">
            {scopeText} · {periodText}. Se compara con {rangeLabel(prev)}.
          </p>
          <div className="grid-tiles">
            <Stat icon="chart" label="Asistencia" value={tc.pct == null ? '—' : pct(tc.pct)} note={<ChangeNote c={pointsChange(tc.pct, tp.pct)} />} />
            <Stat icon="alert" label="Lecciones ausentes" value={String(tc.ausencias)} ink="orange" note={<ChangeNote c={countChange(tc.ausencias, tp.ausencias)} />} />
            <Stat icon="clock" label="Lecciones con tardía" value={String(tc.tardias)} ink="amber" note={<ChangeNote c={countChange(tc.tardias, tp.tardias)} />} />
            <Stat icon="fileCheck" label="Justificaciones aprobadas" value={String(justCur)} ink="green" note={<ChangeNote c={countChange(justCur, justPrev, false)} />} />
          </div>

          <section aria-labelledby="chart-t" className="card gap-14" style={{ padding: 20 }}>
            <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
              <h2 id="chart-t" className="title-section">
                Asistencia {mode === 'w' ? 'por semana' : 'por mes'}
              </h2>
              <Segmented
                label="Agrupar por"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'w', label: 'Por semana' },
                  { value: 'm', label: 'Por mes' },
                ]}
              />
            </div>
            {series.length === 0 ? (
              <p className="text-sm muted">No hay pases de lista guardados en este periodo.</p>
            ) : (
              <LineChart
                key={`${mode}-${range.from}-${range.to}-${scope}`}
                data={series}
                min={low}
                max={100}
                ticks={ticks}
                format={pct}
                pointLabel={(p) => (mode === 'w' ? `Semana del ${p.label}` : p.label)}
                defaultNote={scopeText}
              />
            )}
          </section>

          <div className="split">
            <section aria-labelledby="secrep-t" className="card split__main gap-10">
              <h2 id="secrep-t" className="title-section">
                Por sección
              </h2>
              <div className="table-wrap">
                <table className="table table--dense" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Sección</th>
                      <th>Asistencia</th>
                      <th className="num">Ausentes</th>
                      <th className="num">Tardías</th>
                      <th className="num">Justif.</th>
                      <th>Vs. antes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySection.map((r) => (
                      <tr key={r.section}>
                        <td className="strong">{r.section}</td>
                        <td>{r.pct == null ? <span className="muted">Sin lista</span> : <Meter wide percent={r.pct} label={pct(r.pct)} />}</td>
                        <td className="num">{r.absences}</td>
                        <td className="num">{r.lates}</td>
                        <td className="num">{r.justified}</td>
                        <td className="text-sm">{r.change ? <span className={`strong ${TONE[r.change.tone]}`}>{r.change.text}</span> : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="map-t" className="card split__side gap-10">
              <h2 id="map-t" className="title-section">
                Cuándo se falta más
              </h2>
              {map.lessons.length === 0 ? (
                <p className="text-sm muted">Sin pases de lista en este periodo.</p>
              ) : (
                <div role="table" aria-label="Porcentaje de lecciones con ausencia, por lección y día" style={{ display: 'grid', gridTemplateColumns: `44px repeat(${WEEK.length}, 1fr)`, gap: 4, textAlign: 'center', fontSize: 12 }}>
                  <span />
                  {WEEK.map((w) => (
                    <span key={w.id} className="muted">
                      {w.label}
                    </span>
                  ))}
                  {map.lessons.map((l, i) => (
                    <FragmentRow key={l} label={`${l}.ª`} cells={map.grid[i]} />
                  ))}
                </div>
              )}
              <span className="text-xs muted">% de lecciones con ausencia sin justificar · más oscuro, más ausencias.</span>

              <div className="row between gap-8" style={{ alignItems: 'baseline', marginTop: 8 }}>
                <h3 className="eyebrow">Por materia</h3>
                <label className="row gap-6 text-xs muted" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={teachersOn} onChange={(e) => setTeachersOn(e.target.checked)} />
                  Mostrar docentes
                </label>
              </div>
              {subjectRows.length === 0 ? (
                <span className="text-sm muted">Sin datos: faltan horarios o pases de lista.</span>
              ) : (
                subjectRows.map((s) => (
                  <div key={s.subject} className="stack gap-2">
                    <div className="row between gap-8 text-sm">
                      <span>{s.subject}</span>
                      <span className="strong">{s.pct == null ? '—' : pct(s.pct)}</span>
                    </div>
                    <span role="img" aria-label={`${s.pct == null ? 0 : Math.round(s.pct)} % de ausencia`} style={{ display: 'block', height: 8, borderRadius: 99, background: 'var(--neutral-bg)' }}>
                      <span style={{ display: 'block', width: `${Math.min(100, (s.pct ?? 0) * 5)}%`, height: 8, borderRadius: 99, background: (s.pct ?? 0) >= 7 ? 'var(--orange)' : (s.pct ?? 0) >= 4 ? 'var(--amber-chart)' : 'var(--blue)' }} />
                    </span>
                    {teachersOn && s.teachers.length > 0 && <span className="text-xs muted">{s.teachers.join(', ')}</span>}
                  </div>
                ))
              )}
              <span className="text-xs muted">Depende del horario: una materia a primera o última hora suma más ausencias, sin que sea culpa de quien la da.</span>
            </section>
          </div>

          <div className="split">
            <section aria-labelledby="top-t" className="card split__main gap-10">
              <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
                <h2 id="top-t" className="title-section">
                  Estudiantes con más ausencias
                </h2>
                <span className="text-sm muted">Lecciones ausentes sin justificar · los 10 primeros</span>
              </div>
              {!absentees ? (
                <Skeleton count={4} />
              ) : top.length === 0 ? (
                <p className="text-sm muted">Nadie tiene ausencias sin justificar en este periodo.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table table--dense" style={{ minWidth: 520 }}>
                    <thead>
                      <tr>
                        <th>Estudiante</th>
                        <th>Sección</th>
                        <th className="num">Ausentes</th>
                        <th className="num">Tardías</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {top.map((a) => {
                        const s = studentName.get(a.estudiante_id);
                        return (
                          <tr key={a.estudiante_id}>
                            <td className="strong">{s?.nombre ?? ''}</td>
                            <td>{secName.get(s?.seccion_id ?? '') ?? '—'}</td>
                            <td className="num strong">{a.ausencias}</td>
                            <td className="num">{a.tardias}</td>
                            <td>
                              <Link to={routes.admin.earlyWarning} className="link-button text-sm">
                                Ver en alerta temprana
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="desc-t" className="card split__side gap-4">
              <h2 id="desc-t" className="title-section" style={{ marginBottom: 6 }}>
                Descargar
              </h2>
              <span className="text-xs muted" style={{ marginBottom: 6 }}>
                Excel descarga el archivo; PDF abre la versión para imprimir o «Guardar como PDF».
              </span>
              {downloads.map((d) => (
                <div key={d.title} className="list-row gap-10">
                  <span className="stack grow">
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</span>
                    <span className="text-xs muted">{d.help}</span>
                  </span>
                  <Button size="sm" aria-label={`Descargar ${d.title} en Excel`} style={{ padding: '0 10px', borderRadius: 9 }} onClick={async () => downloadCsv(await d.data())}>
                    Excel
                  </Button>
                  <Button
                    size="sm"
                    aria-label={`Imprimir o guardar ${d.title} en PDF`}
                    style={{ padding: '0 10px', borderRadius: 9 }}
                    onClick={() => printDocument(d.title, d.data().then((t) => (t.rows.length ? tableHtml(t.header, t.rows) : '<p>Sin datos.</p>')), { school: school?.nombre, logo: school?.logo ?? undefined })}
                  >
                    PDF
                  </Button>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

/** One lesson of the map: its label and a cell per day. */
function FragmentRow({ label, cells }: { label: string; cells: Array<{ pct: number | null; absences: number; marked: number }> }) {
  return (
    <>
      <span className="muted" style={{ textAlign: 'right', paddingTop: 8 }}>
        {label}
      </span>
      {cells.map((c, i) => (
        <span key={i} title={c.marked ? `${c.absences} de ${c.marked} lecciones` : 'Sin lista'} style={{ ...heat(c.pct), borderRadius: 6, padding: '8px 0', fontWeight: 600 }}>
          {c.pct == null ? '—' : Math.round(c.pct)}
        </span>
      ))}
    </>
  );
}
