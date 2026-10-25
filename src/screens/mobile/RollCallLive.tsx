import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Avatar, Button, Icon } from '../../components';
import { MobileScreen, TeacherTabBar } from '../../layouts/MobileScreen';
import type { Mark } from '../../data/school';
import { SCHOOL_DAYS } from '../../data/schedule';
import { hasPanel, signOut, useAuth } from '../../lib/auth';
import { prepararCoberturas } from '../../lib/ausencias';
import { LESSONS, localDate, todayId } from '../../lib/schedule';
import { ageOn } from '../../lib/students';
import type { Exam } from '../admin/SettingsLive';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';

interface Lesson {
  sectionId: string;
  section: string;
  lesson: number;
  subject: string;
  /** Covering for an absent teacher. */
  substitute?: boolean;
}

interface Pupil {
  id: string;
  name: string;
  adult: boolean;
  accommodation: boolean;
}

type Marks = Record<string, Mark | undefined>;

const MARKS: Array<{ mark: Mark; label: string }> = [
  { mark: 'P', label: 'Presente' },
  { mark: 'T', label: 'Tarde' },
  { mark: 'A', label: 'Ausente' },
];

const SUB: Record<Mark, { text: string; tone: string }> = {
  P: { text: 'Presente', tone: 'var(--blue-ink)' },
  T: { text: 'Llegó tarde', tone: 'var(--amber-ink)' },
  A: { text: 'Ausente', tone: 'var(--orange-ink)' },
  J: { text: 'Ausencia justificada', tone: 'var(--green-ink)' },
};

/** Docente · Pase de lista, with the teacher's real lessons for today. */
export function RollCallLive() {
  const { ready, session, roles, perms } = useAuth();
  const location = useLocation();
  const [me, setMe] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  // Room where the accommodated students sit the section's exam on this day, if there is one.
  const [aulaAdec, setAulaAdec] = useState('');
  const [marks, setMarks] = useState<Marks>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [cares, setCares] = useState<{ id: string; fecha: string; aula: string; desde: number; hasta: number; detalle: string | null }[]>([]);

  const day = todayId();
  const date = localDate();

  // Who is signed in, and their lessons today.
  useEffect(() => {
    if (!session) return;
    (async () => {
      const db = supabase!;
      const { data: p } = await db.from('personal').select('id, nombre').eq('usuario_id', session.user.id).maybeSingle();
      setMe(p ? { id: p.id, name: p.nombre } : null);
      if (p) {
        // Exam cares published for this person, from today on.
        const { data: c } = await db.from('cuidos').select('id, fecha, aula, desde, hasta, detalle').eq('persona_id', p.id).eq('estado', 'publicado').gte('fecha', date).order('fecha').order('desde');
        setCares(c ?? []);
      }
      if (!p || !day) return setLessons([]);
      // A named substitute's lessons are prepared by the server; make sure today's exist.
      await prepararCoberturas();
      const [{ data, error }, cover] = await Promise.all([
        db.from('horario').select('leccion, seccion_id, secciones(nombre), materias(nombre)').eq('docente_id', p.id).eq('dia', day).order('leccion'),
        // Lessons this teacher covers today for an absent colleague.
        db.from('coberturas').select('seccion_id, leccion, secciones(nombre), ausencias_docentes!inner(fecha)').eq('sustituto_id', p.id).eq('ausencias_docentes.fecha', date),
      ]);
      if (error) return setError(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const own: Lesson[] = (data as any[]).map((r) => ({ sectionId: r.seccion_id, section: r.secciones?.nombre ?? '', lesson: r.leccion, subject: r.materias?.nombre ?? '' }));
      const covered: Lesson[] = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((cover.data ?? []) as any[]).map(async (c) => {
          const { data: h } = await db.from('horario').select('materias(nombre)').eq('seccion_id', c.seccion_id).eq('dia', day).eq('leccion', c.leccion).maybeSingle();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return { sectionId: c.seccion_id, section: c.secciones?.nombre ?? '', lesson: c.leccion, subject: (h as any)?.materias?.nombre ?? 'Sustitución', substitute: true };
        }),
      );
      const list = [...own, ...covered].sort((a, b) => a.lesson - b.lesson);
      setLessons(list);
      // Open the lesson happening now, or the next one.
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const idx = list.findIndex((l) => toMinutes(LESSONS[l.lesson - 1]?.end ?? '') > now);
      setCurrent(idx === -1 ? Math.max(0, list.length - 1) : idx);
    })();
  }, [session, day, date]);

  const lesson = lessons?.[current];

  // Students of the chosen lesson and any marks already saved.
  useEffect(() => {
    if (!lesson) return;
    setPupils(null);
    setState('idle');
    (async () => {
      const db = supabase!;
      const [st, att, cfg] = await Promise.all([
        db.from('estudiantes').select('id, nombre, nacimiento, adecuacion').eq('seccion_id', lesson.sectionId).eq('activo', true).order('nombre'),
        db.from('asistencia').select('estudiante_id, marca').eq('seccion_id', lesson.sectionId).eq('fecha', date).eq('leccion', lesson.lesson),
        db.from('colegios').select('config').maybeSingle(),
      ]);
      if (st.error || att.error) return setError((st.error ?? att.error)!.message);
      const exam = ((cfg.data?.config?.pruebas ?? []) as Exam[]).find(
        (x) => x.publicada && x.fecha === date && x.seccion === lesson.section && x.aulaAdecuacion,
      );
      setAulaAdec(exam?.aulaAdecuacion ?? '');
      setPupils(
        st.data.map((s) => ({ id: s.id, name: s.nombre, adult: (ageOn(s.nacimiento) ?? 0) >= 18, accommodation: !!s.adecuacion })),
      );
      setMarks(Object.fromEntries(att.data.map((a) => [a.estudiante_id, a.marca as Mark])));
      if (att.data.length) setState('saved');
    })();
  }, [lesson, date]);

  if (ready && !session) return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  if (!ready || me === undefined || (me && !lessons)) return <MobileScreen>{centered('Cargando…')}</MobileScreen>;
  if (!me)
    return (
      <MobileScreen>
        {centered('Su cuenta no está registrada como personal del colegio. Pida a dirección que la registre con este mismo correo.', true)}
      </MobileScreen>
    );

  const list = pupils ?? [];
  const update = (next: Marks) => {
    setMarks(next);
    setState('idle');
  };
  // A justified absence is changed from Por justificar (it has a deadline), not from the roll call.
  const toggle = (id: string, mark: Mark) => marks[id] !== 'J' && update({ ...marks, [id]: marks[id] === mark ? undefined : mark });
  const count = (m: Mark | undefined) => list.filter((s) => marks[s.id] === m).length;
  const unmarked = count(undefined);

  const save = async () => {
    if (!lesson) return;
    setState('saving');
    const rows = list
      .filter((s) => marks[s.id] && marks[s.id] !== 'J')
      .map((s) => ({
        estudiante_id: s.id,
        seccion_id: lesson.sectionId,
        fecha: date,
        leccion: lesson.lesson,
        marca: marks[s.id],
        registrado_por: me.id,
      }));
    const { error } = await supabase!.from('asistencia').upsert(rows, { onConflict: 'estudiante_id,fecha,leccion' });
    if (error) {
      setError(error.message);
      return setState('idle');
    }
    setError('');
    setState('saved');
  };

  const dayName = SCHOOL_DAYS.find((d) => d.id === day)?.full ?? 'Hoy';

  return (
    <MobileScreen>
      <div className="roll-header">
        <div className="row between">
          <span className="text-sm muted strong">{me.name}</span>
          <span className="row gap-8">
            {hasPanel(roles, perms) && (
              <Link to={routes.admin.today} className="link-button text-sm">
                Panel
              </Link>
            )}
            <button type="button" className="link-button text-sm" onClick={() => signOut()}>
              Salir
            </button>
          </span>
        </div>
        {cares.length > 0 && (
          <div className="stack gap-2 text-sm">
            <span className="strong">Mis próximos cuidos de examen</span>
            {cares.map((c) => (
              <span key={c.id} className="muted">
                {c.fecha.split('-').reverse().slice(0, 2).join('/')} · {c.aula} · {LESSONS[c.desde - 1]?.start}–{LESSONS[c.hasta - 1]?.end}
                {c.detalle && ` · ${c.detalle}`}
              </span>
            ))}
          </div>
        )}
        {lesson ? (
          <>
            <div className="stack gap-4">
              <label htmlFor="lesson-pick" className="eyebrow" style={{ letterSpacing: 0.4, fontSize: 12 }}>
                Lección
              </label>
              <select id="lesson-pick" className="lesson-pick" value={current} onChange={(e) => setCurrent(Number(e.target.value))}>
                {lessons!.map((l, i) => (
                  <option key={i} value={i}>
                    {l.lesson}.ª · Sección {l.section}
                    {l.substitute ? ' · sustitución' : ''}
                  </option>
                ))}
              </select>
              <span className="text-xs muted strong">
                {lesson.substitute && 'Sustitución · '}
                {lesson.subject} · {dayName} · {LESSONS[lesson.lesson - 1]?.start}
              </span>
            </div>
            <div className="tally-row">
              <span data-tone="blue">{count('P')} Presentes</span>
              <span data-tone="amber">{count('T')} Tarde</span>
              <span data-tone="orange">{count('A') + count('J')} Ausentes</span>
              <span data-tone="neutral">{unmarked} Faltan</span>
            </div>
          </>
        ) : (
          <h1 className="display" style={{ fontSize: 26 }}>
            Pase de lista
          </h1>
        )}
      </div>

      {!lesson ? (
        centered(day ? 'No tiene lecciones asignadas para hoy. Si es un error, pida a dirección que revise su horario.' : 'Hoy no hay lecciones.')
      ) : !pupils ? (
        centered('Cargando estudiantes…')
      ) : (
        <>
          <div className="row between" style={{ padding: '8px 16px' }}>
            <span className="eyebrow" style={{ letterSpacing: 0.6 }}>
              Lista · {list.length} {list.length === 1 ? 'estudiante' : 'estudiantes'}
            </span>
            <button
              type="button"
              className="chip"
              style={{ height: 36, borderColor: 'var(--border-input)', fontWeight: 600 }}
              onClick={() => update(Object.fromEntries(list.map((s) => [s.id, marks[s.id] ?? 'P'])))}
            >
              Marcar todos presentes
            </button>
          </div>
          <ul className="roll-list">
            {list.length === 0 && <li className="text-sm muted" style={{ padding: 20 }}>Esta sección no tiene estudiantes matriculados.</li>}
            {list.map((s) => {
              const mark = marks[s.id];
              const sub = mark ? SUB[mark] : { text: 'Sin marcar', tone: 'var(--muted-2)' };
              return (
                <li key={s.id} className="roll-row">
                  <Avatar name={s.name} />
                  <div className="stack grow">
                    <span className="roll-row__name">{s.name}</span>
                    <span className="text-xs" style={{ color: sub.tone, fontWeight: 500 }}>
                      {sub.text}
                      {s.adult && ' · mayor de edad'}
                    </span>
                    {s.accommodation && aulaAdec && <span className="text-xs strong">Adecuación · {aulaAdec}</span>}
                  </div>
                  <div className="row gap-4" role="group" aria-label={`Asistencia de ${s.name}`}>
                    {MARKS.map((m) => (
                      <button
                        key={m.mark}
                        type="button"
                        className="mark-btn"
                        data-mark={m.mark}
                        aria-label={m.label}
                        aria-pressed={mark === m.mark}
                        disabled={mark === 'J'}
                        onClick={() => toggle(s.id, m.mark)}
                      >
                        {m.mark}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="screen-footer" style={{ gap: 10 }}>
            {error && (
              <p className="text-sm ink-orange" role="alert">
                No se guardó: {error}
              </p>
            )}
            {state !== 'saved' && (
              <p className="text-xs muted" style={{ textAlign: 'center' }}>
                {unmarked > 0 ? `Faltan ${unmarked} por marcar. ` : ''}Al guardar se avisa a las familias de ausentes y tardías.
              </p>
            )}
            <Button variant="primary" size="lg" onClick={save} disabled={state === 'saving' || list.length === 0}>
              <Icon name="check" />
              <span>{state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Lista guardada' : 'Guardar lista'}</span>
            </Button>
          </div>
        </>
      )}
      <TeacherTabBar />
    </MobileScreen>
  );
}

function centered(text: string, alert = false) {
  return (
    <p className={alert ? 'text-sm ink-orange' : 'text-sm muted'} role={alert ? 'alert' : undefined} style={{ padding: 24, textAlign: 'center' }}>
      {text}
    </p>
  );
}

/** "8:35 p. m." → minutes since midnight. */
function toMinutes(t: string) {
  const m = t.match(/(\d+):(\d+)\s*([ap])/);
  if (!m) return 0;
  const h = (Number(m[1]) % 12) + (m[3] === 'p' ? 12 : 0);
  return h * 60 + Number(m[2]);
}
