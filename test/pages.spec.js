import { env, SELF, reset } from 'cloudflare:test';
import { afterEach, describe, it, expect } from 'vitest';
import { recordDonation } from '../worker/store.js';
import data from '../site/js/data.js';

const [P_MAIN] = data.PRIORITIES;
const [ROOM_A] = data.CLASSROOMS.map((c) => c.id);
const LOGO_TIER = data.PARTNER_TIERS.find((t) => t.logo);
const PAGES = ['/', '/donate', '/rally-board', '/partners', '/student-link', '/matching', '/thanks'];

const page = async (path) => {
  const res = await SELF.fetch(`https://rally.test${path}`);
  return { res, text: await res.text() };
};

/* A paid session as the webhook stores it — the webhook path has its
   own tests; these seed the store directly. */
const gift = (over = {}) => recordDonation(env.DB, {
  id: over.id || 'cs_page_1',
  amount_total: over.amount ?? 10000,
  payment_status: 'paid',
  customer_details: {
    email: 'fam@example.com', name: 'Rosa Rodriguez',
    address: { line1: '123 Rocket Way', city: 'Tustin', state: 'CA', postal_code: '92780', country: 'US' },
  },
  metadata: {
    priority: P_MAIN.id,
    students: JSON.stringify([{ c: ROOM_A, n: 'Mia Rodriguez' }]),
    donor_name: over.donorName || 'The Rodriguez Family',
    visibility: 'public', fee_cents: '0',
    ...(over.metadata || {}),
  },
}, 1756100000);

const partner = (name) => gift({
  id: 'cs_page_partner', amount: LOGO_TIER.amount * 100,
  metadata: { kind: 'partner', partner_tier: LOGO_TIER.id, priority: '', students: '', donor_name: name },
});

afterEach(() => reset());

describe('rendered pages', () => {
  it('serves every page with the shared chrome and no client templates', async () => {
    for (const path of PAGES) {
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
    await gift({ donorName: '<b>Bold</b> Family' });
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
      for (const probe of ['Mia', 'example.com', 'Rosa', 'Rocket Way']) expect(text, `${path} ${probe}`).not.toContain(probe);
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
  });

  it('falls back to the zero state when the database is unavailable', async () => {
    await env.DB.exec('DROP TABLE donation_students; DROP TABLE donations;');
    const home = await page('/');
    expect(home.res.status).toBe(200);
    expect(home.text).toContain('id="stat-raised">$0</span>');
    const board = await page('/rally-board');
    expect(board.res.status).toBe(200);
    expect(board.text).toContain('<span class="num money">0</span><span class="label">family gifts so far</span>');
    expect(board.text).toContain('class="empty-roll"');
  });

  it('carries the preload hint and a short cache life, and drops the asset etag', async () => {
    for (const path of PAGES) {
      const { res } = await page(path);
      expect(res.headers.get('link'), path).toContain('</css/styles.css>; rel=preload');
      expect(res.headers.get('cache-control'), path).toBe('public, max-age=60');
      expect(res.headers.get('etag'), path).toBeNull();
      expect(res.headers.get('x-frame-options'), path).toBe('DENY');
    }
  });
});
