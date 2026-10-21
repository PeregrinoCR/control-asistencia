/**
 * Proposes who cares for each exam room on one exam night (pure function, no server calls).
 *
 * Rules agreed with the school's evaluation committee:
 * 1. First choice: whoever has a lesson at that hour with a section sitting the exam in that room
 *    (normal timetable of that weekday), unless they teach the subject being examined, are absent or
 *    are not working at that hour.
 * 2. Otherwise a free teacher at that hour; 3. otherwise support staff (orientation, office…).
 *    Among equals, whoever has done fewest cares, to share the load.
 * - The same person keeps the whole exam; they are replaced only when their working hours end or
 *   they must teach a group that is not sitting an exam.
 * - Students with special accommodations sit apart, one room per level (levels can share a room),
 *   looked after by the teacher of the subject being examined.
 * - What cannot be covered stays without a carer for the committee to decide.
 */

export interface ExamIn {
  id: string;
  sectionId: string;
  section: string;
  subject: string;
  room: string;
  /** First lesson (1–6) and how many lessons it lasts. */
  from: number;
  lessons: number;
}

export interface StaffIn {
  id: string;
  name: string;
  roles: string[];
  /** Working hours, in lessons. Teachers without it work from their first to their last lesson. */
  work?: { dias: string[]; desde: number; hasta: number } | null;
}

/** One lesson of the normal timetable for the exam's weekday. */
export interface SlotIn {
  sectionId: string;
  lesson: number;
  teacherId: string;
}

export interface CareOut {
  room: string;
  kind: 'aula' | 'adecuacion';
  level: string | null;
  examId: string;
  detail: string;
  from: number;
  to: number;
  personId: string | null;
}

export interface ProposeInput {
  day: string;
  exams: ExamIn[];
  staff: StaffIn[];
  slots: SlotIn[];
  /** Teacher of a subject in a section: key `${sectionId}|${subject}`. */
  subjectTeacher: Map<string, string>;
  absent: Set<string>;
  /** Cares each person already did this period, to share the load. */
  counts: Map<string, number>;
  /** Students with accommodations per level ('7', '8'…). */
  accommodations: Map<string, number>;
  /** Room for each level's accommodated students; levels may share one. */
  accommodationRooms: Record<string, string>;
}

/** '10-2' → '10'. */
export const levelOf = (section: string) => section.split('-')[0];

const SUPPORT = ['ori', 'adm', 'dir', 'aux'];

export function propose(input: ProposeInput): CareOut[] {
  const { day, exams, staff, slots, subjectTeacher, absent, accommodations, accommodationRooms } = input;
  const counts = new Map(input.counts);
  const examining = new Set(exams.map((e) => e.sectionId));
  const taken = new Set<string>(); // `${personId}|${lesson}` already caring somewhere
  const out: CareOut[] = [];

  // Working hours: explicit, else a teacher's first to last lesson that day.
  const works = (p: StaffIn, lesson: number) => {
    if (p.work) return p.work.dias.includes(day) && lesson >= p.work.desde && lesson <= p.work.hasta;
    const mine = slots.filter((s) => s.teacherId === p.id).map((s) => s.lesson);
    return mine.length > 0 && lesson >= Math.min(...mine) && lesson <= Math.max(...mine);
  };
  // Rule B: teaching a group that is not sitting an exam.
  const teachingElsewhere = (id: string, lesson: number) => slots.some((s) => s.teacherId === id && s.lesson === lesson && !examining.has(s.sectionId));
  const rangeOf = (es: ExamIn[]) => {
    const from = Math.min(...es.map((e) => e.from));
    const to = Math.max(...es.map((e) => e.from + e.lessons - 1));
    return { from, to };
  };
  const byId = new Map(staff.map((p) => [p.id, p]));
  const take = (id: string, from: number, to: number) => {
    for (let l = from; l <= to; l++) taken.add(`${id}|${l}`);
  };

  // Accommodation rooms first: the subject teacher of each level's exam is busy there.
  const examLevels = [...new Set(exams.map((e) => levelOf(e.section)))].filter((lv) => (accommodations.get(lv) ?? 0) > 0);
  const roomsForLevels = new Map<string, string[]>();
  for (const lv of examLevels) {
    const room = accommodationRooms[lv] || `Adecuación ${lv}.°`;
    roomsForLevels.set(room, [...(roomsForLevels.get(room) ?? []), lv]);
  }
  for (const [room, levels] of roomsForLevels) {
    const es = exams.filter((e) => levels.includes(levelOf(e.section)));
    const { from, to } = rangeOf(es);
    const teacherId = es.map((e) => subjectTeacher.get(`${e.sectionId}|${e.subject}`)).find((t) => t && !absent.has(t)) ?? null;
    if (teacherId) take(teacherId, from, to);
    out.push({
      room,
      kind: 'adecuacion',
      level: levels.join(', '),
      examId: es[0].id,
      detail: `${levels.map((l) => `${l}.°`).join(' y ')} · ${[...new Set(es.map((e) => e.subject))].join(', ')} · ${levels.reduce((n, l) => n + (accommodations.get(l) ?? 0), 0)} est.`,
      from,
      to,
      personId: teacherId,
    });
  }

  // Exam rooms (sections sharing a room sit together).
  const rooms = [...new Set(exams.map((e) => e.room || e.section))].sort();
  for (const room of rooms) {
    const es = exams.filter((e) => (e.room || e.section) === room);
    const { from, to } = rangeOf(es);
    const sections = new Set(es.map((e) => e.sectionId));
    const ownTeachers = new Set(es.map((e) => subjectTeacher.get(`${e.sectionId}|${e.subject}`)).filter(Boolean) as string[]);
    const valid = (id: string, l: number) => {
      const p = byId.get(id);
      return !!p && !absent.has(id) && !ownTeachers.has(id) && !taken.has(`${id}|${l}`) && works(p, l) && !teachingElsewhere(id, l);
    };
    const fewest = (ids: string[]) => ids.sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0) || byId.get(a)!.name.localeCompare(byId.get(b)!.name))[0];

    const perLesson: Array<string | null> = [];
    let current: string | null = null;
    for (let l = from; l <= to; l++) {
      if (!current || !valid(current, l)) {
        const own = slots.filter((s) => s.lesson === l && sections.has(s.sectionId)).map((s) => s.teacherId).filter((id) => valid(id, l));
        const free = staff.filter((p) => p.roles.includes('doc') && valid(p.id, l)).map((p) => p.id);
        const support = staff
          .filter((p) => !p.roles.includes('doc') && (p.roles.some((r) => SUPPORT.includes(r)) || !!p.work) && valid(p.id, l))
          .map((p) => p.id);
        current = own[0] ?? fewest(free) ?? fewest(support) ?? null;
        if (current) counts.set(current, (counts.get(current) ?? 0) + 1);
      }
      if (current) taken.add(`${current}|${l}`);
      perLesson.push(current);
    }

    // Consecutive lessons with the same person make one stretch.
    const detail = `${es.map((e) => e.section).join(', ')} · ${[...new Set(es.map((e) => e.subject))].join(', ')}`;
    let start = from;
    for (let i = 1; i <= perLesson.length; i++) {
      if (i === perLesson.length || perLesson[i] !== perLesson[i - 1]) {
        out.push({ room, kind: 'aula', level: null, examId: es[0].id, detail, from: start, to: from + i - 1, personId: perLesson[i - 1] });
        start = from + i;
      }
    }
  }
  return out;
}
