import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, ButtonLink, CheckCard, InputField, SignaturePad } from '../../components';
import { DoneState, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { EXIT_HOURS, EXIT_WAYS, type ExitWay } from '../../data/family';
import { useAuth } from '../../lib/auth';
import { longDay } from '../../lib/family';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

const smallLabel = (text: string) => <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{text}</span>;
const inputStyle = { height: 46, fontSize: 14, padding: '0 12px' };

/** Familia · Salida temprana y descargo, saved for the gate. */
export function EarlyExitLive() {
  return <FamilyGate>{(f) => <EarlyExit f={f} />}</FamilyGate>;
}

interface Saved {
  id: string;
  hora: string;
  modo: ExitWay;
  comprobante: string;
  salio: string | null;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  motivo_rechazo: string | null;
}

function EarlyExit({ f }: { f: FamilyCtx }) {
  const { kid, me } = f;
  const { school, session } = useAuth();
  const preset = (useLocation().state as { hour?: number } | null)?.hour;
  const [hour, setHour] = useState(preset ?? 2);
  const [way, setWay] = useState<ExitWay>('pickup');
  const [reason, setReason] = useState('');
  const [pickupName, setPickupName] = useState(me.name);
  const [pickupId, setPickupId] = useState(me.idNumber);
  const [accepted, setAccepted] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const signed = !!firma;
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const date = localDate();

  useEffect(() => {
    setSaved(undefined);
    supabase!
      .from('salidas')
      .select('id, hora, modo, comprobante, salio, estado, motivo_rechazo')
      .eq('estudiante_id', kid.id)
      .eq('fecha', date)
      .maybeSingle()
      .then(({ data }) => setSaved(data as Saved | null));
  }, [kid, date]);

  // Field errors only appear after the first try to send.
  const [tried, setTried] = useState(false);
  const ready = accepted && signed && (way === 'alone' || (pickupName.trim() && pickupId.trim()));
  const hourLabel = `${EXIT_HOURS[hour]} p. m.`;
  const signedAt = new Date().toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });

  const submit = async () => {
    if (!ready) setTried(true);
    if (!ready) return setError('Complete quién lo retira, acepte el descargo y firme para enviar la autorización.');
    setBusy(true);
    const { data, error } = await supabase!
      .from('salidas')
      .upsert(
        {
          estudiante_id: kid.id,
          fecha: date,
          hora: EXIT_HOURS[hour],
          modo: way,
          motivo: reason.trim() || null,
          retira_nombre: way === 'pickup' ? pickupName.trim() : null,
          firma,
          estado: 'pendiente',
          motivo_rechazo: null,
          retira_cedula: way === 'pickup' ? pickupId.trim() : null,
          autorizado_por: session!.user.id,
        },
        { onConflict: 'estudiante_id,fecha' },
      )
      .select('id, hora, modo, comprobante, salio, estado, motivo_rechazo')
      .single();
    setBusy(false);
    if (error) return setError('No se guardó: ' + error.message);
    setSaved(data as Saved);
  };

  const cancel = async () => {
    const { error } = await supabase!.from('salidas').delete().eq('id', saved!.id);
    if (error) return setError('No se pudo cancelar: ' + error.message);
    setSaved(null);
    setFirma(null);
    setAccepted(false);
  };

  if (saved === undefined)
    return (
      <MobileScreen>
        <ScreenHeader title="Salida temprana" />
        <p className="text-sm muted" style={{ padding: 24 }}>
          Cargando…
        </p>
      </MobileScreen>
    );

  return (
    <MobileScreen>
      <ScreenHeader title="Salida temprana" subtitle={`${kid.name} · ${kid.section} · hoy, ${longDay(date)}`} />
      {saved ? (
        <DoneState
          tone={saved.estado === 'rechazada' ? 'alert' : 'success'}
          icon={saved.estado === 'rechazada' ? 'alert' : 'check'}
          title={
            saved.estado === 'pendiente'
              ? 'Solicitud enviada'
              : saved.estado === 'rechazada'
                ? 'Salida no autorizada'
                : saved.salio
                  ? 'Ya salió del colegio'
                  : 'Salida autorizada'
          }
          actions={
            <>
              <div className="card" style={{ width: '100%', borderRadius: 'var(--radius-lg)', padding: '12px 14px', fontSize: 13, color: 'var(--ink-3)', textAlign: 'left' }}>
                {saved.estado === 'pendiente'
                  ? 'Dirección revisará la solicitud y le avisaremos la decisión.'
                  : saved.estado === 'rechazada'
                    ? `Motivo: ${saved.motivo_rechazo ?? 'sin detalle'}.`
                    : `Comprobante n.º ${saved.comprobante} · descargo firmado y guardado.`}
              </div>
              {saved.estado === 'rechazada' && (
                <Button
                  variant="dark"
                  size="lg"
                  onClick={() => {
                    setSaved(null);
                    setFirma(null);
                    setAccepted(false);
                  }}
                >
                  Pedir la salida de nuevo
                </Button>
              )}
              <ButtonLink variant="dark" size="lg" to={routes.family.home}>
                Volver al inicio
              </ButtonLink>
              {!saved.salio && (
                <Button variant="ghost-danger" onClick={cancel}>
                  Cancelar esta autorización
                </Button>
              )}
            </>
          }
        >
          {saved.salio
            ? `${kid.short} salió a las ${new Date(saved.salio).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' })}.`
            : saved.estado === 'pendiente'
              ? `Solicitud de salida de ${kid.short} a las ${saved.hora} p. m. Le avisaremos la decisión de dirección.`
              : saved.estado === 'rechazada'
                ? `Dirección no autorizó la salida de ${kid.short} a las ${saved.hora} p. m.`
                : `${kid.short} podrá salir a las ${saved.hora} p. m. El guarda del portón ya tiene la autorización.`}
          {error && <span className="form-error">{error}</span>}
        </DoneState>
      ) : (
        <>
          <div className="screen-body gap-18">
            <KidPicker f={f} />
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
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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
                  <InputField id="s-quien" touch label={smallLabel('Nombre de quien retira')} error={tried && !pickupName.trim() ? 'Escriba el nombre' : undefined} style={inputStyle} value={pickupName} onChange={(e) => setPickupName(e.target.value)} />
                  <InputField id="s-qced" touch label={smallLabel('Cédula')} error={tried && !pickupId.trim() ? 'Escriba la cédula' : undefined} style={inputStyle} value={pickupId} onChange={(e) => setPickupId(e.target.value)} />
                </div>
              )}
            </fieldset>

            <div className="stack gap-8">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Descargo de responsabilidad</h2>
              <div className="stack gap-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', fontSize: 15, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                <p>
                  Yo, <strong>{me.name}</strong>, encargado(a) legal de <strong>{kid.name}</strong>, autorizo su salida del{' '}
                  {school?.nombre} el {longDay(date)} a las <strong>{hourLabel}</strong> y asumo la responsabilidad por su seguridad desde que salga.
                </p>
                <details className="full-text">
                  <summary>Ver el texto completo</summary>
                  <div className="stack gap-8" style={{ paddingTop: 8 }}>
                    <p>
                      {me.idNumber && `Cédula ${me.idNumber}. `}Solicito su salida antes de que finalice la jornada.
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
                </details>
              </div>
              <CheckCard
                strong
                checked={accepted}
                onChange={(v) => {
                  setAccepted(v);
                  setError('');
                }}
              >
                He leído y acepto el descargo de responsabilidad.
              </CheckCard>
            </div>

            <div className="stack gap-8">
              <span style={{ fontSize: 16, fontWeight: 700 }}>Firma del encargado</span>
              <SignaturePad
                height={100}
                value={firma}
                signer={me.name}
                signedAt={signedAt}
                onChange={(v) => {
                  setFirma(v);
                  setError('');
                }}
              />
            </div>
          </div>
          <div className="screen-footer">
            {error && (
              <span className="form-error" role="alert">
                {error}
              </span>
            )}
            {!ready && (
              <span className="text-sm muted" style={{ textAlign: 'center' }}>
                Falta: {[way === 'pickup' && !(pickupName.trim() && pickupId.trim()) && 'quién retira', !accepted && 'aceptar el descargo', !signed && 'firmar'].filter(Boolean).join(' · ')}
              </span>
            )}
            <Button variant="primary" size="xl" ready={!!ready} disabled={busy} onClick={submit}>
              {busy ? 'Guardando…' : `Autorizar salida a las ${hourLabel}`}
            </Button>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
