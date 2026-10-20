import type { Status } from '../components';

// ---------- Hoy ----------

export type RollState = 'done' | 'late' | 'pending';

export const ROLL_STATE: Record<RollState, Status> = {
  done: { label: 'A tiempo', tone: 'green' },
  late: { label: 'Con retraso', tone: 'amber' },
  pending: { label: 'Pendiente', tone: 'orange' },
};

export interface SectionToday {
  section: string;
  teacher: string;
  state: RollState;
  present: number;
  absent: number;
  late: number;
  noticesRead: number;
  noticesSent: number;
}

export const SECTIONS_TODAY: SectionToday[] = [
  { section: '7-1', teacher: 'Marta Vindas', state: 'done', present: 27, absent: 1, late: 2, noticesRead: 3, noticesSent: 3 },
  { section: '7-2', teacher: 'Jorge Céspedes', state: 'done', present: 26, absent: 2, late: 1, noticesRead: 3, noticesSent: 3 },
  { section: '8-1', teacher: 'Ana Lucía Rojas', state: 'done', present: 24, absent: 3, late: 0, noticesRead: 2, noticesSent: 3 },
  { section: '9-1', teacher: 'Ricardo Mora', state: 'done', present: 25, absent: 4, late: 3, noticesRead: 5, noticesSent: 7 },
  { section: '10-1', teacher: 'Patricia Ulate', state: 'late', present: 23, absent: 2, late: 2, noticesRead: 3, noticesSent: 4 },
  { section: '10-2', teacher: 'Andrea Solís', state: 'done', present: 24, absent: 2, late: 1, noticesRead: 2, noticesSent: 3 },
  { section: '11-1', teacher: 'Esteban Quirós', state: 'done', present: 28, absent: 3, late: 1, noticesRead: 4, noticesSent: 4 },
  { section: '11-2', teacher: 'Karla Montero', state: 'pending', present: 0, absent: 0, late: 0, noticesRead: 0, noticesSent: 0 },
];

export const FOLLOW_UP = [
  { name: 'Gabriel Núñez', section: '10-2', meta: '4 ausencias · encargado leyó 2 de 4 avisos' },
  { name: 'Emilia Vargas', section: '9-1', meta: '3 ausencias · sin respuesta del encargado' },
  { name: 'Joaquín Ramírez', section: '11-1', meta: '3 ausencias · mayor de edad · 2 tardías' },
  { name: 'Renata Alfaro', section: '7-2', meta: '3 ausencias · justificación en revisión' },
];

// ---------- Profesores, secciones y horarios ----------

export const SHIFTS: Array<{ name: string; range: string; detail: string; status: Status; active?: boolean; action: string }> = [
  { name: 'Diurna', range: '7:00 a. m. – 4:10 p. m.', detail: '12 lecciones de 40 min · 0 secciones', status: { label: 'Inactiva', tone: 'neutral' }, action: 'Editar horario' },
  { name: 'Nocturna', range: '6:00 p. m. – 9:50 p. m.', detail: '5 lecciones de 40 min y recreo · 8 secciones', status: { label: 'Activa', tone: 'green' }, active: true, action: 'Editar horario' },
  { name: 'Sábados (giras y tutorías)', range: '8:00 a. m. – 12:00 m. d.', detail: 'Horario especial · se activa por actividad', status: { label: 'Especial', tone: 'amber' }, action: 'Editar horario' },
  { name: 'Horario personalizado', range: 'Cualquier hora', detail: 'Para CINDEA, IPEC, cursos libres o técnicos', status: { label: 'Nuevo', tone: 'blue' }, action: 'Crear jornada' },
];

export interface Section {
  id: string;
  guide: string;
  students: number;
  minors: number;
}

export const SECTIONS: Section[] = [
  { id: '7-1', guide: 'Marta Vindas', students: 32, minors: 30 },
  { id: '7-2', guide: 'Jorge Céspedes', students: 30, minors: 27 },
  { id: '8-1', guide: 'Ana Lucía Rojas', students: 28, minors: 22 },
  { id: '9-1', guide: 'Ricardo Mora', students: 33, minors: 21 },
  { id: '10-1', guide: 'Patricia Ulate', students: 29, minors: 14 },
  { id: '10-2', guide: 'Andrea Solís', students: 29, minors: 12 },
  { id: '11-1', guide: 'Esteban Quirós', students: 32, minors: 9 },
  { id: '11-2', guide: 'Karla Montero', students: 26, minors: 7 },
];

export const SUBJECT_SCHEDULE: Record<string, { when: string; perWeek: number }> = {
  Matemática: { when: 'Lun y Mié · 6:00 – 7:20 p. m.', perWeek: 4 },
  Español: { when: 'Mar y Jue · 6:00 – 7:20 p. m.', perWeek: 4 },
  Inglés: { when: 'Lun y Jue · 7:20 – 8:50 p. m.', perWeek: 4 },
  'Estudios Sociales': { when: 'Mar · 8:10 – 9:50 p. m.', perWeek: 2 },
  'Educación Cívica': { when: 'Lun · 9:10 – 9:50 p. m.', perWeek: 1 },
  Ciencias: { when: 'Mié y Vie · 7:20 – 8:50 p. m.', perWeek: 4 },
  Biología: { when: 'Mié y Vie · 7:20 – 8:50 p. m.', perWeek: 4 },
  Química: { when: 'Vie · 6:00 – 7:20 p. m.', perWeek: 2 },
};

/** Subjects and assigned teacher for a section. An empty teacher means "sin asignar". */
export function sectionPlan(id: string, index: number): Array<{ subject: string; teacher: string }> {
  const high = parseInt(id, 10) >= 10;
  const rows = [
    { subject: 'Matemática', teacher: high ? 'Andrea Solís' : 'Patricia Ulate' },
    { subject: 'Español', teacher: index % 2 ? 'Esteban Quirós' : 'Marta Vindas' },
    { subject: 'Inglés', teacher: id === '11-2' ? '' : index % 2 ? 'Karla Montero' : 'Ana Lucía Rojas' },
    { subject: 'Estudios Sociales', teacher: 'Jorge Céspedes' },
    { subject: 'Educación Cívica', teacher: 'Jorge Céspedes' },
    { subject: high ? 'Biología' : 'Ciencias', teacher: 'Ricardo Mora' },
  ];
  if (high) rows.push({ subject: 'Química', teacher: id === '11-2' ? '' : 'Ricardo Mora' });
  return rows;
}

export const TEACHERS = [
  { name: 'Andrea Solís', subject: 'Matemática', sections: '10-1, 10-2, 11-1, 11-2' },
  { name: 'Patricia Ulate', subject: 'Matemática', sections: '7-1, 7-2, 8-1, 9-1' },
  { name: 'Marta Vindas', subject: 'Español', sections: '7-1, 8-1, 10-1, 11-1' },
  { name: 'Esteban Quirós', subject: 'Español', sections: '7-2, 9-1, 10-2, 11-2' },
  { name: 'Ana Lucía Rojas', subject: 'Inglés', sections: '7-1, 8-1, 10-1, 11-1' },
  { name: 'Karla Montero', subject: 'Inglés', sections: '7-2, 9-1, 10-2' },
  { name: 'Jorge Céspedes', subject: 'Est. Sociales y Cívica', sections: '8 secciones' },
  { name: 'Ricardo Mora', subject: 'Ciencias, Biología, Química', sections: '8 secciones' },
];

// ---------- Giras y salidas tempranas ----------

export type ConsentState = 'ok' | 'no' | 'wait';

export const CONSENT_STATUS: Record<ConsentState, Status> = {
  ok: { label: 'Autorizado', tone: 'blue' },
  no: { label: 'No autorizado', tone: 'orange' },
  wait: { label: 'Pendiente', tone: 'neutral' },
};

export const TRIP_ROSTER: Array<{ name: string; section: string; guardian: string; state: ConsentState; health: string; signed: string }> = [
  { name: 'Mateo Brenes Quesada', section: '10-2', guardian: 'Laura Quesada Arias', state: 'wait', health: '—', signed: 'Recordatorio enviado hoy' },
  { name: 'Isabella Castro Jiménez', section: '10-2', guardian: 'Rodrigo Castro', state: 'ok', health: 'Sin observaciones', signed: '17/10 · 8:41 p. m.' },
  { name: 'Camila Fallas Vargas', section: '10-2', guardian: 'Ana Vargas Soto', state: 'ok', health: 'Asma · inhalador', signed: '16/10 · 7:12 p. m.' },
  { name: 'Thiago Jiménez Ulate', section: '10-2', guardian: 'Marco Jiménez', state: 'no', health: '—', signed: '18/10 · 9:03 p. m.' },
  { name: 'Lucía Monge Arias', section: '10-1', guardian: 'Silvia Arias', state: 'ok', health: 'Alergia a la penicilina', signed: '16/10 · 6:55 p. m.' },
  { name: 'Sofía Picado León', section: '10-1', guardian: 'Carlos Picado', state: 'wait', health: '—', signed: 'Aviso sin abrir · SMS enviado' },
  { name: 'Valeria Araya Mora', section: '10-1', guardian: 'Gloria Mora', state: 'ok', health: 'Sin observaciones', signed: '15/10 · 9:20 p. m.' },
];

export const TRIP_TOTALS = { authorized: 16, declined: 2, pending: 8, minors: 26, adults: 32 };

export const EARLY_EXITS: Array<{ time: string; name: string; section: string; authorizedBy: string; how: string; left?: string; receipt: string }> = [
  { time: '7:20 p. m.', name: 'Sebastián Ríos Mena', section: '9-1', authorizedBy: 'Luis Ríos (padre)', how: 'Lo retira su abuela, céd. 2-0000-0000', left: '7:22 p. m.', receipt: 'ST-0040' },
  { time: '8:10 p. m.', name: 'Sofía Brenes Quesada', section: '8-1', authorizedBy: 'Laura Quesada Arias', how: 'Sale por sus propios medios', receipt: 'ST-0042' },
  { time: '8:10 p. m.', name: 'Daniel Gamboa Solano', section: '10-2', authorizedBy: 'Teresa Solano (madre)', how: 'Lo retira su madre', receipt: 'ST-0043' },
];

// ---------- Estudiantes ----------

export type PermState = 'ok' | 'wait' | 'self' | 'na';

export const PERM_STATUS: Record<PermState, Status> = {
  ok: { label: 'Autorizado', tone: 'blue' },
  wait: { label: 'Falta firma', tone: 'orange' },
  self: { label: 'Confirmó él/ella', tone: 'green' },
  na: { label: 'No aplica', tone: 'neutral' },
};

export type AppUse = 'Usa la app' | 'Solo SMS' | 'Sin vincular' | 'No ha abierto 2 avisos';

export interface Student {
  id: number;
  name: string;
  section: string;
  age: number;
  contact: string;
  phone: string;
  app: AppUse;
  pct: string;
  absences: number;
  lates: number;
  permissions: Array<{ label: string; state: PermState }>;
}

export const STUDENTS: Student[] = [
  { id: 1, name: 'Renata Alfaro Mora', section: '7-2', age: 13, contact: 'Gloria Mora (madre)', phone: '8800-1101', app: 'Usa la app', pct: '86 %', absences: 3, lates: 1, permissions: [{ label: 'Gira a [DESTINO]', state: 'na' }] },
  { id: 2, name: 'Mateo Brenes Quesada', section: '10-2', age: 16, contact: 'Laura Quesada Arias (madre)', phone: '8800-1102', app: 'Usa la app', pct: '83 %', absences: 2, lates: 2, permissions: [{ label: 'Gira a [DESTINO]', state: 'wait' }, { label: 'Salida temprana 15 oct', state: 'ok' }] },
  { id: 3, name: 'Sofía Brenes Quesada', section: '8-1', age: 14, contact: 'Laura Quesada Arias (madre)', phone: '8800-1102', app: 'Usa la app', pct: '96 %', absences: 0, lates: 1, permissions: [{ label: 'Salida temprana hoy 8:10 p. m.', state: 'ok' }] },
  { id: 4, name: 'Sebastián Chaves Rojas', section: '10-2', age: 19, contact: 'Él mismo (mayor de edad)', phone: '8800-1104', app: 'Usa la app', pct: '92 %', absences: 1, lates: 3, permissions: [{ label: 'Gira a [DESTINO]', state: 'self' }] },
  { id: 5, name: 'Daniel Gamboa Solano', section: '10-2', age: 17, contact: 'Teresa Solano (madre)', phone: '8800-1105', app: 'Solo SMS', pct: '94 %', absences: 1, lates: 0, permissions: [{ label: 'Salida temprana hoy 8:10 p. m.', state: 'ok' }] },
  { id: 6, name: 'Mariana Herrera Calvo', section: '10-2', age: 21, contact: 'Ella misma (mayor de edad)', phone: '8800-1106', app: 'Usa la app', pct: '97 %', absences: 0, lates: 1, permissions: [{ label: 'Gira a [DESTINO]', state: 'self' }] },
  { id: 7, name: 'Lucía Monge Arias', section: '10-1', age: 16, contact: 'Silvia Arias (madre)', phone: '8800-1107', app: 'Usa la app', pct: '95 %', absences: 1, lates: 0, permissions: [{ label: 'Gira a [DESTINO]', state: 'ok' }] },
  { id: 8, name: 'Gabriel Núñez Porras', section: '10-2', age: 17, contact: 'Óscar Núñez (padre)', phone: '8800-1108', app: 'No ha abierto 2 avisos', pct: '78 %', absences: 4, lates: 2, permissions: [{ label: 'Gira a [DESTINO]', state: 'wait' }] },
  { id: 9, name: 'Joaquín Ramírez Ulate', section: '11-1', age: 23, contact: 'Él mismo (mayor de edad)', phone: '8800-1109', app: 'Solo SMS', pct: '84 %', absences: 3, lates: 2, permissions: [] },
  { id: 10, name: 'Emilia Vargas León', section: '9-1', age: 15, contact: 'Rosa León (abuela)', phone: '8800-1110', app: 'Sin vincular', pct: '85 %', absences: 3, lates: 1, permissions: [] },
];

export const ENROLLMENT = { total: 239, minors: 142 };

// ---------- Justificaciones ----------

export type JustState = 'p' | 'a' | 'r' | 'i';

export const JUST_STATUS: Record<JustState, Status> = {
  p: { label: 'Pendiente', tone: 'amber' },
  a: { label: 'Aprobada', tone: 'green' },
  r: { label: 'Rechazada', tone: 'orange' },
  i: { label: 'Esperando información', tone: 'blue' },
};

export interface Justification {
  id: number;
  name: string;
  section: string;
  minor: boolean;
  kind: 'Ausencia' | 'Tardía';
  date: string;
  lessons: string;
  reason: string;
  by: string;
  sent: string;
  comment: string;
  doc: string;
  state: JustState;
}

export const JUSTIFICATIONS: Justification[] = [
  { id: 1, name: 'Mateo Brenes Quesada', section: '10-2', minor: true, kind: 'Ausencia', date: 'lun 19 oct', lessons: 'Matemática (1.ª y 2.ª)', reason: 'Enfermedad', by: 'Laura Quesada (madre)', sent: 'Hoy 7:40 p. m.', comment: 'Amaneció con fiebre y lo llevé al EBAIS. Mañana regresa a lecciones.', doc: 'dictamen_medico_19oct.pdf', state: 'p' },
  { id: 2, name: 'Renata Alfaro Mora', section: '7-2', minor: true, kind: 'Ausencia', date: 'jue 15 y vie 16 oct', lessons: '10 lecciones', reason: 'Cita médica', by: 'Gloria Mora (madre)', sent: 'Ayer 9:12 p. m.', comment: 'Tuvo cita de especialista en el hospital y luego reposo.', doc: 'constancia_CCSS.jpg', state: 'p' },
  { id: 3, name: 'Joaquín Ramírez Ulate', section: '11-1', minor: false, kind: 'Ausencia', date: 'mié 14 oct', lessons: '5 lecciones', reason: 'Trabajo', by: 'El estudiante (mayor de edad)', sent: '16 oct', comment: 'Me asignaron turno de cierre en el trabajo. Adjunto constancia del patrono.', doc: 'constancia_patronal.pdf', state: 'p' },
  { id: 4, name: 'Emilia Vargas León', section: '9-1', minor: true, kind: 'Ausencia', date: 'mié 14 oct', lessons: '5 lecciones', reason: 'Asunto familiar', by: 'Rosa León (abuela)', sent: '16 oct', comment: 'Tuvimos que viajar por un familiar enfermo.', doc: '', state: 'p' },
  { id: 5, name: 'Gabriel Núñez Porras', section: '10-2', minor: true, kind: 'Ausencia', date: 'mar 13 oct', lessons: '5 lecciones', reason: 'Transporte', by: 'Óscar Núñez (padre)', sent: '15 oct', comment: 'El bus de la ruta [RUTA] no pasó esa noche.', doc: '', state: 'p' },
  { id: 6, name: 'Sofía Brenes Quesada', section: '8-1', minor: true, kind: 'Tardía', date: 'vie 16 oct', lessons: 'Español (1.ª)', reason: 'Transporte', by: 'Laura Quesada (madre)', sent: '16 oct', comment: 'Presa en la carretera por un accidente.', doc: '', state: 'p' },
  { id: 7, name: 'Lucía Monge Arias', section: '10-1', minor: true, kind: 'Ausencia', date: 'vie 9 oct', lessons: '5 lecciones', reason: 'Enfermedad', by: 'Silvia Arias (madre)', sent: '12 oct', comment: 'Gripe fuerte.', doc: 'receta.jpg', state: 'a' },
  { id: 8, name: 'Daniel Gamboa Solano', section: '10-2', minor: true, kind: 'Ausencia', date: 'jue 1 oct', lessons: '5 lecciones', reason: 'Otro motivo', by: 'Teresa Solano (madre)', sent: '14 oct', comment: 'Se nos olvidó justificar a tiempo.', doc: '', state: 'r' },
];
