import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Avatar, Button, Icon } from '../../components';
import { MobileScreen } from '../../layouts/MobileScreen';
import type { Mark } from '../../data/school';
import { SCHOOL_DAYS } from '../../data/schedule';
import { hasPanel, signOut, useAuth } from '../../lib/auth';
import { LESSONS, localDate, todayId } from '../../lib/schedule';
import { ageOn } from '../../lib/students';
import { supabase } from '../../lib/supabase';
import { routes } from '../../routes';

interface Lesson {
  sectionId: string;
  section: string;
  lesson: number;
  subject: string;
}

interface Pupil {
  id: string;
  name: string;
  adult: boolean;
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
};

/** Docente · Pase de lista, with the teacher's real lessons for today. */
export function RollCallLive() {
  const { ready, session, roles } = useAuth();
  const location = useLocation();
  const [me, setMe] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [marks, setMarks] = useState<Marks>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const day = todayId();
  const date = localDate();

  // Who is signed in, and their lessons today.
  useEffect(() => {
    if (!session) return;
    (async () => {
      const db = supabase!;
      const { data: p } = await db.from('personal').select('id, nombre').eq('usuario_id', session.user.id).maybeSingle();
      setMe(p ? { id: p.id, name: p.nombre } : null);
      if (!p || !day) return setLessons([]);
      const { data, error } = await db
        .from('horario')
        .select('leccion, seccion_id, secciones(nombre), materias(nombre)')
        .eq('docente_id', p.id)
        .eq('dia', day)
        .order('leccion');
      if (error) return setError(error.message);
      const list: Lesson[] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any[]).map((r) => ({ sectionId: r.seccion_id, section: r.secciones?.nombre ?? '', lesson: r.leccion, subject: r.materias?.nombre ?? '' }));
      setLessons(list);
      // Open the lesson happening now, or the next one.
      const now = new Date().getHours() * 60 + new Date().getMinutes();
      const idx = list.findIndex((l) => toMinutes(LESSONS[l.lesson - 1]?.end ?? '') > now);
      setCurrent(idx === -1 ? Math.max(0, list.length - 1) : idx);
    })();
  }, [session, day]);

  const lesson = lessons?.[current];

  // Students of the chosen lesson and any marks already saved.
  useEffect(() => {
    if (!lesson) return;
    setPupils(null);
    setState('idle');
    (async () => {
      const db = supabase!;
      const [st, att] = await Promise.all([
        db.from('estudiantes').select('id, nombre, nacimiento').eq('seccion_id', lesson.sectionId).eq('activo', true).order('nombre'),
        db.from('asistencia').select('estudiante_id, marca').eq('seccion_id', lesson.sectionId).eq('fecha', date).eq('leccion', lesson.lesson),
      ]);
      if (st.error || att.error) return setError((st.error ?? att.error)!.message);
      setPupils(st.data.map((s) => ({ id: s.id, name: s.nombre, adult: (ageOn(s.nacimiento) ?? 0) >= 18 })));
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
  const toggle = (id: string, mark: Mark) => update({ ...marks, [id]: marks[id] === mark ? undefined : mark });
  const count = (m: Mark | undefined) => list.filter((s) => marks[s.id] === m).length;
  const unmarked = count(undefined);

  const save = async () => {
    if (!lesson) return;
    setState('saving');
    const rows = list
      .filter((s) => marks[s.id])
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
            {hasPanel(roles) && (
              <Link to={routes.admin.today} className="link-button text-sm">
                Panel
              </Link>
            )}
            <button type="button" className="link-button text-sm" onClick={() => signOut()}>
              Salir
            </button>
          </span>
        </div>
        {lesson ? (
          <>
            <div className="stack gap-2">
              <h1 className="display" style={{ fontSize: 30, letterSpacing: -0.5 }}>
                Sección {lesson.section}
              </h1>
              <span className="muted" style={{ fontSize: 15 }}>
                {lesson.subject} · {dayName} · {LESSONS[lesson.lesson - 1]?.name} {LESSONS[lesson.lesson - 1]?.start} · {list.length} estudiantes
              </span>
            </div>
            {lessons!.length > 1 && (
              <div className="row wrap gap-6" role="group" aria-label="Lecciones de hoy">
                {lessons!.map((l, i) => (
                  <button key={i} type="button" className="chip" aria-pressed={i === current} onClick={() => setCurrent(i)}>
                    {l.lesson}.ª · {l.section}
                  </button>
                ))}
              </div>
            )}
            <div className="grid-4">
              <span className="tally" data-tone="blue">
                <strong>{count('P')}</strong>Presentes
              </span>
              <span className="tally" data-tone="amber">
                <strong>{count('T')}</strong>Tarde
              </span>
              <span className="tally" data-tone="orange">
                <strong>{count('A')}</strong>Ausentes
              </span>
              <span className="tally" data-tone="neutral">
                <strong>{unmarked}</strong>Sin marcar
              </span>
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
          <div className="row between" style={{ padding: '14px 20px 6px' }}>
            <span className="eyebrow" style={{ letterSpacing: 0.6 }}>
              Lista
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
            {state === 'saved' ? (
              <div className="notice notice--success" role="status">
                <Icon name="check" strokeWidth={2.2} />
                <span>Lista guardada. Puede corregirla y volver a guardar.</span>
              </div>
            ) : (
              <p className="text-sm muted" style={{ textAlign: 'center' }}>
                {unmarked > 0 ? `Faltan ${unmarked} por marcar. ` : ''}Los avisos a las familias se activarán más adelante.
              </p>
            )}
            <Button variant="primary" size="xl" onClick={save} disabled={state === 'saving' || list.length === 0}>
              <Icon name="check" />
              <span>{state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Lista guardada' : 'Guardar lista'}</span>
            </Button>
          </div>
        </>
      )}
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
