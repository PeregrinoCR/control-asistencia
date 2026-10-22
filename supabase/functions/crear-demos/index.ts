// Edge Function "crear-demos": creates the demonstration accounts (one per role) so the school can try the app
// without real e-mails. Only someone with the settings permission may call it (Configuración › Desarrollo).
// Accounts already created are reused; the people rows are linked to them by e-mail.
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

const CUENTAS = [
  { correo: 'profe@cole.local', rol: 'Docente' },
  { correo: 'guia@cole.local', rol: 'Profesor guía' },
  { correo: 'guarda@cole.local', rol: 'Guarda de portón' },
  { correo: 'padre@cole.local', rol: 'Familia (encargado)' },
];
const CLAVE = 'Demo-2026';

// The browser calls this function, so answer the CORS preflight and send the CORS headers on every reply.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const token = req.headers.get('Authorization');
  if (!token) return json({ error: 'Inicie sesión para crear las cuentas.' }, 401);

  // Who is calling must have the settings permission (checked with the caller's own session).
  const perm = await fetch(`${URL_}/rest/v1/rpc/tiene_permiso`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ perm: 'settings' }),
  });
  if (!perm.ok || (await perm.json()) !== true) return json({ error: 'Solo dirección puede crear las cuentas de demostración.' }, 403);

  const admin = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  const resultado = [];
  for (const c of CUENTAS) {
    // Confirmed at once: no e-mail is sent.
    const crear = await fetch(`${URL_}/auth/v1/admin/users`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ email: c.correo, password: CLAVE, email_confirm: true }),
    });
    // 422 means the account already exists: reuse it.
    if (!crear.ok && crear.status !== 422) return json({ error: `No se creó ${c.correo}: ${await crear.text()}` }, 500);

    // Link the person or the guardian row to the account by e-mail (the sign-up trigger may have done it already).
    const id = await cuentaId(c.correo, admin);
    if (id) {
      for (const tabla of ['personal', 'encargados']) {
        await fetch(`${URL_}/rest/v1/${tabla}?correo=eq.${encodeURIComponent(c.correo)}&usuario_id=is.null`, {
          method: 'PATCH',
          headers: { ...admin, Prefer: 'return=minimal' },
          body: JSON.stringify({ usuario_id: id }),
        });
      }
    }
    resultado.push({ correo: c.correo, rol: c.rol, clave: CLAVE });
  }
  return json({ cuentas: resultado });
});

/** The id of an account by e-mail, from the admin API. */
async function cuentaId(correo: string, admin: Record<string, string>) {
  const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=1000`, { headers: admin });
  const lista = (await res.json()).users as Array<{ id: string; email: string }>;
  return lista.find((u) => u.email?.toLowerCase() === correo.toLowerCase())?.id ?? null;
}
