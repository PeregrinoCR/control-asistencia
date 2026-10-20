import { useState } from 'react';
import { Button, Meter, Segmented, Stat } from '../../components';
import { LineChart } from '../../components/LineChart';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { supabase } from '../../lib/supabase';
import { ReportsLive } from './ReportsLive';
import { DOWNLOADS, MONTHLY, OCTOBER_BY_SECTION, WEEKLY } from '../../data/reports';
import { pct } from '../../data/school';

type Mode = 'w' | 'm';

/** Dirección · Reportes */
export function Reports() {
  return supabase ? <ReportsLive /> : <ReportsSample />;
}

/** The sample screen, shown while no server is configured. */
function ReportsSample() {
  const [mode, setMode] = useState<Mode>('w');
  const data = mode === 'w' ? WEEKLY : MONTHLY;
  const avg = data.reduce((a, d) => a + d.value, 0) / data.length;

  return (
    <AdminLayout>
      <PageHeader
        kicker="Jornada nocturna · curso lectivo 2026"
        title="Reportes"
        actions={
          <>
            <Segmented
              label="Agrupar por"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'w', label: 'Por semana' },
                { value: 'm', label: 'Por mes' },
              ]}
            />
            <Button regular style={{ fontSize: 14, padding: '0 14px' }}>
              Todas las secciones
            </Button>
          </>
        }
      />

      <div className="grid-tiles">
        <Stat label="Asistencia promedio" value={pct(avg)} note={mode === 'w' ? 'Últimas 8 semanas' : 'Febrero a octubre'} />
        <Stat label="Ausencias justificadas" value="41 %" note="212 de 517 en octubre" />
        <Stat label="Avisos leídos en 10 min" value="74 %" note="El resto recibe SMS de respaldo" />
        <Stat label="En alerta temprana" value="14" ink="orange" note="3 o más ausencias injustificadas" />
      </div>

      <section aria-labelledby="chart-t" className="card gap-14" style={{ padding: 20 }}>
        <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
          <h2 id="chart-t" className="title-section">
            {mode === 'w' ? 'Asistencia semanal · últimas 8 semanas' : 'Asistencia mensual · curso 2026'}
          </h2>
          <span className="text-sm muted">Porcentaje de lecciones con estudiante presente o tardío</span>
        </div>
        <LineChart
          key={mode}
          data={data}
          min={85}
          max={100}
          ticks={[100, 95, 90, 85]}
          format={pct}
          pointLabel={(p) => (mode === 'w' ? `Semana del ${p.label}` : p.label)}
          defaultNote="Jornada nocturna completa"
        />
      </section>

      <div className="split">
        <section aria-labelledby="secrep-t" className="card split__main gap-10">
          <h2 id="secrep-t" className="title-section">
            Octubre por sección
          </h2>
          <div className="table-wrap">
            <table className="table table--dense" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Asistencia</th>
                  <th className="num">Ausencias</th>
                  <th className="num">Tardías</th>
                  <th className="num">Justificadas</th>
                </tr>
              </thead>
              <tbody>
                {OCTOBER_BY_SECTION.map((r) => (
                  <tr key={r.section}>
                    <td className="strong">{r.section}</td>
                    <td>
                      <Meter wide percent={r.pct} label={pct(r.pct)} />
                    </td>
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
          {DOWNLOADS.map((d) => (
            <div key={d.title} className="list-row gap-10">
              <span className="stack grow">
                <span style={{ fontSize: 14, fontWeight: 700 }}>{d.title}</span>
                <span className="text-xs muted">{d.help}</span>
              </span>
              <Button size="sm" aria-label={`Descargar ${d.title} en Excel`} style={{ padding: '0 10px', borderRadius: 9 }}>
                Excel
              </Button>
              <Button size="sm" aria-label={`Descargar ${d.title} en PDF`} style={{ padding: '0 10px', borderRadius: 9 }}>
                PDF
              </Button>
            </div>
          ))}
        </section>
      </div>
    </AdminLayout>
  );
}
