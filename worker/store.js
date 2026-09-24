/* Donation records in D1. One row per Stripe checkout session (the
   session id is the primary key, so webhook retries are idempotent
   inserts), plus one donation_students row per Rocket the gift
   credits. Student names, email, and the billing contact fields are
   PTA-backend-only: nothing here may select them into campaignStats.
   Student names leave the database only through the admin export;
   email and the billing address never do (the PTA reads those in the
   Stripe dashboard). */

import data from '../site/js/data.js';
import { shirtsFromMetadata } from './students.js';

const { CAMPAIGN, CLASSROOMS, PRIORITIES, SUPPORT_ALL, SHIRT, LUNCH, priorityById, partnerTierById, classroomById, shirtSizeById, pacificAt, MAX_STUDENTS } = data;

/* A session's Rockets: the `students` JSON our checkout stamps into
   metadata (a partnership carries none). */
const studentsFromMetadata = (md) => {
  if (typeof md.students !== 'string' || !md.students) return [];
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
};

export async function recordDonation(db, session, createdSec) {
  const md = session.metadata || {};
  const cd = session.customer_details || {};
  const addr = cd.address || {};
  // amount_cents is the fundraising: the charge total minus the opt-in
  // fee cover our checkout endpoint stamped into metadata, minus the
  // part of each shirt that is the shirt. Every stat (campaign, board,
  // circles) counts that alone.
  const total = session.amount_total || 0;
  const shirts = shirtsFromMetadata(md.shirts);
  const shirtCount = Object.values(shirts).reduce((n, sizes) => n + sizes.length, 0);
  const shirtCost = shirtCount * (SHIRT.price - SHIRT.credit) * 100;
  const feeCents = Math.min(Math.max(Number(md.fee_cents) || 0, 0), total);
  const gift = db.prepare(`
    INSERT INTO donations
      (id, amount_cents, fee_cents, priority, partner_tier, donor_name,
       visibility, email, employer_match, via_link, created, billing_name,
       address_line1, address_line2, city, state, postal_code, country)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
    ON CONFLICT(id) DO NOTHING`)
    .bind(
      session.id,
      Math.max(total - feeCents - shirtCost, 0),
      feeCents,
      md.priority || '',
      md.partner_tier || '',
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
    INSERT OR IGNORE INTO donation_students (donation_id, position, classroom, student_name, shirts)
    VALUES (?1, ?2, ?3, ?4, ?5)`).bind(session.id, i, s.c, s.n, (shirts[i] || []).join(',')));
  await db.batch([gift, ...credits]);
}

/* Dollars count everything; the gift tally counts families only, so a
   business partnership doesn't inflate "family gifts so far". Partner
   dollars carry no priority, so the home hero can read higher than
   the sum of the priority cards — the hero shows everything the Rally
   brings in. */
const totalsStmt = (db) =>
  db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS cents,
    COALESCE(SUM(CASE WHEN partner_tier = '' AND id NOT LIKE 'pc\\_%' ESCAPE '\\'
      THEN 1 ELSE 0 END), 0) AS gifts FROM donations`);

const campaignShape = (totals) => ({
  raised: Math.round(totals.results[0].cents / 100),
  goal: CAMPAIGN.goal,
  gifts: totals.results[0].gifts,
});

/* Online business partners for the public wall and board: name, tier,
   and the opaque logo id (set once an image is uploaded, cleared to
   un-publish). The curated data.js roster merges in client-side. */
const partnersStmt = (db) =>
  db.prepare(`SELECT donor_name, partner_tier, logo_id FROM donations
              WHERE partner_tier != '' AND visibility = 'public' ORDER BY created`);
const partnerShape = (rows) => rows.results.map((row) => ({
  name: row.donor_name, tier: row.partner_tier, logo: row.logo_id || '',
}));

/* Home and /partners payload: campaign progress, per-priority totals,
   and the partner list — no donor rows, so it stays a few hundred
   bytes for the life of the campaign. */
/* Gifts the PTA takes in by hand — a check left in the office, cash at
   a Gathering. They land in the same tables as a card gift, so the
   ticker, the classroom race, the honor roll and the student sheet all
   count them without knowing the difference.

   The `off_` id prefix is what makes them safe to undo: a Stripe gift
   is keyed by its `cs_` session id, so the delete below can only ever
   reach a row the PTA typed in itself. */
const OFFLINE_PREFIX = 'off_';
const offlineId = () => OFFLINE_PREFIX + crypto.randomUUID().replace(/-/g, '').slice(0, 20);

/* A business partner's own child, counted as a participant without a
   dollar attached.

   The partnership's money is already in the campaign total and is
   deliberately kept out of the classroom race, so crediting the child
   with any share of it would double-count it and hand one class a
   windfall. What the family is owed is the participation, so that is
   all this records: one Rocket, no dollars, no gift.

   The `pc_` id is the whole mechanism. Rows carrying it are credits and
   not gifts, so they stay out of the campaign's gift count, out of the
   honor roll, and out of every "gifts" figure — while the credit row in
   donation_students does what any credit does and counts the child. */
const CREDIT_PREFIX = 'pc_';
const creditId = () => CREDIT_PREFIX + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const isCreditOnly = (id) => String(id).startsWith(CREDIT_PREFIX);

export async function recordPartnerCredit(db, { businessName, students, createdSec }) {
  const id = creditId();
  /* Anonymous and priority-less on purpose: the business is thanked on
     the partner wall, not a second time in the family honor roll, and
     no priority was chosen because no money moved here. */
  const row = db.prepare(`
    INSERT INTO donations
      (id, amount_cents, fee_cents, priority, partner_tier, donor_name,
       visibility, email, employer_match, via_link, created)
    VALUES (?1, 0, 0, '', '', ?2, 'anon', '', 0, 0, ?3)`)
    .bind(id, businessName, createdSec);
  const credits = students.map((s, i) => db.prepare(`
    INSERT INTO donation_students (donation_id, position, classroom, student_name, shirts)
    VALUES (?1, ?2, ?3, ?4, '')`).bind(id, i, s.c, s.n));
  await db.batch([row, ...credits]);
  return id;
}

export async function deletePartnerCredit(db, id) {
  if (!isCreditOnly(id)) return false;
  const [, gone] = await db.batch([
    db.prepare("DELETE FROM donation_students WHERE donation_id = ?1 AND ?1 LIKE 'pc\\_%' ESCAPE '\\'").bind(id),
    db.prepare("DELETE FROM donations WHERE id = ?1 AND id LIKE 'pc\\_%' ESCAPE '\\'").bind(id),
  ]);
  return (gone.meta && gone.meta.changes) > 0;
}

/* The credits already recorded, for the list under the form. */
export async function partnerCredits(db) {
  const { results } = await db.prepare(`
    SELECT d.id, d.donor_name, d.created,
           COALESCE(GROUP_CONCAT(s.student_name, ', '), '') AS students,
           COALESCE(MIN(s.classroom), '') AS classroom
    FROM donations d LEFT JOIN donation_students s ON s.donation_id = d.id
    WHERE d.id LIKE 'pc\\_%' ESCAPE '\\'
    GROUP BY d.id ORDER BY d.created DESC, d.id DESC`).all();
  return results.map((r) => ({
    id: r.id, business: r.donor_name, created: r.created,
    students: r.students, classroom: r.classroom,
  }));
}

/* `amountCents` is the fundraising, the same figure a card gift
   stores: the money taken in, less the part of each shirt that is the
   shirt. The route does that subtraction, because the PTA types what
   the check was written for. */
export async function recordOfflineGift(db, { amountCents, priority, donorName, visibility, students, createdSec }) {
  const id = offlineId();
  const gift = db.prepare(`
    INSERT INTO donations
      (id, amount_cents, fee_cents, priority, partner_tier, donor_name,
       visibility, email, employer_match, via_link, created)
    VALUES (?1, ?2, 0, ?3, '', ?4, ?5, '', 0, 0, ?6)`)
    .bind(id, amountCents, priority, donorName, visibility, createdSec);
  const credits = students.map((s, i) => db.prepare(`
    INSERT INTO donation_students (donation_id, position, classroom, student_name, shirts)
    VALUES (?1, ?2, ?3, ?4, ?5)`).bind(id, i, s.c, s.n, (s.s || []).join(',')));
  await db.batch([gift, ...credits]);
  return id;
}

/* Only ever an offline row: the LIKE guard means a mistyped id, or a
   pasted Stripe session id, deletes nothing. */
export async function deleteOfflineGift(db, id) {
  if (typeof id !== 'string' || !id.startsWith(OFFLINE_PREFIX)) return false;
  const [, gone] = await db.batch([
    db.prepare("DELETE FROM donation_students WHERE donation_id = ?1 AND ?1 LIKE 'off\\_%' ESCAPE '\\'").bind(id),
    db.prepare("DELETE FROM donations WHERE id = ?1 AND id LIKE 'off\\_%' ESCAPE '\\'").bind(id),
  ]);
  return (gone.meta && gone.meta.changes) > 0;
}

/* What the PTA has entered by hand, newest first, so a wrong amount can
   be found and removed without anyone touching the database. */
export async function offlineGifts(db) {
  const { results } = await db.prepare(
    `SELECT d.id, d.amount_cents, d.priority, d.donor_name, d.visibility, d.created,
            COALESCE(GROUP_CONCAT(s.classroom || '|' || s.shirts || '|' || s.student_name, ';'), '') AS rockets
     FROM donations d LEFT JOIN donation_students s ON s.donation_id = d.id
     WHERE d.id LIKE 'off\\_%' ESCAPE '\\'
     GROUP BY d.id ORDER BY d.created DESC, d.id DESC`,
  ).all();
  return results.map((row) => {
    let shirts = 0;
    /* The name is last in each triple: a name with a '|' in it still
       reads back whole, while the classroom and the sizes can't. */
    const named = row.rockets ? row.rockets.split(';').map((triple) => {
      const [c, sizes, ...rest] = triple.split('|');
      const room = classroomById(c);
      const name = rest.join('|').trim();
      const worn = sizes ? sizes.split(',').filter(Boolean) : [];
      shirts += worn.length;
      const labels = worn.map((z) => (shirtSizeById(z) || { label: z }).label).join(', ');
      return [name || '(no name)', room ? room.teacher : c, labels].filter(Boolean).join(' · ');
    }) : [];
    const p = priorityById(row.priority);
    return {
      id: row.id,
      // What was counted, and what was handed over: they differ by the
      // cost of the shirts, exactly as a card order's do.
      amount: row.amount_cents / 100,
      received: row.amount_cents / 100 + shirts * (SHIRT.price - SHIRT.credit),
      shirts,
      priority: p ? p.name : row.priority,
      donor: row.visibility === 'anon' ? 'Anonymous' : row.donor_name,
      rockets: named.join(', '),
      created: row.created,
    };
  });
}

export async function campaignStats(db) {
  // The home page needs the school-wide participation figure too,
  // and it has to come from the tally the board reads or the two
  // pages print different percentages for the same school.
  const [[totals, byPriority, partnerRows], credits] = await Promise.all([db.batch([
    totalsStmt(db),
    db.prepare("SELECT priority, SUM(amount_cents) AS cents FROM donations WHERE priority != '' GROUP BY priority"),
    partnersStmt(db),
  ]), loadCredits(db)]);
  const priorities = {};
  let sharedCents = 0;
  for (const row of byPriority.results) {
    if (row.priority === SUPPORT_ALL.id) sharedCents += row.cents;
    else priorities[row.priority] = Math.round(row.cents / 100);
  }
  // A Support It All gift is one gift that lands on all six. The cards
  // print whole dollars, so the split is made in dollars with the
  // remainder going to the first few: $100 reads 17/17/17/17/16/16,
  // which adds back to exactly what was given. Splitting the cents
  // instead rounds each card up and shows $102.
  if (sharedCents) {
    const dollars = Math.round(sharedCents / 100);
    const each = Math.floor(dollars / PRIORITIES.length);
    let extra = dollars - each * PRIORITIES.length;
    for (const p of PRIORITIES) {
      priorities[p.id] = (priorities[p.id] || 0) + each + (extra-- > 0 ? 1 : 0);
    }
  }
  const classrooms = {};
  for (const [id, line] of Object.entries(perClassroom(tally(credits)))) {
    classrooms[id] = { rockets: line.rockets, raised: Math.round(line.cents / 100) };
  }
  return {
    campaign: campaignShape(totals), priorities, classrooms,
    partners: partnerShape(partnerRows),
  };
}

/* Rally Board payload: campaign progress plus the classroom race and
   the full honor roll (one row per gift, newest first). Each classroom
   carries both prize races — Rockets participating and dollars
   raised — from the same tally the PTA's classroom sheet reads, and no
   student name. */
export async function boardStats(db) {
  const [[totals, roll, partnerRows], credits] = await Promise.all([db.batch([
    totalsStmt(db),
    db.prepare(`SELECT donor_name, priority, partner_tier, amount_cents, visibility
                FROM donations WHERE id NOT LIKE 'pc\\_%' ESCAPE '\\'
                ORDER BY created DESC, id DESC`),
    partnersStmt(db),
  ]), loadCredits(db)]);

  const rooms = tally(credits);
  const classrooms = {};
  for (const [id, line] of Object.entries(perClassroom(rooms))) {
    classrooms[id] = { rockets: line.rockets, raised: Math.round(line.cents / 100) };
  }

  const donors = roll.results.map((row) => {
    const isPublic = row.visibility === 'public' && row.donor_name;
    const circle = priorityById(row.priority)?.circle;
    return {
      name: isPublic ? row.donor_name : 'Anonymous',
      priority: row.priority,
      anon: !isPublic,
      circle: !!circle && row.amount_cents >= circle.min * 100,
      partner: row.partner_tier || '',
    };
  });

  return { campaign: campaignShape(totals), classrooms, donors, partners: partnerShape(partnerRows), prizes: prizeNumbers(rooms) };
}

/* ---- the PTA's reports (admin-only) ---- */

const cell = (value) => {
  let s = String(value == null ? '' : value);
  // Student names are attacker-supplied and these files' purpose is to
  // be opened in Excel/Sheets — neutralize formula-leading characters.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
const dollars = (cents) => (cents / 100).toFixed(2);
/* A report is { columns, rows }; the CSV form opens in Excel/Sheets
   (BOM so UTF-8 names read), the JSON form feeds /admin. */
export const csv = ({ columns, rows }) =>
  '﻿' + [columns.join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n') + '\n';

/* Roster order, then any classroom the roster no longer lists. */
const roomOrder = (seen) => {
  const known = CLASSROOMS.map((r) => r.id);
  return [...known, ...Object.keys(seen).filter((id) => !known.includes(id))]
    .map((id) => classroomById(id) || { id, grade: '', teacher: id, students: 0 });
};

/* Every Rocket credit with its gift. D1 bills a join's probe of the
   gift row at two or three reads per credit, whichever index it goes
   through, and a materialised CTE bills its temp table too; two flat
   scans of covering indexes, joined here, cost one read per row. The
   join also drops a credit whose gift was deleted by hand (a refund,
   the go-live wipe). Partnerships carry no credits and stay out.

   `rooms` narrows both scans to the gifts touching those classrooms,
   whole: a gift naming Rockets in two rooms splits its dollars by how
   many it named, so the tally needs every credit of that gift. */
async function loadCredits(db, rooms = []) {
  const gifts = rooms.length
    ? `IN (SELECT donation_id FROM donation_students WHERE classroom IN (${rooms.map(() => '?').join(', ')}))`
    : 'IS NOT NULL';
  const [students, donations] = await db.batch([
    db.prepare(`SELECT donation_id, position, classroom, student_name, shirts
                FROM donation_students WHERE donation_id ${gifts}`).bind(...rooms),
    db.prepare(`SELECT id, amount_cents, created FROM donations WHERE id ${gifts}`).bind(...rooms),
  ]);
  const gift = new Map(donations.results.map((d) => [d.id, d]));
  return students.results
    .filter((c) => gift.has(c.donation_id))
    .map((c) => ({ ...c, amount_cents: gift.get(c.donation_id).amount_cents, created: gift.get(c.donation_id).created }))
    .sort((a, b) => a.created - b.created
      || (a.donation_id < b.donation_id ? -1 : a.donation_id > b.donation_id ? 1 : 0)
      || a.position - b.position);
}

/* The school's own clock, not UTC. Shirts go to the printer in
   batches, and the cutoff is a moment: an order placed at 6pm Pacific
   reads as tomorrow in UTC, which would drop that child's shirt into
   the next box or out of both. `pacificAt` in data.js is the one place
   that decides, shared with the ordering deadline, and its
   "YYYY-MM-DD HH:MM" sorts as a string — which is what the window
   comparison below relies on. */
const orderedAt = (createdSec) => pacificAt(new Date(createdSec * 1000));

/* A window end as the PTA typed it → something comparable to the
   above. A bare day means the whole day, so `to` runs to its last
   minute; anything unreadable is dropped, because a stray character
   should show too many shirts and never too few. */
const windowEnd = (v, end) => {
  const raw = String(v || '').trim().replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return end ? `${raw} 23:59` : raw;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) return raw;
  return '';
};

/* What the reports call a credit whose donor left the name box empty.
   Mission Control shows this in the picker, and sends '' back when the
   PTA puts a name to one. */
export const NO_NAME = '(no name given)';

/* Credits -> classroom id -> lowercase name -> { name, gifts, cents,
   shirts }. A gift naming several Rockets counts once for each (as the
   race does) and splits its dollars evenly, so class totals stay real
   money; each shirt's share goes to its own Rocket first, and leftover
   cents go to the first named. */
const tally = (credits) => {
  const perGift = {};
  for (const c of credits) {
    const g = (perGift[c.donation_id] ||= { rockets: 0, shirts: 0 });
    g.rockets += 1;
    g.shirts += c.shirts ? c.shirts.split(',').length : 0;
  }
  const handedOut = {};
  const rooms = {};
  for (const c of credits) {
    const g = perGift[c.donation_id];
    const i = handedOut[c.donation_id] = (handedOut[c.donation_id] || 0) + 1;
    const own = c.shirts ? c.shirts.split(',').length : 0;
    const gift = c.amount_cents - g.shirts * SHIRT.credit * 100;
    const share = Math.floor(gift / g.rockets) + (i <= gift % g.rockets ? 1 : 0) + own * SHIRT.credit * 100;
    // Grandparents and parents spell a kid differently; keep the first
    // spelling seen and merge the rest.
    const name = c.student_name.trim();
    const room = (rooms[c.classroom] ||= {});
    const student = (room[name.toLowerCase()] ||= { name: name || NO_NAME, gifts: 0, cents: 0, shirts: 0 });
    student.gifts += isCreditOnly(c.donation_id) ? 0 : 1;
    student.cents += share;
    student.shirts += own;
  }
  return rooms;
};

/* One classroom's line in both races: how many Rockets are
   participating, how many gifts stand behind them, and what the class
   has raised. Each named Rocket counts once however many gifts they
   draw; a gift that named no Rocket counts once, as the family behind
   it, so the optional name box never costs a class credit.

   The board and the PTA's classroom sheet both read this, so the
   dollars deciding the Top Class prize can't drift between the number
   families watch and the number the PTA pays out on. It reads names to
   group by Rocket and returns none: the board's payload and page stay
   name-free, which `test/api.spec.js` and `test/pages.spec.js` pin. */
const perClassroom = (rooms) => {
  const totals = {};
  for (const [id, students] of Object.entries(rooms)) {
    const line = totals[id] = { rockets: 0, gifts: 0, cents: 0, shirts: 0 };
    for (const [key, s] of Object.entries(students)) {
      line.rockets += key === '' ? s.gifts : 1;
      line.gifts += s.gifts;
      line.cents += s.cents;
      line.shirts += s.shirts;
    }
  }
  return totals;
};

export async function classroomTotals(db) {
  return perClassroom(tally(await loadCredits(db)));
}

/* What first place has raised, for the Principal for the Day line on
   the prizes page — a number, and deliberately nothing else. Families
   keep asking the PTA what it would take to win, and the answer was
   being given out one text message at a time.

   Three things make this publishable on a page with no key:

   - **No name leaves here.** It returns dollars. The per-Rocket names
     this reads are already backend-only and stay that way, which
     `test/pages.spec.js` probes the rendered page for.
   - **Rounded down to the nearest $100**, so it doesn't twitch every
     time someone gives $10, and so the published figure always sits
     *under* the real leader. A family that matches the number to the
     dollar has not taken the lead — which is what keeps this a
     reason to give rather than a target to snipe.
   - **Gifts that named no Rocket are not a Rocket.** They fold into
     one nameless bucket per classroom that can hold several families,
     so counting it as a contender would publish a number nobody
     actually raised.

   It reads what the Rockets sheet reads, through the same `tally`, so
   the number on the page and the number in Mission Control cannot
   disagree — the first thing a parent would call about.

   `lunch` is the other number: how many Rockets have already reached
   `LUNCH.gifts`. That prize has no cap, so this is a count of winners
   rather than a leaderboard — the reassuring shape of the same idea,
   and the one figure that answers "is ten gifts actually doable" with
   evidence instead of encouragement.

   Taken off a tally that has already been built, so the board — which
   builds one anyway — prints both figures for no extra read, and the
   prizes page and the board can't show different numbers. */
const prizeNumbers = (rooms) => {
  let top = 0;
  let lunch = 0;
  for (const students of Object.values(rooms)) {
    for (const [name, s] of Object.entries(students)) {
      if (!name) continue;
      if (s.cents > top) top = s.cents;
      if (s.gifts >= LUNCH.gifts) lunch += 1;
    }
  }
  return { lead: Math.floor(top / 10000) * 100, lunch };
};

export async function prizeStats(db) {
  return prizeNumbers(tally(await loadCredits(db)));
}

/* The student sheet: what each Rocket has raised, under their class,
   biggest first. Family gifts that named no Rocket close the sheet so
   it still adds up to the board. */
export async function studentsReport(db) {
  const [credits, uncredited] = await Promise.all([
    loadCredits(db),
    db.prepare(`SELECT COUNT(*) AS gifts, COALESCE(SUM(amount_cents), 0) AS cents
                FROM donations d WHERE partner_tier = ''
                AND NOT EXISTS (SELECT 1 FROM donation_students s WHERE s.donation_id = d.id)`).first(),
  ]);
  const rooms = tally(credits);
  const rows = [];
  for (const room of roomOrder(rooms)) {
    const students = Object.entries(rooms[room.id] || {}).sort(([ka, a], [kb, b]) =>
      (ka === '') - (kb === '') || b.cents - a.cents || b.gifts - a.gifts || a.name.localeCompare(b.name));
    for (const [, s] of students) rows.push([room.grade, room.teacher, s.name, s.gifts, dollars(s.cents)]);
  }
  const rest = uncredited;
  if (rest.gifts) rows.push(['', '', 'No Rocket named', rest.gifts, dollars(rest.cents)]);
  return { columns: ['grade', 'teacher', 'student', 'gifts', 'raised'], rows };
}

/* The classroom sheet for the marquee: every roster classroom with its
   participation and dollars, so a class with nothing yet shows a zero. */
export async function classroomsReport(db) {
  const rooms = await classroomTotals(db);
  const rows = roomOrder(rooms).map((room) => {
    const line = rooms[room.id] || { rockets: 0, gifts: 0, cents: 0, shirts: 0 };
    const pct = room.students > 0 ? Math.round(Math.min(line.rockets / room.students, 1) * 100) : 0;
    return [room.grade, room.teacher, room.students, line.gifts, line.rockets, pct, dollars(line.cents), line.shirts];
  });
  return { columns: ['grade', 'teacher', 'students', 'gifts', 'rockets', 'participation_pct', 'raised', 'shirts'], rows };
}

/* The printer's sheet: each Rocket's shirts by size, merged across
   orders, in roster then name then size order. */
/* The printer's sheet, with the moment each order came in so the PTA
   can cut a batch at a time as well as a day. One row per Rocket, size
   and **order**: two of a size bought a week apart are two rows,
   because one of them may belong to a box already at the printer, and
   two bought in the same checkout are one row of quantity 2.

   `from`/`to` are inclusive, either end open, and take a bare
   YYYY-MM-DD (the whole day) or YYYY-MM-DD HH:MM. */
export async function shirtsReport(db, { from = '', to = '' } = {}) {
  const lo = windowEnd(from, false);
  const hi = windowEnd(to, true);
  const credits = (await loadCredits(db)).filter((c) => c.shirts);
  const rooms = {};
  for (const c of credits) {
    const at = orderedAt(c.created);
    if (lo && at < lo) continue;
    if (hi && at > hi) continue;
    const name = c.student_name.trim();
    const student = ((rooms[c.classroom] ||= {})[name.toLowerCase()] ||= { name, orders: {} });
    // Keyed by the order, so the clock time on the row is one real
    // moment rather than a mix of two.
    const order = (student.orders[`${at} ${c.donation_id}`] ||= { at, sizes: {} });
    for (const z of c.shirts.split(',')) order.sizes[z] = (order.sizes[z] || 0) + 1;
  }
  const sizeOrder = SHIRT.sizes.map((z) => z.id);
  const rows = [];
  for (const room of roomOrder(rooms)) {
    const students = Object.values(rooms[room.id] || {}).sort((a, b) => a.name.localeCompare(b.name));
    for (const s of students) {
      for (const k of Object.keys(s.orders).sort()) {
        const order = s.orders[k];
        for (const z of sizeOrder.filter((id) => order.sizes[id])) {
          rows.push([room.grade, room.teacher, s.name, shirtSizeById(z).label, order.sizes[z], order.at]);
        }
      }
    }
  }
  return { columns: ['grade', 'teacher', 'student', 'size', 'quantity', 'ordered'], rows };
}

/* What the printer is actually handed: how many of each size. Folded
   from the sheet's own rows, so the count and the pick list can never
   disagree about a batch. */
export const shirtSizeTotals = ({ rows }) => {
  const byLabel = {};
  for (const [, , , label, qty] of rows) byLabel[label] = (byLabel[label] || 0) + qty;
  const ordered = SHIRT.sizes
    .filter((z) => byLabel[z.label])
    .map((z) => ({ size: z.label, quantity: byLabel[z.label] }));
  return { sizes: ordered, total: ordered.reduce((n, z) => n + z.quantity, 0) };
};

/* Every gift, newest first, and what each one counted toward: the book
   a single donation can be looked up in. The rolled-up sheets answer
   "how is the class doing"; nothing answered "where did Grandma's $25
   go", which is the question that actually gets asked — and the honor
   roll can't answer it, because it carries no amount and no Rocket.

   A gift with an empty Rockets cell is the whole point of the sheet:
   the Rocket step in checkout is optional, so an aunt giving from the
   home page lands here with nothing attached, counted for the school
   and for nobody's class. `creditGift` is how that gets fixed.

   The gift id is the last column because it is long and ugly and the
   PTA doesn't read it — but it is the Stripe session id, so the CSV
   reconciles line by line against the Stripe dashboard. */
export async function giftsReport(db) {
  const [gifts, credits] = await db.batch([
    db.prepare(`SELECT id, amount_cents, fee_cents, priority, partner_tier,
                       donor_name, visibility, created
                FROM donations ORDER BY created DESC, id DESC`),
    db.prepare(`SELECT donation_id, position, classroom, student_name, shirts
                FROM donation_students ORDER BY donation_id, position`),
  ]);
  const byGift = {};
  for (const c of credits.results) (byGift[c.donation_id] ||= []).push(c);

  const rows = gifts.results.map((g) => {
    const mine = byGift[g.id] || [];
    const credit = isCreditOnly(g.id);
    const tier = partnerTierById(g.partner_tier);
    const priority = priorityById(g.priority);
    /* "Anonymous" on this site is a choice about the Rally Board: the
       form asks for a name, then asks separately whether to print it
       there. So the PTA's own book shows the name — otherwise a gift
       can't be looked up at all, which is what this sheet is for — and
       marks it, because the mark travels with the name wherever the
       name gets copied. A column two cells away would not.

       A business's participation credit carries the business name and
       is 'anon' only because it is no honor-roll gift, so it isn't
       marked. Donor **email** stays where it has always been: in the
       backend, off every page. */
    const anon = g.visibility === 'anon' && !credit;
    const named = (g.donor_name || '').trim();
    return [
      orderedAt(g.created),
      credit ? 'credit' : tier ? 'partner' : g.id.startsWith(OFFLINE_PREFIX) ? 'by hand' : 'card',
      named ? (anon ? `${named} (anonymous)` : named) : 'Anonymous',
      mine.map((c) => c.student_name.trim()).filter(Boolean).join(', '),
      [...new Set(mine.map((c) => (classroomById(c.classroom) || {}).teacher || c.classroom))].join(', '),
      tier ? tier.name : priority ? priority.name
        : g.priority === SUPPORT_ALL.id ? SUPPORT_ALL.name : g.priority,
      dollars(g.amount_cents),
      dollars(g.fee_cents),
      mine.reduce((n, c) => n + (c.shirts ? c.shirts.split(',').length : 0), 0),
      g.id,
    ];
  });
  return {
    columns: ['when', 'source', 'donor', 'credited', 'classes', 'priority', 'raised', 'fee', 'shirts', 'gift_id'],
    rows,
  };
}

/* Put a gift on a Rocket — or on the two or three it was always meant
   for. The dollars split between them the way checkout splits them, so
   a gift credited here and the same gift credited at checkout reach
   the classroom race identically.

   The rows are replaced rather than added to, so the panel fixes a
   wrong Rocket as well as a missing one. Two refusals:

   - A **partnership** stays out. Its money is already in the campaign
     total and is deliberately kept out of the classroom race; crediting
     it to a class would hand that class a windfall no family gave. A
     partner's own child is counted with `recordPartnerCredit`, which
     adds the participation and no dollars.
   - A gift **carrying shirts** stays out. Those shirts are printed with
     a name on them and sorted into a batch by it; moving the Rocket
     under them would send a child somebody else's shirt. */
export async function creditGift(db, donationId, students) {
  const gift = await db.prepare(
    'SELECT id, partner_tier FROM donations WHERE id = ?1').bind(donationId).first();
  if (!gift) return { error: 'gone' };
  if (gift.partner_tier) return { error: 'partner' };
  const { results: had } = await db.prepare(
    'SELECT position, shirts FROM donation_students WHERE donation_id = ?1').bind(donationId).all();
  if (had.some((r) => r.shirts)) return { error: 'shirts' };
  await db.batch([
    db.prepare('DELETE FROM donation_students WHERE donation_id = ?1').bind(donationId),
    ...students.map((s, i) => db.prepare(`
      INSERT INTO donation_students (donation_id, position, classroom, student_name, shirts)
      VALUES (?1, ?2, ?3, ?4, '')`).bind(donationId, i, s.c, s.n)),
  ]);
  return { credited: students.length, replaced: had.length };
}

/* Every shirt on order, one entry per Rocket per checkout, so Mission
   Control can offer the PTA a real shirt to point at rather than a
   size typed from memory. `(donation_id, position)` is the row the
   change lands on; `at` is the same Pacific stamp the printer's sheet
   prints, so the two agree about which batch a shirt is in. */
export async function shirtOrders(db) {
  const credits = (await loadCredits(db)).filter((c) => c.shirts);
  return credits.map((c) => ({
    id: c.donation_id,
    position: c.position,
    classroom: c.classroom,
    student: c.student_name.trim(),
    sizes: c.shirts.split(',').filter((z) => shirtSizeById(z)),
    at: orderedAt(c.created),
  })).filter((o) => o.sizes.length);
}

/* A child grew, or a parent guessed. One shirt on one order becomes
   another size, and nothing else moves: the shirt still costs what it
   cost, the gift is the same gift, and the order keeps the moment it
   came in, so a shirt already in a batch stays in that batch rather
   than reappearing in the next one as a surprise.

   Only one shirt changes even when the Rocket ordered several. The
   UPDATE carries the old value of the whole column, so two people in
   Mission Control at once can't overwrite each other's change: the
   second one finds nothing to update and is told to refresh. */
export async function changeShirtSize(db, { donationId, position, from, to }) {
  const row = await db.prepare(
    `SELECT shirts, student_name FROM donation_students
     WHERE donation_id = ?1 AND position = ?2`).bind(donationId, position).first();
  if (!row || !row.shirts) return null;
  const sizes = row.shirts.split(',');
  const i = sizes.indexOf(from);
  if (i < 0) return null;
  const next = [...sizes];
  next[i] = to;
  const res = await db.prepare(
    `UPDATE donation_students SET shirts = ?3
     WHERE donation_id = ?1 AND position = ?2 AND shirts = ?4`)
    .bind(donationId, position, next.join(','), row.shirts).run();
  if (!res.meta.changes) return null;
  return { student: row.student_name.trim() };
}

/* ---- the Thursday classroom digest ---------------------------------
   Teacher addresses live here rather than in data.js: this repository
   is public and these are staff email addresses. The PTA types them
   into Mission Control. */

export async function teacherEmails(db) {
  const { results } = await db.prepare(
    'SELECT classroom, email FROM teacher_emails').all();
  const map = {};
  for (const row of results) map[row.classroom] = row.email;
  return map;
}

/* Replaces the whole list: the admin page edits it as one block of
   text, so a classroom left out of the paste is one taken off the
   send. */
export async function setTeacherEmails(db, pairs, nowSec) {
  const stmts = [db.prepare('DELETE FROM teacher_emails')];
  for (const [classroom, email] of Object.entries(pairs)) {
    stmts.push(db.prepare(
      'INSERT INTO teacher_emails (classroom, email, updated) VALUES (?1, ?2, ?3)')
      .bind(classroom, email, nowSec));
  }
  await db.batch(stmts);
}

/* The Monday of a send's week, as a plain UTC date — the key that
   makes a second run of the same week a no-op. */
export const weekKey = (nowMs) => {
  const d = new Date(nowMs);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

/* Claims this week's send for a classroom. Returns false if it was
   already claimed, so a retried cron mails no one twice. */
export async function claimDigest(db, classroom, week, nowSec) {
  const res = await db.prepare(
    `INSERT OR IGNORE INTO digest_log (classroom, week, sent, status)
     VALUES (?1, ?2, ?3, 'sending')`).bind(classroom, week, nowSec).run();
  return res.meta.changes === 1;
}

export async function finishDigest(db, classroom, week, status) {
  await db.prepare('UPDATE digest_log SET status = ?3 WHERE classroom = ?1 AND week = ?2')
    .bind(classroom, week, status).run();
}

/* A failed send shouldn't hold its week's slot: releasing it lets the
   next run try that classroom again. */
export async function releaseDigest(db, classroom, week) {
  await db.prepare('DELETE FROM digest_log WHERE classroom = ?1 AND week = ?2')
    .bind(classroom, week).run();
}

/* What Mission Control shows under the address list: when each class
   last had a digest, and how it went. */
export async function digestHistory(db) {
  const { results } = await db.prepare(
    `SELECT classroom, week, sent, status FROM digest_log
     ORDER BY week DESC, classroom`).all();
  return results;
}

/* Fix a mistyped Rocket, or merge two spellings of one kid.

   Donors type names by hand, so one child arrives as "Audrey", "Audrey
   Webber" and "audrey w". Left alone each spelling is its own Rocket:
   the child's total splits across them and the class is credited with
   three participants instead of one, which decides prizes. This moves
   every credit from one spelling to another inside a single classroom.
   Renaming to a name already there merges them, because the reports
   group by the folded name.

   Scoped to one classroom so two children who share a first name in
   different rooms can't be merged by accident. Returns how many
   credits moved. */
export async function renameRocket(db, classroom, from, to) {
  const res = await db.prepare(
    `UPDATE donation_students SET student_name = ?3
     WHERE classroom = ?1 AND LOWER(TRIM(student_name)) = LOWER(TRIM(?2))`)
    .bind(classroom, from, to).run();
  return res.meta.changes || 0;
}

/* One gift's Rockets, with what each has raised across every gift.

   The donor holds the key here: their own checkout session id, which
   Stripe puts in the thank-you URL. It is long and random, so the page
   works as a private link the family can bookmark and come back to
   after grandparents and neighbours give. This is the one place a
   student name leaves the backend without the admin key, and it only
   ever returns the names on that donor's own gift, names they typed
   themselves. Never donor names, and never a per-donor amount. */
/* Who a family has to thank. Public names only: those are already on
   the honor roll, so a family learns nothing about a donor that the
   Rally Board doesn't already say out loud. No amounts, ever — the
   honor roll has never carried one, and choosing to be listed was not
   agreeing to have your gift itemised to somebody's family. Anonymous
   gifts are counted so the total still adds up, and never named.
   Partnerships are a business's gift to the school, not a child's. A
   partner's participation credit (`pc_`) is no gift at all, so it is
   left out rather than counted toward anonGifts. */
const donorsStmt = (db, rooms) => db.prepare(`
  SELECT s.classroom, s.student_name, d.donor_name, d.visibility
  FROM donation_students s JOIN donations d ON d.id = s.donation_id
  WHERE s.classroom IN (${rooms.map(() => '?').join(', ')})
    AND d.partner_tier = '' AND d.id NOT LIKE 'pc\\_%' ESCAPE '\\'
  ORDER BY d.created DESC, d.id DESC, s.position`);

const donorsByRocket = (rows) => {
  const out = {};
  for (const r of rows) {
    const key = `${r.classroom} ${r.student_name.trim().toLowerCase()}`;
    const entry = (out[key] ||= { names: [], anon: 0, seen: new Set() });
    const name = (r.donor_name || '').trim();
    // A blank name is anonymous whatever the radio said.
    if (r.visibility !== 'public' || !name) { entry.anon += 1; continue; }
    // One line per donor: two gifts from grandma is still one thank-you.
    const folded = name.toLowerCase();
    if (entry.seen.has(folded)) continue;
    entry.seen.add(folded);
    entry.names.push(name);
  }
  return out;
};

export async function giftRockets(db, donationId) {
  const { results: mine } = await db.prepare(
    `SELECT classroom, student_name FROM donation_students
     WHERE donation_id = ?1 ORDER BY position`).bind(donationId).all();
  if (!mine.length) return null;

  // A gift names at most four Rockets, so this reads a few classrooms
  // rather than the school.
  const mineRooms = [...new Set(mine.map((r) => r.classroom))];
  const [credits, thanked] = await Promise.all([
    loadCredits(db, mineRooms),
    donorsStmt(db, mineRooms).bind(...mineRooms).all(),
  ]);
  const rooms = tally(credits);
  const donors = donorsByRocket(thanked.results);
  const seen = new Set();
  const rockets = [];
  for (const row of mine) {
    const folded = row.student_name.trim().toLowerCase();
    const key = `${row.classroom} ${folded}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tallied = (rooms[row.classroom] || {})[folded];
    const room = classroomById(row.classroom);
    const thanks = donors[key] || { names: [], anon: 0 };
    rockets.push({
      name: row.student_name.trim(),
      teacher: room ? room.teacher : '',
      grade: room ? room.grade : '',
      raised: tallied ? Math.round(tallied.cents / 100) : 0,
      gifts: tallied ? tallied.gifts : 0,
      donors: thanks.names,
      anonGifts: thanks.anon,
    });
  }
  return rockets;
}


/* ---- "email me my Rocket link" -------------------------------------

   A donor who lost the thank-you link asks for it by email address.
   Everything here is keyed off the address Stripe already collected on
   their gift, so the mail can only ever go to someone who really gave,
   at the address they gave it from. */

/* Their gifts, newest first, each with the Rockets it credited. Only
   family gifts: a business partnership credits no Rocket. */
export async function giftsForEmail(db, email) {
  const { results } = await db.prepare(
    `SELECT d.id, d.created,
            COALESCE(GROUP_CONCAT(s.student_name, ', '), '') AS rockets
     FROM donations d JOIN donation_students s ON s.donation_id = d.id
     WHERE LOWER(TRIM(d.email)) = LOWER(TRIM(?1)) AND d.partner_tier = ''
     GROUP BY d.id ORDER BY d.created DESC, d.id DESC LIMIT 20`)
    .bind(email).all();
  return results.map((row) => ({
    id: row.id,
    created: row.created,
    rockets: row.rockets.split(', ').map((n) => n.trim()).filter(Boolean),
  }));
}

const emailHash = async (email) => {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/* One send per address per cooldown. The endpoint is public and it
   sends mail, so without this someone could use it to pester a donor,
   or burn the sending domain's reputation. */
export async function claimLinkRequest(db, email, nowSec, cooldownSec) {
  const hash = await emailHash(email);
  const row = await db.prepare(
    'SELECT sent FROM link_requests WHERE email_hash = ?1').bind(hash).first();
  if (row && nowSec - row.sent < cooldownSec) return false;
  await db.prepare(
    `INSERT INTO link_requests (email_hash, sent) VALUES (?1, ?2)
     ON CONFLICT(email_hash) DO UPDATE SET sent = ?2`).bind(hash, nowSec).run();
  return true;
}
