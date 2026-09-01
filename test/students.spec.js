import { describe, it, expect } from 'vitest';
import { normalizeStudents, studentsSignature } from '../worker/students.js';
import data from '../site/js/data.js';

/* Any three distinct classrooms — the tests pin mechanics, not the roster. */
const [ROOM_A, ROOM_B, ROOM_C] = data.CLASSROOMS.map((c) => c.id);

describe('normalizeStudents', () => {
  it('keeps valid rows in order, trims names, skips untouched rows', () => {
    expect(normalizeStudents([
      { c: ROOM_A, n: '  Mia Rodriguez ' },
      { c: '', n: '' },
      { c: ROOM_B, n: '' },
    ])).toEqual({ students: [{ c: ROOM_A, n: 'Mia Rodriguez' }, { c: ROOM_B, n: '' }] });
  });

  it('treats a missing list as no students and a non-list as an error', () => {
    expect(normalizeStudents(undefined)).toEqual({ students: [] });
    expect(normalizeStudents('nope').error).toBeTruthy();
  });

  it('collapses a student listed twice — by name, or nameless in one class', () => {
    // One gift adds at most one credit per classroom per Rocket; a
    // classroom repeated without names counts once (two nameless
    // twins can be told apart by typing their names).
    const { students } = normalizeStudents([
      { c: ROOM_A, n: 'Mia' }, { c: ROOM_A, n: 'mia' },
      { c: ROOM_B, n: '' }, { c: ROOM_B, n: '' }, { c: ROOM_C, n: '' },
    ]);
    expect(students).toEqual([
      { c: ROOM_A, n: 'Mia' }, { c: ROOM_B, n: '' }, { c: ROOM_C, n: '' },
    ]);
  });

  it('rejects a name without a classroom, an unknown classroom, a long name, too many rows', () => {
    expect(normalizeStudents([{ c: '', n: 'Mia' }]).error).toMatch(/classroom/);
    expect(normalizeStudents([{ c: 'not-a-room', n: 'Mia' }]).error).toMatch(/classroom/);
    expect(normalizeStudents([{ c: ROOM_A, n: 'x'.repeat(data.MAX_NAME + 1) }]).error).toMatch(/shorter/);
    const tooMany = Array.from({ length: data.MAX_STUDENTS + 1 }, (_, i) => ({ c: ROOM_A, n: `Kid ${i}` }));
    expect(normalizeStudents(tooMany).error).toMatch(new RegExp(`up to ${data.MAX_STUDENTS}`));
  });

  it('requires a name for every row when asked (links)', () => {
    expect(normalizeStudents([{ c: ROOM_B, n: '' }], { nameRequired: true }).error).toMatch(/name/);
    expect(normalizeStudents([{ c: ROOM_B, n: 'Leo' }], { nameRequired: true }))
      .toEqual({ students: [{ c: ROOM_B, n: 'Leo' }] });
  });
});

describe('studentsSignature', () => {
  it('ignores order and case, but not classroom', () => {
    const a = studentsSignature([{ c: ROOM_B, n: 'Leo Park' }, { c: ROOM_A, n: 'Mia' }]);
    const b = studentsSignature([{ c: ROOM_A, n: 'MIA' }, { c: ROOM_B, n: 'leo park' }]);
    expect(a).toBe(b);
    expect(a).not.toBe(studentsSignature([{ c: ROOM_C, n: 'Leo Park' }, { c: ROOM_A, n: 'Mia' }]));
  });
});
