import { useEffect, useState } from 'react';
import { Avatar, ButtonLink, EmptyState, Stat, StatusBadge, type Status } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { pct } from '../../data/school';
import { fetchAll } from '../../lib/fetchAll';
import { LESSONS, localDate, todayId } from '../../lib/schedule';
import { supabase } from '../../lib/supabase';
import { ordenarSecciones } from '../../lib/secciones';
import { routes } from '../../routes';

interface SectionRow {
  id: string;
  name: string;
  teachers: string[];
  lessons: number;
  done: number;
  present: number;
  absent: number;
  late: number;
}

interface Summary {
  sections: SectionRow[];
  followUp: Array<{ name: string; section: string; absences: number }>;
}

function rollStatus(r: SectionRow): Status {
  if (r.lessons === 0) return { label: 'Sin lecciones hoy', tone: 'neutral' };
  if (r.done >= r.lessons) return { label: 'Al día', tone: 'green' };
  if (r.done > 0) return { label: `${r.done} de ${r.lessons} lecciones`, tone: 'amber' };
  return { label: 'Pendiente', tone: 'neutral' };
}

/** Dirección · Panel del día, with today's real roll calls. */
export function TodayLive() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const day = todayId();
  const date = localDate();

  useEffect(() => {
    const db = supabase!;
    (async () => {
      try {
        const [secs, slots, students, marks, month] = await Promise.all([
          fetchAll<{ id: string; nombre: string }>((a, b) => db.from('secciones').select('id, nombre').order('nombre').range(a, b)),
          day
            ? fetchAll<{ seccion_id: string; leccion: number; personal: { nombre: string } | null }>((a, b) =>
                // The client can't tell this join returns one row, hence the cast.
                db.from('horario').select('seccion_id, leccion, personal(nombre)').eq('dia', day).range(a, b) as unknown as PromiseLike<{
                  data: Array<{ seccion_id: string; leccion: number; personal: { nombre: string } | null }> | null;
                  error: { message: string } | null;
                }>,
              )
            : Promise.resolve([]),
          fetchAll<{ id: string; nombre: string; seccion_id: string | null }>((a, b) =>
            db.from('estudiantes').select('id, nombre, seccion_id').eq('activo', true).range(a, b),
          ),
          fetchAll<{ estudiante_id: string; seccion_id: string; leccion: number; marca: string }>((a, b) =>
            db.from('asistencia').select('estudiante_id, seccion_id, leccion, marca').eq('fecha', date).range(a, b),
          ),
          db.from('asistencia_mes').select('estudiante_id, ausencias').gte('ausencias', 3),
        ]);
        const sectionName = new Map(secs.map((s) => [s.id, s.nombre]));
        const sections = ordenarSecciones(secs).map((s): SectionRow => {
          const mine = slots.filter((x) => x.seccion_id === s.id);
          const m = marks.filter((x) => x.seccion_id === s.id);
          // A student counts once a day: absent if missed any lesson, late if late to any.
          const byStudent = new Map<string, Set<string>>();
          m.forEach((x) => byStudent.set(x.estudiante_id, (byStudent.get(x.estudiante_id) ?? new Set()).add(x.marca)));
          const sets = [...byStudent.values()];
          return {
            id: s.id,
            name: s.nombre,
            teachers: [...new Set(mine.map((x) => x.personal?.nombre).filter((n): n is string => !!n))],
            lessons: mine.length,
            done: new Set(m.map((x) => x.leccion)).size,
            present: sets.filter((x) => !x.has('A')).length,
            absent: sets.filter((x) => x.has('A')).length,
            late: sets.filter((x) => x.has('T')).length,
          };
        });
        const studentById = new Map(students.map((s) => [s.id, s]));
        const followUp = (month.data ?? [])
          .map((r) => {
            const s = studentById.get(r.estudiante_id);
            return s ? { name: s.nombre, section: sectionName.get(s.seccion_id ?? '') ?? '—', absences: r.ausencias as number } : null;
          })
          .filter((x): x is NonNullable<typeof x> => !!x)
          .sort((a, b) => b.absences - a.absences);
        setData({ sections: sections.filter((s) => s.lessons > 0 || s.done > 0), followUp });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [day, date]);

  const total = (k: 'present' | 'absent' | 'late') => data?.sections.reduce((n, s) => n + s[k], 0) ?? 0;
  const marked = total('present') + total('absent');
  const pending = data?.sections.filter((s) => s.lessons > 0 && s.done < s.lessons).length ?? 0;
  const longDate = new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
  const first = LESSONS[0].start;
  const last = LESSONS[LESSONS.length - 1].end;

  return (
    <AdminLayout>
      <PageHeader kicker={`${longDate[0].toUpperCase()}${longDate.slice(1)} · ${first} a ${last}`} title="Asistencia de hoy" />

      {error ? (
        <p className="notice" role="alert">
          No se pudo cargar: {error}
        </p>
      ) : !data ? (
        <p className="text-sm muted">Cargando…</p>
      ) : (
        <>
          <div className="grid-tiles">
            <Stat label="Asistencia general" value={marked ? pct((100 * total('present')) / marked) : '—'} note={`${total('present')} de ${marked} con lista`} />
            <Stat label="Ausentes" value={String(total('absent'))} ink="orange" note="Faltaron al menos a una lección" />
            <Stat label="Llegadas tardías" value={String(total('late'))} ink="amber" />
            <Stat label="Listas pendientes" value={String(pending)} note={`de ${data.sections.length} secciones con lecciones hoy`} />
          </div>

          <div className="split">
            <section aria-labelledby="secciones-t" className="card split__main">
              <h2 id="secciones-t" className="title-section">
                Pase de lista por sección
              </h2>
              {data.sections.length === 0 ? (
                day ? (
                  <EmptyState
                    title="Ninguna sección tiene lecciones hoy"
                    icon="calendar"
                    action={
                      <ButtonLink variant="secondary" to={routes.admin.schedules}>
                        Ir a Horarios y cargas
                      </ButtonLink>
                    }
                  >
                    Cargue los horarios para ver aquí el pase de lista.
                  </EmptyState>
                ) : (
                  <EmptyState title="Hoy no hay lecciones" icon="calendar">
                    Vuelva el próximo día lectivo.
                  </EmptyState>
                )
              ) : (
                <div className="table-wrap">
                  <table className="table table--cards" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>Sección</th>
                        <th>Docentes</th>
                        <th>Lista</th>
                        <th className="num">Presentes</th>
                        <th className="num">Ausentes</th>
                        <th className="num">Tarde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sections.map((r) => {
                        const none = r.done === 0;
                        return (
                          <tr key={r.id}>
                            <td className="strong" data-label="Sección">{r.name}</td>
                            <td className="text-sm" data-wide data-label="Docentes">{r.teachers.join(', ') || '—'}</td>
                            <td data-wide data-label="Lista">
                              <StatusBadge status={rollStatus(r)} size="md" />
                            </td>
                            <td className="num" data-label="Presentes">{none ? '—' : r.present}</td>
                            <td className="num strong ink-orange" data-label="Ausentes">{none ? '—' : r.absent}</td>
                            <td className="num strong ink-amber" data-label="Tarde">{none ? '—' : r.late}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="alertas-t" className="card" style={{ flex: '1 1 300px', minWidth: 0 }}>
              <div className="stack gap-6">
                <h2 id="alertas-t" className="title-section">
                  Requieren seguimiento
                </h2>
                <span className="text-sm muted">3 o más lecciones ausentes este mes</span>
              </div>
              <div className="stack">
                {data.followUp.length === 0 && <EmptyState title="Nadie por ahora">Aquí aparece quien acumule 3 o más ausencias sin justificar.</EmptyState>}
                {data.followUp.map((s) => (
                  <div key={s.name} className="list-row">
                    <Avatar name={s.name} size="md" tone="orange" />
                    <div className="stack grow">
                      <span style={{ fontSize: 15, fontWeight: 600 }}>
                        {s.name} · {s.section}
                      </span>
                      <span className="text-sm muted">{s.absences} lecciones ausente</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
