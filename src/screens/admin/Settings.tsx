import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Icon, InputField, Segmented, SettingRow } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import {
  EXAMS,
  EXAM_RULES,
  EXAM_SECTIONS,
  INSTITUTION_FIELDS,
  INSTITUTION_KINDS,
  SCHOOL_CALENDAR,
  SHIFT_BLOCKS,
  SHIFT_DAYS,
  SHIFT_RULES,
  SPECIAL_EVENTS,
  SPECIAL_RULES,
  SPECIAL_SCOPES,
  SPECIAL_TYPES,
  WEEKDAYS,
  MODULES,
  moduleDefaults,
  type Sector,
  type ShiftId,
} from '../../data/settings';
import { ruleState } from '../../data/school';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';
import { SettingsLive } from './SettingsLive';

type Tab = 'inst' | 'mod' | 'jor' | 'prof' | 'esp' | 'exa';

/** Dirección · Configuración */
export function Settings() {
  return supabase ? <SettingsLive /> : <SettingsSample />;
}

/** The sample screen, shown while no server is configured. */
function SettingsSample() {
  const [tab, setTab] = useState<Tab>('inst');
  const [saved, setSaved] = useState(false);

  return (
    <AdminLayout>
      <PageHeader
        kicker="Solo dirección y administración pueden cambiar estos ajustes"
        title="Configuración"
        actions={
          <>
            {saved && (
              <span role="status" style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-ink)' }}>
                Cambios guardados
              </span>
            )}
            <Button variant="primary" style={{ padding: '0 18px' }} onClick={() => setSaved(true)}>
              Guardar cambios
            </Button>
          </>
        }
      />

      <Segmented
        label="Secciones de configuración"
        mode="tabs"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setSaved(false);
        }}
        options={[
          { value: 'inst', label: 'Institución' },
          { value: 'mod', label: 'Módulos' },
          { value: 'jor', label: 'Jornadas y horarios' },
          { value: 'prof', label: 'Profesores y secciones' },
          { value: 'esp', label: 'Horarios especiales' },
          { value: 'exa', label: 'Horario de exámenes' },
        ]}
      />

      <div role="tabpanel">
        {tab === 'inst' && <InstitutionTab />}
        {tab === 'mod' && <ModulesTab />}
        {tab === 'jor' && <ShiftsTab />}
        {tab === 'prof' && <RolesTab />}
        {tab === 'esp' && <SpecialTab />}
        {tab === 'exa' && <ExamsTab />}
      </div>
    </AdminLayout>
  );
}

function InstitutionTab() {
  const [kind, setKind] = useState(2);
  return (
    <div className="split">
      <section aria-labelledby="inst-t" className="card card--roomy split__main">
        <h2 id="inst-t" className="title-section">
          Datos de la institución
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {INSTITUTION_FIELDS.map((f) => (
            <InputField key={f.id} id={f.id} type={f.type} label={f.label} placeholder={f.placeholder} />
          ))}
        </div>
        <fieldset className="fieldset">
          <legend>Tipo de institución</legend>
          <div className="row wrap gap-8">
            {INSTITUTION_KINDS.map((k, i) => (
              <button key={k} type="button" className="chip" aria-pressed={i === kind} onClick={() => setKind(i)}>
                {k}
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <aside className="split__side stack gap-16">
        <section aria-labelledby="logo-t" className="card gap-10">
          <h2 id="logo-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Escudo o logo
          </h2>
          <button type="button" className="dropzone stack" style={{ height: 120, background: 'var(--bg)', fontSize: 14 }}>
            <Icon name="upload" size={24} style={{ color: 'var(--blue)' }} />
            Subir imagen PNG o SVG
          </button>
          <span className="text-sm muted">Aparece en la app de las familias, los comprobantes y los reportes.</span>
        </section>
        <section aria-labelledby="curso-t" className="card gap-4">
          <h2 id="curso-t" style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            Curso lectivo 2026
          </h2>
          {SCHOOL_CALENDAR.map((c) => (
            <div key={c.label} className="row between gap-10" style={{ padding: '9px 0', borderTop: '1px solid var(--border-soft)', fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span style={{ color: 'var(--ink-2)', textAlign: 'right' }}>{c.value}</span>
            </div>
          ))}
          <Button variant="dashed" size="sm" style={{ marginTop: 6, alignSelf: 'flex-start', height: 38 }}>
            + Agregar feriado o asueto
          </Button>
        </section>
      </aside>
    </div>
  );
}

function ModulesTab() {
  const [sector, setSector] = useState<Sector>('public');
  const [modules, setModules] = useState(moduleDefaults('public'));

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
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={sector === value}
                onClick={() => {
                  setSector(value);
                  setModules(moduleDefaults(value));
                }}
              >
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
              help={m.help}
              checked={modules[m.id] && (m.id !== 'smsUrgent' || modules.sms)}
              onChange={(v) => setModules({ ...modules, [m.id]: v })}
            />
          ))}
        </div>
      </section>

      {modules.pay && (
        <aside aria-labelledby="sinpe-t" className="card split__side gap-14">
          <h2 id="sinpe-t" style={{ fontSize: 16, fontWeight: 700 }}>
            Cuenta para recibir pagos
          </h2>
          <InputField id="m-sinpe" type="tel" label="Número SINPE Móvil" placeholder="[NÚMERO SINPE]" />
          <InputField id="m-titular" label="A nombre de" placeholder="[NOMBRE DEL TITULAR]" />
          <span className="text-sm muted">
            Las familias ven este número al pagar. El dinero llega directo a esta cuenta; la app no cobra comisión ni
            procesa el pago, solo registra el comprobante.
          </span>
        </aside>
      )}
    </div>
  );
}

function ShiftsTab() {
  const [shift, setShift] = useState<ShiftId>('noc');
  const [days, setDays] = useState(SHIFT_DAYS);
  const [rules, setRules] = useState(ruleState(SHIFT_RULES));
  const active = days[shift];
  const toggleDay = (d: string) =>
    setDays({ ...days, [shift]: active.includes(d) ? active.filter((x) => x !== d) : [...active, d] });

  return (
    <div className="split">
      <section aria-labelledby="jor-t" className="card card--roomy split__main">
        <div className="row wrap between gap-10">
          <h2 id="jor-t" className="title-section">
            Horario de lecciones
          </h2>
          <div className="row wrap gap-6">
            {(Object.keys(SHIFT_BLOCKS) as ShiftId[]).map((k) => (
              <button key={k} type="button" className="chip" style={{ height: 38 }} aria-pressed={k === shift} onClick={() => setShift(k)}>
                {SHIFT_BLOCKS[k].label}
              </button>
            ))}
            <button type="button" className="chip chip--dashed" style={{ height: 38 }}>
              + Nueva jornada
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table table--dense" style={{ minWidth: 520 }}>
            <thead>
              <tr>
                <th>Bloque</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Duración</th>
                <th>Pase de lista</th>
              </tr>
            </thead>
            <tbody>
              {SHIFT_BLOCKS[shift].blocks.map(([name, start, end, minutes]) => {
                const rest = /Recreo|Merienda|Almuerzo/.test(name);
                return (
                  <tr key={name} data-tone={rest ? 'rest' : undefined}>
                    <td className="strong">{name}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className="time-box">{start}</span>
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className="time-box">{end}</span>
                    </td>
                    <td className="muted">{minutes} min</td>
                    <td style={{ color: 'var(--ink-2)' }}>{rest ? '—' : 'Docente de la lección'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row wrap gap-8">
          <Button variant="dashed" size="md">
            + Agregar lección
          </Button>
          <Button variant="dashed" size="md">
            + Agregar recreo
          </Button>
          <Button size="md">Duplicar jornada</Button>
        </div>
      </section>

      <aside className="card split__side gap-14">
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Reglas de la jornada {SHIFT_BLOCKS[shift].label.toLowerCase()}</h2>
        <fieldset className="fieldset">
          <legend>Días con lecciones</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
            {WEEKDAYS.map((d) => (
              <button
                key={d.short}
                type="button"
                className="choice choice--center"
                style={{ minHeight: 44, borderRadius: 'var(--radius-sm)', fontSize: 15 }}
                aria-pressed={active.includes(d.short)}
                aria-label={d.full}
                onClick={() => toggleDay(d.short)}
              >
                {d.short}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="stack gap-10" style={{ fontSize: 14 }}>
          <div className="row between gap-10">
            <span>
              Se marca <strong>tarde</strong> después de
            </span>
            <span className="time-box time-box--tall">10 min</span>
          </div>
          <div className="row between gap-10">
            <span>
              Cuenta como <strong>ausencia</strong> después de
            </span>
            <span className="time-box time-box--tall">20 min</span>
          </div>
        </div>
        <div className="stack">
          {SHIFT_RULES.map((r) => (
            <SettingRow key={r.id} label={r.label} help={r.help} checked={rules[r.id]} onChange={(v) => setRules({ ...rules, [r.id]: v })} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function RolesTab() {
  return (
    <div className="stack gap-16">
      <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <SmallStat label="Profesores" value="24" />
        <SmallStat label="Secciones" value="8" />
        <SmallStat label="Materias" value="9" />
        <SmallStat label="Materias sin profesor" value="2" orange />
      </div>
      <div className="card row wrap between gap-12">
        <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>
          Asigne profesores a cada materia y sección, y elija al profesor guía.
        </span>
        <div className="row wrap gap-8">
          <Button style={{ fontSize: 14, padding: '0 14px' }}>Importar desde Excel</Button>
          <Link to={routes.admin.assignments} className="btn btn--dark" style={{ fontSize: 14 }}>
            Abrir profesores y secciones
          </Link>
        </div>
      </div>
      <div className="card row wrap between gap-12">
        <span className="stack gap-2">
          <span className="title-section">Roles y permisos</span>
          <span className="text-sm muted">Qué puede hacer cada rol y cada persona del personal.</span>
        </span>
        <Link to={routes.admin.users} className="btn btn--dark" style={{ fontSize: 14 }}>
          Abrir usuarios y permisos
        </Link>
      </div>
    </div>
  );
}

function SmallStat({ label, value, orange }: { label: string; value: string; orange?: boolean }) {
  return (
    <div className="stat stat--compact" style={{ gap: 0 }}>
      <span className="stat__label" style={{ fontSize: 13 }}>
        {label}
      </span>
      <span className={orange ? 'stat__value ink-orange' : 'stat__value'} style={{ fontSize: 30 }}>
        {value}
      </span>
    </div>
  );
}

function SpecialTab() {
  const [type, setType] = useState('early');
  const [scope, setScope] = useState('all');
  const [rules, setRules] = useState(ruleState(SPECIAL_RULES));
  const t = SPECIAL_TYPES.find((x) => x.id === type)!;

  return (
    <div className="split">
      <section aria-labelledby="esp-t" className="stack gap-10" style={{ flex: '1 1 360px', minWidth: 0 }}>
        <h2 id="esp-t" className="title-section">
          Próximos horarios especiales
        </h2>
        {SPECIAL_EVENTS.map((e) => (
          <div key={e.name} className="card row gap-14" style={{ borderRadius: 'var(--radius-lg)', padding: 14, alignItems: 'stretch' }}>
            <div className="date-chip" data-tone={e.scheduled ? 'blue' : undefined}>
              <span>{e.month}</span>
              <strong>{e.day}</strong>
            </div>
            <div className="stack gap-4 grow">
              <span className="row between gap-8">
                <span style={{ fontSize: 15, fontWeight: 700 }}>{e.name}</span>
                <Badge tone={e.scheduled ? 'green' : 'neutral'}>{e.scheduled ? 'Programado' : 'Borrador'}</Badge>
              </span>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{e.change}</span>
              <span className="text-xs muted">
                {e.who} · {e.notice}
              </span>
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="nuevoesp-t" className="card card--roomy split__main" style={{ flexBasis: 480 }}>
        <h2 id="nuevoesp-t" className="title-section">
          Nuevo horario especial
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <InputField id="e-nom" label="Evento o actividad" placeholder="Ej.: Festival deportivo" />
          <InputField id="e-fecha" label="Fecha" placeholder="dd/mm/aaaa" />
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
        <fieldset className="fieldset">
          <legend>Afecta a</legend>
          <div className="row wrap gap-8">
            {SPECIAL_SCOPES.map((s) => (
              <button key={s.id} type="button" className="chip chip--square" aria-pressed={s.id === scope} onClick={() => setScope(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="stack">
          {SPECIAL_RULES.map((r) => (
            <SettingRow key={r.id} label={r.label} help={r.help} checked={rules[r.id]} onChange={(v) => setRules({ ...rules, [r.id]: v })} />
          ))}
        </div>
        <div className="card card--night gap-6" style={{ borderRadius: 'var(--radius-lg)', padding: 14 }}>
          <span className="eyebrow" style={{ fontSize: 12, letterSpacing: 0.6, color: 'var(--night-ink-3)' }}>
            Así llega la alerta
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{t.title}</span>
          <span style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--night-ink-4)' }}>{t.body}</span>
        </div>
        <div className="row wrap gap-8" style={{ justifyContent: 'flex-end' }}>
          <Button size="lg">Guardar borrador</Button>
          <Button variant="primary" size="lg" style={{ padding: '0 18px' }}>
            Programar y avisar
          </Button>
        </div>
      </section>
    </div>
  );
}

function ExamsTab() {
  const [section, setSection] = useState('Todas');
  const [rules, setRules] = useState(ruleState(EXAM_RULES));
  const [published, setPublished] = useState(false);
  const exams = EXAMS.filter((x) => section === 'Todas' || x.section === section);

  return (
    <div className="split">
      <section aria-labelledby="exa-t" className="card card--roomy split__main gap-14" style={{ flexBasis: 560 }}>
        <div className="row wrap between gap-10">
          <div className="stack gap-2">
            <h2 id="exa-t" className="title-section">
              Calendario de pruebas · II periodo
            </h2>
            <span className="text-sm muted">Las pruebas aparecen en la app de cada estudiante y de su encargado.</span>
          </div>
          <Button variant="dashed" size="md">
            + Agregar prueba
          </Button>
        </div>
        <div className="row wrap gap-6">
          {EXAM_SECTIONS.map((s) => (
            <button key={s} type="button" className="chip chip--sm" aria-pressed={s === section} onClick={() => setSection(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="table table--dense" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Materia</th>
                <th>Sección</th>
                <th>Docente</th>
                <th>Aula</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((x) => (
                <tr key={`${x.date}-${x.section}-${x.subject}`}>
                  <td className="strong">{x.date}</td>
                  <td className="tabular">{x.time}</td>
                  <td>{x.subject}</td>
                  <td>{x.section}</td>
                  <td>{x.teacher}</td>
                  <td>{x.room}</td>
                  <td>
                    <Badge tone={x.published ? 'green' : 'neutral'}>{x.published ? 'Publicada' : 'Borrador'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="text-sm muted">
          {exams.length} pruebas · {exams.filter((x) => !x.published).length} en borrador
        </span>
      </section>

      <aside className="card split__side gap-4" style={{ flexBasis: 300 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Avisos de pruebas</h2>
        {EXAM_RULES.map((r) => (
          <SettingRow key={r.id} label={r.label} help={r.help} checked={rules[r.id]} onChange={(v) => setRules({ ...rules, [r.id]: v })} />
        ))}
        <div className="setting-row between" style={{ fontSize: 14 }}>
          <span>
            <strong>Plazo para justificar</strong> una ausencia a prueba
          </span>
          <span className="time-box time-box--tall">[N.º] días</span>
        </div>
        <Button
          variant="primary"
          style={{ marginTop: 8, height: 48, background: published ? 'var(--green)' : undefined }}
          onClick={() => setPublished(true)}
        >
          {published ? 'Calendario publicado a las familias' : 'Publicar calendario a las familias'}
        </Button>
      </aside>
    </div>
  );
}
