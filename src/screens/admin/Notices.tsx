import { useState } from 'react';
import { Button, Icon, InputField, Meter, SettingRow, StatusBadge, TextareaField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { AUDIENCES, AUTO_RULES, CHANNELS, NOTICE_TONE, NOTICE_TYPES, SENT_NOTICES, type NoticeType } from '../../data/notices';
import { SCHOOL_NAME, ruleState } from '../../data/school';

const toneVars = {
  blue: ['var(--blue)', 'var(--blue-bg)', 'var(--blue-ink)'],
  green: ['var(--green)', 'var(--green-bg)', 'var(--green-ink)'],
  orange: ['var(--orange)', 'var(--orange-bg)', 'var(--orange-ink)'],
  amber: ['var(--amber-ink)', 'var(--amber-bg)', 'var(--amber-ink)'],
} as const;

/** Dirección · Avisos a familias */
export function Notices() {
  const [type, setType] = useState<NoticeType>('info');
  const [audience, setAudience] = useState<Record<string, boolean>>({ enc: true, adu: true });
  const [channels, setChannels] = useState<Record<string, boolean>>({ app: true, sms: true, mail: false });
  const [rules, setRules] = useState(ruleState(AUTO_RULES));
  const [later, setLater] = useState(false);
  const [sent, setSent] = useState(false);

  const t = NOTICE_TYPES.find((x) => x.id === type)!;
  const reach = audience.all
    ? 239 + (audience.doc ? 24 : 0)
    : AUDIENCES.filter((g) => audience[g.id]).reduce((n, g) => n + g.people, 0);
  const urgent = type === 'urg' || type === 'sus';

  return (
    <AdminLayout>
      <PageHeader kicker="Comunicados generales y avisos automáticos" title="Avisos a familias" />

      <div className="split">
        <section aria-labelledby="nuevo-t" className="card card--roomy split__main" style={{ gap: 18 }}>
          <h2 id="nuevo-t" style={{ fontSize: 20, fontWeight: 700 }}>
            Nuevo aviso
          </h2>

          <fieldset className="fieldset">
            <legend style={{ fontSize: 14 }}>Tipo de aviso</legend>
            <div className="row wrap gap-8">
              {NOTICE_TYPES.map((x) => {
                const on = x.id === type;
                const [line, bg, ink] = toneVars[NOTICE_TONE[x.id] as keyof typeof toneVars];
                return (
                  <button
                    key={x.id}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    style={on ? { background: bg, borderColor: line, color: ink } : undefined}
                    onClick={() => {
                      setType(x.id);
                      setSent(false);
                    }}
                  >
                    {x.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="fieldset">
            <legend style={{ fontSize: 14 }}>Destinatarios</legend>
            <div className="row wrap gap-8">
              {AUDIENCES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="chip chip--square"
                  aria-pressed={!!audience[g.id]}
                  onClick={() => {
                    setAudience({ ...audience, [g.id]: !audience[g.id] });
                    setSent(false);
                  }}
                >
                  <span className="chip__box">
                    <Icon name="check" size={12} strokeWidth={3.2} />
                  </span>
                  {g.label}
                </button>
              ))}
            </div>
            <span className="text-sm muted" style={{ display: 'block', marginTop: 8 }}>
              Llegará a unas <strong style={{ color: 'var(--ink)' }}>{reach}</strong> personas.
            </span>
          </fieldset>

          <InputField id="a-titulo" label={<span style={{ fontSize: 14 }}>Título</span>} placeholder={t.sample.title} style={{ height: 46, borderRadius: 'var(--radius-md)', padding: '0 14px' }} />
          <TextareaField id="a-msg" rows={4} label={<span style={{ fontSize: 14 }}>Mensaje</span>} placeholder={t.sample.body} style={{ borderRadius: 'var(--radius-md)', padding: '12px 14px' }} />

          <div className="row wrap gap-20" style={{ alignItems: 'flex-start' }}>
            <fieldset className="fieldset">
              <legend style={{ fontSize: 14 }}>Canales</legend>
              <div className="row wrap gap-8">
                {CHANNELS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="chip chip--square"
                    aria-pressed={!!channels[c.id]}
                    onClick={() => setChannels({ ...channels, [c.id]: !channels[c.id] })}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="fieldset">
              <legend style={{ fontSize: 14 }}>Cuándo</legend>
              <div className="row wrap gap-8">
                <button type="button" className="chip chip--square" aria-pressed={!later} onClick={() => { setLater(false); setSent(false); }}>
                  Enviar ahora
                </button>
                <button type="button" className="chip chip--square" aria-pressed={later} onClick={() => { setLater(true); setSent(false); }}>
                  Programar: mar 20 oct, 5:00 p. m.
                </button>
              </div>
            </fieldset>
          </div>

          <div className="row wrap between gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            {sent ? (
              <span role="status" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-ink)' }}>
                {later ? 'Aviso programado para el martes 20 de octubre, 5:00 p. m.' : `Aviso enviado a ${reach} personas.`}
              </span>
            ) : (
              <span className="text-sm muted">Las familias sin la app lo reciben por SMS.</span>
            )}
            <Button
              variant={urgent ? 'danger' : 'primary'}
              style={{ height: 48, padding: '0 22px' }}
              onClick={() => setSent(true)}
            >
              {later ? 'Programar aviso' : `Enviar a ${reach} personas`}
            </Button>
          </div>
        </section>

        <aside className="split__side stack gap-16">
          <div className="card card--night gap-10">
            <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7, color: 'var(--night-ink-3)' }}>
              Vista previa en el teléfono
            </span>
            <div className="notif" style={{ borderRadius: 18, padding: 14 }}>
              <div className="row gap-8">
                <span className="notif__app" style={{ background: t.color }} />
                <span className="notif__meta grow" style={{ fontWeight: 600 }}>
                  {t.label} · {SCHOOL_NAME}
                </span>
                <span className="notif__meta">ahora</span>
              </div>
              <span className="notif__title">{t.sample.title}</span>
              <span className="notif__body" style={{ fontSize: 14 }}>
                {t.sample.body}
              </span>
            </div>
          </div>

          <section aria-labelledby="auto-t" className="card gap-4">
            <h2 id="auto-t" style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              Avisos automáticos
            </h2>
            {AUTO_RULES.map((r) => (
              <SettingRow
                key={r.id}
                label={r.label}
                help={r.help}
                checked={rules[r.id]}
                onChange={(v) => setRules({ ...rules, [r.id]: v })}
              />
            ))}
          </section>
        </aside>
      </div>

      <section aria-labelledby="hist-t" className="card gap-10">
        <h2 id="hist-t" className="title-section">
          Enviados recientemente
        </h2>
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Aviso</th>
                <th>Tipo</th>
                <th>Para</th>
                <th>Enviado</th>
                <th>Leído</th>
              </tr>
            </thead>
            <tbody>
              {SENT_NOTICES.map((h) => (
                <tr key={h.title}>
                  <td className="strong">{h.title}</td>
                  <td>
                    <StatusBadge status={h.type} />
                  </td>
                  <td style={{ color: 'var(--ink-2)' }}>{h.to}</td>
                  <td className="muted">{h.when}</td>
                  <td>
                    <Meter percent={h.read} label={`${h.read}%`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
