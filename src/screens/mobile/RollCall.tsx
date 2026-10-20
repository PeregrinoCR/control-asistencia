import { useState } from 'react';
import { Avatar, Button, Icon, IconButton } from '../../components';
import { MobileScreen } from '../../layouts/MobileScreen';
import { ROLL_INITIAL, ROLL_SECTION, ROLL_STUDENTS, type RollStudent } from '../../data/rollCall';
import type { Mark } from '../../data/school';
import { supabase } from '../../lib/supabase';
import { RollCallLive } from './RollCallLive';

type Marks = Record<number, Mark | undefined>;

const MARKS: Array<{ mark: Mark; label: string }> = [
  { mark: 'P', label: 'Presente' },
  { mark: 'T', label: 'Tarde' },
  { mark: 'A', label: 'Ausente' },
];

function subtitle(s: RollStudent, mark: Mark | undefined): { text: string; tone: string } {
  switch (mark) {
    case 'P':
      return { text: s.exitNote ?? (s.adult ? 'Presente · mayor de edad' : 'Presente'), tone: 'var(--blue-ink)' };
    case 'T':
      return { text: 'Llegó tarde · 6:14 p. m.', tone: 'var(--amber-ink)' };
    case 'A':
      return {
        text: s.adult ? 'Ausente · mayor de edad, aviso personal' : 'Ausente · se avisará al encargado',
        tone: 'var(--orange-ink)',
      };
    default:
      return { text: 'Sin marcar', tone: 'var(--muted-2)' };
  }
}

/** Docente · Pase de lista */
export function RollCall() {
  return supabase ? <RollCallLive /> : <RollCallSample />;
}

/** The sample screen, shown while no server is configured. */
function RollCallSample() {
  const [marks, setMarks] = useState<Marks>(ROLL_INITIAL);
  const [sent, setSent] = useState(false);

  const update = (next: Marks) => {
    setMarks(next);
    setSent(false);
  };
  const toggle = (id: number, mark: Mark) => update({ ...marks, [id]: marks[id] === mark ? undefined : mark });
  const markAllPresent = () =>
    update(Object.fromEntries(ROLL_STUDENTS.map((s) => [s.id, marks[s.id] ?? 'P'])) as Marks);

  const count = (m: Mark | undefined) => ROLL_STUDENTS.filter((s) => marks[s.id] === m).length;
  const unmarked = count(undefined);
  const notified = count('A') + count('T');
  const sendLabel = sent
    ? 'Lista enviada'
    : unmarked > 0
      ? `Guardar y notificar (${unmarked} sin marcar)`
      : `Guardar y enviar ${notified} avisos`;

  return (
    <MobileScreen>
      <div className="roll-header">
        <div className="row between">
          <IconButton icon="chevronLeft" label="Volver" />
          <span className="text-sm muted strong">{ROLL_SECTION.date}</span>
          <IconButton icon="search" label="Buscar estudiante" />
        </div>
        <div className="stack gap-2">
          <h1 className="display" style={{ fontSize: 30, letterSpacing: -0.5 }}>
            Sección {ROLL_SECTION.id}
          </h1>
          <span className="muted" style={{ fontSize: 15 }}>
            {ROLL_SECTION.subject} · {ROLL_SECTION.shift} · {ROLL_STUDENTS.length} estudiantes
          </span>
        </div>
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
      </div>

      <div className="row between" style={{ padding: '14px 20px 6px' }}>
        <span className="eyebrow" style={{ letterSpacing: 0.6 }}>
          Lista
        </span>
        <button type="button" className="chip" style={{ height: 36, borderColor: 'var(--border-input)', fontWeight: 600 }} onClick={markAllPresent}>
          Marcar todos presentes
        </button>
      </div>

      <ul className="roll-list">
        {ROLL_STUDENTS.map((s) => {
          const mark = marks[s.id];
          const sub = subtitle(s, mark);
          return (
            <li key={s.id} className="roll-row">
              <Avatar name={s.name} />
              <div className="stack grow">
                <span className="roll-row__name">{s.name}</span>
                <span className="text-xs" style={{ color: sub.tone, fontWeight: 500 }}>
                  {sub.text}
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
        {sent ? (
          <div className="notice notice--success" role="status">
            <Icon name="check" strokeWidth={2.2} />
            <span>Lista guardada. Se enviaron {notified} avisos al instante.</span>
          </div>
        ) : (
          <p className="text-sm muted" style={{ textAlign: 'center' }}>
            Al guardar se avisa al encargado de cada menor ausente o tardío. Los mayores de edad reciben el aviso en su
            propia cuenta.
          </p>
        )}
        <Button variant="primary" size="xl" onClick={() => setSent(true)}>
          <Icon name="bell" />
          <span>{sendLabel}</span>
        </Button>
      </div>
    </MobileScreen>
  );
}
