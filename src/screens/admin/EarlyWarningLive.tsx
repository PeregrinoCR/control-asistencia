import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Icon, Segmented, Stat, StatusBadge, Switch, TextareaField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { CRITERIA, RISK, type RiskLevel } from '../../data/earlyWarning';
import { ruleState } from '../../data/school';
import { useAuth } from '../../lib/auth';
import { fetchAll } from '../../lib/fetchAll';
import { localDate } from '../../lib/schedule';
import { ageOn } from '../../lib/students';
import { supabase } from '../../lib/supabase';

/** Criteria the app can check today; the rest are saved for later. */
const COMPUTED = new Set(['a', 'b', 'c']);

interface Note {
  kind: 'contacto' | 'plan' | 'nota' | 'cerrado';
  text: string;
  by: string;
  when: string;
}

interface Case {
  id: string;
  name: string;
  section: string;
  age: number | null;
  guide: string;
  level: RiskLevel;
  unexcused: number;
  consecutive: number;
  lates: number;
  reasons: string[];
  strip: string;
  notes: Note[];
}

const NOTE_LABEL: Record<Note['kind'], string> = { contacto: 'Contacto', plan: 'Plan', nota: 'Nota', cerrado: 'Caso cerrado' };

/** The last `n` weekdays up to today, oldest first. */
function schoolDays(n: number) {
  const out: string[] = [];
  for (const d = new Date(); out.length < n; d.setDate(d.getDate() - 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.unshift(localDate(d));
  }
  return out;
}

/** Dirección · Alerta temprana, computed from the real roll calls of the last four weeks. */
export function EarlyWarningLive() {
  const { school, session } = useAuth();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [closed, setClosed] = useState(0);
  const [criteria, setCriteria] = useState(ruleState(CRITERIA));
  const [filter, setFilter] = useState<'all' | RiskLevel>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const db = supabase!;
    const days = schoolDays(20);
    const from = days[0];
    const marks = fetchAll<{ estudiante_id: string; fecha: string; marca: string }>((a, b) =>
      db.from('asistencia').select('estudiante_id, fecha, marca').gte('fecha', from).in('marca', ['A', 'T', 'J']).range(a, b),
    ).then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e }));
    const [c, att, js, st, notes, staff, secs] = await Promise.all([
      db.from('colegios').select('config').maybeSingle(),
      marks,
      db.from('justificaciones').select('estudiante_id, desde, hasta').eq('estado', 'a').gte('hasta', from),
      db.from('estudiantes').select('id, nombre, nacimiento, seccion_id').eq('activo', true),
      db.from('seguimientos').select('estudiante_id, tipo, texto, cuando, personal(nombre)').order('cuando', { ascending: false }),
      db.from('personal').select('nombre, seccion_guia').not('seccion_guia', 'is', null),
      db.from('secciones').select('id, nombre'),
    ]);
    const err = att.error ?? st.error ?? notes.error;
    if (err) return setError(err.message);
    const crit = { ...ruleState(CRITERIA), ...(c.data?.config?.criteriosAlerta ?? {}) };
    setCriteria(crit);

    const justified = (id: string, d: string) => (js.data ?? []).some((j) => j.estudiante_id === id && j.desde <= d && d <= j.hasta);
    const secName = new Map((secs.data ?? []).map((s) => [s.id, s.nombre]));
    const guide = new Map((staff.data ?? []).map((p) => [p.seccion_guia, p.nombre]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notesOf = (id: string) => ((notes.data ?? []) as any[]).filter((n) => n.estudiante_id === id);
    let closedCount = 0;

    const list: Case[] = [];
    for (const s of st.data ?? []) {
      const mine = (att.data ?? []).filter((a) => a.estudiante_id === s.id);
      if (!mine.length) continue;
      const strip = days.map((d) => {
        const m = mine.filter((a) => a.fecha === d);
        if (m.some((a) => a.marca === 'A')) return justified(s.id, d) ? 'J' : 'A';
        // Every absence that day was justified by its teacher.
        if (m.some((a) => a.marca === 'J')) return 'J';
        return m.length ? 'T' : 'P';
      });
      const unexcused = strip.filter((k) => k === 'A').length;
      const lates = strip.filter((k) => k === 'T').length;
      let consecutive = 0;
      let run = 0;
      strip.forEach((k) => {
        run = k === 'A' ? run + 1 : 0;
        consecutive = Math.max(consecutive, run);
      });
      const reasons: string[] = [];
      let level: RiskLevel | null = null;
      if (crit.b && consecutive >= 2) {
        reasons.push(`${consecutive} ausencias consecutivas sin justificar`);
        level = consecutive >= 3 ? 'a' : 'm';
      }
      if (crit.a && unexcused >= 3) {
        reasons.push(`${unexcused} ausencias sin justificar en 4 semanas`);
        level = level === 'a' ? 'a' : 'm';
      }
      if (crit.c && lates >= 5) {
        reasons.push(`${lates} días con llegada tardía en 4 semanas`);
        level = level ?? 'b';
      }
      if (!level) continue;
      const ns = notesOf(s.id);
      // A closed case stays closed unless there are new unexcused absences after it.
      const lastClose = ns.find((n) => n.tipo === 'cerrado');
      const lastAbsence = days.filter((_, i) => strip[i] === 'A').pop();
      if (lastClose && (!lastAbsence || lastAbsence <= localDate(new Date(lastClose.cuando)))) {
        closedCount++;
        continue;
      }
      list.push({
        id: s.id,
        name: s.nombre,
        section: secName.get(s.seccion_id) ?? '—',
        age: ageOn(s.nacimiento),
        guide: guide.get(s.seccion_id) ?? '—',
        level,
        unexcused,
        consecutive,
        lates,
        reasons,
        strip: strip.join(''),
        notes: ns.map((n) => ({
          kind: n.tipo,
          text: n.texto,
          by: n.personal?.nombre ?? '',
          when: new Date(n.cuando).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }),
        })),
      });
    }
    const order = { a: 0, m: 1, b: 2 };
    list.sort((x, y) => order[x.level] - order[y.level] || y.unexcused - x.unexcused);
    setCases(list);
    setClosed(closedCount);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async (studentId: string, kind: Note['kind'], text: string) => {
    const db = supabase!;
    const { data: me } = await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle();
    const { error } = await db.from('seguimientos').insert({ estudiante_id: studentId, tipo: kind, texto: text, por: me?.id ?? null });
    if (error) return error.message;
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
  const list = all.filter((c) => filter === 'all' || c.level === filter);
  const d = list.find((c) => c.id === selectedId) ?? list[0];
  const n = (l: RiskLevel) => all.filter((c) => c.level === l).length;
  const status = (c: Case) => (c.notes[0] ? `${NOTE_LABEL[c.notes[0].kind]}: ${c.notes[0].text}` : 'Sin contactar');

  const exportForSaber = () => {
    const header = ['Estudiante', 'Sección', 'Edad', 'Nivel de riesgo', 'Ausencias injustificadas (4 semanas)', 'Ausencias consecutivas', 'Tardías', 'Motivos', 'Último seguimiento'];
    const rows = all.map((c) => [c.name, c.section, c.age ?? '', RISK[c.level].label, c.unexcused, c.consecutive, c.lates, c.reasons.join('; '), status(c)]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alerta-temprana-saber.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <PageHeader
        kicker="Seguimiento de estudiantes en riesgo de exclusión · últimas 4 semanas"
        title="Alerta temprana"
        actions={
          <Button regular onClick={exportForSaber} disabled={!all.length}>
            Exportar para SABER
          </Button>
        }
      />

      {error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {error}
        </p>
      ) : !cases ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <>
          <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <Stat compact label="En alerta" value={String(all.length)} />
            <Stat compact label="Riesgo alto" value={String(n('a'))} ink="orange" note="Requieren acción esta semana" />
            <Stat compact label="Sin contactar" value={String(all.filter((c) => !c.notes.length).length)} ink="amber" />
            <Stat compact label="Casos cerrados" value={String(closed)} ink="green" note="Sin ausencias nuevas desde el cierre" />
          </div>

          <Segmented
            label="Filtrar por nivel de riesgo"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Todos · ${all.length}` },
              { value: 'a', label: `Riesgo alto · ${n('a')}` },
              { value: 'm', label: `Medio · ${n('m')}` },
              { value: 'b', label: `Bajo · ${n('b')}` },
            ]}
          />

          {all.length === 0 ? (
            <p className="card text-sm muted">Ningún estudiante cumple los criterios de alerta en las últimas 4 semanas.</p>
          ) : (
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
                        <tr key={c.id} aria-selected={c.id === d?.id}>
                          <td>
                            <button type="button" className="row-button stack" style={{ minHeight: 44, alignItems: 'flex-start', gap: 0 }} onClick={() => setSelectedId(c.id)}>
                              <span>{c.name}</span>
                              <span className="text-xs muted" style={{ fontWeight: 400 }}>
                                {c.section}
                                {c.age !== null && ` · ${c.age} años`}
                              </span>
                            </button>
                          </td>
                          <td>
                            <StatusBadge status={RISK[c.level]} />
                          </td>
                          <td className="num strong">{c.unexcused}</td>
                          <td className="num">{c.consecutive}</td>
                          <td className="num">{c.lates}</td>
                          <td className="text-sm" style={{ maxWidth: 220 }}>
                            {status(c)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              {d && <CasePanel key={d.id} c={d} onNote={addNote} />}
            </div>
          )}

          <section aria-labelledby="crit-t" className="card">
            <div className="row wrap between gap-8" style={{ alignItems: 'baseline' }}>
              <h2 id="crit-t" className="title-section">
                Criterios que activan la alerta
              </h2>
              <span className="text-sm muted">Se revisan con las últimas 4 semanas de pase de lista.</span>
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
                    <span className="setting-row__help">{COMPUTED.has(c.id) ? c.help : 'Disponible más adelante'}</span>
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

function CasePanel({ c, onNote }: { c: Case; onNote: (id: string, kind: Note['kind'], text: string) => Promise<string> }) {
  const [kind, setKind] = useState<Note['kind'] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const marks = c.strip.split('');
  const count = (k: string) => marks.filter((m) => m === k).length;

  const save = async () => {
    if (!kind) return;
    const value = text.trim() || (kind === 'cerrado' ? 'Volvió a asistir con regularidad' : '');
    if (!value) return setError('Escriba un detalle.');
    const err = await onNote(c.id, kind, value);
    setError(err);
    if (!err) {
      setKind(null);
      setText('');
    }
  };

  return (
    <aside aria-labelledby="caso-t" className="card gap-16" style={{ flex: '1 1 360px', minWidth: 0, padding: 20 }}>
      <div className="row between gap-10" style={{ alignItems: 'flex-start' }}>
        <div className="stack gap-2">
          <h2 id="caso-t" className="display" style={{ fontSize: 22 }}>
            {c.name}
          </h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Sección {c.section}
            {c.age !== null && ` · ${c.age} años`} · guía: {c.guide}
          </span>
        </div>
        <Badge tone={RISK[c.level].tone} size="md">
          Riesgo {RISK[c.level].label.toLowerCase()}
        </Badge>
      </div>

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
        <h3 className="eyebrow">Últimas 4 semanas</h3>
        <div className="strip" role="img" aria-label={`Últimos 20 días lectivos: ${count('A')} ausencias sin justificar y ${count('T')} tardías`}>
          {marks.map((m, i) => (
            <span key={i} data-k={m} />
          ))}
        </div>
        <span className="text-xs muted">Azul: sin novedad · ámbar: tarde · naranja: ausente sin justificar · gris: justificada</span>
      </div>

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

      {kind ? (
        <div className="stack gap-8">
          <TextareaField
            id="ew-texto"
            rows={3}
            label={NOTE_LABEL[kind]}
            placeholder={kind === 'contacto' ? 'Ej.: Llamada a la madre; dice que trabaja de noche.' : kind === 'plan' ? 'Ej.: Reunión con la familia el jueves.' : kind === 'cerrado' ? 'Volvió a asistir con regularidad' : ''}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && (
            <span className="text-sm ink-orange" role="alert">
              {error}
            </span>
          )}
          <div className="grid-2">
            <Button onClick={() => setKind(null)}>Cancelar</Button>
            <Button variant="primary" onClick={save}>
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
      )}
    </aside>
  );
}
