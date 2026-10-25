import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Avatar, Badge, Button, EmptyState, Icon, QrScanner, Segmented, ThemeButton, type IconName } from '../../components';
import { MobileScreen } from '../../layouts/MobileScreen';
import { cardCode, checkCard, type GateMode, type GateResult, type StudentCard } from '../../data/gate';
import { homeFor, signOut, useAuth } from '../../lib/auth';
import { localDate } from '../../lib/schedule';
import { ageOn } from '../../lib/students';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';

const RESULT_ICON: Record<GateResult['kind'], IconName> = { ok: 'check', warn: 'alert', deny: 'x' };

interface LogEntry {
  name: string;
  section: string;
  mode: GateMode;
  time: string;
}

interface ExitRow {
  id: string;
  studentId: string;
  name: string;
  section: string;
  hour: string;
  who: string;
  left: boolean;
}

const clock = (d = new Date()) => d.toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });
/** Minutes after 6:00 p. m., the start of the night shift. */
const shiftMinutes = () => new Date().getHours() * 60 + new Date().getMinutes() - 18 * 60;

/** Guarda · Portón, checking real cards and saving every entry and exit. */
export function GateLive() {
  const { ready, session, school, perms, roles, family } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<GateMode>('out');
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<(GateResult & { studentId?: string; exitId?: string }) | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [exits, setExits] = useState<ExitRow[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState('');
  const today = localDate();

  const loadLists = useCallback(async () => {
    const db = supabase!;
    const start = new Date(today + 'T00:00:00').toISOString();
    const [p, s] = await Promise.all([
      db.from('porton').select('tipo, cuando, estudiantes(nombre, secciones(nombre))').gte('cuando', start).order('cuando', { ascending: false }).limit(20),
      db.from('salidas').select('id, estudiante_id, hora, modo, retira_nombre, salio, estudiantes(nombre, secciones(nombre))').eq('fecha', today).eq('estado', 'aprobada').order('hora'),
    ]);
    // A failed refresh (no signal) keeps the lists the guard already sees instead of emptying them.
    if (p.error || s.error) return;
    setLog(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((p.data ?? []) as any[]).map((r) => ({ name: r.estudiantes?.nombre ?? '', section: r.estudiantes?.secciones?.nombre ?? '', mode: r.tipo, time: clock(new Date(r.cuando)) })),
    );
    setExits(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((s.data ?? []) as any[]).map((r) => ({
        id: r.id,
        studentId: r.estudiante_id,
        name: r.estudiantes?.nombre ?? '',
        section: r.estudiantes?.secciones?.nombre ?? '',
        hour: `${r.hora} p. m.`,
        who: r.modo === 'pickup' ? `Lo retira ${r.retira_nombre}` : 'Sale por sus propios medios',
        left: !!r.salio,
      })),
    );
  }, [today]);

  useEffect(() => {
    if (!session) return;
    supabase!
      .from('personal')
      .select('id')
      .eq('usuario_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setMe(data?.id ?? null));
    loadLists();
    // Direction can authorize an exit while this screen is open: refresh every minute, and at once when the phone wakes up.
    const timer = setInterval(() => {
      if (!document.hidden) loadLists();
    }, 60_000);
    const onVisible = () => {
      if (!document.hidden) loadLists();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, loadLists]);

  /** Saves the entry or exit, and marks an authorized early exit as used. */
  const record = async (studentId: string, exitId?: string) => {
    const db = supabase!;
    const { error } = await db.from('porton').insert({ colegio_id: school!.id, estudiante_id: studentId, tipo: mode, registrado_por: me });
    if (error) return setError('No se guardó el registro: ' + error.message);
    if (mode === 'out' && exitId) await db.from('salidas').update({ salio: new Date().toISOString() }).eq('id', exitId);
    setError('');
    loadLists();
  };

  const handle = async (payload: string) => {
    setScanning(false);
    setManual('');
    const db = supabase!;
    const code = cardCode(payload);
    const { data: c } = await db
      .from('carnes')
      .select('codigo, revocado, estudiantes(id, nombre, cedula, nacimiento, secciones(nombre))')
      .eq('codigo', code)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (c as any)?.estudiantes;
    let card: StudentCard | undefined;
    let exitId: string | undefined;
    if (c && st) {
      const { data: ex } = await db.from('salidas').select('id, hora, modo, retira_nombre, retira_cedula, comprobante').eq('estudiante_id', st.id).eq('fecha', today).eq('estado', 'aprobada').maybeSingle();
      exitId = ex?.id;
      card = {
        code: c.codigo,
        name: st.nombre,
        section: st.secciones?.nombre ?? '—',
        age: ageOn(st.nacimiento) ?? 0,
        idNumber: st.cedula ?? '',
        revoked: c.revocado,
        exit: ex
          ? {
              time: `${ex.hora} p. m.`,
              how: ex.modo === 'pickup' ? `Lo retira ${ex.retira_nombre}` : 'Sale por sus propios medios',
              pickup: ex.modo === 'pickup' ? { name: ex.retira_nombre ?? '', idNumber: ex.retira_cedula ?? '' } : undefined,
              receipt: ex.comprobante,
            }
          : undefined,
      };
    }
    const r = checkCard(code, mode, shiftMinutes(), card ? [card] : []);
    setResult({ ...r, studentId: st?.id, exitId });
    // Short buzz on a phone: one pulse is fine, two mean stop.
    navigator.vibrate?.(r.kind === 'ok' ? 80 : [200, 100, 200]);
    // A pickup by an adult waits for the guard to check the ID; everything else is saved at once.
    if (r.kind === 'ok' && st) record(st.id, exitId);
  };

  const onScan = useCallback(handle, [mode, today, me, school]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ready && !session) return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  // Only the guard and the director (anyone with the gate permission) use the gate; families and others go to their own screen.
  if (ready && session && supabase && !perms.includes('gate')) return <Navigate to={homeFor(roles, family)} replace />;

  return (
    <MobileScreen>
      <div className="roll-header">
        <div className="row between">
          <div className="stack">
            <span className="text-sm muted strong">Guarda · {school?.nombre}</span>
            <h1 className="display" style={{ fontSize: 28, letterSpacing: -0.4 }}>
              Control de portón
            </h1>
          </div>
          <span className="row gap-8">
            <ThemeButton className="link-button text-sm" short />
            <button type="button" className="link-button text-sm" onClick={() => signOut()}>
              Salir
            </button>
          </span>
        </div>
        <Segmented
          label="Registrar"
          fill
          value={mode}
          onChange={(m) => {
            setMode(m);
            setResult(null);
          }}
          options={[
            { value: 'in', label: 'Entrada' },
            { value: 'out', label: 'Salida' },
          ]}
        />
      </div>

      <div className="screen-body gap-16" style={{ paddingTop: 16 }}>
        {scanning ? (
          <QrScanner onScan={onScan} onClose={() => setScanning(false)} />
        ) : (
          <Button variant="primary" size="xl" onClick={() => setScanning(true)} style={{ height: 64, fontSize: 17 }}>
            <Icon name="camera" size={22} />
            Escanear carné · {mode === 'in' ? 'entrada' : 'salida'}
          </Button>
        )}

        <form
          className="row gap-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) handle(manual);
          }}
        >
          <label htmlFor="g-code" className="sr-only">
            Código del carné
          </label>
          <input
            id="g-code"
            className="input input--touch grow"
            placeholder="O digite el código del carné"
            autoCapitalize="characters"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" size="lg">
            Buscar
          </Button>
        </form>

        {error && (
          <p className="text-sm ink-orange" role="alert">
            {error}
          </p>
        )}

        {result && (
          <section className="gate-result" data-kind={result.kind} role="status" aria-live="assertive">
            <div className="stack gap-12">
              <span className="gate-result__icon">
                <Icon name={RESULT_ICON[result.kind]} size={40} strokeWidth={2.6} />
              </span>
              <span className="gate-result__title">{result.title}</span>
            </div>
            {result.card && (
              <div className="row gap-10">
                <Avatar name={result.card.name} />
                <span className="stack">
                  <span className="gate-result__name">{result.card.name}</span>
                  <span style={{ fontSize: 16, color: 'var(--ink-2)' }}>
                    Sección {result.card.section} · {result.card.age} años
                  </span>
                </span>
              </div>
            )}
            <p className="gate-result__detail">{result.detail}</p>
            {result.kind === 'warn' && (
              <Button
                variant="dark"
                size="lg"
                onClick={async () => {
                  await record(result.studentId!, result.exitId);
                  setResult({ kind: 'ok', card: result.card, title: 'Salida registrada', detail: 'Quedó guardada con la hora.' });
                }}
              >
                {result.confirm}
              </Button>
            )}
          <Button variant="secondary" size="xl" onClick={() => setResult(null)}>
              {result.kind === 'warn' ? 'Cancelar' : 'Listo · siguiente carné'}
            </Button>
          </section>
        )}

        <section className="card card--mobile gap-8" aria-labelledby="sal-t">
          <h2 id="sal-t" className="title-card">
            Salidas autorizadas hoy
          </h2>
          {exits.length === 0 && <EmptyState title="Ninguna salida autorizada">Las familias la piden desde su app; aparecerá aquí.</EmptyState>}
          {exits.map((x) => (
            <div key={x.id} className="list-row" style={{ padding: '8px 0' }}>
              <span className="stack grow">
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {x.name} · {x.section}
                </span>
                <span className="text-xs muted">{x.who}</span>
              </span>
              {x.left ? <Badge tone="green">Salió</Badge> : <span className="text-sm strong tabular">{x.hour}</span>}
            </div>
          ))}
        </section>

        <section className="card card--mobile gap-8" aria-labelledby="log-t">
          <h2 id="log-t" className="title-card">
            Últimos registros
          </h2>
          {log.length === 0 && <EmptyState title="Aún no hay registros hoy">Escanee un carné para empezar.</EmptyState>}
          {log.map((l, i) => (
            <div key={i} className="list-row" style={{ padding: '8px 0' }}>
              <span className="stack grow">
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {l.name} · {l.section}
                </span>
              </span>
              <Badge tone={l.mode === 'in' ? 'blue' : 'green'}>{l.mode === 'in' ? 'Entró' : 'Salió'}</Badge>
              <span className="text-xs muted tabular" style={{ width: 64, textAlign: 'right' }}>
                {l.time}
              </span>
            </div>
          ))}
        </section>
        <span className="text-xs muted" style={{ textAlign: 'center' }}>
          Hora actual {clock()} · las listas se actualizan solas cada minuto
        </span>
      </div>
    </MobileScreen>
  );
}
