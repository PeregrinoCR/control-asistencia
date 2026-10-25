import { DEFAULT_THRESHOLDS, THRESHOLD_FIELDS } from '../../data/earlyWarning';
import { useEffect, useState } from 'react';
import { Badge, Button, InputField, Segmented, SettingRow, useFlash } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { borrarDatos, cargarEjemplos, CLAVE_DEMO, CUENTAS_DEMO } from '../../lib/devData';
import { aulaDe, eventoActivo, type AulasConfig, type EventoAula } from '../../lib/aulas';
import { ordenSecciones } from '../../lib/secciones';
import { levelOf } from '../../lib/cuidos';
import {
  EXAM_RULES,
  INSTITUTION_FIELDS,
  INSTITUTION_KINDS,
  MODULES,
  SCHOOL_CALENDAR,
  SHIFT_BLOCKS,
  SHIFT_RULES,
  SPECIAL_RULES,
  SPECIAL_SCOPES,
  SPECIAL_TYPES,
  WEEKDAYS,
  moduleDefaults,
  type Sector,
} from '../../data/settings';
import { ruleState } from '../../data/school';
import { useAuth } from '../../lib/auth';
import { LESSONS, localDate } from '../../lib/schedule';
import { justifConfigOf, type JustifConfig } from '../../lib/justificaciones';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';

type Tab = 'inst' | 'mod' | 'jor' | 'esp' | 'exa' | 'dev';

export interface SpecialEvent {
  id: string;
  fecha: string;
  nombre: string;
  tipo: string;
  alcance: string;
  detalle: string;
  programado: boolean;
  /** Early exit: the time lessons end. */
  hora?: string;
  /** Sections or level the change applies to (when `alcance` is not the whole school). */
  secciones?: string[];
  nivel?: string;
}

export interface Exam {
  id: string;
  fecha: string;
  hora: string;
  materia: string;
  seccion: string;
  aula: string;
  publicada: boolean;
  /** First lesson (1–6) and how many lessons it lasts; used to assign exam care. */
  desde?: number;
  lecciones?: number;
  /** Shared by the rows of one exam given to several sections. Older exams have none. */
  grupo?: string;
  /** Lessons for students with accommodations (adecuación): same start, possibly longer. */
  leccionesAdecuacion?: number;
  /** Room where this exam's students with accommodations sit it (shared by the rows of the exam). */
  aulaAdecuacion?: string;
}

/** Everything this screen edits, kept in `colegios` (name, sector, phone, modules) and `colegios.config`. */
interface Form {
  nombre: string;
  sector: Sector;
  telefono: string;
  modulos: Record<string, boolean>;
  institucion: Record<string, string>;
  tipo: number;
  calendario: Record<string, string>;
  sinpe: { numero: string; titular: string };
  jornada: { dias: string[]; reglas: Record<string, boolean>; tarde: number; ausencia: number };
  eventos: SpecialEvent[];
  reglasEspeciales: Record<string, boolean>;
  pruebas: Exam[];
  reglasPruebas: Record<string, boolean>;
  /** Rooms of the school (managed in Académico › Aulas y grupos); the exam calendar suggests from them. */
  aulas: string[];
  aulasGrupo: Record<string, string>;
  eventosAula: EventoAula[];
  /** How long a student has to show the proof and a teacher to decide, and the days that do not count. */
  justificacion: JustifConfig;
}

const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });

/** Dirección · Configuración, saved to the school's record. */
export function SettingsLive() {
  const { school } = useAuth();
  const [tab, setTab] = useState<Tab>('inst');
  const [form, setForm] = useState<Form | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [msg, setMsg] = useFlash();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const db = supabase!;
    (async () => {
      const [c, s] = await Promise.all([
        db.from('colegios').select('nombre, sector, telefono, modulos, config').maybeSingle(),
        db.from('secciones').select('nombre').order('nombre'),
      ]);
      const r = c.data;
      if (!r) return;
      const cfg = r.config ?? {};
      const mods = r.modulos ?? {};
      setForm({
        nombre: r.nombre,
        sector: r.sector,
        telefono: r.telefono ?? '',
        // Older installs saved the payments switch as `pagos`.
        modulos: { ...moduleDefaults(r.sector), ...mods, pay: mods.pay ?? mods.pagos ?? moduleDefaults(r.sector).pay },
        institucion: cfg.institucion ?? {},
        tipo: cfg.tipo ?? 2,
        calendario: cfg.calendario ?? {},
        sinpe: { numero: cfg.sinpe?.numero ?? '', titular: cfg.sinpe?.titular ?? '' },
        jornada: { dias: ['L', 'K', 'M', 'J', 'V'], reglas: ruleState(SHIFT_RULES), tarde: 10, ausencia: 20, ...(cfg.jornada ?? {}) },
        eventos: cfg.eventos ?? [],
        reglasEspeciales: { ...ruleState(SPECIAL_RULES), ...(cfg.reglasEspeciales ?? {}) },
        pruebas: cfg.pruebas ?? [],
        reglasPruebas: { ...ruleState(EXAM_RULES), ...(cfg.reglasPruebas ?? {}) },
        aulas: cfg.aulas ?? [],
        aulasGrupo: cfg.aulasGrupo ?? {},
        eventosAula: cfg.eventosAula ?? [],
        justificacion: justifConfigOf(cfg),
      });
      setSections(ordenarSecciones(s.data).map((x) => x.nombre));
    })();
  }, []);

  const update = (patch: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setMsg(null);
  };

  /** Saves the whole form, keeping settings other screens store in `config`. */
  const save = async (next = form) => {
    if (!next) return '';
    setBusy(true);
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    const { nombre, sector, telefono, modulos, ...rest } = next;
    const { error } = await db
      .from('colegios')
      .update({ nombre: nombre.trim() || '[NOMBRE DEL COLEGIO]', sector, telefono: telefono.trim() || null, modulos, config: { ...(data?.config ?? {}), ...rest } })
      .eq('id', school!.id);
    setBusy(false);
    setMsg(error ? { ok: false, text: 'No se guardó: ' + error.message } : { ok: true, text: 'Cambios guardados' });
    return error?.message ?? '';
  };

  return (
    <AdminLayout>
      <PageHeader
        kicker="Solo dirección y administración pueden cambiar estos ajustes"
        title="Configuración"
        actions={
          <>
            {msg && (
              <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
                {msg.text}
              </span>
            )}
            <Button variant="primary" style={{ padding: '0 18px' }} disabled={!form || busy} onClick={() => save()}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        }
      />

      <Segmented
        label="Secciones de configuración"
        mode="tabs"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'inst', label: 'Institución' },
          { value: 'mod', label: 'Módulos' },
          { value: 'jor', label: 'Jornadas y horarios' },
          { value: 'esp', label: 'Horarios especiales' },
          { value: 'exa', label: 'Horario de exámenes' },
          { value: 'dev', label: 'Desarrollo' },
        ]}
      />

      {!form ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <div role="tabpanel">
          {tab === 'inst' && <InstitutionTab f={form} update={update} />}
          {tab === 'mod' && <ModulesTab f={form} update={update} />}
          {tab === 'jor' && <ShiftsTab f={form} update={update} />}
          {tab === 'esp' && <SpecialTab f={form} update={update} save={save} sections={sections} />}
          {tab === 'exa' && <ExamsTab f={form} update={update} sections={sections} save={save} />}
          {tab === 'dev' && school && <DevTab colegioId={school.id} />}
        </div>
      )}
    </AdminLayout>
  );
}

interface TabProps {
  f: Form;
  update: (patch: Partial<Form>) => void;
}

function InstitutionTab({ f, update }: TabProps) {
  // Name and phone live in their own columns; the rest in config.institucion.
  const value = (id: string) => (id === 'c-nombre' ? f.nombre : id === 'c-tel' ? f.telefono : (f.institucion[id] ?? ''));
  const set = (id: string, v: string) =>
    id === 'c-nombre' ? update({ nombre: v }) : id === 'c-tel' ? update({ telefono: v }) : update({ institucion: { ...f.institucion, [id]: v } });

  // A field with nothing typed (or still the sample text) is pending.
  const empty = (id: string) => !value(id).trim() || value(id).startsWith('[');
  const missing = INSTITUTION_FIELDS.filter((x) => empty(x.id)).length;

  return (
    <div className="split">
      <section aria-labelledby="inst-t" className="card card--roomy split__main">
        <h2 id="inst-t" className="title-section">
          Datos de la institución
        </h2>
        {missing > 0 && (
          <p className="notice notice--pending" role="status">
            Falta completar {missing} de {INSTITUTION_FIELDS.length} datos. Las familias y los reportes los usan.
          </p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {INSTITUTION_FIELDS.map((x) => (
            <InputField key={x.id} id={x.id} type={x.type} label={x.label} hint={empty(x.id) ? 'pendiente' : undefined} placeholder={x.placeholder} value={value(x.id)} onChange={(e) => set(x.id, e.target.value)} />
          ))}
        </div>
        <InputField
          id="c-incap-dias"
          label="Días de incapacidad para pedir sustituto"
          hint="opcional"
          type="number"
          min={1}
          placeholder="Ej.: 5"
          value={value('c-incap-dias')}
          onChange={(e) => set('c-incap-dias', e.target.value)}
        />
        <span className="text-xs muted" style={{ marginTop: -8 }}>
          Un docente ausente no se reemplaza; solo una incapacidad larga puede tener sustituto del MEP. Confirme con su Dirección Regional desde cuántos días se pide. Al pasar de ese número, Hoy le sugiere pedirlo.
        </span>
        <InputField
          id="c-carga-max"
          label="Máximo de lecciones por semana por docente"
          hint="opcional"
          type="number"
          min={1}
          placeholder="Ej.: 30"
          value={value('c-carga-max')}
          onChange={(e) => set('c-carga-max', e.target.value)}
        />
        <span className="text-xs muted" style={{ marginTop: -8 }}>
          En Horarios y cargas, un docente que pase de este número aparece en naranja y se le avisa al colocar sus lecciones. Si lo deja vacío se usan 30.
        </span>
        <fieldset className="fieldset">
          <legend>Alerta temprana</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {THRESHOLD_FIELDS.map((t) => (
              <InputField
                key={t.id}
                id={t.id}
                label={t.label}
                hint={t.hint}
                type="number"
                min={1}
                placeholder={`Ej.: ${DEFAULT_THRESHOLDS[t.key]}`}
                value={value(t.id)}
                onChange={(e) => set(t.id, e.target.value)}
              />
            ))}
          </div>
          <span className="text-xs muted">Si deja un campo vacío se usa el número de ejemplo. Los cambios se aplican la próxima vez que se abra Alerta temprana.</span>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Tipo de institución</legend>
          <div className="row wrap gap-8">
            {INSTITUTION_KINDS.map((k, i) => (
              <button key={k} type="button" className="chip" aria-pressed={i === f.tipo} onClick={() => update({ tipo: i })}>
                {k}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <aside className="split__side stack gap-16">
        <Logo />
        <JustificationRules f={f} update={update} />
        <section aria-labelledby="curso-t" className="card gap-10">
          <h2 id="curso-t" className="title-card">
            Curso lectivo {new Date().getFullYear()}
          </h2>
          {SCHOOL_CALENDAR.filter((c) => !c.label.startsWith('Feriados')).map((c, i) => (
            <InputField
              key={c.label}
              id={`cal-${i}`}
              label={c.label}
              placeholder={c.value}
              value={f.calendario[c.label] ?? ''}
              onChange={(e) => update({ calendario: { ...f.calendario, [c.label]: e.target.value } })}
            />
          ))}
          <span className="text-xs muted">Los feriados y asuetos se registran en Horarios especiales como suspensión de lecciones.</span>
        </section>
      </aside>
    </div>
  );
}

/** School logo: shown in the panel, the student cards and printed reports. */
function Logo() {
  const { school } = useAuth();
  const [url, setUrl] = useState(school?.logo ?? null);
  const [error, setError] = useState('');

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 1_000_000) return setError('La imagen debe pesar menos de 1 MB.');
    const db = supabase!;
    const path = `${school!.id}/logo`;
    const { error } = await db.storage.from('publico').upload(path, file, { upsert: true, contentType: file.type });
    if (error) return setError(error.message);
    const link = `${db.storage.from('publico').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    const { error: e2 } = await db.from('colegios').update({ config: { ...(data?.config ?? {}), logo: link } }).eq('id', school!.id);
    if (e2) return setError(e2.message);
    setError('');
    setUrl(link);
  };

  return (
    <section aria-labelledby="logo-t" className="card gap-10">
      <h2 id="logo-t" className="title-card">
        Escudo o logo
      </h2>
      <label className="dropzone stack" style={{ height: 120, background: 'var(--bg)', fontSize: 14, cursor: 'pointer' }}>
        {url ? <img src={url} alt="Logo actual" style={{ maxHeight: 90, maxWidth: '100%' }} /> : 'Subir imagen PNG, JPG o SVG'}
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {error && (
        <span className="text-sm ink-orange" role="alert">
          {error}
        </span>
      )}
      <span className="text-sm muted">Aparece en el panel, en los carnés y en los reportes impresos. Se guarda al subirla.</span>
    </section>
  );
}

function ModulesTab({ f, update }: TabProps) {
  return (
    <div className="split">
      <section aria-labelledby="mod-t" className="card card--roomy split__main">
        <div className="stack gap-4">
          <h2 id="mod-t" className="title-section">
            Módulos
          </h2>
          <span className="text-sm muted">La app es gratuita para el colegio. Active solo lo que van a usar.</span>
        </div>
        <fieldset className="fieldset">
          <legend>Tipo de centro educativo</legend>
          <div className="row wrap gap-8">
            {([
              ['public', 'Público (MEP)'],
              ['private', 'Privado o subvencionado'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className="chip" aria-pressed={f.sector === value} onClick={() => update({ sector: value, modulos: moduleDefaults(value) })}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-sm muted" style={{ display: 'block', marginTop: 8 }}>
            Al cambiar el tipo se cargan los módulos recomendados. Puede ajustarlos después.
          </span>
        </fieldset>
        <div className="stack">
          {MODULES.map((m) => (
            <SettingRow
              key={m.id}
              label={m.label}
              help={m.id === 'sms' ? 'Si una familia no tiene la app o no le llegó la notificación, se le envía un SMS desde la línea propia del colegio' : m.help}
              checked={!!f.modulos[m.id] && (m.id !== 'smsUrgent' || !!f.modulos.sms)}
              onChange={(v) => update({ modulos: { ...f.modulos, [m.id]: v } })}
            />
          ))}
        </div>
      </section>

      <div className="split__side stack gap-16">
      {f.modulos.sms && <SmsLine />}
      {f.modulos.pay && (
        <aside aria-labelledby="sinpe-t" className="card gap-14">
          <h2 id="sinpe-t" className="title-card">
            Cuenta para recibir pagos
          </h2>
          <InputField id="m-sinpe" type="tel" label="Número SINPE Móvil" placeholder="8888-8888" value={f.sinpe.numero} onChange={(e) => update({ sinpe: { ...f.sinpe, numero: e.target.value } })} />
          <InputField id="m-titular" label="A nombre de" placeholder="Junta administrativa" value={f.sinpe.titular} onChange={(e) => update({ sinpe: { ...f.sinpe, titular: e.target.value } })} />
          <span className="text-sm muted">
            Las familias ven este número al pagar. El dinero llega directo a esta cuenta; la app no cobra comisión ni
            procesa el pago, solo registra el comprobante.
          </span>
        </aside>
      )}
      </div>
    </div>
  );
}

/** The school's own SMS line: an Android phone running "SMS Gateway for Android". */
function SmsLine() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [limit, setLimit] = useState('100');
  const [phone, setPhone] = useState('');
  const [stats, setStats] = useState({ hour: 0, waiting: 0, failed: 0 });
  const [msg, setMsg] = useFlash();

  const load = async () => {
    const db = supabase!;
    const since = new Date(Date.now() - 3600_000).toISOString();
    const [r, h, w, x] = await Promise.all([
      db.rpc('sms_configurado'),
      db.from('notificaciones').select('id', { count: 'exact', head: true }).eq('sms_estado', 'enviado').gte('sms_enviado', since),
      db.from('notificaciones').select('id', { count: 'exact', head: true }).eq('sms_estado', 'pendiente'),
      db.from('notificaciones').select('id', { count: 'exact', head: true }).eq('sms_estado', 'fallo'),
    ]);
    setReady(!!r.data);
    setStats({ hour: h.count ?? 0, waiting: w.count ?? 0, failed: x.count ?? 0 });
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!user.trim() || !pass.trim()) return setMsg({ ok: false, text: 'Escriba el usuario y la contraseña que muestra la app del teléfono.' });
    const { error } = await supabase!.rpc('guardar_sms', { usuario: user.trim(), clave: pass.trim(), limite_hora: Number(limit) || 100 });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Línea SMS conectada.' });
    setPass('');
    load();
  };

  const test = async () => {
    if (!phone.trim()) return;
    const { error } = await supabase!.rpc('sms_prueba', { tel: phone.trim() });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Mensaje de prueba en cola: debería llegar en 1 o 2 minutos.' });
    load();
  };

  return (
    <aside aria-labelledby="sms-t" className="card gap-12">
      <h2 id="sms-t" className="title-card">
        Línea propia para SMS
      </h2>
      <span className={ready ? 'text-sm strong ink-green' : 'text-sm strong ink-orange'}>{ready === null ? '…' : ready ? 'Conectada' : 'Sin conectar'}</span>
      <ol className="text-sm stack gap-4" style={{ paddingLeft: 18, margin: 0, color: 'var(--ink-2)' }}>
        <li>En un teléfono Android con chip y SMS ilimitados, instale "SMS Gateway for Android" (sms-gate.app).</li>
        <li>En la app, active "Cloud server" y copie el usuario y la contraseña que aparecen.</li>
        <li>Déjelo encendido, cargando y con internet.</li>
      </ol>
      <InputField id="s-user" label="Usuario" value={user} onChange={(e) => setUser(e.target.value)} />
      <InputField id="s-pass" label="Contraseña" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
      <InputField id="s-lim" label="Máximo de SMS por hora" type="number" hint="evita bloqueos de la operadora" value={limit} onChange={(e) => setLimit(e.target.value)} />
      <Button variant="dark" onClick={save}>
        {ready ? 'Cambiar datos de la línea' : 'Conectar línea'}
      </Button>
      <span className="text-xs muted">
        Última hora: {stats.hour} enviados · {stats.waiting} en espera · {stats.failed} con error
      </span>
      {ready && (
        <div className="row gap-8" style={{ alignItems: 'flex-end' }}>
          <InputField id="s-test" label="Enviar SMS de prueba a" type="tel" placeholder="8888-8888" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button onClick={test}>Probar</Button>
        </div>
      )}
      {msg && (
        <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-sm strong ink-green' : 'text-sm ink-orange'}>
          {msg.text}
        </span>
      )}
      <span className="text-xs muted">La contraseña se guarda solo en el servidor; nadie la puede ver desde la app.</span>
    </aside>
  );
}

function ShiftsTab({ f, update }: TabProps) {
  const j = f.jornada;
  const setJ = (patch: Partial<Form['jornada']>) => update({ jornada: { ...j, ...patch } });
  return (
    <div className="split">
      <section aria-labelledby="jor-t" className="card card--roomy split__main">
        <div className="stack gap-4">
          <h2 id="jor-t" className="title-section">
            Horario de lecciones · jornada nocturna
          </h2>
          <span className="text-sm muted">Este es el horario que usan el pase de lista y la app de familias. Para cambiarlo, pídalo a soporte.</span>
        </div>
        <div className="table-wrap">
          <table className="table table--dense" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Bloque</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Duración</th>
              </tr>
            </thead>
            <tbody>
              {SHIFT_BLOCKS.noc.blocks.map(([name, start, end, minutes]) => (
                <tr key={name} data-tone={/Recreo|Merienda/.test(name) ? 'rest' : undefined}>
                  <td className="strong">{name}</td>
                  <td>
                    <span className="time-box">{start}</span>
                  </td>
                  <td>
                    <span className="time-box">{end}</span>
                  </td>
                  <td className="muted">{minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="card split__side gap-14">
        <h2 className="title-card">Reglas de la jornada</h2>
        <fieldset className="fieldset">
          <legend>Días con lecciones</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
            {WEEKDAYS.map((d) => {
              const on = j.dias.includes(d.short);
              return (
                <button
                  key={d.short}
                  type="button"
                  className="choice choice--center"
                  style={{ minHeight: 44, borderRadius: 'var(--radius-sm)', fontSize: 15 }}
                  aria-pressed={on}
                  aria-label={d.full}
                  onClick={() => setJ({ dias: on ? j.dias.filter((x) => x !== d.short) : [...j.dias, d.short] })}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid-2">
          <InputField id="j-tarde" type="number" label="Tarde después de (min)" value={String(j.tarde)} onChange={(e) => setJ({ tarde: Number(e.target.value) })} />
          <InputField id="j-aus" type="number" label="Ausente después de (min)" value={String(j.ausencia)} onChange={(e) => setJ({ ausencia: Number(e.target.value) })} />
        </div>
        <div className="stack">
          {SHIFT_RULES.map((r) => (
            <SettingRow key={r.id} label={r.label} help={r.help} checked={j.reglas[r.id]} onChange={(v) => setJ({ reglas: { ...j.reglas, [r.id]: v } })} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function SpecialTab({ f, update, save, sections }: TabProps & { save: (next?: Form) => Promise<string>; sections: string[] }) {
  const { school, session } = useAuth();
  const [type, setType] = useState('early');
  const [scope, setScope] = useState('all');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [detail, setDetail] = useState('');
  const [hora, setHora] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [nivel, setNivel] = useState('');
  const [error, setError] = useState('');
  const t = SPECIAL_TYPES.find((x) => x.id === type)!;
  const upcoming = [...f.eventos].filter((e) => e.fecha >= localDate()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const horas = [...new Set(LESSONS.map((l) => l.end))];
  const niveles = [...new Set(sections.map(levelOf))].sort((a, b) => Number(a) - Number(b));
  // The lesson end time, when the type has one; a manual time is allowed too.
  const horaFinal = hora || horas[horas.length - 1];

  const alcanceTexto = () => {
    if (scope === 'secs') return `Secciones: ${chosen.join(', ')}`;
    if (scope === 'lvl') return `Nivel ${nivel}.º`;
    return 'Toda la jornada';
  };

  const add = async (notify: boolean) => {
    if (!name.trim() || !date) return setError('Escriba el nombre del evento y la fecha.');
    if (scope === 'secs' && chosen.length === 0) return setError('Elija al menos una sección.');
    if (scope === 'lvl' && !nivel) return setError('Elija el nivel.');
    const ev: SpecialEvent = {
      id: crypto.randomUUID(),
      fecha: date,
      nombre: name.trim(),
      tipo: type,
      alcance: alcanceTexto(),
      detalle: (detail.trim() || t.detail.replace('[HORA]', horaFinal) || t.label).replace('[HORA]', horaFinal),
      programado: notify,
      ...(type === 'early' ? { hora: horaFinal } : {}),
      ...(scope === 'secs' ? { secciones: chosen } : {}),
      ...(scope === 'lvl' ? { nivel } : {}),
    };
    const next = { ...f, eventos: [...f.eventos, ev] };
    update({ eventos: next.eventos });
    const err = await save(next);
    if (err) return setError(err);
    if (notify) {
      // Publish it right away as a notice for families.
      const db = supabase!;
      const { data: me } = await db.from('personal').select('id').eq('usuario_id', session!.user.id).maybeSingle();
      await db.from('avisos').insert({
        colegio_id: school!.id,
        tipo: type === 'susp' ? 'sus' : 'urg',
        titulo: `${shortDate(date)}: ${ev.nombre}`,
        cuerpo: `${ev.detalle}. Afecta a: ${ev.alcance.toLowerCase()}.`,
        destino: 'all',
        enviado_por: me?.id ?? null,
      });
    }
    setName('');
    setDate('');
    setDetail('');
    setHora('');
    setChosen([]);
    setNivel('');
    setError('');
  };

  return (
    <div className="split">
      <section aria-labelledby="esp-t" className="stack gap-10" style={{ flex: '1 1 360px', minWidth: 0 }}>
        <h2 id="esp-t" className="title-section">
          Próximos horarios especiales
        </h2>
        {upcoming.length === 0 && <p className="text-sm muted">No hay horarios especiales programados.</p>}
        {upcoming.map((e) => {
          const d = new Date(e.fecha + 'T00:00:00');
          return (
            <div key={e.id} className="card row gap-14" style={{ borderRadius: 'var(--radius-lg)', padding: 14, alignItems: 'stretch' }}>
              <div className="date-chip" data-tone={e.programado ? 'blue' : undefined}>
                <span>{d.toLocaleDateString('es-CR', { month: 'short' })}</span>
                <strong>{d.getDate()}</strong>
              </div>
              <div className="stack gap-4 grow">
                <span className="row between gap-8">
                  <span className="title-item">{e.nombre}</span>
                  <Badge tone={e.programado ? 'green' : 'neutral'}>{e.programado ? 'Avisado' : 'Borrador'}</Badge>
                </span>
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                  {SPECIAL_TYPES.find((x) => x.id === e.tipo)?.label} · {e.detalle}
                </span>
                <span className="text-xs muted">{e.alcance}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="nuevoesp-t" className="card card--roomy split__main" style={{ flexBasis: 480 }}>
        <h2 id="nuevoesp-t" className="title-section">
          Nuevo horario especial
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <InputField id="e-nom" label="Evento o actividad" placeholder="Ej.: Festival deportivo" value={name} onChange={(e) => setName(e.target.value)} />
          <InputField id="e-fecha" label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <fieldset className="fieldset">
          <legend>¿Qué cambia?</legend>
          <div className="row wrap gap-8">
            {SPECIAL_TYPES.map((x) => (
              <button key={x.id} type="button" className="chip" aria-pressed={x.id === type} onClick={() => setType(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <span style={{ display: 'block', marginTop: 10, fontSize: 14, color: 'var(--ink-2)' }}>{t.detail}</span>
        </fieldset>
        {type === 'early' && (
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="e-hora" className="field__label">
              Las lecciones terminan a las
            </label>
            <select id="e-hora" className="input" value={horaFinal} onChange={(e) => setHora(e.target.value)}>
              {horas.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
        )}
        <InputField id="e-det" label="Detalle para las familias" placeholder={t.body} value={detail} onChange={(e) => setDetail(e.target.value)} />
        <fieldset className="fieldset">
          <legend>Afecta a</legend>
          <div className="row wrap gap-8">
            {SPECIAL_SCOPES.map((s) => (
              <button key={s.id} type="button" className="chip chip--square" aria-pressed={s.id === scope} onClick={() => setScope(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          {scope === 'secs' && (
            <div className="row wrap gap-6" style={{ marginTop: 10 }}>
              {sections.map((x) => (
                <button
                  key={x}
                  type="button"
                  className="chip chip--sm"
                  aria-pressed={chosen.includes(x)}
                  onClick={() => setChosen(chosen.includes(x) ? chosen.filter((c) => c !== x) : [...chosen, x])}
                >
                  {chosen.includes(x) ? '✓ ' : ''}
                  {x}
                </button>
              ))}
            </div>
          )}
          {scope === 'lvl' && (
            <div className="field" style={{ maxWidth: 220, marginTop: 10 }}>
              <label htmlFor="e-nivel" className="field__label">
                Nivel
              </label>
              <select id="e-nivel" className="input" value={nivel} onChange={(e) => setNivel(e.target.value)}>
                <option value="">Elija…</option>
                {niveles.map((n) => (
                  <option key={n} value={n}>
                    {n}.º
                  </option>
                ))}
              </select>
            </div>
          )}
        </fieldset>
        <div className="stack">
          {SPECIAL_RULES.map((r) => (
            <SettingRow key={r.id} label={r.label} help={r.help} checked={f.reglasEspeciales[r.id]} onChange={(v) => update({ reglasEspeciales: { ...f.reglasEspeciales, [r.id]: v } })} />
          ))}
        </div>
        {error && (
          <span className="text-sm ink-orange" role="alert">
            {error}
          </span>
        )}
        <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
          <Button size="lg" onClick={() => add(false)}>
            Guardar borrador
          </Button>
          <Button variant="primary" size="lg" style={{ padding: '0 18px' }} onClick={() => add(true)}>
            Guardar y avisar a familias
          </Button>
        </div>
      </section>
    </div>
  );
}

function ExamsTab({ f, update, sections, save }: TabProps & { sections: string[]; save: (next?: Form) => Promise<string> }) {
  const [section, setSection] = useState('Todas');
  const [soloAdec, setSoloAdec] = useState(false);
  // Exams usually start at 8:00 p. m. (4.ª lesson), so students who finish can go home.
  const [draft, setDraft] = useState({ fecha: '', desde: 4, lecciones: 3, leccionesAdecuacion: 3, materia: '' });
  // null = every section is picked (the usual case); the teacher unchecks the ones that do not take the exam.
  const [picked, setPicked] = useState<string[] | null>(null);
  // Rooms typed by hand; anything not typed comes from the school's fixed room or a transfer event on that date.
  const [aulas, setAulas] = useState<Record<string, string>>({});
  // One room for the students with accommodations, shared by all the sections of the exam.
  const [adecOpen, setAdecOpen] = useState(false);
  const [aulaAdec, setAulaAdec] = useState('');
  const [error, setError] = useState('');
  const chosen = picked ?? sections;
  const cfgAulas: AulasConfig = { aulas: f.aulas, aulasGrupo: f.aulasGrupo, eventosAula: f.eventosAula, capacidades: {} };
  const sugerida = (s: string) => (draft.fecha ? aulaDe(cfgAulas, s, draft.fecha) : (f.aulasGrupo[s] ?? ''));
  // The same room used as a normal room by another exam at the same lessons on this day.
  const choqueAdec = aulaAdec && draft.fecha
    ? f.pruebas.filter(
        (x) =>
          x.aula === aulaAdec &&
          x.fecha === draft.fecha &&
          x.desde !== undefined &&
          x.desde <= draft.desde + draft.lecciones - 1 &&
          draft.desde <= x.desde + (x.lecciones ?? 1) - 1,
      )
    : [];
  const trasladadas = draft.fecha ? chosen.map((s) => ({ s, ev: eventoActivo(cfgAulas, s, draft.fecha) })).filter((x) => x.ev) : [];

  // One row per exam: the sections that take it share a `grupo`. Older exams without one stand alone.
  const groupOf = (x: Exam) => x.grupo ?? x.id;
  const visibleKeys = new Set(
    f.pruebas.filter((x) => (section === 'Todas' || x.seccion === section) && (!soloAdec || !!x.aulaAdecuacion)).map(groupOf),
  );
  const rows = Object.values(
    f.pruebas.filter((x) => visibleKeys.has(groupOf(x))).reduce<Record<string, Exam[]>>((acc, x) => {
      (acc[groupOf(x)] ??= []).push(x);
      return acc;
    }, {}),
  ).sort((a, b) => a[0].fecha.localeCompare(b[0].fecha));
  const drafts = f.pruebas.filter((x) => !x.publicada).length;

  const toggle = (s: string) => setPicked(chosen.includes(s) ? chosen.filter((x) => x !== s) : [...chosen, s]);

  const add = () => {
    if (!draft.fecha || !draft.materia.trim() || chosen.length === 0) return setError('Complete fecha, materia y al menos una sección.');
    // The day ends with the 6.ª lesson (9:50 p. m.); no exam may run past it.
    const ultima = LESSONS.length;
    if (draft.desde + draft.lecciones - 1 > ultima || draft.desde + draft.leccionesAdecuacion - 1 > ultima)
      return setError('La prueba termina después de las 9:50 p. m. Elija una hora de inicio más temprana o menos lecciones.');
    const hora = LESSONS[draft.desde - 1]?.start ?? '';
    const grupo = crypto.randomUUID();
    const nuevas: Exam[] = chosen.map((seccion) => ({
      id: crypto.randomUUID(),
      grupo,
      fecha: draft.fecha,
      hora,
      desde: draft.desde,
      lecciones: draft.lecciones,
      leccionesAdecuacion: draft.leccionesAdecuacion,
      materia: draft.materia.trim(),
      seccion,
      aula: (aulas[seccion] ?? sugerida(seccion)).trim(),
      ...(aulaAdec ? { aulaAdecuacion: aulaAdec } : {}),
      publicada: false,
    }));
    update({ pruebas: [...f.pruebas, ...nuevas] });
    setDraft({ ...draft, materia: '' });
    setAulas({});
    setError('');
  };

  const remove = (key: string) => update({ pruebas: f.pruebas.filter((x) => groupOf(x) !== key) });

  const publish = () => {
    const pruebas = f.pruebas.map((x) => ({ ...x, publicada: true }));
    update({ pruebas });
    return save({ ...f, pruebas });
  };

  return (
    <div className="split">
      <section aria-labelledby="exa-t" className="card card--roomy split__main gap-14" style={{ flexBasis: 560 }}>
        <div className="stack gap-2">
          <h2 id="exa-t" className="title-section">
            Calendario de pruebas
          </h2>
          <span className="text-sm muted">Las pruebas publicadas aparecen en el horario de la app de cada estudiante y su encargado.</span>
        </div>
        <div className="row wrap gap-6">
          {['Todas', ...sections].map((s) => (
            <button key={s} type="button" className="chip chip--sm" aria-pressed={s === section} onClick={() => setSection(s)}>
              {s}
            </button>
          ))}
          <button type="button" className="chip chip--sm" aria-pressed={soloAdec} onClick={() => setSoloAdec(!soloAdec)}>
            Con adecuación
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm muted">No hay pruebas registradas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table table--dense" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Horario</th>
                  <th>Materia</th>
                  <th>Secciones y aula</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const first = g[0];
                  const published = g.every((x) => x.publicada);
                  return (
                    <tr key={groupOf(first)}>
                      <td className="strong">{shortDate(first.fecha)}</td>
                      <td className="tabular">
                        {first.hora}
                        {first.lecciones ? <span className="text-xs muted"> · {first.lecciones} lecc.</span> : null}
                        {first.leccionesAdecuacion && first.leccionesAdecuacion !== first.lecciones ? (
                          <span className="text-xs muted"> · adecuación {first.leccionesAdecuacion}</span>
                        ) : null}
                      </td>
                      <td>{first.materia}</td>
                      <td>
                        <span className="text-sm">
                          {[...g].sort((x, y) => ordenSecciones(x.seccion, y.seccion)).map((x, i) => (
                            <span key={x.id}>
                              {i > 0 && ' · '}
                              <strong>{x.seccion}</strong> {x.aula ? `Aula ${x.aula.replace(/^Aula /, '')}` : <span className="muted">sin aula</span>}
                            </span>
                          ))}
                          {first.aulaAdecuacion && <span className="text-xs muted" style={{ display: 'block' }}>Adecuación: {first.aulaAdecuacion}</span>}
                        </span>
                      </td>
                      <td>
                        <Badge tone={published ? 'green' : 'neutral'}>{published ? 'Publicada' : 'Borrador'}</Badge>
                      </td>
                      <td>
                        <button type="button" className="link-button text-sm" onClick={() => remove(groupOf(first))}>
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="stack gap-10" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
          <h3 className="title-item">Agregar prueba</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <InputField id="x-fecha" type="date" label="Fecha" value={draft.fecha} onChange={(e) => setDraft({ ...draft, fecha: e.target.value })} />
            <div className="field">
              <label htmlFor="x-desde" className="field__label">
                Empieza
              </label>
              <select id="x-desde" className="input" value={draft.desde} onChange={(e) => setDraft({ ...draft, desde: Number(e.target.value) })}>
                {LESSONS.map((l) => (
                  <option key={l.n} value={l.n}>
                    {l.start} ({l.n}.ª)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="x-dur" className="field__label">
                Duración
              </label>
              <select
                id="x-dur"
                className="input"
                value={draft.lecciones}
                onChange={(e) => {
                  const lecciones = Number(e.target.value);
                  setDraft({ ...draft, lecciones, leccionesAdecuacion: Math.max(lecciones, draft.leccionesAdecuacion) });
                }}
              >
                {LESSONS.map((l) => (
                  <option key={l.n} value={l.n}>
                    {l.n} {l.n === 1 ? 'lección' : 'lecciones'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="x-dur-adec" className="field__label">
                Con adecuación
              </label>
              <select id="x-dur-adec" className="input" value={draft.leccionesAdecuacion} onChange={(e) => setDraft({ ...draft, leccionesAdecuacion: Number(e.target.value) })}>
                {LESSONS.filter((l) => l.n >= draft.lecciones)
                  .map((l) => (
                    <option key={l.n} value={l.n}>
                      {l.n} {l.n === 1 ? 'lección' : 'lecciones'}
                    </option>
                  ))}
              </select>
            </div>
            <InputField id="x-mat" label="Materia" value={draft.materia} onChange={(e) => setDraft({ ...draft, materia: e.target.value })} />
          </div>
          <div className="stack gap-6">
            <span className="text-sm" style={{ fontWeight: 600 }}>
              Secciones que presentan la prueba <span className="muted">· {chosen.length} de {sections.length}</span>
            </span>
            <div className="row wrap gap-6">
              {sections.map((s) => (
                <button key={s} type="button" className="chip chip--sm" aria-pressed={chosen.includes(s)} onClick={() => toggle(s)}>
                  {chosen.includes(s) ? '✓ ' : ''}
                  {s}
                </button>
              ))}
              <button type="button" className="chip chip--sm" aria-pressed={adecOpen} onClick={() => setAdecOpen(!adecOpen)}>
                Adecuación
              </button>
            </div>
            {adecOpen && (
              <div className="field" style={{ maxWidth: 260 }}>
                <label htmlFor="x-aula-adec" className="field__label">
                  Aula de estudiantes con adecuación
                </label>
                <select id="x-aula-adec" className="input" value={aulaAdec} onChange={(e) => setAulaAdec(e.target.value)}>
                  <option value="">Sin aula especial</option>
                  {f.aulas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
                {choqueAdec.length > 0 && (
                  <span className="text-xs strong ink-orange" role="status">
                    Choque: {aulaAdec} ya la usa {choqueAdec.map((x) => `${x.seccion} (${x.materia})`).join(', ')} a esa hora.
                  </span>
                )}
              </div>
            )}
          </div>
          {chosen.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {chosen.map((s) => (
                <div key={s} className="field">
                  <label htmlFor={`x-aula-${s}`} className="field__label">
                    Aula de {s}
                  </label>
                  <input
                    id={`x-aula-${s}`}
                    className="input"
                    list="x-aulas"
                    placeholder="Aula"
                    value={aulas[s] ?? sugerida(s)}
                    onChange={(e) => setAulas({ ...aulas, [s]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}
          {trasladadas.length > 0 && (
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
              Traslado activo ese día: {trasladadas.map((x) => `${x.s} → ${x.ev!.aulas[x.s]} (${x.ev!.nombre})`).join(', ')}.
            </span>
          )}
          <datalist id="x-aulas">
            {f.aulas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          {error && (
            <span className="text-sm ink-orange" role="alert">
              {error}
            </span>
          )}
          <Button variant="dashed" size="md" style={{ alignSelf: 'flex-start' }} onClick={add}>
            + Agregar prueba a {chosen.length} {chosen.length === 1 ? 'sección' : 'secciones'}
          </Button>
          <span className="text-xs muted">Recuerde presionar "Guardar cambios" o "Publicar calendario".</span>
        </div>
      </section>

      <aside className="card split__side gap-4" style={{ flexBasis: 300 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Avisos de pruebas</h2>
        {EXAM_RULES.map((r) => (
          <SettingRow key={r.id} label={r.label} help={r.help} checked={f.reglasPruebas[r.id]} onChange={(v) => update({ reglasPruebas: { ...f.reglasPruebas, [r.id]: v } })} />
        ))}
        <Button variant="primary" style={{ marginTop: 8, height: 48 }} disabled={!f.pruebas.length} onClick={publish}>
          {drafts ? `Publicar calendario (${drafts} en borrador)` : 'Calendario publicado'}
        </Button>
      </aside>
    </div>
  );
}

/** Temporary, for the development phase: empty the school's data, or load sample data into an empty school. */
function DevTab({ colegioId }: { colegioId: string }) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Both actions reload the page, so the screens read the new data.
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError('');
    const err = await action();
    setBusy(false);
    if (err) return setError(err);
    window.location.reload();
  };

  // Creates (or reuses) the demonstration accounts on the server; they are then linked to the people rows.
  const crearCuentas = async () => {
    const { data, error } = await supabase!.functions.invoke<{ error?: string }>('crear-demos');
    if (error || data?.error) return error?.message ?? data?.error ?? 'No se crearon las cuentas.';
    return '';
  };

  return (
    <section aria-labelledby="dev-t" className="card card--roomy stack gap-14">
      <div className="stack gap-2">
        <h2 id="dev-t" className="title-section">
          Desarrollo
        </h2>
        <span className="text-sm muted">Herramientas para la fase de pruebas. Se quitan antes de la versión final.</span>
      </div>
      <div className="stack gap-8">
        <span className="text-sm">
          <strong>Borrar los datos del colegio.</strong> Quita estudiantes, encargados, personal (excepto su cuenta), secciones, horarios, pruebas, avisos y registros. El nombre, los módulos y la institución se conservan.
        </span>
        <InputField id="dev-word" label="Escriba BORRAR para confirmar" value={word} onChange={(e) => setWord(e.target.value)} />
        <div>
          <Button variant="primary" disabled={busy || word.trim() !== 'BORRAR'} onClick={() => run(borrarDatos)}>
            {busy ? 'Borrando…' : 'Borrar datos'}
          </Button>
        </div>
      </div>
      <div className="stack gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
        <span className="text-sm">
          <strong>Cargar datos de ejemplo.</strong> Solo si el colegio no tiene secciones: 8 secciones, 6 docentes, materias y horarios. Luego importe los estudiantes en Estudiantes › Importar matrícula.
        </span>
        <div>
          <Button disabled={busy} onClick={() => run(() => cargarEjemplos(colegioId))}>
            {busy ? 'Cargando…' : 'Cargar datos de ejemplo'}
          </Button>
        </div>
      </div>
      <div className="stack gap-8" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
        <span className="text-sm">
          <strong>Cuentas de demostración.</strong> Una por rol, con correo confirmado (no llega ningún correo). Entre con
          la cuenta y compruebe su pantalla. Dirección usa su cuenta real.
        </span>
        <table className="table table--dense">
          <thead>
            <tr>
              <th>Rol</th>
              <th>Correo</th>
              <th>Contraseña</th>
            </tr>
          </thead>
          <tbody>
            {CUENTAS_DEMO.map((c) => (
              <tr key={c.correo}>
                <td>{c.rol}</td>
                <td>{c.correo}</td>
                <td>{CLAVE_DEMO}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <Button disabled={busy} onClick={() => run(crearCuentas)}>
            {busy ? 'Creando…' : 'Crear cuentas de demostración'}
          </Button>
        </div>
      </div>
      {error && (
        <span className="text-sm ink-orange" role="alert">
          {error}
        </span>
      )}
    </section>
  );
}

/** How absences are justified: who decides, and the deadlines in school days. */
function JustificationRules({ f, update }: TabProps) {
  const [day, setDay] = useState('');
  const j = f.justificacion;
  const set = (patch: Partial<JustifConfig>) => update({ justificacion: { ...j, ...patch } });
  const add = () => {
    if (!day || j.noLectivos.includes(day)) return;
    set({ noLectivos: [...j.noLectivos, day].sort() });
    setDay('');
  };
  return (
    <section aria-labelledby="just-t" className="card gap-10">
      <h2 id="just-t" className="title-card">
        Justificar ausencias
      </h2>
      <span className="text-sm muted">El estudiante presenta el comprobante en papel a cada profesor con quien faltó, y cada profesor decide por su lección.</span>
      <div className="grid-2">
        <InputField id="j-fam" label="Plazo de la familia" hint="días hábiles" type="number" min={1} value={String(j.diasFamilia)} onChange={(e) => set({ diasFamilia: Number(e.target.value) || 1 })} />
        <InputField id="j-doc" label="Plazo del docente" hint="días hábiles" type="number" min={1} value={String(j.diasDocente)} onChange={(e) => set({ diasDocente: Number(e.target.value) || 1 })} />
      </div>
      <div className="stack gap-6">
        <span className="field__label">Días sin lecciones (feriados, asuetos)</span>
        <span className="text-xs muted">No se cuentan como días hábiles en los plazos.</span>
        <div className="row wrap gap-6">
          {j.noLectivos.length === 0 && <span className="text-sm muted">Ninguno agregado.</span>}
          {j.noLectivos.map((d) => (
            <button key={d} type="button" className="chip chip--sm" onClick={() => set({ noLectivos: j.noLectivos.filter((x) => x !== d) })} aria-label={`Quitar ${shortDate(d)}`}>
              {shortDate(d)} ✕
            </button>
          ))}
        </div>
        <div className="row gap-8" style={{ alignItems: 'flex-end' }}>
          <InputField id="j-dia" label="Agregar un día" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 170 }} />
          <Button onClick={add} disabled={!day}>
            Agregar
          </Button>
        </div>
      </div>
    </section>
  );
}
