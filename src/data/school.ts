import type { Status } from '../components';

// Placeholders the school fills in during setup.
export const SCHOOL_NAME = '[NOMBRE DEL COLEGIO]';
export const SCHOOL_PHONE = '+50600000000';

export const navCounts = { trips: 3, justifications: 6, earlyWarning: 14, teacherAbsences: 1 };

/** Attendance marks used by the roll call, the family app and reports. */
/** P presente, T tarde, A ausente sin justificar, J ausente justificada por el docente. */
export type Mark = 'P' | 'T' | 'A' | 'J';

export const MARK_STATUS: Record<Mark | 'N', Status> = {
  P: { label: 'Presente', tone: 'blue' },
  T: { label: 'Tarde', tone: 'amber' },
  A: { label: 'Ausente', tone: 'orange' },
  J: { label: 'Justificada', tone: 'green' },
  N: { label: 'Pendiente', tone: 'neutral' },
};

/** Formats 92.4 as "92,4 %" (Costa Rican convention). */
export function pct(value: number, digits = 1) {
  return value.toFixed(digits).replace('.', ',') + ' %';
}

/** Initial on/off map for a list of toggleable rules. */
export function ruleState(rules: Array<{ id: string; on: boolean }>) {
  return Object.fromEntries(rules.map((r) => [r.id, r.on])) as Record<string, boolean>;
}
