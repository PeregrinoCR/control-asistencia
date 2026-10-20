export interface Point {
  label: string;
  value: number;
  note?: string;
}

export const WEEKLY: Point[] = [
  { label: '24 ago', value: 94.1 },
  { label: '31 ago', value: 93.6 },
  { label: '7 sep', value: 92.8 },
  { label: '14 sep', value: 93.9, note: 'Semana con feriado del 15 de setiembre' },
  { label: '21 sep', value: 91.7 },
  { label: '28 sep', value: 92.4 },
  { label: '5 oct', value: 93.1 },
  { label: '12 oct', value: 90.6, note: 'Semana con feriado del 12 de octubre' },
];

export const MONTHLY: Point[] = [
  { label: 'Feb', value: 95.2, note: 'Inicio del curso lectivo' },
  { label: 'Mar', value: 94.6 },
  { label: 'Abr', value: 93.0, note: 'Semana Santa' },
  { label: 'May', value: 93.8 },
  { label: 'Jun', value: 92.1 },
  { label: 'Jul', value: 90.9, note: 'Vacaciones de medio periodo' },
  { label: 'Ago', value: 93.4 },
  { label: 'Set', value: 92.7 },
  { label: 'Oct', value: 92.0, note: 'Hasta el 19 de octubre' },
];

export const OCTOBER_BY_SECTION = [
  { section: '7-1', pct: 94.8, absences: 38, lates: 21, justified: '52 %' },
  { section: '7-2', pct: 93.1, absences: 51, lates: 18, justified: '47 %' },
  { section: '8-1', pct: 95.6, absences: 29, lates: 25, justified: '55 %' },
  { section: '9-1', pct: 89.4, absences: 86, lates: 40, justified: '31 %' },
  { section: '10-1', pct: 92.2, absences: 61, lates: 33, justified: '44 %' },
  { section: '10-2', pct: 91.5, absences: 70, lates: 29, justified: '38 %' },
  { section: '11-1', pct: 90.3, absences: 88, lates: 37, justified: '35 %' },
  { section: '11-2', pct: 92.9, absences: 94, lates: 30, justified: '33 %' },
];

export const DOWNLOADS = [
  { title: 'Asistencia mensual por sección', help: 'Formato para el informe a la Dirección Regional' },
  { title: 'Ausentismo por estudiante', help: 'Ausencias y tardías, justificadas o no' },
  { title: 'Alerta temprana', help: 'Estudiantes con 3 o más ausencias injustificadas' },
  { title: 'Avisos enviados y lectura', help: 'Por canal: app, SMS y correo' },
  { title: 'Giras y autorizaciones', help: 'Firmas, cédulas y fecha de cada encargado' },
  { title: 'Salidas tempranas y descargos', help: 'Con hora real de salida registrada' },
];
