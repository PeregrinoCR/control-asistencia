import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, InputField, Segmented, StatusBadge } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { CONSENT_STATUS, PAYMENT_STATUS, type ConsentState, type PaymentState } from '../../data/admin';
import { useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { ageOn } from '../../lib/students';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';

type Tab = 'trip' | 'exits';

interface Trip {
  id: string;
  titulo: string;
  destino: string | null;
  fecha: string;
  salida: string | null;
  regreso: string | null;
  costo: string | null;
  fecha_limite: string | null;
  secciones: string[];
  telefono_pago: string | null;
  organizador_id: string | null;
}

interface RosterRow {
  id: string;
  name: string;
  section: string;
  guardian: string;
  adult: boolean;
  state: ConsentState;
  health: string;
  signed: string;
  /** How the family pays: by SINPE Móvil or in cash. */
  method: 'sinpe' | 'efectivo' | null;
  /** The drawn signature (PNG data URL), when there is one. */
  firma: string | null;
  payment: PaymentState;
  receipt: string | null;
}

interface ExitRow {
  id: string;
  hour: string;
  name: string;
  section: string;
  by: string;
  how: string;
  reason: string;
  receipt: string;
  left: string | null;
}

const longDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
const time = (t: string) => new Date(t).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });

/** Opens an uploaded receipt through a short-lived private link. */
async function openFile(path: string) {
  const { data } = await supabase!.storage.from('comprobantes').createSignedUrl(path, 300);
  if (data) window.open(data.signedUrl, '_blank', 'noopener');
}

/** Dirección · Giras y salidas tempranas, with the school's real trips and exits. */
export function TripsLive() {
  const [tab, setTab] = useState<Tab>('trip');
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [tripId, setTripId] = useState<string | 'new' | null>(null);
  const [exits, setExits] = useState<ExitRow[] | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; nombre: string }>>([]);
  const [guardians, setGuardians] = useState<Map<string, string>>(new Map());
  const today = localDate();

  const load = useCallback(async () => {
    const db = supabase!;
    const [s, t, g, x, p] = await Promise.all([
      db.from('secciones').select('id, nombre').order('nombre'),
      db.from('giras').select('id, titulo, destino, fecha, salida, regreso, costo, fecha_limite, secciones, telefono_pago, organizador_id').gte('fecha', today).order('fecha'),
      db.from('encargados').select('usuario_id, nombre').not('usuario_id', 'is', null),
      db.from('salidas').select('id, hora, modo, motivo, retira_nombre, comprobante, salio, autorizado_por, estudiantes(nombre, secciones(nombre))').eq('fecha', today).eq('estado', 'aprobada').order('hora'),
      db.from('personal').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    setStaff(p.data ?? []);
    const gmap = new Map((g.data ?? []).map((r) => [r.usuario_id as string, r.nombre as string]));
    setGuardians(gmap);
    setSections(ordenarSecciones(s.data));
    setTrips((t.data ?? []) as Trip[]);
    setExits(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((x.data ?? []) as any[]).map((r) => ({
        id: r.id,
        hour: `${r.hora} p. m.`,
        name: r.estudiantes?.nombre ?? '',
        section: r.estudiantes?.secciones?.nombre ?? '',
        by: gmap.get(r.autorizado_por) ?? 'Encargado',
        how: r.modo === 'pickup' ? `Lo retira ${r.retira_nombre}` : 'Sale por sus propios medios',
        reason: r.motivo ?? '',
        receipt: r.comprobante,
        left: r.salio,
      })),
    );
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const trip = tripId === 'new' ? null : (trips?.find((t) => t.id === tripId) ?? trips?.[0] ?? null);
  const sectionNames = (ids: string[]) => ids.map((id) => sections.find((s) => s.id === id)?.nombre).filter(Boolean).join(', ');

  return (
    <AdminLayout>
      <PageHeader
        kicker="Autorizaciones firmadas por encargados legales de menores de edad"
        title="Giras y salidas tempranas"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setTab('trip');
              setTripId('new');
            }}
          >
            Nueva gira
          </Button>
        }
      />

      <Segmented
        label="Tipo de permiso"
        mode="tabs"
        size="lg"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'trip', label: `Giras · ${trips?.length ?? 0} próximas` },
          { value: 'exits', label: `Salidas tempranas · hoy ${exits?.length ?? 0}` },
        ]}
      />

      {!trips || !exits ? (
        <p className="text-sm muted">Cargando…</p>
      ) : tab === 'trip' ? (
        <div className="stack gap-16" role="tabpanel">
          {trips.length > 0 && tripId !== 'new' && (
            <div className="row wrap gap-8">
              {trips.map((t) => (
                <button key={t.id} type="button" className="chip" aria-pressed={t.id === trip?.id} onClick={() => setTripId(t.id)}>
                  {t.titulo}
                </button>
              ))}
            </div>
          )}
          {tripId === 'new' || trips.length === 0 ? (
            <NewTrip
              sections={sections}
              staff={staff}
              onCancel={trips.length ? () => setTripId(null) : undefined}
              onCreated={async (id) => {
                await load();
                setTripId(id);
              }}
            />
          ) : (
            trip && (
              <TripDetail
                key={trip.id}
                trip={trip}
                sectionNames={sectionNames(trip.secciones)}
                sections={sections}
                staff={staff}
                guardians={guardians}
                onChanged={load}
              />
            )
          )}
        </div>
      ) : (
        <section aria-labelledby="lista-sal" className="card gap-10" role="tabpanel">
          <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
            <h2 id="lista-sal" className="title-section">
              Salidas tempranas · {longDate(today)}
            </h2>
            <span className="text-sm muted">El guarda del portón ve esta misma lista en su teléfono.</span>
          </div>
          {exits.length === 0 ? (
            <p className="text-sm muted">No hay salidas tempranas autorizadas hoy.</p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Estudiante</th>
                    <th>Autorizó</th>
                    <th>Cómo se retira</th>
                    <th>Estado</th>
                    <th>Comprobante</th>
                  </tr>
                </thead>
                <tbody>
                  {exits.map((e) => (
                    <tr key={e.id}>
                      <td className="strong tabular">{e.hour}</td>
                      <td>
                        <span className="strong">{e.name}</span> <span className="muted">· {e.section}</span>
                        {e.reason && <span className="text-xs muted" style={{ display: 'block' }}>{e.reason}</span>}
                      </td>
                      <td>{e.by}</td>
                      <td style={{ color: 'var(--ink-2)' }}>{e.how}</td>
                      <td>
                        <Badge tone={e.left ? 'green' : 'amber'} size="md">
                          {e.left ? `Salió ${time(e.left)}` : 'Por salir'}
                        </Badge>
                      </td>
                      <td className="tabular">{e.receipt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </AdminLayout>
  );
}

function TripDetail({
  trip,
  sectionNames,
  sections,
  staff,
  guardians,
  onChanged,
}: {
  trip: Trip;
  sectionNames: string;
  sections: Array<{ id: string; nombre: string }>;
  staff: Array<{ id: string; nombre: string }>;
  guardians: Map<string, string>;
  onChanged: () => void;
}) {
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState<'all' | ConsentState>('all');

  const load = useCallback(async () => {
    const db = supabase!;
    const [st, au] = await Promise.all([
      trip.secciones.length
        ? db.from('estudiantes').select('id, nombre, nacimiento, secciones(nombre), estudiante_encargado(encargados(nombre))').in('seccion_id', trip.secciones).eq('activo', true).order('nombre')
        : Promise.resolve({ data: [] }),
      db.from('gira_autorizaciones').select('estudiante_id, estado, salud, firma, firmado, firmado_por, pago, comprobante, metodo').eq('gira_id', trip.id),
    ]);
    const byStudent = new Map((au.data ?? []).map((a) => [a.estudiante_id, a]));
    setRoster(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((st.data ?? []) as any[]).map((s) => {
        const a = byStudent.get(s.id);
        return {
          id: s.id,
          name: s.nombre,
          section: s.secciones?.nombre ?? '',
          guardian: s.estudiante_encargado?.[0]?.encargados?.nombre ?? (a ? (guardians.get(a.firmado_por) ?? '') : '—'),
          adult: (ageOn(s.nacimiento) ?? 0) >= 18,
          state: a ? (a.estado as ConsentState) : 'wait',
          health: a?.salud ?? '',
          signed: a ? new Date(a.firmado).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '',
          firma: a?.firma?.startsWith('data:image') ? a.firma : null,
          payment: a ? (a.pago as PaymentState) : 'none',
          receipt: a?.comprobante ?? null,
          method: a?.metodo ?? null,
        };
      }),
    );
  }, [trip, guardians]);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (id: string) => {
    const { error } = await supabase!.from('gira_autorizaciones').update({ pago: 'paid' }).eq('gira_id', trip.id).eq('estudiante_id', id);
    if (error) return setError(error.message);
    load();
  };

  if (editing)
    return (
      <NewTrip
        sections={sections}
        staff={staff}
        trip={trip}
        onCancel={() => setEditing(false)}
        onCreated={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );

  const rows = roster ?? [];
  const shown = filter === 'all' ? rows : rows.filter((r) => r.state === filter);
  const minors = rows.filter((r) => !r.adult);
  const count = (s: ConsentState) => minors.filter((r) => r.state === s).length;
  const share = (n: number) => `${minors.length ? (100 * n) / minors.length : 0}%`;
  const paid = rows.filter((r) => r.payment === 'paid').length;
  const inReview = rows.filter((r) => r.payment === 'review').length;

  return (
    <>
      <div className="card row wrap between gap-20" style={{ padding: 20 }}>
        <div className="stack gap-4" style={{ minWidth: 260 }}>
          <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7 }}>
            Gira{trip.destino ? ` · ${trip.destino}` : ''}
          </span>
          <span className="display" style={{ fontSize: 26 }}>
            {trip.titulo}
          </span>
          <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            {longDate(trip.fecha)}
            {trip.salida && ` · ${trip.salida}`}
            {trip.regreso && ` – ${trip.regreso}`} · Secciones {sectionNames || '—'}
            {trip.costo && ` · ${trip.costo}`}
          </span>
          {trip.fecha_limite && <span className="text-sm strong ink-orange">Fecha límite para firmar: {longDate(trip.fecha_limite)}</span>}
          {trip.costo && trip.telefono_pago && (
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Teléfono para pagos: <strong>{trip.telefono_pago}</strong>
            </span>
          )}
          <span>
            <Button size="sm" onClick={() => setEditing(true)}>
              Editar gira
            </Button>
          </span>
        </div>
        <div className="stack gap-8" style={{ flex: '1 1 320px', maxWidth: 460 }}>
          <div
            role="img"
            aria-label={`${count('ok')} autorizados, ${count('no')} no autorizados y ${count('wait')} pendientes de ${minors.length} menores`}
            style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--neutral-bg)' }}
          >
            <div style={{ width: share(count('ok')), background: 'var(--blue)' }} />
            <div style={{ width: share(count('no')), background: 'var(--orange)' }} />
          </div>
          <div className="legend" style={{ fontSize: 13, gap: '6px 16px', color: 'var(--ink-2)' }}>
            <span className="legend__item">
              <span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--blue)' }} />
              {count('ok')} autorizados
            </span>
            <span className="legend__item">
              <span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--orange)' }} />
              {count('no')} no autorizados
            </span>
            <span className="legend__item">
              <span className="swatch" style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--neutral-bg)', border: '1px solid var(--border-dashed)' }} />
              {count('wait')} pendientes
            </span>
            <span className="muted">+ {rows.length - minors.length} mayores de edad confirman ellos mismos</span>
          </div>
          {trip.costo && (
            <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Pagos: <strong>{paid} pagados</strong> · {inReview} por confirmar
            </div>
          )}
        </div>
      </div>

      <section aria-labelledby="lista-gira" className="card gap-10">
        <h2 id="lista-gira" className="title-section">
          Estudiantes de las secciones de la gira
        </h2>
        {error && (
          <p className="text-sm ink-orange" role="alert">
            {error}
          </p>
        )}
        {!roster ? (
          <p className="text-sm muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm muted">No hay estudiantes matriculados en esas secciones.</p>
        ) : (
          <>
          <Segmented
            label="Ver estudiantes"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Todos · ${rows.length}` },
              { value: 'ok', label: `Autorizados · ${count('ok')}` },
              { value: 'wait', label: `Pendientes · ${count('wait')}` },
              { value: 'no', label: `No autorizados · ${count('no')}` },
            ]}
          />
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Sección</th>
                  <th>Encargado</th>
                  <th>Estado</th>
                  <th>Salud</th>
                  <th>Firmó</th>
                  {trip.costo && <th>Pago</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">
                      {r.name}
                      {r.adult && <span className="text-xs muted"> · mayor</span>}
                    </td>
                    <td>{r.section}</td>
                    <td>{r.adult ? 'Él/ella mismo(a)' : r.guardian}</td>
                    <td>
                      <StatusBadge status={CONSENT_STATUS[r.state]} size="md" />
                    </td>
                    <td style={{ color: 'var(--ink-2)' }}>{r.health || '—'}</td>
                    <td className="text-sm muted">
                      {r.firma && <img src={r.firma} alt="Firma dibujada" style={{ height: 28, verticalAlign: 'middle', marginRight: 8 }} />}
                      {r.signed || '—'}
                    </td>
                    {trip.costo && (
                      <td>
                        <span className="row wrap gap-8">
                          <StatusBadge status={PAYMENT_STATUS[r.payment]} />
                          {r.method && <span className="text-xs muted">{r.method === 'efectivo' ? 'Efectivo' : 'SINPE Móvil'}</span>}
                          {r.receipt && (
                            <button type="button" className="link-button text-sm" style={{ fontWeight: 700 }} onClick={() => openFile(r.receipt!)}>
                              Ver comprobante
                            </button>
                          )}
                          {r.payment === 'review' && (
                            <Button size="sm" onClick={() => markPaid(r.id)}>
                              Marcar pagado
                            </Button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </>
  );
}

/** Creates a trip, or edits one when `trip` is given. */
function NewTrip({
  sections,
  staff,
  trip,
  onCreated,
  onCancel,
}: {
  sections: Array<{ id: string; nombre: string }>;
  staff: Array<{ id: string; nombre: string }>;
  trip?: Trip;
  onCreated: (id: string) => void;
  onCancel?: () => void;
}) {
  const { school, session } = useAuth();
  const [f, setF] = useState({
    titulo: trip?.titulo ?? '',
    destino: trip?.destino ?? '',
    fecha: trip?.fecha ?? '',
    salida: trip?.salida ?? '',
    regreso: trip?.regreso ?? '',
    costo: trip?.costo ?? '',
    fecha_limite: trip?.fecha_limite ?? '',
    telefono_pago: trip?.telefono_pago ?? '',
    organizador_id: trip?.organizador_id ?? '',
  });
  const [secs, setSecs] = useState<string[]>(trip?.secciones ?? []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.titulo.trim() || !f.fecha || secs.length === 0) return setError('Escriba el nombre, la fecha y elija al menos una sección.');
    setBusy(true);
    const db = supabase!;
    const datos = {
      titulo: f.titulo.trim(),
      destino: f.destino.trim() || null,
      fecha: f.fecha,
      salida: f.salida.trim() || null,
      regreso: f.regreso.trim() || null,
      costo: f.costo.trim() || null,
      fecha_limite: f.fecha_limite || null,
      telefono_pago: f.telefono_pago.trim() || null,
      organizador_id: f.organizador_id || null,
      secciones: secs,
    };
    const { data, error } = trip
      ? await db.from('giras').update(datos).eq('id', trip.id).select('id').single()
      : await db
          .from('giras')
          .insert({ ...datos, colegio_id: school!.id, creado_por: (await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle()).data?.id ?? null })
          .select('id')
          .single();
    setBusy(false);
    if (error) return setError(error.message);
    onCreated(data.id);
  };

  return (
    <form className="card gap-14" style={{ padding: 20, maxWidth: 720 }} onSubmit={submit}>
      <h2 className="title-section">{trip ? 'Editar gira' : 'Nueva gira'}</h2>
      <div className="grid-2">
        <InputField id="t-titulo" label="Nombre de la gira" placeholder="Gira al Museo Nacional" value={f.titulo} onChange={set('titulo')} />
        <InputField id="t-destino" label="Destino" hint="opcional" value={f.destino} onChange={set('destino')} />
      </div>
      <div className="grid-2">
        <InputField id="t-fecha" label="Fecha" type="date" value={f.fecha} onChange={set('fecha')} />
        <InputField id="t-limite" label="Fecha límite para firmar" type="date" hint="opcional" value={f.fecha_limite} onChange={set('fecha_limite')} />
      </div>
      <div className="grid-2">
        <InputField id="t-salida" label="Hora de salida" placeholder="7:00 a. m." value={f.salida} onChange={set('salida')} />
        <InputField id="t-regreso" label="Hora de regreso" placeholder="4:00 p. m." value={f.regreso} onChange={set('regreso')} />
      </div>
      <div className="grid-2">
        <InputField id="t-costo" label="Costo" hint="vacío si no tiene costo" placeholder="5 000 colones" value={f.costo} onChange={set('costo')} />
        <InputField id="t-telefono" label="Teléfono para pagos (SINPE Móvil)" hint="lo verá la familia" placeholder="8888-8888" value={f.telefono_pago} onChange={set('telefono_pago')} />
      </div>
      <div className="stack gap-6">
        <label htmlFor="t-organizador" className="text-sm strong">
          Docente organizador
        </label>
        <select id="t-organizador" className="input" value={f.organizador_id} onChange={set('organizador_id')}>
          <option value="">Sin organizador</option>
          {staff.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <span className="text-xs muted">Puede marcar los pagos de esta gira como pagados, igual que dirección.</span>
      </div>
      <fieldset className="fieldset">
        <legend>Secciones que van</legend>
        <div className="row wrap gap-8">
          {sections.map((s) => {
            const on = secs.includes(s.id);
            return (
              <button key={s.id} type="button" className="chip" aria-pressed={on} onClick={() => setSecs(on ? secs.filter((x) => x !== s.id) : [...secs, s.id])}>
                {s.nombre}
              </button>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <span className="text-sm ink-orange" role="alert">
          {error}
        </span>
      )}
      <span className="text-xs muted">Las familias de esas secciones la verán en la app para autorizarla y, si tiene costo y el módulo de pagos está activo, pagarla por SINPE Móvil.</span>
      <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
        {onCancel && <Button onClick={onCancel}>Cancelar</Button>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Guardando…' : trip ? 'Guardar cambios' : 'Crear gira'}
        </Button>
      </div>
    </form>
  );
}
