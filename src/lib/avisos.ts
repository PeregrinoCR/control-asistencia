import type { NoticeType } from '../data/notices';

export type Audience = 'all' | 'enc' | 'adu' | 'sec' | 'doc';
export type NoticeState = 'borrador' | 'programado' | 'enviado' | 'retirado';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: 'Todas las familias y estudiantes mayores',
  enc: 'Encargados de menores',
  adu: 'Estudiantes mayores de edad',
  sec: 'Secciones elegidas',
  doc: 'Solo personal del colegio',
};

export interface Notice {
  id: string;
  tipo: NoticeType;
  titulo: string;
  cuerpo: string;
  destino: Audience;
  secciones: string[];
  estado: NoticeState;
  enviado: string | null;
  programado_para: string | null;
  retirado: string | null;
  motivo_retiro: string | null;
  reenvios: number;
  ultimo_reenvio: string | null;
  creado: string;
}

export const NOTICE_COLUMNS =
  'id, tipo, titulo, cuerpo, destino, secciones, estado, enviado, programado_para, retirado, motivo_retiro, reenvios, ultimo_reenvio, creado';

/** A message the school reuses; saved in `colegios.config.plantillasAvisos`. */
export interface NoticeTemplate {
  id: string;
  nombre: string;
  tipo: NoticeType;
  titulo: string;
  cuerpo: string;
}

/** Starting templates; the school edits them in the "Plantillas" tab. Text in [brackets] is for the school to fill in. */
export const DEFAULT_TEMPLATES: NoticeTemplate[] = [
  {
    id: 'reunion',
    nombre: 'Reunión de encargados',
    tipo: 'info',
    titulo: 'Reunión de encargados: [DÍA Y FECHA], [HORA]',
    cuerpo: 'Los esperamos en [LUGAR] para [MOTIVO]. Si no puede asistir, avise a la oficina.',
  },
  {
    id: 'gira',
    nombre: 'Recordatorio de autorización',
    tipo: 'rem',
    titulo: 'Faltan autorizaciones para la gira del [FECHA]',
    cuerpo: 'Si su hijo(a) va a la gira, firme la autorización en la app antes del [FECHA LÍMITE].',
  },
  {
    id: 'suspension',
    nombre: 'Suspensión de lecciones',
    tipo: 'sus',
    titulo: 'Se suspenden lecciones [DÍA Y FECHA]',
    cuerpo: 'Por [MOTIVO] no habrá lecciones en la jornada nocturna. Se repondrán según indique la dirección.',
  },
  {
    id: 'salida',
    nombre: 'Salida anticipada',
    tipo: 'urg',
    titulo: 'Hoy las lecciones terminan a las [HORA]',
    cuerpo: 'Los menores de edad saldrán solo si su encargado lo autoriza en la app o los retira.',
  },
  {
    id: 'feriado',
    nombre: 'Feriado',
    tipo: 'info',
    titulo: 'Feriado [FECHA]: no hay lecciones',
    cuerpo: 'Retomamos las lecciones el [FECHA DE REGRESO].',
  },
];

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString('es-CR', opts);

/** «vie 30 oct, 4:00 p. m.» */
export const whenLabel = (iso: string) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Value for an `<input type="datetime-local">` from an ISO date (local time). */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Tomorrow at 4:00 p. m., a handy default for a scheduled notice. */
export function tomorrowAfternoon() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(16, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

export interface Reading {
  total: number;
  leidos: number;
}

export interface Pending {
  nombre: string;
  detalle: string;
  telefono: string | null;
  con_app: boolean;
}
