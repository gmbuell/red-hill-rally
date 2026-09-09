/* Student lists: the one place a gift's or a link's Rockets are
   validated. A student is {c: classroom id, n: name, s: shirt sizes}.
   The classroom must be on the roster; the name is optional on a gift
   and required on a link, or whenever the Rocket gets a shirt (the
   printer needs to know whose it is). Names stay backend-only — see
   store.js. */

import data from '../site/js/data.js';

const { MAX_NAME, MAX_STUDENTS, MAX_SHIRTS, shirtSizeById, classroomById } = data;

/* Raw client list -> { students } or { error } (a donor-facing
   message). Untouched rows (no classroom, no name) are skipped; a
   named student listed twice collapses to one; nameless rows never
   collapse (two kids in one class, names withheld). */
export function normalizeStudents(raw, { nameRequired = false } = {}) {
  if (raw == null) return { students: [] };
  if (!Array.isArray(raw)) return { error: 'Please try that again.' };
  const students = [];
  const seen = new Set();
  let shirts = 0;
  for (const item of raw) {
    const c = item && typeof item.c === 'string' && classroomById(item.c) ? item.c : '';
    const n = item && typeof item.n === 'string' ? item.n.trim() : '';
    const s = item && Array.isArray(item.s) ? item.s.filter(Boolean) : [];
    if (!c && !n && !s.length) continue;
    if (!c) return { error: 'Please pick a classroom for each Rocket.' };
    if (!n && (nameRequired || s.length)) {
      return { error: s.length ? 'Please tell us the Rocket’s name, so we know whose shirt it is.' : 'Please give each Rocket a name.' };
    }
    if (n.length > MAX_NAME) return { error: `Please use a shorter name (${MAX_NAME} characters max).` };
    if (s.some((z) => !shirtSizeById(z))) return { error: 'Please pick a shirt size from the list.' };
    shirts += s.length;
    // One credit per classroom per Rocket: a name listed twice, or a
    // classroom repeated with no name, counts once.
    const key = `${c}|${n.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    students.push(s.length ? { c, n, s } : { c, n });
  }
  if (students.length > MAX_STUDENTS) {
    return { error: `You can list up to ${MAX_STUDENTS} Rockets at a time.` };
  }
  if (shirts > MAX_SHIRTS) {
    return { error: `You can order up to ${MAX_SHIRTS} shirts at a time.` };
  }
  return { students };
}

/* The sizes of a gift's shirts as one compact metadata value, each
   shirt tagged with its Rocket's position: "0:YM,0:AL,2:YS". */
export const shirtsMetadata = (students) =>
  students.flatMap((st, i) => (st.s || []).map((z) => `${i}:${z}`)).join(',');

/* The reverse: position -> sizes, unknown sizes dropped. */
export const shirtsFromMetadata = (value) => {
  const byRocket = {};
  for (const pair of String(value || '').split(',')) {
    const [i, z] = pair.split(':');
    if (/^\d+$/.test(i) && shirtSizeById(z)) (byRocket[i] ||= []).push(z);
  }
  return byRocket;
};

/* Order- and case-insensitive identity of a set of students, so the
   same kids always map to the same family link. */
const byClassThenName = (a, b) =>
  (a.c < b.c ? -1 : a.c > b.c ? 1 : a.n < b.n ? -1 : a.n > b.n ? 1 : 0);
const signatureWith = (lower) => (students) => JSON.stringify(
  students.map((s) => ({ c: s.c, n: lower(s.n) })).sort(byClassThenName),
);
export const studentsSignature = signatureWith((n) => n.toLowerCase());

/* What migration 0005's backfill produced: SQLite's lower() is
   ASCII-only, so accented characters kept their case. Only rows
   created before that migration carry these — see createLink's heal. */
export const legacyStudentsSignature =
  signatureWith((n) => n.replace(/[A-Z]/g, (ch) => ch.toLowerCase()));
