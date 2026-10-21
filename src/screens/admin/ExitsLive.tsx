import { useEffect, useState } from 'react';
import { Badge, Button, InputField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { EarlyExitSample } from '../mobile/EarlyExit';

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

/** Dirección · Salidas tempranas de hoy y solicitudes pendientes. */
export function ExitsLive() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Exit[] | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const today = localDate();

  const load = async () => {
    const { data, error } = await supabase!
      .from('salidas')
      .select('id, fecha, hora, modo, motivo, retira_nombre, estado, motivo_rechazo, firma, salio, estudiantes(nombre, secciones(nombre))')
      .or(`fecha.eq.${today},estado.eq.pendiente`)
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
  };

  return (
    <AdminLayout>
      <PageHeader kicker={`Hoy, ${today}`} title="Salidas tempranas" />
      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      <section aria-label="Solicitudes" className="stack gap-10">
        {rows === null && <p className="text-sm muted">Cargando…</p>}
        {rows?.length === 0 && <p className="card text-sm muted">No hay salidas tempranas hoy ni solicitudes pendientes.</p>}
        {rows?.map((r) => (
          <div key={r.id} className="card row wrap between gap-10" style={{ padding: '12px 16px' }}>
            <span className="stack" style={{ minWidth: 220 }}>
              <span className="row gap-8">
                <strong style={{ fontSize: 15 }}>{r.estudiantes?.nombre ?? '—'}</strong>
                <Badge tone={TONE[r.estado]}>{LABEL[r.estado]}</Badge>
                {r.salio && <Badge tone="blue">Ya salió</Badge>}
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
              {r.estado !== 'aprobada' && (
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
      </section>

      <section aria-labelledby="prev-t" className="card stack gap-8" style={{ marginTop: 8 }}>
        <div className="row between wrap gap-8">
          <h2 id="prev-t" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Formulario de la familia (vista previa)
          </h2>
          <Button onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Ocultar' : 'Ver formulario'}</Button>
        </div>
        <span className="text-xs muted">Así lo llena la familia en su app. Solo para revisar; no se puede enviar desde aquí.</span>
        {showPreview && (
          <div inert aria-label="Vista previa del formulario de la familia" style={{ maxWidth: 420, pointerEvents: 'none' }}>
            <EarlyExitSample />
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
