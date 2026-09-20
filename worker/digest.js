/* The Thursday classroom digest: one plain-text email per classroom,
   built from the same numbers Mission Control and the Rally Board
   show, so a teacher can never be told something the board contradicts.

   Student names appear here — that is the point of the email, and it
   goes only to that classroom's own teacher at the address the PTA
   typed in. Nothing in this file reaches a public page. */

import data from '../site/js/data.js';
import { classroomTotals, studentsReport } from './store.js';

const { CLASSROOMS, CAMPAIGN, classroomById, gradeName } = data;

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

/* One classroom's lines. `rows` is that class's slice of the student
   sheet, biggest first, as [grade, teacher, student, gifts, raised]. */
export function digestFor(room, line, rows, leader, asOf) {
  const rockets = line ? line.rockets : 0;
  const cents = line ? line.cents : 0;
  const pct = room.students > 0 ? Math.min(Math.round((rockets / room.students) * 100), 100) : 0;

  const out = [`Hi ${room.teacher},`, ''];
  out.push(`Here's where your class stands in the Rocket Rally as of ${asOf}:`, '');
  out.push(`  Participation: ${pct}% — ${rockets} of ${room.students} Rockets have a gift`);
  out.push(`  Raised so far: ${money(cents)}`);
  if (pct >= 100) {
    out.push(`  You're at 100%: ${PRIZES.at100}`);
  } else if (pct >= 80) {
    const need = toGo(room.students, rockets, 1);
    out.push(`  You've passed 80%, so you've earned ${PRIZES.at80}.`);
    out.push(`  ${need} more Rocket${need === 1 ? '' : 's'} to reach 100%: ${PRIZES.at100}`);
  } else {
    const need = toGo(room.students, rockets, 0.8);
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

  return CLASSROOMS.map((room) => ({
    classroom: room.id,
    teacher: room.teacher,
    subject: `Rocket Rally — ${room.teacher}'s class, ${gradeName(room.grade)}`,
    body: digestFor(room, totals[room.id], byTeacher[room.teacher] || [], leader, asOf),
  }));
}

export { money as digestMoney, CAMPAIGN, classroomById };
