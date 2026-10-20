import type { Status } from '../components';

export type NoticeType = 'info' | 'rem' | 'urg' | 'sus';

export const NOTICE_TYPES: Array<{ id: NoticeType; label: string; color: string; sample: { title: string; body: string } }> = [
  {
    id: 'info',
    label: 'Informativo',
    color: 'var(--blue)',
    sample: {
      title: 'Reunión de encargados: jueves 22 de octubre, 6:00 p. m.',
      body: 'Los esperamos en el gimnasio para la entrega de informes del III periodo. Si no puede asistir, avise a la oficina.',
    },
  },
  {
    id: 'rem',
    label: 'Recordatorio',
    color: 'var(--green)',
    sample: {
      title: 'Faltan 8 autorizaciones para la gira del 31 de octubre',
      body: 'Si su hijo(a) de 10-1 o 10-2 va a la gira, firme la autorización en la app antes del lunes 26.',
    },
  },
  {
    id: 'urg',
    label: 'Urgente',
    color: 'var(--orange)',
    sample: {
      title: 'Corte de electricidad en el colegio',
      body: 'Las lecciones de hoy terminan a las 8:00 p. m. Los menores de edad saldrán solo si su encargado lo autoriza en la app o los retira.',
    },
  },
  {
    id: 'sus',
    label: 'Suspensión de lecciones',
    color: 'var(--amber-ink)',
    sample: {
      title: 'Se suspenden lecciones mañana martes 20 de octubre',
      body: 'Por la alerta emitida por las autoridades no habrá lecciones en la jornada nocturna. Se repondrán según indique la dirección.',
    },
  },
];

/** Selected chip colors per notice type (the chip takes the type's own tint). */
export const NOTICE_TONE: Record<NoticeType, Status['tone']> = { info: 'blue', rem: 'green', urg: 'orange', sus: 'amber' };

export const AUDIENCES = [
  { id: 'all', label: 'Toda la jornada nocturna', people: 239 },
  { id: 'enc', label: 'Encargados de menores', people: 142 },
  { id: 'adu', label: 'Estudiantes mayores de edad', people: 97 },
  { id: 'sec', label: 'Secciones: 10-1, 10-2', people: 58 },
  { id: 'doc', label: 'Docentes', people: 24 },
];

export const CHANNELS = [
  { id: 'app', label: 'Notificación en la app' },
  { id: 'sms', label: 'SMS' },
  { id: 'mail', label: 'Correo' },
];

export const AUTO_RULES = [
  { id: 'abs', label: 'Ausencia en una lección', help: 'Al guardar el pase de lista', on: true },
  { id: 'late', label: 'Llegada tardía', help: 'Al guardar el pase de lista', on: true },
  { id: 'exit', label: 'Salida del colegio', help: 'Cuando el guarda registra la salida', on: true },
  { id: 'three', label: '3 ausencias injustificadas en el mes', help: 'También se avisa a orientación', on: true },
  { id: 'arr', label: 'Ingreso al colegio', help: 'Opcional, la familia lo activa', on: false },
  { id: 'sms', label: 'Respaldo por SMS', help: 'Si no abren la app en 10 minutos', on: true },
];

export const SENT_NOTICES: Array<{ title: string; type: Status; to: string; when: string; read: number }> = [
  { title: 'Entrega de informes del II periodo', type: { label: 'Informativo', tone: 'blue' }, to: 'Toda la jornada', when: 'Vie 16 oct · 4:30 p. m.', read: 82 },
  { title: 'Recordatorio: autorización de gira', type: { label: 'Recordatorio', tone: 'green' }, to: 'Encargados 10-1 y 10-2', when: 'Jue 15 oct · 5:00 p. m.', read: 69 },
  { title: 'Lecciones terminan 8:35 p. m. por actividad', type: { label: 'Urgente', tone: 'orange' }, to: 'Toda la jornada', when: 'Mar 6 oct · 6:20 p. m.', read: 91 },
  { title: 'Feriado 12 de octubre: no hay lecciones', type: { label: 'Suspensión', tone: 'amber' }, to: 'Toda la jornada', when: 'Jue 8 oct · 3:00 p. m.', read: 88 },
];
