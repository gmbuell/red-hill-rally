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
   the full honor roll (one row per gift, newest first). */
export async function boardStats(db) {
  const [totals, byClassroom, roll, partnerRows] = await db.batch([
    totalsStmt(db),
    // Joined so a gift deleted by hand (refund, the go-live wipe)
    // takes its classroom credits with it.
    db.prepare(`SELECT s.classroom, COUNT(*) AS gifts FROM donation_students s
                JOIN donations d ON d.id = s.donation_id GROUP BY s.classroom`),
    db.prepare(`SELECT donor_name, priority, partner_tier, amount_cents, visibility
                FROM donations ORDER BY created DESC, id DESC`),
    partnersStmt(db),
  ]);

  const classrooms = {};
  for (const row of byClassroom.results) classrooms[row.classroom] = row.gifts;

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
  const rooms = tally((await creditsStmt(db).all()).results);
  const rows = roomOrder(rooms).map((room) => {
    const students = Object.values(rooms[room.id] || {});
    const sum = (key) => students.reduce((n, s) => n + s[key], 0);
    const pct = room.students > 0 ? Math.round(Math.min(sum('gifts') / room.students, 1) * 100) : 0;
    return [room.grade, room.teacher, room.students, sum('gifts'), pct, dollars(sum('cents')), sum('shirts')];
  });
  return { columns: ['grade', 'teacher', 'students', 'gifts', 'participation_pct', 'raised', 'shirts'], rows };
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
