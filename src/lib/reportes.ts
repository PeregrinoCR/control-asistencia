import { localDate } from './schedule';

export type PeriodId = 'mes' | 'mesant' | 'trim' | 'curso' | 'rango';

export const PERIODS: Array<{ value: PeriodId; label: string }> = [
  { value: 'mes', label: 'Este mes' },
  { value: 'mesant', label: 'Mes anterior' },
  { value: 'trim', label: 'Últimos 3 meses' },
  { value: 'curso', label: 'Curso completo' },
  { value: 'rango', label: 'Elegir fechas…' },
];

export interface Range {
  from: string;
  to: string;
}

const day = (iso: string) => new Date(iso + 'T00:00:00');

/** The dates a period covers. A month in progress runs up to today. */
export function rangeOf(id: PeriodId, custom: Range, now = new Date()): Range {
  const today = localDate(now);
  const first = (y: number, m: number) => localDate(new Date(y, m, 1));
  const y = now.getFullYear();
  const m = now.getMonth();
  if (id === 'mes') return { from: first(y, m), to: today };
  if (id === 'mesant') return { from: first(y, m - 1), to: localDate(new Date(y, m, 0)) };
  if (id === 'trim') return { from: first(y, m - 2), to: today };
  if (id === 'curso') return { from: first(y, 0), to: today };
  return custom.from && custom.to && custom.from <= custom.to ? custom : { from: first(y, m), to: today };
}

/** The stretch of the same length right before a range, to compare against. */
export function previousRange(r: Range): Range {
  const len = Math.round((day(r.to).getTime() - day(r.from).getTime()) / 86400000) + 1;
  const to = day(r.from);
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (len - 1));
  return { from: localDate(from), to: localDate(to) };
}

export const inRange = (fecha: string, r: Range) => fecha >= r.from && fecha <= r.to;

export const rangeLabel = (r: Range) => {
  const f = (d: string) => day(d).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
  return `${f(r.from)} – ${f(r.to)}`;
};

/** One day, one section, one lesson of roll call (view `asistencia_leccion`). */
export interface LessonRow {
  fecha: string;
  seccion_id: string;
  leccion: number;
  presentes: number;
  tardias: number;
  ausencias: number;
  justificadas: number;
}

export interface Totals {
  presentes: number;
  tardias: number;
  ausencias: number;
  justificadas: number;
  /** Lessons with the student present or late, over those with a mark; null with no roll call. */
  pct: number | null;
}

export function totals(rows: LessonRow[]): Totals {
  const t = { presentes: 0, tardias: 0, ausencias: 0, justificadas: 0, pct: null as number | null };
  for (const r of rows) {
    t.presentes += r.presentes;
    t.tardias += r.tardias;
    t.ausencias += r.ausencias;
    t.justificadas += r.justificadas;
  }
  const all = t.presentes + t.tardias + t.ausencias;
  t.pct = all ? (100 * (t.presentes + t.tardias)) / all : null;
  return t;
}

/** Grade of a section name such as '10-2' → '10'. */
export const levelOf = (name: string) => name.match(/^(\d+)-/)?.[1] ?? null;

/** What the report is about: the whole school, a grade (`n:10`) or one section (`s:<id>`). */
export type Scope = '' | `n:${string}` | `s:${string}`;

export function scopeSections(scope: Scope, sections: Array<{ id: string; nombre: string }>) {
  if (!scope) return sections;
  if (scope.startsWith('s:')) return sections.filter((s) => s.id === scope.slice(2));
  return sections.filter((s) => levelOf(s.nombre) === scope.slice(2));
}

/** A change between two periods, as text and whether it is good news. */
export interface Change {
  text: string;
  tone: 'good' | 'bad' | 'flat';
}

/** For a percentage: the change in points. `higherIsBetter` decides the colour. */
export function pointsChange(cur: number | null, prev: number | null): Change | null {
  if (cur === null || prev === null) return null;
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return { text: '= igual que antes', tone: 'flat' };
  return { text: `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1).replace('.', ',')} puntos`, tone: d > 0 ? 'good' : 'bad' };
}

/** For a count: the change in percent. Fewer absences or lates is good. */
export function countChange(cur: number, prev: number, lowerIsBetter = true): Change | null {
  if (!prev && !cur) return null;
  if (!prev) return { text: '▲ sin datos antes', tone: 'flat' };
  const d = Math.round((100 * (cur - prev)) / prev);
  if (d === 0) return { text: '= igual que antes', tone: 'flat' };
  const up = d > 0;
  return { text: `${up ? '▲' : '▼'} ${Math.abs(d)} % ${up ? 'más' : 'menos'}`, tone: up === lowerIsBetter ? 'bad' : 'good' };
}

/** Day of the school week used in `horario` for a date (L K M J V S). */
export function dayId(fecha: string) {
  return ['D', 'L', 'K', 'M', 'J', 'V', 'S'][day(fecha).getDay()];
}

export const WEEK = [
  { id: 'L', label: 'Lun' },
  { id: 'K', label: 'Mar' },
  { id: 'M', label: 'Mié' },
  { id: 'J', label: 'Jue' },
  { id: 'V', label: 'Vie' },
];

export interface Cell {
  /** Share of the lessons marked that were absences. */
  pct: number | null;
  absences: number;
  marked: number;
}

/** Absences by lesson (rows) and day of the week (columns). */
export function heatmap(rows: LessonRow[]) {
  const lessons = [...new Set(rows.map((r) => r.leccion))].sort((a, b) => a - b);
  const grid = lessons.map((l) =>
    WEEK.map((w): Cell => {
      const rs = rows.filter((r) => r.leccion === l && dayId(r.fecha) === w.id);
      const absences = rs.reduce((n, r) => n + r.ausencias, 0);
      const marked = rs.reduce((n, r) => n + r.presentes + r.tardias + r.ausencias, 0);
      return { pct: marked ? (100 * absences) / marked : null, absences, marked };
    }),
  );
  return { lessons, grid };
}

export interface Slot {
  seccion_id: string;
  dia: string;
  leccion: number;
  materia_id: string;
  docente_id: string | null;
}

export interface SubjectRow {
  subject: string;
  pct: number | null;
  absences: number;
  marked: number;
  teachers: string[];
}

/** Absences by subject, joining each roll call with the timetable of its section, day and lesson. */
export function bySubject(rows: LessonRow[], slots: Slot[], subjects: Map<string, string>, teachers: Map<string, string>): SubjectRow[] {
  const slot = new Map(slots.map((s) => [`${s.seccion_id}|${s.dia}|${s.leccion}`, s]));
  const acc = new Map<string, { absences: number; marked: number; teachers: Set<string> }>();
  for (const r of rows) {
    const s = slot.get(`${r.seccion_id}|${dayId(r.fecha)}|${r.leccion}`);
    if (!s) continue;
    const a = acc.get(s.materia_id) ?? { absences: 0, marked: 0, teachers: new Set<string>() };
    a.absences += r.ausencias;
    a.marked += r.presentes + r.tardias + r.ausencias;
    if (s.docente_id && teachers.get(s.docente_id)) a.teachers.add(teachers.get(s.docente_id)!);
    acc.set(s.materia_id, a);
  }
  return [...acc.entries()]
    .map(([id, a]) => ({ subject: subjects.get(id) ?? '—', pct: a.marked ? (100 * a.absences) / a.marked : null, absences: a.absences, marked: a.marked, teachers: [...a.teachers].sort() }))
    .filter((x) => x.marked > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
}
