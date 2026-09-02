#!/usr/bin/env node
/* Audit every public page with Lighthouse and print a score table.
   Usage: node scripts/lighthouse.mjs [--url <base>] [--runs N] [--min S]
                                      [--form mobile|desktop|both] [--page <slug>]
   Defaults: the live site, one run, both form factors, every page in
   site/ (slug = file stem, "home" for index; the 404 is skipped),
   report only. --runs N scores each page by the median of N runs
   (absorbs runner noise; the per-run scores print when they differ,
   and the saved report is the run at the performance median); --min S
   fails the process when any median lands below S. CI runs it against
   `wrangler dev` with --runs 3 --min 98. */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import lighthouse, { desktopConfig } from 'lighthouse';
import { launch } from 'chrome-launcher';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'https://rocketrally.org' },
    runs: { type: 'string', default: '1' },
    min: { type: 'string' },
    form: { type: 'string', default: 'both' },
    page: { type: 'string' },
  },
});
const base = (positionals[0] || opts.url).replace(/\/$/, '');
const runs = Number(opts.runs);
const min = opts.min === undefined ? null : Number(opts.min);
const forms = opts.form === 'both' ? ['mobile', 'desktop'] : [opts.form];

// The pages are the HTML files; the worker renders whatever is there.
const PAGES = readdirSync(new URL('../site/', import.meta.url))
  .filter((f) => f.endsWith('.html') && f !== '404.html')
  .map((f) => f.slice(0, -5))
  .map((stem) => (stem === 'index' ? ['home', '/'] : [stem, `/${stem}`]))
  .filter(([name]) => !opts.page || name === opts.page);
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
const out = 'lighthouse-reports';
mkdirSync(out, { recursive: true });

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const score = (lhr, c) => Math.round((lhr.categories[c].score ?? 0) * 100);

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
let failed = false;
try {
  for (const form of forms) {
    for (const [name, path] of PAGES) {
      const results = [];
      for (let i = 0; i < runs; i++) {
        const { lhr, report } = await lighthouse(`${base}${path}`, {
          port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: CATEGORIES,
        }, form === 'desktop' ? desktopConfig : undefined);
        results.push({ lhr, report });
      }
      // Performance is the only category that varies between runs, so
      // the saved report is the run at its median.
      const byPerf = [...results].sort((a, b) => score(a.lhr, 'performance') - score(b.lhr, 'performance'));
      const kept = byPerf[Math.floor(results.length / 2)];
      writeFileSync(`${out}/${name}-${form}.report.html`, kept.report[0]);
      writeFileSync(`${out}/${name}-${form}.report.json`, kept.report[1]);
      let bad = false;
      const cells = CATEGORIES.map((c) => {
        const all = results.map((r) => score(r.lhr, c));
        const m = median(all);
        if (min !== null && m < min) bad = true;
        const spread = new Set(all).size > 1 ? ` (${all.join('/')})` : '';
        return `${c} ${m}${spread}`;
      });
      failed ||= bad;
      console.log(`${name}-${form}`.padEnd(18) + cells.join('  ') + (bad ? '  FAIL' : ''));
    }
  }
} finally {
  await chrome.kill();
}
console.log(`HTML reports in ${out}/`);
if (failed) {
  console.error(`Lighthouse gate: a score is below ${min}.`);
  process.exit(1);
}
