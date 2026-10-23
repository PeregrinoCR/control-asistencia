import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, InputField, Meter, Segmented, Stat, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { useAuth } from '../../lib/auth';
import {
  choquesEvento,
  choquesFijos,
  leerAulas,
  quitarDeConfig,
  renombrarEnConfig,
  SIN_CONFIG,
  type AulasConfig,
  type EventoAula,
} from '../../lib/aulas';
import { fetchAll } from '../../lib/fetchAll';
import { localDate } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';

type Tab = 'grupos' | 'aulas' | 'traslados';

interface Grupo {
  id: string;
  nombre: string;
  jornada: string;
}

const JORNADA: Record<string, string> = { noc: 'Nocturna', diu: 'Diurna', sab: 'Sábados' };

/** Académico · Aulas y grupos: groups with their room, guide and size; the school's rooms; and transfer events. */
export function RoomsLive() {
  const { school } = useAuth();
  const [cfg, setCfg] = useState<AulasConfig>(SIN_CONFIG);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  /** Students per group: enrolled now, and ever (a group with any student can't be removed). */
  const [alumnos, setAlumnos] = useState<Record<string, { activos: number; total: number }>>({});
  /** Guide teacher per group, or null when the staff list can't be read with this account. */
  const [guias, setGuias] = useState<Record<string, string> | null>(null);
  const [tab, setTab] = useState<Tab>('grupos');
  const [msg, setMsg] = useFlash();
  const [busy, setBusy] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [renombrando, setRenombrando] = useState<{ id: string; valor: string } | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [nuevaAula, setNuevaAula] = useState('');
  const [nuevaCap, setNuevaCap] = useState('');

  const cargar = useCallback(async () => {
    const db = supabase!;
    const [c, s, est, per] = await Promise.all([
      leerAulas(),
      db.from('secciones').select('id, nombre, jornada'),
      fetchAll<{ seccion_id: string | null; activo: boolean }>((a, b) => db.from('estudiantes').select('seccion_id, activo').range(a, b)),
      db.from('personal').select('nombre, seccion_guia').eq('activo', true).not('seccion_guia', 'is', null),
    ]);
    setCfg(c);
    setGrupos(ordenarSecciones(s.data as Grupo[] | null));
    const n: Record<string, { activos: number; total: number }> = {};
    for (const e of est) {
      if (!e.seccion_id) continue;
      n[e.seccion_id] ??= { activos: 0, total: 0 };
      n[e.seccion_id].total++;
      if (e.activo) n[e.seccion_id].activos++;
    }
    setAlumnos(n);
    setGuias(per.error ? null : Object.fromEntries((per.data ?? []).map((p) => [p.seccion_guia as string, p.nombre as string])));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const update = (patch: Partial<AulasConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setMsg(null);
  };

  /** Writes the rooms into the school's settings, keeping every other setting. */
  const guardarConfig = async (cambiar?: (config: Record<string, unknown>) => Record<string, unknown>) => {
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    let next: Record<string, unknown> = { ...(data?.config ?? {}), ...cfg };
    if (cambiar) next = cambiar(next);
    const { error } = await db.from('colegios').update({ config: next }).eq('id', school!.id);
    return error?.message ?? '';
  };

  const save = async () => {
    setBusy(true);
    const error = await guardarConfig();
    setBusy(false);
    setMsg(error ? { ok: false, text: 'No se guardó: ' + error } : { ok: true, text: 'Cambios guardados' });
  };

  const nombres = grupos.map((g) => g.nombre);
  const fijos = choquesFijos(cfg, nombres);
  const cupo = (aula: string | undefined) => (aula ? cfg.capacidades[aula] : undefined);
  const usan = (aula: string) => nombres.filter((s) => cfg.aulasGrupo[s] === aula);

  const estado = (g: Grupo) => {
    const n = alumnos[g.id]?.activos ?? 0;
    const aula = cfg.aulasGrupo[g.nombre];
    const c = cupo(aula);
    const out: Array<{ tone: 'amber' | 'orange'; text: string }> = [];
    if (!aula) out.push({ tone: 'amber', text: 'Sin aula' });
    else if (fijos.has(aula)) out.push({ tone: 'orange', text: 'Choque con ' + usan(aula).filter((x) => x !== g.nombre).join(', ') });
    if (c !== undefined && n > c) out.push({ tone: 'orange', text: 'No cabe' });
    if (guias && !guias[g.id]) out.push({ tone: 'amber', text: 'Sin guía' });
    return out;
  };

  const totalAlumnos = grupos.reduce((t, g) => t + (alumnos[g.id]?.activos ?? 0), 0);
  const noCaben = grupos.filter((g) => {
    const c = cupo(cfg.aulasGrupo[g.nombre]);
    return c !== undefined && (alumnos[g.id]?.activos ?? 0) > c;
  }).length;
  const sinGuia = guias ? grupos.filter((g) => !guias[g.id]).length : null;
  const choquesTotal = fijos.size + cfg.eventosAula.reduce((t, ev) => t + choquesEvento(cfg, ev, nombres).size, 0);

  const agregarGrupo = async () => {
    const nombre = nuevoGrupo.trim();
    if (!nombre) return;
    setBusy(true);
    const { error } = await supabase!.from('secciones').insert({ colegio_id: school!.id, nombre });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.code === '23505' ? 'Ese grupo ya existe.' : error.message });
    setNuevoGrupo('');
    setMsg({ ok: true, text: `Grupo ${nombre} creado` });
    await cargar();
  };

  const renombrarGrupo = async (g: Grupo, nuevo: string) => {
    const nombre = nuevo.trim();
    setRenombrando(null);
    if (!nombre || nombre === g.nombre) return;
    setBusy(true);
    const { error } = await supabase!.from('secciones').update({ nombre }).eq('id', g.id);
    if (error) {
      setBusy(false);
      return setMsg({ ok: false, text: error.code === '23505' ? 'Ese grupo ya existe.' : error.message });
    }
    // The settings keep groups by name, so they follow the new name (this also saves any unsaved room edits).
    const e = await guardarConfig((c) => renombrarEnConfig(c, g.nombre, nombre));
    setBusy(false);
    setMsg(e ? { ok: false, text: 'Se renombró, pero la configuración no se actualizó: ' + e } : { ok: true, text: `${g.nombre} ahora se llama ${nombre}` });
    await cargar();
  };

  const quitarGrupo = async (g: Grupo) => {
    setQuitando(null);
    setBusy(true);
    const { error } = await supabase!.from('secciones').delete().eq('id', g.id);
    if (error) {
      setBusy(false);
      return setMsg({ ok: false, text: 'No se quitó: ' + error.message });
    }
    await guardarConfig((c) => quitarDeConfig(c, g.nombre));
    setBusy(false);
    setMsg({ ok: true, text: `Grupo ${g.nombre} quitado` });
    await cargar();
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

      <Segmented
        mode="tabs"
        label="Secciones de la pantalla"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'grupos', label: `Grupos · ${grupos.length}` },
          { value: 'aulas', label: `Aulas · ${cfg.aulas.length}` },
          { value: 'traslados', label: `Traslados · ${cfg.eventosAula.length}` },
        ]}
      />

      <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <Stat compact label="Estudiantes" value={String(totalAlumnos)} />
        <Stat compact label="Choques de aula" value={String(choquesTotal)} ink={choquesTotal ? 'orange' : undefined} />
        <Stat compact label="Grupos que no caben" value={String(noCaben)} ink={noCaben ? 'amber' : undefined} />
        <Stat compact label="Sin profesor guía" value={sinGuia === null ? '—' : String(sinGuia)} ink={sinGuia ? 'amber' : undefined} />
      </div>

      {tab === 'grupos' && (
        <section aria-labelledby="grupos-t" className="card gap-10">
          <div className="row wrap between gap-8">
            <h2 id="grupos-t" style={{ fontSize: 16, fontWeight: 700 }}>
              Grupos
            </h2>
            <form
              className="row gap-8"
              style={{ alignItems: 'flex-end' }}
              onSubmit={(e) => {
                e.preventDefault();
                agregarGrupo();
              }}
            >
              <InputField id="grupo-n" label="Nuevo grupo" placeholder="7-3" style={{ width: 110 }} value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} />
              <Button type="submit" regular disabled={busy}>
                Agregar
              </Button>
            </form>
          </div>
          {guias === null && <span className="text-xs muted">Con esta cuenta no se puede ver el profesor guía de cada grupo.</span>}
          <div className="table-wrap">
            <table className="table table--compact" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Profesor guía</th>
                  <th>Jornada</th>
                  <th className="num">Estudiantes</th>
                  <th>Aula fija</th>
                  <th>Ocupación</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const n = alumnos[g.id]?.activos ?? 0;
                  const aula = cfg.aulasGrupo[g.nombre];
                  const c = cupo(aula);
                  const est = estado(g);
                  return (
                    <tr key={g.id}>
                      <td>
                        {renombrando?.id === g.id ? (
                          <form
                            className="row gap-6"
                            onSubmit={(e) => {
                              e.preventDefault();
                              renombrarGrupo(g, renombrando.valor);
                            }}
                          >
                            <InputField
                              id={`ren-${g.id}`}
                              label={`Nuevo nombre de ${g.nombre}`}
                              style={{ width: 90 }}
                              value={renombrando.valor}
                              onChange={(e) => setRenombrando({ id: g.id, valor: e.target.value })}
                            />
                            <Button type="submit" regular>
                              Guardar
                            </Button>
                          </form>
                        ) : (
                          <strong>{g.nombre}</strong>
                        )}
                      </td>
                      <td>{guias === null ? '—' : (guias[g.id] ?? <span className="ink-amber">Sin asignar</span>)}</td>
                      <td>{JORNADA[g.jornada] ?? g.jornada}</td>
                      <td className="num">{n}</td>
                      <td>
                        <select
                          aria-label={`Aula fija de ${g.nombre}`}
                          className="input"
                          value={aula ?? ''}
                          onChange={(e) => update({ aulasGrupo: { ...cfg.aulasGrupo, [g.nombre]: e.target.value } })}
                        >
                          <option value="">Sin aula</option>
                          {cfg.aulas.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td>{c !== undefined ? <Meter percent={Math.min(100, Math.round((n / c) * 100))} label={`${n}/${c}`} /> : <span className="muted">—</span>}</td>
                      <td>
                        <div className="row wrap gap-6">
                          {est.length === 0 ? <Badge tone="green">Listo</Badge> : est.map((x) => <Badge key={x.text} tone={x.tone}>{x.text}</Badge>)}
                        </div>
                      </td>
                      <td>
                        {quitando === g.id ? (
                          <span className="row gap-6">
                            <button type="button" className="link-button text-sm" onClick={() => quitarGrupo(g)}>
                              Sí, quitar
                            </button>
                            <button type="button" className="link-button text-sm" onClick={() => setQuitando(null)}>
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <span className="row gap-10">
                            <button type="button" className="link-button text-sm" onClick={() => setRenombrando({ id: g.id, valor: g.nombre })}>
                              Renombrar
                            </button>
                            {(alumnos[g.id]?.total ?? 0) === 0 ? (
                              <button type="button" className="link-button text-sm" onClick={() => setQuitando(g.id)}>
                                Quitar
                              </button>
                            ) : (
                              <span className="text-xs muted" title="Tiene estudiantes: pase a los estudiantes a otro grupo antes de quitarlo.">
                                Con estudiantes
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {grupos.length === 0 && <span className="text-sm muted">Todavía no hay grupos. Agregue el primero arriba.</span>}
          <span className="text-xs muted">
            Renombrar un grupo actualiza también su aula, los traslados y el calendario de pruebas. Un grupo con estudiantes no se puede quitar.
          </span>
        </section>
      )}

      {tab === 'aulas' && (
        <section aria-labelledby="aulas-t" className="card gap-10">
          <h2 id="aulas-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Aulas del centro
          </h2>
          <span className="text-xs muted">Los puestos sirven para avisar cuando un grupo tiene más estudiantes de los que caben. Sin número, el aula no tiene límite.</span>
          <div className="table-wrap">
            <table className="table table--compact" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Aula</th>
                  <th>Puestos</th>
                  <th>La usan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cfg.aulas.map((a) => {
                  const en = usan(a);
                  return (
                    <tr key={a}>
                      <td>
                        <strong>{a}</strong>
                      </td>
                      <td>
                        <InputField
                          id={`cap-${a}`}
                          label={`Puestos de ${a}`}
                          type="number"
                          min={1}
                          style={{ width: 90 }}
                          value={cfg.capacidades[a] ?? ''}
                          onChange={(e) => {
                            const { [a]: _, ...resto } = cfg.capacidades;
                            const v = Math.floor(Number(e.target.value));
                            update({ capacidades: v > 0 ? { ...resto, [a]: v } : resto });
                          }}
                        />
                      </td>
                      <td>{en.length ? en.join(', ') : <span className="muted">Nadie</span>}</td>
                      <td>
                        {en.length === 0 ? (
                          <button
                            type="button"
                            className="link-button text-sm"
                            onClick={() => {
                              const { [a]: _, ...resto } = cfg.capacidades;
                              update({ aulas: cfg.aulas.filter((x) => x !== a), capacidades: resto });
                            }}
                          >
                            Quitar
                          </button>
                        ) : (
                          <span className="text-xs muted">En uso</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cfg.aulas.length === 0 && <span className="text-sm muted">Agregue las aulas del centro.</span>}
          <form
            className="row wrap gap-8"
            style={{ alignItems: 'flex-end' }}
            onSubmit={(e) => {
              e.preventDefault();
              const nombre = nuevaAula.trim();
              if (nombre && !cfg.aulas.includes(nombre)) {
                const v = Math.floor(Number(nuevaCap));
                update({ aulas: [...cfg.aulas, nombre], capacidades: v > 0 ? { ...cfg.capacidades, [nombre]: v } : cfg.capacidades });
              }
              setNuevaAula('');
              setNuevaCap('');
            }}
          >
            <InputField id="aula-n" label="Nueva aula" placeholder="Aula 5, Laboratorio…" value={nuevaAula} onChange={(e) => setNuevaAula(e.target.value)} />
            <InputField id="aula-c" label="Puestos" type="number" min={1} style={{ width: 90 }} value={nuevaCap} onChange={(e) => setNuevaCap(e.target.value)} />
            <Button type="submit" regular>
              Agregar
            </Button>
          </form>
        </section>
      )}

      {tab === 'traslados' && (
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
            const libres = nombres.filter((s) => !(s in ev.aulas));
            const choques = [...choquesEvento(cfg, ev, nombres)];
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
                {choques.map(([aula, juntos]) => (
                  <span key={aula} className="text-sm ink-orange" role="status">
                    {aula}: {juntos.join(' y ')} quedarían juntos en esas fechas.
                  </span>
                ))}
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
      )}
    </AdminLayout>
  );
}
