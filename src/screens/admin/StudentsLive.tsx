import { useState, type FormEvent } from 'react';
import { Avatar, Button, CheckCard, Icon, InputField, MiniStat, Segmented, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import QRCode from 'qrcode';
import { CARD_PREFIX } from '../../data/gate';
import { useAuth } from '../../lib/auth';
import { esc, printDocument } from '../../lib/print';
import { IMPORT_COLUMNS, parseEnrollment, useStudents, type LiveStudent, type NewStudent } from '../../lib/students';
import { ordenSecciones } from '../../lib/secciones';
import { supabase } from '../../lib/supabase';

type AgeFilter = 'all' | 'min' | 'adu';
type Panel = { kind: 'student'; id: string } | { kind: 'add' } | { kind: 'import' } | null;
type Students = ReturnType<typeof useStudents>;

const isAdult = (s: LiveStudent) => s.age !== null && s.age >= 18;

/** Who gets the notices: the student when adult, otherwise the first guardian. */
function contactOf(s: LiveStudent) {
  if (isAdult(s)) return { name: 'El propio estudiante', account: s.hasAccount };
  const g = s.guardians[0];
  return g ? { name: `${g.name}${g.relation ? ` (${g.relation})` : ''}`, account: g.hasAccount } : null;
}

/** Dirección · Estudiantes, with the school's real enrollment. */
/** Prints the student cards (85 × 54 mm, ten per page) with their opaque QR codes. */
function printCards(list: LiveStudent[], school: { nombre: string; logo: string | null }) {
  printDocument('Carnés estudiantiles', cardsHtml(list, school), {
    school: `${school.nombre} · ${list.length} estudiantes`,
    logo: school.logo ?? undefined,
    css: CARD_CSS,
  });
}

async function cardsHtml(list: LiveStudent[], school: { nombre: string; logo: string | null }) {
  const { data } = await supabase!.from('carnes').select('codigo, estudiante_id').eq('revocado', false).in('estudiante_id', list.map((s) => s.id));
  const code = new Map((data ?? []).map((c) => [c.estudiante_id, c.codigo]));
  const year = new Date().getFullYear();
  const cards = await Promise.all(
    list
      .filter((s) => code.has(s.id))
      .map(async (s) => {
        const qr = await QRCode.toString(CARD_PREFIX + code.get(s.id), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
        return `<div class="card"><div class="top">${school.logo ? `<img src="${esc(school.logo)}" alt="">` : ''}<span>${esc(school.nombre)} · ${year}</span></div>
<div class="body"><div class="who"><b>${esc(s.name)}</b><span>Sección ${esc(s.section)}</span><span>${s.age !== null && s.age >= 18 ? 'Mayor de edad' : 'Menor de edad'}</span><span class="code">${esc(code.get(s.id))}</span></div><div class="qr">${qr}</div></div></div>`;
      }),
  );
  return `<div class="grid">${cards.join('')}</div>`;
}

const CARD_CSS = `.grid { display: grid; grid-template-columns: repeat(2, 85mm); gap: 4mm; }
.card { width: 85mm; height: 54mm; border: 1px solid #999; border-radius: 3mm; padding: 3mm; box-sizing: border-box; display: flex; flex-direction: column; break-inside: avoid; }
.top { display: flex; align-items: center; gap: 2mm; font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #1e4fd8; }
.top img { height: 7mm; }
.body { flex: 1; display: flex; justify-content: space-between; align-items: center; gap: 3mm; }
.who { display: flex; flex-direction: column; gap: 1mm; font-size: 8pt; }
.who b { font-size: 11pt; }
.code { font-family: monospace; letter-spacing: 1px; color: #555; }
.qr svg { width: 32mm; height: 32mm; }
@media print { header { display: none; } body { margin: 0; } }`;

type Tab = 'activos' | 'retirados';
type Pending = 'sinEncargado' | 'sinCuenta' | null;
type SortKey = 'name' | 'section' | 'age' | 'absences' | 'lates';

export function StudentsLive() {
  const data = useStudents();
  const { school } = useAuth();
  const [tab, setTab] = useState<Tab>('activos');
  const [filter, setFilter] = useState<AgeFilter>('all');
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const [soloAdec, setSoloAdec] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [msg, setMsg] = useFlash();

  const active = data.students ?? [];
  const retired = data.retired;
  const all = tab === 'activos' ? active : retired;
  const q = query.toLowerCase();
  // Pending enrollment tasks, counted over every active student whatever the other filters say.
  const noGuardian = active.filter((s) => contactOf(s) === null).length;
  const noAccount = active.filter((s) => {
    const c = contactOf(s);
    return c !== null && !c.account;
  }).length;
  const withAccommodation = active.filter((s) => s.accommodation).length;

  const compare = (a: LiveStudent, b: LiveStudent) => {
    const { key, dir } = sort;
    if (key === 'section') return dir * ordenSecciones(a.section, b.section);
    if (key === 'name') return dir * a.name.localeCompare(b.name, 'es');
    // Missing ages go last whichever way it is sorted.
    if (key === 'age' && (a.age === null || b.age === null)) return a.age === b.age ? 0 : a.age === null ? 1 : -1;
    return dir * ((a[key] ?? 0) - (b[key] ?? 0));
  };
  const list = all
    .filter(
      (s) =>
        (filter === 'all' || (filter === 'min' ? !isAdult(s) : isAdult(s))) &&
        (!section || s.section === section) &&
        (!soloAdec || s.accommodation) &&
        (tab === 'retirados' || pending === null || (pending === 'sinEncargado' ? contactOf(s) === null : contactOf(s) !== null && !contactOf(s)!.account)) &&
        [s.name, s.idNumber, ...s.guardians.map((g) => g.name)].join(' ').toLowerCase().includes(q),
    )
    .sort(compare);
  const minors = active.filter((s) => !isAdult(s)).length;
  const selected = panel?.kind === 'student' ? active.find((s) => s.id === panel.id) : undefined;
  // Bulk actions only touch what is shown: a selected student hidden by a filter is left alone.
  const chosen = list.filter((s) => picked.has(s.id));
  const allChosen = list.length > 0 && chosen.length === list.length;

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const header = (key: SortKey, label: string, className?: string) => (
    <th className={className} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="link-button" style={{ font: 'inherit', fontWeight: 600, color: 'inherit', textDecoration: 'none' }} onClick={() => sortBy(key)}>
        {label}
        {sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
  const changeTab = (t: Tab) => {
    setTab(t);
    setPicked(new Set());
    setPanel(null);
  };
  const moveChosen = async () => {
    if (!target || chosen.length === 0) return;
    setBusy(true);
    const error = await data.moveMany(
      chosen.map((s) => s.id),
      target,
    );
    setBusy(false);
    if (error) return setMsg({ ok: false, text: 'No se pasaron: ' + error });
    setMsg({ ok: true, text: `${chosen.length} estudiante${chosen.length === 1 ? '' : 's'} pasaron a ${target}` });
    setPicked(new Set());
    setTarget('');
  };
  const reactivate = async (s: LiveStudent) => {
    setBusy(true);
    const error = await data.reactivate(s.id);
    setBusy(false);
    setMsg(error ? { ok: false, text: 'No se reactivó: ' + error } : { ok: true, text: `${s.name} volvió a ${s.section === '—' ? 'la lista de activos' : s.section}` });
  };

  return (
    <AdminLayout>
      <PageHeader
        kicker={`${active.length} matriculados · ${minors} menores de edad`}
        title="Estudiantes"
        actions={
          <>
            <Button regular onClick={() => setPanel({ kind: 'import' })}>
              Importar matrícula
            </Button>
            <Button regular disabled={!list.length || tab === 'retirados'} onClick={() => printCards(list, { nombre: school?.nombre ?? '', logo: school?.logo ?? null })}>
              Imprimir carnés{section ? ` de ${section}` : ''}
            </Button>
            <Button variant="primary" onClick={() => setPanel({ kind: 'add' })}>
              Agregar estudiante
            </Button>
          </>
        }
      />

      {msg && (
        <p className="notice" role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      {data.error ? (
        <p className="notice" role="alert">
          No se pudieron cargar los estudiantes: {data.error}
        </p>
      ) : !data.students ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <>
          <Segmented
            mode="tabs"
            label="Estudiantes activos o retirados"
            value={tab}
            onChange={changeTab}
            options={[
              { value: 'activos', label: `Activos · ${active.length}` },
              { value: 'retirados', label: `Retirados · ${retired.length}` },
            ]}
          />

          <div className="row wrap gap-10">
            <div className="search">
              <Icon name="search" size={18} />
              <label htmlFor="e-buscar" className="sr-only">
                Buscar estudiante
              </label>
              <input
                id="e-buscar"
                type="search"
                className="input"
                placeholder="Buscar por nombre, cédula o encargado"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Segmented
              label="Filtrar por edad"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'min', label: 'Menores de edad' },
                { value: 'adu', label: 'Mayores de edad' },
              ]}
            />
            {tab === 'activos' && (
              <>
                <button type="button" className="chip chip--sm" aria-pressed={pending === 'sinEncargado'} onClick={() => setPending(pending === 'sinEncargado' ? null : 'sinEncargado')}>
                  Falta encargado · {noGuardian}
                </button>
                <button type="button" className="chip chip--sm" aria-pressed={pending === 'sinCuenta'} onClick={() => setPending(pending === 'sinCuenta' ? null : 'sinCuenta')}>
                  Encargado sin cuenta · {noAccount}
                </button>
              </>
            )}
            <button type="button" className="chip chip--sm" aria-pressed={soloAdec} onClick={() => setSoloAdec(!soloAdec)}>
              Con adecuación · {withAccommodation}
            </button>
            <label htmlFor="e-seccion" className="sr-only">
              Sección
            </label>
            <select id="e-seccion" className="input" style={{ width: 'auto' }} value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="">Todas las secciones</option>
              {data.sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          {chosen.length > 0 && (
            <div className="row wrap gap-10 notice" role="region" aria-label="Acciones para los estudiantes marcados" style={{ alignItems: 'center' }}>
              <strong>
                {chosen.length} seleccionado{chosen.length === 1 ? '' : 's'}
              </strong>
              <label htmlFor="e-pasar" className="sr-only">
                Pasar a sección
              </label>
              <select id="e-pasar" className="input" style={{ width: 'auto' }} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Pasar a sección…</option>
                {data.sections.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Button regular disabled={!target || busy} onClick={moveChosen}>
                Pasar
              </Button>
              <Button regular onClick={() => printCards(chosen, { nombre: school?.nombre ?? '', logo: school?.logo ?? null })}>
                Imprimir carnés
              </Button>
              <button type="button" className="link-button text-sm" style={{ marginLeft: 'auto' }} onClick={() => setPicked(new Set())}>
                Quitar selección
              </button>
            </div>
          )}

          <div className="split">
            <section aria-label="Lista de estudiantes" className="card split__main" style={{ padding: '8px 18px 18px', gap: 0, flexBasis: 560 }}>
              {all.length === 0 ? (
                <p className="text-sm muted" style={{ paddingTop: 12 }}>
                  {tab === 'retirados'
                    ? 'No hay estudiantes retirados.'
                    : 'Todavía no hay estudiantes. Agréguelos uno por uno o importe la matrícula desde Excel.'}
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="table table--compact" style={{ minWidth: 700 }}>
                    <thead>
                      <tr>
                        {tab === 'activos' && (
                          <th style={{ width: 34 }}>
                            <input
                              type="checkbox"
                              className="checkbox"
                              aria-label="Marcar todos los que se ven"
                              checked={allChosen}
                              onChange={() => setPicked(allChosen ? new Set() : new Set(list.map((s) => s.id)))}
                            />
                          </th>
                        )}
                        {header('name', 'Estudiante')}
                        {header('section', 'Sección')}
                        {header('age', 'Edad')}
                        <th>{tab === 'activos' ? 'Recibe los avisos' : 'Estado'}</th>
                        {tab === 'activos' ? (
                          <>
                            {header('absences', 'Ausencias', 'num')}
                            {header('lates', 'Tardías', 'num')}
                          </>
                        ) : (
                          <th />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r) => {
                        const c = contactOf(r);
                        return (
                          <tr key={r.id} aria-selected={r.id === selected?.id}>
                            {tab === 'activos' && (
                              <td>
                                <input type="checkbox" className="checkbox" aria-label={`Marcar a ${r.name}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                              </td>
                            )}
                            <td>
                              {tab === 'activos' ? (
                                <button type="button" className="row-button" onClick={() => setPanel({ kind: 'student', id: r.id })}>
                                  <Avatar name={r.name} size="sm" />
                                  {r.name}
                                </button>
                              ) : (
                                <span className="row gap-8">
                                  <Avatar name={r.name} size="sm" />
                                  {r.name}
                                </span>
                              )}
                            </td>
                            <td>{r.section}</td>
                            <td>{r.age === null ? '—' : `${r.age} años`}</td>
                            {tab === 'activos' ? (
                              <>
                                <td>
                                  {c ? (
                                    <span className="stack">
                                      <span>{c.name}</span>
                                      <span className={c.account ? 'text-xs strong ink-green' : 'text-xs strong ink-orange'}>
                                        {c.account ? 'Usa la app' : 'Sin cuenta'}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-sm ink-orange">Falta el encargado</span>
                                  )}
                                </td>
                                <td className={r.absences >= 3 ? 'num strong ink-orange' : 'num strong'}>{r.absences}</td>
                                <td className="num strong">{r.lates}</td>
                              </>
                            ) : (
                              <>
                                <td>
                                  <span className="text-sm muted">Retirado</span>
                                </td>
                                <td className="num">
                                  <Button regular disabled={busy} onClick={() => reactivate(r)}>
                                    Reactivar
                                  </Button>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {all.length > 0 && (
                <span className="text-sm muted" style={{ display: 'block', paddingTop: 12 }}>
                  Mostrando {list.length} de {all.length}
                  {tab === 'activos' ? ' · el título de cada columna ordena la lista' : ''}
                </span>
              )}
            </section>

            {panel?.kind === 'add' && <AddPanel data={data} onClose={() => setPanel(null)} />}
            {panel?.kind === 'import' && <ImportPanel data={data} onClose={() => setPanel(null)} />}
            {selected && <StudentPanel key={selected.id} s={selected} data={data} onClose={() => setPanel(null)} />}
          </div>
        </>
      )}
    </AdminLayout>
  );
}

type Editing = null | 'student' | 'withdraw' | { guardian: string | 'new' };

function StudentPanel({ s, data, onClose }: { s: LiveStudent; data: Students; onClose: () => void }) {
  const adult = isAdult(s);
  const { school } = useAuth();
  const [editing, setEditing] = useState<Editing>(null);
  const [msg, setMsg] = useFlash();
  const [sinCarne, setSinCarne] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pickId, setPickId] = useState('');
  const [relation, setRelation] = useState('');

  // Other students who share one of this student's guardians (siblings, or children picked up by the same person).
  const everyone = data.students ?? [];
  const shared = everyone.filter((x) => x.id !== s.id && x.guardians.some((g) => s.guardians.some((sg) => sg.id === g.id)));
  // Guardians of the school that this student does not have yet, to link them.
  const linkable = [...new Map(everyone.flatMap((x) => x.guardians).map((g) => [g.id, g])).values()].filter(
    (g) => !s.guardians.some((sg) => sg.id === g.id),
  );

  // Prints this student's card only (the same card as «Imprimir carnés» in the list).
  const imprimirCarne = async () => {
    const { data: carne } = await supabase!.from('carnes').select('codigo').eq('estudiante_id', s.id).eq('revocado', false).maybeSingle();
    if (!carne) return setSinCarne(true);
    printCards([s], { nombre: school?.nombre ?? '', logo: school?.logo ?? null });
  };

  // Gives the student a new card, then prints it.
  const reponerCarne = async () => {
    const { error } = await supabase!.rpc('reponer_carne', { estudiante: s.id });
    if (error) return setMsg({ ok: false, text: 'No se pudo reponer el carné: ' + error.message });
    setSinCarne(false);
    printCards([s], { nombre: school?.nombre ?? '', logo: school?.logo ?? null });
  };

  const done = (error: string, ok: string) => {
    setMsg(error ? { ok: false, text: 'No se guardó: ' + error } : { ok: true, text: ok });
    if (!error) setEditing(null);
  };

  const guardianId = editing && typeof editing === 'object' ? editing.guardian : null;
  const guardian = s.guardians.find((g) => g.id === guardianId);

  return (
    <aside aria-labelledby="ficha-t" className="card split__side split__side--sticky gap-16" style={{ padding: 20 }}>
      <div className="row gap-14">
        <Avatar name={s.name} size="lg" tone="blue" />
        <div className="stack grow">
          <h2 id="ficha-t" className="display" style={{ fontSize: 22 }}>
            {s.name}
          </h2>
          <span className="muted" style={{ fontSize: 14 }}>
            Sección {s.section}
            {s.age !== null && ` · ${s.age} años · ${adult ? 'mayor de edad' : 'menor de edad'}`}
          </span>
          {s.idNumber && <span className="text-sm muted">Cédula {s.idNumber}</span>}
          {s.accommodation && <span className="text-sm strong" style={{ color: 'var(--blue-ink)' }}>Con adecuación</span>}
        </div>
      </div>

      {msg && (
        <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
          {msg.text}
        </span>
      )}

      <div className="stack gap-8">
        <Button regular onClick={imprimirCarne}>
          Imprimir carné
        </Button>
        {sinCarne && (
          <div className="row wrap gap-8" style={{ alignItems: 'center' }}>
            <span className="text-sm ink-orange">Este estudiante no tiene carné vigente.</span>
            <Button regular onClick={reponerCarne}>
              Reponer carné e imprimir
            </Button>
          </div>
        )}
      </div>

      {editing === 'student' ? (
        <StudentForm
          s={s}
          sections={data.sections}
          onCancel={() => setEditing(null)}
          onSave={async (row) => done(await data.updateStudent(s.id, row), 'Datos del estudiante guardados.')}
        />
      ) : guardianId ? (
        <GuardianForm
          g={guardian}
          onCancel={() => setEditing(null)}
          onSave={async (g) => done(await data.saveGuardian(s.id, guardian?.id ?? null, g), guardian ? 'Encargado actualizado.' : 'Encargado agregado.')}
        />
      ) : editing === 'withdraw' ? (
        <div className="stack gap-10">
          <p style={{ fontSize: 14, lineHeight: 1.45 }}>
            {s.name} dejará de aparecer en las listas y en el pase de lista. Su historial de asistencia se conserva.
          </p>
          <div className="grid-2">
            <Button onClick={() => setEditing(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const error = await data.deactivate(s.id);
                if (error) return done(error, '');
                onClose();
              }}
            >
              Sí, dar de baja
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-2">
            <MiniStat look="inset" label="Ausencias este mes" value={s.absences} ink="orange" />
            <MiniStat look="inset" label="Tardías este mes" value={s.lates} ink="amber" />
          </div>
          {adult && (
            <div className="stack gap-4">
              <h3 className="eyebrow" style={{ fontSize: 14 }}>
                Contacto (el propio estudiante)
              </h3>
              <span style={{ fontSize: 14 }}>{s.phone || 'Sin teléfono'}</span>
              <span className={s.hasAccount ? 'text-sm strong ink-green' : 'text-sm strong ink-orange'}>
                {s.hasAccount ? 'Usa la app' : 'Aún no crea su cuenta'}
              </span>
            </div>
          )}
          <div className="stack gap-8">
            <h3 className="eyebrow" style={{ fontSize: 14 }}>
              {s.guardians.length > 1 ? 'Encargados' : 'Encargado legal'}
            </h3>
            {s.guardians.length === 0 && <span className="text-sm ink-orange">Sin encargado registrado.</span>}
            {s.guardians.map((g) => (
              <div key={g.id} className="stack gap-4" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>
                  {g.name}
                  {g.relation && <span className="muted" style={{ fontWeight: 400 }}> · {g.relation}</span>}
                </span>
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{[g.idNumber && `Céd. ${g.idNumber}`, g.phone, g.email].filter(Boolean).join(' · ') || 'Sin contacto'}</span>
                <span className={g.hasAccount ? 'text-sm strong ink-green' : 'text-sm strong ink-orange'}>{g.hasAccount ? 'Usa la app' : 'Aún no crea su cuenta'}</span>
                <span className="row gap-12">
                  <button type="button" className="link-button text-sm" onClick={() => (setMsg(null), setEditing({ guardian: g.id }))}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="link-button text-sm"
                    style={{ color: 'var(--orange-ink)' }}
                    onClick={async () => done(await data.unlinkGuardian(s.id, g.id), `${g.name} ya no es encargado de ${s.name}.`)}
                  >
                    Quitar
                  </button>
                </span>
              </div>
            ))}
            {linking ? (
              <div className="stack gap-6" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                <div className="field">
                  <label htmlFor="link-g" className="field__label">
                    Encargado ya registrado
                  </label>
                  <select id="link-g" className="input" value={pickId} onChange={(e) => setPickId(e.target.value)}>
                    <option value="">Elija una persona…</option>
                    {linkable.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {g.idNumber ? ` · ${g.idNumber}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <InputField id="link-rel" label="Parentesco con este estudiante" placeholder="Madre, tío, abuela…" value={relation} onChange={(e) => setRelation(e.target.value)} />
                <div className="grid-2">
                  <Button onClick={() => setLinking(false)}>Cancelar</Button>
                  <Button
                    variant="primary"
                    disabled={!pickId}
                    onClick={async () => {
                      const err = await data.linkGuardian(s.id, pickId, relation);
                      setLinking(false);
                      setPickId('');
                      setRelation('');
                      done(err, 'Encargado vinculado.');
                    }}
                  >
                    Vincular
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid-2">
                <Button size="md" variant="dashed" onClick={() => (setMsg(null), setEditing({ guardian: 'new' }))}>
                  + Agregar encargado
                </Button>
                <Button size="md" variant="dashed" disabled={linkable.length === 0} onClick={() => (setMsg(null), setLinking(true))}>
                  Vincular existente
                </Button>
              </div>
            )}
          </div>
          <div className="stack gap-6">
            <h3 className="eyebrow" style={{ fontSize: 14 }}>
              Hermanos y otros estudiantes del mismo encargado
            </h3>
            {shared.length === 0 && <span className="text-sm muted">Ninguno por ahora.</span>}
            {shared.map((x) => (
              <span key={x.id} style={{ fontSize: 14 }}>
                {x.name} · {x.section}
                <span className="muted">
                  {' '}
                  (encargado: {x.guardians.filter((g) => s.guardians.some((sg) => sg.id === g.id)).map((g) => g.name).join(', ')})
                </span>
              </span>
            ))}
          </div>
          <div className="grid-2">
            <Button onClick={() => (setMsg(null), setEditing('student'))}>Editar datos</Button>
            <Button variant="danger-outline" onClick={() => (setMsg(null), setEditing('withdraw'))}>
              Dar de baja
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

function StudentForm({ s, sections, onSave, onCancel }: { s: LiveStudent; sections: string[]; onSave: (row: Omit<NewStudent, 'guardian'>) => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: s.name, idNumber: s.idNumber, birth: s.birth ?? '', section: s.section === '—' ? '' : s.section, phone: s.phone, accommodation: s.accommodation });
  return (
    <form
      className="stack gap-12"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.name.trim()) onSave(f);
      }}
    >
      <h3 className="title-section">Editar estudiante</h3>
      <InputField id="ed-nombre" label="Nombre completo" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid-2">
        <InputField id="ed-cedula" label="Cédula" value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} />
        <InputField id="ed-nac" label="Nacimiento" type="date" value={f.birth} onChange={(e) => setF({ ...f, birth: e.target.value })} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="ed-seccion" className="field__label">
            Sección
          </label>
          <select id="ed-seccion" className="input" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })}>
            <option value="">Sin sección</option>
            {sections.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <InputField id="ed-tel" label="Teléfono" hint="si es mayor" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
      <CheckCard checked={f.accommodation} onChange={(v) => setF({ ...f, accommodation: v })}>
        Con adecuación: rinde las pruebas en el aula de adecuación que se asigna en cada prueba
      </CheckCard>
      <div className="grid-2">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary">
          Guardar
        </Button>
      </div>
    </form>
  );
}

function GuardianForm({ g, onSave, onCancel }: { g?: LiveStudent['guardians'][number]; onSave: (g: NonNullable<NewStudent['guardian']>) => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: g?.name ?? '', idNumber: g?.idNumber ?? '', relation: g?.relation ?? '', phone: g?.phone ?? '', email: g?.email ?? '' });
  const [error, setError] = useState('');
  return (
    <form
      className="stack gap-12"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.name.trim()) return setError('Escriba el nombre.');
        if (!f.phone.trim() && !f.email.trim()) return setError('Escriba al menos un teléfono o un correo, para que pueda crear su cuenta y recibir avisos.');
        onSave(f);
      }}
    >
      <h3 className="title-section">{g ? 'Editar encargado' : 'Agregar encargado'}</h3>
      {!g && <span className="text-xs muted">Si ya está registrado (por ejemplo, por un hermano), se reutiliza por su cédula o teléfono.</span>}
      <InputField id="g-nombre" label="Nombre completo" error={error === 'Escriba el nombre.' ? error : undefined} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid-2">
        <InputField id="g-cedula" label="Cédula" value={f.idNumber} onChange={(e) => setF({ ...f, idNumber: e.target.value })} />
        <InputField id="g-par" label="Parentesco" placeholder="madre, padre…" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} />
      </div>
      <div className="grid-2">
        <InputField id="g-tel" label="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <InputField id="g-correo" label="Correo" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      {g?.hasAccount && <span className="text-xs muted">Ya usa la app: si cambia el correo aquí, sigue entrando con el correo de su cuenta.</span>}
      {error && error !== 'Escriba el nombre.' && (
        <span className="text-sm ink-orange" role="alert">
          {error}
        </span>
      )}
      <div className="grid-2">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary">
          Guardar
        </Button>
      </div>
    </form>
  );
}

const EMPTY: NewStudent = {
  name: '',
  idNumber: '',
  birth: '',
  section: '',
  phone: '',
  guardian: { name: '', idNumber: '', relation: '', phone: '', email: '' },
};

function AddPanel({ data, onClose }: { data: Students; onClose: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useFlash();
  const g = form.guardian!;
  const set = (patch: Partial<NewStudent>) => setForm({ ...form, ...patch });
  const setG = (patch: Partial<typeof g>) => setForm({ ...form, guardian: { ...g, ...patch } });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.section) return setMsg({ ok: false, text: 'Escriba el nombre y elija la sección.' });
    setBusy(true);
    const { added, problems } = await data.add([form]);
    setBusy(false);
    if (problems.length) return setMsg({ ok: false, text: problems.join(' ') });
    if (added) {
      setForm(EMPTY);
      setMsg({ ok: true, text: `${form.name} quedó matriculado(a). Puede agregar otro.` });
    }
  };

  return (
    <aside aria-labelledby="add-t" className="card split__side gap-16" style={{ padding: 20, flexBasis: 380 }}>
      <form className="stack gap-12" onSubmit={submit}>
        <h2 id="add-t" className="title-section">
          Agregar estudiante
        </h2>
        <InputField id="a-nombre" label="Nombre completo" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid-2">
          <InputField id="a-cedula" label="Cédula" value={form.idNumber} onChange={(e) => set({ idNumber: e.target.value })} />
          <InputField id="a-nac" label="Nacimiento" type="date" value={form.birth} onChange={(e) => set({ birth: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="a-seccion" className="field__label">
              Sección
            </label>
            <select id="a-seccion" className="input" value={form.section} onChange={(e) => set({ section: e.target.value })}>
              <option value="" disabled>
                Elegir
              </option>
              {data.sections.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <InputField id="a-tel" label="Teléfono" hint="si es mayor" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
        </div>
        <h3 className="eyebrow" style={{ paddingTop: 6 }}>
          Encargado legal
        </h3>
        <span className="text-xs muted">Si ya está registrado (por ejemplo, por un hermano), se reutiliza por su cédula o teléfono.</span>
        <InputField id="a-g-nombre" label="Nombre completo" value={g.name} onChange={(e) => setG({ name: e.target.value })} />
        <div className="grid-2">
          <InputField id="a-g-cedula" label="Cédula" value={g.idNumber} onChange={(e) => setG({ idNumber: e.target.value })} />
          <InputField id="a-g-par" label="Parentesco" placeholder="madre, padre…" value={g.relation} onChange={(e) => setG({ relation: e.target.value })} />
        </div>
        <div className="grid-2">
          <InputField id="a-g-tel" label="Teléfono" value={g.phone} onChange={(e) => setG({ phone: e.target.value })} />
          <InputField id="a-g-correo" label="Correo" type="email" value={g.email} onChange={(e) => setG({ email: e.target.value })} />
        </div>
        {msg && (
          <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
            {msg.text}
          </span>
        )}
        <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>Cerrar</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </aside>
  );
}

function downloadTemplate() {
  const example = ['Ana Pérez Mora', '1-1111-1111', '2009-05-14', '10-2', '', 'Rosa Mora Solís', '1-0222-0333', 'madre', '8888-1111', 'rosa@correo.com'];
  const csv = '﻿' + [IMPORT_COLUMNS, example].map((r) => r.join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'plantilla-matricula.csv';
  a.click();
}

function ImportPanel({ data, onClose }: { data: Students; onClose: () => void }) {
  const [rows, setRows] = useState<NewStudent[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; problems: string[] } | null>(null);

  const read = async (file?: File) => {
    setResult(null);
    setRows(file ? parseEnrollment(await file.text()) : []);
  };

  const save = async () => {
    setBusy(true);
    setResult(await data.add(rows));
    setBusy(false);
    setRows([]);
  };

  return (
    <aside aria-labelledby="imp-t" className="card split__side gap-12" style={{ padding: 20, flexBasis: 380 }}>
      <h2 id="imp-t" className="title-section">
        Importar matrícula
      </h2>
      <ol className="text-sm stack gap-4" style={{ paddingLeft: 18, margin: 0 }}>
        <li>Descargue la plantilla y ábrala en Excel.</li>
        <li>Llene una fila por estudiante (la primera fila es de títulos; borre el ejemplo).</li>
        <li>Guárdela como "CSV" y súbala aquí.</li>
      </ol>
      <Button regular onClick={downloadTemplate}>
        Descargar plantilla
      </Button>
      <div className="field">
        <label htmlFor="imp-file" className="field__label">
          Archivo CSV
        </label>
        <input id="imp-file" type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0])} />
      </div>
      {rows.length > 0 && (
        <span className="text-sm">
          {rows.length} estudiantes encontrados en el archivo
          {rows[0] && ` (primero: ${rows[0].name || 'sin nombre'}, sección ${rows[0].section || '—'})`}.
        </span>
      )}
      {result && (
        <div role="status" className="stack gap-4">
          <span className="text-sm strong ink-green">{result.added} estudiantes guardados.</span>
          {result.problems.map((p) => (
            <span key={p} className="text-sm ink-orange">
              {p}
            </span>
          ))}
        </div>
      )}
      <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="primary" disabled={busy || rows.length === 0} onClick={save}>
          {busy ? 'Guardando…' : `Guardar ${rows.length || ''}`}
        </Button>
      </div>
    </aside>
  );
}
