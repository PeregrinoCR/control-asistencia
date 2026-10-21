import { useCallback, useEffect, useState } from 'react';
import { SHIFT_BLOCKS } from '../data/settings';
import { SCHOOL_DAYS, type DayId } from '../data/schedule';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { ordenarSecciones } from './secciones';

/** The night shift's lessons (breaks left out), numbered 1–6 as stored in `horario.leccion`. */
export const LESSONS = SHIFT_BLOCKS.noc.blocks
  .filter(([name]) => name.includes('lección'))
  .map(([name, start, end], i) => ({ n: i + 1, name, start, end }));

/** Today's school day, or null on weekends. */
export function todayId(now = new Date()): DayId | null {
  return SCHOOL_DAYS[now.getDay() - 1]?.id ?? null;
}

/** Local date as YYYY-MM-DD (the device's day, not UTC). */
export function localDate(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** One cell of a section's week: subject and teacher. */
export interface Slot {
  subject: string;
  teacherId: string;
}

/** Key of a cell in the week grid, like "L-1". */
export const slotKey = (day: DayId, lesson: number) => `${day}-${lesson}`;
export type Week = Record<string, Slot>;

interface Row {
  id: string;
  nombre: string;
}

export interface PlacedLesson {
  sectionId: string;
  key: string;
  teacherId: string;
  subject: string;
}

/** One line of a section's load: a subject, who teaches it and how many lessons a week. */
export interface LoadLine {
  id: string;
  materia: string;
  docenteId: string;
  lecciones: number;
}

export type Loads = Record<string, LoadLine[]>;

/** Sections, subjects, teachers and weekly timetables of the signed-in user's school. */
export function useSchedule() {
  const { school } = useAuth();
  const [sections, setSections] = useState<Row[] | null>(null);
  const [subjects, setSubjects] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) return;
    if (!school) return setSections([]);
    const [secs, subs, staff] = await Promise.all([
      supabase.from('secciones').select('id, nombre').order('nombre'),
      supabase.from('materias').select('id, nombre').order('nombre'),
      supabase.from('personal').select('id, nombre, roles').eq('activo', true).order('nombre'),
    ]);
    const err = secs.error ?? subs.error ?? staff.error;
    if (err) return setError(err.message);
    setSections(ordenarSecciones(secs.data));
    setSubjects(subs.data ?? []);
    setTeachers((staff.data ?? []).filter((p) => (p.roles as string[]).includes('doc')));
  }, [school]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadWeek = async (sectionId: string): Promise<Week> => {
    const { data } = await supabase!.from('horario').select('dia, leccion, docente_id, materias(nombre)').eq('seccion_id', sectionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return Object.fromEntries((data ?? []).map((r: any) => [slotKey(r.dia, r.leccion), { subject: r.materias?.nombre ?? '', teacherId: r.docente_id ?? '' }]));
  };

  /** Replaces a section's whole week. New subject names are added to the school's list. */
  const saveWeek = async (sectionId: string, week: Week) => {
    const db = supabase!;
    const filled = Object.entries(week).filter(([, s]) => s.subject.trim());
    const known = new Map(subjects.map((s) => [s.nombre.toLowerCase(), s.id]));
    const missing = [...new Set(filled.map(([, s]) => s.subject.trim()))].filter((n) => !known.has(n.toLowerCase()));
    if (missing.length) {
      const { data, error } = await db
        .from('materias')
        .insert(missing.map((nombre) => ({ colegio_id: school!.id, nombre })))
        .select('id, nombre');
      if (error) return error.message;
      data.forEach((s) => known.set(s.nombre.toLowerCase(), s.id));
    }
    const del = await db.from('horario').delete().eq('seccion_id', sectionId);
    if (del.error) return del.error.message;
    if (filled.length) {
      const { error } = await db.from('horario').insert(
        filled.map(([key, s]) => {
          const [dia, leccion] = key.split('-');
          return {
            seccion_id: sectionId,
            dia,
            leccion: Number(leccion),
            materia_id: known.get(s.subject.trim().toLowerCase()),
            docente_id: s.teacherId || null,
          };
        }),
      );
      if (error) return error.message;
    }
    await reload();
    return '';
  };

  /** Every placed lesson of the school, to spot a teacher booked twice and to total each teacher's load. */
  const loadAll = async (): Promise<PlacedLesson[]> => {
    const { data } = await supabase!.from('horario').select('seccion_id, dia, leccion, docente_id, materias(nombre)').limit(5000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => ({ sectionId: r.seccion_id, key: slotKey(r.dia, r.leccion), teacherId: r.docente_id ?? '', subject: r.materias?.nombre ?? '' }));
  };

  /** What each section takes: subject, teacher and lessons per week (kept in `colegios.config.cargas`). */
  const loadLoads = async (): Promise<Loads> => {
    const { data } = await supabase!.from('colegios').select('config').maybeSingle();
    return (data?.config?.cargas ?? {}) as Loads;
  };

  const saveLoads = async (loads: Loads) => {
    const db = supabase!;
    const { data } = await db.from('colegios').select('config').maybeSingle();
    const { error } = await db.from('colegios').update({ config: { ...(data?.config ?? {}), cargas: loads } }).eq('id', school!.id);
    return error?.message ?? '';
  };

  return { live: !!supabase, sections, subjects: subjects.map((s) => s.nombre), teachers, error, loadWeek, saveWeek, loadAll, loadLoads, saveLoads };
}
