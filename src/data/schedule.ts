import { SHIFT_BLOCKS } from './settings';

/** School days shown in the weekly timetable. */
export const SCHOOL_DAYS = [
  { id: 'L', short: 'Lun', full: 'Lunes' },
  { id: 'K', short: 'Mar', full: 'Martes' },
  { id: 'M', short: 'Mié', full: 'Miércoles' },
  { id: 'J', short: 'Jue', full: 'Jueves' },
  { id: 'V', short: 'Vie', full: 'Viernes' },
] as const;

export type DayId = (typeof SCHOOL_DAYS)[number]['id'];

/** Demo "today": Monday 19 October, 8:12 p. m. (minutes since midnight). */
export const TODAY: DayId = 'L';
export const NOW_MINUTES = 20 * 60 + 12;

interface SectionTimetable {
  room: string;
  teachers: Record<string, string>;
  /** Subject of each of the 5 night-shift lessons, per day. */
  week: Record<DayId, [string, string, string, string, string]>;
}

export const TIMETABLES: Record<string, SectionTimetable> = {
  '10-2': {
    room: 'Aula 5',
    teachers: {
      Matemática: 'Andrea Solís',
      Español: 'Esteban Quirós',
      Inglés: 'Karla Montero',
      'Estudios Sociales': 'Jorge Céspedes',
      'Educación Cívica': 'Jorge Céspedes',
      Biología: 'Ricardo Mora',
      Química: 'Ricardo Mora',
    },
    week: {
      L: ['Matemática', 'Matemática', 'Español', 'Inglés', 'Educación Cívica'],
      K: ['Español', 'Español', 'Estudios Sociales', 'Estudios Sociales', 'Inglés'],
      M: ['Matemática', 'Matemática', 'Biología', 'Biología', 'Español'],
      J: ['Inglés', 'Inglés', 'Química', 'Matemática', 'Estudios Sociales'],
      V: ['Química', 'Química', 'Biología', 'Inglés', 'Matemática'],
    },
  },
  '8-1': {
    room: 'Aula 2',
    teachers: {
      Matemática: 'Patricia Ulate',
      Español: 'Marta Vindas',
      Inglés: 'Ana Lucía Rojas',
      'Estudios Sociales': 'Jorge Céspedes',
      'Educación Cívica': 'Jorge Céspedes',
      Ciencias: 'Ricardo Mora',
    },
    week: {
      L: ['Español', 'Español', 'Matemática', 'Estudios Sociales', 'Educación Cívica'],
      K: ['Matemática', 'Matemática', 'Inglés', 'Inglés', 'Ciencias'],
      M: ['Ciencias', 'Ciencias', 'Español', 'Matemática', 'Estudios Sociales'],
      J: ['Inglés', 'Inglés', 'Español', 'Español', 'Matemática'],
      V: ['Estudios Sociales', 'Ciencias', 'Ciencias', 'Matemática', 'Inglés'],
    },
  },
};

export interface TimetableRow {
  kind: 'lesson' | 'break';
  name: string;
  start: string;
  end: string;
  /** Minutes since midnight, to tell which block is happening now. */
  from: number;
  to: number;
  subject?: string;
  teacher?: string;
}

/** "7:55 p. m." → minutes since midnight. */
function toMinutes(label: string) {
  const m = label.match(/(\d+):(\d+)\s*([ap])/);
  if (!m) return 0;
  const h = (parseInt(m[1], 10) % 12) + (m[3] === 'p' ? 12 : 0);
  return h * 60 + parseInt(m[2], 10);
}

/** One day of a section's timetable, laid over the night-shift bell schedule. */
export function dayTimetable(section: string, day: DayId): TimetableRow[] {
  const t = TIMETABLES[section];
  let lesson = 0;
  return SHIFT_BLOCKS.noc.blocks.map(([name, start, end]) => {
    const base = { name, start, end, from: toMinutes(start), to: toMinutes(end) };
    if (/Recreo/.test(name)) return { ...base, kind: 'break' as const };
    const subject = t.week[day][lesson++];
    return { ...base, kind: 'lesson' as const, subject, teacher: t.teachers[subject] };
  });
}
