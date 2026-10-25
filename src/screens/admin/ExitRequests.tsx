import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, InputField, Segmented, useFlash, Skeleton } from '../../components';
import { useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

type Estado = 'pendiente' | 'aprobada' | 'rechazada';
type Filter = 'all' | 'pendiente' | 'aprobada';
type Range = 'hoy' | 'dia' | 'periodo';

interface Exit {
  id: string;
  fecha: string;
  hora: string;
  modo: 'pickup' | 'alone';
  motivo: string | null;
  retira_nombre: string | null;
  estado: Estado;
  motivo_rechazo: string | null;
  firma: string | null;
  comprobante: string | null;
  salio: string | null;
  estudiantes: { nombre: string; secciones: { nombre: string } | null } | null;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });

/** Badge for one request: asked, authorized (and whether the student already left), or refused. */
function status(r: Exit): { tone: 'amber' | 'green' | 'orange' | 'blue'; label: string } {
  if (r.estado === 'pendiente') return { tone: 'amber', label: 'Por decidir' };
  if (r.estado === 'rechazada') return { tone: 'orange', label: 'No autorizada' };
  return r.salio ? { tone: 'blue', label: `Salió ${time(r.salio)}` } : { tone: 'green', label: 'Autorizada · por salir' };
}

/**
 * Early exits in one list: today's requests and authorizations, plus older requests still waiting.
 * Families ask from their app; whoever has the approve permission decides here. The gate guard sees only the authorized ones.
 */
export function ExitRequests({ onDecided }: { onDecided?: () => void }) {
  const { session, perms } = useAuth();
  const canDecide = perms.includes('approveExit');
  const [rows, setRows] = useState<Exit[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [range, setRange] = useState<Range>('hoy');
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [reason, setReason] = useState<Record<string, string>>({});
  const [msg, setMsg] = useFlash();
  const today = localDate();

  const load = async () => {
    let query = supabase!
      .from('salidas')
      .select('id, fecha, hora, modo, motivo, retira_nombre, estado, motivo_rechazo, firma, comprobante, salio, estudiantes(nombre, secciones(nombre))');
    // Today: today's requests plus older ones still waiting. A day or a period: whatever happened then.
    if (range === 'hoy') query = query.or(`fecha.eq.${today},estado.eq.pendiente`);
    else if (range === 'dia') query = query.eq('fecha', from);
    else query = query.gte('fecha', from).lte('fecha', to);
    const { data, error } = await query.order('fecha').order('hora').limit(1000);
    if (error) return setMsg({ ok: false, text: error.message });
    setRows((data ?? []) as unknown as Exit[]);
  };

  useEffect(() => {
    if (range === 'periodo' && from > to) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to]);

  const decide = async (r: Exit, estado: 'aprobada' | 'rechazada') => {
    const motivo = (reason[r.id] ?? '').trim();
    if (estado === 'rechazada' && !motivo) return setMsg({ ok: false, text: 'Escriba el motivo para rechazar la salida.' });
    const { error } = await supabase!
      .from('salidas')
      .update({
        estado,
        motivo_rechazo: estado === 'rechazada' ? motivo : null,
        decidido_por: session!.user.id,
        decidido_en: new Date().toISOString(),
      })
      .eq('id', r.id);
    if (error) return setMsg({ ok: false, text: 'No se guardó: ' + error.message });
    setMsg({ ok: true, text: estado === 'aprobada' ? 'Salida autorizada. Se avisó a la familia.' : 'Salida no autorizada. Se avisó a la familia.' });
    load();
    onDecided?.();
  };

  const count = (e: Estado) => rows?.filter((r) => r.estado === e).length ?? 0;
  const shown = rows?.filter((r) => filter === 'all' || r.estado === filter) ?? [];

  return (
    <section aria-labelledby="sal-t" className="card gap-10">
      <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
        <h2 id="sal-t" className="title-section">
          Salidas tempranas
        </h2>
        <span className="text-sm muted">Las familias piden la salida desde su app. El guarda del portón ve solo las autorizadas.</span>
      </div>
      <div className="row wrap gap-10" style={{ alignItems: 'flex-end' }}>
        <Segmented
          label="Qué días ver"
          value={range}
          onChange={setRange}
          options={[
            { value: 'hoy', label: 'Hoy' },
            { value: 'dia', label: 'Un día' },
            { value: 'periodo', label: 'Periodo' },
          ]}
        />
        {range !== 'hoy' && <InputField id="sal-desde" type="date" label={range === 'dia' ? 'Día' : 'Desde'} value={from} onChange={(e) => setFrom(e.target.value)} />}
        {range === 'periodo' && <InputField id="sal-hasta" type="date" label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />}
      </div>
      {range === 'periodo' && from > to && (
        <p className="text-sm ink-orange" role="alert">
          «Desde» no puede ser después de «Hasta».
        </p>
      )}
      <div className="row wrap gap-8" role="group" aria-label="Filtrar salidas">
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Todas · {rows?.length ?? 0}
        </button>
        <button type="button" className="chip" aria-pressed={filter === 'pendiente'} onClick={() => setFilter('pendiente')}>
          Por decidir · {count('pendiente')}
        </button>
        <button type="button" className="chip" aria-pressed={filter === 'aprobada'} onClick={() => setFilter('aprobada')}>
          Autorizadas · {count('aprobada')}
        </button>
      </div>
      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {rows === null && <Skeleton count={4} />}
      {rows && shown.length === 0 && (
        <EmptyState title={filter === 'pendiente' ? 'No hay solicitudes por decidir' : range === 'hoy' ? 'No hay salidas tempranas hoy' : 'No hay salidas tempranas en esas fechas'}>
          Cuando una familia pida una salida, aparecerá aquí para que la autorice.
        </EmptyState>
      )}
      <div className="stack">
        {shown.map((r) => {
          const st = status(r);
          return (
            <div key={r.id} className="row wrap between gap-10" style={{ padding: '12px 0', borderTop: '1px solid var(--border-soft)' }}>
              <span className="stack" style={{ minWidth: 220 }}>
                <span className="row gap-8">
                  <strong style={{ fontSize: 15 }}>{r.estudiantes?.nombre ?? '—'}</strong>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </span>
                <span className="text-sm muted">
                  {r.estudiantes?.secciones?.nombre ?? '—'} · {r.fecha === today ? 'hoy' : new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })} · sale a las {r.hora}
                </span>
                <span className="text-sm">{r.modo === 'alone' ? 'Sale solo' : `Lo retira: ${r.retira_nombre ?? '—'}`}</span>
                {r.motivo && <span className="text-sm muted">Motivo: {r.motivo}</span>}
                {r.estado === 'aprobada' && r.comprobante && <span className="text-sm muted tabular">Comprobante {r.comprobante}</span>}
                {r.estado === 'rechazada' && r.motivo_rechazo && <span className="text-sm ink-orange">Rechazada: {r.motivo_rechazo}</span>}
              </span>
              <span className="stack gap-6" style={{ alignItems: 'flex-end', minWidth: 260 }}>
                {r.firma?.startsWith('data:image') && <img src={r.firma} alt="Firma del encargado" style={{ height: 40 }} />}
                {/* An authorized exit is final: the guard may already be relying on it. */}
                {canDecide && r.estado !== 'aprobada' && (
                  <span className="row gap-6">
                    <Button variant="primary" onClick={() => decide(r, 'aprobada')}>
                      Autorizar
                    </Button>
                    {r.estado === 'pendiente' && (
                      <>
                        <InputField id={`mot-${r.id}`} label="Motivo si no autoriza" value={reason[r.id] ?? ''} onChange={(e) => setReason({ ...reason, [r.id]: e.target.value })} />
                        <Button onClick={() => decide(r, 'rechazada')}>No autorizar</Button>
                      </>
                    )}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
