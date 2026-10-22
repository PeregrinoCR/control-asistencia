import { useEffect, useState } from 'react';
import { Avatar, ButtonLink, EmptyState, Stat, StatusBadge, type Status } from '../../components';
import { AdminLayout, PageHeader } from '../../layouts/AdminLayout';
import { useAuth } from '../../lib/auth';
import { AttentionCards, type AttentionItem } from './AttentionCards';
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
  /** Lessons already under way with no roll call yet, and who teaches the first of them. */
  overdue: number[];
  overdueTeacher: string;
}

interface Pending {
  justifications: { count: number; oldest: string | null };
  exits: Array<{ hour: string; student: string }>;
  uncovered: Array<{ teacher: string; lessons: number }>;
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

/** "8:35 p. m." → minutes since midnight. */
function toMinutes(t: string) {
  const m = t.match(/(\d+):(\d+)\s*([ap])/);
  if (!m) return 0;
  return ((Number(m[1]) % 12) + (m[3] === 'p' ? 12 : 0)) * 60 + Number(m[2]);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Dirección · Panel del día, with today's real roll calls. */
export function TodayLive() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const { perms } = useAuth();
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
          const doneLessons = new Set(m.map((x) => x.leccion));
          const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
          const overdue = [...new Set(mine.map((x) => x.leccion))]
            .filter((n) => !doneLessons.has(n) && toMinutes(LESSONS[n - 1]?.start ?? '') <= nowMin)
            .sort((a, b) => a - b);
          return {
            overdue,
            overdueTeacher: mine.find((x) => x.leccion === overdue[0])?.personal?.nombre ?? '',
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

  // Everything else waiting on the director; a query the person may not read simply counts as nothing.
  useEffect(() => {
    const db = supabase!;
    (async () => {
      const [just, exits, cov] = await Promise.all([
        db.from('justificaciones').select('enviado', { count: 'exact' }).eq('estado', 'p').order('enviado').limit(1),
        db.from('salidas').select('hora, estudiantes(nombre)').eq('estado', 'pendiente').order('fecha').order('hora'),
        db
          .from('coberturas')
          .select('ausencia_id, ausencias_docentes!inner(fecha, personal(nombre))')
          .eq('ausencias_docentes.fecha', date)
          .eq('tipo', 'sub')
          .is('sustituto_id', null),
      ]);
      const byAbsence = new Map<string, { teacher: string; lessons: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((cov.data ?? []) as any[]).forEach((r) => {
        const cur = byAbsence.get(r.ausencia_id) ?? { teacher: r.ausencias_docentes?.personal?.nombre ?? 'Docente', lessons: 0 };
        byAbsence.set(r.ausencia_id, { ...cur, lessons: cur.lessons + 1 });
      });
      setPending({
        justifications: { count: just.count ?? 0, oldest: just.data?.[0]?.enviado ?? null },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        exits: ((exits.data ?? []) as any[]).map((r) => ({ hour: r.hora, student: r.estudiantes?.nombre ?? '' })),
        uncovered: [...byAbsence.values()],
      });
    })();
  }, [date]);

  const items: AttentionItem[] = [];
  const late = data?.sections.filter((x) => x.overdue.length > 0) ?? [];
  if (late.length > 0) {
    const first = late[0];
    items.push({
      id: 'listas',
      count: late.length,
      title: plural(late.length, 'Lista sin pasar', 'Listas sin pasar'),
      lines: [`${first.name}${first.overdueTeacher && ` · ${first.overdueTeacher}`}${late.length > 1 ? ` y ${late.length - 1} más` : ''}`, `${first.overdue[0]}.ª lección en curso o ya pasada`],
      tone: 'urgent',
      cta: 'Ver el pase de lista',
      href: '#secciones-t',
    });
  }
  if (pending && perms.includes('approveJust') && pending.justifications.count > 0) {
    const old = pending.justifications.oldest ? new Date(pending.justifications.oldest) : null;
    items.push({
      id: 'justificaciones',
      count: pending.justifications.count,
      title: plural(pending.justifications.count, 'Justificación por revisar', 'Justificaciones por revisar'),
      lines: old ? [`La más antigua: ${old.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}`] : [],
      tone: 'warn',
      cta: 'Revisar',
      to: routes.admin.justifications,
    });
  }
  if (pending && perms.includes('approveExit') && pending.exits.length > 0) {
    items.push({
      id: 'salidas',
      count: pending.exits.length,
      title: plural(pending.exits.length, 'Salida por decidir', 'Salidas por decidir'),
      lines: [pending.exits.slice(0, 2).map((e) => e.student).join(' y ') + (pending.exits.length > 2 ? ` y ${pending.exits.length - 2} más` : ''), `Primera a las ${pending.exits[0].hour} p. m.`],
      tone: 'warn',
      cta: 'Decidir',
      to: `${routes.admin.trips}?ver=salidas`,
    });
  }
  if (pending && perms.includes('teacherAbs') && pending.uncovered.length > 0) {
    const first = pending.uncovered[0];
    items.push({
      id: 'sustitutos',
      count: pending.uncovered.length,
      title: plural(pending.uncovered.length, 'Docente sin sustituto', 'Docentes sin sustituto'),
      lines: [first.teacher + (pending.uncovered.length > 1 ? ` y ${pending.uncovered.length - 1} más` : ''), `${first.lessons} ${plural(first.lessons, 'lección', 'lecciones')} sin sustituto`],
      tone: 'warn',
      cta: 'Asignar sustituto',
      to: routes.admin.teacherAbsences,
    });
  }

  const total = (k: 'present' | 'absent' | 'late') => data?.sections.reduce((n, s) => n + s[k], 0) ?? 0;
  const marked = total('present') + total('absent');
  const pendingLists = data?.sections.filter((s) => s.lessons > 0 && s.done < s.lessons).length ?? 0;
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
          <AttentionCards items={pending ? items : items.filter((i) => i.id === 'listas')} />
          <div className="grid-tiles">
            <Stat label="Asistencia general" value={marked ? pct((100 * total('present')) / marked) : '—'} note={`${total('present')} de ${marked} con lista`} />
            <Stat label="Ausentes" value={String(total('absent'))} ink="orange" note="Faltaron al menos a una lección" />
            <Stat label="Llegadas tardías" value={String(total('late'))} ink="amber" />
            <Stat label="Secciones con lista" value={`${data.sections.length - pendingLists} de ${data.sections.length}`} note="Con todas sus lecciones marcadas" />
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
              <ButtonLink variant="secondary" to={routes.admin.earlyWarning}>
                Ver alerta temprana
              </ButtonLink>
            </section>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
