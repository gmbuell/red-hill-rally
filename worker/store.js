/* Donation records in D1. One row per Stripe checkout session (the
   session id is the primary key, so webhook retries are idempotent
   inserts). student_name, email, and the billing contact fields are
   PTA-backend-only: nothing here may select them into campaignStats —
   they leave the database only through the admin export. */

import data from '../site/js/data.js';

const { priorityById } = data;

export async function recordDonation(db, session, createdSec) {
  const md = session.metadata || {};
  const cd = session.customer_details || {};
  const addr = cd.address || {};
  await db.prepare(`
    INSERT INTO donations
      (id, amount_cents, priority, classroom, student_name, donor_name,
       visibility, email, employer_match, via_link, created,
       billing_name, address_line1, address_line2, city, state,
       postal_code, country)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
            ?12, ?13, ?14, ?15, ?16, ?17, ?18)
    ON CONFLICT(id) DO NOTHING`)
    .bind(
      session.id,
      session.amount_total || 0,
      md.priority || '',
      md.classroom || '',
      md.student_name || '',
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
    )
    .run();
}

const totalsStmt = (db) =>
  db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS cents, COUNT(*) AS gifts FROM donations');

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
  const [totals, byClassroom, roll] = await db.batch([
    totalsStmt(db),
    db.prepare("SELECT classroom, COUNT(*) AS gifts FROM donations WHERE classroom != '' GROUP BY classroom"),
    db.prepare(`SELECT donor_name, priority, amount_cents, visibility
                FROM donations ORDER BY created DESC, id DESC`),
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
    };
  });

  return { campaign: campaignShape(totals, CAMPAIGN), classrooms, donors };
}

/* Full records for the PTA (admin-only): the backend view where student
   names and emails are allowed to appear. */
export async function exportCsv(db) {
  const { results } = await db.prepare('SELECT * FROM donations ORDER BY created, id').all();
  const cell = (value) => {
    let s = String(value == null ? '' : value);
    // Donor/student names are attacker-supplied and this file's purpose is
    // to be opened in Excel/Sheets — neutralize formula-leading characters.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['id', 'date', 'amount_dollars', 'priority', 'classroom',
    'student_name', 'donor_name', 'visibility', 'email', 'billing_name',
    'address_line1', 'address_line2', 'city', 'state', 'postal_code',
    'country', 'employer_match', 'via_link'];
  const rows = [header.join(',')];
  for (const r of results) {
    rows.push([
      r.id,
      new Date((r.created || 0) * 1000).toISOString(),
      (r.amount_cents / 100).toFixed(2),
      r.priority, r.classroom, r.student_name, r.donor_name,
      r.visibility, r.email, r.billing_name,
      r.address_line1, r.address_line2, r.city, r.state, r.postal_code,
      r.country, r.employer_match ? 'yes' : 'no', r.via_link ? 'yes' : 'no',
    ].map(cell).join(','));
  }
  return '\ufeff' + rows.join('\n') + '\n'; // BOM so Excel reads UTF-8 names
}
