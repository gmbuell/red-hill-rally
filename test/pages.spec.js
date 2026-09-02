import { env, SELF, createExecutionContext, reset } from 'cloudflare:test';
import { afterEach, describe, it, expect } from 'vitest';
import worker from '../worker/index.js';
import { recordDonation } from '../worker/store.js';
import { header, footer } from '../worker/views.js';
import data from '../site/js/data.js';
import { paidSession, paidPartnership, PII, PAGE_PATHS } from './fixtures.js';

const [P_MAIN] = data.PRIORITIES;
const [ROOM_A] = data.CLASSROOMS.map((c) => c.id);

const page = async (path) => {
  const res = await SELF.fetch(`https://rally.test${path}`);
  return { res, text: await res.text() };
};

/* Seed the store directly; the webhook path has its own tests. */
const gift = (over = {}) => recordDonation(env.DB, paidSession(over), 1756100000);
const partner = (name) => recordDonation(env.DB, paidPartnership({ metadata: { donor_name: name } }), 1756100000);

afterEach(() => reset());

describe('canonical host', () => {
  it('sends www to the apex, keeping path and query', async () => {
    const res = await SELF.fetch('https://www.rocketrally.org/donate?p=x&link=sunny-otter', { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://rocketrally.org/donate?p=x&link=sunny-otter');
  });

  it('leaves every other host alone', async () => {
    const res = await SELF.fetch('https://rocketrally.org/', { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});

describe('rendered pages', () => {
  it('serves every page with the shared chrome and no client templates', async () => {
    for (const path of PAGE_PATHS) {
      const { res, text } = await page(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type'), path).toContain('text/html');
      expect(text, path).toContain('<nav class="site-nav" aria-label="Site">');
      expect(text, path).toContain('<nav aria-label="Footer">');
      expect(text, path).not.toContain('skeleton');
      expect(text, path).not.toContain('js/home.js');
    }
  });

  it('marks the current page in the nav', async () => {
    expect((await page('/')).text).toContain('<a href="/" aria-current="page">Home</a>');
    expect((await page('/rally-board')).text).toContain('<a href="/rally-board" aria-current="page">Rally Board</a>');
    expect((await page('/donate')).text).toContain('href="/donate" aria-current="page">Donate');
    expect((await page('/matching')).text).not.toContain('aria-current');
  });

  it('paints the live total and the priority card on home', async () => {
    await gift();
    const { text } = await page('/');
    expect(text).toContain('id="stat-raised">$100</span>');
    expect(text).toContain(`id="stat-goal">$${data.CAMPAIGN.goal.toLocaleString('en-US')}</span>`);
    expect(text).toContain(`<strong>$100</strong> raised of $${P_MAIN.goal.toLocaleString('en-US')}`);
    expect(text).toContain('<clipPath id="traj-clip">');
  });

  it('ranks the classroom and lists the donor on the board', async () => {
    await gift();
    const { text } = await page('/rally-board');
    const room = data.classroomById(ROOM_A);
    expect(text).toContain('<span class="num money">1</span><span class="label">family gifts so far</span>');
    expect(text).toContain(`${room.teacher}<span class="grade">`);
    expect(text).toContain(`1 gift &middot; class of ${room.students}`);
    expect(text).toContain('<span class="who">The Rodriguez Family</span>');
    expect(text).toContain(`<span class="what">${P_MAIN.name}</span>`);
  });

  it('lists a paid partnership on the partner wall and the board', async () => {
    await partner('Galaxy Automotive');
    expect((await page('/partners')).text).toContain('With thanks to Galaxy Automotive.');
    expect((await page('/rally-board')).text).toContain('With thanks to Galaxy Automotive.');
  });

  it('escapes donor and partner names', async () => {
    await gift({ metadata: { donor_name: '<b>Bold</b> Family' } });
    await partner('Galaxy <Tire> & Co');
    const board = (await page('/rally-board')).text;
    expect(board).toContain('&lt;b&gt;Bold&lt;/b&gt; Family');
    expect(board).not.toContain('<b>Bold</b>');
    expect((await page('/partners')).text).toContain('Galaxy &lt;Tire&gt; &amp; Co');
  });

  it('never renders student names, donor email, or billing details', async () => {
    await gift();
    for (const path of ['/', '/rally-board', '/partners']) {
      const { text } = await page(path);
      for (const probe of PII) expect(text, `${path} ${probe}`).not.toContain(probe);
    }
  });

  it('renders the donate priorities and the first student-link row', async () => {
    const donate = (await page('/donate')).text;
    for (const p of data.PRIORITIES) expect(donate).toContain(`<input type="radio" name="priority" value="${p.id}">`);
    const link = (await page('/student-link')).text;
    expect(link).toContain('id="sibling-name-0"');
    for (const c of data.CLASSROOMS) expect(link).toContain(`<option value="${c.id}">`);
  });

  it('answers unknown paths with the branded 404 and the chrome', async () => {
    const { res, text } = await page('/nope');
    expect(res.status).toBe(404);
    expect(text).toContain('<nav class="site-nav" aria-label="Site">');
    expect(res.headers.get('link')).toContain('</css/styles.css>; rel=preload');
  });

  it('bakes the chrome into the 404 file, which the asset layer serves by itself for missing static files', async () => {
    // A miss under /css, /fonts, /js, or /img never reaches the worker,
    // so 404.html must carry the header and footer as views.js renders
    // them. When this fails, paste the new markup into site/404.html.
    const res = await env.ASSETS.fetch('https://rally.test/img/partners/gone.webp');
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toContain(String(header('/404')));
    expect(text).toContain(String(footer()));
  });

  it('falls back to the zero state when the database is unavailable', async () => {
    await env.DB.exec('DROP TABLE donation_students; DROP TABLE donations;');
    const home = await page('/');
    expect(home.res.status).toBe(200);
    expect(home.text).toContain('id="stat-raised">$0</span>');
    // A failure must not be cached: the next visit should try D1 again.
    expect(home.res.headers.get('cache-control')).toBe('no-store');
    const board = await page('/rally-board');
    expect(board.res.status).toBe(200);
    expect(board.text).toContain('<span class="num money">0</span><span class="label">family gifts so far</span>');
    expect(board.text).toContain('class="empty-roll"');
  });

  it('reads the stats while the asset round trip is still in flight', async () => {
    const order = [];
    const ASSETS = {
      fetch: async (req) => {
        order.push('asset start');
        const res = await env.ASSETS.fetch(req);
        await new Promise((r) => setTimeout(r, 25));
        order.push('asset done');
        return res;
      },
    };
    const DB = new Proxy(env.DB, {
      get(db, key) {
        if (key === 'prepare' && !order.includes('db')) order.push('db');
        const v = db[key];
        return typeof v === 'function' ? v.bind(db) : v;
      },
    });
    const res = await worker.fetch(new Request('https://rally.test/rally-board'), { ...env, ASSETS, DB }, createExecutionContext());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('family gifts so far');
    expect(order.indexOf('db')).toBeLessThan(order.indexOf('asset done'));
  });

  it('carries the preload hint and a short cache life, and drops the asset etag', async () => {
    for (const path of PAGE_PATHS) {
      const { res } = await page(path);
      expect(res.headers.get('link'), path).toContain('</css/styles.css>; rel=preload');
      expect(res.headers.get('cache-control'), path).toBe('public, max-age=60');
      expect(res.headers.get('etag'), path).toBeNull();
      expect(res.headers.get('x-frame-options'), path).toBe('DENY');
    }
  });
});
