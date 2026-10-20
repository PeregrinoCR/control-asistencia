/**
 * Student cards and the gate check.
 * The QR holds an opaque card code, never the cédula: a lost card can be revoked
 * and a photo of it reveals nothing about the student.
 */

export interface StudentCard {
  code: string;
  name: string;
  section: string;
  age: number;
  idNumber: string;
  /** Revoked when the family reports the card lost; a replacement gets a new code. */
  revoked?: boolean;
  /** Early exit authorized for today, from the family app. */
  exit?: { time: string; how: string; pickup?: { name: string; idNumber: string }; receipt: string };
}

export const CARD_PREFIX = 'ASIST1:';

export const CARDS: StudentCard[] = [
  { code: 'K7Q2-MB16', name: 'Mateo Brenes Quesada', section: '10-2', age: 16, idNumber: '1-0000-0001' },
  {
    code: 'R4T8-SB14',
    name: 'Sofía Brenes Quesada',
    section: '8-1',
    age: 14,
    idNumber: '1-0000-0002',
    exit: { time: '8:00 p. m.', how: 'Sale por sus propios medios', receipt: 'ST-0042' },
  },
  {
    code: 'P9L3-DG17',
    name: 'Daniel Gamboa Solano',
    section: '10-2',
    age: 17,
    idNumber: '1-0000-0005',
    exit: { time: '8:00 p. m.', how: 'Lo retira su madre', pickup: { name: 'Teresa Solano', idNumber: '1-0000-0105' }, receipt: 'ST-0043' },
  },
  { code: 'H2W6-SC19', name: 'Sebastián Chaves Rojas', section: '10-2', age: 19, idNumber: '1-0000-0004' },
  { code: 'M5X1-GN17', name: 'Gabriel Núñez Porras', section: '10-2', age: 17, idNumber: '1-0000-0008' },
  { code: 'Z8V4-LM16', name: 'Lucía Monge Arias', section: '10-1', age: 16, idNumber: '1-0000-0007', revoked: true },
];

export const cardPayload = (c: StudentCard) => CARD_PREFIX + c.code;

export type GateMode = 'in' | 'out';

export type GateResult =
  | { kind: 'ok'; title: string; detail: string; card: StudentCard; confirm?: string }
  | { kind: 'warn'; title: string; detail: string; card: StudentCard; confirm: string }
  | { kind: 'deny'; title: string; detail: string; card?: StudentCard };

/** Decides what the guard sees after scanning. `now` is minutes after 6:00 p. m. */
export function checkCard(payload: string, mode: GateMode, now: number): GateResult {
  const code = payload.trim().toUpperCase().replace(CARD_PREFIX, '');
  const card = CARDS.find((c) => c.code === code);
  if (!card) return { kind: 'deny', title: 'Carné no reconocido', detail: 'No pertenece a este colegio. Pida la cédula y avise a dirección.' };
  if (card.revoked)
    return { kind: 'deny', card, title: 'Carné reportado como perdido', detail: 'Retenga el carné y pida la cédula. La familia ya solicitó uno nuevo.' };

  if (mode === 'in') {
    const late = now > 10;
    return {
      kind: 'ok',
      card,
      title: late ? 'Entrada tardía registrada' : 'Entrada registrada',
      detail: late ? 'Se avisa a la familia y al docente de la lección.' : 'Se avisa a la familia si activó los avisos de ingreso.',
    };
  }

  if (card.age >= 18) return { kind: 'ok', card, title: 'Salida registrada', detail: 'Mayor de edad: puede salir sin autorización.' };
  if (!card.exit)
    return {
      kind: 'deny',
      card,
      title: 'Salida no autorizada',
      detail: 'Es menor de edad y no tiene salida autorizada hoy. No puede salir; llame a la familia o a dirección.',
    };
  if (card.exit.pickup)
    return {
      kind: 'warn',
      card,
      title: `Salida autorizada · ${card.exit.time}`,
      detail: `Lo retira ${card.exit.pickup.name}. Verifique su cédula ${card.exit.pickup.idNumber} antes de dejarlo salir.`,
      confirm: 'Cédula verificada, registrar salida',
    };
  return {
    kind: 'ok',
    card,
    title: `Salida autorizada · ${card.exit.time}`,
    detail: `${card.exit.how}. Comprobante ${card.exit.receipt}. Se avisa a la familia.`,
  };
}

/** Demo clock for the night shift: 8:12 p. m. */
export const DEMO_NOW = 132;
export const DEMO_NOW_LABEL = '8:12 p. m.';
