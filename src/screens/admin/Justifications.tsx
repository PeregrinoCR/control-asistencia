import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, InputField, Stat, useToast, Skeleton } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { fechaCorta, type Ausencia, type JustifConfig } from '../../lib/justificaciones';
import { LESSONS } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { JustificationsLive } from './JustificationsLive';

const lessonName = (n: number) => LESSONS[n - 1]?.name.replace(' lección', '') ?? `${n}.ª`;

/** Dirección · Justificaciones: each teacher decides their lessons; dirección supervises and reopens the expired ones. */
export function Justifications() {
  return supabase ? <JustificationsLive /> : <JustificationsView items={SAMPLE} rules={{ diasFamilia: 5, diasDocente: 10, noLectivos: [] }} onRemind={async () => ''} onReopen={async () => ''} />;
}

interface ViewProps {
  items: Ausencia[] | null;
  rules: JustifConfig;
  error?: string;
  onRemind: (docenteId: string) => Promise<string>;
  onReopen: (a: Ausencia, motivo: string) => Promise<string>;
}

export function JustificationsView({ items, rules, error, onRemind, onReopen }: ViewProps) {
  const flash = useToast();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const open = (items ?? []).filter((a) => a.marca === 'A');
  const expired = open.filter((a) => a.restan < 0);
  const soon = open.filter((a) => a.restan >= 0 && a.restan <= 3);
  const justified = (items ?? []).filter((a) => a.marca === 'J').length;

  const byTeacher = useMemo(() => {
    const m = new Map<string, { id: string; name: string; pending: number; soon: number; expired: number }>();
    for (const a of open) {
      const t = m.get(a.docenteId) ?? { id: a.docenteId, name: a.docente, pending: 0, soon: 0, expired: 0 };
      if (a.restan < 0) t.expired++;
      else {
        t.pending++;
        if (a.restan <= 3) t.soon++;
      }
      m.set(a.docenteId, t);
    }
    return [...m.values()].sort((x, y) => y.expired - x.expired || y.soon - x.soon || y.pending - x.pending);
  }, [open]);

  const remind = async (id: string, name: string) => {
    const msg = await onRemind(id);
    flash(msg ? `No se pudo avisar: ${msg}` : `Se le recordó a ${name}`);
  };

  const reopen = async (a: Ausencia) => {
    const motivo = (reasons[a.id] ?? '').trim();
    if (!motivo) return setProblem({ ...problem, [a.id]: 'Escriba el motivo de la excepción.' });
    setBusy(a.id);
    const msg = await onReopen(a, motivo);
    setBusy('');
    if (msg) return setProblem({ ...problem, [a.id]: msg });
    flash('Ausencia justificada por excepción. Quedó en la bitácora.');
  };

  return (
    <AdminLayout>
      <PageHeader kicker="Cada docente decide las ausencias de sus lecciones; dirección supervisa" title="Justificaciones" />

      {error ? (
        <p className="text-sm ink-orange" role="alert">
          No se pudieron cargar: {error}
        </p>
      ) : items === null ? (
        <Skeleton count={4} />
      ) : (
        <div className="stack gap-18">
          <section aria-label="Resumen" className="grid-tiles">
            <Stat label="Sin justificar" value={open.length} note="Últimos 40 días" />
            <Stat label="Justificadas" value={justified} ink="green" />
            <Stat label="Vencen en 3 días" value={soon.length} ink={soon.length ? 'amber' : undefined} />
            <Stat label="Vencidas" value={expired.length} ink={expired.length ? 'orange' : undefined} />
          </section>

          <section aria-labelledby="j-doc" className="card stack gap-10" style={{ padding: 20 }}>
            <h2 id="j-doc" className="eyebrow" style={{ fontSize: 14 }}>
              Por docente
            </h2>
            {byTeacher.length === 0 ? (
              <EmptyState title="Todo al día">Ningún docente tiene ausencias sin decidir.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Docente</th>
                      <th className="num">Por decidir</th>
                      <th className="num">Vencen pronto</th>
                      <th className="num">Vencidas</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {byTeacher.map((t) => (
                      <tr key={t.id || t.name}>
                        <td className="strong">{t.name}</td>
                        <td className="num">{t.pending}</td>
                        <td className="num">{t.soon}</td>
                        <td className="num">{t.expired > 0 ? <span className="ink-orange strong">{t.expired}</span> : 0}</td>
                        <td style={{ textAlign: 'right' }}>
                          {t.pending > 0 && t.id && (
                            <Button size="md" onClick={() => remind(t.id, t.name)}>
                              Recordar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {expired.length > 0 && (
            <section aria-labelledby="j-venc" className="card stack gap-12" style={{ padding: 20 }}>
              <div className="stack gap-4">
                <h2 id="j-venc" className="eyebrow" style={{ fontSize: 14 }}>
                  Vencidas: pueden reabrirse
                </h2>
                <span className="text-sm muted">Nadie las decidió a tiempo. Justificar una por excepción exige un motivo y queda en la bitácora.</span>
              </div>
              {expired.map((a) => (
                <div key={a.id} className="stack gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
                  <div className="stack gap-2">
                    <strong style={{ fontSize: 15 }}>
                      {a.nombre} · {a.seccion}
                    </strong>
                    <span className="text-sm muted">
                      {a.materia || 'Lección'} · {lessonName(a.leccion)} · {fechaCorta(a.fecha)} · {a.docente} · venció el {fechaCorta(a.vence)}
                      {a.aviso && ` · la familia avisó: ${a.aviso}`}
                    </span>
                  </div>
                  <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 260px' }}>
                      <InputField
                        id={`mot-${a.id}`}
                        label={<span style={{ fontSize: 14 }}>Motivo de la excepción</span>}
                        value={reasons[a.id] ?? ''}
                        onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })}
                        error={problem[a.id]}
                      />
                    </div>
                    <Button variant="primary" size="lg" disabled={busy === a.id} onClick={() => reopen(a)}>
                      Justificar por excepción
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="card row wrap between gap-10" style={{ padding: '12px 20px' }}>
            <span className="text-sm">
              Plazos vigentes: la familia tiene <strong>{rules.diasFamilia} días hábiles</strong> para presentar el comprobante en papel; el docente,{' '}
              <strong>{rules.diasDocente} días hábiles</strong> para decidir.
            </span>
            <Link to={routes.admin.settings} className="link-button text-sm strong">
              Cambiar en Configuración ›
            </Link>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

const mk = (id: string, nombre: string, seccion: string, docente: string, restan: number, extra: Partial<Ausencia> = {}): Ausencia => ({
  id, estudiante: id, nombre, seccion, fecha: '2026-10-07', leccion: 3, marca: 'A', materia: 'Inglés', docenteId: docente, docente, aviso: '', nota: '', vence: '2026-10-21', restan, ...extra,
});
const SAMPLE: Ausencia[] = [
  mk('1', 'Daniel Gamboa Solano', '10-2', 'Karla Montero', -1, { aviso: 'Cita médica' }),
  mk('2', 'Sofía Brenes Quesada', '8-1', 'Karla Montero', -1),
  mk('3', 'Gabriel Núñez Porras', '10-2', 'Andrea Solís', 1, { materia: 'Matemática' }),
  mk('4', 'Mateo Brenes Quesada', '10-2', 'Andrea Solís', 8, { materia: 'Matemática' }),
  mk('5', 'Carlos Rojas Mena', '9-1', 'Ricardo Mora', 2, { materia: 'Biología' }),
  mk('6', 'Valeria Araya Mora', '10-2', 'Andrea Solís', 7, { materia: 'Matemática', marca: 'J' }),
];
