import { useState } from 'react';
import { Badge, Button, Icon, Segmented, Stat, StatusBadge, Switch } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { CASES, CRITERIA, LEVEL_FILTERS, RISK, type RiskLevel } from '../../data/earlyWarning';
import { ruleState } from '../../data/school';

/** Dirección · Alerta temprana */
export function EarlyWarning() {
  const [filter, setFilter] = useState<'all' | RiskLevel>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [plans, setPlans] = useState<Record<number, boolean[]>>({});
  const [criteria, setCriteria] = useState(ruleState(CRITERIA));

  const list = CASES.filter((c) => filter === 'all' || c.level === filter);
  const d = list.find((c) => c.id === selectedId) ?? list[0] ?? CASES[0];
  const plan = plans[d.id] ?? d.plan.map((p) => p.done);
  const marks = d.strip.split('');
  const count = (k: string) => marks.filter((m) => m === k).length;

  return (
    <AdminLayout>
      <PageHeader
        kicker="Seguimiento de estudiantes en riesgo de exclusión · octubre 2026"
        title="Alerta temprana"
        actions={
          <>
            <Button regular>Informe general (PDF)</Button>
            <Button variant="primary">Agregar caso manual</Button>
          </>
        }
      />

      <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat compact label="En alerta" value="14" note="5,9 % de la matrícula" />
        <Stat compact label="Riesgo alto" value="4" ink="orange" note="Requieren acción esta semana" />
        <Stat compact label="Sin contactar" value="3" ink="amber" note="Más de 5 días en alerta" />
        <Stat compact label="Casos cerrados este curso" value="21" ink="green" note="Volvieron a asistir con regularidad" />
      </div>

      <Segmented label="Filtrar por nivel de riesgo" value={filter} onChange={setFilter} options={LEVEL_FILTERS} />

      <div className="split">
        <section aria-label="Estudiantes en alerta" className="card split__main" style={{ padding: '8px 18px 18px', flexBasis: 560 }}>
          <div className="table-wrap">
            <table className="table table--compact" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Riesgo</th>
                  <th className="num">Aus. injust.</th>
                  <th className="num">Consecutivas</th>
                  <th className="num">Tardías</th>
                  <th>Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} aria-selected={c.id === d.id}>
                    <td>
                      <button type="button" className="row-button stack" style={{ minHeight: 44, alignItems: 'flex-start', gap: 0 }} onClick={() => setSelectedId(c.id)}>
                        <span>{c.name}</span>
                        <span className="text-xs muted" style={{ fontWeight: 400 }}>
                          {c.section} · {c.age}
                        </span>
                      </button>
                    </td>
                    <td>
                      <StatusBadge status={RISK[c.level]} />
                    </td>
                    <td className="num strong">{c.unexcused}</td>
                    <td className="num">{c.consecutive}</td>
                    <td className="num">{c.lates}</td>
                    <td>
                      <span className="stack">
                        <span style={{ fontWeight: 600 }}>{c.status}</span>
                        <span className="text-xs muted">{c.owner}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside aria-labelledby="caso-t" className="card gap-16" style={{ flex: '1 1 360px', minWidth: 0, padding: 20 }}>
          <div className="row between gap-10" style={{ alignItems: 'flex-start' }}>
            <div className="stack gap-2">
              <span className="eyebrow" style={{ fontSize: 12 }}>
                Caso AT-2026-{100 + d.id} · abierto {d.opened}
              </span>
              <h2 id="caso-t" className="display" style={{ fontSize: 22 }}>
                {d.name}
              </h2>
              <span className="muted" style={{ fontSize: 14 }}>
                Sección {d.section} · {d.age} · guía: {d.guide}
              </span>
            </div>
            <Badge tone={RISK[d.level].tone} size="md">
              Riesgo {RISK[d.level].label.toLowerCase()}
            </Badge>
          </div>

          <div className="stack gap-6">
            <h3 className="eyebrow">Por qué está en alerta</h3>
            {d.reasons.map((r) => (
              <div key={r} className="row gap-8" style={{ alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4 }}>
                <Icon name="alert" size={16} strokeWidth={2.4} style={{ color: 'var(--orange)', marginTop: 2, flexShrink: 0 }} />
                <span>{r}</span>
              </div>
            ))}
          </div>

          <div className="stack gap-6">
            <h3 className="eyebrow">Últimas 4 semanas</h3>
            <div className="strip" role="img" aria-label={`Últimos 20 días lectivos: ${count('A')} ausencias sin justificar y ${count('T')} tardías`}>
              {marks.map((m, i) => (
                <span key={i} data-k={m} />
              ))}
            </div>
            <span className="text-xs muted">
              Azul: asistió · ámbar: tarde · naranja: ausente sin justificar · gris: justificada o feriado
            </span>
          </div>

          <div className="stack gap-6">
            <h3 className="eyebrow">Plan de intervención</h3>
            {d.plan.map((p, i) => (
              <label key={p.label} className="row gap-10" style={{ minHeight: 36, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  style={{ width: 20, height: 20, margin: 0 }}
                  checked={plan[i]}
                  onChange={() => setPlans({ ...plans, [d.id]: plan.map((v, j) => (j === i ? !v : v)) })}
                />
                <span style={{ textDecoration: plan[i] ? 'line-through' : 'none', color: plan[i] ? 'var(--muted)' : 'var(--ink)' }}>
                  {p.label}
                </span>
              </label>
            ))}
          </div>

          <div className="stack">
            <h3 className="eyebrow" style={{ marginBottom: 6 }}>
              Bitácora de seguimiento
            </h3>
            {d.log.map((g) => (
              <div key={g.date + g.what} className="row gap-10" style={{ alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}>
                <span className="text-xs muted" style={{ width: 64, flexShrink: 0, fontWeight: 600 }}>
                  {g.date}
                </span>
                <span className="stack" style={{ fontSize: 14 }}>
                  <span className="strong">{g.what}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{g.note}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="grid-2">
            <Button variant="dark" style={{ fontSize: 14 }}>
              Registrar contacto
            </Button>
            <Button style={{ fontSize: 14 }}>Informe del caso (PDF)</Button>
            <Button style={{ fontSize: 14 }}>Remitir a orientación</Button>
            <Button className="btn--ink-green" style={{ fontSize: 14 }}>
              Cerrar caso
            </Button>
          </div>
        </aside>
      </div>

      <section aria-labelledby="crit-t" className="card">
        <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
          <h2 id="crit-t" className="title-section">
            Criterios que activan la alerta
          </h2>
          <span className="text-sm muted">Al activarse se abre un caso y se avisa al profesor guía y a orientación.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {CRITERIA.map((c) => (
            <div
              key={c.id}
              className="row gap-10"
              style={{ border: `1.5px solid ${criteria[c.id] ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 12 }}
            >
              <span className="stack grow">
                <span className="setting-row__label">{c.label}</span>
                <span className="setting-row__help">{c.help}</span>
              </span>
              <Switch label={c.label} checked={criteria[c.id]} onChange={(v) => setCriteria({ ...criteria, [c.id]: v })} />
            </div>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
