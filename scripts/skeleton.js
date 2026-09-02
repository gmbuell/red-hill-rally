#!/usr/bin/env node
/* Keeps the zero-state markup baked into the page HTML in sync with
   its single source in the page scripts — boardView(null), homeView(0, {}),
   partnersView(null), linkView(), and RH.priorityOptions() — so each
   page's first paint has final geometry (no layout shift when the
   deferred scripts run) and no-JS visitors see a real page.

     --check  (default; runs from pretest/predeploy) exit 1 on drift
     --write  regenerate the skeletons in place (run after editing the
              roster, partners, or priorities in data.js, or a page's
              view function / a ui.js template)

   The page scripts are classic browser scripts, so they are evaluated
   here as concatenated source: data.js skips its CommonJS export guard
   (no `module` in scope) and each page script skips its DOM wiring (no
   `document`), leaving the view functions pure. */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const { boardView, homeView, partnersView, linkView, RH } = new Function(
  ['data', 'ui', 'board', 'home', 'partners', 'student-link'].map((f) => read(`site/js/${f}.js`)).join('\n') +
  '\nreturn { boardView, homeView, partnersView, linkView, RH };',
)();

const board = boardView(null);
const home = homeView(0, {});
const partners = partnersView(null);
const pages = [
  ['site/index.html', { trajectory: home.trajectory, cards: home.cards }],
  ['site/donate.html', { priorities: RH.priorityOptions() }],
  ['site/rally-board.html', { totals: board.totals, race: board.race, roll: board.roll, partners: board.partners }],
  ['site/partners.html', { tiers: partners.tiers, wall: partners.wall }],
  ['site/student-link.html', { rows: linkView().rows }],
];

const write = process.argv.includes('--write');
let drift = false;
for (const [htmlPath, sections] of pages) {
  const html = read(htmlPath);
  let updated = html;
  for (const [name, content] of Object.entries(sections)) {
    const open = `<!-- skeleton:${name} -->`;
    const close = `<!-- /skeleton:${name} -->`;
    const re = new RegExp(`${open}[\\s\\S]*?${close}`);
    if (!re.test(updated)) {
      console.error(`skeleton: markers ${open}…${close} missing from ${htmlPath}`);
      process.exit(1);
    }
    // A function replacer: a '$' in the baked content stays literal.
    updated = updated.replace(re, () => `${open}${content}${close}`);
  }
  if (html === updated) continue;
  drift = true;
  if (write) {
    fs.writeFileSync(path.join(root, htmlPath), updated);
    console.log(`skeleton: ${htmlPath} regenerated`);
  } else {
    console.error(`skeleton: ${htmlPath} is out of sync with its template — run: node scripts/skeleton.js --write`);
  }
}
if (!drift) console.log(write ? 'skeleton: already up to date' : 'skeleton: in sync');
else if (!write) process.exit(1);
