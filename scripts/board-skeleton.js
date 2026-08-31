#!/usr/bin/env node
/* Keeps the Rally Board's static zero-state skeleton in rally-board.html
   in sync with the single source of that markup, boardView(null) in
   site/js/board.js — so the page's first paint has final geometry (no
   layout shift when the deferred scripts run, and a real board for
   no-JS visitors).

     --check  (default; runs from pretest/predeploy) exit 1 on drift
     --write  regenerate the skeleton in place (run after roster edits)

   The page scripts are classic browser scripts, so they are evaluated
   here as concatenated source: data.js skips its CommonJS export guard
   (no `module` in scope) and board.js skips its DOM wiring (no
   `document`), leaving boardView as a pure template function. */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const boardView = new Function(
  read('site/js/data.js') +
  read('site/js/ui.js') +
  read('site/js/board.js') +
  '\nreturn boardView;',
)();

const v = boardView(null);
const sections = { totals: v.totals, race: v.race, roll: v.roll, partners: v.partners };

const htmlPath = 'site/rally-board.html';
const html = read(htmlPath);
let updated = html;
for (const [name, content] of Object.entries(sections)) {
  const open = `<!-- skeleton:${name} -->`;
  const close = `<!-- /skeleton:${name} -->`;
  const re = new RegExp(`${open}[\\s\\S]*?${close}`);
  if (!re.test(updated)) {
    console.error(`board-skeleton: markers ${open}…${close} missing from ${htmlPath}`);
    process.exit(1);
  }
  // A function replacer: a '$' in the baked content stays literal.
  updated = updated.replace(re, () => `${open}${content}${close}`);
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, htmlPath), updated);
  console.log(html === updated
    ? `board-skeleton: ${htmlPath} already up to date`
    : `board-skeleton: ${htmlPath} skeleton regenerated`);
} else if (html !== updated) {
  console.error(`board-skeleton: ${htmlPath} is out of sync with boardView(null) `
    + `in site/js/board.js — run: node scripts/board-skeleton.js --write`);
  process.exit(1);
} else {
  console.log('board-skeleton: in sync');
}
