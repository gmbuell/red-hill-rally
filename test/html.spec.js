import { describe, it, expect } from 'vitest';
import ui from '../site/js/ui.js';
import data from '../site/js/data.js';

const { html, raw, studentRowsMarkup, LINK_ROWS } = ui;

describe('html tag', () => {
  it('escapes interpolated strings', () => {
    expect(String(html`<b>${'<i>&"\'</i>'}</b>`)).toBe('<b>&lt;i&gt;&amp;&quot;&#39;&lt;/i&gt;</b>');
  });
  it('passes nested fragments and arrays through unescaped', () => {
    expect(String(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`)).toBe('<ul><li>1</li><li>2</li></ul>');
  });
  it('drops null, undefined, and false', () => {
    expect(String(html`a${null}b${undefined}c${false}d`)).toBe('abcd');
  });
  it('trusts raw markup', () => {
    expect(String(html`${raw('<em>x</em>')}`)).toBe('<em>x</em>');
  });
  it('renders a student row with every classroom and typographic copy', () => {
    const row = String(studentRowsMarkup([{ c: '', n: '' }], LINK_ROWS));
    for (const c of data.CLASSROOMS) expect(row).toContain(`<option value="${c.id}">`);
    expect(row).toContain('student’s name');
    expect(row).not.toContain('&amp;');
    expect(row).not.toContain('remove-student');
  });
});
