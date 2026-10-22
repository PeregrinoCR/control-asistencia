import type { Status } from '../components';
import { supabase } from './supabase';

/** What is happening with the replacement of a teacher on a long incapacity. */
export type Sustitucion = 'ninguno' | 'esperando' | 'nombrado';

export const SUSTITUCION: Record<Sustitucion, Status & { help: string }> = {
  ninguno: { label: 'Sin sustituto', tone: 'neutral', help: 'Sus lecciones quedan libres mientras dure la incapacidad.' },
  esperando: { label: 'Esperando al MEP', tone: 'amber', help: 'Se pidió un sustituto al MEP y todavía no lo nombra.' },
  nombrado: { label: 'Sustituto nombrado', tone: 'green', help: 'El sustituto da las lecciones del titular desde su fecha de inicio.' },
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * School days (Monday to Friday) from one date to another, both included.
 * The app does not know the holidays, so they are counted: the director adjusts the end date if needed.
 */
export function lectivos(desde: string, hasta: string): string[] {
  const out: string[] = [];
  if (!desde || !hasta) return out;
  const d = new Date(desde + 'T12:00:00');
  const end = new Date(hasta + 'T12:00:00');
  while (d <= end) {
    if (d.getDay() >= 1 && d.getDay() <= 5) out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** The day before a date, as YYYY-MM-DD. */
export function diaAnterior(date: string) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return iso(d);
}

/** "lun 19 oct" for a YYYY-MM-DD date. */
export const fechaCorta = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');

/**
 * Prepares today's lessons for teachers on a long incapacity (free, or the named substitute's).
 * Harmless to repeat; the server also does it every day at noon.
 */
export async function prepararCoberturas() {
  try {
    await supabase?.rpc('generar_coberturas');
  } catch {
    // Not critical: the daily schedule on the server covers it.
  }
}
