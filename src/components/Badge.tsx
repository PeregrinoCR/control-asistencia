import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Status tones shared across the app:
 * blue = presente / autorizado, amber = tarde / pendiente, orange = ausente / urgente,
 * green = confirmado / resuelto, neutral = sin marcar / no aplica.
 */
export type Tone = 'blue' | 'amber' | 'orange' | 'green' | 'neutral' | 'soft';

export interface Status {
  label: string;
  tone: Tone;
}

interface BadgeProps {
  tone: Tone;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Badge({ tone, size = 'sm', children }: BadgeProps) {
  return <span className={cx('badge', `badge--${tone}`, size !== 'sm' && `badge--${size}`)}>{children}</span>;
}

export function StatusBadge({ status, size }: { status: Status; size?: BadgeProps['size'] }) {
  return (
    <Badge tone={status.tone} size={size}>
      {status.label}
    </Badge>
  );
}
