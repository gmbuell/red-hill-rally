/* Student lists: the one place a gift's or a link's Rockets are
   validated. A student is {c: classroom id, n: name}. The classroom
   must be on the roster; the name is optional on a gift and required
   on a link. Names stay backend-only — see store.js. */

import data from '../site/js/data.js';

const { MAX_NAME, MAX_STUDENTS, classroomById } = data;

/* Raw client list -> { students } or { error } (a donor-facing
   message). Untouched rows (no classroom, no name) are skipped; a
   named student listed twice collapses to one; nameless rows never
   collapse (two kids in one class, names withheld). */
export function normalizeStudents(raw, { nameRequired = false } = {}) {
  if (raw == null) return { students: [] };
  if (!Array.isArray(raw)) return { error: 'Please try that again.' };
  const students = [];
  const seen = new Set();
  for (const item of raw) {
    const c = item && typeof item.c === 'string' && classroomById(item.c) ? item.c : '';
    const n = item && typeof item.n === 'string' ? item.n.trim() : '';
    if (!c && !n) continue;
    if (!c) return { error: 'Please pick a classroom for each Rocket.' };
    if (!n && nameRequired) return { error: 'Please give each Rocket a name.' };
    if (n.length > MAX_NAME) return { error: `Please use a shorter name (${MAX_NAME} characters max).` };
    // One credit per classroom per Rocket: a name listed twice, or a
    // classroom repeated with no name, counts once.
    const key = `${c}|${n.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    students.push({ c, n });
  }
  if (students.length > MAX_STUDENTS) {
    return { error: `You can list up to ${MAX_STUDENTS} Rockets at a time.` };
  }
  return { students };
}

/* Order- and case-insensitive identity of a set of students, so the
   same kids always map to the same family link. */
export const studentsSignature = (students) => JSON.stringify(
  students
    .map((s) => ({ c: s.c, n: s.n.toLowerCase() }))
    .sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : a.n < b.n ? -1 : a.n > b.n ? 1 : 0)),
);

/* What migration 0005's backfill produced: SQLite's lower() is
   ASCII-only, so accented characters kept their case. Only rows
   created before that migration carry these — see createLink's heal. */
export const legacyStudentsSignature = (students) => JSON.stringify(
  students
    .map((s) => ({ c: s.c, n: s.n.replace(/[A-Z]/g, (ch) => ch.toLowerCase()) }))
    .sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : a.n < b.n ? -1 : a.n > b.n ? 1 : 0)),
);
