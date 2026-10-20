export const routes = {
  index: '/',
  teacher: {
    rollCall: '/docente/pase-de-lista',
  },
  family: {
    home: '/familia',
    push: '/familia/notificacion',
    justify: '/familia/justificar',
    history: '/familia/historial',
    trip: '/familia/gira',
    earlyExit: '/familia/salida',
    settings: '/familia/ajustes',
  },
  admin: {
    today: '/direccion',
    assignments: '/direccion/asignaciones',
    trips: '/direccion/giras',
    students: '/direccion/estudiantes',
    justifications: '/direccion/justificaciones',
    notices: '/direccion/avisos',
    earlyWarning: '/direccion/alerta-temprana',
    reports: '/direccion/reportes',
    settings: '/direccion/configuracion',
  },
} as const;
