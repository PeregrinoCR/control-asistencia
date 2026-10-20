import { useCallback, useState } from 'react';
import { Avatar, Badge, Button, Icon, QrScanner, Segmented, type IconName } from '../../components';
import { MobileScreen } from '../../layouts/MobileScreen';
import { CARDS, DEMO_NOW, DEMO_NOW_LABEL, cardPayload, checkCard, type GateMode, type GateResult } from '../../data/gate';

const RESULT_ICON: Record<GateResult['kind'], IconName> = { ok: 'check', warn: 'alert', deny: 'x' };

interface LogEntry {
  name: string;
  section: string;
  mode: GateMode;
  time: string;
}

/** Guarda · Portón: scan the student card on the way in or out. */
export function Gate() {
  const [mode, setMode] = useState<GateMode>('out');
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<GateResult | null>(null);
  const [log, setLog] = useState<LogEntry[]>([
    { name: 'Sebastián Ríos Mena', section: '9-1', mode: 'out', time: '7:22 p. m.' },
    { name: 'Mateo Brenes Quesada', section: '10-2', mode: 'in', time: '5:52 p. m.' },
  ]);

  const record = (r: GateResult) => {
    if (r.kind === 'deny' || !r.card) return;
    setLog((l) => [{ name: r.card.name, section: r.card.section, mode, time: DEMO_NOW_LABEL }, ...l]);
  };

  const handle = useCallback(
    (payload: string) => {
      setScanning(false);
      const r = checkCard(payload, mode, DEMO_NOW);
      setResult(r);
      // A pickup by an adult waits for the guard to check the ID; everything else is logged at once.
      if (r.kind === 'ok') setLog((l) => [{ name: r.card.name, section: r.card.section, mode, time: DEMO_NOW_LABEL }, ...l]);
    },
    [mode],
  );

  const exitsToday = CARDS.filter((c) => c.exit);

  return (
    <MobileScreen>
      <div className="roll-header">
        <div className="row between">
          <div className="stack">
            <span className="text-sm muted strong">Guarda · Portón principal</span>
            <h1 className="display" style={{ fontSize: 28, letterSpacing: -0.4 }}>
              Control de portón
            </h1>
          </div>
          <span className="text-sm muted strong tabular">{DEMO_NOW_LABEL}</span>
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
          <QrScanner onScan={handle} onClose={() => setScanning(false)} />
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
            placeholder="O digite el código, ej.: K7Q2-MB16"
            autoCapitalize="characters"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit" size="lg">
            Buscar
          </Button>
        </form>

        {result && (
          <section className="gate-result" data-kind={result.kind} role="status" aria-live="assertive">
            <div className="row gap-12">
              <span className="gate-result__icon">
                <Icon name={RESULT_ICON[result.kind]} size={24} strokeWidth={2.4} />
              </span>
              <span className="gate-result__title">{result.title}</span>
            </div>
            {result.card && (
              <div className="row gap-10">
                <Avatar name={result.card.name} />
                <span className="stack">
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{result.card.name}</span>
                  <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                    Sección {result.card.section} · {result.card.age} años
                  </span>
                </span>
              </div>
            )}
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--ink-2)' }}>{result.detail}</p>
            {result.kind === 'warn' && (
              <Button
                variant="dark"
                size="lg"
                onClick={() => {
                  record(result);
                  setResult({ kind: 'ok', card: result.card, title: 'Salida registrada', detail: 'Se avisa a la familia.' });
                }}
              >
                {result.confirm}
              </Button>
            )}
          </section>
        )}

        <section className="card card--mobile gap-8" aria-labelledby="sal-t">
          <h2 id="sal-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Salidas autorizadas hoy
          </h2>
          {exitsToday.map((c) => (
            <div key={c.code} className="list-row" style={{ padding: '8px 0' }}>
              <span className="stack grow">
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {c.name} · {c.section}
                </span>
                <span className="text-xs muted">{c.exit!.pickup ? `Lo retira ${c.exit!.pickup.name}` : c.exit!.how}</span>
              </span>
              <span className="text-sm strong tabular">{c.exit!.time}</span>
            </div>
          ))}
        </section>

        <section className="card card--mobile gap-8" aria-labelledby="log-t">
          <h2 id="log-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Últimos registros
          </h2>
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

        <details className="card card--mobile">
          <summary style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Probar con carnés de ejemplo</summary>
          <div className="stack gap-8" style={{ paddingTop: 8 }}>
            {CARDS.map((c) => (
              <button key={c.code} type="button" className="choice choice--detail" onClick={() => handle(cardPayload(c))}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                <span className="text-xs muted" style={{ fontWeight: 400 }}>
                  {c.age >= 18 ? 'Mayor de edad' : c.exit ? `Salida autorizada ${c.exit.time}` : 'Menor sin salida autorizada'}
                  {c.revoked ? ' · carné perdido' : ''}
                </span>
              </button>
            ))}
          </div>
        </details>
      </div>
    </MobileScreen>
  );
}
