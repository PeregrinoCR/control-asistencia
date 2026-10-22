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
