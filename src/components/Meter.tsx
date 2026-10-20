import { cx } from './cx';

interface MeterProps {
  /** 0–100 */
  percent: number;
  label: string;
  wide?: boolean;
}

export function Meter({ percent, label, wide }: MeterProps) {
  return (
    <div className={cx('meter', wide && 'meter--wide')}>
      <div className="meter__track">
        <div className="meter__fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="meter__label">{label}</span>
    </div>
  );
}
