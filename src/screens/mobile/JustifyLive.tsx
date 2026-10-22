import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, ButtonLink, Icon, TextareaField } from '../../components';
import { DoneState, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { JUSTIFY_REASONS } from '../../data/family';
import { useAuth } from '../../lib/auth';
import { kidRecords, longDay, uploadFile } from '../../lib/family';
import { LESSONS, localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

/** Familia · Justificar ausencia o llegada tardía, sent to the school. */
export function JustifyLive() {
  return <FamilyGate>{(f) => <Justify f={f} />}</FamilyGate>;
}

function Justify({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const { session } = useAuth();
  const preset = (useLocation().state as { date?: string } | null)?.date;
  const [date, setDate] = useState(preset ?? localDate());
  const [marks, setMarks] = useState<Array<{ lesson: number; mark: string }> | null>(null);
  const [reason, setReason] = useState(0);
  const [comment, setComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setMarks(null);
    kidRecords(kid.id, date, date).then((r) => setMarks(r.days.get(date)?.marks ?? []));
  }, [kid, date]);

  const missed = (marks ?? []).filter((m) => m.mark === 'A');
  const late = (marks ?? []).filter((m) => m.mark === 'T');
  const kind = missed.length ? 'Ausencia' : 'Tardía';
  const affected = missed.length ? missed : late;
  const lessons = affected.map((m) => LESSONS[m.lesson - 1]?.name.replace(' lección', '')).join(', ');

  const send = async () => {
    if (!affected.length) return setError('Ese día no tiene ausencias ni llegadas tardías registradas.');
    setBusy(true);
    setError('');
    try {
      const documento = file ? await uploadFile(f.schoolId, file) : null;
      const { error } = await supabase!.from('justificaciones').insert({
        estudiante_id: kid.id,
        tipo: kind,
        desde: date,
        hasta: date,
        lecciones: `${lessons} (${affected.length} ${affected.length === 1 ? 'lección' : 'lecciones'})`,
        motivo: JUSTIFY_REASONS[reason],
        comentario: comment.trim() || null,
        documento,
        enviado_por: session!.user.id,
      });
      if (error) throw new Error(error.message);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <MobileScreen>
      <ScreenHeader title={kind === 'Tardía' && affected.length ? 'Justificar llegada tardía' : 'Justificar ausencia'} />
      {done ? (
        <DoneState
          title="Justificación enviada"
          actions={
            <ButtonLink variant="dark" to={routes.family.history} size="lg">
              Ver historial
            </ButtonLink>
          }
        >
          Motivo: {JUSTIFY_REASONS[reason].toLowerCase()}. El colegio la revisará y verá el resultado en el historial.
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
                  {!marks ? 'Cargando…' : affected.length ? `${kind}: ${lessons}` : 'Sin ausencias ese día'}
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
              label={<span style={{ fontSize: 15 }}>Comentario para el colegio</span>}
              hint="opcional"
              placeholder="Ej.: Tenía fiebre desde anoche; vuelve mañana."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <div className="stack gap-8">
              <span style={{ fontSize: 15, fontWeight: 700 }}>Comprobante</span>
              <label className="dropzone" style={{ minHeight: 64, justifyContent: 'flex-start', gap: 12, padding: '0 16px', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                <Icon name="paperclip" size={22} style={{ color: 'var(--blue)' }} />
                <span className="stack grow">
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{file ? file.name : 'Adjuntar foto o PDF'}</span>
                  <span className="text-sm muted">{file ? 'Toque para cambiarlo' : 'Dictamen médico o constancia (opcional)'}</span>
                </span>
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
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
              {busy ? 'Enviando…' : 'Enviar justificación'}
            </Button>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
