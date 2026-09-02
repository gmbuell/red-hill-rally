#!/usr/bin/env node
/* Keeps the zero-state markup baked into the page HTML in sync with
   its single source, each page's view function — homeView(0, {}),
   donateView(), boardView(null), partnersView(null), linkView() — so
   the page's first paint has final geometry (no layout shift when the
   deferred scripts run) and no-JS visitors see a real page. A view's
   keys are the page's skeleton sections; each needs a marker pair in
   the HTML.

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

const { homeView, donateView, boardView, partnersView, linkView } = new Function(
  ['data', 'ui', 'home', 'donate', 'board', 'partners', 'student-link'].map((f) => read(`site/js/${f}.js`)).join('\n') +
  '\nreturn { homeView, donateView, boardView, partnersView, linkView };',
)();

const pages = [
  ['site/index.html', homeView(0, {})],
  ['site/donate.html', donateView()],
  ['site/rally-board.html', boardView(null)],
  ['site/partners.html', partnersView(null)],
  ['site/student-link.html', linkView()],
];

const write = process.argv.includes('--write');
let drift = false;
for (const [htmlPath, sections] of pages) {
  const html = read(htmlPath);
  let updated = html;
  for (const [name, content] of Object.entries(sections)) {
    const open = `<!-- skeleton:${name} -->`;
    const close = `<!-- /skeleton:${name} -->`;
    const start = updated.indexOf(open);
    const end = start < 0 ? -1 : updated.indexOf(close, start);
    if (end < 0) {
      console.error(`skeleton: markers ${open}…${close} missing from ${htmlPath}`);
      process.exit(1);
    }
    updated = updated.slice(0, start + open.length) + content + updated.slice(end);
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
