import type { ReactNode } from 'react';
import { cx } from './cx';

type Ink = 'orange' | 'amber' | 'green';

interface StatProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  ink?: Ink;
  compact?: boolean;
}

/** KPI tile used across the admin panel. */
export function Stat({ label, value, note, ink, compact }: StatProps) {
  return (
    <div className={cx('stat', compact && 'stat--compact')}>
      <span className="stat__label">{label}</span>
      <span className={cx('stat__value', ink && `ink-${ink}`)}>{value}</span>
      {note && <span className="stat__note">{note}</span>}
    </div>
  );
}

interface MiniStatProps {
  label: string;
  value: ReactNode;
  ink?: Ink;
  look?: 'plain' | 'boxed' | 'inset';
}

/** Small number + label, used in the mobile app and side panels. */
export function MiniStat({ label, value, ink, look = 'plain' }: MiniStatProps) {
  return (
    <div className={cx('mini-stat', look !== 'plain' && `mini-stat--${look}`)}>
      <span className={cx('mini-stat__value', ink && `ink-${ink}`)}>{value}</span>
      <span className="mini-stat__label">{label}</span>
    </div>
  );
}
