/* Short student links: a memorable adjective-animal code (sunny-otter)
   stored in D1 maps to {student name, classroom} — short enough to
   type off a printed flyer. Codes are guessable by design; anything a
   code resolves to is as public as the donate page that shows it. */

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

const bySpot = (db, classroom, name) => db
  .prepare('SELECT code FROM links WHERE classroom = ?1 AND lower(student_name) = lower(?2)')
  .bind(classroom, name).first();

/* Returns the code for this student+classroom, creating one if needed.
   Null only if the code space is somehow exhausted. */
export async function createLink(db, name, classroom) {
  const existing = await bySpot(db, classroom, name);
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 12; attempt++) {
    let code = `${pick(ADJECTIVES)}-${pick(ANIMALS)}`;
    // If the pair pool ever gets crowded, widen with two digits.
    if (attempt >= 6) code += `-${10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90)}`;
    // OR IGNORE covers both races: code already taken, or another
    // request just created this student's link.
    const res = await db.prepare(`
      INSERT OR IGNORE INTO links (code, student_name, classroom, created)
      VALUES (?1, ?2, ?3, ?4)`)
      .bind(code, name, classroom, Math.floor(Date.now() / 1000))
      .run();
    if (res.meta.changes === 1) return code;
    const raced = await bySpot(db, classroom, name);
    if (raced) return raced.code;
  }
  return null;
}

/* Code -> {n: student name, c: classroom id}, or null. Case- and
   whitespace-tolerant so hand-typed codes just work. */
export async function resolveLink(db, code) {
  if (typeof code !== 'string') return null;
  const norm = code.trim().toLowerCase();
  if (!/^[a-z]+-[a-z]+(-\d{2})?$/.test(norm)) return null;
  const row = await db.prepare('SELECT student_name, classroom FROM links WHERE code = ?1')
    .bind(norm).first();
  return row ? { n: row.student_name, c: row.classroom } : null;
}
