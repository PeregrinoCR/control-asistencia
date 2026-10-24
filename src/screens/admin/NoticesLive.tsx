import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InputField, Segmented, SettingRow, StatusBadge, TextareaField, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { AUTO_RULES, NOTICE_TONE, NOTICE_TYPES, type NoticeType } from '../../data/notices';
import { ruleState } from '../../data/school';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';
import {
  AUDIENCE_LABEL,
  DEFAULT_TEMPLATES,
  NOTICE_COLUMNS,
  tomorrowAfternoon,
  toLocalInput,
  whenLabel,
  type Audience,
  type Notice,
  type NoticeTemplate,
  type Pending,
  type Reading,
} from '../../lib/avisos';

const toneVars = {
  blue: ['var(--blue)', 'var(--blue-bg)', 'var(--blue-ink)'],
  green: ['var(--green)', 'var(--green-bg)', 'var(--green-ink)'],
  orange: ['var(--orange)', 'var(--orange-bg)', 'var(--orange-ink)'],
  amber: ['var(--amber-ink)', 'var(--amber-bg)', 'var(--amber-ink)'],
} as const;

type Tab = 'redactar' | 'programados' | 'enviados' | 'plantillas';
type Filter = 'todos' | 'pendientes' | 'retirados';

/** Dirección · Avisos a familias: redactar, programar, dar seguimiento a la lectura y reutilizar plantillas. */
export function NoticesLive() {
  const { school, session } = useAuth();
  const [tab, setTab] = useState<Tab>('redactar');
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [reading, setReading] = useState<Map<string, Reading>>(new Map());
  const [templates, setTemplates] = useState<NoticeTemplate[]>(DEFAULT_TEMPLATES);
  const [rules, setRules] = useState(ruleState(AUTO_RULES));
  const [msg, setMsg] = useFlash();
  const [busy, setBusy] = useState(false);

  // Composer
  const [editing, setEditing] = useState<string | null>(null);
  const [type, setType] = useState<NoticeType>('info');
  const [audience, setAudience] = useState<Audience>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState(tomorrowAfternoon());

  // Sent list
  const [filter, setFilter] = useState<Filter>('todos');
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[] | null>(null);

  // Template editor
  const [tpl, setTpl] = useState<NoticeTemplate | null>(null);

  const load = useCallback(async () => {
    const db = supabase!;
    const [s, a, c] = await Promise.all([
      db.from('secciones').select('id, nombre'),
      db.from('avisos').select(NOTICE_COLUMNS).order('creado', { ascending: false }).limit(80),
      db.from('colegios').select('config').maybeSingle(),
    ]);
    setSections(ordenarSecciones(s.data));
    const rows = (a.data ?? []) as Notice[];
    setNotices(rows);
    const saved = c.data?.config?.avisosAutomaticos;
    if (saved) setRules({ ...ruleState(AUTO_RULES), ...saved });
    const tpls = c.data?.config?.plantillasAvisos as NoticeTemplate[] | undefined;
    if (tpls) setTemplates(tpls);
    const ids = rows.filter((n) => n.estado === 'enviado' || n.estado === 'retirado').map((n) => n.id);
    if (ids.length) {
      const { data } = await db.rpc('lectura_avisos', { ids });
      setReading(new Map(((data ?? []) as Array<{ aviso_id: string; total: number; leidos: number }>).map((r) => [r.aviso_id, { total: r.total, leidos: r.leidos }])));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async (patch: Record<string, unknown>) => {
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    return db.from('colegios').update({ config: { ...(data?.config ?? {}), ...patch } }).eq('id', school!.id);
  };

  const t = NOTICE_TYPES.find((x) => x.id === type)!;
  const urgent = type === 'urg' || type === 'sus';
  const programming = later && !urgent;

  const clearComposer = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    setType('info');
    setAudience('all');
    setPicked([]);
    setLater(false);
    setWhen(tomorrowAfternoon());
  };

  const fromNotice = (n: Notice, edit: boolean) => {
    setEditing(edit ? n.id : null);
    setType(n.tipo);
    setAudience(n.destino);
    setPicked(n.secciones);
    setTitle(n.titulo);
    setBody(n.cuerpo);
    setLater(edit && n.estado === 'programado');
    setWhen(n.programado_para ? toLocalInput(n.programado_para) : tomorrowAfternoon());
    setTab('redactar');
  };

  const useTemplate = (id: string) => {
    const p = templates.find((x) => x.id === id);
    if (!p) return;
    setType(p.tipo);
    setTitle(p.titulo);
    setBody(p.cuerpo);
  };

  const audienceText = audience === 'sec' ? 'las secciones ' + picked.map((id) => sections.find((x) => x.id === id)?.nombre).filter(Boolean).join(', ') : AUDIENCE_LABEL[audience].toLowerCase();

  /** Saves the composer as a draft, a scheduled notice or a notice sent right away. */
  const submit = async (as: 'borrador' | 'programado' | 'enviado') => {
    if (!title.trim() || !body.trim()) return setMsg({ ok: false, text: 'Escriba el título y el mensaje.' });
    if (audience === 'sec' && picked.length === 0) return setMsg({ ok: false, text: 'Elija al menos una sección.' });
    if (as === 'programado' && (!when || new Date(when).getTime() <= Date.now())) return setMsg({ ok: false, text: 'Elija una fecha y hora que todavía no hayan pasado.' });
    if (as === 'enviado' && !confirm(`Se enviará ahora a ${audienceText}. Una vez enviado no se puede editar, solo retirar. ¿Enviar?`)) return;
    setBusy(true);
    const db = supabase!;
    const row = {
      tipo: type,
      titulo: title.trim(),
      cuerpo: body.trim(),
      destino: audience,
      secciones: audience === 'sec' ? picked : [],
      estado: as,
      programado_para: as === 'programado' ? new Date(when).toISOString() : null,
    };
    let error;
    if (editing) ({ error } = await db.from('avisos').update(row).eq('id', editing));
    else {
      const { data: me } = await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle();
      ({ error } = await db.from('avisos').insert({ ...row, colegio_id: school!.id, enviado_por: me?.id ?? null }));
    }
    setBusy(false);
    if (error) return setMsg({ ok: false, text: 'No se guardó: ' + error.message });
    clearComposer();
    await load();
    if (as === 'enviado') {
      setMsg({ ok: true, text: 'Aviso enviado. Ya aparece en la app de las familias.' });
      setTab('enviados');
    } else if (as === 'programado') {
      setMsg({ ok: true, text: 'Aviso programado. Saldrá solo a la hora indicada.' });
      setTab('programados');
    } else {
      setMsg({ ok: true, text: 'Borrador guardado.' });
      setTab('programados');
    }
  };

  const sendNow = async (n: Notice) => {
    if (!confirm(`Se enviará ahora «${n.titulo}». ¿Enviar?`)) return;
    const { error } = await supabase!.from('avisos').update({ estado: 'enviado' }).eq('id', n.id);
    if (error) return setMsg({ ok: false, text: 'No se envió: ' + error.message });
    setMsg({ ok: true, text: 'Aviso enviado.' });
    load();
  };

  const discard = async (n: Notice) => {
    if (!confirm(`¿Eliminar «${n.titulo}»? No se puede deshacer.`)) return;
    const { error } = await supabase!.from('avisos').delete().eq('id', n.id);
    if (error) return setMsg({ ok: false, text: 'No se eliminó: ' + error.message });
    setMsg({ ok: true, text: 'Aviso eliminado.' });
    load();
  };

  const retire = async (n: Notice) => {
    const reason = prompt('Retirar este aviso lo oculta en la app de las familias. Las notificaciones que ya llegaron no se pueden recoger.\n\nMotivo (opcional):');
    if (reason === null) return;
    const { error } = await supabase!.from('avisos').update({ estado: 'retirado', motivo_retiro: reason.trim() || null }).eq('id', n.id);
    if (error) return setMsg({ ok: false, text: 'No se retiró: ' + error.message });
    setMsg({ ok: true, text: 'Aviso retirado. Puede copiarlo como nuevo y enviarlo corregido.' });
    setOpen(null);
    load();
  };

  const resend = async (n: Notice) => {
    const left = (reading.get(n.id)?.total ?? 0) - (reading.get(n.id)?.leidos ?? 0);
    if (!confirm(`Se reenviará como recordatorio a las ${left} personas que no lo han abierto. ¿Reenviar?`)) return;
    const { data, error } = await supabase!.rpc('reenviar_aviso', { aviso: n.id });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `Recordatorio enviado a ${data ?? 0} personas.` });
    load();
  };

  const toggle = async (n: Notice) => {
    if (open === n.id) return setOpen(null);
    setOpen(n.id);
    setPending(null);
    const { data } = await supabase!.rpc('pendientes_aviso', { aviso: n.id });
    setPending((data ?? []) as Pending[]);
  };

  const callList = (n: Notice) => {
    const rows = (pending ?? []).map((p) => [p.nombre, p.detalle, p.telefono ?? '', p.con_app ? 'Tiene cuenta' : 'Sin cuenta'].map((v) => `"${v.replace(/"/g, '""')}"`).join(','));
    const csv = ['Nombre,Encargado de,Teléfono,App', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `sin-abrir-${n.titulo.slice(0, 30).replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`;
    a.click();
  };

  const saveRule = async (id: string, on: boolean) => {
    const next = { ...rules, [id]: on };
    setRules(next);
    await saveConfig({ avisosAutomaticos: next });
  };

  const saveTemplates = async (next: NoticeTemplate[]) => {
    setTemplates(next);
    const { error } = await saveConfig({ plantillasAvisos: next });
    if (error) return setMsg({ ok: false, text: 'No se guardó: ' + error.message });
    setMsg({ ok: true, text: 'Plantillas guardadas.' });
  };

  const queued = (notices ?? []).filter((n) => n.estado === 'borrador' || n.estado === 'programado');
  const sent = useMemo(() => {
    const all = (notices ?? []).filter((n) => n.estado === 'enviado' || n.estado === 'retirado');
    const left = (n: Notice) => (reading.get(n.id)?.total ?? 0) - (reading.get(n.id)?.leidos ?? 0);
    if (filter === 'pendientes') return all.filter((n) => n.estado === 'enviado' && left(n) > 0);
    if (filter === 'retirados') return all.filter((n) => n.estado === 'retirado');
    return all;
  }, [notices, reading, filter]);

  const target = (n: Notice) =>
    n.destino === 'sec' ? 'Secciones ' + n.secciones.map((id) => sections.find((x) => x.id === id)?.nombre).filter(Boolean).join(', ') : AUDIENCE_LABEL[n.destino];

  return (
    <AdminLayout>
      <PageHeader kicker="Comunicados generales y avisos automáticos" title="Avisos a familias" />
      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      <Segmented
        mode="tabs"
        label="Secciones de la pantalla"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'redactar', label: editing ? 'Redactar · editando' : 'Redactar' },
          { value: 'programados', label: `Programados y borradores${queued.length ? ' · ' + queued.length : ''}` },
          { value: 'enviados', label: 'Enviados y lectura' },
          { value: 'plantillas', label: 'Plantillas y automáticos' },
        ]}
      />

      {tab === 'redactar' && (
        <div className="split">
          <section aria-labelledby="nuevo-t" className="card card--roomy split__main" style={{ gap: 18 }}>
            <div className="row wrap between gap-10">
              <h2 id="nuevo-t" style={{ fontSize: 20, fontWeight: 700 }}>
                {editing ? 'Editar aviso' : 'Nuevo aviso'}
              </h2>
              <div className="row gap-8">
                <label className="text-sm muted" htmlFor="a-tpl">
                  Empezar desde plantilla
                </label>
                <select id="a-tpl" className="input" style={{ height: 38, width: 'auto' }} value="" onChange={(e) => useTemplate(e.target.value)}>
                  <option value="">Elegir…</option>
                  {templates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {editing && (
              <p className="text-sm muted">
                Está editando un aviso que todavía no salió.{' '}
                <button type="button" className="link-button" onClick={clearComposer}>
                  Empezar uno nuevo
                </button>
              </p>
            )}

            <fieldset className="fieldset">
              <legend style={{ fontSize: 14 }}>Tipo de aviso</legend>
              <div className="row wrap gap-8">
                {NOTICE_TYPES.map((x) => {
                  const on = x.id === type;
                  const [line, bg, ink] = toneVars[NOTICE_TONE[x.id] as keyof typeof toneVars];
                  return (
                    <button key={x.id} type="button" className="chip" aria-pressed={on} style={on ? { background: bg, borderColor: line, color: ink } : undefined} onClick={() => setType(x.id)}>
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

            <div className="row wrap gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, alignItems: 'center' }}>
              {urgent ? (
                <span className="text-sm muted grow">Los avisos urgentes y de suspensión salen de inmediato; también por SMS si la línea está conectada.</span>
              ) : (
                <>
                  <Segmented
                    label="Cuándo sale"
                    value={later ? 'later' : 'now'}
                    onChange={(v) => setLater(v === 'later')}
                    options={[
                      { value: 'now', label: 'Enviar ahora' },
                      { value: 'later', label: 'Programar' },
                    ]}
                  />
                  {later ? (
                    <input id="a-cuando" type="datetime-local" className="input" aria-label="Fecha y hora de envío" style={{ height: 42, width: 'auto' }} value={when} onChange={(e) => setWhen(e.target.value)} />
                  ) : (
                    <span className="text-sm muted grow">Llega como notificación a quien la activó.</span>
                  )}
                  <span className="grow" />
                </>
              )}
              <Button variant="secondary" style={{ height: 46 }} disabled={busy} onClick={() => submit('borrador')}>
                Guardar borrador
              </Button>
              <Button variant={urgent ? 'danger' : 'primary'} style={{ height: 48, padding: '0 22px' }} disabled={busy} onClick={() => submit(programming ? 'programado' : 'enviado')}>
                {busy ? 'Guardando…' : programming ? 'Programar aviso' : 'Enviar aviso'}
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
                  <span className="notif__meta">{programming && when ? whenLabel(new Date(when).toISOString()) : 'ahora'}</span>
                </div>
                <span className="notif__title">{title || t.sample.title}</span>
                <span className="notif__body" style={{ fontSize: 14 }}>
                  {body || t.sample.body}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === 'programados' && (
        <section aria-labelledby="prog-t" className="card gap-10">
          <h2 id="prog-t" className="title-section">
            Programados y borradores
          </h2>
          {!notices ? (
            <p className="text-sm muted">Cargando…</p>
          ) : queued.length === 0 ? (
            <p className="text-sm muted">No hay avisos programados ni borradores. Redacte uno y elija «Programar» o «Guardar borrador».</p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Aviso</th>
                    <th>Tipo</th>
                    <th>Para</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {queued.map((n) => {
                    const x = NOTICE_TYPES.find((k) => k.id === n.tipo)!;
                    return (
                      <tr key={n.id}>
                        <td className="strong">{n.titulo}</td>
                        <td>
                          <StatusBadge status={{ label: x.label, tone: NOTICE_TONE[n.tipo] }} />
                        </td>
                        <td style={{ color: 'var(--ink-2)' }}>{target(n)}</td>
                        <td>{n.estado === 'programado' && n.programado_para ? <StatusBadge status={{ label: 'Sale ' + whenLabel(n.programado_para), tone: 'amber' }} /> : <StatusBadge status={{ label: 'Borrador', tone: 'neutral' }} />}</td>
                        <td>
                          <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
                            <Button size="sm" onClick={() => fromNotice(n, true)}>
                              Editar
                            </Button>
                            <Button size="sm" variant="primary" onClick={() => sendNow(n)}>
                              Enviar ya
                            </Button>
                            <Button size="sm" variant="ghost-danger" onClick={() => discard(n)}>
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'enviados' && (
        <section aria-labelledby="hist-t" className="card gap-10">
          <div className="row wrap between gap-10">
            <h2 id="hist-t" className="title-section">
              Enviados y lectura
            </h2>
            <Segmented
              label="Filtrar avisos"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'pendientes', label: 'Con pendientes de lectura' },
                { value: 'retirados', label: 'Retirados' },
              ]}
            />
          </div>
          {!notices ? (
            <p className="text-sm muted">Cargando…</p>
          ) : sent.length === 0 ? (
            <p className="text-sm muted">{filter === 'todos' ? 'Todavía no se ha enviado ningún aviso.' : 'No hay avisos con ese filtro.'}</p>
          ) : (
            <div className="stack gap-8">
              {sent.map((n) => {
                const x = NOTICE_TYPES.find((k) => k.id === n.tipo)!;
                const r = reading.get(n.id);
                const pct = r && r.total ? Math.round((r.leidos / r.total) * 100) : 0;
                const withdrawn = n.estado === 'retirado';
                const isOpen = open === n.id;
                return (
                  <div key={n.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: isOpen ? 'var(--bg)' : undefined }}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => !withdrawn && toggle(n)}
                      className="row wrap gap-12"
                      style={{ width: '100%', padding: '12px 14px', textAlign: 'left', background: 'none', border: 0, cursor: withdrawn ? 'default' : 'pointer', alignItems: 'center' }}
                    >
                      <span className="strong grow" style={{ minWidth: 200, textDecoration: withdrawn ? 'line-through' : undefined, color: withdrawn ? 'var(--muted-2)' : undefined }}>
                        {n.titulo}
                      </span>
                      <StatusBadge status={withdrawn ? { label: 'Retirado', tone: 'neutral' } : { label: x.label, tone: NOTICE_TONE[n.tipo] }} />
                      <span className="text-sm" style={{ color: 'var(--ink-2)', minWidth: 160 }}>
                        {target(n)}
                      </span>
                      <span className="text-sm muted" style={{ minWidth: 120 }}>
                        {n.enviado ? whenLabel(n.enviado) : ''}
                      </span>
                      <span style={{ minWidth: 170 }}>
                        {withdrawn ? (
                          <span className="text-sm muted">{n.motivo_retiro ?? 'Retirado'}</span>
                        ) : r ? (
                          <>
                            <span role="img" aria-label={`${pct} % lo abrió`} style={{ display: 'block', height: 8, borderRadius: 99, background: 'var(--neutral-bg)' }}>
                              <span style={{ display: 'block', width: pct + '%', height: 8, borderRadius: 99, background: 'var(--green)' }} />
                            </span>
                            <span className="text-sm muted">
                              {r.leidos} de {r.total} · {r.total - r.leidos} sin abrir
                            </span>
                          </>
                        ) : (
                          <span className="text-sm muted">—</span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="row wrap gap-16" style={{ padding: '4px 14px 16px', alignItems: 'flex-start' }}>
                        <div className="stack gap-6 grow" style={{ minWidth: 280 }}>
                          <strong>Sin abrir{pending ? ` (${pending.length})` : ''}</strong>
                          {!pending ? (
                            <p className="text-sm muted">Cargando…</p>
                          ) : pending.length === 0 ? (
                            <p className="text-sm muted">Todas las familias lo abrieron.</p>
                          ) : (
                            <div className="stack gap-6" style={{ maxHeight: 260, overflowY: 'auto' }}>
                              {pending.map((p, i) => (
                                <div key={i} className="row between gap-10" style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)' }}>
                                  <span>
                                    {p.nombre} <span className="muted">· {p.detalle}</span>
                                  </span>
                                  <span className="text-sm muted">{p.telefono ? p.telefono + (p.con_app ? '' : ' · sin app') : 'Sin teléfono'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="stack gap-8" style={{ width: 260 }}>
                          <Button variant="primary" disabled={!pending?.length} onClick={() => resend(n)}>
                            Reenviar a los que no lo abrieron
                          </Button>
                          <Button disabled={!pending?.length} onClick={() => callList(n)}>
                            Descargar lista para llamar
                          </Button>
                          <Button onClick={() => fromNotice(n, false)}>Copiar como nuevo</Button>
                          <Button variant="danger-outline" onClick={() => retire(n)}>
                            Retirar aviso
                          </Button>
                          {n.reenvios > 0 && n.ultimo_reenvio && (
                            <span className="text-sm muted">
                              Reenviado {n.reenvios} {n.reenvios === 1 ? 'vez' : 'veces'} · último {whenLabel(n.ultimo_reenvio)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-sm muted">«Abrió» cuenta a quien entró a la app y vio el aviso; quien solo recibió el SMS aparece como sin abrir.</p>
        </section>
      )}

      {tab === 'plantillas' && (
        <div className="split">
          <section aria-labelledby="tpl-t" className="card split__main gap-10">
            <div className="row wrap between gap-8">
              <h2 id="tpl-t" className="title-section">
                Plantillas
              </h2>
              <Button size="sm" onClick={() => setTpl({ id: crypto.randomUUID(), nombre: '', tipo: 'info', titulo: '', cuerpo: '' })}>
                Nueva plantilla
              </Button>
            </div>
            <p className="text-sm muted">Mensajes que se repiten. Lo que va entre [corchetes] se completa al usarlos.</p>
            {templates.map((p) => (
              <div key={p.id} className="row wrap between gap-10" style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                <div className="stack gap-4 grow" style={{ minWidth: 220 }}>
                  <span className="strong">{p.nombre}</span>
                  <span className="text-sm muted">{p.titulo}</span>
                </div>
                <div className="row gap-8">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      useTemplate(p.id);
                      setTab('redactar');
                    }}
                  >
                    Usar
                  </Button>
                  <Button size="sm" onClick={() => setTpl(p)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost-danger"
                    onClick={() => confirm(`¿Quitar la plantilla «${p.nombre}»?`) && saveTemplates(templates.filter((x) => x.id !== p.id))}
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            ))}
            {tpl && (
              <form
                className="stack gap-10"
                style={{ padding: 14, border: '1px dashed var(--border-dashed)', borderRadius: 'var(--radius-md)' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!tpl.nombre.trim() || !tpl.titulo.trim() || !tpl.cuerpo.trim()) return setMsg({ ok: false, text: 'Complete el nombre, el título y el mensaje de la plantilla.' });
                  const exists = templates.some((x) => x.id === tpl.id);
                  saveTemplates(exists ? templates.map((x) => (x.id === tpl.id ? tpl : x)) : [...templates, tpl]);
                  setTpl(null);
                }}
              >
                <InputField id="p-nombre" label="Nombre de la plantilla" value={tpl.nombre} onChange={(e) => setTpl({ ...tpl, nombre: e.target.value })} />
                <div className="row wrap gap-8">
                  {NOTICE_TYPES.map((x) => (
                    <button key={x.id} type="button" className="chip chip--sm" aria-pressed={tpl.tipo === x.id} onClick={() => setTpl({ ...tpl, tipo: x.id })}>
                      {x.label}
                    </button>
                  ))}
                </div>
                <InputField id="p-titulo" label="Título" value={tpl.titulo} onChange={(e) => setTpl({ ...tpl, titulo: e.target.value })} />
                <TextareaField id="p-cuerpo" rows={3} label="Mensaje" value={tpl.cuerpo} onChange={(e) => setTpl({ ...tpl, cuerpo: e.target.value })} />
                <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
                  <Button type="button" onClick={() => setTpl(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary">
                    Guardar plantilla
                  </Button>
                </div>
              </form>
            )}
          </section>

          <aside className="split__side">
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
      )}
    </AdminLayout>
  );
}
