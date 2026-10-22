/** Who can do what in the school's account. Families and adult students are not staff users. */

export type PermissionId =
  | 'rollCall' | 'viewAttendance' | 'approveJust' | 'approveExit'
  | 'teacherAbs' | 'assign'
  | 'trips' | 'gate'
  | 'notices' | 'sms'
  | 'earlyWarning' | 'saber'
  | 'payments' | 'cards' | 'students' | 'reports' | 'users' | 'settings';

export interface Permission {
  id: PermissionId;
  label: string;
  help: string;
  /** Can be limited to the sections a guide teacher is in charge of. */
  scoped?: boolean;
}

export const PERMISSION_GROUPS: Array<{ id: string; label: string; permissions: Permission[] }> = [
  {
    id: 'att',
    label: 'Asistencia',
    permissions: [
      { id: 'rollCall', label: 'Pasar lista', help: 'En las lecciones que tiene asignadas' },
      { id: 'viewAttendance', label: 'Ver asistencia', help: 'Panel del día y estudiantes', scoped: true },
      { id: 'approveJust', label: 'Aprobar justificaciones', help: 'Aprobar, rechazar o pedir información', scoped: true },
      { id: 'approveExit', label: 'Aprobar salidas anticipadas', help: 'Autorizar o no las salidas que piden las familias' },
    ],
  },
  {
    id: 'staff',
    label: 'Docentes',
    permissions: [
      { id: 'teacherAbs', label: 'Registrar ausencias de docentes', help: 'Y elegir sustitutos o lección libre' },
      { id: 'assign', label: 'Asignar profesores y horarios', help: 'Secciones, materias y profesor guía' },
    ],
  },
  {
    id: 'perm',
    label: 'Permisos y portón',
    permissions: [
      { id: 'trips', label: 'Crear giras', help: 'Y ver las autorizaciones firmadas', scoped: true },
      { id: 'gate', label: 'Registrar entradas y salidas', help: 'Escanear carnés en el portón' },
    ],
  },
  {
    id: 'comm',
    label: 'Comunicación',
    permissions: [
      { id: 'notices', label: 'Enviar avisos a familias', help: 'Por la app', scoped: true },
      { id: 'sms', label: 'Enviar avisos por SMS', help: 'Tiene costo por mensaje' },
    ],
  },
  {
    id: 'follow',
    label: 'Seguimiento',
    permissions: [
      { id: 'earlyWarning', label: 'Alerta temprana', help: 'Ver casos, registrar contactos y planes', scoped: true },
      { id: 'saber', label: 'Exportar para SABER', help: 'Descargar casos para el MEP' },
    ],
  },
  {
    id: 'admin',
    label: 'Administración',
    permissions: [
      { id: 'payments', label: 'Confirmar pagos', help: 'Revisar comprobantes SINPE' },
      { id: 'students', label: 'Gestionar estudiantes', help: 'Matrícula, encargados y su importación' },
      { id: 'cards', label: 'Gestionar carnés', help: 'Imprimir, reponer y desactivar' },
      { id: 'reports', label: 'Ver reportes', help: 'Y descargarlos' },
      { id: 'users', label: 'Gestionar usuarios', help: 'Invitar, asignar roles y permisos' },
      { id: 'settings', label: 'Cambiar la configuración', help: 'Institución, jornadas y módulos' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.permissions);

export const PERMISSION_LABEL = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.id, p.label])) as Record<PermissionId, string>;

/** Permissions that can be limited to one or more sections. */
export const SCOPED = new Set<PermissionId>(ALL_PERMISSIONS.filter((p) => p.scoped).map((p) => p.id));

export type RoleId = 'dir' | 'doc' | 'gui' | 'ori' | 'adm' | 'gua' | 'aux';

export interface Role {
  id: RoleId;
  name: string;
  help: string;
  grants: PermissionId[];
  /** For guide teachers, scoped permissions apply only to their own section. */
  scopedToSection?: boolean;
}

export const ROLES: Role[] = [
  {
    id: 'dir',
    name: 'Dirección',
    help: 'Administra todo el colegio',
    grants: ALL_PERMISSIONS.map((p) => p.id),
  },
  { id: 'doc', name: 'Docente', help: 'Da lecciones', grants: ['rollCall'] },
  {
    id: 'gui',
    name: 'Profesor guía',
    help: 'A cargo de una sección',
    grants: ['viewAttendance', 'approveJust', 'earlyWarning'],
    scopedToSection: true,
  },
  {
    id: 'ori',
    name: 'Orientación',
    help: 'Seguimiento de estudiantes',
    grants: ['viewAttendance', 'approveJust', 'notices', 'earlyWarning', 'saber', 'reports'],
  },
  {
    id: 'adm',
    name: 'Administrativo',
    help: 'Oficina y secretaría',
    grants: ['viewAttendance', 'approveJust', 'approveExit', 'teacherAbs', 'trips', 'notices', 'payments', 'cards', 'students', 'reports'],
  },
  { id: 'gua', name: 'Guarda de portón', help: 'Controla entradas y salidas', grants: ['gate'] },
  { id: 'aux', name: 'Auxiliar', help: 'Personal de apoyo: cuido de exámenes y otras tareas', grants: [] },
];

export interface User {
  /** Number in the sample data, uuid from the server. */
  id: number | string;
  name: string;
  contact: string;
  roles: RoleId[];
  /** Section a guide teacher is in charge of. */
  section?: string;
  extra: PermissionId[];
  /** Working hours, in lessons, for staff who don't teach (used for exam care). */
  work?: { dias: string[]; desde: number; hasta: number } | null;
  active: boolean;
  lastSeen: string;
}

export const USERS: User[] = [
  { id: 1, name: '[NOMBRE DEL DIRECTOR(A)]', contact: '[CORREO]', roles: ['dir'], extra: [], active: true, lastSeen: 'Hoy 7:25 p. m.' },
  { id: 2, name: 'Andrea Solís', contact: 'andrea.solis@[COLEGIO]', roles: ['doc', 'gui'], section: '10-2', extra: [], active: true, lastSeen: 'Hoy 6:12 p. m.' },
  { id: 3, name: 'Ricardo Mora', contact: 'ricardo.mora@[COLEGIO]', roles: ['doc', 'gui'], section: '9-1', extra: ['teacherAbs'], active: true, lastSeen: 'Hoy 6:05 p. m.' },
  { id: 4, name: 'Jorge Céspedes', contact: 'jorge.cespedes@[COLEGIO]', roles: ['doc', 'gui'], section: '7-2', extra: [], active: true, lastSeen: 'Ayer 9:40 p. m.' },
  { id: 5, name: 'Karla Montero', contact: 'karla.montero@[COLEGIO]', roles: ['doc', 'gui'], section: '11-2', extra: [], active: true, lastSeen: 'Hoy 7:10 p. m.' },
  { id: 6, name: 'Esteban Quirós', contact: 'esteban.quiros@[COLEGIO]', roles: ['doc', 'gui'], section: '11-1', extra: [], active: true, lastSeen: 'Hoy 6:40 p. m.' },
  { id: 7, name: 'Lic. [NOMBRE] (orientación)', contact: 'orientacion@[COLEGIO]', roles: ['ori'], extra: [], active: true, lastSeen: 'Hoy 5:30 p. m.' },
  { id: 8, name: '[NOMBRE] (secretaría)', contact: 'secretaria@[COLEGIO]', roles: ['adm'], extra: ['users'], active: true, lastSeen: 'Hoy 4:50 p. m.' },
  { id: 9, name: '[NOMBRE] (guarda)', contact: '8800-2001', roles: ['gua'], extra: [], active: true, lastSeen: 'Hoy 8:00 p. m.' },
  { id: 10, name: 'Patricia Ulate', contact: 'patricia.ulate@[COLEGIO]', roles: ['doc', 'gui'], section: '10-1', extra: [], active: true, lastSeen: 'Hoy 6:00 p. m.' },
  { id: 11, name: '[NOMBRE] (docente anterior)', contact: '[CORREO]', roles: ['doc'], extra: [], active: false, lastSeen: 'Mar 30 jun' },
];

export const SECTION_IDS = ['7-1', '7-2', '8-1', '9-1', '10-1', '10-2', '11-1', '11-2'];

/** What a user can actually do: their roles' permissions plus individual extras. */
export function effectivePermissions(user: Pick<User, 'roles' | 'extra'>, roles: Role[]) {
  const fromRoles = new Set<PermissionId>(user.roles.flatMap((r) => roles.find((x) => x.id === r)?.grants ?? []));
  return { fromRoles, all: new Set<PermissionId>([...fromRoles, ...user.extra]) };
}

/** Extra permissions a guide teacher gets are limited to their own section (the server decides by section). */
export const GUIDE_EXTRA_SECTION = new Set<PermissionId>(['viewAttendance', 'approveJust', 'earlyWarning']);

/** Whether a scoped permission is limited to the user's own section. */
export function isSectionScoped(user: Pick<User, 'roles'>, perm: PermissionId, roles: Role[]) {
  if (!SCOPED.has(perm)) return false;
  // Limited only when every role that grants it is section-scoped.
  const granting = user.roles.map((r) => roles.find((x) => x.id === r)!).filter((r) => r.grants.includes(perm));
  return granting.length > 0 && granting.every((r) => r.scopedToSection);
}
