import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Icon, Segmented, StatusBadge, Switch, TextareaField, InputField, useFlash, Skeleton } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { CRITERIA, RISK, criteriaFor, thresholdsOf } from '../../data/earlyWarning';
import { ruleState } from '../../data/school';
import { useAuth } from '../../lib/auth';
import { STALE_DAYS, loadAlerta, type Case, type Note } from '../../lib/alerta';
import { supabase } from '../../lib/supabase';

type Tab = 'porhacer' | 'enmarcha' | 'cerrados';

const NOTE_LABEL: Record<Note['kind'], string> = { contacto: 'Contacto', plan: 'Plan', nota: 'Nota', cerrado: 'Caso cerrado' };


/** Dirección · Alerta temprana, computed from the real roll calls; each case has a person in charge, steps and the family's contacts. */
export function EarlyWarningLive() {
  const { school, session } = useAuth();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [staff, setStaff] = useState<Array<{ id: string; nombre: string }>>([]);
  const [me, setMe] = useState<string | null>(null);
  const [criteria, setCriteria] = useState(ruleState(CRITERIA));
  const [t, setT] = useState(thresholdsOf(undefined));
  const [tab, setTab] = useState<Tab>('porhacer');
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');
  const [msg, setMsg] = useFlash();

  const load = useCallback(async () => {
    const d = await loadAlerta(session?.user.id);
    setT(d.t);
    setCriteria(d.criteria);
    setStaff(d.staff);
    setMe(d.me);
    setWarn(d.warn);
    if (d.error) return setError(d.error);
    setError('');
    setCases(d.cases);
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (id: string, change: Partial<Case>) => setCases((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, ...change } : c)));

  const addNote = async (studentId: string, kind: Note['kind'], text: string) => {
    const db = supabase!;
    const { error } = await db.from('seguimientos').insert({ estudiante_id: studentId, tipo: kind, texto: text, por: me });
    if (error) return error.message;
    await load();
    return '';
  };

  const assign = async (c: Case, owner: string | null) => {
    const { error } = await supabase!.from('casos_alerta').upsert({ estudiante_id: c.id, responsable: owner }, { onConflict: 'estudiante_id' });
    if (error) return setMsg({ ok: false, text: 'No se guardó: ' + error.message });
    patch(c.id, { owner });
  };

  const tick = async (c: Case, i: number) => {
    const steps = c.steps.map((s, k) => (k === i ? { ...s, done: !s.done } : s));
    const { error } = await supabase!.from('casos_alerta').upsert({ estudiante_id: c.id, pasos: steps }, { onConflict: 'estudiante_id' });
    if (error) return setMsg({ ok: false, text: 'No se guardó: ' + error.message });
    patch(c.id, { steps });
  };

  const takeCase = async (c: Case) => {
    if (!me) return setMsg({ ok: false, text: 'Su cuenta no está en la lista del personal.' });
    await assign(c, me);
    setOpenId(c.id);
  };

  const closeCase = async (c: Case) => {
    if (!confirm(`¿Cerrar el caso de ${c.name}? Se reabre solo si vuelve a faltar sin justificar.`)) return;
    const err = await addNote(c.id, 'cerrado', 'Volvió a asistir con regularidad');
    setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Caso cerrado.' });
  };

  const notifyFamily = async (c: Case, title: string, body: string) => {
    const { data, error } = await supabase!.rpc('avisar_familia', { estudiante: c.id, titulo_: title, cuerpo_: body });
    if (error) return error.message;
    setMsg({ ok: true, text: `Aviso enviado a ${data ?? 0} ${data === 1 ? 'persona' : 'personas'} de la familia.` });
    await load();
    return '';
  };

  const saveCriteria = async (id: string, on: boolean) => {
    const next = { ...criteria, [id]: on };
    setCriteria(next);
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    await db.from('colegios').update({ config: { ...(data?.config ?? {}), criteriosAlerta: next } }).eq('id', school!.id);
    load();
  };

  const all = cases ?? [];
  const ownerName = (id: string | null) => staff.find((p) => p.id === id)?.nombre ?? '';
  const action = (c: Case): 'assign' | 'close' | 'contact' | 'view' => (!c.owner ? 'assign' : c.ready ? 'close' : c.stale ? 'contact' : 'view');
  const open = all.filter((c) => !c.closed);
  const todo = open.filter((c) => !c.owner || c.stale || c.ready);
  const rolling = open.filter((c) => c.owner && !c.stale && !c.ready);
  const closedList = all.filter((c) => c.closed);
  const shown = useMemo(() => {
    const base = tab === 'porhacer' ? todo : tab === 'enmarcha' ? rolling : closedList;
    return mine === 'mine' && me ? base.filter((c) => c.owner === me) : base;
  }, [tab, todo, rolling, closedList, mine, me]);

  const exportForSaber = () => {
    const header = ['Estudiante', 'Sección', 'Edad', 'Nivel de riesgo', 'Ausencias injustificadas', 'Ausencias consecutivas', 'Tardías', 'Motivos', 'Responsable', 'Pasos hechos', 'Último seguimiento'];
    const rows = all.map((c) => [
      c.name, c.section, c.age ?? '', RISK[c.level].label, c.unexcused, c.consecutive, c.lates, c.reasons.join('; '),
      ownerName(c.owner), `${c.steps.filter((s) => s.done).length} de ${c.steps.length}`,
      c.notes[0] ? `${NOTE_LABEL[c.notes[0].kind]}: ${c.notes[0].text}` : 'Sin contactar',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alerta-temprana-saber.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const noOwner = open.filter((c) => !c.owner).length;
  const staleOwned = open.filter((c) => c.owner && c.stale && !c.ready).length;
  const readyCount = open.filter((c) => c.owner && c.ready).length;

  return (
    <AdminLayout>
      <PageHeader
        kicker={`Seguimiento de estudiantes en riesgo de exclusión · últimas ${t.sem} semanas`}
        title="Alerta temprana"
        actions={
          <>
            <Button regular onClick={() => document.getElementById('crit-t')?.scrollIntoView({ behavior: 'smooth' })}>
              Criterios
            </Button>
            <Button regular onClick={exportForSaber} disabled={!all.length}>
              Exportar para SABER
            </Button>
          </>
        }
      />

      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
      {warn && (
        <p className="notice" role="alert">
          {warn}
        </p>
      )}

      {error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {error}
        </p>
      ) : !cases ? (
        <Skeleton count={4} />
      ) : (
        <>
          <section aria-label="Resumen de la semana" className="card card--night row wrap gap-16" style={{ alignItems: 'center', padding: '16px 20px' }}>
            <div className="stack gap-2 grow">
              <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.7, color: 'var(--night-ink-3)' }}>
                Esta semana
              </span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{todo.length === 0 ? 'Ningún caso necesita una acción' : `${todo.length} ${todo.length === 1 ? 'caso necesita' : 'casos necesitan'} una acción`}</span>
            </div>
            <div className="row gap-16" style={{ fontSize: 13, color: 'var(--night-ink-2)' }}>
              <span>
                <strong style={{ fontSize: 20, display: 'block', color: 'var(--night-ink)' }}>{noOwner}</strong>sin responsable
              </span>
              <span>
                <strong style={{ fontSize: 20, display: 'block', color: 'var(--night-ink)' }}>{staleOwned}</strong>sin contacto en {STALE_DAYS} días
              </span>
              <span>
                <strong style={{ fontSize: 20, display: 'block', color: 'var(--night-ink)' }}>{readyCount}</strong>listos para cerrar
              </span>
            </div>
          </section>

          <div className="row wrap between gap-10">
            <Segmented
              mode="tabs"
              label="Estado de los casos"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'porhacer', label: `Por hacer · ${todo.length}` },
                { value: 'enmarcha', label: `En marcha · ${rolling.length}` },
                { value: 'cerrados', label: `Cerrados · ${closedList.length}` },
              ]}
            />
            <Segmented
              label="Casos que se muestran"
              value={mine}
              onChange={setMine}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'mine', label: 'Solo los míos' },
              ]}
            />
          </div>

          {shown.length === 0 ? (
            <p className="card text-sm muted">
              {all.length === 0
                ? `Ningún estudiante cumple los criterios de alerta en las últimas ${t.sem} semanas.`
                : tab === 'porhacer'
                  ? 'No hay casos pendientes de acción. Revise la pestaña «En marcha».'
                  : tab === 'enmarcha'
                    ? 'No hay casos en marcha.'
                    : 'Todavía no hay casos cerrados en este periodo.'}
            </p>
          ) : (
            <div className="stack gap-10">
              {shown.map((c) => (
                <CaseRow
                  key={c.id}
                  c={c}
                  tab={tab}
                  opened={openId === c.id}
                  ownerName={ownerName(c.owner)}
                  staff={staff}
                  action={action(c)}
                  onToggle={() => setOpenId(openId === c.id ? null : c.id)}
                  onTake={() => takeCase(c)}
                  onClose={() => closeCase(c)}
                  onAssign={(o) => assign(c, o)}
                  onTick={(i) => tick(c, i)}
                  onNote={addNote}
                  onNotify={notifyFamily}
                />
              ))}
            </div>
          )}

          <section aria-labelledby="crit-t" className="card">
            <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
              <h2 id="crit-t" className="title-section">
                Criterios que activan la alerta
              </h2>
              <span className="text-sm muted">Los números se cambian en Configuración › Institución.</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
              {criteriaFor(t).map((c) => (
                <div key={c.id} className="row gap-10" style={{ border: `1.5px solid ${criteria[c.id] ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <span className="stack grow">
                    <span className="setting-row__label">{c.label}</span>
                    <span className="setting-row__help">{c.help}</span>
                  </span>
                  <Switch label={c.label} checked={criteria[c.id]} onChange={(v) => saveCriteria(c.id, v)} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}

interface RowProps {
  c: Case;
  tab: Tab;
  opened: boolean;
  ownerName: string;
  staff: Array<{ id: string; nombre: string }>;
  action: 'assign' | 'close' | 'contact' | 'view';
  onToggle: () => void;
  onTake: () => void;
  onClose: () => void;
  onAssign: (owner: string | null) => void;
  onTick: (i: number) => void;
  onNote: (id: string, kind: Note['kind'], text: string) => Promise<string>;
  onNotify: (c: Case, title: string, body: string) => Promise<string>;
}

/** One case: the row with its next action, and the full detail when opened. */
function CaseRow({ c, tab, opened, ownerName, staff, action, onToggle, onTake, onClose, onAssign, onTick, onNote, onNotify }: RowProps) {
  const risk = RISK[c.level];
  const done = c.steps.filter((s) => s.done).length;
  const recent = c.strip.slice(-10).split('');
  const why = c.reasons[0] + (c.reasons.length > 1 ? ` · +${c.reasons.length - 1} más` : '');
  const phone = c.contacts.find((x) => x.phone)?.phone;
  return (
    <article className="card" style={{ padding: 0, border: !c.owner && tab === 'porhacer' ? '1px solid var(--orange-line)' : undefined }}>
      <div className="row wrap gap-16" style={{ padding: '14px 18px', alignItems: 'center' }}>
        <div className="stack gap-2" style={{ flex: '1 1 220px', minWidth: 0 }}>
          <span className="row gap-8" style={{ alignItems: 'center' }}>
            <strong style={{ fontSize: 16 }}>{c.name}</strong>
            <StatusBadge status={risk} />
          </span>
          <span className="text-sm muted">
            {c.section}
            {c.age !== null && ` · ${c.age} años`}
            {phone && ` · ${phone}`}
          </span>
        </div>
        <div className="stack gap-6" style={{ flex: '2 1 260px', minWidth: 0 }}>
          <div className="strip" role="img" aria-label={`Últimos 10 días lectivos: ${recent.filter((m) => m === 'A').length} ausencias sin justificar`} style={{ gridTemplateColumns: 'repeat(10, 12px)' }}>
            {recent.map((m, i) => (
              <span key={i} data-k={m} style={{ height: 16 }} />
            ))}
          </div>
          <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {why}
          </span>
        </div>
        <div className="stack gap-6" style={{ flex: '1.3 1 230px', minWidth: 0 }}>
          {tab === 'cerrados' ? (
            <>
              <span className="text-sm strong">Cerrado el {c.closedOn}</span>
              <Button size="sm" onClick={onToggle}>
                {opened ? 'Ocultar bitácora' : 'Ver bitácora'}
              </Button>
            </>
          ) : (
            <>
              {action === 'assign' && (
                <Button variant="primary" onClick={onTake}>
                  Asignarme y empezar
                </Button>
              )}
              {action === 'close' && (
                <Button className="btn--ink-green" onClick={onClose}>
                  Cerrar caso
                </Button>
              )}
              {action === 'contact' && (
                <Button variant="dark" onClick={onToggle}>
                  Registrar contacto
                </Button>
              )}
              <span className="text-xs" style={{ textAlign: 'center', fontWeight: 600, color: c.owner ? 'var(--muted)' : 'var(--orange-ink)' }}>
                {c.owner ? `${ownerName || 'Responsable'} · ${done} de ${c.steps.length} pasos${c.ready ? ' · listo para cerrar' : c.stale ? ` · sin contacto en ${STALE_DAYS} días` : ''}` : 'Sin responsable'}
              </span>
              {action !== 'contact' && (
                <button type="button" className="link-button text-sm" onClick={onToggle}>
                  {opened ? 'Ocultar caso' : 'Ver caso'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {opened && <CaseDetail c={c} staff={staff} readOnly={tab === 'cerrados'} onAssign={onAssign} onTick={onTick} onNote={onNote} onNotify={onNotify} />}
    </article>
  );
}

interface DetailProps {
  c: Case;
  staff: Array<{ id: string; nombre: string }>;
  readOnly: boolean;
  onAssign: (owner: string | null) => void;
  onTick: (i: number) => void;
  onNote: (id: string, kind: Note['kind'], text: string) => Promise<string>;
  onNotify: (c: Case, title: string, body: string) => Promise<string>;
}

function CaseDetail({ c, staff, readOnly, onAssign, onTick, onNote, onNotify }: DetailProps) {
  const [kind, setKind] = useState<Note['kind'] | null>(null);
  const [text, setText] = useState('');
  const [noteError, setNoteError] = useState('');
  const first = c.name.split(' ')[0];
  const [mail, setMail] = useState(false);
  const [title, setTitle] = useState(`Seguimiento de asistencia de ${first}`);
  const [body, setBody] = useState(`Hemos notado ausencias recientes de ${first}. Le pedimos comunicarse con el colegio para ver cómo le podemos ayudar.`);
  const [mailError, setMailError] = useState('');
  const [busy, setBusy] = useState(false);
  const marks = c.strip.split('');
  const count = (k: string) => marks.filter((m) => m === k).length;

  const saveNote = async () => {
    if (!kind) return;
    const value = text.trim() || (kind === 'cerrado' ? 'Volvió a asistir con regularidad' : '');
    if (!value) return setNoteError('Escriba un detalle.');
    const err = await onNote(c.id, kind, value);
    setNoteError(err);
    if (!err) {
      setKind(null);
      setText('');
    }
  };

  const send = async () => {
    if (!confirm(`Se enviará este aviso solo a la familia de ${first}. ¿Enviar?`)) return;
    setBusy(true);
    const err = await onNotify(c, title, body);
    setBusy(false);
    setMailError(err);
    if (!err) setMail(false);
  };

  return (
    <div className="row wrap gap-20" style={{ padding: '4px 18px 18px', alignItems: 'flex-start', borderTop: '1px solid var(--border-soft)' }}>
      <div className="stack gap-14" style={{ flex: '1 1 340px', minWidth: 0, paddingTop: 14 }}>
        <div className="stack gap-6">
          <h3 className="eyebrow">Por qué está en alerta</h3>
          {c.reasons.map((r) => (
            <div key={r} className="row gap-8" style={{ alignItems: 'flex-start', fontSize: 14, lineHeight: 1.4 }}>
              <Icon name="alert" size={16} strokeWidth={2.4} style={{ color: 'var(--orange)', marginTop: 2, flexShrink: 0 }} />
              <span>{r}</span>
            </div>
          ))}
        </div>
        <div className="stack gap-6">
          <div className="strip" role="img" aria-label={`Días lectivos revisados: ${count('A')} ausencias sin justificar y ${count('T')} tardías`} style={{ gridTemplateColumns: `repeat(${marks.length}, minmax(0, 1fr))` }}>
            {marks.map((m, i) => (
              <span key={i} data-k={m} />
            ))}
          </div>
          <span className="text-xs muted">Azul: sin novedad · ámbar: tarde · naranja: ausente sin justificar · gris: justificada. Guía: {c.guide}</span>
        </div>
        {!readOnly && (
          <>
            <label className="stack gap-4 text-sm" htmlFor={`own-${c.id}`}>
              <span className="muted">Responsable</span>
              <select id={`own-${c.id}`} className="input" style={{ height: 40 }} value={c.owner ?? ''} onChange={(e) => onAssign(e.target.value || null)}>
                <option value="">Sin responsable</option>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="fieldset">
              <legend style={{ fontSize: 14 }}>Pasos</legend>
              <div className="stack gap-6">
                {c.steps.map((s, i) => (
                  <label key={s.label} className="row gap-8 text-sm" style={{ alignItems: 'center', minHeight: 32 }}>
                    <input type="checkbox" checked={s.done} onChange={() => onTick(i)} />
                    <span style={{ textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--muted-2)' : undefined }}>{s.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
      </div>

      <div className="stack gap-14" style={{ flex: '1 1 340px', minWidth: 0, paddingTop: 14 }}>
        {!readOnly && (
          <div className="stack gap-8" style={{ background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
            <h3 className="eyebrow">Familia</h3>
            {c.contacts.length === 0 ? (
              <span className="text-sm muted">No hay encargados registrados para este estudiante.</span>
            ) : (
              c.contacts.map((g, i) => (
                <div key={i} className="row between gap-10 text-sm">
                  <span>
                    <strong>{g.name}</strong> <span className="muted">· {g.relation}</span>
                  </span>
                  <span className="muted">{g.phone ? g.phone + (g.app ? '' : ' · sin app') : 'Sin teléfono'}</span>
                </div>
              ))
            )}
            {mail ? (
              <div className="stack gap-8">
                <InputField id={`am-t-${c.id}`} label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
                <TextareaField id={`am-b-${c.id}`} rows={3} label="Mensaje" value={body} onChange={(e) => setBody(e.target.value)} />
                {mailError && (
                  <span className="text-sm ink-orange" role="alert">
                    {mailError}
                  </span>
                )}
                <div className="grid-2">
                  <Button onClick={() => setMail(false)}>Cancelar</Button>
                  <Button variant="primary" disabled={busy} onClick={send}>
                    {busy ? 'Enviando…' : 'Enviar a esta familia'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="primary" disabled={c.contacts.length === 0} onClick={() => setMail(true)}>
                Enviar aviso a esta familia
              </Button>
            )}
          </div>
        )}

        <div className="stack">
          <h3 className="eyebrow" style={{ marginBottom: 6 }}>
            Bitácora de seguimiento
          </h3>
          {c.notes.length === 0 && <span className="text-sm muted">Todavía nadie ha registrado seguimiento.</span>}
          {c.notes.map((g, i) => (
            <div key={i} className="row gap-10" style={{ alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}>
              <span className="text-xs muted" style={{ width: 54, flexShrink: 0, fontWeight: 600 }}>
                {g.when}
              </span>
              <span className="stack" style={{ fontSize: 14 }}>
                <span className="strong">
                  {NOTE_LABEL[g.kind]}
                  {g.by && <span className="muted" style={{ fontWeight: 400 }}> · {g.by}</span>}
                </span>
                <span style={{ color: 'var(--ink-2)' }}>{g.text}</span>
              </span>
            </div>
          ))}
        </div>

        {!readOnly &&
          (kind ? (
            <div className="stack gap-8">
              <TextareaField
                id={`ew-texto-${c.id}`}
                rows={3}
                label={NOTE_LABEL[kind]}
                placeholder={kind === 'contacto' ? 'Ej.: Llamada a la madre; dice que trabaja de noche.' : kind === 'plan' ? 'Ej.: Reunión con la familia el jueves.' : kind === 'cerrado' ? 'Volvió a asistir con regularidad' : ''}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {noteError && (
                <span className="text-sm ink-orange" role="alert">
                  {noteError}
                </span>
              )}
              <div className="grid-2">
                <Button onClick={() => setKind(null)}>Cancelar</Button>
                <Button variant="primary" onClick={saveNote}>
                  Guardar
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid-2">
              <Button variant="dark" style={{ fontSize: 14 }} onClick={() => setKind('contacto')}>
                Registrar contacto
              </Button>
              <Button style={{ fontSize: 14 }} onClick={() => setKind('plan')}>
                Agregar al plan
              </Button>
              <Button style={{ fontSize: 14 }} onClick={() => setKind('nota')}>
                Nota
              </Button>
              <Button className="btn--ink-green" style={{ fontSize: 14 }} onClick={() => setKind('cerrado')}>
                Cerrar caso
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
}

