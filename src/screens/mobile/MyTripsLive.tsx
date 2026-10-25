import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, StatusBadge, useToast } from '../../components';
import { MobileScreen, TeacherTabBar } from '../../layouts/MobileScreen';
import { CONSENT_STATUS, PAYMENT_STATUS, type ConsentState, type PaymentState } from '../../data/admin';
import { useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

interface Trip {
  id: string;
  titulo: string;
  destino: string | null;
  fecha: string;
  costo: string | null;
  secciones: string[];
  cancelada: boolean;
}

interface Row {
  id: string;
  name: string;
  section: string;
  consent: ConsentState;
  payment: PaymentState;
  method: 'sinpe' | 'efectivo' | null;
  receipt: string | null;
}

const longDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Opens an uploaded receipt through a short-lived private link. */
async function openFile(path: string) {
  const { data } = await supabase!.storage.from('comprobantes').createSignedUrl(path, 300);
  if (data) window.open(data.signedUrl, '_blank', 'noopener');
}

/** Docente · Mis giras: the trips this teacher organizes, with who authorized and who paid, so they can confirm payments. */
export function MyTrips() {
  return supabase ? (
    <MyTripsLive />
  ) : (
    <MobileScreen>
      <div className="screen-body">
        <EmptyState title="Mis giras">Aquí verá las giras que organiza y podrá confirmar los pagos. Disponible cuando el colegio usa el servidor.</EmptyState>
      </div>
      <TeacherTabBar />
    </MobileScreen>
  );
}

function MyTripsLive() {
  const { session } = useAuth();
  const toast = useToast();
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [tripId, setTripId] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const today = localDate();
  const trip = trips?.find((t) => t.id === tripId);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const db = supabase!;
      const { data: p } = await db.from('personal').select('id').eq('usuario_id', session.user.id).maybeSingle();
      if (!p) return setTrips([]);
      const { data, error: e } = await db
        .from('giras')
        .select('id, titulo, destino, fecha, costo, secciones, cancelada')
        .eq('organizador_id', p.id)
        .eq('cancelada', false)
        .order('fecha', { ascending: false })
        .limit(20);
      if (e) return setError(e.message);
      const list = (data ?? []) as Trip[];
      setTrips(list);
      // The next trip first, else the latest one.
      const next = [...list].filter((t) => t.fecha >= today).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
      setTripId((next ?? list[0])?.id ?? '');
    })();
  }, [session, today]);

  const load = useCallback(async () => {
    if (!trip) return;
    const db = supabase!;
    const ex = await db.from('gira_estudiantes').select('estudiante_id').eq('gira_id', trip.id);
    const extraIds = (ex.data ?? []).map((r) => r.estudiante_id as string);
    const filters = [
      ...(trip.secciones.length ? [`seccion_id.in.(${trip.secciones.join(',')})`] : []),
      ...(extraIds.length ? [`id.in.(${extraIds.join(',')})`] : []),
    ];
    const [st, au] = await Promise.all([
      filters.length ? db.from('estudiantes').select('id, nombre, secciones(nombre)').or(filters.join(',')).eq('activo', true).order('nombre') : Promise.resolve({ data: [] }),
      db.from('gira_autorizaciones').select('estudiante_id, estado, pago, comprobante, metodo').eq('gira_id', trip.id),
    ]);
    const by = new Map((au.data ?? []).map((a) => [a.estudiante_id, a]));
    setRows(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((st.data ?? []) as any[]).map((s) => {
        const a = by.get(s.id);
        return {
          id: s.id,
          name: s.nombre,
          section: s.secciones?.nombre ?? '',
          consent: a ? (a.estado as ConsentState) : 'wait',
          payment: a ? (a.pago as PaymentState) : 'none',
          method: a?.metodo ?? null,
          receipt: a?.comprobante ?? null,
        };
      }),
    );
  }, [trip]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const markPaid = async (id: string) => {
    const { error: e } = await supabase!.from('gira_autorizaciones').update({ pago: 'paid' }).eq('gira_id', trip!.id).eq('estudiante_id', id);
    if (e) return toast('No se pudo marcar: ' + e.message);
    toast('Pago marcado como pagado');
    load();
  };

  const paid = (rows ?? []).filter((r) => r.payment === 'paid').length;
  const review = (rows ?? []).filter((r) => r.payment === 'review').length;

  return (
    <MobileScreen>
      <div className="screen-body gap-12">
        <h1 className="title-page" style={{ fontSize: 24 }}>
          Mis giras
        </h1>
        {error ? (
          <p className="notice" role="alert">
            No se pudo cargar: {error}
          </p>
        ) : !trips ? (
          <p className="text-sm muted">Cargando…</p>
        ) : trips.length === 0 ? (
          <EmptyState title="Sin giras a su cargo">Cuando Dirección lo nombre organizador de una gira, la verá aquí.</EmptyState>
        ) : (
          <>
            <label className="stack gap-4 text-sm" htmlFor="mg-gira">
              <span className="muted">Gira</span>
              <select id="mg-gira" className="input" style={{ height: 44 }} value={tripId} onChange={(e) => setTripId(e.target.value)}>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.titulo} · {new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}
                  </option>
                ))}
              </select>
            </label>
            {trip && (
              <p className="text-sm muted">
                {longDate(trip.fecha)}
                {trip.destino ? ` · ${trip.destino}` : ''}
                {trip.costo ? ` · Costo ${trip.costo}` : ' · Sin costo'}
              </p>
            )}
            {trip?.costo && rows && (
              <p className="card text-sm" style={{ padding: 12 }}>
                <span>
                  <strong>{paid} pagados</strong> · {review} por confirmar
                </span>
              </p>
            )}
            {!rows ? (
              <p className="text-sm muted">Cargando estudiantes…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm muted">Esta gira no tiene estudiantes todavía.</p>
            ) : (
              <div className="stack gap-8">
                {rows.map((r) => (
                  <div key={r.id} className="card stack gap-6" style={{ padding: 12 }}>
                    <div className="row between gap-8">
                      <span className="stack">
                        <strong style={{ fontSize: 15 }}>{r.name}</strong>
                        <span className="text-xs muted">{r.section}</span>
                      </span>
                      <StatusBadge status={CONSENT_STATUS[r.consent]} />
                    </div>
                    {trip?.costo && (
                      <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
                        <StatusBadge status={PAYMENT_STATUS[r.payment]} />
                        {r.method && <span className="text-xs muted">{r.method === 'efectivo' ? 'Efectivo' : 'SINPE Móvil'}</span>}
                        {r.receipt && (
                          <button type="button" className="link-button text-sm" style={{ fontWeight: 700 }} onClick={() => openFile(r.receipt!)}>
                            Ver comprobante
                          </button>
                        )}
                        {r.payment === 'review' && (
                          <Button size="sm" variant="primary" onClick={() => markPaid(r.id)}>
                            Marcar pagado
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <TeacherTabBar />
    </MobileScreen>
  );
}
