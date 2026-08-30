/* Donation records in D1. One row per Stripe checkout session (the
   session id is the primary key, so webhook retries are idempotent
   inserts), plus one donation_students row per Rocket the gift
   credits. Student names, email, and the billing contact fields are
   PTA-backend-only: nothing here may select them into campaignStats —
   they leave the database only through the admin export. */

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
   business partnership doesn't inflate "family gifts so far". Accepted
   quirk (decided 2026-08-30): partner dollars carry no priority, so
   the home hero can read higher than the sum of its priority cards —
   the hero shows everything the Rally brings in. */
const totalsStmt = (db) =>
  db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS cents,
    COALESCE(SUM(CASE WHEN partner_tier = '' THEN 1 ELSE 0 END), 0) AS gifts FROM donations`);

const campaignShape = (totals, CAMPAIGN) => ({
  raised: Math.round(totals.results[0].cents / 100),
  goal: CAMPAIGN.goal,
  gifts: totals.results[0].gifts,
});

/* Home-page payload: campaign progress and per-priority totals only —
   no donor rows, so it stays a few hundred bytes for the life of the
   campaign. */
export async function campaignStats(db, { CAMPAIGN }) {
  const [totals, byPriority] = await db.batch([
    totalsStmt(db),
    db.prepare("SELECT priority, SUM(amount_cents) AS cents FROM donations WHERE priority != '' GROUP BY priority"),
  ]);
  const priorities = {};
  for (const row of byPriority.results) priorities[row.priority] = Math.round(row.cents / 100);
  return { campaign: campaignShape(totals, CAMPAIGN), priorities };
}

/* Rally Board payload: campaign progress plus the classroom race and
   the full honor roll (one row per gift, newest first). */
export async function boardStats(db, { CAMPAIGN }) {
  const [totals, byClassroom, roll, partnerRows] = await db.batch([
    totalsStmt(db),
    db.prepare('SELECT classroom, COUNT(*) AS gifts FROM donation_students GROUP BY classroom'),
    db.prepare(`SELECT donor_name, priority, partner_tier, amount_cents, visibility
                FROM donations ORDER BY created DESC, id DESC`),
    db.prepare(`SELECT donor_name, partner_tier, logo_id FROM donations
                WHERE partner_tier != '' AND visibility = 'public' ORDER BY created`),
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

  // Online business partners for the public wall and board strip:
  // name, tier, and the opaque logo id (set once an image is uploaded,
  // cleared to un-publish). The curated data.js roster merges in
  // client-side.
  const partners = partnerRows.results.map((row) => ({
    name: row.donor_name, tier: row.partner_tier, logo: row.logo_id || '',
  }));

  return { campaign: campaignShape(totals, CAMPAIGN), classrooms, donors, partners };
}

/* Full records for the PTA (admin-only): the backend view where student
   names and emails are allowed to appear. */
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
    'partner_tier', 'students', 'donor_name', 'visibility', 'email',
    'billing_name', 'address_line1', 'address_line2', 'city', 'state',
    'postal_code', 'country', 'employer_match', 'via_link'];
  const rows = [header.join(',')];
  for (const r of gifts.results) {
    rows.push([
      r.id,
      new Date((r.created || 0) * 1000).toISOString(),
      (r.amount_cents / 100).toFixed(2),
      ((r.fee_cents || 0) / 100).toFixed(2),
      r.priority, r.partner_tier, (studentsByGift[r.id] || []).join('; '), r.donor_name,
      r.visibility, r.email, r.billing_name,
      r.address_line1, r.address_line2, r.city, r.state, r.postal_code,
      r.country, r.employer_match ? 'yes' : 'no', r.via_link ? 'yes' : 'no',
    ].map(cell).join(','));
  }
  return '\ufeff' + rows.join('\n') + '\n'; // BOM so Excel reads UTF-8 names
}
