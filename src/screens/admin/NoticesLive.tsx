import { useCallback, useEffect, useState } from 'react';
import { Button, InputField, SettingRow, StatusBadge, TextareaField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { AUTO_RULES, NOTICE_TONE, NOTICE_TYPES, type NoticeType } from '../../data/notices';
import { ruleState } from '../../data/school';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';

const toneVars = {
  blue: ['var(--blue)', 'var(--blue-bg)', 'var(--blue-ink)'],
  green: ['var(--green)', 'var(--green-bg)', 'var(--green-ink)'],
  orange: ['var(--orange)', 'var(--orange-bg)', 'var(--orange-ink)'],
  amber: ['var(--amber-ink)', 'var(--amber-bg)', 'var(--amber-ink)'],
} as const;

type Audience = 'all' | 'enc' | 'adu' | 'sec' | 'doc';

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'Todas las familias y estudiantes mayores',
  enc: 'Encargados de menores',
  adu: 'Estudiantes mayores de edad',
  sec: 'Secciones elegidas',
  doc: 'Solo personal del colegio',
};

interface Sent {
  id: string;
  title: string;
  type: NoticeType;
  to: string;
  when: string;
  read: number;
}

/** Dirección · Avisos a familias, saved for the families' app. */
export function NoticesLive() {
  const { school, session } = useAuth();
  const [type, setType] = useState<NoticeType>('info');
  const [audience, setAudience] = useState<Audience>('all');
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [rules, setRules] = useState(ruleState(AUTO_RULES));
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const db = supabase!;
    const [s, a, l, c] = await Promise.all([
      db.from('secciones').select('id, nombre').order('nombre'),
      db.from('avisos').select('id, tipo, titulo, destino, secciones, enviado').order('enviado', { ascending: false }).limit(20),
      db.from('aviso_lecturas').select('aviso_id'),
      db.from('colegios').select('config').maybeSingle(),
    ]);
    const secs = ordenarSecciones(s.data);
    setSections(secs);
    const reads = new Map<string, number>();
    (l.data ?? []).forEach((r) => reads.set(r.aviso_id, (reads.get(r.aviso_id) ?? 0) + 1));
    setSent(
      (a.data ?? []).map((r) => ({
        id: r.id,
        title: r.titulo,
        type: r.tipo,
        to:
          r.destino === 'sec'
            ? 'Secciones ' + (r.secciones as string[]).map((id) => secs.find((x) => x.id === id)?.nombre).filter(Boolean).join(', ')
            : AUDIENCE_LABEL[r.destino as Audience],
        when: new Date(r.enviado).toLocaleString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
        read: reads.get(r.id) ?? 0,
      })),
    );
    const saved = c.data?.config?.avisosAutomaticos;
    if (saved) setRules({ ...ruleState(AUTO_RULES), ...saved });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const t = NOTICE_TYPES.find((x) => x.id === type)!;
  const urgent = type === 'urg' || type === 'sus';

  const send = async () => {
    if (!title.trim() || !body.trim()) return setMsg({ ok: false, text: 'Escriba el título y el mensaje.' });
    if (audience === 'sec' && picked.length === 0) return setMsg({ ok: false, text: 'Elija al menos una sección.' });
    setBusy(true);
    const db = supabase!;
    const { data: me } = await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle();
    const { error } = await db.from('avisos').insert({
      colegio_id: school!.id,
      tipo: type,
      titulo: title.trim(),
      cuerpo: body.trim(),
      destino: audience,
      secciones: audience === 'sec' ? picked : [],
      enviado_por: me?.id ?? null,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: 'No se envió: ' + error.message });
    setTitle('');
    setBody('');
    setMsg({ ok: true, text: 'Aviso publicado. Ya aparece en la app de las familias.' });
    load();
  };

  const saveRule = async (id: string, on: boolean) => {
    const next = { ...rules, [id]: on };
    setRules(next);
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    await db.from('colegios').update({ config: { ...(data?.config ?? {}), avisosAutomaticos: next } }).eq('id', school!.id);
  };

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
                    onClick={() => setType(x.id)}
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
              {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                <button key={a} type="button" className="chip" aria-pressed={audience === a} onClick={() => setAudience(a)}>
                  {AUDIENCE_LABEL[a]}
                </button>
              ))}
            </div>
            {audience === 'sec' && (
              <div className="row wrap gap-8" style={{ marginTop: 10 }}>
                {sections.map((s) => {
                  const on = picked.includes(s.id);
                  return (
                    <button key={s.id} type="button" className="chip chip--sm" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}>
                      {s.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <InputField
            id="a-titulo"
            label={<span style={{ fontSize: 14 }}>Título</span>}
            placeholder={t.sample.title}
            style={{ height: 46, borderRadius: 'var(--radius-md)', padding: '0 14px' }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextareaField
            id="a-msg"
            rows={4}
            label={<span style={{ fontSize: 14 }}>Mensaje</span>}
            placeholder={t.sample.body}
            style={{ borderRadius: 'var(--radius-md)', padding: '12px 14px' }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="row wrap between gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            {msg ? (
              <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
                {msg.text}
              </span>
            ) : (
              <span className="text-sm muted">Llega como notificación a quien la activó; urgentes y suspensiones también por SMS si la línea está conectada.</span>
            )}
            <Button variant={urgent ? 'danger' : 'primary'} style={{ height: 48, padding: '0 22px' }} disabled={busy} onClick={send}>
              {busy ? 'Enviando…' : 'Publicar aviso'}
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
                  {t.label} · {school?.nombre}
                </span>
                <span className="notif__meta">ahora</span>
              </div>
              <span className="notif__title">{title || t.sample.title}</span>
              <span className="notif__body" style={{ fontSize: 14 }}>
                {body || t.sample.body}
              </span>
            </div>
          </div>

          <section aria-labelledby="auto-t" className="card gap-4">
            <h2 id="auto-t" style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
              Avisos automáticos
            </h2>
            {AUTO_RULES.filter((r) => r.id !== 'three' && r.id !== 'arr').map((r) => (
              <SettingRow
                key={r.id}
                label={r.label}
                help={r.id === 'sms' ? 'Si la notificación no llega (sin app o sin activarlas)' : r.help}
                checked={rules[r.id]}
                onChange={(v) => saveRule(r.id, v)}
              />
            ))}
          </section>
        </aside>
      </div>

      <section aria-labelledby="hist-t" className="card gap-10">
        <h2 id="hist-t" className="title-section">
          Enviados recientemente
        </h2>
        {!sent ? (
          <p className="text-sm muted">Cargando…</p>
        ) : sent.length === 0 ? (
          <p className="text-sm muted">Todavía no se ha enviado ningún aviso.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th>Aviso</th>
                  <th>Tipo</th>
                  <th>Para</th>
                  <th>Enviado</th>
                  <th className="num">Lo abrieron</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((h) => {
                  const x = NOTICE_TYPES.find((n) => n.id === h.type)!;
                  return (
                    <tr key={h.id}>
                      <td className="strong">{h.title}</td>
                      <td>
                        <StatusBadge status={{ label: x.label, tone: NOTICE_TONE[h.type] }} />
                      </td>
                      <td style={{ color: 'var(--ink-2)' }}>{h.to}</td>
                      <td className="muted">{h.when}</td>
                      <td className="num strong">{h.read}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
