import { useState } from 'react';
import { Button, ButtonLink, Icon, TextareaField } from '../../components';
import { DoneState, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { JUSTIFY_REASONS } from '../../data/family';
import { routes } from '../../routes';

const SUMMARY = [
  ['Estudiante', 'Mateo Brenes Quesada · 10-2'],
  ['Fecha', 'Lunes 19 de octubre'],
  ['Registrado por', 'Prof. Andrea Solís, 6:12 p. m.'],
];

/** Familia · Justificar ausencia */
export function Justify() {
  const [reason, setReason] = useState(0);
  const [done, setDone] = useState(false);

  return (
    <MobileScreen>
      <ScreenHeader title="Justificar ausencia" />
      {done ? (
        <DoneState
          title="Justificación enviada"
          actions={
            <>
              <ButtonLink variant="dark" to={routes.family.history} size="lg">
                Ver historial
              </ButtonLink>
              <Button variant="ghost" onClick={() => setDone(false)}>
                Editar justificación
              </Button>
            </>
          }
        >
          Motivo: {JUSTIFY_REASONS[reason].toLowerCase()}. La profesora Andrea Solís y la oficina de orientación la
          revisarán. Le avisaremos cuando quede aprobada.
        </DoneState>
      ) : (
        <>
          <div className="screen-body gap-18">
            <div className="card gap-6" style={{ padding: '14px 16px' }}>
              {SUMMARY.map(([k, v]) => (
                <div key={k} className="row between" style={{ fontSize: 14 }}>
                  <span className="muted">{k}</span>
                  <span className="strong">{v}</span>
                </div>
              ))}
            </div>

            <fieldset className="fieldset">
              <legend style={{ fontSize: 15, marginBottom: 10 }}>Motivo</legend>
              <div className="grid-2">
                {JUSTIFY_REASONS.map((r, i) => (
                  <button key={r} type="button" className="choice" aria-pressed={i === reason} onClick={() => setReason(i)}>
                    {r}
                  </button>
                ))}
              </div>
            </fieldset>

            <TextareaField
              id="nota"
              touch
              rows={4}
              label={<span style={{ fontSize: 15 }}>Comentario para la docente</span>}
              hint="opcional"
              placeholder="Ej.: Tenía fiebre desde anoche; vuelve mañana."
            />

            <div className="stack gap-8">
              <span style={{ fontSize: 15, fontWeight: 700 }}>Comprobante</span>
              <button type="button" className="dropzone" style={{ minHeight: 64, justifyContent: 'flex-start', gap: 12, padding: '0 16px', color: 'var(--ink)', textAlign: 'left' }}>
                <Icon name="paperclip" size={22} style={{ color: 'var(--blue)' }} />
                <span className="stack">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Adjuntar foto o PDF</span>
                  <span className="text-sm muted">Dictamen médico o constancia</span>
                </span>
              </button>
            </div>
          </div>
          <div className="screen-footer">
            <Button variant="primary" size="xl" block onClick={() => setDone(true)}>
              Enviar justificación
            </Button>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
