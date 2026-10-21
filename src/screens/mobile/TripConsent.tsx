import { useState } from 'react';
import { Button, ButtonLink, CheckCard, InputField, SignaturePad, SinpePayment } from '../../components';
import { DoneState, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { GUARDIAN, TRIP_DECLARATIONS, TRIP_PAYMENT } from '../../data/family';
import { routes } from '../../routes';
import { supabase } from '../../lib/supabase';
import { TripConsentLive } from './TripConsentLive';

const TRIP_FACTS = [
  ['Fecha', 'Sáb 31 de octubre'],
  ['Horario', '7:00 a. m. – 4:00 p. m.'],
  ['Salida y regreso', 'Portón principal'],
  ['Costo', TRIP_PAYMENT.amount],
  ['Transporte', '[EMPRESA DE BUSES]'],
  ['A cargo', 'Prof. Ricardo Mora'],
];

type Mode = 'form' | 'approved' | 'declined';

/** Familia · Autorizar gira */
export function TripConsent() {
  return supabase ? <TripConsentLive /> : <TripConsentSample />;
}

/** The sample screen, shown while no server is configured. */
function TripConsentSample() {
  const [checks, setChecks] = useState(TRIP_DECLARATIONS.map(() => false));
  const [firma, setFirma] = useState<string | null>(null);
  const signed = !!firma;
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<Mode>('form');
  const [receipt, setReceipt] = useState<string | null>(null);
  const ready = checks.every(Boolean) && signed;

  const approve = () => (ready ? setMode('approved') : setError(true));

  return (
    <MobileScreen>
      <ScreenHeader title="Autorización de gira" subtitle="Mateo Brenes Quesada · 10-2 · menor de edad" />
      {mode !== 'form' ? (
        <DoneState
          title={mode === 'approved' ? 'Gira autorizada' : 'No autorizó la gira'}
          tone={mode === 'approved' ? 'success' : 'neutral'}
          icon={mode === 'approved' ? 'check' : 'x'}
          actions={
            <>
              <ButtonLink variant="dark" size="lg" to={routes.family.home}>
                Volver al inicio
              </ButtonLink>
              <Button variant="ghost" onClick={() => setMode('form')}>
                Cambiar mi respuesta
              </Button>
            </>
          }
        >
          {mode === 'approved'
            ? 'El colegio recibió su autorización firmada. El profesor Ricardo Mora tendrá a Mateo en la lista de la gira y le avisaremos cuando salgan y cuando regresen.' +
              (receipt ? ' Su comprobante de pago está en revisión.' : ' Recuerde pagar la gira por SINPE Móvil antes del 26 de octubre.')
            : 'Avisamos al profesor a cargo. Mateo no está en la lista de la gira y ese día no tiene lecciones.'}
        </DoneState>
      ) : (
        <>
          <div className="screen-body gap-16">
            <div className="trip-card">
              <div className="stack gap-2">
                <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7, color: 'var(--night-ink-3)' }}>
                  Gira educativa · Ciencias
                </span>
                <span className="display" style={{ fontSize: 22 }}>
                  [DESTINO DE LA GIRA]
                </span>
              </div>
              <div className="grid-2" style={{ gap: '10px 12px', fontSize: 14 }}>
                {TRIP_FACTS.map(([k, v]) => (
                  <div key={k} className="stack">
                    <span className="trip-card__label">{k}</span>
                    <span className="strong">{v}</span>
                  </div>
                ))}
              </div>
              <p className="trip-card__notes">
                Llevar: carné estudiantil o cédula, almuerzo, agua, ropa cómoda y repelente. Firme antes del lunes 26 de
                octubre.
              </p>
            </div>

            <div className="stack gap-10">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Datos para el día de la gira</h2>
              <InputField
                id="g-salud"
                touch
                label={<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>Alergias, condiciones médicas o medicamentos</span>}
                placeholder="Ej.: asma, usa inhalador"
              />
              <InputField
                id="g-contacto"
                touch
                type="tel"
                label={<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>Teléfono de contacto ese día</span>}
                defaultValue={GUARDIAN.phone}
              />
            </div>

            <fieldset className="fieldset fieldset--lg stack gap-8">
              <legend>Declaración del encargado legal</legend>
              {TRIP_DECLARATIONS.map((text, i) => (
                <CheckCard
                  key={text}
                  checked={checks[i]}
                  onChange={(v) => {
                    setChecks(checks.map((c, j) => (j === i ? v : c)));
                    setError(false);
                  }}
                >
                  {text}
                </CheckCard>
              ))}
            </fieldset>

            {TRIP_PAYMENT.enabled && (
              <SinpePayment
                amount={TRIP_PAYMENT.amount}
                number={TRIP_PAYMENT.sinpeNumber}
                holder={TRIP_PAYMENT.holder}
                reference={TRIP_PAYMENT.reference}
                receipt={receipt}
                onReceipt={setReceipt}
              />
            )}

            <div className="stack gap-8">
              <span style={{ fontSize: 16, fontWeight: 700 }}>Firma del encargado</span>
              <SignaturePad
                value={firma}
                signer={GUARDIAN.full}
                signedAt="19/10/2026 7:32 p. m."
                onChange={(v) => {
                  setFirma(v);
                  setError(false);
                }}
              />
              <InputField
                id="g-cedula"
                touch
                inputMode="numeric"
                label={<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>Número de cédula del encargado</span>}
                defaultValue={GUARDIAN.id}
              />
            </div>
          </div>
          <div className="screen-footer">
            {error && (
              <span className="form-error" role="alert">
                Marque las tres casillas y firme para autorizar.
              </span>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <Button size="xl" style={{ fontSize: 15 }} onClick={() => setMode('declined')}>
                No autorizo
              </Button>
              <Button variant="primary" size="xl" style={{ fontSize: 15 }} ready={ready} onClick={approve}>
                Autorizar participación
              </Button>
            </div>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
