import { supabase } from './supabase';

/**
 * Justifying absences: the student shows the paper proof to each teacher they missed (family deadline),
 * and each teacher decides for their own lesson (teacher deadline). Both are counted in school days.
 * The server enforces the same rules (migration 0015); these helpers only let the screens show the days left.
 */
export interface JustifConfig {
  /** School days the student has to show the proof. */
  diasFamilia: number;
  /** School days the teacher has to decide. */
  diasDocente: number;
  /** Holidays and days without lessons (YYYY-MM-DD), not counted as school days. */
  noLectivos: string[];
}

export const DEFAULT_JUSTIF: JustifConfig = { diasFamilia: 5, diasDocente: 10, noLectivos: [] };

/** Reads `config.justificacion`, with the defaults for what the school has not set. */
export const justifConfigOf = (config: { justificacion?: Partial<JustifConfig> } | null | undefined): JustifConfig => ({
  diasFamilia: Number(config?.justificacion?.diasFamilia) || DEFAULT_JUSTIF.diasFamilia,
  diasDocente: Number(config?.justificacion?.diasDocente) || DEFAULT_JUSTIF.diasDocente,
  noLectivos: config?.justificacion?.noLectivos ?? [],
});

export async function loadJustifConfig(): Promise<JustifConfig> {
  const { data } = await supabase!.from('colegios').select('config').maybeSingle();
  return justifConfigOf(data?.config);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isSchoolDay = (d: Date, off: string[]) => d.getDay() >= 1 && d.getDay() <= 5 && !off.includes(iso(d));

/** School days after `from`, up to `to` inclusive (Monday to Friday, minus the days without lessons). Same count as the server. */
export function habiles(from: string, to: string, off: string[] = []): number {
  let n = 0;
  const d = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  while (d <= end) {
    if (isSchoolDay(d, off)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/** The last day to act: the Nth school day after the absence. */
export function ultimoDia(from: string, days: number, off: string[] = []): string {
  const d = new Date(from + 'T12:00:00');
  let n = 0;
  while (n < days) {
    d.setDate(d.getDate() + 1);
    if (isSchoolDay(d, off)) n++;
  }
  return iso(d);
}

/** School days left to act (0 on the last day); negative once the deadline has passed. */
export const diasRestantes = (from: string, days: number, today: string, off: string[] = []) => days - habiles(from, today, off);

export interface AbsenceKey {
  estudiante: string;
  fecha: string;
  leccion: number;
}

/** The teacher of that lesson marks the absence as justified (the paper proof was shown). */
export async function justificarAusencia(a: AbsenceKey, comprobante = true, nota = ''): Promise<string> {
  const { error } = await supabase!.rpc('justificar_ausencia', { p_estudiante: a.estudiante, p_fecha: a.fecha, p_leccion: a.leccion, p_comprobante: comprobante, p_nota: nota || null });
  return error?.message ?? '';
}

/** Undoes it within the teacher's deadline: the absence goes back to "sin justificar". */
export async function quitarJustificacion(a: AbsenceKey): Promise<string> {
  const { error } = await supabase!.rpc('quitar_justificacion', { p_estudiante: a.estudiante, p_fecha: a.fecha, p_leccion: a.leccion });
  return error?.message ?? '';
}

/** Dirección can justify or undo at any time; the reason is required and stays in the log. */
export async function excepcionJustificacion(a: AbsenceKey, justificar: boolean, motivo: string): Promise<string> {
  const { error } = await supabase!.rpc('excepcion_justificacion', { p_estudiante: a.estudiante, p_fecha: a.fecha, p_leccion: a.leccion, p_justificar: justificar, p_motivo: motivo });
  return error?.message ?? '';
}

/** The family tells the school why the student missed; the teacher reads it when deciding. It is not a justification. */
export async function avisarMotivo(colegioId: string, estudiante: string, fecha: string, motivo: string, comentario = ''): Promise<string> {
  const db = supabase!;
  const { data } = await db.auth.getUser();
  const { error } = await db
    .from('ausencia_avisos')
    .upsert({ colegio_id: colegioId, estudiante_id: estudiante, fecha, motivo, comentario: comentario.trim() || null, enviado_por: data.user?.id }, { onConflict: 'estudiante_id,fecha' });
  return error?.message ?? '';
}

/** One absence still open to decide (or already decided), with who decides it and how long they have. */
export interface Ausencia extends AbsenceKey {
  id: string;
  nombre: string;
  seccion: string;
  marca: 'A' | 'J';
  materia: string;
  docenteId: string;
  docente: string;
  /** Reason the family told, if they did. */
  aviso: string;
  nota: string;
  /** Last school day the teacher can decide. */
  vence: string;
  /** School days left for the teacher; negative once past. */
  restan: number;
}

/** Absences from the last `dias` calendar days, with the teacher of each lesson. Teachers only see their own through RLS + `soloDocente`. */
export async function cargarAusencias(cfg: JustifConfig, soloDocente?: string, dias = 40): Promise<Ausencia[] | string> {
  const db = supabase!;
  const today = new Date();
  const hoy = iso(today);
  const from = new Date(today);
  from.setDate(from.getDate() - dias);
  const [as, hs, avisos] = await Promise.all([
    db
      .from('asistencia')
      .select('id, estudiante_id, seccion_id, fecha, leccion, marca, registrado_por, nota_justificacion, estudiantes(nombre), secciones(nombre)')
      .in('marca', ['A', 'J'])
      .gte('fecha', iso(from))
      .order('fecha', { ascending: false })
      .limit(5000),
    db.from('horario').select('seccion_id, dia, leccion, docente_id, materias(nombre), personal(nombre)'),
    db.from('ausencia_avisos').select('estudiante_id, fecha, motivo').gte('fecha', iso(from)),
  ]);
  if (as.error) return as.error.message;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slot = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (hs.data ?? []) as any[]) slot.set(`${h.seccion_id}|${h.dia}|${h.leccion}`, h);
  const told = new Map((avisos.data ?? []).map((a: { estudiante_id: string; fecha: string; motivo: string }) => [`${a.estudiante_id}|${a.fecha}`, a.motivo]));
  const dayIds = ['D', 'L', 'K', 'M', 'J', 'V', 'S'];
  const out: Ausencia[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of as.data as any[]) {
    const h = slot.get(`${r.seccion_id}|${dayIds[new Date(r.fecha + 'T12:00:00').getDay()]}|${r.leccion}`);
    const docenteId = h?.docente_id ?? r.registrado_por ?? '';
    if (soloDocente && docenteId !== soloDocente) continue;
    out.push({
      id: r.id,
      estudiante: r.estudiante_id,
      nombre: r.estudiantes?.nombre ?? '—',
      seccion: r.secciones?.nombre ?? '—',
      fecha: r.fecha,
      leccion: r.leccion,
      marca: r.marca,
      materia: h?.materias?.nombre ?? '',
      docenteId,
      docente: h?.personal?.nombre ?? 'Sin docente asignado',
      aviso: told.get(`${r.estudiante_id}|${r.fecha}`) ?? '',
      nota: r.nota_justificacion ?? '',
      vence: ultimoDia(r.fecha, cfg.diasDocente, cfg.noLectivos),
      restan: diasRestantes(r.fecha, cfg.diasDocente, hoy, cfg.noLectivos),
    });
  }
  return out;
}

export const fechaCorta = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Vence mañana", "Quedan 3 días", "Venció el …". */
export function plazoTexto(restan: number, vence: string) {
  if (restan < 0) return `Venció el ${fechaCorta(vence)}`;
  if (restan === 0) return 'Vence hoy';
  if (restan === 1) return 'Vence mañana';
  return `Quedan ${restan} días`;
}

/** Dirección reminds a teacher of the absences they still have to decide. Resolves to an error message, or '' when sent. */
export async function recordarDocente(docente: string): Promise<string> {
  const { error } = await supabase!.rpc('recordar_docente', { p_docente: docente });
  return error?.message ?? '';
}
