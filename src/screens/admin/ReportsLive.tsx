import { useEffect, useState } from 'react';
import { Button, Meter, Segmented, Stat } from '../../components';
import { LineChart, type ChartPoint } from '../../components/LineChart';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { pct } from '../../data/school';
import { fetchAll } from '../../lib/fetchAll';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

type Mode = 'w' | 'm';

interface DayRow {
  fecha: string;
  seccion_id: string;
  presentes: number;
  tardias: number;
  ausencias: number;
}

interface SectionRow {
  section: string;
  pct: number | null;
  absences: number;
  lates: number;
  justified: number;
}

const rate = (rows: DayRow[]) => {
  const p = rows.reduce((n, r) => n + r.presentes + r.tardias, 0);
  const all = p + rows.reduce((n, r) => n + r.ausencias, 0);
  return all ? (100 * p) / all : null;
};

/** Monday of the week of a date. */
function monday(d: string) {
  const x = new Date(d + 'T00:00:00');
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return localDate(x);
}

function downloadCsv(name: string, header: string[], rows: Array<Array<string | number>>) {
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Dirección · Reportes, from the real roll calls of the school year. */
export function ReportsLive() {
  const [mode, setMode] = useState<Mode>('w');
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [justified, setJustified] = useState<Array<{ seccion: string | null }>>([]);
  const [error, setError] = useState('');
  const today = localDate();
  const year = today.slice(0, 4);
  const monthStart = today.slice(0, 8) + '01';

  useEffect(() => {
    const db = supabase!;
    (async () => {
      try {
        const [d, s, j] = await Promise.all([
          fetchAll<DayRow>((a, b) => db.from('asistencia_dia').select('fecha, seccion_id, presentes, tardias, ausencias').gte('fecha', `${year}-01-01`).order('fecha').range(a, b)),
          db.from('secciones').select('id, nombre').order('nombre'),
          db.from('justificaciones').select('estudiantes(seccion_id)').eq('estado', 'a').gte('hasta', monthStart),
        ]);
        setDays(d);
        setSections(s.data ?? []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setJustified(((j.data ?? []) as any[]).map((r) => ({ seccion: r.estudiantes?.seccion_id ?? null })));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [year, monthStart]);

  const rows = days ?? [];
  const groups = new Map<string, DayRow[]>();
  rows.forEach((r) => {
    const key = mode === 'w' ? monday(r.fecha) : r.fecha.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  });
  const series: ChartPoint[] = [...groups.entries()]
    .slice(mode === 'w' ? -8 : undefined)
    .map(([key, g]) => ({
      label:
        mode === 'w'
          ? new Date(key + 'T00:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
          : new Date(key + '-01T00:00:00').toLocaleDateString('es-CR', { month: 'short' }),
      value: Math.round((rate(g) ?? 0) * 10) / 10,
    }));
  const avg = series.length ? series.reduce((a, p) => a + p.value, 0) / series.length : null;
  const low = series.length ? Math.max(0, Math.floor((Math.min(...series.map((p) => p.value)) - 3) / 5) * 5) : 80;
  const ticks = [100, low + ((100 - low) * 2) / 3, low + (100 - low) / 3, low].map((t) => Math.round(t));

  const month = rows.filter((r) => r.fecha >= monthStart);
  const bySection: SectionRow[] = sections.map((s) => {
    const m = month.filter((r) => r.seccion_id === s.id);
    return {
      section: s.nombre,
      pct: rate(m),
      absences: m.reduce((n, r) => n + r.ausencias, 0),
      lates: m.reduce((n, r) => n + r.tardias, 0),
      justified: justified.filter((j) => j.seccion === s.id).length,
    };
  });
  const monthName = new Date(monthStart + 'T00:00:00').toLocaleDateString('es-CR', { month: 'long' });

  const downloads = [
    {
      title: 'Asistencia del mes por sección',
      help: 'Para el informe a la Dirección Regional',
      run: () =>
        downloadCsv(
          `asistencia-${monthStart.slice(0, 7)}.csv`,
          ['Sección', 'Asistencia %', 'Lecciones ausentes', 'Lecciones tarde', 'Justificaciones aprobadas'],
          bySection.map((r) => [r.section, r.pct == null ? '' : r.pct.toFixed(1), r.absences, r.lates, r.justified]),
        ),
    },
    {
      title: 'Ausentismo por estudiante',
      help: 'Ausencias y tardías del mes',
      run: async () => {
        const db = supabase!;
        const [m, st] = await Promise.all([db.from('asistencia_mes').select('estudiante_id, ausencias, tardias'), db.from('estudiantes').select('id, nombre, cedula, secciones(nombre)')]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const byId = new Map(((st.data ?? []) as any[]).map((s) => [s.id, s]));
        downloadCsv(
          `ausentismo-${monthStart.slice(0, 7)}.csv`,
          ['Estudiante', 'Cédula', 'Sección', 'Lecciones ausentes', 'Lecciones tarde'],
          (m.data ?? []).map((r) => {
            const s = byId.get(r.estudiante_id);
            return [s?.nombre ?? '', s?.cedula ?? '', s?.secciones?.nombre ?? '', r.ausencias, r.tardias];
          }),
        );
      },
    },
    {
      title: 'Salidas tempranas y descargos',
      help: 'Del mes, con hora real de salida',
      run: async () => {
        const { data } = await supabase!
          .from('salidas')
          .select('fecha, hora, modo, motivo, retira_nombre, retira_cedula, comprobante, salio, estudiantes(nombre, secciones(nombre))')
          .gte('fecha', monthStart)
          .order('fecha');
        downloadCsv(
          `salidas-${monthStart.slice(0, 7)}.csv`,
          ['Fecha', 'Estudiante', 'Sección', 'Hora autorizada', 'Cómo', 'Retira', 'Cédula', 'Motivo', 'Comprobante', 'Salió'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((data ?? []) as any[]).map((r) => [
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
        );
      },
    },
    {
      title: 'Giras y autorizaciones',
      help: 'Firmas, fecha y estado de pago',
      run: async () => {
        const { data } = await supabase!
          .from('gira_autorizaciones')
          .select('estado, salud, telefono, firma, firmado, pago, giras(titulo, fecha), estudiantes(nombre, secciones(nombre))')
          .order('firmado');
        downloadCsv(
          'giras-autorizaciones.csv',
          ['Gira', 'Fecha', 'Estudiante', 'Sección', 'Respuesta', 'Salud', 'Teléfono', 'Firma', 'Pago'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((data ?? []) as any[]).map((r) => [
            r.giras?.titulo ?? '',
            r.giras?.fecha ?? '',
            r.estudiantes?.nombre ?? '',
            r.estudiantes?.secciones?.nombre ?? '',
            r.estado === 'ok' ? 'Autorizó' : 'No autorizó',
            r.salud ?? '',
            r.telefono ?? '',
            r.firma ?? '',
            { none: 'Pendiente', review: 'En revisión', paid: 'Pagado' }[r.pago as string] ?? '',
          ]),
        );
      },
    },
  ];

  return (
    <AdminLayout>
      <PageHeader
        kicker={`Jornada nocturna · curso lectivo ${year}`}
        title="Reportes"
        actions={
          <Segmented
            label="Agrupar por"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'w', label: 'Por semana' },
              { value: 'm', label: 'Por mes' },
            ]}
          />
        }
      />

      {error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {error}
        </p>
      ) : !days ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <>
          <div className="grid-tiles">
            <Stat label="Asistencia promedio" value={avg == null ? '—' : pct(avg)} note={mode === 'w' ? 'Últimas 8 semanas' : `Curso ${year}`} />
            <Stat label={`Lecciones ausentes en ${monthName}`} value={String(bySection.reduce((n, r) => n + r.absences, 0))} ink="orange" />
            <Stat label={`Lecciones con tardía en ${monthName}`} value={String(bySection.reduce((n, r) => n + r.lates, 0))} ink="amber" />
            <Stat label="Justificaciones aprobadas" value={String(justified.length)} ink="green" note={`En ${monthName}`} />
          </div>

          <section aria-labelledby="chart-t" className="card gap-14" style={{ padding: 20 }}>
            <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
              <h2 id="chart-t" className="title-section">
                {mode === 'w' ? 'Asistencia semanal · últimas 8 semanas' : `Asistencia mensual · curso ${year}`}
              </h2>
              <span className="text-sm muted">Porcentaje de lecciones con estudiante presente o tardío</span>
            </div>
            {series.length === 0 ? (
              <p className="text-sm muted">Todavía no hay pases de lista guardados.</p>
            ) : (
              <LineChart
                key={mode}
                data={series}
                min={low}
                max={100}
                ticks={ticks}
                format={pct}
                pointLabel={(p) => (mode === 'w' ? `Semana del ${p.label}` : p.label)}
                defaultNote="Todas las secciones"
              />
            )}
          </section>

          <div className="split">
            <section aria-labelledby="secrep-t" className="card split__main gap-10">
              <h2 id="secrep-t" className="title-section">
                {monthName[0].toUpperCase() + monthName.slice(1)} por sección
              </h2>
              <div className="table-wrap">
                <table className="table table--dense" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th>Sección</th>
                      <th>Asistencia</th>
                      <th className="num">Lecciones ausentes</th>
                      <th className="num">Tardías</th>
                      <th className="num">Justificaciones</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="desc-t" className="card split__side gap-4">
              <h2 id="desc-t" className="title-section" style={{ marginBottom: 6 }}>
                Descargar reportes
              </h2>
              <span className="text-xs muted" style={{ marginBottom: 6 }}>
                Se descargan como archivo para abrir en Excel.
              </span>
              {downloads.map((d) => (
                <div key={d.title} className="list-row gap-10">
                  <span className="stack grow">
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</span>
                    <span className="text-xs muted">{d.help}</span>
                  </span>
                  <Button size="sm" aria-label={`Descargar ${d.title} en Excel`} style={{ padding: '0 10px', borderRadius: 9 }} onClick={d.run}>
                    Excel
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
