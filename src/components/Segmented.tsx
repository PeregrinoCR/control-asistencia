import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `tabs` renders a tablist (switches the page's content); `toggle` renders pressed buttons (filters). */
  mode?: 'toggle' | 'tabs';
  size?: 'base' | 'lg';
  /** Two equal halves that fill the row. */
  fill?: boolean;
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  mode = 'toggle',
  size = 'base',
  fill,
}: SegmentedProps<T>) {
  const tabs = mode === 'tabs';
  return (
    <div
      role={tabs ? 'tablist' : 'group'}
      aria-label={label}
      className={cx('segmented', size === 'lg' && 'segmented--lg', fill && 'segmented--fill')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role={tabs ? 'tab' : undefined}
          aria-selected={tabs ? o.value === value : undefined}
          aria-pressed={tabs ? undefined : o.value === value}
          className="segmented__item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
