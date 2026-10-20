import type { ReactNode } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch__thumb" />
    </button>
  );
}

interface SettingRowProps extends SwitchProps {
  help?: ReactNode;
}

/** A labelled on/off setting with a help line, separated by a top rule. */
export function SettingRow({ label, help, checked, onChange }: SettingRowProps) {
  return (
    <div className="setting-row">
      <span className="stack grow">
        <span className="setting-row__label">{label}</span>
        {help && <span className="setting-row__help">{help}</span>}
      </span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
