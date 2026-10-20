import type { Status } from '../components';

export type RiskLevel = 'a' | 'm' | 'b';

export const RISK: Record<RiskLevel, Status> = {
  a: { label: 'Alto', tone: 'orange' },
  m: { label: 'Medio', tone: 'amber' },
  b: { label: 'Bajo', tone: 'blue' },
};

export interface WarningCase {
  id: number;
  name: string;
  section: string;
  age: string;
  guide: string;
  level: RiskLevel;
  unexcused: number;
  consecutive: number;
  lates: number;
  status: string;
  owner: string;
  opened: string;
  reasons: string[];
  /** Last 20 school days: P asistió, T tarde, A ausente sin justificar, J justificada o feriado. */
  strip: string;
  plan: Array<{ label: string; done: boolean }>;
  log: Array<{ date: string; what: string; note: string }>;
}

export const CASES: WarningCase[] = [
  {
    id: 1, name: 'Gabriel Núñez Porras', section: '10-2', age: '17 años', guide: 'Andrea Solís', level: 'a',
    unexcused: 4, consecutive: 3, lates: 2, status: 'Llamada pendiente', owner: 'Orientación · Lic. [NOMBRE]', opened: '9 oct',
    reasons: ['3 ausencias consecutivas (14, 15 y 16 oct)', 'El encargado leyó 2 de 4 avisos', 'Bajó de 96 % a 78 % de asistencia en un mes'],
    strip: 'PPPTPPPAPPJPAAAPPTPA',
    plan: [
      { label: 'Llamada al encargado', done: false },
      { label: 'Entrevista con el estudiante', done: false },
      { label: 'Reunión con la familia', done: false },
      { label: 'Acuerdo de asistencia firmado', done: false },
    ],
    log: [
      { date: '19 oct', what: 'Aviso automático', note: 'Ausente en Matemática; aviso sin abrir, SMS enviado' },
      { date: '16 oct', what: 'Caso escaló a riesgo alto', note: '3 ausencias consecutivas' },
      { date: '9 oct', what: 'Caso abierto', note: 'Por 3 ausencias injustificadas en el mes' },
    ],
  },
  {
    id: 2, name: 'Emilia Vargas León', section: '9-1', age: '15 años', guide: 'Ricardo Mora', level: 'a',
    unexcused: 3, consecutive: 2, lates: 1, status: 'Reunión jue 22 oct', owner: 'Prof. guía Ricardo Mora', opened: '12 oct',
    reasons: ['3 ausencias injustificadas en el mes', 'La encargada no tiene la app (solo SMS)', 'Justificación por asunto familiar aún sin resolver'],
    strip: 'PPAPPPJPPAAPPPTPPPPP',
    plan: [
      { label: 'Llamada a la encargada', done: true },
      { label: 'Entrevista con la estudiante', done: true },
      { label: 'Reunión con la familia', done: false },
      { label: 'Referencia a trabajo social', done: false },
    ],
    log: [
      { date: '17 oct', what: 'Llamada a la abuela', note: 'Confirma viaje familiar; agenda reunión' },
      { date: '15 oct', what: 'Entrevista con la estudiante', note: 'Refiere dificultad de transporte' },
      { date: '12 oct', what: 'Caso abierto', note: 'Por 3 ausencias injustificadas' },
    ],
  },
  {
    id: 3, name: 'Joaquín Ramírez Ulate', section: '11-1', age: '23 años', guide: 'Esteban Quirós', level: 'm',
    unexcused: 3, consecutive: 1, lates: 2, status: 'Acuerdo en curso', owner: 'Prof. guía Esteban Quirós', opened: '8 oct',
    reasons: ['Mayor de edad: el seguimiento es directamente con él', '3 ausencias por turnos de trabajo', '2 tardías en octubre'],
    strip: 'PPAPPTPPAPPPJPAPTPPP',
    plan: [
      { label: 'Entrevista con el estudiante', done: true },
      { label: 'Constancia de horario laboral', done: true },
      { label: 'Plan de reposición de trabajos', done: false },
    ],
    log: [
      { date: '16 oct', what: 'Envió constancia patronal', note: 'Justificación en revisión' },
      { date: '10 oct', what: 'Entrevista', note: 'Acuerda avisar cambios de turno' },
      { date: '8 oct', what: 'Caso abierto', note: '3 ausencias injustificadas' },
    ],
  },
  {
    id: 4, name: 'Renata Alfaro Mora', section: '7-2', age: '13 años', guide: 'Jorge Céspedes', level: 'm',
    unexcused: 3, consecutive: 2, lates: 1, status: 'Justificación en revisión', owner: 'Orientación · Lic. [NOMBRE]', opened: '16 oct',
    reasons: ['2 ausencias consecutivas (15 y 16 oct)', 'La madre envió comprobante médico'],
    strip: 'PPPPAPPPPPJPPPPAATPP',
    plan: [
      { label: 'Revisar comprobante médico', done: false },
      { label: 'Llamada de seguimiento', done: false },
    ],
    log: [
      { date: '18 oct', what: 'Justificación recibida', note: 'Constancia CCSS adjunta' },
      { date: '16 oct', what: 'Caso abierto', note: '2 ausencias consecutivas' },
    ],
  },
  {
    id: 5, name: 'Sebastián Ríos Mena', section: '9-1', age: '16 años', guide: 'Ricardo Mora', level: 'b',
    unexcused: 1, consecutive: 0, lates: 6, status: 'Solo monitoreo', owner: 'Prof. guía Ricardo Mora', opened: '14 oct',
    reasons: ['6 llegadas tardías este mes', 'Asistencia general aún en 92 %'],
    strip: 'PTPTPPTPPTPJPTPPTPPA',
    plan: [
      { label: 'Conversar sobre la hora de llegada', done: true },
      { label: 'Revisar ruta de transporte', done: false },
    ],
    log: [
      { date: '15 oct', what: 'Conversación con el estudiante', note: 'Sale tarde del trabajo' },
      { date: '14 oct', what: 'Caso abierto', note: '5 tardías en el mes' },
    ],
  },
];

export const LEVEL_FILTERS: Array<{ value: 'all' | RiskLevel; label: string }> = [
  { value: 'all', label: 'Todos · 14' },
  { value: 'a', label: 'Riesgo alto · 4' },
  { value: 'm', label: 'Medio · 6' },
  { value: 'b', label: 'Bajo · 4' },
];

export const CRITERIA = [
  { id: 'a', label: '3 ausencias injustificadas en el mes', help: 'Abre caso de riesgo medio', on: true },
  { id: 'b', label: '2 o más ausencias consecutivas', help: 'Sube a riesgo alto si llegan a 3', on: true },
  { id: 'c', label: '5 llegadas tardías en el mes', help: 'Abre caso de riesgo bajo', on: true },
  { id: 'd', label: 'Caída de 10 puntos en asistencia', help: 'Comparado con el mes anterior', on: true },
  { id: 'e', label: 'Encargado sin leer 3 avisos seguidos', help: 'Suma al nivel de riesgo', on: false },
];
