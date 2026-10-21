// Edge Function "enviar-avisos": sends the queued notifications.
// Runs every minute (pg_cron, migration 0004). For each pending row in `notificaciones`:
//   1. Web push to every phone the person subscribed (the installed app).
//   2. If the push couldn't reach them and the row has an SMS backup, an SMS through the
//      school's own Android phone running "SMS Gateway for Android" (sms-gate.app).
// Keys live in `ajustes_privados`: the push (VAPID) keys are created on the first run.
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SMS_API = 'https://api.sms-gate.app/3rdparty/v1/messages';

/** Calls the database's REST API with full access. */
async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const patch = (table: string, filter: string, body: unknown) => rest(`${table}?${filter}`, { method: 'PATCH', body: JSON.stringify(body) });

interface Row {
  id: number;
  usuario_id: string | null;
  telefono: string | null;
  titulo: string;
  cuerpo: string;
  url: string;
  push_estado: string;
  sms_estado: string;
}

/** Costa Rican numbers are 8 digits; the gateway wants them with the country code. */
export function toE164(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length === 8 ? `+506${d}` : `+${d}`;
}

async function vapidKeys() {
  const [row] = await rest('ajustes_privados?clave=eq.vapid&select=valor');
  if (row) return row.valor as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  await rest('ajustes_privados', { method: 'POST', body: JSON.stringify({ clave: 'vapid', valor: keys }) });
  return keys;
}

async function sendPushes() {
  const keys = await vapidKeys();
  webpush.setVapidDetails('mailto:avisos@elcole.app', keys.publicKey, keys.privateKey);
  const rows: Row[] = await rest('notificaciones?push_estado=eq.pendiente&select=*&order=id&limit=300');
  let sent = 0;
  for (const n of rows) {
    const subs = await rest(`suscripciones?usuario_id=eq.${n.usuario_id}&select=endpoint,claves`);
    let ok = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.claves },
          JSON.stringify({ title: n.titulo, body: n.cuerpo, url: n.url, tag: `n${n.id}` }),
          { TTL: 3600, urgency: 'high' },
        );
        ok = true;
      } catch (e) {
        // The phone unsubscribed or reinstalled: forget that subscription.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await rest(`suscripciones?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
      }
    }
    const push_estado = ok ? 'enviado' : subs.length ? 'fallo' : 'sin_suscripcion';
    // A delivered push makes the SMS backup unnecessary.
    await patch('notificaciones', `id=eq.${n.id}`, { push_estado, ...(ok && n.sms_estado === 'pendiente' ? { sms_estado: 'no_necesario' } : {}) });
    if (ok) sent++;
  }
  return sent;
}

async function sendSms() {
  const [cfg] = await rest('ajustes_privados?clave=eq.sms&select=valor');
  if (!cfg?.valor?.usuario) return 0;
  const { usuario, clave, limiteHora = 100 } = cfg.valor;
  // Stay under the hourly limit so the carrier doesn't block the line.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent: unknown[] = await rest(`notificaciones?sms_estado=eq.enviado&sms_enviado=gte.${since}&select=id`);
  const room = Math.max(0, limiteHora - recent.length);
  if (!room) return 0;
  const rows: Row[] = await rest(`notificaciones?sms_estado=eq.pendiente&push_estado=neq.pendiente&select=*&order=id&limit=${room}`);
  let sent = 0;
  for (const n of rows) {
    const res = await fetch(SMS_API, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${usuario}:${clave}`), 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumbers: [toE164(n.telefono!)], textMessage: { text: `${n.titulo}. ${n.cuerpo}`.slice(0, 300) }, ttl: 3600 }),
    });
    await patch('notificaciones', `id=eq.${n.id}`, res.ok ? { sms_estado: 'enviado', sms_enviado: new Date().toISOString() } : { sms_estado: 'fallo' });
    if (res.ok) sent++;
  }
  return sent;
}

Deno.serve(async () => {
  try {
    const push = await sendPushes();
    const sms = await sendSms();
    return Response.json({ push, sms });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});
