import { describe, it, expect } from 'vitest';
import { normalizeStudents, studentsSignature } from '../worker/students.js';
import data from '../site/js/data.js';

describe('normalizeStudents', () => {
  it('keeps valid rows in order, trims names, skips untouched rows', () => {
    expect(normalizeStudents([
      { c: 'convery', n: '  Mia Rodriguez ' },
      { c: '', n: '' },
      { c: 'zweber', n: '' },
    ])).toEqual({ students: [{ c: 'convery', n: 'Mia Rodriguez' }, { c: 'zweber', n: '' }] });
  });

  it('treats a missing list as no students and a non-list as an error', () => {
    expect(normalizeStudents(undefined)).toEqual({ students: [] });
    expect(normalizeStudents('nope').error).toBeTruthy();
  });

  it('collapses a named student listed twice, but never nameless rows', () => {
    const { students } = normalizeStudents([
      { c: 'convery', n: 'Mia' }, { c: 'convery', n: 'mia' },
      { c: 'zweber', n: '' }, { c: 'zweber', n: '' },
    ]);
    expect(students).toEqual([
      { c: 'convery', n: 'Mia' }, { c: 'zweber', n: '' }, { c: 'zweber', n: '' },
    ]);
  });

  it('rejects a name without a classroom, an unknown classroom, a long name, too many rows', () => {
    expect(normalizeStudents([{ c: '', n: 'Mia' }]).error).toMatch(/classroom/);
    expect(normalizeStudents([{ c: 'r99', n: 'Mia' }]).error).toMatch(/classroom/);
    expect(normalizeStudents([{ c: 'convery', n: 'x'.repeat(81) }]).error).toMatch(/shorter/);
    const five = Array.from({ length: 5 }, (_, i) => ({ c: 'convery', n: `Kid ${i}` }));
    expect(normalizeStudents(five).error).toMatch(/up to 4/);
    expect(data.MAX_STUDENTS).toBe(4);
  });

  it('requires a name for every row when asked (links)', () => {
    expect(normalizeStudents([{ c: 'zweber', n: '' }], { nameRequired: true }).error).toMatch(/name/);
    expect(normalizeStudents([{ c: 'zweber', n: 'Leo' }], { nameRequired: true }))
      .toEqual({ students: [{ c: 'zweber', n: 'Leo' }] });
  });
});

describe('studentsSignature', () => {
  it('ignores order and case, but not classroom', () => {
    const a = studentsSignature([{ c: 'zweber', n: 'Leo Park' }, { c: 'convery', n: 'Mia' }]);
    const b = studentsSignature([{ c: 'convery', n: 'MIA' }, { c: 'zweber', n: 'leo park' }]);
    expect(a).toBe(b);
    expect(a).not.toBe(studentsSignature([{ c: 'harrison', n: 'Leo Park' }, { c: 'convery', n: 'Mia' }]));
  });
});
