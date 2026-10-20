import type { Mark } from './school';

export interface RollStudent {
  id: number;
  name: string;
  adult?: boolean;
  /** Early exit authorized by the guardian for today. */
  exitNote?: string;
}

export const ROLL_SECTION = { id: '10-2', subject: 'Matemática', shift: 'Jornada nocturna', date: 'Lun 19 oct · 6:00 p. m.' };

export const ROLL_STUDENTS: RollStudent[] = [
  { id: 1, name: 'Valeria Araya Mora' },
  { id: 2, name: 'Mateo Brenes Quesada' },
  { id: 3, name: 'Isabella Castro Jiménez' },
  { id: 4, name: 'Sebastián Chaves Rojas', adult: true },
  { id: 5, name: 'Camila Fallas Vargas' },
  { id: 6, name: 'Daniel Gamboa Solano', exitNote: 'Presente · salida autorizada 8:00 p. m.' },
  { id: 7, name: 'Mariana Herrera Calvo', adult: true },
  { id: 8, name: 'Thiago Jiménez Ulate' },
  { id: 9, name: 'Lucía Monge Arias' },
  { id: 10, name: 'Gabriel Núñez Porras' },
  { id: 11, name: 'Sofía Picado León' },
  { id: 12, name: 'Andrés Salazar Mena', adult: true },
];

export const ROLL_INITIAL: Record<number, Mark | undefined> = {
  1: 'P', 2: 'A', 3: 'P', 4: 'T', 5: 'P', 6: 'P', 7: 'P', 9: 'P', 10: 'A', 12: 'P',
};
