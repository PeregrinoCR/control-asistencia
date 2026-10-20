import { useState } from 'react';
import { Badge, Button, Icon, Segmented, StatusBadge, TextareaField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { JUSTIFICATIONS, JUST_STATUS, type JustState, type Justification } from '../../data/admin';
import { supabase } from '../../lib/supabase';
import { JustificationsLive } from './JustificationsLive';

type Inbox = 'p' | 'a' | 'r';

/** "Pendientes" also holds requests waiting for more information. */
const inInbox = (state: JustState, inbox: Inbox) => (inbox === 'p' ? state === 'p' || state === 'i' : state === inbox);

/** Dirección · Justificaciones */
export function Justifications() {
  return supabase ? <JustificationsLive /> : <JustificationsView items={JUSTIFICATIONS} />;
}

interface ViewProps {
  items: Justification[];
  /** Saves a decision; resolves to an error message, or '' when saved. Sample data omits it. */
  onDecide?: (id: Justification['id'], state: JustState) => Promise<string>;
  /** Shown instead of the list while loading or on errors. */
  status?: string;
}

export function JustificationsView({ items, onDecide, status }: ViewProps) {
  const [overrides, setOverrides] = useState<Record<string, JustState>>({});
  const [inbox, setInbox] = useState<Inbox>('p');
  const [selectedId, setSelectedId] = useState<Justification['id'] | null>(null);
  const [error, setError] = useState('');

  const stateOf = (j: Justification) => overrides[j.id] ?? j.state;
  const list = items.filter((j) => inInbox(stateOf(j), inbox));
  const count = (k: Inbox) => items.filter((j) => inInbox(stateOf(j), k)).length;

  const d = items.find((j) => j.id === (selectedId ?? list[0]?.id)) ?? list[0];
  const dState = d && stateOf(d);
  const setState = async (v: JustState) => {
    const before = dState;
    setOverrides({ ...overrides, [d.id]: v });
    const err = onDecide ? await onDecide(d.id, v) : '';
    setError(err);
    if (err) setOverrides((o) => ({ ...o, [d.id]: before }));
  };
  const resolved = dState === 'a' || dState === 'r';

  return (
    <AdminLayout>
      <PageHeader
        kicker="Plazo para justificar: [N.º] días hábiles según el reglamento vigente"
        title="Justificaciones"
        actions={
          <Segmented
            label="Estado"
            mode="tabs"
            size="lg"
            value={inbox}
            onChange={(v) => {
              setInbox(v);
              setSelectedId(null);
            }}
            options={[
              { value: 'p', label: `Pendientes · ${count('p')}` },
              { value: 'a', label: `Aprobadas · ${count('a')}` },
              { value: 'r', label: `Rechazadas · ${count('r')}` },
            ]}
          />
        }
      />

      {status ? (
        <p className="text-sm muted">{status}</p>
      ) : (
        <div className="split">
          <section aria-label="Solicitudes" className="stack gap-8" style={{ flex: '1 1 340px', minWidth: 0 }}>
            {list.map((j) => {
              const on = j.id === d.id;
              return (
                <button
                  key={j.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelectedId(j.id)}
                  className="stack gap-6"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                    background: on ? 'var(--blue-bg)' : 'var(--surface)',
                    padding: 14,
                    textAlign: 'left',
                    color: 'var(--ink)',
                  }}
                >
                  <span className="row between gap-8" style={{ width: '100%' }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>
                      {j.name} · {j.section}
                    </span>
                    <span className="text-xs muted">{j.sent}</span>
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                    {j.kind} del {j.date} · {j.reason}
                  </span>
                  <span className="row wrap gap-6">
                    <StatusBadge status={JUST_STATUS[stateOf(j)]} />
                    <Badge tone="soft">{j.doc ? 'Con comprobante' : 'Sin comprobante'}</Badge>
                  </span>
                </button>
              );
            })}
            {list.length === 0 && (
              <div
                className="card"
                style={{
                  borderStyle: 'dashed',
                  borderColor: 'var(--border-input)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 24,
                  textAlign: 'center',
                  fontSize: 15,
                  color: 'var(--muted)',
                }}
              >
                No hay solicitudes en esta bandeja.
              </div>
            )}
          </section>

          {d && (
            <section aria-labelledby="det-j" className="card split__main gap-18" style={{ padding: 22, flexBasis: 480 }}>
              <div className="row wrap between gap-12" style={{ alignItems: 'flex-start' }}>
                <div className="stack gap-4">
                  <span className="eyebrow">{typeof d.id === 'number' ? `Solicitud J-2026-${400 + d.id}` : `Enviada ${d.sent}`}</span>
                  <h2 id="det-j" className="display" style={{ fontSize: 26 }}>
                    {d.name}
                  </h2>
                  <span className="muted" style={{ fontSize: 14 }}>
                    Sección {d.section} · {d.minor ? 'menor de edad' : 'mayor de edad'}
                  </span>
                </div>
                <StatusBadge status={JUST_STATUS[dState]} size="lg" />
              </div>

              <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {[
                  [d.kind, d.date],
                  ['Lecciones afectadas', d.lessons],
                  ['Motivo', d.reason],
                  ['Enviada por', d.by],
                ].map(([k, v]) => (
                  <div key={k} className="card card--inset">
                    <span className="text-xs muted" style={{ fontWeight: 600 }}>
                      {k}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>

              <div className="stack gap-6">
                <h3 className="eyebrow" style={{ fontSize: 14 }}>
                  Comentario
                </h3>
                <p style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--ink-2)' }}>{d.comment}</p>
              </div>

              <div className="stack gap-6">
                <h3 className="eyebrow" style={{ fontSize: 14 }}>
                  Comprobante
                </h3>
                {d.doc ? (
                  <div className="row gap-12" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                    <span
                      style={{
                        width: 44,
                        height: 54,
                        borderRadius: 6,
                        background: 'var(--blue-bg)',
                        color: 'var(--blue)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="file" size={22} />
                    </span>
                    <span className="stack grow">
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{d.doc}</span>
                      <span className="text-sm muted">Adjuntado desde la app</span>
                    </span>
                    {!onDecide && (
                      <a href={`#comprobante-${d.id}`} style={{ fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                        Abrir
                      </a>
                    )}
                  </div>
                ) : (
                  <span className="muted" style={{ fontSize: 15 }}>
                    No adjuntó comprobante.
                  </span>
                )}
              </div>

              {resolved ? (
                <div className="row wrap between gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
                  <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>
                    {dState === 'a'
                      ? `Aprobada. La ausencia quedó como justificada y se avisó a ${d.minor ? 'la familia.' : 'el estudiante.'}`
                      : 'Rechazada. Se notificó el motivo y la ausencia sigue injustificada.'}
                  </span>
                  <Button size="md" onClick={() => setState('p')}>
                    Volver a pendiente
                  </Button>
                </div>
              ) : (
                <div className="stack gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
                  {!onDecide && (
                    <TextareaField
                      id="j-nota"
                      rows={2}
                      label={<span style={{ fontSize: 14 }}>Nota para la familia</span>}
                      hint="opcional"
                      placeholder="Ej.: Aprobada. Recuerde coordinar con la docente la prueba pendiente."
                      style={{ borderRadius: 'var(--radius-md)', resize: 'none' }}
                    />
                  )}
                  <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
                    <Button size="lg" onClick={() => setState('i')}>
                      Pedir más información
                    </Button>
                    <Button variant="danger-outline" size="lg" onClick={() => setState('r')}>
                      Rechazar
                    </Button>
                    <Button variant="primary" size="lg" style={{ padding: '0 20px' }} onClick={() => setState('a')}>
                      Aprobar justificación
                    </Button>
                  </div>
                  <span className="text-sm muted">
                    {onDecide
                      ? 'La decisión queda guardada. El aviso a la familia se enviará cuando se activen las notificaciones.'
                      : 'Al resolver, la familia recibe un aviso y la ausencia se actualiza en el registro del docente.'}
                  </span>
                </div>
              )}
              {error && (
                <span role="alert" className="text-sm ink-orange">
                  No se guardó: {error}
                </span>
              )}
            </section>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
