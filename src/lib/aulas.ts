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
  aulasGrupo: Record<string, string>;
  eventosAula: EventoAula[];
  /** Seats of each room, by room name. A room without a number has no limit. */
  capacidades: Record<string, number>;
}

export const SIN_CONFIG: AulasConfig = { aulas: [], aulasGrupo: {}, eventosAula: [], capacidades: {} };

/** Rooms that more than one section uses as its fixed room: room → sections. */
export function choquesFijos(cfg: AulasConfig, secciones: string[]) {
  const por = new Map<string, string[]>();
  for (const s of secciones) {
    const a = cfg.aulasGrupo[s];
    if (a) por.set(a, [...(por.get(a) ?? []), s]);
  }
  return new Map([...por].filter(([, v]) => v.length > 1));
}

/** Sections of a transfer event that end up in the same room (the event's room wins over the fixed one). */
export function choquesEvento(cfg: AulasConfig, ev: EventoAula, secciones: string[]) {
  const por = new Map<string, string[]>();
  for (const s of secciones) {
    const a = ev.aulas[s] ?? cfg.aulasGrupo[s];
    if (a) por.set(a, [...(por.get(a) ?? []), s]);
  }
  // Two sections that both stay in their own fixed room already show up as a fixed-room clash.
  return new Map([...por].filter(([a, v]) => v.length > 1 && v.some((s) => ev.aulas[s] === a)));
}

/** Renames a section in every place the settings keep it by name (rooms, transfer events, special events, exams). */
export function renombrarEnConfig<T extends Record<string, unknown>>(cfg: T, de: string, a: string): T {
  const clave = (o: Record<string, unknown> | undefined) => {
    if (!o || !(de in o)) return o;
    const { [de]: v, ...resto } = o;
    return { ...resto, [a]: v };
  };
  const out: Record<string, unknown> = { ...cfg };
  if (out.aulasGrupo) out.aulasGrupo = clave(out.aulasGrupo as Record<string, unknown>);
  if (Array.isArray(out.eventosAula)) out.eventosAula = out.eventosAula.map((e) => ({ ...e, aulas: clave(e.aulas) }));
  if (Array.isArray(out.eventos)) {
    out.eventos = out.eventos.map((e) => (Array.isArray(e.secciones) ? { ...e, secciones: e.secciones.map((x: string) => (x === de ? a : x)) } : e));
  }
  if (Array.isArray(out.pruebas)) out.pruebas = out.pruebas.map((x) => (x.seccion === de ? { ...x, seccion: a } : x));
  return out as T;
}

/** Removes a section from the settings that keep it by name. */
export function quitarDeConfig<T extends Record<string, unknown>>(cfg: T, nombre: string): T {
  const sin = (o: Record<string, unknown> | undefined) => {
    if (!o) return o;
    const { [nombre]: _quitada, ...resto } = o;
    return resto;
  };
  const out: Record<string, unknown> = { ...cfg };
  if (out.aulasGrupo) out.aulasGrupo = sin(out.aulasGrupo as Record<string, unknown>);
  if (Array.isArray(out.eventosAula)) out.eventosAula = out.eventosAula.map((e) => ({ ...e, aulas: sin(e.aulas) }));
  return out as T;
}

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
    aulasGrupo: cfg.aulasGrupo ?? {},
    eventosAula: cfg.eventosAula ?? [],
    capacidades: cfg.capacidades ?? {},
  };
}
