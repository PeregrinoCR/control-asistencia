import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, ButtonLink, CheckCard, InputField, SignaturePad } from '../../components';
import { DoneState, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { EXIT_HOURS, EXIT_WAYS, GUARDIAN, type ExitWay } from '../../data/family';
import { SCHOOL_NAME } from '../../data/school';
import { routes } from '../../routes';
import { supabase } from '../../lib/supabase';
import { EarlyExitLive } from './EarlyExitLive';

const smallLabel = (text: string) => (
  <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{text}</span>
);

/** Familia · Salida temprana y descargo */
export function EarlyExit() {
  return supabase ? <EarlyExitLive /> : <EarlyExitSample />;
}

/** The sample screen, shown while no server is configured. */
function EarlyExitSample() {
  // Opening from a free-lesson notice preselects that lesson's change time.
  const preset = (useLocation().state as { hour?: number } | null)?.hour;
  const [hour, setHour] = useState(preset ?? 2);
  const [way, setWay] = useState<ExitWay>('pickup');
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  const ready = accepted && signed;
  const hourLabel = `${EXIT_HOURS[hour]} p. m.`;

  return (
    <MobileScreen>
      <ScreenHeader title="Salida temprana" subtitle="Mateo Brenes Quesada · 10-2 · hoy, lun 19 oct" />
      {done ? (
        <DoneState
          title="Salida autorizada"
          actions={
            <>
              <div className="card" style={{ width: '100%', borderRadius: 'var(--radius-lg)', padding: '12px 14px', fontSize: 13, color: 'var(--ink-3)', textAlign: 'left' }}>
                Comprobante n.º ST-2026-1019-0042 · descargo firmado y guardado en el expediente del estudiante.
              </div>
              <ButtonLink variant="dark" size="lg" to={routes.family.home}>
                Volver al inicio
              </ButtonLink>
              <Button variant="ghost-danger" onClick={() => setDone(false)}>
                Cancelar esta autorización
              </Button>
            </>
          }
        >
          Mateo podrá salir a las {hourLabel}. Avisamos al docente de esa lección y al guarda del portón, y le enviaremos
          una notificación cuando salga del colegio.
        </DoneState>
      ) : (
        <>
          <div className="screen-body gap-18">
            <fieldset className="fieldset fieldset--lg">
              <legend>Hora de salida</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
                {EXIT_HOURS.map((h, i) => (
                  <button key={h} type="button" className="choice choice--center" aria-pressed={i === hour} onClick={() => setHour(i)}>
                    {h}
                  </button>
                ))}
              </div>
              <span className="text-sm muted" style={{ display: 'block', marginTop: 8 }}>
                Horas de cambio de lección de la jornada nocturna.
              </span>
            </fieldset>

            <InputField
              id="s-motivo"
              touch
              label={<span style={{ fontSize: 16 }}>Motivo</span>}
              placeholder="Ej.: cita médica a las 8:35 p. m."
            />

            <fieldset className="fieldset fieldset--lg stack gap-8">
              <legend>¿Cómo se retira?</legend>
              {EXIT_WAYS.map((w) => (
                <button key={w.id} type="button" className="choice choice--detail" aria-pressed={w.id === way} onClick={() => setWay(w.id)}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{w.label}</span>
                  <span className="text-sm muted" style={{ fontWeight: 400 }}>
                    {w.help}
                  </span>
                </button>
              ))}
              {way === 'pickup' && (
                <div className="grid-2" style={{ paddingTop: 4 }}>
                  <InputField id="s-quien" touch label={smallLabel('Nombre de quien retira')} defaultValue={GUARDIAN.full} style={{ height: 46, fontSize: 14, padding: '0 12px' }} />
                  <InputField id="s-qced" touch label={smallLabel('Cédula')} defaultValue={GUARDIAN.id} style={{ height: 46, fontSize: 14, padding: '0 12px' }} />
                </div>
              )}
            </fieldset>

            <div className="stack gap-8">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Descargo de responsabilidad</h2>
              <div
                className="stack gap-8"
                tabIndex={0}
                aria-label="Texto del descargo"
                style={{ maxHeight: 170, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)' }}
              >
                <p>
                  Yo, <strong>{GUARDIAN.full}</strong>, cédula [N.º DE CÉDULA], encargada legal de{' '}
                  <strong>Mateo Brenes Quesada</strong>, estudiante de la sección 10-2, solicito y autorizo su salida del{' '}
                  {SCHOOL_NAME} el lunes 19 de octubre de 2026 a las <strong>{hourLabel}</strong>, antes de que finalice la
                  jornada.
                </p>
                <p>
                  {way === 'pickup'
                    ? 'El estudiante será retirado en el portón por la persona adulta indicada en este formulario, quien deberá identificarse con su cédula.'
                    : 'Autorizo expresamente que el estudiante se retire solo, por sus propios medios, sin acompañamiento de una persona adulta.'}
                </p>
                <p>
                  Desde el momento en que el estudiante salga de la institución, asumo la responsabilidad por su seguridad y
                  traslado, y libero al colegio, a su personal docente, administrativo y de seguridad de toda
                  responsabilidad por lo que ocurra fuera de sus instalaciones.
                </p>
                <p>Declaro que la información de este formulario es verdadera.</p>
              </div>
              <CheckCard
                strong
                checked={accepted}
                onChange={(v) => {
                  setAccepted(v);
                  setError(false);
                }}
              >
                He leído y acepto el descargo de responsabilidad.
              </CheckCard>
            </div>

            <div className="stack gap-8">
              <span style={{ fontSize: 16, fontWeight: 700 }}>Firma del encargado</span>
              <SignaturePad
                height={100}
                signed={signed}
                signer={GUARDIAN.full}
                signedAt="19/10/2026 7:05 p. m."
                onSign={() => {
                  setSigned(true);
                  setError(false);
                }}
                onClear={() => setSigned(false)}
              />
            </div>
          </div>
          <div className="screen-footer">
            {error && (
              <span className="form-error" role="alert">
                Acepte el descargo y firme para enviar la autorización.
              </span>
            )}
            <Button variant="primary" size="xl" ready={ready} onClick={() => (ready ? setDone(true) : setError(true))}>
              Autorizar salida a las {hourLabel}
            </Button>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
