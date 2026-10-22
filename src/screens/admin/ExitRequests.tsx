import { useEffect, useState } from 'react';
import { Badge, Button, InputField, useFlash } from '../../components';
import { useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

type Estado = 'pendiente' | 'aprobada' | 'rechazada';

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
  salio: string | null;
  estudiantes: { nombre: string; secciones: { nombre: string } | null } | null;
}

const TONE: Record<Estado, 'amber' | 'green' | 'orange'> = { pendiente: 'amber', aprobada: 'green', rechazada: 'orange' };
const LABEL: Record<Estado, string> = { pendiente: 'Pendiente', aprobada: 'Autorizada', rechazada: 'No autorizada' };

/**
 * Early-exit requests waiting for a decision (and today's refusals, which can still be reversed).
 * Lives inside Giras y salidas; authorized exits are listed in the table next to it.
 */
export function ExitRequests({ onDecided }: { onDecided?: () => void }) {
  const { session, perms } = useAuth();
  const canDecide = perms.includes('approveExit');
  const [rows, setRows] = useState<Exit[] | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [msg, setMsg] = useFlash();
  const today = localDate();

  const load = async () => {
    const { data, error } = await supabase!
      .from('salidas')
      .select('id, fecha, hora, modo, motivo, retira_nombre, estado, motivo_rechazo, firma, salio, estudiantes(nombre, secciones(nombre))')
      .or(`and(fecha.eq.${today},estado.eq.rechazada),estado.eq.pendiente`)
      .order('fecha')
      .order('hora');
    if (error) return setMsg({ ok: false, text: error.message });
    setRows((data ?? []) as unknown as Exit[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <section aria-labelledby="solic-t" className="card gap-10">
      <div className="stack gap-2">
        <h2 id="solic-t" className="title-section">
          Solicitudes por decidir{rows && rows.length > 0 ? ` · ${rows.length}` : ''}
        </h2>
        <span className="text-sm muted">Las familias piden la salida desde su app; dirección autoriza o no autoriza.</span>
      </div>
      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {rows === null && <p className="text-sm muted">Cargando…</p>}
      {rows?.length === 0 && <p className="text-sm muted">No hay solicitudes pendientes.</p>}
      <div className="stack gap-10">
        {rows?.map((r) => (
          <div key={r.id} className="row wrap between gap-10" style={{ padding: '12px 0', borderTop: '1px solid var(--border-soft)' }}>
            <span className="stack" style={{ minWidth: 220 }}>
              <span className="row gap-8">
                <strong style={{ fontSize: 15 }}>{r.estudiantes?.nombre ?? '—'}</strong>
                <Badge tone={TONE[r.estado]}>{LABEL[r.estado]}</Badge>
              </span>
              <span className="text-sm muted">
                {r.estudiantes?.secciones?.nombre ?? '—'} · {r.fecha} · sale a las {r.hora}
              </span>
              <span className="text-sm">{r.modo === 'alone' ? 'Sale solo' : `Lo retira: ${r.retira_nombre ?? '—'}`}</span>
              {r.motivo && <span className="text-sm muted">Motivo: {r.motivo}</span>}
              {r.estado === 'rechazada' && r.motivo_rechazo && <span className="text-sm ink-orange">Rechazada: {r.motivo_rechazo}</span>}
            </span>
            <span className="stack gap-6" style={{ alignItems: 'flex-end', minWidth: 260 }}>
              {r.firma?.startsWith('data:image') && <img src={r.firma} alt="Firma del encargado" style={{ height: 40 }} />}
              {canDecide && (
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
        ))}
      </div>
    </section>
  );
}
