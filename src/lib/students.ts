import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { ordenarSecciones } from './secciones';

export interface Guardian {
  id: string;
  name: string;
  idNumber: string;
  phone: string;
  email: string;
  relation: string;
  hasAccount: boolean;
}

export interface LiveStudent {
  id: string;
  name: string;
  idNumber: string;
  birth: string | null;
  age: number | null;
  section: string;
  phone: string;
  /** Sits exams apart with other accommodated students of the same level. */
  accommodation: boolean;
  hasAccount: boolean;
  guardians: Guardian[];
  /** Lessons absent and late this month. */
  absences: number;
  lates: number;
}

/** One row of the enrollment form or the imported file. */
export interface NewStudent {
  name: string;
  idNumber: string;
  birth: string;
  section: string;
  phone: string;
  accommodation?: boolean;
  guardian?: { name: string; idNumber: string; relation: string; phone: string; email: string };
}

export function ageOn(birth: string | null, today = new Date()) {
  if (!birth) return null;
  const b = new Date(birth + 'T00:00:00');
  let age = today.getFullYear() - b.getFullYear();
  if (today < new Date(today.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}

const digits = (t: string) => t.replace(/\D/g, '').slice(-8);

/** Students and guardians of the signed-in user's school. */
export function useStudents() {
  const { school } = useAuth();
  const [students, setStudents] = useState<LiveStudent[] | null>(null);
  const [sections, setSections] = useState<Array<{ id: string; nombre: string }>>([]);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!supabase) return;
    if (!school) return setStudents([]);
    const [st, secs, att] = await Promise.all([
      supabase
        .from('estudiantes')
        .select('id, nombre, cedula, nacimiento, telefono, adecuacion, usuario_id, secciones(nombre), estudiante_encargado(parentesco, encargados(*))')
        .eq('activo', true)
        .order('nombre'),
      supabase.from('secciones').select('id, nombre').order('nombre'),
      supabase.from('asistencia_mes').select('estudiante_id, ausencias, tardias'),
    ]);
    // Monthly totals are optional: if migration 0002 isn't installed yet, show zeros.
    const err = st.error ?? secs.error;
    if (err) return setError(err.message);
    setSections(ordenarSecciones(secs.data));
    const totals = new Map((att.data ?? []).map((a) => [a.estudiante_id, a]));
    setStudents(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (st.data as any[]).map((r) => ({
        id: r.id,
        name: r.nombre,
        idNumber: r.cedula ?? '',
        birth: r.nacimiento,
        age: ageOn(r.nacimiento),
        section: r.secciones?.nombre ?? '—',
        phone: r.telefono ?? '',
        accommodation: !!r.adecuacion,
        hasAccount: !!r.usuario_id,
        absences: totals.get(r.id)?.ausencias ?? 0,
        lates: totals.get(r.id)?.tardias ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        guardians: (r.estudiante_encargado ?? []).map((l: any) => ({
          id: l.encargados.id,
          name: l.encargados.nombre,
          idNumber: l.encargados.cedula ?? '',
          phone: l.encargados.telefono ?? '',
          email: l.encargados.correo ?? '',
          relation: l.parentesco ?? '',
          hasAccount: !!l.encargados.usuario_id,
        })),
      })),
    );
  }, [school]);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * Saves students and their guardians. A guardian already registered with the same
   * cédula or phone is reused, so siblings share one family account.
   * Returns how many were added and the problems found, row by row.
   */
  const add = async (rows: NewStudent[]) => {
    const db = supabase!;
    const problems: string[] = [];
    let added = 0;
    const { data: known } = await db.from('encargados').select('id, cedula, telefono');
    const guardians = [...(known ?? [])];

    for (const [i, row] of rows.entries()) {
      const label = rows.length > 1 ? `Fila ${i + 1} (${row.name || 'sin nombre'}): ` : '';
      const section = sections.find((s) => s.nombre === row.section.trim());
      if (!row.name.trim()) {
        problems.push(label + 'falta el nombre.');
        continue;
      }
      if (row.section.trim() && !section) {
        problems.push(label + `la sección "${row.section}" no existe.`);
        continue;
      }
      const { data: st, error } = await db
        .from('estudiantes')
        .insert({
          colegio_id: school!.id,
          seccion_id: section?.id ?? null,
          nombre: row.name.trim(),
          cedula: row.idNumber.trim() || null,
          nacimiento: row.birth || null,
          telefono: row.phone.trim() || null,
        })
        .select('id')
        .single();
      if (error) {
        problems.push(label + error.message);
        continue;
      }
      added++;

      const g = row.guardian;
      if (!g || !g.name.trim()) continue;
      let guardianId = guardians.find(
        (x) => (g.idNumber && x.cedula === g.idNumber.trim()) || (g.phone && x.telefono && digits(x.telefono) === digits(g.phone)),
      )?.id;
      if (!guardianId) {
        const { data: ng, error: ge } = await db
          .from('encargados')
          .insert({
            colegio_id: school!.id,
            nombre: g.name.trim(),
            cedula: g.idNumber.trim() || null,
            telefono: g.phone.trim() || null,
            correo: g.email.trim().toLowerCase() || null,
          })
          .select('id, cedula, telefono')
          .single();
        if (ge) {
          problems.push(label + 'estudiante guardado, pero no el encargado: ' + ge.message);
          continue;
        }
        guardians.push(ng);
        guardianId = ng.id;
      }
      const { error: le } = await db
        .from('estudiante_encargado')
        .insert({ estudiante_id: st.id, encargado_id: guardianId, parentesco: g.relation.trim() || null });
      if (le) problems.push(label + 'no se pudo unir con el encargado: ' + le.message);
    }
    await reload();
    return { added, problems };
  };

  /** Saves a student's own data. Returns an error message, or '' when saved. */
  const updateStudent = async (id: string, row: Omit<NewStudent, 'guardian'>) => {
    const section = sections.find((x) => x.nombre === row.section);
    const { error } = await supabase!
      .from('estudiantes')
      .update({
        nombre: row.name.trim(),
        cedula: row.idNumber.trim() || null,
        nacimiento: row.birth || null,
        seccion_id: section?.id ?? null,
        telefono: row.phone.trim() || null,
        adecuacion: !!row.accommodation,
      })
      .eq('id', id);
    if (!error) await reload();
    return error?.message ?? '';
  };

  /** Withdraws a student: they leave the lists but their history stays. */
  const deactivate = async (id: string) => {
    const { error } = await supabase!.from('estudiantes').update({ activo: false }).eq('id', id);
    if (!error) await reload();
    return error?.message ?? '';
  };

  /**
   * Saves a guardian of a student. With `guardianId` it edits that guardian; without it, it adds one,
   * reusing a guardian already registered with the same cédula or phone (a sibling's, for example).
   */
  const saveGuardian = async (studentId: string, guardianId: string | null, g: NonNullable<NewStudent['guardian']>) => {
    const db = supabase!;
    const row = { nombre: g.name.trim(), cedula: g.idNumber.trim() || null, telefono: g.phone.trim() || null, correo: g.email.trim().toLowerCase() || null };
    let id = guardianId;
    if (id) {
      const { error } = await db.from('encargados').update(row).eq('id', id);
      if (error) return error.message;
    } else {
      const { data: known } = await db.from('encargados').select('id, cedula, telefono');
      id =
        (known ?? []).find((x) => (row.cedula && x.cedula === row.cedula) || (row.telefono && x.telefono && digits(x.telefono) === digits(row.telefono)))?.id ?? null;
      if (!id) {
        const { data, error } = await db.from('encargados').insert({ ...row, colegio_id: school!.id }).select('id').single();
        if (error) return error.message;
        id = data.id;
      }
    }
    const { error } = await db
      .from('estudiante_encargado')
      .upsert({ estudiante_id: studentId, encargado_id: id, parentesco: g.relation.trim() || null }, { onConflict: 'estudiante_id,encargado_id' });
    if (!error) await reload();
    return error?.message ?? '';
  };

  /** Removes a guardian from one student only; they stay linked to their other children. */
  const unlinkGuardian = async (studentId: string, guardianId: string) => {
    const { error } = await supabase!.from('estudiante_encargado').delete().eq('estudiante_id', studentId).eq('encargado_id', guardianId);
    if (!error) await reload();
    return error?.message ?? '';
  };

  return { live: !!supabase, students, sections: sections.map((s) => s.nombre), error, add, updateStudent, deactivate, saveGuardian, unlinkGuardian };
}

/** Columns of the enrollment file, in order. */
export const IMPORT_COLUMNS = [
  'Nombre del estudiante',
  'Cédula',
  'Nacimiento (AAAA-MM-DD)',
  'Sección',
  'Teléfono del estudiante',
  'Nombre del encargado',
  'Cédula del encargado',
  'Parentesco',
  'Teléfono del encargado',
  'Correo del encargado',
];

/** Reads a CSV saved from Excel (comma or semicolon). The first row is the header. */
export function parseEnrollment(text: string): NewStudent[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';
  return lines.slice(1).map((line) => {
    const c = splitCsv(line, sep).map((x) => x.trim());
    return {
      name: c[0] ?? '',
      idNumber: c[1] ?? '',
      birth: normalizeDate(c[2] ?? ''),
      section: c[3] ?? '',
      phone: c[4] ?? '',
      guardian: { name: c[5] ?? '', idNumber: c[6] ?? '', relation: c[7] ?? '', phone: c[8] ?? '', email: c[9] ?? '' },
    };
  });
}

function splitCsv(line: string, sep: string) {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Accepts 2008-03-15 or 15/03/2008. */
function normalizeDate(t: string) {
  const dmy = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}
