import { useState } from 'react';
import { Avatar, Badge, Button, Icon, StatusBadge } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { SECTIONS, SHIFTS, SUBJECT_SCHEDULE, TEACHERS, sectionPlan } from '../../data/admin';
import { supabase } from '../../lib/supabase';
import { AssignmentsLive } from './AssignmentsLive';

/** Dirección · Horarios y cargas */
export function Assignments() {
  return supabase ? <AssignmentsLive /> : <AssignmentsSample />;
}

/** The sample screen, shown while no server is configured. */
function AssignmentsSample() {
  const [selectedId, setSelectedId] = useState('10-2');
  const index = SECTIONS.findIndex((s) => s.id === selectedId);
  const selected = SECTIONS[index];
  const subjects = sectionPlan(selected.id, index);

  return (
    <AdminLayout>
      <PageHeader
        kicker="Curso lectivo 2026"
        title="Horarios y cargas"
        actions={
          <>
            <Button regular>Importar desde Excel</Button>
            <Button regular>Agregar profesor</Button>
            <Button variant="primary">Nueva sección</Button>
          </>
        }
      />

      <section aria-labelledby="jornadas-t" className="stack gap-12">
        <h2 id="jornadas-t" className="title-section">
          Jornadas y horarios
        </h2>
        <div className="grid-tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {SHIFTS.map((j) => (
            <div key={j.name} className="card gap-6" style={{ padding: 16, borderWidth: 1.5, borderColor: j.active ? 'var(--blue)' : undefined }}>
              <div className="row between gap-8">
                <span style={{ fontSize: 16, fontWeight: 700 }}>{j.name}</span>
                <StatusBadge status={j.status} />
              </div>
              <span className="display" style={{ fontSize: 22 }}>
                {j.range}
              </span>
              <span className="text-sm muted">{j.detail}</span>
              <Button size="sm" style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                {j.action}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <div className="split">
        <section aria-labelledby="sec-t" className="card gap-8" style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div className="row between" style={{ alignItems: 'baseline' }}>
            <h2 id="sec-t" className="title-section">
              Secciones
            </h2>
            <span className="text-sm muted">Jornada nocturna · {SECTIONS.length}</span>
          </div>
          {SECTIONS.map((s, i) => {
            const missing = sectionPlan(s.id, i).filter((r) => !r.teacher).length;
            const on = s.id === selectedId;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSelectedId(s.id)}
                className="row gap-12"
                style={{
                  minHeight: 56,
                  borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border-soft)'}`,
                  background: on ? 'var(--blue-bg)' : 'var(--surface)',
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: 'var(--ink)',
                }}
              >
                <span className="display" style={{ fontSize: 18, width: 44 }}>
                  {s.id}
                </span>
                <span className="stack grow">
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Guía: {s.guide}</span>
                  <span className="text-xs muted">
                    {s.students} estudiantes · {s.minors} menores de edad
                  </span>
                </span>
                <Badge tone={missing ? 'orange' : 'green'}>{missing ? `${missing} sin profesor` : 'Completa'}</Badge>
              </button>
            );
          })}
        </section>

        <section aria-labelledby="det-t" className="card split__main gap-14">
          <div className="row wrap between gap-12">
            <div className="stack gap-2">
              <h2 id="det-t" className="display" style={{ fontSize: 26 }}>
                Sección {selected.id}
              </h2>
              <span className="muted" style={{ fontSize: 14 }}>
                Nocturna · 6:00 p. m. – 9:50 p. m. · {selected.students} estudiantes
              </span>
            </div>
            <div className="row wrap gap-8">
              <span className="text-sm muted" style={{ fontWeight: 600 }}>
                Profesor guía
              </span>
              <Button size="md" aria-label="Cambiar profesor guía" style={{ fontSize: 14 }}>
                {selected.guide}
                <Icon name="chevronDown" size={16} style={{ color: 'var(--muted)' }} />
              </Button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table table--dense" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th>Materia</th>
                  <th>Profesor asignado</th>
                  <th>Días y lecciones</th>
                  <th className="num">Lecc./sem.</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((m) => (
                  <tr key={m.subject}>
                    <td className="strong">{m.subject}</td>
                    <td style={{ padding: 8 }}>
                      <button
                        type="button"
                        aria-label={`Cambiar profesor de ${m.subject}`}
                        className="btn btn--md"
                        style={{
                          minWidth: 190,
                          justifyContent: 'space-between',
                          fontWeight: 600,
                          border: `1.5px solid ${m.teacher ? 'var(--border-input)' : 'var(--orange)'}`,
                          background: m.teacher ? 'var(--surface)' : 'var(--orange-bg)',
                          color: m.teacher ? 'var(--ink)' : 'var(--orange-ink)',
                        }}
                      >
                        {m.teacher || 'Sin asignar'}
                        <Icon name="chevronDown" size={16} />
                      </button>
                    </td>
                    <td style={{ color: 'var(--ink-2)' }}>{SUBJECT_SCHEDULE[m.subject].when}</td>
                    <td className="num">{SUBJECT_SCHEDULE[m.subject].perWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap between gap-8">
            <Button variant="dashed" style={{ fontSize: 14, padding: '0 14px' }}>
              + Agregar materia
            </Button>
            <div className="row wrap gap-8">
              <span className="text-sm muted">Los profesores verán esta sección en su pase de lista.</span>
              <Button variant="primary" style={{ padding: '0 18px' }}>
                Guardar asignaciones
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section aria-labelledby="prof-t" className="card">
        <h2 id="prof-t" className="title-section">
          Carga de profesores
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {TEACHERS.map((t) => (
            <div key={t.name} className="row gap-12" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <Avatar name={t.name} />
              <div className="stack grow">
                <span style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</span>
                <span className="text-sm muted">
                  {t.subject} · {t.sections}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
