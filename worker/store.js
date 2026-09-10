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

const { CAMPAIGN, CLASSROOMS, PRIORITIES, SUPPORT_ALL, SHIRT, priorityById, classroomById, shirtSizeById, MAX_STUDENTS } = data;

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
    COALESCE(SUM(CASE WHEN partner_tier = '' THEN 1 ELSE 0 END), 0) AS gifts FROM donations`);

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
    VALUES (?1, ?2, ?3, ?4, '')`).bind(id, i, s.c, s.n));
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
            COALESCE(GROUP_CONCAT(s.classroom || '|' || s.student_name, ';'), '') AS rockets
     FROM donations d LEFT JOIN donation_students s ON s.donation_id = d.id
     WHERE d.id LIKE 'off\\_%' ESCAPE '\\'
     GROUP BY d.id ORDER BY d.created DESC, d.id DESC`,
  ).all();
  return results.map((row) => {
    const named = row.rockets ? row.rockets.split(';').map((pair) => {
      const [c, ...rest] = pair.split('|');
      const room = classroomById(c);
      const name = rest.join('|').trim();
      return [name || '(no name)', room ? room.teacher : c].join(' · ');
    }) : [];
    const p = priorityById(row.priority);
    return {
      id: row.id,
      amount: row.amount_cents / 100,
      priority: p ? p.name : row.priority,
      donor: row.visibility === 'anon' ? 'Anonymous' : row.donor_name,
      rockets: named.join(', '),
      created: row.created,
    };
  });
}

export async function campaignStats(db) {
  const [totals, byPriority, partnerRows] = await db.batch([
    totalsStmt(db),
    db.prepare("SELECT priority, SUM(amount_cents) AS cents FROM donations WHERE priority != '' GROUP BY priority"),
    partnersStmt(db),
  ]);
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
  return { campaign: campaignShape(totals), priorities, partners: partnerShape(partnerRows) };
}

/* Rally Board payload: campaign progress plus the classroom race and
   the full honor roll (one row per gift, newest first). Each classroom
   carries both prize races — Rockets participating and dollars
   raised — from the same tally the PTA's classroom sheet reads, and no
   student name. */
export async function boardStats(db) {
  const [totals, credits, roll, partnerRows] = await db.batch([
    totalsStmt(db),
    creditsStmt(db),
    db.prepare(`SELECT donor_name, priority, partner_tier, amount_cents, visibility
                FROM donations ORDER BY created DESC, id DESC`),
    partnersStmt(db),
  ]);

  const classrooms = {};
  for (const [id, line] of Object.entries(perClassroom(tally(credits.results)))) {
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

  return { campaign: campaignShape(totals), classrooms, donors, partners: partnerShape(partnerRows) };
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

/* Every Rocket credit with its gift: joined so a gift deleted by hand
   (refund, the go-live wipe) takes its classroom credits with it.
   Partnerships carry no credits and stay out. */
const creditsStmt = (db) => db.prepare(`
  SELECT s.donation_id, s.classroom, s.student_name, s.shirts, d.amount_cents
  FROM donation_students s JOIN donations d ON d.id = s.donation_id
  ORDER BY d.created, d.id, s.position`);

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
    const student = (room[name.toLowerCase()] ||= { name: name || '(no name given)', gifts: 0, cents: 0, shirts: 0 });
    student.gifts += 1;
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
  return perClassroom(tally((await creditsStmt(db).all()).results));
}

/* The student sheet: what each Rocket has raised, under their class,
   biggest first. Family gifts that named no Rocket close the sheet so
   it still adds up to the board. */
export async function studentsReport(db) {
  const [credits, uncredited] = await db.batch([
    creditsStmt(db),
    db.prepare(`SELECT COUNT(*) AS gifts, COALESCE(SUM(amount_cents), 0) AS cents
                FROM donations d WHERE partner_tier = ''
                AND NOT EXISTS (SELECT 1 FROM donation_students s WHERE s.donation_id = d.id)`),
  ]);
  const rooms = tally(credits.results);
  const rows = [];
  for (const room of roomOrder(rooms)) {
    const students = Object.entries(rooms[room.id] || {}).sort(([ka, a], [kb, b]) =>
      (ka === '') - (kb === '') || b.cents - a.cents || b.gifts - a.gifts || a.name.localeCompare(b.name));
    for (const [, s] of students) rows.push([room.grade, room.teacher, s.name, s.gifts, dollars(s.cents)]);
  }
  const rest = uncredited.results[0];
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
export async function shirtsReport(db) {
  const credits = (await creditsStmt(db).all()).results.filter((c) => c.shirts);
  const rooms = {};
  for (const c of credits) {
    const name = c.student_name.trim();
    const student = ((rooms[c.classroom] ||= {})[name.toLowerCase()] ||= { name, sizes: {} });
    for (const z of c.shirts.split(',')) student.sizes[z] = (student.sizes[z] || 0) + 1;
  }
  const sizeOrder = SHIRT.sizes.map((z) => z.id);
  const rows = [];
  for (const room of roomOrder(rooms)) {
    const students = Object.values(rooms[room.id] || {}).sort((a, b) => a.name.localeCompare(b.name));
    for (const s of students) {
      for (const z of sizeOrder.filter((id) => s.sizes[id])) {
        rows.push([room.grade, room.teacher, s.name, shirtSizeById(z).label, s.sizes[z]]);
      }
    }
  }
  return { columns: ['grade', 'teacher', 'student', 'size', 'quantity'], rows };
}
