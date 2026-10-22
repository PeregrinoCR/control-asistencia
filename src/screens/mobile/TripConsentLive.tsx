import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, ButtonLink, CheckCard, InputField, Segmented, SignaturePad, SinpePayment } from '../../components';
import { DoneState, FamilyTabBar, MobileScreen, ScreenHeader } from '../../layouts/MobileScreen';
import { TRIP_DECLARATIONS } from '../../data/family';
import { useAuth } from '../../lib/auth';
import { uploadFile } from '../../lib/family';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { FamilyGate, KidPicker, type FamilyCtx } from './FamilyGate';

interface Trip {
  id: string;
  titulo: string;
  destino: string | null;
  fecha: string;
  salida: string | null;
  regreso: string | null;
  costo: string | null;
  fecha_limite: string | null;
  telefono_pago: string | null;
}

interface Answer {
  estado: 'ok' | 'no';
  pago: 'none' | 'review' | 'paid';
  metodo: 'sinpe' | 'efectivo' | null;
}

interface Payments {
  on: boolean;
  number: string;
  holder: string;
}

const longDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
const label = (text: string) => <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>{text}</span>;

/** Familia · Permisos: the student's upcoming trips, to authorize and pay. */
export function TripConsentLive() {
  return <FamilyGate>{(f) => <Trips f={f} />}</FamilyGate>;
}

function Trips({ f }: { f: FamilyCtx }) {
  const { kid } = f;
  const wanted = (useLocation().state as { id?: string } | null)?.id;
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [tripId, setTripId] = useState<string | undefined>(wanted);
  const [payments, setPayments] = useState<Payments>({ on: false, number: '', holder: '' });

  useEffect(() => {
    const db = supabase!;
    setTrips(null);
    (async () => {
      const [g, a, c] = await Promise.all([
        kid.sectionId
          ? db.from('giras').select('id, titulo, destino, fecha, salida, regreso, costo, fecha_limite, telefono_pago').contains('secciones', [kid.sectionId]).gte('fecha', localDate()).order('fecha')
          : Promise.resolve({ data: [] as Trip[] }),
        db.from('gira_autorizaciones').select('gira_id, estado, pago, metodo').eq('estudiante_id', kid.id),
        db.from('colegios').select('modulos, config').maybeSingle(),
      ]);
      setTrips((g.data ?? []) as Trip[]);
      setAnswers(Object.fromEntries((a.data ?? []).map((x) => [x.gira_id, { estado: x.estado, pago: x.pago, metodo: x.metodo }])));
      const sinpe = c.data?.config?.sinpe ?? {};
      setPayments({ on: !!(c.data?.modulos?.pay ?? c.data?.modulos?.pagos), number: sinpe.numero ?? '', holder: sinpe.titular ?? '' });
    })();
  }, [kid]);

  if (!trips)
    return (
      <MobileScreen>
        <ScreenHeader title="Permisos" />
        <p className="text-sm muted" style={{ padding: 24 }}>
          Cargando…
        </p>
        <FamilyTabBar />
      </MobileScreen>
    );

  const trip = trips.find((t) => t.id === tripId) ?? trips.find((t) => !answers[t.id]) ?? trips[0];
  if (!trip)
    return (
      <MobileScreen>
        <ScreenHeader title="Permisos" subtitle={`${kid.name} · ${kid.section}`} />
        <div className="screen-body gap-14">
          <KidPicker f={f} />
          <section className="card card--mobile gap-6">
            <span style={{ fontSize: 17, fontWeight: 700 }}>No hay giras pendientes</span>
            <span className="text-sm muted">Cuando el colegio organice una gira para la sección {kid.section}, aparecerá aquí para autorizarla.</span>
          </section>
          {!kid.adult && (
            <ButtonLink variant="outline-blue" to={routes.family.earlyExit} size="lg">
              Autorizar salida temprana
            </ButtonLink>
          )}
        </div>
        <FamilyTabBar />
      </MobileScreen>
    );

  return (
    <TripForm
      key={trip.id + kid.id}
      f={f}
      trip={trip}
      trips={trips}
      onPick={setTripId}
      answer={answers[trip.id]}
      payments={payments}
      onAnswered={(a) => setAnswers({ ...answers, [trip.id]: a })}
    />
  );
}

interface FormProps {
  f: FamilyCtx;
  trip: Trip;
  trips: Trip[];
  onPick: (id: string) => void;
  answer?: Answer;
  payments: Payments;
  onAnswered: (a: Answer) => void;
}

function TripForm({ f, trip, trips, onPick, answer, payments, onAnswered }: FormProps) {
  const { kid, me } = f;
  const { session } = useAuth();
  const [checks, setChecks] = useState(TRIP_DECLARATIONS.map(() => false));
  const [health, setHealth] = useState('');
  const [phone, setPhone] = useState(me.phone);
  const [idNumber, setIdNumber] = useState(me.idNumber);
  const [firma, setFirma] = useState<string | null>(null);
  const signed = !!firma;
  const [receipt, setReceipt] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!answer);
  // A trip with a cost always shows how to pay. SINPE needs a number: the trip's own, or the school's when the module is on.
  const sinpeNumber = trip.telefono_pago || (payments.on ? payments.number : '');
  const sinpe = !!sinpeNumber;
  const [method, setMethod] = useState<'sinpe' | 'efectivo'>(answer?.metodo ?? (sinpe ? 'sinpe' : 'efectivo'));
  const ready = checks.every(Boolean) && signed && idNumber.trim();
  const charge = !!trip.costo;
  const cash = charge && (method === 'efectivo' || !sinpe);
  const signedAt = new Date().toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });

  const save = async (estado: 'ok' | 'no') => {
    if (estado === 'ok' && !ready) return setError('Marque las tres casillas, firme y escriba su cédula para autorizar.');
    setBusy(true);
    setError('');
    try {
      const comprobante = estado === 'ok' && receiptFile ? await uploadFile(f.schoolId, receiptFile) : null;
      // Cash is confirmed by the school later, so it waits for review like a receipt.
      const pagoEnEfectivo = estado === 'ok' && cash && answer?.pago !== 'paid';
      const pago = comprobante || pagoEnEfectivo ? 'review' : (answer?.pago ?? 'none');
      const metodo = estado === 'ok' && charge ? (cash ? 'efectivo' : 'sinpe') : null;
      const { error } = await supabase!.from('gira_autorizaciones').upsert(
        {
          gira_id: trip.id,
          estudiante_id: kid.id,
          estado,
          salud: health.trim() || null,
          telefono: phone.trim() || null,
          firma: estado === 'ok' ? firma : null,
          firmado_por: session!.user.id,
          firmado: new Date().toISOString(),
          pago,
          metodo,
          ...(comprobante ? { comprobante } : {}),
        },
        { onConflict: 'gira_id,estudiante_id' },
      );
      if (error) throw new Error(error.message);
      onAnswered({ estado, pago, metodo });
      setEditing(false);
    } catch (e) {
      setError('No se guardó: ' + (e as Error).message);
    }
    setBusy(false);
  };

  const facts = [
    ['Fecha', longDate(trip.fecha)],
    ['Horario', [trip.salida, trip.regreso].filter(Boolean).join(' – ') || '—'],
    ['Costo', trip.costo || 'Sin costo'],
    ['Firmar antes del', trip.fecha_limite ? longDate(trip.fecha_limite) : '—'],
  ];

  return (
    <MobileScreen>
      <ScreenHeader title="Autorización de gira" subtitle={`${kid.name} · ${kid.section} · ${kid.adult ? 'mayor de edad' : 'menor de edad'}`} />
      {!editing && answer ? (
        <DoneState
          title={answer.estado === 'ok' ? 'Gira autorizada' : 'No autorizó la gira'}
          tone={answer.estado === 'ok' ? 'success' : 'neutral'}
          icon={answer.estado === 'ok' ? 'check' : 'x'}
          actions={
            <>
              <ButtonLink variant="dark" size="lg" to={routes.family.home}>
                Volver al inicio
              </ButtonLink>
              <Button variant="ghost" onClick={() => setEditing(true)}>
                Cambiar mi respuesta
              </Button>
            </>
          }
        >
          {answer.estado === 'ok'
            ? `El colegio recibió su autorización firmada para "${trip.titulo}".` +
              (charge ? (answer.pago === 'paid' ? ' El pago ya fue confirmado.' : answer.pago === 'review' ? (answer.metodo === 'efectivo' ? ' Su pago en efectivo está por confirmar.' : ' Su comprobante de pago está en revisión.') : answer.metodo === 'efectivo' ? ' Pague en efectivo a la persona organizadora.' : ' Recuerde pagar por SINPE Móvil y subir el comprobante.') : '')
            : `El colegio sabe que ${kid.short} no irá a esta gira.`}
        </DoneState>
      ) : (
        <>
          <div className="screen-body gap-16">
            <KidPicker f={f} />
            {trips.length > 1 && (
              <div className="field">
                <label htmlFor="g-cual" className="field__label">
                  Gira
                </label>
                <select id="g-cual" className="input" value={trip.id} onChange={(e) => onPick(e.target.value)}>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titulo} · {longDate(t.fecha)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="trip-card">
              <div className="stack gap-2">
                <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7, color: 'var(--night-ink-3)' }}>
                  Gira
                </span>
                <span className="display" style={{ fontSize: 22 }}>
                  {trip.titulo}
                </span>
                {trip.destino && <span style={{ fontSize: 14, color: 'var(--night-ink-2)' }}>{trip.destino}</span>}
              </div>
              <div className="grid-2" style={{ gap: '10px 12px', fontSize: 14 }}>
                {facts.map(([k, v]) => (
                  <div key={k} className="stack">
                    <span className="trip-card__label">{k}</span>
                    <span className="strong">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="stack gap-10">
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Datos para el día de la gira</h2>
              <InputField id="g-salud" touch label={label('Alergias, condiciones médicas o medicamentos')} placeholder="Ej.: asma, usa inhalador" value={health} onChange={(e) => setHealth(e.target.value)} />
              <InputField id="g-contacto" touch type="tel" label={label('Teléfono de contacto ese día')} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <fieldset className="fieldset fieldset--lg stack gap-8">
              <legend>{kid.adult ? 'Declaración del estudiante' : 'Declaración del encargado legal'}</legend>
              {TRIP_DECLARATIONS.map((text, i) => (
                <CheckCard
                  key={text}
                  checked={checks[i]}
                  onChange={(v) => {
                    setChecks(checks.map((c, j) => (j === i ? v : c)));
                    setError('');
                  }}
                >
                  {kid.adult ? text.replace('a mi hijo(a)', 'mi').replace('que cumpla', 'cumplir') : text}
                </CheckCard>
              ))}
            </fieldset>

            {charge && (
              <div className="stack gap-10">
                {sinpe && (
                  <Segmented
                    label="Forma de pago"
                    fill
                    value={method}
                    onChange={(m) => {
                      setMethod(m);
                      setError('');
                    }}
                    options={[
                      { value: 'sinpe', label: 'SINPE Móvil' },
                      { value: 'efectivo', label: 'Efectivo' },
                    ]}
                  />
                )}
                {cash ? (
                  <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
                    Pague {trip.costo} en efectivo a la persona organizadora de la gira. La escuela confirmará el pago.
                  </p>
                ) : (
                  <SinpePayment
                    amount={trip.costo!}
                    number={sinpeNumber}
                    holder={payments.holder || '[TITULAR]'}
                    reference={`Gira ${kid.section} ${kid.name}`}
                    receipt={receipt}
                    onReceipt={(name, file) => {
                      setReceipt(name);
                      setReceiptFile(file ?? null);
                    }}
                  />
                )}
              </div>
            )}

            <div className="stack gap-8">
              <span style={{ fontSize: 16, fontWeight: 700 }}>Firma</span>
              <SignaturePad
                value={firma}
                signer={me.name}
                signedAt={signedAt}
                onChange={(v) => {
                  setFirma(v);
                  setError('');
                }}
              />
              <InputField id="g-cedula" touch inputMode="numeric" label={label('Número de cédula de quien firma')} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </div>
          </div>
          <div className="screen-footer">
            {error && (
              <span className="form-error" role="alert">
                {error}
              </span>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <Button size="xl" style={{ fontSize: 15 }} disabled={busy} onClick={() => save('no')}>
                No autorizo
              </Button>
              <Button variant="primary" size="xl" style={{ fontSize: 15 }} ready={!!ready} disabled={busy} onClick={() => save('ok')}>
                {busy ? 'Guardando…' : 'Autorizar participación'}
              </Button>
            </div>
          </div>
        </>
      )}
    </MobileScreen>
  );
}
