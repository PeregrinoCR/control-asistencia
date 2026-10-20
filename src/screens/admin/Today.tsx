import { useState } from 'react';
import { Avatar, Button, Meter, Segmented, Stat, StatusBadge } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { FOLLOW_UP, ROLL_STATE, SECTIONS_TODAY } from '../../data/admin';
import { supabase } from '../../lib/supabase';
import { TodayLive } from './TodayLive';

type Shift = 'diu' | 'noc' | 'all';

/** Dirección · Panel del día */
export function Today() {
  return supabase ? <TodayLive /> : <TodaySample />;
}

/** The sample screen, shown while no server is configured. */
function TodaySample() {
  const [shift, setShift] = useState<Shift>('noc');

  return (
    <AdminLayout>
      <PageHeader
        kicker="Lunes 19 de octubre · 6:00 p. m. a 9:50 p. m. · actualizado 7:25 p. m."
        title="Asistencia de hoy"
        actions={
          <>
            <Segmented
              label="Jornada"
              value={shift}
              onChange={setShift}
              options={[
                { value: 'diu', label: 'Diurna' },
                { value: 'noc', label: 'Nocturna' },
                { value: 'all', label: 'Todas' },
              ]}
            />
            <Button regular>Exportar</Button>
            <Button variant="primary">Enviar aviso general</Button>
          </>
        }
      />

      <div className="grid-tiles">
        <Stat label="Asistencia general" value="93,8 %" note="286 de 305 estudiantes" />
        <Stat label="Ausentes" value="19" ink="orange" note="6 ya justificadas" />
        <Stat label="Llegadas tardías" value="11" ink="amber" note="Promedio 12 min" />
        <Stat label="Avisos a familias" value="30 enviados" note="24 leídos · 4 por SMS · 2 sin respuesta" />
      </div>

      <div className="split">
        <section aria-labelledby="secciones-t" className="card split__main">
          <h2 id="secciones-t" className="title-section">
            Pase de lista por sección
          </h2>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Docente</th>
                  <th>Lista</th>
                  <th className="num">Presentes</th>
                  <th className="num">Ausentes</th>
                  <th className="num">Tarde</th>
                  <th>Avisos leídos</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS_TODAY.map((r) => {
                  const pending = r.state === 'pending';
                  return (
                    <tr key={r.section}>
                      <td className="strong">{r.section}</td>
                      <td>{r.teacher}</td>
                      <td>
                        <StatusBadge status={ROLL_STATE[r.state]} size="md" />
                      </td>
                      <td className="num">{pending ? '—' : r.present}</td>
                      <td className="num strong ink-orange">{pending ? '—' : r.absent}</td>
                      <td className="num strong ink-amber">{pending ? '—' : r.late}</td>
                      <td>
                        <Meter
                          percent={r.noticesSent ? Math.round((100 * r.noticesRead) / r.noticesSent) : 0}
                          label={r.noticesSent ? `${r.noticesRead} de ${r.noticesSent}` : '—'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="alertas-t" className="card" style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div className="stack gap-6">
            <h2 id="alertas-t" className="title-section">
              Requieren seguimiento
            </h2>
            <span className="text-sm muted">3 o más ausencias sin justificar este mes</span>
          </div>
          <div className="stack">
            {FOLLOW_UP.map((s) => (
              <div key={s.name} className="list-row">
                <Avatar name={s.name} size="md" tone="orange" />
                <div className="stack grow">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>
                    {s.name} · {s.section}
                  </span>
                  <span className="text-sm muted">{s.meta}</span>
                </div>
                <Button size="sm">Contactar</Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
