import type { Mark } from './school';

/** How a lesson changes when its teacher is absent. */
export type LessonChange = { kind: 'free' } | { kind: 'sub'; substitute: string };

export interface Child {
  id: 'M' | 'S';
  short: string;
  section: string;
  alert: {
    mark: Exclude<Mark, 'P'>;
    time: string;
    title: string;
    body: string;
    canJustify: boolean;
  };
  today: Array<{ time: string; subject: string; mark: Mark | 'N'; change?: LessonChange }>;
  /** A lesson without its teacher today, shown as a notice on the home screen. */
  freeLesson?: {
    subject: string;
    time: string;
    last: boolean;
    exitAt?: string;
    exitHourIndex?: number;
    /** An early exit the guardian already authorized for today. */
    authorizedExit?: string;
  };
  month: { pct: string; absences: number; lates: number };
}

export const GUARDIAN = { first: 'Laura', full: 'Laura Quesada Arias', id: '1-0000-0000', phone: '8888-0000' };

export const CHILDREN: Child[] = [
  {
    id: 'M',
    short: 'Mateo',
    section: '10-2',
    alert: {
      mark: 'A',
      time: '6:12 p. m.',
      title: 'Mateo fue marcado ausente',
      body: 'La profesora Andrea Solís lo registró ausente en Matemática. Justifique la ausencia o comuníquese con el colegio.',
      canJustify: true,
    },
    today: [
      { time: '6:00 p. m.', subject: 'Matemática', mark: 'A' },
      { time: '7:20 p. m.', subject: 'Español', mark: 'N' },
      { time: '8:10 p. m.', subject: 'Inglés', mark: 'N' },
      { time: '9:10 p. m.', subject: 'Educación Cívica', mark: 'N' },
    ],
    month: { pct: '83 %', absences: 2, lates: 2 },
  },
  {
    id: 'S',
    short: 'Sofía',
    section: '8-1',
    alert: {
      mark: 'T',
      time: '6:21 p. m.',
      title: 'Sofía llegó tarde',
      body: 'Ingresó a las 6:19 p. m. y ya está en clase. No requiere ninguna acción.',
      canJustify: false,
    },
    today: [
      { time: '6:00 p. m.', subject: 'Español', mark: 'T' },
      { time: '7:20 p. m.', subject: 'Matemática', mark: 'P' },
      { time: '8:10 p. m.', subject: 'Estudios Sociales', mark: 'N', change: { kind: 'sub', substitute: 'Marta Vindas' } },
      { time: '9:10 p. m.', subject: 'Educación Cívica', mark: 'N', change: { kind: 'free' } },
    ],
    freeLesson: { subject: 'Educación Cívica', time: '9:10 p. m.', last: true, exitAt: '8:50 p. m.', exitHourIndex: 3, authorizedExit: '8:10 p. m.' },
    month: { pct: '96 %', absences: 0, lates: 1 },
  },
];

export const JUSTIFY_REASONS = ['Enfermedad', 'Cita médica', 'Trabajo', 'Transporte', 'Asunto familiar', 'Otro motivo'];

/** Mateo's October. `F` = feriado, `X` = no record yet. */
export type DayKind = Mark | 'F' | 'X' | 'O';

export interface CalendarDay {
  day: number;
  inMonth: boolean;
}

// Monday-first school week grid for October 2026 (starts on 28 sep).
export const OCTOBER_GRID: CalendarDay[] = [
  [28, 0], [29, 0], [30, 0], [1, 1], [2, 1],
  [5, 1], [6, 1], [7, 1], [8, 1], [9, 1],
  [12, 1], [13, 1], [14, 1], [15, 1], [16, 1],
  [19, 1], [20, 1], [21, 1], [22, 1], [23, 1],
  [26, 1], [27, 1], [28, 1], [29, 1], [30, 1],
].map(([day, inMonth]) => ({ day, inMonth: inMonth === 1 }));

export const OCTOBER_RECORDS: Record<number, { kind: Exclude<DayKind, 'X' | 'O'>; note?: string; canJustify?: boolean }> = {
  1: { kind: 'P' },
  2: { kind: 'T', note: 'Llegó a las 6:18 p. m. a la primera lección.' },
  5: { kind: 'P' },
  6: { kind: 'P' },
  7: { kind: 'A', note: 'Justificada por Laura Quesada: cita médica. Aprobada por orientación.' },
  8: { kind: 'P' },
  9: { kind: 'P' },
  12: { kind: 'F', note: 'Día de las Culturas. No hubo lecciones.' },
  13: { kind: 'T', note: 'Llegó a las 6:24 p. m. a la primera lección.' },
  14: { kind: 'P' },
  15: { kind: 'P', note: 'Salida temprana a las 8:10 p. m., autorizada por Laura Quesada con descargo firmado.' },
  16: { kind: 'P' },
  19: { kind: 'A', note: 'Marcado ausente en Matemática a las 6:12 p. m. Aún no hay justificación.', canJustify: true },
};

export const TRIP_DECLARATIONS = [
  'Autorizo a mi hijo(a) a participar en esta gira y a viajar en el transporte indicado por el colegio.',
  'Me comprometo a que cumpla el reglamento de la institución y las indicaciones del personal a cargo.',
  'Autorizo que reciba atención médica de emergencia si no logran localizarme.',
];

/** Lesson change times of the night shift. */
export const EXIT_HOURS = ['6:40', '7:20', '8:10', '8:50'];

export const EXIT_WAYS = [
  { id: 'pickup', label: 'Lo retira una persona adulta', help: 'Debe presentar cédula en el portón.' },
  { id: 'alone', label: 'Sale por sus propios medios', help: 'Usted autoriza que salga sin acompañante.' },
] as const;

export type ExitWay = (typeof EXIT_WAYS)[number]['id'];

/** Trip fee paid by SINPE Móvil. Only shown when the school turns on the payments module. */
export const TRIP_PAYMENT = {
  enabled: true,
  amount: '[MONTO] colones',
  sinpeNumber: '[NÚMERO SINPE]',
  holder: '[NOMBRE DEL TITULAR]',
  reference: 'Gira 10-2 Mateo Brenes',
};
