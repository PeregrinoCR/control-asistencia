import type { Status } from '../components';

/** What happens with a lesson when its teacher is absent. */
export type Coverage = 'free' | 'sub' | 'task';

export const COVERAGE: Record<Coverage, Status & { help: string }> = {
  free: { label: 'Lección libre', tone: 'amber', help: 'No hay lección. Si es la última, los menores pueden salir antes con autorización.' },
  sub: { label: 'Con sustituto', tone: 'blue', help: 'Otro docente cubre la lección y pasa lista.' },
  task: { label: 'Trabajo asignado', tone: 'neutral', help: 'El grupo trabaja en el aula con una guía; se pasa lista igual.' },
};

export interface AffectedLesson {
  section: string;
  subject: string;
  /** Block start, as shown in the timetable. */
  time: string;
  /** Last lesson of the day for that section: a free lesson here lets students leave early. */
  last: boolean;
  /** Minors in the section, who need guardian authorization to leave early. */
  minors: number;
  students: number;
}

export interface TeacherAbsence {
  id: number;
  teacher: string;
  reason: string;
  date: string;
  reportedBy: string;
  lessons: Array<AffectedLesson & { coverage: Coverage; substitute?: string }>;
  notified: boolean;
}

export const ABSENCE_REASONS = ['Incapacidad', 'Cita médica', 'Permiso con goce', 'Capacitación', 'Asunto personal', 'Otro'];

/** Lessons each teacher gives today (lunes, jornada nocturna). */
export const TEACHER_LESSONS_TODAY: Record<string, AffectedLesson[]> = {
  'Jorge Céspedes': [
    { section: '8-1', subject: 'Estudios Sociales', time: '8:00 p. m.', last: false, minors: 22, students: 28 },
    { section: '8-1', subject: 'Educación Cívica', time: '8:40 p. m.', last: true, minors: 22, students: 28 },
  ],
  'Karla Montero': [
    { section: '10-2', subject: 'Inglés', time: '7:25 p. m.', last: false, minors: 12, students: 29 },
    { section: '7-2', subject: 'Inglés', time: '8:00 p. m.', last: false, minors: 27, students: 30 },
  ],
  'Patricia Ulate': [
    { section: '7-1', subject: 'Matemática', time: '6:00 p. m.', last: false, minors: 30, students: 32 },
    { section: '9-1', subject: 'Matemática', time: '8:40 p. m.', last: true, minors: 21, students: 33 },
  ],
  'Ricardo Mora': [
    { section: '11-1', subject: 'Biología', time: '7:25 p. m.', last: false, minors: 9, students: 32 },
  ],
};

export const TEACHERS_WITH_LESSONS = Object.keys(TEACHER_LESSONS_TODAY);

export const SUBSTITUTES = ['Marta Vindas', 'Ana Lucía Rojas', 'Esteban Quirós', 'Andrea Solís'];

/** Absences already reported today. */
export const TEACHER_ABSENCES: TeacherAbsence[] = [
  {
    id: 1,
    teacher: 'Jorge Céspedes',
    reason: 'Incapacidad',
    date: 'Lun 19 oct',
    reportedBy: 'Dirección · 4:15 p. m.',
    lessons: [
      { ...TEACHER_LESSONS_TODAY['Jorge Céspedes'][0], coverage: 'sub', substitute: 'Marta Vindas' },
      { ...TEACHER_LESSONS_TODAY['Jorge Céspedes'][1], coverage: 'free' },
    ],
    notified: true,
  },
];
