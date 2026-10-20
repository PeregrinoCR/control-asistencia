export const INSTITUTION_FIELDS = [
  { id: 'c-nombre', label: 'Nombre de la institución', placeholder: '[NOMBRE DEL COLEGIO]' },
  { id: 'c-codigo', label: 'Código presupuestario', placeholder: '[CÓDIGO]' },
  { id: 'c-dre', label: 'Dirección Regional de Educación', placeholder: '[DIRECCIÓN REGIONAL]' },
  { id: 'c-circ', label: 'Circuito', placeholder: '[CIRCUITO]' },
  { id: 'c-dir', label: 'Director(a)', placeholder: '[NOMBRE DEL DIRECTOR(A)]' },
  { id: 'c-tel', label: 'Teléfono que ven las familias', placeholder: '[TELÉFONO]', type: 'tel' },
  { id: 'c-mail', label: 'Correo institucional', placeholder: '[CORREO]', type: 'email' },
  { id: 'c-addr', label: 'Dirección física', placeholder: '[PROVINCIA, CANTÓN, DISTRITO, SEÑAS]' },
];

export const INSTITUTION_KINDS = [
  'Colegio académico diurno',
  'Colegio técnico (CTP)',
  'Colegio nocturno',
  'Liceo rural',
  'CINDEA / IPEC',
  'Escuela',
];

export const SCHOOL_CALENDAR = [
  { label: 'Inicio del curso', value: '[FECHA DE INICIO]' },
  { label: 'I periodo', value: '[FECHA] – [FECHA]' },
  { label: 'Vacaciones de medio periodo', value: '[FECHA] – [FECHA]' },
  { label: 'II periodo', value: '[FECHA] – [FECHA]' },
  { label: 'Feriados registrados', value: '12 (calendario nacional)' },
  { label: 'Fin del curso', value: '[FECHA DE CIERRE]' },
];

export type ShiftId = 'noc' | 'diu' | 'sab';

export const SHIFT_BLOCKS: Record<ShiftId, { label: string; blocks: Array<[name: string, start: string, end: string, minutes: number]> }> = {
  noc: {
    label: 'Nocturna',
    blocks: [
      ['1.ª lección', '6:00 p. m.', '6:40 p. m.', 40],
      ['2.ª lección', '6:40 p. m.', '7:20 p. m.', 40],
      ['3.ª lección', '7:20 p. m.', '8:00 p. m.', 40],
      ['Recreo', '8:00 p. m.', '8:10 p. m.', 10],
      ['4.ª lección', '8:10 p. m.', '8:50 p. m.', 40],
      ['Recreo · merienda', '8:50 p. m.', '9:10 p. m.', 20],
      ['5.ª lección', '9:10 p. m.', '9:50 p. m.', 40],
    ],
  },
  diu: {
    label: 'Diurna',
    blocks: [
      ['1.ª lección', '7:00 a. m.', '7:40 a. m.', 40],
      ['2.ª lección', '7:40 a. m.', '8:20 a. m.', 40],
      ['Recreo', '8:20 a. m.', '8:30 a. m.', 10],
      ['3.ª lección', '8:30 a. m.', '9:10 a. m.', 40],
      ['4.ª lección', '9:10 a. m.', '9:50 a. m.', 40],
      ['5.ª a 7.ª lección y recreo', '9:50 a. m.', '11:50 a. m.', 120],
      ['Almuerzo', '11:50 a. m.', '12:30 p. m.', 40],
      ['8.ª a 11.ª lección y recreo', '12:30 p. m.', '3:30 p. m.', 180],
      ['12.ª lección', '3:30 p. m.', '4:10 p. m.', 40],
    ],
  },
  sab: {
    label: 'Sábados',
    blocks: [
      ['Bloque 1', '8:00 a. m.', '9:20 a. m.', 80],
      ['Recreo', '9:20 a. m.', '9:40 a. m.', 20],
      ['Bloque 2', '9:40 a. m.', '11:00 a. m.', 80],
      ['Bloque 3', '11:00 a. m.', '12:00 m. d.', 60],
    ],
  },
};

export const WEEKDAYS = [
  { short: 'L', full: 'Lunes' },
  { short: 'K', full: 'Martes' },
  { short: 'M', full: 'Miércoles' },
  { short: 'J', full: 'Jueves' },
  { short: 'V', full: 'Viernes' },
  { short: 'S', full: 'Sábado' },
];

export const SHIFT_DAYS: Record<ShiftId, string[]> = {
  noc: ['L', 'K', 'M', 'J', 'V'],
  diu: ['L', 'K', 'M', 'J', 'V'],
  sab: ['S'],
};

export const SHIFT_RULES = [
  { id: 'each', label: 'Pasar lista en cada lección', help: 'Si se apaga, solo en la primera lección', on: true },
  { id: 'guard', label: 'Registro de entrada en portón', help: 'El guarda marca la llegada al colegio', on: true },
  { id: 'auto', label: 'Recordar al docente si no pasó lista', help: '10 minutos después de iniciar la lección', on: true },
];

export const PERMISSIONS = ['Pasar lista', 'Aprobar justificaciones', 'Crear giras', 'Enviar avisos', 'Ver reportes', 'Registrar salidas'];

export const ROLES: Array<{ id: string; name: string; users: string; grants: boolean[] }> = [
  { id: 'dir', name: 'Dirección', users: '2 usuarios', grants: [true, true, true, true, true, true] },
  { id: 'doc', name: 'Docente', users: '22 usuarios', grants: [true, false, false, false, false, false] },
  { id: 'gui', name: 'Profesor guía', users: '8 usuarios', grants: [true, true, true, true, true, false] },
  { id: 'ori', name: 'Orientación', users: '1 usuario', grants: [false, true, false, true, true, false] },
  { id: 'adm', name: 'Administrativo', users: '2 usuarios', grants: [false, true, false, true, true, false] },
  { id: 'gua', name: 'Guarda de portón', users: '2 usuarios', grants: [false, false, false, false, false, true] },
];

export const SPECIAL_TYPES = [
  {
    id: 'early',
    label: 'Salida anticipada',
    detail: 'Las lecciones terminan a las [HORA]. Las lecciones posteriores no se registran.',
    title: 'Jueves 22 de octubre: lecciones terminan a las 8:10 p. m.',
    body: 'Por la reunión de encargados. Los menores de edad salen solo con autorización del encargado en la app o si los retiran en el portón.',
  },
  {
    id: 'late',
    label: 'Ingreso tardío',
    detail: 'Las lecciones empiezan a las [HORA]. No se marcan tardías antes de esa hora.',
    title: 'Lunes 9 de noviembre: lecciones inician a las 6:40 p. m.',
    body: 'Por la charla de orientación vocacional para 11.º. La primera lección se repone según indique cada docente.',
  },
  {
    id: 'susp',
    label: 'Suspensión de lecciones',
    detail: 'No hay lecciones ese día. No se registra asistencia.',
    title: 'No hay lecciones el [FECHA]',
    body: 'Por [MOTIVO]. Las lecciones se repondrán según indique la dirección.',
  },
  {
    id: 'swap',
    label: 'Cambio de lecciones',
    detail: 'Se mueven o se juntan lecciones. El pase de lista sigue el nuevo orden.',
    title: 'Viernes 30 de octubre: horario de lecciones cambia',
    body: 'La 3.ª lección se extiende 20 minutos por el simulacro de evacuación. La salida se mantiene a las 9:50 p. m.',
  },
];

export const SPECIAL_SCOPES = [
  { id: 'all', label: 'Toda la jornada' },
  { id: 'secs', label: 'Secciones específicas' },
  { id: 'lvl', label: 'Un nivel (ej.: 11.º)' },
];

export const SPECIAL_RULES = [
  { id: 'before', label: 'Avisar a familias 1 día antes', help: 'Por app y SMS a las 4:00 p. m.', on: true },
  { id: 'same', label: 'Recordatorio el mismo día', help: '2 horas antes del cambio', on: true },
  { id: 'auth', label: 'Menores salen solo con autorización', help: 'El encargado autoriza en la app o los retira', on: true },
];

export const SPECIAL_EVENTS = [
  { month: 'Oct', day: '22', name: 'Reunión de encargados', change: 'Lecciones terminan a las 8:10 p. m.', who: 'Toda la jornada', notice: 'Aviso 1 día antes y el mismo día', scheduled: true },
  { month: 'Oct', day: '30', name: 'Simulacro de evacuación', change: '3.ª lección se extiende 20 min', who: '7-1 a 9-1', notice: 'Aviso el mismo día 4:00 p. m.', scheduled: true },
  { month: 'Nov', day: '9', name: 'Charla de orientación vocacional', change: 'Ingreso a las 6:40 p. m.', who: '11-1 y 11-2', notice: 'Sin aviso todavía', scheduled: false },
  { month: 'Nov', day: '27', name: 'Entrega de notas', change: 'Suspensión de lecciones', who: 'Toda la jornada', notice: 'Sin aviso todavía', scheduled: false },
];

export const EXAM_SECTIONS = ['Todas', '7-1', '9-1', '10-1', '10-2', '11-1', '11-2'];

export const EXAMS: Array<{ date: string; time: string; subject: string; section: string; teacher: string; room: string; published: boolean }> = [
  { date: 'Lun 2 nov', time: '6:00 p. m.', subject: 'Matemática', section: '10-2', teacher: 'Andrea Solís', room: 'Aula 5', published: true },
  { date: 'Lun 2 nov', time: '6:00 p. m.', subject: 'Matemática', section: '10-1', teacher: 'Andrea Solís', room: 'Aula 4', published: true },
  { date: 'Mar 3 nov', time: '6:00 p. m.', subject: 'Español', section: '10-2', teacher: 'Esteban Quirós', room: 'Aula 5', published: true },
  { date: 'Mar 3 nov', time: '7:20 p. m.', subject: 'Inglés', section: '11-1', teacher: 'Ana Lucía Rojas', room: 'Aula 8', published: true },
  { date: 'Mié 4 nov', time: '7:20 p. m.', subject: 'Biología', section: '10-2', teacher: 'Ricardo Mora', room: 'Laboratorio', published: false },
  { date: 'Mié 4 nov', time: '6:00 p. m.', subject: 'Estudios Sociales', section: '9-1', teacher: 'Jorge Céspedes', room: 'Aula 3', published: true },
  { date: 'Jue 5 nov', time: '6:00 p. m.', subject: 'Inglés', section: '10-2', teacher: 'Karla Montero', room: 'Aula 5', published: false },
  { date: 'Jue 5 nov', time: '8:10 p. m.', subject: 'Química', section: '11-2', teacher: 'Ricardo Mora', room: 'Laboratorio', published: true },
  { date: 'Vie 6 nov', time: '6:00 p. m.', subject: 'Matemática', section: '7-1', teacher: 'Patricia Ulate', room: 'Aula 1', published: true },
  { date: 'Vie 6 nov', time: '9:10 p. m.', subject: 'Educación Cívica', section: '10-2', teacher: 'Jorge Céspedes', room: 'Aula 5', published: true },
];

export const EXAM_RULES = [
  { id: 'two', label: 'Recordatorio 2 días antes', help: 'A estudiantes y encargados', on: true },
  { id: 'day', label: 'Recordatorio el día de la prueba', help: 'A las 3:00 p. m.', on: true },
  { id: 'miss', label: 'Aviso inmediato si falta a la prueba', help: 'Con enlace para justificar', on: true },
  { id: 'adults', label: 'Incluir a estudiantes mayores de edad', help: 'Ellos reciben el aviso directamente', on: true },
];

export type Sector = 'public' | 'private';

/** Optional parts of the app. Defaults depend on whether the school is public (MEP) or private. */
export const MODULES: Array<{ id: string; label: string; help: string; defaults: Record<Sector, boolean> }> = [
  { id: 'saber', label: 'Exportación para SABER (MEP)', help: 'Casos de alerta temprana en archivo para cargar en la plataforma del MEP', defaults: { public: true, private: false } },
  { id: 'pay', label: 'Pagos por SINPE Móvil', help: 'Las familias pagan giras o cuotas y suben el comprobante; dirección lo confirma', defaults: { public: false, private: true } },
  { id: 'sms', label: 'SMS de respaldo', help: 'Cada mensaje tiene costo. Si se apaga, solo se envían notificaciones en la app', defaults: { public: true, private: true } },
  { id: 'smsUrgent', label: 'SMS solo para avisos urgentes', help: 'Ausencias de menores, suspensiones y salidas. Reduce el costo de SMS', defaults: { public: true, private: false } },
];

export function moduleDefaults(sector: Sector) {
  return Object.fromEntries(MODULES.map((m) => [m.id, m.defaults[sector]])) as Record<string, boolean>;
}
