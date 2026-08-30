# Rocket Rally — Multi-student credit (design)

Lets a family with several Rockets at Red Hill give **once** and have
every child's classroom credited in the classroom race. Two entry
points share one data model:

1. **"Add another Rocket"** on the donate wizard's step 3.
2. **Family links** — one student link / QR code that names all the
   siblings, so a grandparent scanning a flyer credits everyone.

Money is untouched: a gift still funds one priority and counts once in
every dollar total. Only *participation credit* becomes one-to-many.

## Semantics

- A gift lists 0–4 students (`MAX_STUDENTS = 4`, in `data.js`). Each
  student is a classroom id (required, must be on the roster) plus an
  optional name.
- Each listed student adds **one tick** to their classroom in the race
  ("X of N students"). Twins in the same class → two ticks.
- Campaign totals, per-priority totals, the honor roll, and circle
  badges are per gift, exactly as today.
- Student names remain backend-only (they appear in the admin CSV and
  nowhere public). The board still receives only per-classroom counts.

## Data model — migration `0005_students.sql`

```sql
CREATE TABLE donation_students (
  donation_id  TEXT NOT NULL,
  position     INTEGER NOT NULL,          -- 0..3, order as entered
  classroom    TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (donation_id, position)
);
CREATE INDEX idx_donation_students_classroom ON donation_students(classroom);
INSERT INTO donation_students SELECT id, 0, classroom, student_name
  FROM donations WHERE classroom != '';
DROP INDEX idx_donations_classroom;
ALTER TABLE donations DROP COLUMN classroom;
ALTER TABLE donations DROP COLUMN student_name;

ALTER TABLE links ADD COLUMN students  TEXT NOT NULL DEFAULT '[]';
ALTER TABLE links ADD COLUMN signature TEXT NOT NULL DEFAULT '';
UPDATE links SET students  = json_array(json_object('c', classroom, 'n', student_name)),
                 signature = lower(json_array(json_object('c', classroom, 'n', student_name)));
DROP INDEX idx_links_student;
ALTER TABLE links DROP COLUMN student_name;
ALTER TABLE links DROP COLUMN classroom;
CREATE UNIQUE INDEX idx_links_signature ON links(signature);
```

- The primary key on `(donation_id, position)` keeps webhook retries
  idempotent (`INSERT OR IGNORE`, alongside the existing
  `ON CONFLICT(id) DO NOTHING` on `donations`). Donation + student rows
  are written in one `db.batch()`.
- `links.students` is canonical JSON: `[{"c":…,"n":…}]` sorted by
  classroom id then lower-cased name. `signature` is the lower-cased
  canonical JSON; the unique index on it gives "same set of kids →
  same code", case-insensitively, replacing the old
  `(classroom, lower(student_name))` index.
- Production holds only test data (README go-live step 4 clears it), so
  dropping the superseded columns is safe and avoids dead columns.

## Worker

**`worker/students.js`** (new) — the one authoritative normalizer,
`normalizeStudents(raw, { nameRequired })`:

- Accepts an array; skips untouched rows (no classroom, no name);
  trims names. A name without a roster classroom, or a name over
  `MAX_NAME`, is an error (the UI prevents both; only a crafted request
  reaches here, and silently dropping credit would be worse).
- With `nameRequired` (links), a row without a name is an error.
- Dedupes on `(c, lower(n))` when `n` is non-empty; two nameless rows
  in one class are allowed (two kids, names withheld).
- More than `MAX_STUDENTS` → error (the UI caps at 4; anything larger
  is a crafted request).
- Returns `{ students }` or `{ error }`.

**`POST /api/checkout`** — body gains `students: [{c, n}]`, replacing
`classroom` + `student`. With `link`, the link's students are used and
the body's list ignored (`via_link = 1`); no manual extras in link mode
— a family wanting more kids on a link makes a family link. Metadata:
`students` = compact JSON; `classroom`/`student_name` keys are no
longer sent. If the JSON exceeds Stripe's 500-char value limit
(theoretically ~425 max, longer only with heavy escaping) → 400 "Please
shorten the student names."

**Webhook / `recordDonation`** — parses `metadata.students`; if absent,
falls back to the legacy `classroom`/`student_name` keys so a session
created before the deploy and completed after it still gets credit.

**`POST /api/link`** — body `{students: [{n, c}]}`, 1–4 entries, names
required. `createLink(db, students)` canonicalizes, looks up by
signature, otherwise inserts with the same retry loop. Response
`{code}` (unchanged). **`POST /api/link/verify`** → `{students}`.
`resolveLink` parses the stored JSON and validates each entry against
the roster (a removed classroom fails the whole link cleanly, as now).

**Board** — classroom race becomes
`SELECT classroom, COUNT(*) AS gifts FROM donation_students GROUP BY classroom`;
the `/api/board` payload shape (`classrooms: {id: count}`) is unchanged.

**Export** — the `classroom` and `student_name` columns are replaced by
one `students` column: `Mia Rodriguez — Ms. Convery; Leo Park — Mr. Zweber`
(a nameless student shows just the teacher). Student rows are fetched
in the same batch and grouped in JS. Formula neutralization still
applies to the cell.

## Front end

**Shared** — `RH.nameList(['Mia','Leo','Sam'])` → "Mia, Leo & Sam" in
`ui.js`; `MAX_STUDENTS` read from `data.js`.

**Donate step 3** — `#manual-dedication` renders `state.students`
(starts as one empty row) as rows of *classroom select + name input*,
each with a remove button once there is more than one row, and an
**+ Add another Rocket** button that hides at four. Validation on
Next: a row with a name but no classroom is flagged ("Please pick a
classroom for this Rocket"); empty rows are dropped. Link mode shows
the chip with all linked kids ("Supporting Mia & Leo", meta "Ms.
Convery · K · Mr. Zweber · 3rd") and no manual rows; **Remove** falls
back to manual rows. The `?link=` banner lists all names.

**Step 4 summary** — "Supporting **Mia & Leo** (Ms. Convery's &
Mr. Zweber's classes)" or, manual, "Credited to **Ms. Convery's and
Mr. Zweber's classes**." Single-student wording stays as today.

**Student Link page** — the form becomes the same row list (name +
classroom per Rocket, names required) with **+ Add a sibling**, capped
at four. Result title "Mia & Leo's Rally link"; print card shows the
names on one line and each classroom on its own line; share title
"Help Mia & Leo fund the Rocket Rally".

Thanks page, home page, and board rendering are unchanged.

## Testing (vitest, workers pool)

- Checkout: two students → metadata `students` JSON with both; an
  untouched row is dropped; a name with no classroom → 400; five rows
  → 400; a family link → both kids in metadata and `via_link = 1`.
- Webhook: two kids in two classes → both classrooms +1; twins → +2;
  legacy `classroom`/`student_name` metadata still credited; a
  redelivered webhook adds nothing.
- Links: create with two kids → verify returns both; the same kids in a
  different order/case → same code; one kid still works; a nameless
  kid or five kids → 400.
- Export: `students` column content and formula neutralization.
- Privacy: `/api/campaign` and `/api/board` bodies contain no student
  names (existing test, extended to the multi-student case).

## Out of scope

Splitting one gift's dollars across priorities or students; household
denominators on the board (no household roster exists); adding manual
extras on top of a link.
