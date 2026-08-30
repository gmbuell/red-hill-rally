/* Short student links: a memorable adjective-animal code (sunny-otter)
   stored in D1 maps to a list of {student name, classroom} — one kid
   or the whole family — short enough to type off a printed flyer.
   Codes are guessable by design; anything a code resolves to is as
   public as the donate page that shows it. */

import { studentsSignature, legacyStudentsSignature } from './students.js';

const ADJECTIVES = [
  'sunny', 'brave', 'swift', 'cosmic', 'lucky', 'mighty', 'zippy', 'rosy',
  'golden', 'breezy', 'daring', 'eager', 'fuzzy', 'gentle', 'happy', 'jolly',
  'keen', 'lively', 'merry', 'noble', 'peppy', 'quick', 'shiny', 'spry',
  'stellar', 'tidy', 'vivid', 'witty', 'zesty', 'bold', 'bright', 'calm',
  'clever', 'cozy', 'dandy', 'fancy', 'grand', 'humble', 'jaunty', 'kind',
  'loyal', 'nimble', 'plucky', 'proud', 'perky', 'quiet', 'royal', 'sandy',
  'snappy', 'sparky', 'speedy', 'spiffy', 'sturdy', 'super', 'swell', 'trusty',
  'twinkly', 'upbeat', 'valiant', 'wild', 'windy', 'zany', 'ace', 'rapid',
];

/* Word additions must be elementary-school-safe — including every
   adjective+animal pairing: a code is printed on a specific student's
   handout and can't be rerolled. */
const ANIMALS = [
  'otter', 'falcon', 'tiger', 'panda', 'dolphin', 'badger', 'puppy', 'bobcat',
  'bunny', 'cheetah', 'chipmunk', 'condor', 'kitten', 'coyote', 'crane', 'cricket',
  'dingo', 'dove', 'eagle', 'egret', 'elk', 'ferret', 'finch', 'fox',
  'gecko', 'gopher', 'hawk', 'heron', 'frog', 'ibis', 'jaguar', 'koala',
  'lemur', 'lion', 'llama', 'lynx', 'macaw', 'marmot', 'meerkat', 'moose',
  'narwhal', 'newt', 'ocelot', 'orca', 'osprey', 'owl', 'parrot', 'pelican',
  'penguin', 'pony', 'puffin', 'quail', 'rabbit', 'raccoon', 'raven', 'robin',
  'seal', 'sparrow', 'squirrel', 'toucan', 'turtle', 'bear', 'wombat', 'wren',
];

const pick = (list) =>
  list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];

const bySignature = (db, signature) => db
  .prepare('SELECT code FROM links WHERE signature = ?1').bind(signature).first();

/* Returns the code for this set of students, creating one if needed —
   the same kids (any order, any case) always share a code. `students`
   is an already-normalized [{c, n}] list, stored in the order entered.
   Null only if the code space is somehow exhausted. */
export async function createLink(db, students) {
  const signature = studentsSignature(students);
  const existing = await bySignature(db, signature);
  if (existing) return existing.code;
  // Rows backfilled by migration 0005 carry signatures lowered by
  // SQLite (ASCII-only). Heal them to the modern form on first touch,
  // so accented names keep the same-kids-same-code invariant.
  const legacy = legacyStudentsSignature(students);
  if (legacy !== signature) {
    const backfilled = await bySignature(db, legacy);
    if (backfilled) {
      await db.prepare('UPDATE links SET signature = ?2 WHERE code = ?1')
        .bind(backfilled.code, signature).run();
      return backfilled.code;
    }
  }

  const json = JSON.stringify(students.map((s) => ({ c: s.c, n: s.n })));
  for (let attempt = 0; attempt < 12; attempt++) {
    let code = `${pick(ADJECTIVES)}-${pick(ANIMALS)}`;
    // If the pair pool ever gets crowded, widen with two digits.
    if (attempt >= 6) code += `-${10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90)}`;
    // OR IGNORE covers both races: code already taken, or another
    // request just created this family's link (unique signature).
    const res = await db.prepare(`
      INSERT OR IGNORE INTO links (code, students, signature, created)
      VALUES (?1, ?2, ?3, ?4)`)
      .bind(code, json, signature, Math.floor(Date.now() / 1000))
      .run();
    if (res.meta.changes === 1) return code;
    const raced = await bySignature(db, signature);
    if (raced) return raced.code;
  }
  return null;
}

/* Code -> [{c: classroom id, n: student name}], or null. Case- and
   whitespace-tolerant so hand-typed codes just work. The caller
   re-validates the list against the roster. */
export async function resolveLink(db, code) {
  if (typeof code !== 'string') return null;
  const norm = code.trim().toLowerCase();
  if (!/^[a-z]+-[a-z]+(-\d{2})?$/.test(norm)) return null;
  const row = await db.prepare('SELECT students FROM links WHERE code = ?1')
    .bind(norm).first();
  if (!row) return null;
  try {
    const list = JSON.parse(row.students);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}
