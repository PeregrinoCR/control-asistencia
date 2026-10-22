import { useState } from 'react';
import { Avatar, Button, Meter, Segmented, Stat, StatusBadge } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { FOLLOW_UP, ROLL_STATE, SECTIONS_TODAY } from '../../data/admin';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { AttentionCards, type AttentionItem } from './AttentionCards';
import { TodayLive } from './TodayLive';

type Shift = 'diu' | 'noc' | 'all';

const SAMPLE_ATTENTION: AttentionItem[] = [
  { id: 'listas', count: 1, title: 'Lista sin pasar', lines: ['11-2 · Karla Montero', '3.ª lección en curso o ya pasada'], tone: 'urgent', cta: 'Ver el pase de lista', href: '#secciones-t' },
  { id: 'justificaciones', count: 6, title: 'Justificaciones por revisar', lines: ['La más antigua: viernes 16 de octubre'], tone: 'warn', cta: 'Revisar', to: routes.admin.justifications },
  { id: 'salidas', count: 2, title: 'Salidas por decidir', lines: ['Mateo Brenes y Sofía Brenes', 'Primera a las 8:00 p. m.'], tone: 'warn', cta: 'Decidir', to: `${routes.admin.trips}?ver=salidas` },
  { id: 'sustitutos', count: 1, title: 'Docente sin sustituto', lines: ['Ricardo Mora', '2 lecciones sin sustituto'], tone: 'warn', cta: 'Asignar sustituto', to: routes.admin.teacherAbsences },
];

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

      <AttentionCards items={SAMPLE_ATTENTION} />

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
            <table className="table table--cards" style={{ minWidth: 640 }}>
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
                      <td className="strong" data-label="Sección">{r.section}</td>
                      <td data-wide data-label="Docente">{r.teacher}</td>
                      <td data-wide data-label="Lista">
                        <StatusBadge status={ROLL_STATE[r.state]} size="md" />
                      </td>
                      <td className="num" data-label="Presentes">{pending ? '—' : r.present}</td>
                      <td className="num strong ink-orange" data-label="Ausentes">{pending ? '—' : r.absent}</td>
                      <td className="num strong ink-amber" data-label="Tarde">{pending ? '—' : r.late}</td>
                      <td data-wide data-label="Avisos leídos">
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
