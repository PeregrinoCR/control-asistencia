import { SCHOOL_DAYS } from '../data/schedule';
import { localDate } from './schedule';
import { supabase } from './supabase';

/** A transfer for a period (e.g. standardized tests): each section it moves and its temporary room. */
export interface EventoAula {
  id: string;
  nombre: string;
  /** ISO dates, inclusive. */
  desde: string;
  hasta: string;
  /** section → room during the event. */
  aulas: Record<string, string>;
}

/** Rooms kept in `colegios.config`: the school's catalog, each section's fixed room, and transfer events. */
export interface AulasConfig {
  aulas: string[];
  aulasAdecuacion: Record<string, string>;
  aulasGrupo: Record<string, string>;
  eventosAula: EventoAula[];
}

export const SIN_CONFIG: AulasConfig = { aulas: [], aulasAdecuacion: {}, aulasGrupo: {}, eventosAula: [] };

/** The event that moves a section on a date, if any. */
export function eventoActivo(cfg: AulasConfig, seccion: string, fecha: string) {
  return cfg.eventosAula.find((e) => e.desde <= fecha && fecha <= e.hasta && e.aulas[seccion]);
}

/** Room of a section on a date: the transfer event that covers it, else its fixed room. */
export function aulaDe(cfg: AulasConfig, seccion: string, fecha: string) {
  return eventoActivo(cfg, seccion, fecha)?.aulas[seccion] ?? cfg.aulasGrupo[seccion] ?? '';
}

/** Next date (today included) that falls on a school day id ('L', 'K'…). */
export function proximaFecha(dayId: string, base = new Date()) {
  const target = SCHOOL_DAYS.findIndex((d) => d.id === dayId) + 1; // Monday = 1
  const d = new Date(base);
  d.setDate(d.getDate() + ((target - base.getDay() + 7) % 7));
  return localDate(d);
}

/** Reads the rooms from the school's configuration. */
export async function leerAulas(): Promise<AulasConfig> {
  const { data } = await supabase!.from('colegios').select('config').maybeSingle();
  const cfg = data?.config ?? {};
  return {
    aulas: cfg.aulas ?? [],
    aulasAdecuacion: cfg.aulasAdecuacion ?? {},
    aulasGrupo: cfg.aulasGrupo ?? {},
    eventosAula: cfg.eventosAula ?? [],
  };
}
