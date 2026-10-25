import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, InputField, Segmented, StatusBadge } from '../../components';
import { useLocation } from 'react-router-dom';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { ExitRequests } from './ExitRequests';
import { CONSENT_STATUS, PAYMENT_STATUS, type ConsentState, type PaymentState } from '../../data/admin';
import { useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { ageOn } from '../../lib/students';
import { supabase } from '../../lib/supabase';
import { esc, printDocument, tableHtml } from '../../lib/print';
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
  cancelada: boolean;
  motivo_cancelacion: string | null;
  recordatorio_en: string | null;
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
  /** Added by hand, not through the trip's sections. */
  extra: boolean;
  /** Emergency contact: the guardian's phone, or the student's own when adult. */
  phone: string;
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

/** Opens an uploaded receipt through a short-lived private link. */
async function openFile(path: string) {
  const { data } = await supabase!.storage.from('comprobantes').createSignedUrl(path, 300);
  if (data) window.open(data.signedUrl, '_blank', 'noopener');
}

/** Dirección · Giras y salidas tempranas, with the school's real trips and exits. */
export function TripsLive() {
  const { perms } = useAuth();
  const canTrips = perms.includes('trips');
  // Who confirms payments sees the trips too, even without creating them.
  const seesTrips = canTrips || perms.includes('payments');
  const fromLink = new URLSearchParams(useLocation().search).get('ver') === 'salidas';
  const [tab, setTab] = useState<Tab>(fromLink || !seesTrips ? 'exits' : 'trip');
  const [pending, setPending] = useState(0);
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [tripId, setTripId] = useState<string | 'new' | null>(null);
  const [exits, setExits] = useState<ExitRow[] | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; nombre: string }>>([]);
  const [guardians, setGuardians] = useState<Map<string, string>>(new Map());
  const today = localDate();

  const load = useCallback(async () => {
    const db = supabase!;
    const [s, t, g, x, p, q] = await Promise.all([
      db.from('secciones').select('id, nombre').order('nombre'),
      db
        .from('giras')
        .select('id, titulo, destino, fecha, salida, regreso, costo, fecha_limite, secciones, telefono_pago, organizador_id, cancelada, motivo_cancelacion, recordatorio_en')
        .order('fecha', { ascending: false })
        .limit(80),
      db.from('encargados').select('usuario_id, nombre').not('usuario_id', 'is', null),
      db.from('salidas').select('id, hora, modo, motivo, retira_nombre, comprobante, salio, autorizado_por, estudiantes(nombre, secciones(nombre))').eq('fecha', today).eq('estado', 'aprobada').order('hora'),
      db.from('personal').select('id, nombre').eq('activo', true).order('nombre'),
      db.from('salidas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    ]);
    setPending(q.count ?? 0);
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

  // Upcoming trips first (soonest on top), then past or cancelled ones (latest on top).
  const upcoming = (trips ?? []).filter((t) => !t.cancelada && t.fecha >= today).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const past = (trips ?? []).filter((t) => t.cancelada || t.fecha < today);
  const trip = tripId === 'new' ? null : (trips?.find((t) => t.id === tripId) ?? upcoming[0] ?? past[0] ?? null);
  // Keep the open trip selected when the lists reload (a cancelled trip moves to another group but stays open).
  const openId = trip?.id;
  useEffect(() => {
    if (tripId === null && openId) setTripId(openId);
  }, [tripId, openId]);
  const sectionNames = (ids: string[]) => ids.map((id) => sections.find((s) => s.id === id)?.nombre).filter(Boolean).join(', ');

  return (
    <AdminLayout>
      <PageHeader
        kicker="Autorizaciones firmadas por encargados legales de menores de edad"
        title="Giras y salidas tempranas"
        actions={
          canTrips && (
          <Button
            variant="primary"
            onClick={() => {
              setTab('trip');
              setTripId('new');
            }}
          >
            Nueva gira
          </Button>
          )
        }
      />

      <Segmented
        label="Tipo de permiso"
        mode="tabs"
        size="lg"
        value={tab}
        onChange={setTab}
        options={[
          ...(seesTrips ? [{ value: 'trip' as const, label: `Giras · ${upcoming.length} próximas` }] : []),
          { value: 'exits' as const, label: `Salidas tempranas · hoy ${exits?.length ?? 0}${pending ? ` · ${pending} por decidir` : ''}` },
        ]}
      />

      {!trips || !exits ? (
        <p className="text-sm muted">Cargando…</p>
      ) : tab === 'trip' ? (
        <div className="row gap-16" role="tabpanel" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {trips.length > 0 && (
            <nav aria-label="Giras" className="card stack gap-4" style={{ flex: '1 1 240px', maxWidth: 300, padding: 10 }}>
              {[
                { label: 'Próximas', list: upcoming },
                { label: 'Pasadas y canceladas', list: past },
              ].map((g) => (
                <div key={g.label} className="stack gap-4">
                  <span className="eyebrow" style={{ fontSize: 12, padding: '6px 6px 0' }}>
                    {g.label}
                  </span>
                  {g.list.length === 0 && <span className="text-sm muted" style={{ padding: '4px 8px' }}>Ninguna.</span>}
                  {g.list.map((t) => {
                    const on = tripId !== 'new' && t.id === trip?.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setTripId(t.id)}
                        className="stack gap-4"
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: 0,
                          cursor: 'pointer',
                          background: on ? 'var(--blue-bg)' : 'transparent',
                          font: 'inherit',
                          color: 'inherit',
                        }}
                      >
                        <strong style={{ fontSize: 14 }}>{t.titulo}</strong>
                        <span className="text-xs muted">
                          {new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {sectionNames(t.secciones) || '—'}
                        </span>
                        <span>
                          {t.cancelada ? (
                            <Badge tone="orange">Cancelada</Badge>
                          ) : t.fecha < today ? (
                            <Badge tone="neutral">Realizada</Badge>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          )}
          <div className="stack gap-16" style={{ flex: '999 1 560px', minWidth: 0 }}>
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
                  today={today}
                  onChanged={load}
                />
              )
            )}
          </div>
        </div>
      ) : (
        <div role="tabpanel">
          <ExitRequests onDecided={load} />
        </div>
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
  today,
  onChanged,
}: {
  trip: Trip;
  sectionNames: string;
  sections: Array<{ id: string; nombre: string }>;
  staff: Array<{ id: string; nombre: string }>;
  guardians: Map<string, string>;
  today: string;
  onChanged: () => void;
}) {
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | 'remind' | 'cancel'>(null);
  const [why, setWhy] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<'all' | ConsentState>('all');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Array<{ id: string; nombre: string; cedula: string | null; secciones: { nombre: string } | null }> | null>(null);
  const { school, perms } = useAuth();
  /** Past and cancelled trips are only for consulting and printing. */
  const readOnly = trip.cancelada || trip.fecha < today;
  const canManage = !readOnly && perms.includes('trips');

  const load = useCallback(async () => {
    const db = supabase!;
    // Students of the trip's sections, plus any added by hand.
    const ex = await db.from('gira_estudiantes').select('estudiante_id').eq('gira_id', trip.id);
    const extraIds = (ex.data ?? []).map((r) => r.estudiante_id as string);
    const filters = [
      ...(trip.secciones.length ? [`seccion_id.in.(${trip.secciones.join(',')})`] : []),
      ...(extraIds.length ? [`id.in.(${extraIds.join(',')})`] : []),
    ];
    const [st, au] = await Promise.all([
      filters.length
        ? db.from('estudiantes').select('id, nombre, nacimiento, telefono, secciones(nombre), estudiante_encargado(encargados(nombre, telefono))').or(filters.join(',')).eq('activo', true).order('nombre')
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
          extra: extraIds.includes(s.id),
          phone: (ageOn(s.nacimiento) ?? 0) >= 18 ? (s.telefono ?? '') : (s.estudiante_encargado?.[0]?.encargados?.telefono ?? ''),
        };
      }),
    );
  }, [trip, guardians]);

  useEffect(() => {
    load();
  }, [load]);

  const removeExtra = async (id: string) => {
    const { error } = await supabase!.from('gira_estudiantes').delete().eq('gira_id', trip.id).eq('estudiante_id', id);
    if (error) return setError(error.message);
    load();
  };

  const addStudent = async (id: string) => {
    const { error } = await supabase!.from('gira_estudiantes').insert({ gira_id: trip.id, estudiante_id: id });
    if (error) return setError(error.message);
    setFound(null);
    setQuery('');
    load();
  };

  const searchStudents = async () => {
    const q = query.trim().replace(/[,()]/g, ' ');
    if (!q) return setFound(null);
    const { data, error } = await supabase!
      .from('estudiantes')
      .select('id, nombre, cedula, secciones(nombre)')
      .or(`nombre.ilike.%${q}%,cedula.ilike.%${q}%`)
      .eq('activo', true)
      .order('nombre')
      .limit(8);
    if (error) return setError(error.message);
    setFound((data ?? []) as unknown as typeof found);
  };

  const printList = () => {
    const ok = (roster ?? []).filter((r) => r.state === 'ok');
    const body = `<p>${ok.length} estudiantes autorizados · ${esc(longDate(trip.fecha))}${trip.salida ? ` · salida ${esc(trip.salida)}` : ''}</p>${tableHtml(
      ['☐', 'Estudiante', 'Sección', 'Encargado', 'Teléfono de contacto', 'Salud'],
      ok.map((r) => ['☐', r.name, r.section, r.adult ? 'Mayor de edad' : r.guardian, r.phone || 'Sin teléfono', r.health || '—']),
    )}`;
    printDocument(`Autorizados: ${trip.titulo}`, body, { school: school?.nombre });
  };

  const send = async (fn: 'recordar_gira' | 'cancelar_gira') => {
    setSending(true);
    setNotice(null);
    const { data, error } = await supabase!.rpc(fn, fn === 'cancelar_gira' ? { gira: trip.id, motivo_: why } : { gira: trip.id });
    setSending(false);
    if (error) return setNotice({ ok: false, text: error.message });
    setConfirm(null);
    setWhy('');
    const n = Number(data ?? 0);
    setNotice({
      ok: true,
      text:
        fn === 'recordar_gira'
          ? `Recordatorio enviado a ${n} ${n === 1 ? 'familia' : 'familias'}.`
          : `Gira cancelada. Se avisó a ${n} ${n === 1 ? 'familia que ya había autorizado' : 'familias que ya habían autorizado'}.`,
    });
    onChanged();
  };

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
  const missingReceipt = rows.filter((r) => r.method === 'sinpe' && r.state === 'ok' && !r.receipt).length;
  const pendingCount = rows.filter((r) => r.state === 'wait').length;
  const signedOk = rows.filter((r) => r.state === 'ok').length;

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
          {trip.fecha_limite && !readOnly && <span className="text-sm strong ink-orange">Fecha límite para firmar: {longDate(trip.fecha_limite)}</span>}
          {trip.costo && trip.telefono_pago && (
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Teléfono para pagos: <strong>{trip.telefono_pago}</strong>
            </span>
          )}
          {trip.cancelada && (
            <span className="text-sm strong ink-orange">
              Cancelada{trip.motivo_cancelacion ? `: ${trip.motivo_cancelacion}` : ''}
            </span>
          )}
          {canManage && (
            <span className="row wrap gap-8">
              <Button size="sm" onClick={() => setEditing(true)}>
                Editar gira
              </Button>
              <Button size="sm" disabled={pendingCount === 0} onClick={() => (setNotice(null), setConfirm('remind'))}>
                Recordar a los pendientes · {pendingCount}
              </Button>
              <Button size="sm" variant="danger-outline" onClick={() => (setNotice(null), setConfirm('cancel'))}>
                Cancelar gira
              </Button>
            </span>
          )}
          {canManage && trip.recordatorio_en && (
            <span className="text-xs muted">
              Último recordatorio: {new Date(trip.recordatorio_en).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
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
              {missingReceipt > 0 && (
                <>
                  {' '}
                  · <strong className="ink-orange">{missingReceipt} sin comprobante</strong>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <p className="notice" role={notice.ok ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}
      {confirm === 'remind' && (
        <div className="notice stack gap-8" role="alertdialog" aria-label="Confirmar recordatorio">
          <span>
            <strong>¿Recordar a {pendingCount} {pendingCount === 1 ? 'familia' : 'familias'}?</strong> Reciben un aviso en la app y, si el colegio activó los SMS, también un mensaje:
            «Falta su autorización para la gira {trip.titulo}».
          </span>
          <span className="row gap-8">
            <Button variant="primary" disabled={sending} onClick={() => send('recordar_gira')}>
              {sending ? 'Enviando…' : 'Sí, enviar'}
            </Button>
            <Button onClick={() => setConfirm(null)}>Ahora no</Button>
          </span>
        </div>
      )}
      {confirm === 'cancel' && (
        <div className="notice stack gap-8" role="alertdialog" aria-label="Confirmar cancelación">
          <span>
            <strong>¿Cancelar la gira {trip.titulo}?</strong> Se avisa a las {signedOk} {signedOk === 1 ? 'familia' : 'familias'} que ya autorizaron. La gira pasa a «Pasadas y canceladas» y ya no se puede
            reabrir.
          </span>
          <InputField id="cancel-motivo" label="Motivo (lo verán las familias)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <span className="row gap-8">
            <Button variant="danger-outline" disabled={sending || !why.trim()} onClick={() => send('cancelar_gira')}>
              {sending ? 'Cancelando…' : 'Sí, cancelar gira'}
            </Button>
            <Button onClick={() => setConfirm(null)}>No cancelar</Button>
          </span>
        </div>
      )}

      <section aria-labelledby="lista-gira" className="card gap-10">
        <div className="row wrap between gap-8">
          <h2 id="lista-gira" className="title-section">
            Estudiantes de la gira
          </h2>
          <Button size="sm" onClick={printList} disabled={!roster}>
            Imprimir lista de autorizados
          </Button>
        </div>
        {canManage && (
        <section aria-label="Agregar estudiante" className="stack gap-8">
          <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
            <InputField id="g-buscar" label="Agregar estudiante por cédula o nombre" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button onClick={searchStudents}>Buscar</Button>
          </div>
          {found && (
            <div className="stack gap-6">
              {found.length === 0 && <span className="text-sm muted">No se encontró ningún estudiante activo con ese dato.</span>}
              {found.map((st) => {
                const already = (roster ?? []).some((r) => r.id === st.id);
                return (
                  <span key={st.id} className="row wrap between gap-8">
                    <span className="text-sm">
                      <strong>{st.nombre}</strong> · {st.secciones?.nombre ?? '—'} {st.cedula ? `· ${st.cedula}` : ''}
                    </span>
                    {already ? (
                      <span className="text-xs muted">Ya está en la gira</span>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => addStudent(st.id)}>
                        Agregar a gira
                      </Button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </section>
        )}
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
                      {r.extra && (
                        <>
                          <span className="text-xs muted"> · agregado</span>{' '}
                          {canManage && (
                            <button type="button" className="link-button text-xs" onClick={() => removeExtra(r.id)}>
                              Quitar
                            </button>
                          )}
                        </>
                      )}
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
                          {r.method === 'sinpe' && r.state === 'ok' && !r.receipt && (
                            <span className="text-xs strong ink-orange">Falta comprobante: revisar antes de aprobar</span>
                          )}
                          {r.receipt && (
                            <button type="button" className="link-button text-sm" style={{ fontWeight: 700 }} onClick={() => openFile(r.receipt!)}>
                              Ver comprobante
                            </button>
                          )}
                          {r.payment === 'review' && !trip.cancelada && (
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
