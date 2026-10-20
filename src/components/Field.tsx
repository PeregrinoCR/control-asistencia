import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: string;
  /** Mobile forms use larger labels and touch-sized inputs. */
  touch?: boolean;
}

type InputFieldProps = FieldProps & InputHTMLAttributes<HTMLInputElement>;

export function InputField({ id, label, hint, touch, className, type = 'text', ...rest }: InputFieldProps) {
  return (
    <div className="field">
      <FieldLabel id={id} label={label} hint={hint} />
      <input id={id} type={type} className={cx('input', touch && 'input--touch', className)} {...rest} />
    </div>
  );
}

type TextareaFieldProps = FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextareaField({ id, label, hint, touch, className, ...rest }: TextareaFieldProps) {
  return (
    <div className="field">
      <FieldLabel id={id} label={label} hint={hint} />
      <textarea id={id} className={cx('textarea', touch && 'textarea--touch', className)} {...rest} />
    </div>
  );
}

function FieldLabel({ id, label, hint }: Pick<FieldProps, 'id' | 'label' | 'hint'>) {
  return (
    <label htmlFor={id} className="field__label">
      {label}
      {hint && <span className="field__hint"> ({hint})</span>}
    </label>
  );
}

interface CheckCardProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  strong?: boolean;
}

/** A full-width checkbox card for declarations and disclaimers. */
export function CheckCard({ checked, onChange, children, strong }: CheckCardProps) {
  return (
    <label className="check-card" data-checked={checked}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={strong ? { fontWeight: 600 } : undefined}>{children}</span>
    </label>
  );
}
