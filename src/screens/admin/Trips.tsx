import { useState } from 'react';
import { Badge, Button, Segmented, StatusBadge } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { supabase } from '../../lib/supabase';
import { TripsLive } from './TripsLive';
import { CONSENT_STATUS, EARLY_EXITS, PAYMENT_STATUS, TRIP_ROSTER, TRIP_TOTALS, type PaymentState } from '../../data/admin';

type Tab = 'trip' | 'exits';

/** Dirección · Giras y salidas tempranas */
export function Trips() {
  return supabase ? <TripsLive /> : <TripsSample />;
}

/** The sample screen, shown while no server is configured. */
function TripsSample() {
  const [tab, setTab] = useState<Tab>('trip');
  const [payments, setPayments] = useState<Record<string, PaymentState>>(
    Object.fromEntries(TRIP_ROSTER.map((r) => [r.name, r.payment])),
  );
  const paid = Object.values(payments).filter((p) => p === 'paid').length;
  const inReview = Object.values(payments).filter((p) => p === 'review').length;
  const t = TRIP_TOTALS;
  const share = (n: number) => `${((100 * n) / t.minors).toFixed(1)}%`;

  return (
    <AdminLayout>
      <PageHeader
        kicker="Autorizaciones firmadas por encargados legales de menores de edad"
        title="Giras y salidas tempranas"
        actions={<Button variant="primary">Nueva gira</Button>}
      />

      <Segmented
        label="Tipo de permiso"
        mode="tabs"
        size="lg"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'trip', label: 'Giras · 2 próximas' },
          { value: 'exits', label: `Salidas tempranas · hoy ${EARLY_EXITS.length}` },
        ]}
      />

      {tab === 'trip' ? (
        <div className="stack gap-16" role="tabpanel">
          <div className="card row wrap between gap-20" style={{ padding: 20 }}>
            <div className="stack gap-4" style={{ minWidth: 260 }}>
              <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7 }}>
                Gira educativa · Ciencias
              </span>
              <span className="display" style={{ fontSize: 26 }}>
                [DESTINO DE LA GIRA]
              </span>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                Sáb 31 de octubre · 7:00 a. m. – 4:00 p. m. · Secciones 10-1 y 10-2 · a cargo de Prof. Ricardo Mora
              </span>
              <span className="text-sm strong ink-orange">Fecha límite para firmar: lunes 26 de octubre</span>
            </div>
            <div className="stack gap-8" style={{ flex: '1 1 320px', maxWidth: 460 }}>
              <div
                role="img"
                aria-label={`${t.authorized} autorizados, ${t.declined} no autorizados y ${t.pending} pendientes de ${t.minors} menores`}
                style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--neutral-bg)' }}
              >
                <div style={{ width: share(t.authorized), background: 'var(--blue)' }} />
                <div style={{ width: share(t.declined), background: 'var(--orange)' }} />
              </div>
              <div className="legend" style={{ fontSize: 13, gap: '6px 16px', color: 'var(--ink-2)' }}>
                <span className="legend__item">
                  <span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--blue)' }} />
                  {t.authorized} autorizados
                </span>
                <span className="legend__item">
                  <span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--orange)' }} />
                  {t.declined} no autorizados
                </span>
                <span className="legend__item">
                  <span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--neutral-bg)', border: '1px solid var(--border-dashed)' }} />
                  {t.pending} pendientes
                </span>
                <span className="muted">+ {t.adults} mayores de edad confirman ellos mismos</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
                Pagos por SINPE Móvil en esta lista: <strong>{paid} pagados</strong> · {inReview} por confirmar
              </div>
              <div className="row wrap gap-8">
                <Button variant="dark" size="md">
                  Recordar a {t.pending} pendientes
                </Button>
                <Button size="md">Descargar autorizaciones PDF</Button>
              </div>
            </div>
          </div>

          <section aria-labelledby="lista-gira" className="card gap-10">
            <h2 id="lista-gira" className="title-section">
              Menores de edad en la gira
            </h2>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Estudiante</th>
                    <th>Sección</th>
                    <th>Encargado</th>
                    <th>Estado</th>
                    <th>Salud</th>
                    <th>Firma</th>
                    <th>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {TRIP_ROSTER.map((r) => (
                    <tr key={r.name}>
                      <td className="strong">{r.name}</td>
                      <td>{r.section}</td>
                      <td>{r.guardian}</td>
                      <td>
                        <StatusBadge status={CONSENT_STATUS[r.state]} size="md" />
                      </td>
                      <td style={{ color: 'var(--ink-2)' }}>{r.health}</td>
                      <td className="text-sm muted">{r.signed}</td>
                      <td>
                        <span className="row wrap gap-8">
                          <StatusBadge status={PAYMENT_STATUS[payments[r.name]]} />
                          {payments[r.name] === 'review' && (
                            <>
                              <a href={`#comprobante-${r.name}`} className="text-sm" style={{ fontWeight: 700, textDecoration: 'none' }} title={r.receipt}>
                                Ver comprobante
                              </a>
                              <Button size="sm" onClick={() => setPayments({ ...payments, [r.name]: 'paid' })}>
                                Marcar pagado
                              </Button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <section aria-labelledby="lista-sal" className="card gap-10" role="tabpanel">
          <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
            <h2 id="lista-sal" className="title-section">
              Salidas tempranas · lunes 19 de octubre
            </h2>
            <span className="text-sm muted">El guarda del portón ve esta misma lista en su teléfono.</span>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Estudiante</th>
                  <th>Autorizó</th>
                  <th>Cómo se retira</th>
                  <th>Estado</th>
                  <th>Descargo</th>
                </tr>
              </thead>
              <tbody>
                {EARLY_EXITS.map((e) => (
                  <tr key={e.receipt}>
                    <td className="strong tabular">{e.time}</td>
                    <td>
                      <span className="strong">{e.name}</span> <span className="muted">· {e.section}</span>
                    </td>
                    <td>{e.authorizedBy}</td>
                    <td style={{ color: 'var(--ink-2)' }}>{e.how}</td>
                    <td>
                      <Badge tone={e.left ? 'green' : 'amber'} size="md">
                        {e.left ? `Salió ${e.left}` : 'Por salir'}
                      </Badge>
                    </td>
                    <td>
                      <a href={`#descargo-${e.receipt}`} style={{ fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                        Ver {e.receipt}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
