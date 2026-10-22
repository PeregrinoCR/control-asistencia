import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, ButtonLink, Icon, TextareaField } from '../../components';
import { DoneState, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { JUSTIFY_REASONS } from '../../data/family';
import { kidRecords, longDay } from '../../lib/family';
import { avisarMotivo, DEFAULT_JUSTIF, loadJustifConfig, ultimoDia, type JustifConfig } from '../../lib/justificaciones';
import { LESSONS, localDate } from '../../lib/schedule';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

/**
 * Familia · Avisar el motivo de una ausencia. It only informs: the student shows the paper proof to each teacher,
 * and each teacher decides whether to justify their lesson.
 */
export function JustifyLive() {
  return <FamilyGate>{(f) => <Justify f={f} />}</FamilyGate>;
}

function Justify({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const preset = (useLocation().state as { date?: string } | null)?.date;
  const [date, setDate] = useState(preset ?? localDate());
  const [marks, setMarks] = useState<Array<{ lesson: number; mark: string }> | null>(null);
  const [reason, setReason] = useState(0);
  const [comment, setComment] = useState('');
  const [rules, setRules] = useState<JustifConfig>(DEFAULT_JUSTIF);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    loadJustifConfig().then(setRules);
  }, []);

  useEffect(() => {
    setMarks(null);
    kidRecords(kid.id, date, date).then((r) => setMarks(r.days.get(date)?.marks ?? []));
  }, [kid, date]);

  // Missed lessons, justified or not: the family can tell the reason either way.
  const missed = (marks ?? []).filter((m) => m.mark === 'A' || m.mark === 'J');
  const lessons = missed.map((m) => LESSONS[m.lesson - 1]?.name.replace(' lección', '')).join(', ');
  const deadline = ultimoDia(date, rules.diasFamilia, rules.noLectivos);

  const send = async () => {
    if (!missed.length) return setError('Ese día no tiene ausencias registradas.');
    setBusy(true);
    setError('');
    const msg = await avisarMotivo(f.schoolId, kid.id, date, JUSTIFY_REASONS[reason], comment);
    setBusy(false);
    if (msg) return setError(msg);
    setDone(true);
  };

  return (
    <MobileScreen>
      <ScreenHeader title="Avisar el motivo" />
      {done ? (
        <DoneState
          title="Aviso enviado"
          actions={
            <ButtonLink variant="dark" to={routes.family.history} size="lg">
              Ver historial
            </ButtonLink>
          }
        >
          Motivo: {JUSTIFY_REASONS[reason].toLowerCase()}. Esto solo informa a los profesores. Para justificar la ausencia, presente el comprobante a cada profesor en el colegio antes del {longDay(deadline)}.
        </DoneState>
      ) : (
        <>
          <div className="screen-body gap-18">
            <KidPicker f={f} />
            <div className="card gap-6" style={{ padding: '14px 16px' }}>
              <div className="row between" style={{ fontSize: 14 }}>
                <span className="muted">Estudiante</span>
                <span className="strong">
                  {kid.name} · {kid.section}
                </span>
              </div>
              <div className="row between gap-8" style={{ fontSize: 14 }}>
                <label htmlFor="j-fecha" className="muted">
                  Fecha
                </label>
                <input id="j-fecha" type="date" className="input" style={{ width: 'auto', height: 36 }} max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="row between" style={{ fontSize: 14 }}>
                <span className="muted">Registro</span>
                <span className="strong">
                  {!marks ? 'Cargando…' : missed.length ? `Ausencia: ${lessons}` : 'Sin ausencias ese día'}
                </span>
              </div>
            </div>
            <span className="text-sm muted" style={{ marginTop: -8 }}>
              {longDay(date)}
            </span>

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
              label={<span style={{ fontSize: 15 }}>Comentario para los profesores</span>}
              hint="opcional"
              placeholder="Ej.: Tenía fiebre desde anoche; vuelve mañana."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <div className="notice">
              <Icon name="paperclip" size={20} />
              <span>
                El comprobante se presenta en papel a cada profesor con quien faltó, hasta el <strong>{longDay(deadline)}</strong>. Cada profesor decide si justifica su lección.
              </span>
            </div>
          </div>
          <div className="screen-footer">
            {error && (
              <span className="form-error" role="alert">
                {error}
              </span>
            )}
            {!marks && (
              <span className="text-sm muted" style={{ textAlign: 'center' }}>
                Cargando el registro de ese día…
              </span>
            )}
            <Button variant="primary" size="xl" block disabled={busy || !marks} onClick={send}>
              {busy ? 'Enviando…' : 'Enviar aviso'}
            </Button>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
