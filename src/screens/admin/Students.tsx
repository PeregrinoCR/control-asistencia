import { useState } from 'react';
import { Avatar, Button, Icon, MiniStat, Segmented, StatusBadge } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { ENROLLMENT, PERM_STATUS, STUDENTS, type AppUse } from '../../data/admin';
import { supabase } from '../../lib/supabase';
import { StudentsLive } from './StudentsLive';

type AgeFilter = 'all' | 'min' | 'adu';

const appInk = (app: AppUse) =>
  app === 'Usa la app' ? 'var(--green-ink)' : app === 'Solo SMS' ? 'var(--muted)' : 'var(--orange-ink)';

/** Dirección · Estudiantes */
export function Students() {
  return supabase ? <StudentsLive /> : <StudentsSample />;
}

/** The sample screen, shown while no server is configured. */
function StudentsSample() {
  const [filter, setFilter] = useState<AgeFilter>('all');
  const [selectedId, setSelectedId] = useState(2);

  const list = STUDENTS.filter((s) => filter === 'all' || (filter === 'min' ? s.age < 18 : s.age >= 18));
  const s = STUDENTS.find((x) => x.id === selectedId) ?? STUDENTS[1];
  const adult = s.age >= 18;

  return (
    <AdminLayout>
      <PageHeader
        kicker={`Jornada nocturna · ${ENROLLMENT.total} matriculados · ${ENROLLMENT.minors} menores de edad`}
        title="Estudiantes"
        actions={
          <>
            <Button regular>Importar matrícula</Button>
            <Button variant="primary">Agregar estudiante</Button>
          </>
        }
      />

      <div className="row wrap gap-10">
        <div className="search">
          <Icon name="search" size={18} />
          <label htmlFor="e-buscar" className="sr-only">
            Buscar estudiante
          </label>
          <input id="e-buscar" type="search" className="input" placeholder="Buscar por nombre, cédula o encargado" />
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
        <Button regular style={{ fontSize: 14, padding: '0 14px' }}>
          Todas las secciones
        </Button>
      </div>

      <div className="split">
        <section aria-label="Lista de estudiantes" className="card split__main" style={{ padding: '8px 18px 18px', gap: 0, flexBasis: 560 }}>
          <div className="table-wrap">
            <table className="table table--compact" style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Sección</th>
                  <th>Edad</th>
                  <th>Recibe los avisos</th>
                  <th className="num">Asistencia</th>
                  <th className="num">Ausencias</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} aria-selected={r.id === selectedId}>
                    <td>
                      <button type="button" className="row-button" onClick={() => setSelectedId(r.id)}>
                        <Avatar name={r.name} size="sm" />
                        {r.name}
                      </button>
                    </td>
                    <td>{r.section}</td>
                    <td>{r.age} años</td>
                    <td>
                      <span className="stack">
                        <span>{r.contact}</span>
                        <span className="text-xs" style={{ color: appInk(r.app), fontWeight: 600 }}>
                          {r.app}
                        </span>
                      </span>
                    </td>
                    <td className="num strong">{r.pct}</td>
                    <td className={r.absences >= 3 ? 'num strong ink-orange' : 'num strong'}>{r.absences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="text-sm muted" style={{ display: 'block', paddingTop: 12 }}>
            Mostrando {list.length} de {ENROLLMENT.total} · ordenado por apellido
          </span>
        </section>

        <aside aria-labelledby="ficha-t" className="card split__side gap-16" style={{ padding: 20 }}>
          <div className="row gap-14">
            <Avatar name={s.name} size="lg" tone="blue" />
            <div className="stack">
              <h2 id="ficha-t" className="display" style={{ fontSize: 22 }}>
                {s.name}
              </h2>
              <span className="muted" style={{ fontSize: 14 }}>
                Sección {s.section} · {s.age} años · {adult ? 'mayor de edad' : 'menor de edad'}
              </span>
            </div>
          </div>
          <div className="grid-3">
            <MiniStat look="inset" label="Asistencia" value={s.pct} />
            <MiniStat look="inset" label="Ausencias" value={s.absences} ink="orange" />
            <MiniStat look="inset" label="Tardías" value={s.lates} ink="amber" />
          </div>
          <div className="stack gap-8">
            <h3 className="eyebrow" style={{ fontSize: 14 }}>
              {adult ? 'Contacto (el propio estudiante)' : 'Encargado legal'}
            </h3>
            <div className="stack gap-4" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{s.contact}</span>
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                {s.phone} · {s.app === 'Solo SMS' ? 'SMS' : 'App y SMS'}
              </span>
              <span className="text-sm" style={{ color: appInk(s.app), fontWeight: 600 }}>
                {s.app}
              </span>
            </div>
          </div>
          <div className="stack gap-8">
            <h3 className="eyebrow" style={{ fontSize: 14 }}>
              Permisos vigentes
            </h3>
            {(s.permissions.length
              ? s.permissions.map((p) => ({ label: p.label, status: PERM_STATUS[p.state] }))
              : [{ label: 'Sin permisos este mes', status: { label: '—', tone: 'neutral' as const } }]
            ).map((p) => (
              <div key={p.label} className="row between gap-8" style={{ fontSize: 14, padding: '8px 0', borderTop: '1px solid var(--border-soft)' }}>
                <span>{p.label}</span>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </div>
          <div className="grid-2">
            <Button style={{ fontSize: 14 }}>Ver historial</Button>
            <Button variant="dark" style={{ fontSize: 14 }}>
              Enviar mensaje
            </Button>
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
