import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Button, EmptyState, TextareaField, useToast } from '../../components';
import { MobileScreen, TeacherTabBar } from '../../layouts/MobileScreen';
import { useAuth } from '../../lib/auth';
import {
  cargarAusencias,
  fechaCorta,
  justifConfigOf,
  justificarAusencia,
  plazoTexto,
  quitarJustificacion,
  type Ausencia,
} from '../../lib/justificaciones';
import { LESSONS } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';

const lessonName = (n: number) => LESSONS[n - 1]?.name.replace(' lección', '') ?? `${n}.ª`;

/** Docente · Por justificar: the student shows the paper proof, the teacher decides each absence of their own lessons. */
export function ToJustify() {
  return supabase ? <ToJustifyLive /> : <ToJustifyView items={SAMPLE} onJustify={async () => ''} onUndo={async () => ''} />;
}

function ToJustifyLive() {
  const { ready, session } = useAuth();
  const location = useLocation();
  const [items, setItems] = useState<Ausencia[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const db = supabase!;
    const [{ data: p }, { data: c }] = await Promise.all([
      db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle(),
      db.from('colegios').select('config').maybeSingle(),
    ]);
    if (!p) return setItems([]);
    const r = await cargarAusencias(justifConfigOf(c?.config), p.id);
    if (typeof r === 'string') return setError(r);
    setItems(r);
  }, [session]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  if (ready && !session) return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;

  const act = async (fn: () => Promise<string>) => {
    const msg = await fn();
    if (!msg) await load();
    return msg;
  };

  return (
    <ToJustifyView
      items={items}
      error={error}
      onJustify={(list, nota) => act(async () => {
        for (const a of list) {
          const msg = await justificarAusencia(a, true, nota);
          if (msg) return msg;
        }
        return '';
      })}
      onUndo={(a) => act(() => quitarJustificacion(a))}
    />
  );
}

interface Group {
  key: string;
  nombre: string;
  seccion: string;
  list: Ausencia[];
}

const groupBy = (items: Ausencia[]): Group[] => {
  const m = new Map<string, Group>();
  for (const a of items) {
    const g = m.get(a.estudiante) ?? { key: a.estudiante, nombre: a.nombre, seccion: a.seccion, list: [] };
    g.list.push(a);
    m.set(a.estudiante, g);
  }
  // Closest deadline first.
  return [...m.values()]
    .map((g) => ({ ...g, list: g.list.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.leccion - y.leccion) }))
    .sort((a, b) => Math.min(...a.list.map((x) => x.restan)) - Math.min(...b.list.map((x) => x.restan)));
};

interface ViewProps {
  items: Ausencia[] | null;
  error?: string;
  onJustify: (list: Ausencia[], nota: string) => Promise<string>;
  onUndo: (a: Ausencia) => Promise<string>;
}

export function ToJustifyView({ items, error, onJustify, onUndo }: ViewProps) {
  const flash = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [showDone, setShowDone] = useState(false);

  const pending = useMemo(() => groupBy((items ?? []).filter((a) => a.marca === 'A' && a.restan >= 0)), [items]);
  const expired = (items ?? []).filter((a) => a.marca === 'A' && a.restan < 0);
  const done = (items ?? []).filter((a) => a.marca === 'J');
  const total = pending.reduce((n, g) => n + g.list.length, 0);
  const tomorrow = pending.filter((g) => g.list.some((a) => a.restan <= 1)).length;

  const toggle = (key: string) => {
    setOpen(open === key ? null : key);
    setSeen(false);
    setNota('');
    setProblem('');
  };

  const justify = async (g: Group) => {
    setBusy(true);
    const msg = await onJustify(g.list, nota);
    setBusy(false);
    if (msg) return setProblem(msg);
    setOpen(null);
    flash(`${g.list.length === 1 ? 'Ausencia justificada' : 'Ausencias justificadas'}: ${g.nombre.split(' ')[0]}`);
  };

  return (
    <MobileScreen>
      <div className="roll-header">
        <h1 className="display" style={{ fontSize: 30, letterSpacing: -0.5 }}>
          Por justificar
        </h1>
        <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
          {items === null
            ? 'Cargando…'
            : total === 0
              ? 'No tiene ausencias por decidir'
              : `${total} ${total === 1 ? 'ausencia' : 'ausencias'} de ${pending.length} ${pending.length === 1 ? 'estudiante' : 'estudiantes'}`}
          {tomorrow > 0 && (
            <>
              {' · '}
              <strong className="ink-orange">
                {tomorrow} {tomorrow === 1 ? 'vence pronto' : 'vencen pronto'}
              </strong>
            </>
          )}
        </span>
      </div>

      <div className="roll-list" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        {error && (
          <p className="text-sm ink-orange" role="alert">
            No se pudieron cargar: {error}
          </p>
        )}
        {items && total === 0 && !error && (
          <EmptyState title="Todo al día">Cuando un estudiante le presente un comprobante, aquí decide si justifica su ausencia.</EmptyState>
        )}

        {pending.map((g) => {
          const min = Math.min(...g.list.map((a) => a.restan));
          const urgent = min <= 1;
          const isOpen = open === g.key;
          const aviso = g.list.find((a) => a.aviso)?.aviso;
          const first = g.list[0];
          return (
            <article
              key={g.key}
              className="card"
              style={{ padding: 14, gap: 8, display: 'flex', flexDirection: 'column', border: `${urgent ? 2 : 1}px solid ${urgent ? 'var(--orange)' : 'var(--border)'}` }}
            >
              <div className="row between gap-8" style={{ alignItems: 'flex-start' }}>
                <div className="stack">
                  <strong style={{ fontSize: 17 }}>{g.nombre}</strong>
                  <span className="text-xs muted">
                    {g.seccion}
                    {g.list.length > 1 && ` · ${g.list.length} ausencias`}
                  </span>
                </div>
                <span className="text-xs strong" style={{ whiteSpace: 'nowrap', color: urgent ? 'var(--orange-ink)' : 'var(--blue-ink)' }}>
                  {plazoTexto(min, first.vence)}
                </span>
              </div>
              <div className="stack gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
                {g.list.map((a) => (
                  <span key={a.id}>
                    {fechaCorta(a.fecha)} · {lessonName(a.leccion)} lección
                  </span>
                ))}
              </div>
              {aviso && (
                <span className="text-sm" style={{ background: 'var(--sunken)', borderRadius: 10, padding: '6px 10px' }}>
                  La familia avisó: <strong>{aviso}</strong>
                </span>
              )}
              {isOpen ? (
                <div className="stack gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
                  <label className="row gap-10" style={{ minHeight: 44, fontWeight: 600 }}>
                    <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} style={{ width: 22, height: 22 }} />
                    Presento comprobante
                  </label>
                  <TextareaField
                    id={`n-${g.key}`}
                    rows={2}
                    label={<span style={{ fontSize: 14 }}>Nota</span>}
                    hint="opcional"
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    style={{ borderRadius: 12, resize: 'none' }}
                  />
                  {problem && (
                    <p className="text-sm ink-orange" role="alert">
                      {problem}
                    </p>
                  )}
                  <Button variant="primary" size="lg" disabled={!seen || busy} onClick={() => justify(g)}>
                    {busy ? 'Guardando…' : g.list.length === 1 ? 'Justificar la ausencia' : `Justificar las ${g.list.length} ausencias`}
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => toggle(g.key)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button variant={urgent ? 'primary' : 'secondary'} size="lg" onClick={() => toggle(g.key)}>
                  Ver y decidir
                </Button>
              )}
            </article>
          );
        })}

        {expired.length > 0 && (
          <p className="text-sm muted">
            {expired.length} {expired.length === 1 ? 'ausencia pasó' : 'ausencias pasaron'} su plazo sin decisión. Solo dirección puede reabrirlas.
          </p>
        )}

        {done.length > 0 && (
          <div className="stack gap-8">
            <button type="button" className="card row between" style={{ minHeight: 48, padding: '0 14px', fontWeight: 600 }} aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              <span>Decididas este mes</span>
              <span className="ink-blue">{done.length} ›</span>
            </button>
            {showDone &&
              done.map((a) => (
                <div key={a.id} className="card row between gap-8" style={{ padding: 12 }}>
                  <div className="stack">
                    <strong style={{ fontSize: 15 }}>{a.nombre}</strong>
                    <span className="text-xs muted">
                      {fechaCorta(a.fecha)} · {lessonName(a.leccion)}
                      {a.nota && ` · ${a.nota}`}
                    </span>
                  </div>
                  {a.restan >= 0 ? (
                    <Button
                      size="md"
                      onClick={async () => {
                        const msg = await onUndo(a);
                        flash(msg ? `No se pudo deshacer: ${msg}` : 'Quedó como ausencia sin justificar');
                      }}
                    >
                      Deshacer
                    </Button>
                  ) : (
                    <span className="text-xs muted">Plazo cerrado</span>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
      <TeacherTabBar />
    </MobileScreen>
  );
}

const D = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;
const mk = (id: string, nombre: string, fecha: string, leccion: number, restan: number, extra: Partial<Ausencia> = {}): Ausencia => ({
  id, estudiante: nombre, nombre, seccion: '10-2', fecha, leccion, marca: 'A', materia: 'Matemática', docenteId: 'd', docente: 'Andrea Solís', aviso: '', nota: '', vence: D(23), restan, ...extra,
});
const SAMPLE: Ausencia[] = [
  mk('1', 'Gabriel Núñez Porras', D(9), 1, 1, { aviso: 'Enfermedad' }),
  mk('2', 'Mateo Brenes Quesada', D(20), 1, 8, { aviso: 'Cita médica' }),
  mk('3', 'Mateo Brenes Quesada', D(21), 2, 8, { aviso: 'Cita médica' }),
  mk('4', 'Daniel Gamboa Solano', D(12), 3, 2),
  mk('5', 'Valeria Araya Mora', D(19), 1, 7),
];
