import { useEffect, useState } from 'react';
import { Button, InputField } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { useAuth } from '../../lib/auth';
import { leerAulas, SIN_CONFIG, type AulasConfig, type EventoAula } from '../../lib/aulas';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';

const LEVELS = ['7', '8', '9', '10', '11', '12'];

/** Académico · Aulas y grupos: the school's rooms, each group's fixed room, and transfer events. */
export function RoomsLive() {
  const { school } = useAuth();
  const [cfg, setCfg] = useState<AulasConfig>(SIN_CONFIG);
  const [sections, setSections] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([leerAulas(), supabase!.from('secciones').select('nombre').order('nombre')]);
      setCfg(c);
      setSections((s.data ?? []).map((x) => x.nombre));
    })();
  }, []);

  const update = (patch: Partial<AulasConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setMsg(null);
  };

  const save = async () => {
    setBusy(true);
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    const { error } = await db
      .from('colegios')
      .update({ config: { ...(data?.config ?? {}), ...cfg } })
      .eq('id', school!.id);
    setBusy(false);
    setMsg(error ? { ok: false, text: 'No se guardó: ' + error.message } : { ok: true, text: 'Cambios guardados' });
  };

  const setEvento = (id: string, patch: Partial<EventoAula>) =>
    update({ eventosAula: cfg.eventosAula.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const hoy = localDate();

  return (
    <AdminLayout>
      <PageHeader
        kicker="Académico · cada grupo tiene su aula fija para el curso"
        title="Aulas y grupos"
        actions={
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        }
      />
      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      <section aria-labelledby="cat-t" className="card gap-10">
        <h2 id="cat-t" style={{ fontSize: 16, fontWeight: 700 }}>
          Aulas del centro · {cfg.aulas.length}
        </h2>
        <div className="row wrap gap-6">
          {cfg.aulas.length === 0 && <span className="text-sm muted">Agregue las aulas del centro.</span>}
          {cfg.aulas.map((a) => (
            <button key={a} type="button" className="chip chip--sm" title="Quitar" onClick={() => update({ aulas: cfg.aulas.filter((x) => x !== a) })}>
              {a} ×
            </button>
          ))}
        </div>
        <form
          className="row gap-8"
          style={{ alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !cfg.aulas.includes(name.trim())) update({ aulas: [...cfg.aulas, name.trim()] });
            setName('');
          }}
        >
          <InputField id="aula-n" label="Nueva aula" placeholder="Aula 5, Laboratorio…" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" regular>
            Agregar
          </Button>
        </form>
      </section>

      <section aria-labelledby="fijas-t" className="card gap-10">
        <h2 id="fijas-t" style={{ fontSize: 16, fontWeight: 700 }}>
          Aula fija de cada grupo
        </h2>
        <span className="text-xs muted">Se usa en el calendario de pruebas y en el horario, salvo que un evento de traslado la cambie.</span>
        <div className="grid-2">
          {sections.map((s) => (
            <div key={s} className="field">
              <label htmlFor={`fija-${s}`} className="field__label">
                {s}
              </label>
              <select
                id={`fija-${s}`}
                className="input"
                value={cfg.aulasGrupo[s] ?? ''}
                onChange={(e) => update({ aulasGrupo: { ...cfg.aulasGrupo, [s]: e.target.value } })}
              >
                <option value="">Sin aula</option>
                {cfg.aulas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="eventos-t" className="card gap-12">
        <div className="row wrap between gap-8">
          <h2 id="eventos-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Eventos con traslado
          </h2>
          <Button
            regular
            onClick={() =>
              update({
                eventosAula: [...cfg.eventosAula, { id: crypto.randomUUID(), nombre: 'Nuevo evento', desde: hoy, hasta: hoy, aulas: {} }],
              })
            }
          >
            + Nuevo evento
          </Button>
        </div>
        <span className="text-xs muted">Ej.: «Pruebas estandarizadas». Mientras dura, esos grupos van a su aula temporal y luego regresan a su aula fija.</span>
        {cfg.eventosAula.length === 0 && <span className="text-sm muted">No hay eventos registrados.</span>}
        {cfg.eventosAula.map((ev) => {
          const libres = sections.filter((s) => !(s in ev.aulas));
          return (
            <div key={ev.id} className="card stack gap-8" style={{ border: '1px solid var(--border-soft)' }}>
              <div className="row wrap gap-8" style={{ alignItems: 'flex-end' }}>
                <InputField id={`ev-n-${ev.id}`} label="Nombre" value={ev.nombre} onChange={(e) => setEvento(ev.id, { nombre: e.target.value })} />
                <InputField id={`ev-d-${ev.id}`} type="date" label="Desde" value={ev.desde} onChange={(e) => setEvento(ev.id, { desde: e.target.value })} />
                <InputField id={`ev-h-${ev.id}`} type="date" label="Hasta" value={ev.hasta} onChange={(e) => setEvento(ev.id, { hasta: e.target.value })} />
                <button type="button" className="link-button text-sm" onClick={() => update({ eventosAula: cfg.eventosAula.filter((x) => x.id !== ev.id) })}>
                  Quitar evento
                </button>
              </div>
              <div className="grid-2">
                {Object.keys(ev.aulas).map((s) => (
                  <div key={s} className="field">
                    <label htmlFor={`ev-${ev.id}-${s}`} className="field__label">
                      {s} se traslada a
                    </label>
                    <select
                      id={`ev-${ev.id}-${s}`}
                      className="input"
                      value={ev.aulas[s]}
                      onChange={(e) => setEvento(ev.id, { aulas: { ...ev.aulas, [s]: e.target.value } })}
                    >
                      {cfg.aulas.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {libres.length > 0 && (
                <select
                  aria-label="Agregar grupo al evento"
                  className="input"
                  style={{ maxWidth: 260 }}
                  value=""
                  onChange={(e) => e.target.value && setEvento(ev.id, { aulas: { ...ev.aulas, [e.target.value]: cfg.aulas[0] ?? '' } })}
                >
                  <option value="">+ Agregar grupo…</option>
                  {libres.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="adec-t" className="card gap-10">
        <h2 id="adec-t" style={{ fontSize: 16, fontWeight: 700 }}>
          Aulas de adecuación por nivel
        </h2>
        <span className="text-xs muted">Varios niveles pueden usar la misma aula si son pocos estudiantes.</span>
        <div className="grid-2">
          {LEVELS.map((lv) => (
            <div key={lv} className="field">
              <label htmlFor={`adec-${lv}`} className="field__label">
                {lv}.°
              </label>
              <select
                id={`adec-${lv}`}
                className="input"
                value={cfg.aulasAdecuacion[lv] ?? ''}
                onChange={(e) => update({ aulasAdecuacion: { ...cfg.aulasAdecuacion, [lv]: e.target.value } })}
              >
                <option value="">Automática</option>
                {cfg.aulas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
