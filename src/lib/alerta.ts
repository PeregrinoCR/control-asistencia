import type { RiskLevel } from '../data/earlyWarning';
import { CRITERIA, DEFAULT_STEPS, thresholdsOf, type AlertThresholds } from '../data/earlyWarning';
import { ruleState } from '../data/school';
import { fetchAll } from './fetchAll';
import { localDate } from './schedule';
import { ageOn } from './students';
import { supabase } from './supabase';

export interface Note {
  kind: 'contacto' | 'plan' | 'nota' | 'cerrado';
  text: string;
  by: string;
  when: string;
  at: Date;
}

export interface Step {
  label: string;
  done: boolean;
}

export interface Contact {
  name: string;
  relation: string;
  phone: string;
  app: boolean;
}

export interface Case {
  id: string;
  name: string;
  section: string;
  age: number | null;
  guide: string;
  level: RiskLevel;
  unexcused: number;
  consecutive: number;
  lates: number;
  reasons: string[];
  strip: string;
  notes: Note[];
  owner: string | null;
  steps: Step[];
  contacts: Contact[];
  closed: boolean;
  closedOn: string;
  /** No contact logged in the last 7 days (or ever). */
  stale: boolean;
  /** No unexcused absence in the last 10 school days and the family has been reached. */
  ready: boolean;
}


export const STALE_DAYS = 7;

/** The last `n` weekdays up to today, oldest first. */
export function schoolDays(n: number) {
  const out: string[] = [];
  for (const d = new Date(); out.length < n; d.setDate(d.getDate() - 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.unshift(localDate(d));
  }
  return out;
}

export const shortDate = (d: Date) => d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });

export interface AlertData {
  cases: Case[];
  staff: Array<{ id: string; nombre: string }>;
  me: string | null;
  t: AlertThresholds;
  criteria: Record<string, boolean>;
  /** Set when the 0019 update is not in the server yet. */
  warn: string;
  error: string;
}

const EMPTY: AlertData = { cases: [], staff: [], me: null, t: thresholdsOf(undefined), criteria: ruleState(CRITERIA), warn: '', error: '' };

/** Computes the early-warning cases from the real roll calls, with owner, steps, notes and the family's contacts. One source for the screen and the reports. */
export async function loadAlerta(userId: string | undefined): Promise<AlertData> {
    const db = supabase!;
    const { data: cfg } = await db.from('colegios').select('config').maybeSingle();
    const th = thresholdsOf(cfg?.config?.institucion);
    const days = schoolDays(th.sem * 5);
    const from = days[0];
    const marks = fetchAll<{ estudiante_id: string; fecha: string; marca: string }>((a, b) =>
      db.from('asistencia').select('estudiante_id, fecha, marca').gte('fecha', from).in('marca', ['A', 'T', 'J']).range(a, b),
    ).then((data) => ({ data, error: null }), (e: Error) => ({ data: null, error: e }));
    const [att, js, st, notes, people, secs, cs, extra, gs] = await Promise.all([
      marks,
      db.from('justificaciones').select('estudiante_id, desde, hasta').eq('estado', 'a').gte('hasta', from),
      db.from('estudiantes').select('id, nombre, nacimiento, seccion_id, telefono, usuario_id').eq('activo', true),
      db.from('seguimientos').select('estudiante_id, tipo, texto, cuando, personal(nombre)').order('cuando', { ascending: false }),
      db.from('personal').select('id, nombre, roles, seccion_guia, usuario_id').eq('activo', true),
      db.from('secciones').select('id, nombre'),
      db.from('casos_alerta').select('estudiante_id, responsable, pasos'),
      db.rpc('alerta_extra', { semanas: th.sem }),
      db.from('estudiante_encargado').select('estudiante_id, parentesco, encargados(nombre, telefono, usuario_id)'),
    ]);
    const err = att.error ?? st.error ?? notes.error;
    if (err) return { ...EMPTY, t: th, error: err.message };
    const warn = cs.error || extra.error ? 'Falta aplicar la actualización 0019 del servidor: sin ella no hay responsable, pasos ni los dos criterios nuevos.' : '';
    const crit = { ...ruleState(CRITERIA), ...(cfg?.config?.criteriosAlerta ?? {}) };

    const staffRows = (people.data ?? []) as Array<{ id: string; nombre: string; roles: string[]; seccion_guia: string | null; usuario_id: string | null }>;
    const staff = staffRows.filter((p) => p.roles.some((r) => ['dir', 'ori', 'adm', 'gui'].includes(r))).map((p) => ({ id: p.id, nombre: p.nombre }));
    const me = staffRows.find((p) => p.usuario_id === userId)?.id ?? null;

    const extras = new Map(((extra.data ?? []) as Array<{ estudiante_id: string; tasa_actual: number | null; tasa_previa: number | null; sin_leer: number }>).map((x) => [x.estudiante_id, x]));
    const caseOf = new Map(((cs.data ?? []) as Array<{ estudiante_id: string; responsable: string | null; pasos: Step[] }>).map((x) => [x.estudiante_id, x]));
    const justified = (id: string, d: string) => (js.data ?? []).some((j) => j.estudiante_id === id && j.desde <= d && d <= j.hasta);
    const secName = new Map((secs.data ?? []).map((s) => [s.id, s.nombre]));
    const guide = new Map(staffRows.filter((p) => p.seccion_guia).map((p) => [p.seccion_guia, p.nombre]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notesOf = (id: string) => ((notes.data ?? []) as any[]).filter((n) => n.estudiante_id === id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guardians = (id: string) => ((gs.data ?? []) as any[]).filter((g) => g.estudiante_id === id && g.encargados);

    const list: Case[] = [];
    for (const s of st.data ?? []) {
      const marked = (att.data ?? []).filter((a) => a.estudiante_id === s.id);
      if (!marked.length) continue;
      const strip = days.map((d) => {
        const m = marked.filter((a) => a.fecha === d);
        if (m.some((a) => a.marca === 'A')) return justified(s.id, d) ? 'J' : 'A';
        // Every absence that day was justified by its teacher.
        if (m.some((a) => a.marca === 'J')) return 'J';
        return m.length ? 'T' : 'P';
      });
      const unexcused = strip.filter((k) => k === 'A').length;
      const lates = strip.filter((k) => k === 'T').length;
      let consecutive = 0;
      let run = 0;
      strip.forEach((k) => {
        run = k === 'A' ? run + 1 : 0;
        consecutive = Math.max(consecutive, run);
      });
      const reasons: string[] = [];
      let level: RiskLevel | null = null;
      if (crit.b && consecutive >= th.seg) {
        reasons.push(`${consecutive} ausencias consecutivas sin justificar`);
        level = consecutive > th.seg ? 'a' : 'm';
      }
      if (crit.a && unexcused >= th.aus) {
        reasons.push(`${unexcused} ausencias sin justificar en ${th.sem} semanas`);
        level = level === 'a' ? 'a' : 'm';
      }
      if (crit.c && lates >= th.tar) {
        reasons.push(`${lates} días con llegada tardía en ${th.sem} semanas`);
        level = level ?? 'b';
      }
      const ex = extras.get(s.id);
      if (crit.d && ex && ex.tasa_actual !== null && ex.tasa_previa !== null && ex.tasa_previa - ex.tasa_actual >= 10) {
        reasons.push(`La asistencia bajó de ${Math.round(ex.tasa_previa)} % a ${Math.round(ex.tasa_actual)} %`);
        level = level ?? 'b';
      }
      if (!level) continue;
      if (crit.e && ex && ex.sin_leer >= 3) {
        reasons.push('Su familia no abrió los últimos 3 avisos');
        level = level === 'b' ? 'm' : 'a';
      }
      const ns: Note[] = notesOf(s.id).map((n) => ({
        kind: n.tipo,
        text: n.texto,
        by: n.personal?.nombre ?? '',
        when: shortDate(new Date(n.cuando)),
        at: new Date(n.cuando),
      }));
      // A closed case stays closed unless there are new unexcused absences after it.
      const lastClose = ns.find((n) => n.kind === 'cerrado');
      const lastAbsence = days.filter((_, i) => strip[i] === 'A').pop();
      const closed = !!lastClose && (!lastAbsence || lastAbsence <= localDate(lastClose.at));
      const saved = caseOf.get(s.id);
      const steps: Step[] = saved?.pasos?.length ? saved.pasos : DEFAULT_STEPS.map((label) => ({ label, done: false }));
      const lastContact = ns.find((n) => n.kind === 'contacto');
      const stale = !lastContact || Date.now() - lastContact.at.getTime() > STALE_DAYS * 86400000;
      const quiet = !strip.slice(-10).includes('A');
      const contacts: Contact[] = guardians(s.id).map((g) => ({ name: g.encargados.nombre, relation: g.parentesco ?? 'Encargado', phone: g.encargados.telefono ?? '', app: !!g.encargados.usuario_id }));
      if (ageOn(s.nacimiento) !== null && (ageOn(s.nacimiento) as number) >= 18) contacts.unshift({ name: s.nombre, relation: 'Él mismo (mayor de edad)', phone: s.telefono ?? '', app: !!s.usuario_id });
      list.push({
        id: s.id,
        name: s.nombre,
        section: secName.get(s.seccion_id) ?? '—',
        age: ageOn(s.nacimiento),
        guide: guide.get(s.seccion_id) ?? '—',
        level,
        unexcused,
        consecutive,
        lates,
        reasons,
        strip: strip.join(''),
        notes: ns,
        owner: saved?.responsable ?? null,
        steps,
        contacts,
        closed,
        closedOn: lastClose ? shortDate(lastClose.at) : '',
        stale,
        ready: quiet && (!!lastContact || steps.every((x) => x.done)),
      });
    }
    const order = { a: 0, m: 1, b: 2 };
    list.sort((x, y) => order[x.level] - order[y.level] || y.unexcused - x.unexcused);
    return { cases: list, staff, me, t: th, criteria: crit, warn, error: '' };
}
