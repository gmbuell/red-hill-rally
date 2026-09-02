#!/usr/bin/env node
/* WCAG 2.2 checks on every public page, mobile and desktop.
   Usage: node scripts/wcag.mjs [--url <base>] [--form mobile|desktop|both] [--page <slug>]
   Defaults: the live site, both form factors, every page in site/ (slug
   = file stem, "home" for index; the 404 is skipped). Exits 1 when any
   page fails a check. CI runs it against `wrangler dev` seeded with the
   demo donations, so the board and partner wall carry real rows.

   Each page is loaded as a visitor first sees it, then every [hidden]
   element is revealed so later panels get checked too. Markup that
   appears after a click (the amount buttons, student rows) and text
   that is empty or display:none until something goes wrong (field and
   form errors) is out of scope.

   Checks:
   - text contrast (SC 1.4.3): axe-core's color-contrast rule
   - target size (SC 2.5.8): axe-core's target-size rule, 24×24 CSS px
     with the spacing and inline exceptions
   - non-text contrast (SC 1.4.11): a control drawn as a box (a button
     or .btn link with a background or border, any text input or
     select) has that background or border at 3:1 against what
     surrounds it; a text-only button is identified by its text, which
     the text-contrast check covers
   - focus (SC 1.4.11): every element the Tab key reaches shows a focus
     outline at 3:1 against its surroundings
   - text spacing: body text has a line-height of at least 1.5
   - minimum sizes: body text is 16px or larger; labels and captions
     are 13px or larger

   Body text is text in paragraphs, list items, table cells, and
   blockquotes. Anything else is a label or caption, and so is text in
   <small>, form labels, legends, figcaptions, table headings, nav, and
   controls, wherever it sits: a caption inside a list item is a <small>.
   Headings and display text at 24px or larger (bold: 18.66px) are
   exempt from both.

   Each check reports how many elements it examined and fails when that
   is zero, so a page that renders nothing, or a tab walk that finds no
   focusable element, cannot pass by accident. */
import { readFileSync, readdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { launch } from 'chrome-launcher';
import puppeteer from 'puppeteer-core';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string', default: 'https://rocketrally.org' },
    form: { type: 'string', default: 'both' },
    page: { type: 'string' },
  },
});
const base = (positionals[0] || opts.url).replace(/\/$/, '');
const forms = opts.form === 'both' ? ['mobile', 'desktop'] : [opts.form];

// The pages are the HTML files; the worker renders whatever is there.
const PAGES = readdirSync(new URL('../site/', import.meta.url))
  .filter((f) => f.endsWith('.html') && f !== '404.html')
  .map((f) => f.slice(0, -5))
  .map((stem) => (stem === 'index' ? ['home', '/'] : [stem, `/${stem}`]))
  .filter(([name]) => !opts.page || name === opts.page);

// Lighthouse's emulated devices, so both gates see the same layouts.
const VIEWPORTS = {
  mobile: { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  desktop: { width: 1350, height: 940, deviceScaleFactor: 1 },
};
const CHECKS = ['text-contrast', 'target-size', 'non-text', 'focus', 'leading', 'size'];

const LABEL_SELECTOR = 'small, label, legend, figcaption, caption, th, sup, sub, nav, button, input, select, textarea';
const BODY_SELECTOR = 'p, li, dd, dt, td, blockquote';

const axeSource = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

// Injected into the page as window.wcag: color math shared by the
// in-page functions below.
function helpers() {
  const parse = (color) => {
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  // The background an element sits on: ancestors' colors composited
  // bottom-up. null when an ancestor paints an image or gradient.
  const surroundings = (el) => {
    const layers = [];
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.unshift(c);
        if (c.a === 1) break;
      }
    }
    return layers.reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : '';
    const text = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return `<${el.tagName.toLowerCase()}${id}${cls}>${text ? ` “${text}”` : ''}`;
  };
  window.wcag = { parse, contrast, over, surroundings, describe };
}

// Runs in the page. Returns { check: [message, ...] } for the custom
// checks plus how many elements each one examined; axe runs separately.
function inspect({ labelSelector, bodySelector }) {
  const { parse, contrast, over, surroundings, describe } = window.wcag;
  const found = { 'non-text': [], leading: [], size: [] };
  const examined = { 'non-text': 0, leading: 0, size: 0 };
  const report = (check, el, msg) => found[check].push(`${describe(el)}: ${msg}`);
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const hiddenFromAT = (el) => el.closest('[aria-hidden="true"]') !== null;

  // Non-text: control boundaries.
  const controls = 'button, input, select, textarea, a.btn, .btn, [role="button"]';
  for (const el of document.querySelectorAll(controls)) {
    if (!visible(el) || hiddenFromAT(el)) continue;
    const cs = getComputedStyle(el);
    // The browser draws these; their boundary is not in computed style.
    if (el.matches('input') && (el.type === 'file' || (['checkbox', 'radio', 'range'].includes(el.type) && cs.appearance !== 'none'))) continue;
    const around = surroundings(el);
    if (!around) continue;
    const bg = parse(cs.backgroundColor);
    const boxed = bg && bg.a > 0;
    const bgRatio = boxed ? contrast(over(bg, around), around) : 0;
    let borderRatio = 0;
    let bordered = false;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (cs[`border${side}Style`] === 'none' || parseFloat(cs[`border${side}Width`]) < 1) continue;
      const c = parse(cs[`border${side}Color`]);
      if (!c || c.a === 0) continue;
      bordered = true;
      borderRatio = Math.max(borderRatio, contrast(over(c, around), around));
    }
    // A button drawn as plain text is identified by that text.
    if (!boxed && !bordered && !el.matches('input, select, textarea')) continue;
    examined['non-text'] += 1;
    const best = Math.max(bgRatio, borderRatio);
    if (best < 3) {
      report('non-text', el, `boundary contrast ${best.toFixed(2)}:1 (background ${bgRatio.toFixed(2)}, border ${borderRatio.toFixed(2)})`);
    }
  }

  // Leading and sizes, per element that holds text.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const holders = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (t.data.trim() && t.parentElement) holders.add(t.parentElement);
  }
  for (const el of holders) {
    if (el.closest('script, style, noscript, svg') || hiddenFromAT(el) || !visible(el)) continue;
    if (el.closest('h1, h2, h3, h4, h5, h6, [role="heading"]')) continue;
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    if (px >= 24 || (bold && px >= 18.66)) continue;
    const body = el.closest(labelSelector) === null && el.closest(bodySelector) !== null;
    const floor = body ? 16 : 13;
    examined.size += 1;
    if (px < floor) report('size', el, `${px.toFixed(2)}px ${body ? 'body' : 'label'} text (minimum ${floor}px)`);
    if (body) {
      examined.leading += 1;
      const lh = cs.lineHeight === 'normal' ? 1.2 * px : parseFloat(cs.lineHeight);
      const ratio = lh / px;
      if (ratio < 1.5 - 0.005) report('leading', el, `line-height ${ratio.toFixed(2)} (minimum 1.5)`);
    }
  }
  return { found, examined };
}

// Runs in the page after each Tab press: the focused element's outline
// against what surrounds it. done once focus returns to the body or to
// an element already seen (the tab ring has cycled); examined when a
// comparison was made.
function focusRing() {
  const { parse, contrast, surroundings, describe } = window.wcag;
  const el = document.activeElement;
  if (!el || el === document.body) return { done: true };
  window.wcagSeen ||= new WeakSet();
  if (window.wcagSeen.has(el)) return { done: true };
  window.wcagSeen.add(el);
  const cs = getComputedStyle(el);
  const name = describe(el);
  // The browser's own ring is exempt from the author's contrast duty.
  if (cs.outlineStyle === 'auto') return {};
  if (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) < 1) {
    return { examined: true, problem: `${name}: no focus outline` };
  }
  const around = surroundings(el);
  if (!around) return {};
  const ring = parse(cs.outlineColor);
  if (!ring || ring.a === 0) return { examined: true, problem: `${name}: transparent focus outline` };
  const ratio = contrast(ring, around);
  if (ratio < 3) return { examined: true, problem: `${name}: focus outline contrast ${ratio.toFixed(2)}:1` };
  return { examined: true };
}

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}` });
let failed = false;
try {
  for (const form of forms) {
    for (const [name, path] of PAGES) {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORTS[form]);
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[hidden]')) el.hidden = false;
      });
      await page.addScriptTag({ content: axeSource });
      await page.evaluate(helpers);

      const problems = Object.fromEntries(CHECKS.map((c) => [c, []]));
      const examined = Object.fromEntries(CHECKS.map((c) => [c, 0]));
      const axe = await page.evaluate(() => window.axe.run(document, {
        runOnly: ['color-contrast', 'target-size'],
        resultTypes: ['violations', 'passes'],
      }));
      const axeCheck = (id) => (id === 'color-contrast' ? 'text-contrast' : 'target-size');
      for (const r of axe.passes) examined[axeCheck(r.id)] += r.nodes.length;
      for (const v of axe.violations) {
        examined[axeCheck(v.id)] += v.nodes.length;
        for (const node of v.nodes) {
          const why = (node.any[0] || node.all[0] || {}).message || v.help;
          problems[axeCheck(v.id)].push(`${node.target.join(' ')}: ${why}`);
        }
      }

      const custom = await page.evaluate(inspect, { labelSelector: LABEL_SELECTOR, bodySelector: BODY_SELECTOR });
      for (const [check, list] of Object.entries(custom.found)) problems[check].push(...list);
      for (const [check, n] of Object.entries(custom.examined)) examined[check] += n;

      // Walk the tab ring once; a real keyboard press shows :focus-visible.
      let presses = 0;
      for (; presses < 400; presses++) {
        await page.keyboard.press('Tab');
        const r = await page.evaluate(focusRing);
        if (r.done) break;
        if (r.examined) examined.focus += 1;
        if (r.problem) problems.focus.push(r.problem);
      }
      if (presses === 400) problems.focus.push('tab walk gave up after 400 presses without cycling');
      await page.close();

      for (const c of CHECKS) if (!examined[c]) problems[c].push('examined nothing');
      const bad = CHECKS.some((c) => problems[c].length);
      failed ||= bad;
      const cells = CHECKS.map((c) => `${c} ${problems[c].length ? problems[c].length : `ok/${examined[c]}`}`);
      console.log(`${name}-${form}`.padEnd(20) + cells.join('  ') + (bad ? '  FAIL' : ''));
      for (const c of CHECKS) for (const p of problems[c]) console.log(`  ${c}: ${p}`);
    }
  }
} finally {
  await browser.disconnect();
  await chrome.kill();
}
if (failed) {
  console.error('WCAG gate: a page has failures listed above.');
  process.exit(1);
}
