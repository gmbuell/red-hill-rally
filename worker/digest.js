/* The Thursday classroom digest: one plain-text email per classroom,
   built from the same numbers Mission Control and the Rally Board
   show, so a teacher can never be told something the board contradicts.

   Student names appear here — that is the point of the email, and it
   goes only to that classroom's own teacher at the address the PTA
   typed in. Nothing in this file reaches a public page. */

import data from '../site/js/data.js';
import ui from '../site/js/ui.js';
import { classroomTotals, studentsReport } from './store.js';

const { CLASSROOMS, CAMPAIGN, SHIRT, classroomById, gradeName, shirtsOpen } = data;
const { html } = ui;

/* Where a teacher writes back. The shirt-for-a-child offer is the one
   line on the sheet that asks for a reply, so it names the Rally's own
   address rather than "the PTA". */
const RALLY_EMAIL = 'rocketrally@redhillpta.org';

/* The classroom prizes, in the words /prizes uses. Change them there
   and here together. */
export const PRIZES = {
  at80: '$150 for your classroom wishlist, plus extra recess',
  at100: '$250 for your wishlist, plus an ice cream party',
  top: 'the Golden Shoe, $500 for the wishlist, and a pizza, ice cream and pajama party',
};

const money = (cents) => '$' + Math.round(cents / 100).toLocaleString('en-US');

/* Rockets to go before a threshold, never negative. */
const toGo = (size, rockets, pct) => Math.max(Math.ceil(size * pct) - rockets, 0);

/* One classroom's standing, decided once. The email below and the
   printable recap sheet both render this, so a teacher reading the
   paper copy and the same teacher reading the email can never be shown
   two different numbers. */
export function digestFacts(room, line, rows, leader, asOf) {
  const rockets = line ? line.rockets : 0;
  const cents = line ? line.cents : 0;
  const pct = room.students > 0 ? Math.min(Math.round((rockets / room.students) * 100), 100) : 0;
  const tier = pct >= 100 ? 'at100' : pct >= 80 ? 'at80' : 'under80';
  return {
    room, asOf, rockets, cents, pct, tier, rows,
    // What it takes to reach the next prize, and none at 100%.
    need: tier === 'at100' ? 0 : toGo(room.students, rockets, tier === 'at80' ? 1 : 0.8),
    leader: leader ? { ...leader, isYou: leader.id === room.id } : null,
  };
}

/* One classroom's lines. `rows` is that class's slice of the student
   sheet, biggest first, as [grade, teacher, student, gifts, raised]. */
export function digestFor(room, line, rows, leader, asOf) {
  const f = digestFacts(room, line, rows, leader, asOf);
  const { pct, rockets, cents, need } = f;

  const out = [`Hi ${room.teacher},`, ''];
  out.push(`Here's where your class stands in the Rocket Rally as of ${asOf}:`, '');
  out.push(`  Participation: ${pct}% — ${rockets} of ${room.students} Rockets have a gift`);
  out.push(`  Raised so far: ${money(cents)}`);
  if (f.tier === 'at100') {
    out.push(`  You're at 100%: ${PRIZES.at100}`);
  } else if (f.tier === 'at80') {
    out.push(`  You've passed 80%, so you've earned ${PRIZES.at80}.`);
    out.push(`  ${need} more Rocket${need === 1 ? '' : 's'} to reach 100%: ${PRIZES.at100}`);
  } else {
    out.push(`  ${need} more Rocket${need === 1 ? '' : 's'} to reach 80% and earn ${PRIZES.at80}`);
  }
  out.push('');

  if (rows.length) {
    out.push('Your Rockets so far:');
    for (const [, , student, gifts, raised] of rows) {
      const n = Number(gifts);
      out.push(`  ${student} — $${Math.round(Number(raised)).toLocaleString('en-US')} (${n} gift${n === 1 ? '' : 's'})`);
    }
  } else {
    out.push('No gifts in your class yet. One gift of any size puts you on the board.');
  }
  out.push('');

  if (leader && leader.id === room.id) {
    out.push(`Your class is leading the Top Class prize right now at ${money(leader.cents)} — ${PRIZES.top}.`);
  } else if (leader) {
    out.push(`Leading the Top Class prize (${PRIZES.top}): ${leader.teacher}'s class at ${money(leader.cents)}.`);
  }
  out.push('');
  out.push('A gift of any size counts the same toward participation, and a Rally shirt counts too.');
  out.push('Families can give at rocketrally.org, and the live standings are at rocketrally.org/rally-board.');
  out.push('');
  out.push('Thank you for rallying with us,');
  out.push('Red Hill Elementary PTA');
  return out.join('\n');
}

/* Every roster classroom's email, whether or not it has an address —
   the caller decides what to do with the ones it can't send. Classes
   with nothing yet are included on purpose: those are the rooms the
   nudge is for. */
export async function buildDigests(db, nowMs) {
  const [totals, students] = await Promise.all([
    classroomTotals(db),
    studentsReport(db),
  ]);
  const asOf = new Date(nowMs).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  // The Top Class race, decided on dollars like the board says.
  let leader = null;
  for (const room of CLASSROOMS) {
    const cents = (totals[room.id] || {}).cents || 0;
    if (cents > 0 && (!leader || cents > leader.cents)) {
      leader = { id: room.id, teacher: room.teacher, cents };
    }
  }

  const byTeacher = {};
  for (const row of students.rows) {
    const teacher = row[1];
    if (!teacher) continue; // the "No Rocket named" tail
    (byTeacher[teacher] ||= []).push(row);
  }

  return CLASSROOMS.map((room) => {
    const rows = byTeacher[room.teacher] || [];
    return {
      classroom: room.id,
      teacher: room.teacher,
      subject: `Rocket Rally — ${room.teacher}'s class, ${gradeName(room.grade)}`,
      body: digestFor(room, totals[room.id], rows, leader, asOf),
      facts: digestFacts(room, totals[room.id], rows, leader, asOf),
    };
  });
}

/* ---- the printable recap ------------------------------------------------

   The same standing as the email, set as a handout: one classroom per
   printed page, for the weeks the PTA sends these by hand rather than
   letting the Thursday job do it. It is a whole document, downloaded
   and opened off the site, so it carries its own styles. */

const dollars = (raised) => '$' + Math.round(Number(raised)).toLocaleString('en-US');

const sheet = ({ room, asOf, rockets, cents, pct, tier, need, rows, leader }) => html`
  <section class="recap">
    <header>
      <p class="eyebrow">Rocket Rally &middot; as of ${asOf}</p>
      <h1>${room.teacher}<span>${gradeName(room.grade)}</span></h1>
    </header>
    <div class="note">
      <p>Hi ${room.teacher}, here&rsquo;s the latest for your class.</p>
      <p>Reach <strong>80% participation</strong> and your class earns ${PRIZES.at80}. Reach <strong>100%</strong> and it&rsquo;s ${PRIZES.at100}. The class that raises the most takes ${PRIZES.top}.</p>
      <p>Anything you can do to nudge your families helps. A <strong>$1 gift counts toward participation exactly like a big one</strong>${shirtsOpen()
        ? html`, and buying a Rally shirt counts too, so your whole class can match on Rally day. Shirt orders close <strong>${SHIRT.deadlineLabel}</strong>.`
        : html`.`}</p>
      ${shirtsOpen() ? html`<p>We don&rsquo;t want any child left out. If there&rsquo;s a student you think the PTA should simply buy a shirt for, email <strong>${RALLY_EMAIL}</strong> and we&rsquo;ll take care of it quietly.</p>` : ''}
    </div>
    <div class="figures">
      <div class="figure">
        <strong>${pct}%</strong>
        <span>participation</span>
        <small>${rockets} of ${room.students} Rockets have a gift</small>
      </div>
      <div class="figure">
        <strong>${money(cents)}</strong>
        <span>raised</span>
        <small>every gift counts, any size</small>
      </div>
    </div>
    <p class="next">${tier === 'at100'
      ? html`Your class is at <strong>100%</strong> &mdash; ${PRIZES.at100}.`
      : tier === 'at80'
        ? html`You&rsquo;ve passed 80%, so you&rsquo;ve earned ${PRIZES.at80}. <strong>${need} more Rocket${need === 1 ? '' : 's'}</strong> reaches 100%: ${PRIZES.at100}.`
        : html`<strong>${need} more Rocket${need === 1 ? '' : 's'}</strong> to reach 80% and earn ${PRIZES.at80}.`}</p>
    ${rows.length ? html`
      <h2>Your Rockets so far</h2>
      <ul class="rockets">
        ${rows.map(([, , student, gifts, raised]) => html`
          <li><span class="who">${student}</span><span class="amt">${dollars(raised)} <small>(${Number(gifts)} gift${Number(gifts) === 1 ? '' : 's'})</small></span></li>`)}
      </ul>`
      : html`<p class="empty">No gifts in your class yet. One gift of any size puts you on the board.</p>`}
    ${leader ? html`<p class="leader">${leader.isYou
      ? html`Your class is leading the Top Class prize right now at <strong>${money(leader.cents)}</strong> &mdash; ${PRIZES.top}.`
      : html`Leading the Top Class prize: <strong>${leader.teacher}&rsquo;s class</strong> at ${money(leader.cents)} &mdash; ${PRIZES.top}.`}</p>` : ''}
    <p class="foot">Families can give at <strong>rocketrally.org</strong>, and the live standings are at <strong>rocketrally.org/rally-board</strong>. A Rally shirt counts too.</p>
  </section>`;

export const recapSheets = (digests, asOf) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Rocket Rally class recaps${asOf ? ` — ${asOf}` : ''}</title>
<meta name="robots" content="noindex">
<style>
  :root { --navy: #0C2340; --red: #C81419; --grey: #5A6472; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--navy);
  }
  .recap { padding: 2.5rem 2.5rem 2rem; max-width: 7.5in; margin: 0 auto; }
  /* One classroom per sheet of paper. The last one must not push out a
     blank page, which is what a trailing break would do. */
  .recap + .recap { border-top: 1px solid #DDE1E6; }
  @media print {
    .recap { page-break-after: always; break-after: page; padding: 0.4in 0 0; border-top: 0; }
    .recap:last-child { page-break-after: auto; break-after: auto; }
  }
  .eyebrow { margin: 0 0 0.2rem; font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--grey); }
  h1 { margin: 0 0 1.2rem; font-size: 1.9rem; line-height: 1.15; }
  h1 span { display: block; font-size: 0.95rem; font-weight: 400; color: var(--grey); letter-spacing: 0.04em; text-transform: uppercase; }
  .figures { display: flex; gap: 1rem; margin-bottom: 1.2rem; }
  .figure { flex: 1; padding: 0.9rem 1rem; border: 2px solid var(--navy); border-radius: 10px; }
  .figure strong { display: block; font-size: 2.1rem; line-height: 1.1; }
  .figure span { display: block; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--grey); }
  .figure small { display: block; margin-top: 0.35rem; font-size: 0.85rem; color: var(--grey); }
  .note { margin-bottom: 1.3rem; }
  .note p { margin: 0 0 0.6rem; }
  .note strong { color: var(--navy); }
  .next { margin: 0 0 1.4rem; padding: 0.8rem 1rem; background: #F2F5F8; border-radius: 8px; }
  .next strong, .leader strong { color: var(--red); }
  h2 { margin: 0 0 0.5rem; font-size: 1rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--grey); }
  .rockets { margin: 0 0 1.2rem; padding: 0; list-style: none; }
  .rockets li { display: flex; justify-content: space-between; gap: 1rem; padding: 0.3rem 0; border-bottom: 1px solid #EDEFF2; }
  .rockets small { color: var(--grey); }
  .empty, .leader { margin: 0 0 1.2rem; }
  .foot { margin: 0; font-size: 0.9rem; color: var(--grey); }
</style>
${digests.map((d) => sheet(d.facts)).join('\n')}
</html>
`;

export { money as digestMoney, CAMPAIGN, classroomById };
