import type { ReactNode } from 'react';
import { StatusBadge } from '../../components';
import { SUSTITUCION, type Sustitucion } from '../../lib/ausencias';

interface IncapacityCardProps {
  teacher: string;
  /** "lun 19 oct" */
  from: string;
  to: string;
  substitution: Sustitucion;
  substitute?: string;
  substituteFrom?: string;
  /** Days since the substitute was asked for, while waiting for the MEP. */
  askedDays?: number;
  /** School days elapsed so far, and in total. */
  elapsed: number;
  total: number;
  /** Buttons, and the form that opens from them. */
  children?: ReactNode;
}

type StepState = 'done' | 'current' | 'todo';

/** One long incapacity with the state of the substitute the MEP may name. */
export function IncapacityCard({ teacher, from, to, substitution, substitute, substituteFrom, askedDays = 0, elapsed, total, children }: IncapacityCardProps) {
  const asked: StepState = substitution === 'ninguno' ? 'todo' : substitution === 'esperando' ? 'current' : 'done';
  const named: StepState = substitution === 'nombrado' ? 'current' : 'todo';
  const left = Math.max(0, total - elapsed);
  return (
    <article className="incap" data-waiting={substitution === 'esperando'}>
      <div className="row wrap between gap-8" style={{ alignItems: 'flex-start' }}>
        <span className="stack">
          <strong style={{ fontSize: 17 }}>{teacher}</strong>
          <span className="text-sm muted">
            {from} a {to} · {total} {total === 1 ? 'día lectivo' : 'días lectivos'}
            {elapsed > 0 && ` · van ${Math.min(elapsed, total)}, quedan ${left}`}
          </span>
        </span>
        <StatusBadge status={SUSTITUCION[substitution]} size="md" />
      </div>
      <ol className="pipeline" aria-label="Trámite del sustituto">
        <li className="pipeline__step" data-state="done">
          <strong>1. Incapacidad registrada</strong>
          <span>Listo</span>
        </li>
        <li className="pipeline__step" data-state={asked} aria-current={asked === 'current' ? 'step' : undefined}>
          <strong>2. Pedido al MEP</strong>
          <span>{asked === 'todo' ? 'No se ha pedido' : asked === 'current' ? `Hace ${askedDays} ${askedDays === 1 ? 'día' : 'días'}, sin nombrar` : 'Listo'}</span>
        </li>
        <li className="pipeline__step" data-state={named} aria-current={named === 'current' ? 'step' : undefined}>
          <strong>3. Sustituto nombrado</strong>
          <span>{substitution === 'nombrado' ? `${substitute}${substituteFrom ? `, desde ${substituteFrom}` : ''}` : 'Pendiente'}</span>
        </li>
      </ol>
      <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
        {substitution === 'nombrado' ? `${substitute} da sus lecciones.` : 'Mientras tanto, sus lecciones quedan libres y las familias reciben el aviso cada día.'}
      </span>
      {children}
    </article>
  );
}
