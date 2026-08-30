# Multi-Student Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One gift (and one student link) can credit up to four Rockets' classrooms in the Rally Board race, so multi-kid families check out once.

**Architecture:** A `donation_students` child table replaces the single `classroom`/`student_name` pair on `donations`; the wizard and the link API pass a `students: [{c, n}]` list, validated by one worker module, and carried through Stripe metadata as compact JSON. Links store their students as JSON plus an order/case-insensitive signature for "same kids → same code". Dollar totals, honor roll, and badges stay per gift.

**Tech Stack:** Cloudflare Worker + D1 (SQLite), vanilla JS front end (no build), vitest with `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-08-30-multi-student-credit-design.md`

## Global Constraints

- `MAX_STUDENTS = 4` per gift and per link; `MAX_NAME = 80` characters (existing, `site/js/data.js`).
- A student is `{c: classroom id on the roster, n: name}`; the name is optional on a gift, required on a link.
- Student names are backend-only: never in `/api/campaign` or `/api/board` bodies.
- Stripe metadata values are ≤ 500 characters.
- Money (campaign/priority totals, honor roll, circle badges) is per gift and unchanged.
- No commits during this plan — the user is batching this session's changes into one commit; run tests instead at each checkpoint.
- Run the suite with `npm test` (it also checks the baked board skeleton). Run one file with `npx vitest run test/<file>`.

---

### Task 1: Shared limit + the student-list normalizer

**Files:**
- Modify: `site/js/data.js` (constants block near `MAX_AMOUNT`, and `module.exports`)
- Create: `worker/students.js`
- Test: `test/students.spec.js` (new)

**Interfaces:**
- Produces: `MAX_STUDENTS` (number, exported from `data.js` alongside `MAX_NAME`).
- Produces: `normalizeStudents(raw, { nameRequired = false } = {}) → { students: [{c, n}] } | { error: string }`.
- Produces: `studentsSignature(students) → string` (JSON of the list sorted by classroom then lower-cased name, names lower-cased).

- [ ] **Step 1: Write the failing tests**

Create `test/students.spec.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeStudents, studentsSignature } from '../worker/students.js';
import data from '../site/js/data.js';

describe('normalizeStudents', () => {
  it('keeps valid rows in order, trims names, skips untouched rows', () => {
    expect(normalizeStudents([
      { c: 'convery', n: '  Mia Rodriguez ' },
      { c: '', n: '' },
      { c: 'zweber', n: '' },
    ])).toEqual({ students: [{ c: 'convery', n: 'Mia Rodriguez' }, { c: 'zweber', n: '' }] });
  });

  it('treats a missing list as no students and a non-list as an error', () => {
    expect(normalizeStudents(undefined)).toEqual({ students: [] });
    expect(normalizeStudents('nope').error).toBeTruthy();
  });

  it('collapses a named student listed twice, but never nameless rows', () => {
    const { students } = normalizeStudents([
      { c: 'convery', n: 'Mia' }, { c: 'convery', n: 'mia' },
      { c: 'zweber', n: '' }, { c: 'zweber', n: '' },
    ]);
    expect(students).toEqual([
      { c: 'convery', n: 'Mia' }, { c: 'zweber', n: '' }, { c: 'zweber', n: '' },
    ]);
  });

  it('rejects a name without a classroom, an unknown classroom, a long name, too many rows', () => {
    expect(normalizeStudents([{ c: '', n: 'Mia' }]).error).toMatch(/classroom/);
    expect(normalizeStudents([{ c: 'r99', n: 'Mia' }]).error).toMatch(/classroom/);
    expect(normalizeStudents([{ c: 'convery', n: 'x'.repeat(81) }]).error).toMatch(/shorter/);
    const five = Array.from({ length: 5 }, (_, i) => ({ c: 'convery', n: `Kid ${i}` }));
    expect(normalizeStudents(five).error).toMatch(/up to 4/);
    expect(data.MAX_STUDENTS).toBe(4);
  });

  it('requires a name for every row when asked (links)', () => {
    expect(normalizeStudents([{ c: 'zweber', n: '' }], { nameRequired: true }).error).toMatch(/name/);
    expect(normalizeStudents([{ c: 'zweber', n: 'Leo' }], { nameRequired: true }))
      .toEqual({ students: [{ c: 'zweber', n: 'Leo' }] });
  });
});

describe('studentsSignature', () => {
  it('ignores order and case, but not classroom', () => {
    const a = studentsSignature([{ c: 'zweber', n: 'Leo Park' }, { c: 'convery', n: 'Mia' }]);
    const b = studentsSignature([{ c: 'convery', n: 'MIA' }, { c: 'zweber', n: 'leo park' }]);
    expect(a).toBe(b);
    expect(a).not.toBe(studentsSignature([{ c: 'harrison', n: 'Leo Park' }, { c: 'convery', n: 'Mia' }]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/students.spec.js`
Expected: FAIL — cannot resolve `../worker/students.js`.

- [ ] **Step 3: Add the constant to `site/js/data.js`**

Below `const MAX_AMOUNT = 50000; // dollars, per gift` add:

```js
const MAX_STUDENTS = 4;   // Rockets credited per gift, and per family link
```

and in `module.exports` change `MAX_NAME, MAX_AMOUNT, feeCoverCents,` to
`MAX_NAME, MAX_AMOUNT, MAX_STUDENTS, feeCoverCents,`.

- [ ] **Step 4: Create `worker/students.js`**

```js
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
    const key = n ? `${c}|${n.toLowerCase()}` : '';
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/students.spec.js`
Expected: 6 passed.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all green (nothing else changed yet).

---

### Task 2: Schema migration + store (record, board, export) + README

**Files:**
- Create: `migrations/0005_students.sql`
- Modify: `worker/store.js` (`recordDonation`, `boardStats` classroom query, `exportCsv`)
- Modify: `README.md` ("Ad-hoc questions" bullet under PTA operations)
- Test: `test/api.spec.js` (`sessionEvent` fixture; "webhook and campaign stats" and "admin export" describes)

**Interfaces:**
- Consumes: `MAX_STUDENTS` from `data.js` (Task 1).
- Produces: table `donation_students(donation_id, position, classroom, student_name)`; `links.students` (JSON text) and `links.signature`, with the old `links.student_name`/`classroom` columns dropped (Task 4 uses these).
- Produces: webhook metadata contract — `metadata.students` = JSON `[{c, n}]`; legacy `metadata.classroom`/`student_name` still honored.
- Produces: CSV column `students` replacing `classroom` and `student_name`.

- [ ] **Step 1: Update the webhook fixture and write the failing tests**

In `test/api.spec.js`, in `sessionEvent`, replace the two metadata lines

```js
        classroom: 'convery',
        student_name: 'Mia Rodriguez',
```

with

```js
        students: JSON.stringify([{ c: 'convery', n: 'Mia Rodriguez' }]),
```

Inside `describe('webhook and campaign stats', …)` add, after the
`'is idempotent across Stripe retries'` test:

```js
  it('credits every listed Rocket\'s classroom, once per Rocket', async () => {
    const family = sessionEvent({
      id: 'cs_family',
      metadata: { students: JSON.stringify([
        { c: 'convery', n: 'Mia Rodriguez' },
        { c: 'zweber', n: 'Leo Rodriguez' },
        { c: 'zweber', n: 'Theo Rodriguez' },
      ]) },
    });
    await deliverWebhook(family);
    await deliverWebhook(family); // Stripe retry: no double credit
    const board = await (await SELF.fetch('https://rally.test/api/board')).json();
    expect(board.classrooms).toEqual({ convery: 1, zweber: 2 });
    expect(board.campaign.gifts).toBe(1); // one gift, three Rockets
    const text = JSON.stringify(board);
    expect(text).not.toContain('Rodriguez');
  });

  it('still credits sessions stamped with the old classroom/student_name keys', async () => {
    await deliverWebhook(sessionEvent({
      id: 'cs_old',
      metadata: { students: '', classroom: 'harrison', student_name: 'Ava T' },
    }));
    const board = await (await SELF.fetch('https://rally.test/api/board')).json();
    expect(board.classrooms).toEqual({ harrison: 1 });
    const csv = await (await SELF.fetch('https://rally.test/api/export.csv?key=test-admin-key')).text();
    expect(csv).toContain('Ava T — Mrs. Harrison');
  });
```

In `'returns full records for the PTA, via bearer auth'` add after
`expect(csv).toContain('Mia Rodriguez');`:

```js
    expect(csv).toContain('"students"');
    expect(csv).toContain('"Mia Rodriguez — Ms. Convery"');
    expect(csv).not.toContain('student_name');
```

Replace the body of `'neutralizes spreadsheet formulas in exported names'` with:

```js
    await deliverWebhook(sessionEvent({
      id: 'cs_evil',
      metadata: {
        donor_name: '=HYPERLINK("http://evil")',
        students: JSON.stringify([{ c: 'convery', n: '@SUM(A1)' }]),
      },
    }));
    const res = await SELF.fetch('https://rally.test/api/export.csv?key=test-admin-key');
    const csv = await res.text();
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain('"\'@SUM(A1) — Ms. Convery"');
```

- [ ] **Step 2: Run the suite to verify the new tests fail**

Run: `npx vitest run test/api.spec.js`
Expected: the two new webhook tests and the export assertions FAIL (no `students` column/table; classroom counts empty). Older tests may also fail because the fixture no longer sends `classroom` — that's expected until Step 4.

- [ ] **Step 3: Write the migration**

Create `migrations/0005_students.sql`:

```sql
-- A gift credits up to four Rockets: one row per student, replacing the
-- single classroom/student_name pair on donations. Links likewise hold a
-- list of students (JSON, entered order) plus an order/case-insensitive
-- signature so the same kids always get the same code.

CREATE TABLE donation_students (
  donation_id  TEXT NOT NULL,
  position     INTEGER NOT NULL,
  classroom    TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (donation_id, position)
);
CREATE INDEX idx_donation_students_classroom ON donation_students(classroom);

INSERT INTO donation_students (donation_id, position, classroom, student_name)
  SELECT id, 0, classroom, student_name FROM donations WHERE classroom != '';

DROP INDEX idx_donations_classroom;
ALTER TABLE donations DROP COLUMN classroom;
ALTER TABLE donations DROP COLUMN student_name;

ALTER TABLE links ADD COLUMN students  TEXT NOT NULL DEFAULT '[]';
ALTER TABLE links ADD COLUMN signature TEXT NOT NULL DEFAULT '';
UPDATE links SET
  students  = json_array(json_object('c', classroom, 'n', student_name)),
  signature = lower(json_array(json_object('c', classroom, 'n', student_name)));

DROP INDEX idx_links_student;
ALTER TABLE links DROP COLUMN student_name;
ALTER TABLE links DROP COLUMN classroom;
CREATE UNIQUE INDEX idx_links_signature ON links(signature);
```

If the test pool's SQLite rejects `DROP COLUMN`, keep the two `donations`
columns (delete the three `DROP`/`ALTER … DROP COLUMN` lines for
`donations`) and stop writing them; do the same for `links` — but try
the clean version first.

- [ ] **Step 4: Rewrite `recordDonation`, the board query, and the export in `worker/store.js`**

Change the import block to:

```js
import data from '../site/js/data.js';

const { priorityById, classroomById, MAX_STUDENTS } = data;

/* A session's Rockets: the `students` JSON our checkout stamps into
   metadata, or — for a session created before that existed and paid
   after the deploy — the old single classroom/student_name pair. */
const studentsFromMetadata = (md) => {
  if (typeof md.students === 'string' && md.students) {
    try {
      const list = JSON.parse(md.students);
      if (Array.isArray(list)) {
        return list
          .filter((s) => s && typeof s.c === 'string' && s.c)
          .slice(0, MAX_STUDENTS)
          .map((s) => ({ c: s.c, n: typeof s.n === 'string' ? s.n : '' }));
      }
    } catch { /* malformed: record the gift with no classroom credit */ }
    return [];
  }
  return md.classroom ? [{ c: md.classroom, n: md.student_name || '' }] : [];
};
```

Replace `recordDonation` with:

```js
export async function recordDonation(db, session, createdSec) {
  const md = session.metadata || {};
  const cd = session.customer_details || {};
  const addr = cd.address || {};
  // amount_cents is the intended gift: the charge total minus the
  // opt-in fee cover our checkout endpoint stamped into metadata.
  // Every stat (campaign, board, circles) counts the gift alone.
  const total = session.amount_total || 0;
  const feeCents = Math.min(Math.max(Number(md.fee_cents) || 0, 0), total);
  const gift = db.prepare(`
    INSERT INTO donations
      (id, amount_cents, fee_cents, priority, donor_name, visibility, email,
       employer_match, via_link, created, billing_name, address_line1,
       address_line2, city, state, postal_code, country)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
    ON CONFLICT(id) DO NOTHING`)
    .bind(
      session.id,
      total - feeCents,
      feeCents,
      md.priority || '',
      md.donor_name || '',
      md.visibility === 'anon' ? 'anon' : 'public',
      cd.email || session.customer_email || '',
      md.employer_match === '1' ? 1 : 0,
      md.via_link === '1' ? 1 : 0,
      createdSec,
      cd.name || '',
      addr.line1 || '',
      addr.line2 || '',
      addr.city || '',
      addr.state || '',
      addr.postal_code || '',
      addr.country || '',
    );
  // One row per Rocket. The (donation_id, position) key makes Stripe's
  // webhook retries no-ops here, as ON CONFLICT does for the gift.
  const credits = studentsFromMetadata(md).map((s, i) => db.prepare(`
    INSERT OR IGNORE INTO donation_students (donation_id, position, classroom, student_name)
    VALUES (?1, ?2, ?3, ?4)`).bind(session.id, i, s.c, s.n));
  await db.batch([gift, ...credits]);
}
```

In `boardStats`, replace the classroom statement

```js
    db.prepare("SELECT classroom, COUNT(*) AS gifts FROM donations WHERE classroom != '' GROUP BY classroom"),
```

with

```js
    db.prepare('SELECT classroom, COUNT(*) AS gifts FROM donation_students GROUP BY classroom'),
```

Replace `exportCsv` with:

```js
export async function exportCsv(db) {
  const [gifts, credits] = await db.batch([
    db.prepare('SELECT * FROM donations ORDER BY created, id'),
    db.prepare('SELECT donation_id, classroom, student_name FROM donation_students ORDER BY donation_id, position'),
  ]);
  // "Mia Rodriguez — Ms. Convery; Leo Park — Mr. Zweber" (a nameless
  // Rocket shows just the teacher).
  const studentsByGift = {};
  for (const s of credits.results) {
    const room = classroomById(s.classroom);
    const where = room ? room.teacher : s.classroom;
    (studentsByGift[s.donation_id] ||= []).push(s.student_name ? `${s.student_name} — ${where}` : where);
  }
  const cell = (value) => {
    let s = String(value == null ? '' : value);
    // Donor/student names are attacker-supplied and this file's purpose is
    // to be opened in Excel/Sheets — neutralize formula-leading characters.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['id', 'date', 'amount_dollars', 'fee_dollars', 'priority',
    'students', 'donor_name', 'visibility', 'email',
    'billing_name', 'address_line1', 'address_line2', 'city', 'state',
    'postal_code', 'country', 'employer_match', 'via_link'];
  const rows = [header.join(',')];
  for (const r of gifts.results) {
    rows.push([
      r.id,
      new Date((r.created || 0) * 1000).toISOString(),
      (r.amount_cents / 100).toFixed(2),
      ((r.fee_cents || 0) / 100).toFixed(2),
      r.priority, (studentsByGift[r.id] || []).join('; '), r.donor_name,
      r.visibility, r.email, r.billing_name,
      r.address_line1, r.address_line2, r.city, r.state, r.postal_code,
      r.country, r.employer_match ? 'yes' : 'no', r.via_link ? 'yes' : 'no',
    ].map(cell).join(','));
  }
  return '﻿' + rows.join('\n') + '\n'; // BOM so Excel reads UTF-8 names
}
```

Also update the file's header comment: `student_name` → "student names (in `donation_students`)".

- [ ] **Step 5: Run the suite**

Run: `npx vitest run test/api.spec.js`
Expected: webhook/export tests PASS. The checkout tests still pass (checkout still sends the legacy keys until Task 3, and the webhook honors them).

- [ ] **Step 6: README**

In `README.md`, replace

```
- **Ad-hoc questions** — the donations live in D1:
```

with

```
- **Ad-hoc questions** — the donations live in D1 (`donations`, one row
  per gift; `donation_students`, one row per Rocket credited — a family
  gift lists several):
```

- [ ] **Step 7: Full suite**

Run: `npm test`
Expected: all green.

---

### Task 3: Checkout takes a student list

**Files:**
- Modify: `worker/index.js` (imports; `handleCheckout` credit block and `metadata`)
- Test: `test/api.spec.js` (`validCheckout` fixture; `describe('checkout')`)

**Interfaces:**
- Consumes: `normalizeStudents` (Task 1); `resolveLink` still returns `{n, c}` (until Task 4).
- Produces: `POST /api/checkout` body field `students: [{c, n}]` (replaces `classroom` + `student`); Stripe `metadata.students` JSON; `metadata.classroom`/`student_name` no longer sent.

- [ ] **Step 1: Update the fixture and write the failing tests**

In `validCheckout` replace

```js
  classroom: 'convery',
  student: 'Mia Rodriguez',
```

with

```js
  students: [{ c: 'convery', n: 'Mia Rodriguez' }],
```

In `'creates a Stripe session with full metadata'` replace the two lines

```js
    expect(sent.get('metadata[student_name]')).toBe('Mia Rodriguez');
    expect(sent.get('metadata[classroom]')).toBe('convery');
```

with

```js
    expect(JSON.parse(sent.get('metadata[students]'))).toEqual([{ c: 'convery', n: 'Mia Rodriguez' }]);
    expect(sent.has('metadata[classroom]')).toBe(false);
    expect(sent.has('metadata[student_name]')).toBe(false);
```

In `'a student link overrides hand-typed credit fields'` replace

```js
    expect(sent.get('metadata[student_name]')).toBe('Leo Park');
    expect(sent.get('metadata[classroom]')).toBe('zweber');
```

with

```js
    expect(JSON.parse(sent.get('metadata[students]'))).toEqual([{ c: 'zweber', n: 'Leo Park' }]);
```

In `'rejects invalid requests'` add before the closing `});`:

```js
    expect(await bad({ students: [{ c: '', n: 'Mia' }] })).toBe(400);     // name, no classroom
    expect(await bad({ students: [{ c: 'r99', n: 'Mia' }] })).toBe(400);  // not on the roster
    expect(await bad({ students: Array.from({ length: 5 }, (_, i) => ({ c: 'convery', n: `K${i}` })) })).toBe(400);
```

Add two tests after `'a student link overrides hand-typed credit fields'`:

```js
  it('carries every Rocket, and drops untouched rows', async () => {
    const calls = stubStripe();
    const res = await checkoutDirect({ ...validCheckout, students: [
      { c: 'convery', n: 'Mia Rodriguez' }, { c: '', n: '' }, { c: 'zweber', n: '' },
    ] });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(JSON.parse(sent.get('metadata[students]')))
      .toEqual([{ c: 'convery', n: 'Mia Rodriguez' }, { c: 'zweber', n: '' }]);
    expect(sent.get('metadata[via_link]')).toBe('0');
  });

  it('accepts a gift with no Rocket at all', async () => {
    const calls = stubStripe();
    const res = await checkoutDirect({ ...validCheckout, students: [] });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(sent.get('metadata[students]')).toBe('[]');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/api.spec.js -t checkout`
Expected: FAIL on the `metadata[students]` assertions.

- [ ] **Step 3: Update `worker/index.js`**

Add the import after `import { createLink, resolveLink } from './links.js';`:

```js
import { normalizeStudents } from './students.js';
```

In `handleCheckout`, replace the block from `let student = …` through the
end of the `if (body.link) { … }` with:

```js
  // The Rockets this gift credits: from the link if there is one,
  // otherwise the wizard's rows (validated here, never trusted).
  let students;
  let viaLink = false;
  if (body.link) {
    const payload = await resolveLink(env.DB, body.link);
    if (!validLinkPayload(payload)) {
      return json({ error: 'That student link is no longer valid — you can still type the student’s name on the previous step.' }, 400);
    }
    students = [{ c: payload.c, n: payload.n }];
    viaLink = true;
  } else {
    const norm = normalizeStudents(body.students);
    if (norm.error) return json({ error: norm.error }, 400);
    students = norm.students;
  }
  // Stripe caps a metadata value at 500 characters. Four 80-character
  // names fit (~425) unless a name is mostly quotes and backslashes.
  const studentsJson = JSON.stringify(students);
  if (studentsJson.length > 500) {
    return json({ error: 'Please shorten the student names.' }, 400);
  }
```

In the `metadata:` object replace

```js
      classroom,
      student_name: student,
```

with

```js
      students: studentsJson,
```

- [ ] **Step 4: Run the checkout tests**

Run: `npx vitest run test/api.spec.js -t checkout`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: all green.

---

### Task 4: Family links

**Files:**
- Modify: `worker/links.js` (`bySpot` → `bySignature`; `createLink`, `resolveLink`)
- Modify: `worker/index.js` (`validLinkPayload` → `validLinkStudents`; `handleLinkCreate`, `handleLinkVerify`; checkout link branch)
- Test: `test/api.spec.js` (`describe('student links')`, and the link checkout test)

**Interfaces:**
- Consumes: `normalizeStudents`, `studentsSignature` (Task 1); `links.students` / `links.signature` columns (Task 2).
- Produces: `createLink(db, students) → code | null`; `resolveLink(db, code) → [{c, n}] | null`.
- Produces: `POST /api/link` body `{students: [{n, c}]}` → `{code}`; `POST /api/link/verify` → `{students: [{c, n}]}`.

- [ ] **Step 1: Rewrite the link tests and write the new ones**

Replace the whole `describe('student links', …)` block with:

```js
describe('student links', () => {
  const mia = { n: 'Mia Rodríguez', c: 'convery' };
  const leo = { n: 'Leo Park', c: 'zweber' };

  it('creates a short memorable code and resolves it', async () => {
    const created = await post('/api/link', { students: [mia] });
    expect(created.status).toBe(200);
    const { code } = await created.json();
    expect(code).toMatch(/^[a-z]+-[a-z]+(-\d{2})?$/);

    const verified = await post('/api/link/verify', { code });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ students: [{ c: 'convery', n: 'Mia Rodríguez' }] });
  });

  it('reuses the code for the same student and classroom', async () => {
    const { code } = await (await post('/api/link', { students: [leo] })).json();
    const { code: again } = await (await post('/api/link', { students: [{ n: '  leo park ', c: 'zweber' }] })).json();
    expect(again).toBe(code);
    // Same name in a different classroom is a different link.
    const { code: other } = await (await post('/api/link', { students: [{ n: 'Leo Park', c: 'harrison' }] })).json();
    expect(other).not.toBe(code);
  });

  it('one link can name every sibling, in the order entered', async () => {
    const { code } = await (await post('/api/link', { students: [mia, leo] })).json();
    const verified = await (await post('/api/link/verify', { code })).json();
    expect(verified.students).toEqual([{ c: 'convery', n: 'Mia Rodríguez' }, { c: 'zweber', n: 'Leo Park' }]);
    // The same kids, reversed and recased, is the same family.
    const { code: again } = await (await post('/api/link', {
      students: [{ n: 'LEO PARK', c: 'zweber' }, { n: 'mia rodríguez', c: 'convery' }],
    })).json();
    expect(again).toBe(code);
    // A different set is a different link — the single-kid links too.
    const { code: solo } = await (await post('/api/link', { students: [mia] })).json();
    expect(solo).not.toBe(code);
  });

  it('resolves hand-typed codes case-insensitively', async () => {
    const { code } = await (await post('/api/link', { students: [{ n: 'Zoe F', c: 'hesseltine' }] })).json();
    const res = await post('/api/link/verify', { code: `  ${code.toUpperCase()} ` });
    expect(res.status).toBe(200);
  });

  it('rejects unknown and malformed codes', async () => {
    expect((await post('/api/link/verify', { code: 'unlikely-critter' })).status).toBe(400);
    expect((await post('/api/link/verify', { code: 'DROP TABLE links' })).status).toBe(400);
    expect((await post('/api/link/verify', {})).status).toBe(400);
  });

  it('rejects bad payloads', async () => {
    const bad = async (body) => (await post('/api/link', body)).status;
    expect(await bad({})).toBe(400);
    expect(await bad({ students: [] })).toBe(400);
    expect(await bad({ students: [{ n: '', c: 'convery' }] })).toBe(400);
    expect(await bad({ students: [{ n: 'Mia', c: 'r99' }] })).toBe(400);
    expect(await bad({ students: [{ n: 'x'.repeat(200), c: 'convery' }] })).toBe(400);
    expect(await bad({ students: Array.from({ length: 5 }, (_, i) => ({ n: `Kid ${i}`, c: 'convery' })) })).toBe(400);
    expect(await bad({ n: 'Mia', c: 'convery' })).toBe(400); // the pre-family shape
  });

  it('redirects the short /l/ path to the donate page', async () => {
    const res = await SELF.fetch('https://rally.test/l/Sunny-Otter', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://rally.test/donate?link=sunny-otter');
  });
});
```

Replace `'a student link overrides hand-typed credit fields'` in
`describe('checkout')` with:

```js
  it('a family link credits every sibling and overrides hand-typed rows', async () => {
    const { code } = await (await post('/api/link', {
      students: [{ n: 'Leo Park', c: 'zweber' }, { n: 'Ana Park', c: 'michel' }],
    })).json();
    const calls = stubStripe({ id: 'cs_2', url: 'https://checkout.stripe.com/c/pay/cs_2' });
    const res = await checkoutDirect({ ...validCheckout, link: code });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(JSON.parse(sent.get('metadata[students]')))
      .toEqual([{ c: 'zweber', n: 'Leo Park' }, { c: 'michel', n: 'Ana Park' }]);
    expect(sent.get('metadata[via_link]')).toBe('1');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/api.spec.js -t "student links"`
Expected: FAIL (400s on the `{students}` body; verify shape mismatch).

- [ ] **Step 3: Rewrite `createLink`/`resolveLink` in `worker/links.js`**

Replace everything from `const bySpot = …` to the end of the file with:

```js
import { studentsSignature } from './students.js';

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
```

Move the `import` to the top of the file (above `const ADJECTIVES`), and
update the file's header comment: "maps to a list of {student name,
classroom} — one kid or the whole family".

- [ ] **Step 4: Update the handlers in `worker/index.js`**

Add `MAX_STUDENTS` to the destructure:

```js
const { ORG, CAMPAIGN, MAX_NAME, MAX_AMOUNT, MAX_STUDENTS, feeCoverCents, priorityById, classroomById } = data;
```

Replace `validLinkPayload` (and its comment) with:

```js
/* A link's stored students, sanity-checked so a stale row (say, a
   classroom removed from the roster) fails cleanly. */
const validLinkStudents = (list) =>
  Array.isArray(list) && list.length >= 1 && list.length <= MAX_STUDENTS &&
  list.every((s) => s && typeof s.n === 'string' && s.n.trim() && s.n.length <= MAX_NAME
    && typeof s.c === 'string' && isClassroom(s.c));
```

Replace `handleLinkCreate` and `handleLinkVerify` with:

```js
async function handleLinkCreate(request, env) {
  const body = await request.json().catch(() => null);
  const norm = normalizeStudents(body && body.students, { nameRequired: true });
  if (norm.error || !norm.students.length) {
    return json({ error: norm.error || 'Please give a student name and pick a classroom.' }, 400);
  }
  const code = await createLink(env.DB, norm.students);
  if (!code) return json({ error: 'We couldn’t create the link just now — please try again.' }, 500);
  return json({ code });
}

async function handleLinkVerify(request, env) {
  const body = await request.json().catch(() => null);
  const students = await resolveLink(env.DB, body && body.code);
  if (!validLinkStudents(students)) {
    return json({ error: 'This link is not valid.' }, 400);
  }
  return json({ students: students.map((s) => ({ c: s.c, n: s.n })) });
}
```

In `handleCheckout`'s link branch replace

```js
    const payload = await resolveLink(env.DB, body.link);
    if (!validLinkPayload(payload)) {
      return json({ error: 'That student link is no longer valid — you can still type the student’s name on the previous step.' }, 400);
    }
    students = [{ c: payload.c, n: payload.n }];
```

with

```js
    const linked = await resolveLink(env.DB, body.link);
    if (!validLinkStudents(linked)) {
      return json({ error: 'That student link is no longer valid — you can still type the student’s name on the previous step.' }, 400);
    }
    students = linked.map((s) => ({ c: s.c, n: s.n }));
```

- [ ] **Step 5: Run the link and checkout tests**

Run: `npx vitest run test/api.spec.js`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: all green.

---

### Task 5: Donate wizard — "Add another Rocket"

**Files:**
- Modify: `site/js/ui.js` (add `nameList`, export it)
- Modify: `site/donate.html` (step 3 panel)
- Modify: `site/js/donate.js` (state, step 3 render/validate, summary, checkout body, link banner, boot)
- Modify: `site/css/styles.css` (append `.student-row` rules)
- Verify: browser pass (no unit tests for the static front end)

**Interfaces:**
- Consumes: `POST /api/checkout` `students` body (Task 3); `POST /api/link/verify` → `{students}` (Task 4); `MAX_STUDENTS`, `MAX_NAME` globals from `data.js` (loaded as a plain script before `ui.js`).
- Produces: `RH.nameList(names: string[]) → string` ("Mia", "Mia & Leo", "Mia, Leo & Sam").

- [ ] **Step 1: `RH.nameList` in `site/js/ui.js`**

Above `/* priorityById / classroomById come from data.js, loaded before us. */` add:

```js
  /* "Mia", "Mia & Leo", "Mia, Leo & Sam". */
  const nameList = (names) => names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
```

and in the returned object change `money, qs, param, esc,` to
`money, qs, param, esc, nameList,`.

- [ ] **Step 2: Step 3 markup in `site/donate.html`**

Replace the `<div id="manual-dedication">…</div>` block with:

```html
      <div id="manual-dedication">
        <div id="student-rows"></div>
        <button type="button" class="btn secondary small" id="add-student">+ Add another Rocket</button>
        <p class="fine-print add-note">Siblings at Red Hill? List each one &mdash; every classroom gets credit for this gift.</p>
      </div>
```

- [ ] **Step 3: Rework `site/js/donate.js`**

State — replace `link: null, // verified {code, n: student name, c: classroom id}` with:

```js
    students: [{ c: '', n: '' }], // step 3 rows: classroom id + optional name
    link: null, // verified {code, students: [{c, n}]}
```

Replace the whole `/* ---- step 3: dedication ---- */` section (the
`renderDedication` function) with:

```js
  /* ---- step 3: the Rockets this gift credits ---- */
  const renderStudentRows = () => {
    RH.qs('#student-rows').innerHTML = state.students.map((s, i) => `
      <div class="student-row" data-row="${i}">
        <div class="field">
          <label for="classroom-${i}">Classroom</label>
          <select id="classroom-${i}" data-field="c">
            <option value="">Choose a classroom&hellip;</option>
            ${RH.classroomOptions()}
          </select>
          <p class="error">Please pick a classroom for this Rocket.</p>
        </div>
        <div class="field">
          <label for="student-${i}">Student name <span class="optional">&middot; optional</span></label>
          <input type="text" id="student-${i}" data-field="n" autocomplete="off" maxlength="${MAX_NAME}" placeholder="${RH.esc(RH.samplePlaceholder())}">
        </div>
        ${state.students.length > 1 ? '<button type="button" class="linklike remove-student">Remove</button>' : ''}
      </div>`).join('');
    state.students.forEach((s, i) => {
      RH.qs(`#classroom-${i}`).value = s.c;
      RH.qs(`#student-${i}`).value = s.n;
    });
    RH.qs('#add-student').hidden = state.students.length >= MAX_STUDENTS;
  };

  /* "Ms. Convery's class" / "Ms. Convery's & Mr. Zweber's classes". */
  const classLabel = (ids) => {
    const teachers = [...new Set(ids.map((id) => RH.classroomById(id)).filter(Boolean).map((r) => r.teacher))];
    if (!teachers.length) return '';
    return RH.nameList(teachers.map((t) => `${t}&rsquo;s`)) + (teachers.length > 1 ? ' classes' : ' class');
  };

  const renderDedication = () => {
    const holder = RH.qs('#link-chip-holder');
    const manual = RH.qs('#manual-dedication');
    holder.hidden = !state.link;
    manual.hidden = !!state.link;
    if (!state.link) {
      renderStudentRows();
      return;
    }
    const names = RH.nameList(state.link.students.map((s) => RH.esc(s.n)));
    const rooms = [...new Set(state.link.students.map((s) => {
      const room = RH.classroomById(s.c);
      return room ? `${room.teacher} &middot; ${room.grade}` : 'Red Hill Elementary';
    }))];
    holder.innerHTML = `
      <div class="link-chip">
        <svg class="icon" viewBox="20 4 24 50" aria-hidden="true">${RH.dartUp}</svg>
        <span class="who">Supporting ${names}</span>
        <span class="meta">${rooms.join(' &nbsp;&middot;&nbsp; ')}</span>
      </div>
      <p class="fine-print">Not who you meant to support? <button type="button" class="linklike" id="clear-link">Remove</button></p>`;
    RH.qs('#clear-link').addEventListener('click', () => {
      state.link = null;
      renderDedication();
    });
  };
```

In `renderSummary`, replace from `const room = RH.classroomById(…)` through
the `else { s += '.'; }` block with:

```js
    if (state.link) {
      const names = RH.nameList(state.link.students.map((st) => RH.esc(st.n)));
      const rooms = classLabel(state.link.students.map((st) => st.c));
      s += `. Supporting <strong>${names}</strong>${rooms ? ` (${rooms})` : ''}.`;
    } else {
      const rooms = classLabel(state.students.map((st) => st.c).filter(Boolean));
      s += rooms ? `. Credited to <strong>${rooms}</strong>.` : '.';
    }
```

In `validate`, add before `if (state.step === 4) {`:

```js
    if (state.step === 3 && !state.link) {
      // A name with no classroom can't be credited — say so, per row.
      let bad = false;
      state.students.forEach((st, i) => {
        const missing = !!st.n.trim() && !st.c;
        RH.qs(`#classroom-${i}`).closest('.field').classList.toggle('invalid', missing);
        bad = bad || missing;
      });
      if (bad) return false;
    }
```

In `startCheckout`'s body, replace

```js
        classroom: RH.qs('#classroom').value,
        student: RH.qs('#student-name').value.trim(),
```

with

```js
        students: state.students,
```

In the `/* ---- event wiring ---- */` section add, after the
`#custom-amount` listener:

```js
  const rowsEl = RH.qs('#student-rows');
  const onRowEdit = (e) => {
    const row = e.target.closest('.student-row');
    const field = e.target.dataset.field;
    if (!row || !field) return;
    state.students[Number(row.dataset.row)][field] = e.target.value;
    e.target.closest('.field').classList.remove('invalid');
  };
  rowsEl.addEventListener('input', onRowEdit);
  rowsEl.addEventListener('change', onRowEdit);
  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-student');
    if (!btn) return;
    state.students.splice(Number(btn.closest('.student-row').dataset.row), 1);
    renderStudentRows();
  });
  RH.qs('#add-student').addEventListener('click', () => {
    if (state.students.length >= MAX_STUDENTS) return;
    state.students.push({ c: '', n: '' });
    renderStudentRows();
    RH.qs(`#classroom-${state.students.length - 1}`).focus();
  });
```

In `/* ---- boot ---- */` delete the two lines

```js
  RH.qs('#student-name').placeholder = RH.samplePlaceholder();
  RH.qs('#classroom').insertAdjacentHTML('beforeend', RH.classroomOptions());
```

Replace the link-resolution block's body (inside `.then(({ ok, data }) => { … })`) with:

```js
      if (!ok || !Array.isArray(data.students) || !data.students.length) return;
      state.link = { code, students: data.students };
      const names = RH.nameList(state.link.students.map((s) => RH.esc(s.n)));
      const rooms = classLabel(state.link.students.map((s) => s.c));
      RH.qs('.flow-header').insertAdjacentHTML('beforeend',
        `<p class="link-banner">Supporting <strong>${names}</strong>${rooms ? ` &middot; ${rooms}` : ''}</p>`);
      if (state.step === 3) renderDedication();
```

Update the file's header comment: `n: student name, c: classroom id` →
`students: [{c, n}] — one kid or the whole family`.

- [ ] **Step 4: Styles — append to `site/css/styles.css`**

```css
/* ---------- student rows (donate step 3, student link page) ---------- */

.student-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0 1rem;
  align-items: start;
}
.student-row + .student-row { border-top: 1px solid rgba(10, 43, 78, 0.12); padding-top: 1.1rem; }
.student-row .remove-student { margin-top: 2.2rem; font-size: 0.85rem; color: var(--grey); }
.add-note { margin: 0.5rem 0 0; }
@media (max-width: 640px) {
  .student-row { grid-template-columns: 1fr; gap: 0; }
  .student-row .remove-student { margin: -0.4rem 0 1rem; justify-self: start; }
}
```

- [ ] **Step 5: Syntax check and suite**

Run: `node --check site/js/donate.js && node --check site/js/ui.js && npm test`
Expected: no syntax errors; suite green (front-end files aren't unit-tested).

- [ ] **Step 6: Browser pass**

Run `npx wrangler dev --port 8790` and, with Playwright, check:
1. `/donate?p=stem` → $100 → Next: one row renders with the roster in the select; **+ Add another Rocket** adds a row (button disappears after the fourth); **Remove** drops a row; typing a name with no classroom then Next shows the row's error; picking classrooms and Next → step 4 reads "Credited to **Ms. Convery's & Mr. Zweber's classes**."
2. Create a two-kid link via `curl -s -X POST localhost:8790/api/link -H 'content-type: application/json' -d '{"students":[{"n":"Mia","c":"convery"},{"n":"Leo","c":"zweber"}]}'`, open `/donate?link=<code>`: banner "Supporting **Mia & Leo** · Ms. Convery's & Mr. Zweber's classes"; step 3 shows the chip with both names and both rooms, no rows; **Remove** shows the rows.
3. Take full-page screenshots of step 3 (manual, two rows) and step 4; fix spacing if the Remove button misaligns with the inputs.

---

### Task 6: Student Link page — "Add a sibling"

**Files:**
- Modify: `site/student-link.html` (form + assurance line)
- Modify: `site/js/student-link.js`
- Verify: browser pass

**Interfaces:**
- Consumes: `POST /api/link` `{students}` (Task 4); `RH.nameList` (Task 5); `.student-row` styles (Task 5).

- [ ] **Step 1: Markup**

In `site/student-link.html` change the assurance line to:

```html
    <p class="assurance">A personal giving link &amp; QR code for your student &mdash; or the whole family</p>
```

Replace the two `.field` divs inside `<form id="link-form">` with:

```html
      <div id="sibling-rows"></div>
      <button type="button" class="btn secondary small" id="add-sibling">+ Add a sibling</button>
      <p class="fine-print add-note" style="margin-bottom:1.2rem;">One link for the whole family &mdash; every gift through it credits each Rocket&rsquo;s classroom.</p>
```

(keep the submit button and `#link-error` that follow).

- [ ] **Step 2: Script**

Replace the body of the IIFE in `site/js/student-link.js` (everything
inside `(() => { … })();`) with:

```js
  const students = [{ n: '', c: '' }];
  const rowsEl = RH.qs('#sibling-rows');
  const form = RH.qs('#link-form');
  const errorEl = RH.qs('#link-error');

  const renderRows = () => {
    rowsEl.innerHTML = students.map((s, i) => `
      <div class="student-row" data-row="${i}">
        <div class="field">
          <label for="sl-name-${i}">Student name</label>
          <input type="text" id="sl-name-${i}" data-field="n" autocomplete="off" maxlength="${MAX_NAME}" placeholder="${RH.esc(RH.samplePlaceholder())}">
          <p class="error">Please enter your student&rsquo;s name.</p>
        </div>
        <div class="field">
          <label for="sl-class-${i}">Classroom</label>
          <select id="sl-class-${i}" data-field="c">
            <option value="">Choose a classroom&hellip;</option>
            ${RH.classroomOptions()}
          </select>
          <p class="error">Please choose your student&rsquo;s classroom.</p>
        </div>
        ${students.length > 1 ? '<button type="button" class="linklike remove-student">Remove</button>' : ''}
      </div>`).join('');
    students.forEach((s, i) => {
      RH.qs(`#sl-name-${i}`).value = s.n;
      RH.qs(`#sl-class-${i}`).value = s.c;
    });
    RH.qs('#add-sibling').hidden = students.length >= MAX_STUDENTS;
  };

  const onRowEdit = (e) => {
    const row = e.target.closest('.student-row');
    const field = e.target.dataset.field;
    if (!row || !field) return;
    students[Number(row.dataset.row)][field] = e.target.value;
    e.target.closest('.field').classList.remove('invalid');
  };
  rowsEl.addEventListener('input', onRowEdit);
  rowsEl.addEventListener('change', onRowEdit);
  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-student');
    if (!btn) return;
    students.splice(Number(btn.closest('.student-row').dataset.row), 1);
    renderRows();
  });
  RH.qs('#add-sibling').addEventListener('click', () => {
    if (students.length >= MAX_STUDENTS) return;
    students.push({ n: '', c: '' });
    renderRows();
    RH.qs(`#sl-name-${students.length - 1}`).focus();
  });
  renderRows();

  window.addEventListener('afterprint', () =>
    document.body.classList.remove('printing-card'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    let valid = true;
    students.forEach((s, i) => {
      const noName = !s.n.trim();
      const noClass = !s.c;
      RH.qs(`#sl-name-${i}`).closest('.field').classList.toggle('invalid', noName);
      RH.qs(`#sl-class-${i}`).closest('.field').classList.toggle('invalid', noClass);
      if (noName || noClass) valid = false;
    });
    if (!valid) return;
    const list = students.map((s) => ({ n: s.n.trim(), c: s.c }));

    let code = '';
    let serverError = '';
    try {
      const { ok, data } = await RH.postJson('/api/link', { students: list });
      if (ok && data.code) code = data.code;
      else serverError = data.error || '';
    } catch (err) { /* handled below */ }
    if (!code) {
      errorEl.textContent = serverError || 'We couldn’t create the link just now — please try again.';
      errorEl.hidden = false;
      return;
    }

    const headline = RH.nameList(list.map((s) => s.n));
    const rooms = [...new Set(list.map((s) => {
      const room = RH.classroomById(s.c);
      return `${room.teacher} · ${room.grade}`;
    }))];
    const link = new URL(`/l/${code}`, location.origin).toString();

    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const dataUrl = qr.createDataURL(4, 4);

    RH.qs('#qr-img').src = dataUrl;
    RH.qs('#result-title').textContent = `${headline}’s Rally link`;
    RH.qs('#link-line').textContent = link;

    RH.qs('.pc-name').textContent = headline;
    RH.qs('.pc-class').innerHTML = rooms.map(RH.esc).join('<br>');
    RH.qs('.pc-qr').src = dataUrl;
    RH.qs('.pc-url').textContent = link.replace(/^https?:\/\//, '');

    const result = RH.qs('#result');
    result.hidden = false;
    result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const copyBtn = RH.qs('#copy-btn');
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(link).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1600);
      });
    };

    const shareBtn = RH.qs('#share-btn');
    if (navigator.share) {
      shareBtn.hidden = false;
      shareBtn.onclick = () => navigator.share({
        title: `Help ${headline} fund the Rocket Rally`,
        url: link,
      }).catch(() => {});
    } else {
      shareBtn.hidden = true;
    }

    RH.qs('#print-btn').onclick = () => {
      document.body.classList.add('printing-card');
      window.print();
    };
  });
```

Update the header comment: "The server stores a list of {name,
classroom} — one kid or the whole family — under a short memorable code".

- [ ] **Step 3: Syntax check and suite**

Run: `node --check site/js/student-link.js && npm test`
Expected: clean; suite green.

- [ ] **Step 4: Browser pass**

With `wrangler dev` running: `/student-link` → fill "Mia" / Ms. Convery,
**+ Add a sibling**, fill "Leo" / Mr. Zweber, **Create the link** →
title "Mia & Leo's Rally link", QR renders; submitting with an empty
sibling name flags that row only. Open the produced `/l/<code>` and
confirm the donate banner names both kids. Screenshot the form with two
rows and the result panel.

---

## Self-review

- **Spec coverage:** semantics (Task 2 tests: twins → 2, gifts stay 1); migration incl. link columns (Task 2); normalizer + signature (Task 1); checkout body/metadata/500-char guard (Task 3); legacy metadata fallback (Task 2); link API + "same kids → same code" (Task 4); board query (Task 2); export column (Task 2); `nameList`, wizard rows/validation/chip/summary/banner (Task 5); Student Link rows, title, print card, share (Task 6); privacy assertion (Task 2); README (Task 2). Out-of-scope items untouched.
- **Placeholders:** none — every step has its code.
- **Type consistency:** `normalizeStudents` returns `{students}|{error}` and is used that way in Tasks 3–4; `resolveLink` returns an array from Task 4 on (Task 3 still uses the `{n, c}` shape and `validLinkPayload`, replaced in Task 4); `state.link.students` and `data.students` match `/api/link/verify`'s `{students}`; `RH.nameList` defined in Task 5 before Task 6 uses it.
