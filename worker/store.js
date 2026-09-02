/* Donation records in D1. One row per Stripe checkout session (the
   session id is the primary key, so webhook retries are idempotent
   inserts), plus one donation_students row per Rocket the gift
   credits. Student names, email, and the billing contact fields are
   PTA-backend-only: nothing here may select them into campaignStats.
   Student names leave the database only through the admin export;
   email and the billing address never do (the PTA reads those in the
   Stripe dashboard). */

import data from '../site/js/data.js';

const { CAMPAIGN, CLASSROOMS, priorityById, classroomById, MAX_STUDENTS } = data;

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
  // amount_cents is the intended gift: the charge total minus the
  // opt-in fee cover our checkout endpoint stamped into metadata.
  // Every stat (campaign, board, circles) counts the gift alone.
  const total = session.amount_total || 0;
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
      total - feeCents,
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
    INSERT OR IGNORE INTO donation_students (donation_id, position, classroom, student_name)
    VALUES (?1, ?2, ?3, ?4)`).bind(session.id, i, s.c, s.n));
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
  for (const row of byPriority.results) priorities[row.priority] = Math.round(row.cents / 100);
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

/* The PTA's student sheet (admin-only): what each classroom and each
   Rocket has raised, one row per student under their class and a
   class-total row after each. Every roster classroom appears, so a
   class with nothing yet shows a zero. */
export async function exportCsv(db) {
  const [credits, uncredited] = await db.batch([
    // Joined so a gift deleted by hand (refund, the go-live wipe)
    // takes its classroom credits with it.
    db.prepare(`SELECT s.donation_id, s.classroom, s.student_name, d.amount_cents
                FROM donation_students s JOIN donations d ON d.id = s.donation_id
                ORDER BY d.created, d.id, s.position`),
    // Family gifts that named no Rocket, so the sheet still adds up to
    // the board. Partnerships are not family fundraising and stay out.
    db.prepare(`SELECT COUNT(*) AS gifts, COALESCE(SUM(amount_cents), 0) AS cents
                FROM donations d WHERE partner_tier = ''
                AND NOT EXISTS (SELECT 1 FROM donation_students s WHERE s.donation_id = d.id)`),
  ]);

  // A gift naming several Rockets counts once for each (as the race
  // does) and splits its dollars evenly, so class totals stay real
  // money; leftover cents go to the first named.
  const rocketsPerGift = {};
  for (const c of credits.results) rocketsPerGift[c.donation_id] = (rocketsPerGift[c.donation_id] || 0) + 1;
  const handedOut = {};
  const rooms = {}; // classroom id -> lowercase name -> { name, gifts, cents }
  for (const c of credits.results) {
    const n = rocketsPerGift[c.donation_id];
    const i = handedOut[c.donation_id] = (handedOut[c.donation_id] || 0) + 1;
    const share = Math.floor(c.amount_cents / n) + (i <= c.amount_cents % n ? 1 : 0);
    // Grandparents and parents spell a kid differently; keep the first
    // spelling seen and merge the rest.
    const name = c.student_name.trim();
    const room = (rooms[c.classroom] ||= {});
    const student = (room[name.toLowerCase()] ||= { name: name || '(no name given)', gifts: 0, cents: 0 });
    student.gifts += 1;
    student.cents += share;
  }

  const cell = (value) => {
    let s = String(value == null ? '' : value);
    // Student names are attacker-supplied and this file's purpose is to
    // be opened in Excel/Sheets — neutralize formula-leading characters.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const dollars = (cents) => (cents / 100).toFixed(2);
  const rows = ['grade,teacher,student,gifts,raised'];
  const line = (...values) => rows.push(values.map(cell).join(','));

  // Roster order, then any classroom the roster no longer lists.
  const known = CLASSROOMS.map((r) => r.id);
  const order = [...known, ...Object.keys(rooms).filter((id) => !known.includes(id))];
  for (const id of order) {
    const room = classroomById(id);
    const grade = room ? room.grade : '';
    const teacher = room ? room.teacher : id;
    const students = Object.entries(rooms[id] || {}).sort(([ka, a], [kb, b]) =>
      (ka === '') - (kb === '') || b.cents - a.cents || b.gifts - a.gifts || a.name.localeCompare(b.name));
    let gifts = 0;
    let cents = 0;
    for (const [, s] of students) {
      line(grade, teacher, s.name, s.gifts, dollars(s.cents));
      gifts += s.gifts;
      cents += s.cents;
    }
    line(grade, teacher, 'Class total', gifts, dollars(cents));
  }
  const rest = uncredited.results[0];
  if (rest.gifts) line('', '', 'No Rocket named', rest.gifts, dollars(rest.cents));
  return '\ufeff' + rows.join('\n') + '\n'; // BOM so Excel reads UTF-8 names
}
