import { useCallback, useEffect, useState } from 'react';
import type { Mark } from '../data/school';
import { useAuth } from './auth';
import { LESSONS, localDate, todayId } from './schedule';
import { ageOn } from './students';
import { supabase } from './supabase';

/** A student the signed-in family follows (their child, or themselves when adult). */
export interface Kid {
  id: string;
  name: string;
  short: string;
  section: string;
  sectionId: string | null;
  adult: boolean;
  /** Has an accommodation (adecuación): exams can last more lessons for this student. */
  accommodation: boolean;
}

export interface Me {
  name: string;
  first: string;
  idNumber: string;
  phone: string;
  /** True when the account belongs to the adult student, not a guardian. */
  self: boolean;
}

const KID_KEY = 'familia-estudiante';

function remembered() {
  try {
    return localStorage.getItem(KID_KEY);
  } catch {
    return null;
  }
}

/** The signed-in family: who they are, their students and the one being viewed. */
export function useFamily() {
  const { session } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [kidId, setKidIdState] = useState<string | null>(remembered());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    const db = supabase!;
    const uid = session.user.id;
    (async () => {
      const toKid = (s: { id: string; nombre: string; nacimiento: string | null; seccion_id: string | null; adecuacion: boolean; secciones: { nombre: string } | null }): Kid => ({
        id: s.id,
        name: s.nombre,
        short: s.nombre.split(' ')[0],
        section: s.secciones?.nombre ?? '—',
        sectionId: s.seccion_id,
        adult: (ageOn(s.nacimiento) ?? 0) >= 18,
        accommodation: s.adecuacion,
      });
      const fields = 'id, nombre, nacimiento, seccion_id, adecuacion, secciones(nombre)';
      const { data: g, error: ge } = await db
        .from('encargados')
        .select(`nombre, cedula, telefono, estudiante_encargado(estudiantes(${fields}))`)
        .eq('usuario_id', uid)
        .maybeSingle();
      if (ge) return setError(ge.message);
      if (g) {
        setMe({ name: g.nombre, first: g.nombre.split(' ')[0], idNumber: g.cedula ?? '', phone: g.telefono ?? '', self: false });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setKids((g.estudiante_encargado as any[]).map((l) => l.estudiantes).filter(Boolean).map(toKid));
        return;
      }
      const { data: s } = await db.from('estudiantes').select(`${fields}, cedula, telefono`).eq('usuario_id', uid).maybeSingle();
      if (s) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const st = s as any;
        setMe({ name: st.nombre, first: st.nombre.split(' ')[0], idNumber: st.cedula ?? '', phone: st.telefono ?? '', self: true });
        setKids([toKid(st)]);
        return;
      }
      setKids([]);
    })();
  }, [session]);

  const setKidId = (id: string) => {
    setKidIdState(id);
    try {
      localStorage.setItem(KID_KEY, id);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  const kid = kids?.find((k) => k.id === kidId) ?? kids?.[0] ?? null;
  return { me, kids, kid, setKidId, error };
}

export interface LessonToday {
  lesson: number;
  start: string;
  subject: string;
  teacher: string;
  mark: Mark | 'N';
  /** The teacher is absent today: the lesson is free, or someone covers it. */
  change?: { kind: 'free' } | { kind: 'sub'; substitute: string } | { kind: 'task' };
}

export interface DayRecord {
  date: string;
  marks: Array<{ lesson: number; mark: Mark }>;
}

export interface Justif {
  from: string;
  to: string;
  kind: string;
  reason: string;
  state: 'p' | 'a' | 'r' | 'i';
}

export interface Exit {
  id: string;
  date: string;
  hour: string;
  way: 'pickup' | 'alone';
  receipt: string;
  left: string | null;
}

/** Day by day marks, justifications and early exits of one student between two dates. */
export async function kidRecords(kidId: string, from: string, to: string) {
  const db = supabase!;
  const [att, js, ex] = await Promise.all([
    db.from('asistencia').select('fecha, leccion, marca').eq('estudiante_id', kidId).gte('fecha', from).lte('fecha', to).order('leccion'),
    db.from('justificaciones').select('desde, hasta, tipo, motivo, estado').eq('estudiante_id', kidId).lte('desde', to).gte('hasta', from),
    db.from('salidas').select('id, fecha, hora, modo, comprobante, salio').eq('estudiante_id', kidId).gte('fecha', from).lte('fecha', to),
  ]);
  const days = new Map<string, DayRecord>();
  (att.data ?? []).forEach((r) => {
    const d: DayRecord = days.get(r.fecha) ?? { date: r.fecha, marks: [] };
    d.marks.push({ lesson: r.leccion, mark: r.marca as Mark });
    days.set(r.fecha, d);
  });
  return {
    days,
    justifs: (js.data ?? []).map((j): Justif => ({ from: j.desde, to: j.hasta, kind: j.tipo, reason: j.motivo, state: j.estado })),
    exits: (ex.data ?? []).map((e): Exit => ({ id: e.id, date: e.fecha, hour: e.hora, way: e.modo, receipt: e.comprobante, left: e.salio })),
  };
}

/** Totals for a set of day records. */
export function monthTotals(days: Map<string, DayRecord>) {
  const all = [...days.values()].flatMap((d) => d.marks);
  const absences = all.filter((m) => m.mark === 'A').length;
  const lates = all.filter((m) => m.mark === 'T').length;
  return { absences, lates, pct: all.length ? Math.round((100 * (all.length - absences)) / all.length) : null };
}

/** The section's lessons for one weekday, with subject and teacher. */
export async function sectionDay(sectionId: string, day: string) {
  const db = supabase!;
  const [h, t] = await Promise.all([
    db.from('horario').select('leccion, docente_id, materias(nombre)').eq('seccion_id', sectionId).eq('dia', day).order('leccion'),
    db.from('docentes').select('id, nombre'),
  ]);
  const teacher = new Map((t.data ?? []).map((x) => [x.id, x.nombre]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (h.data as any[] | null ?? []).map((r) => ({
    lesson: r.leccion as number,
    subject: (r.materias?.nombre as string) ?? '',
    teacher: teacher.get(r.docente_id) ?? '',
  }));
}

/** Today's lessons of a student, each with its mark. */
export function useKidToday(kid: Kid | null) {
  const [lessons, setLessons] = useState<LessonToday[] | null>(null);
  const day = todayId();
  const date = localDate();

  const load = useCallback(async () => {
    if (!kid) return;
    if (!kid.sectionId || !day) return setLessons([]);
    const db = supabase!;
    const [plan, rec, cov, t] = await Promise.all([
      sectionDay(kid.sectionId, day),
      kidRecords(kid.id, date, date),
      db.from('coberturas').select('leccion, tipo, sustituto_id, ausencias_docentes!inner(fecha)').eq('seccion_id', kid.sectionId).eq('ausencias_docentes.fecha', date),
      db.from('docentes').select('id, nombre'),
    ]);
    const marks = rec.days.get(date)?.marks ?? [];
    const names = new Map((t.data ?? []).map((x) => [x.id, x.nombre]));
    const changeOf = (lesson: number): LessonToday['change'] => {
      const c = (cov.data ?? []).find((x) => x.leccion === lesson);
      if (!c) return undefined;
      return c.tipo === 'sub' ? { kind: 'sub', substitute: names.get(c.sustituto_id) ?? 'otro docente' } : { kind: c.tipo as 'free' | 'task' };
    };
    setLessons(
      plan.map((p) => ({
        ...p,
        start: LESSONS[p.lesson - 1]?.start ?? '',
        mark: marks.find((m) => m.lesson === p.lesson)?.mark ?? 'N',
        change: changeOf(p.lesson),
      })),
    );
  }, [kid, day, date]);

  useEffect(() => {
    load();
  }, [load]);

  return lessons;
}

/** Uploads a family's file (receipt, medical note) to the school's folder. Returns its path. */
export async function uploadFile(schoolId: string, file: File) {
  const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
  const path = `${schoolId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase!.storage.from('comprobantes').upload(path, file);
  if (error) throw new Error(error.message);
  return path;
}

/** "2026-10-19" → "lunes 19 de octubre". */
export const longDay = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' });
