import { env, SELF, createExecutionContext, waitOnExecutionContext, reset } from 'cloudflare:test';
import { afterEach, describe, it, expect, vi } from 'vitest';
import worker from '../worker/index.js';
import { recordDonation } from '../worker/store.js';
import { header, footer } from '../worker/views.js';
import data from '../site/js/data.js';
import { paidSession, paidPartnership, PII, PAGE_PATHS } from './fixtures.js';

const [P_MAIN] = data.PRIORITIES;
const [ROOM_A, ROOM_B] = data.CLASSROOMS.map((c) => c.id);

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

  it('keeps the admin page out of search and empty until a key opens it', async () => {
    await gift();
    const { text } = await page('/admin');
    expect(text).toContain('<meta name="robots" content="noindex">');
    expect(text).toContain('id="admin-key"');
    for (const needle of PII) expect(text).not.toContain(needle);
  });

  /* Ten sheets stacked open is a page nobody scrolls to the bottom of,
     so every one of them folds. Native <details>, which means it works
     before admin.js runs and the keyboard already knows how. */
  it('folds every sheet shut, and labels each one with its own heading', async () => {
    const { text } = await page('/admin');
    const sections = text.match(/<section class="sheet" aria-labelledby="[^"]+">/g) || [];
    expect(sections.length).toBeGreaterThan(5);

    // Each sheet holds one panel, and the h2 inside its summary is the
    // heading the section points at — so nothing loses its name to the
    // fold.
    const labelled = text.match(/aria-labelledby="([^"]+)"[\s\S]{0,200}?<summary>\s*<h2 id="([^"]+)"/g) || [];
    expect(labelled).toHaveLength(sections.length);
    for (const block of labelled) {
      const [, points, heading] = block.match(/aria-labelledby="([^"]+)"[\s\S]*?<h2 id="([^"]+)"/);
      expect(heading).toBe(points);
    }

    // Nothing starts open: the page opens as a list of headings.
    expect(text).not.toMatch(/<details[^>]*\sopen/);
    expect(text).toContain('id="panels-open"');
    expect(text).toContain('id="panels-close"');
  });

  /* The question the PTA actually gets asked is about one gift, not a
     class average, and the answer has to be findable without anyone
     opening a database. */
  it('carries the gift ledger and the way to put a gift on a Rocket', async () => {
    const { text } = await page('/admin');
    expect(text).toContain('id="gifts-table"');
    expect(text).toContain('data-download="gifts"');
    expect(text).toContain('id="gift-orphans"');
    expect(text).toContain('id="cg-gift"');
    // The book names a donor who stayed off the board, so the panel
    // has to say what that name is for and what it isn't for.
    expect(text).toMatch(/keep it off anything public/i);
    // Still no student names in the served HTML — the sheet is filled
    // in the browser, behind the key, like every other one here.
    for (const needle of PII) expect(text).not.toContain(needle);
  });

  /* A cash shirt's money splits the way a card shirt's does, and the
     PTA types the whole amount handed over — so the panel has to say
     which number goes in the box, or a $20 cash shirt gets entered as
     $20 raised beside a card shirt's $10. */
  it('asks for the whole amount received and explains the shirt’s share', async () => {
    const { text } = await page('/admin');
    expect(text).toContain('id="off-shirts"');
    expect(text).toContain('Amount received');
    expect(text).toMatch(/comes off the campaign total/i);
  });

  /* Sizes get corrected all season, and the PTA has to be able to say
     out loud that a correction costs the class nothing — otherwise the
     safe-looking move is to leave the wrong shirt alone. */
  it('offers the shirt size change, and promises it moves no money', async () => {
    const { text } = await page('/admin');
    expect(text).toContain('id="swap-head"');
    expect(text).toContain('id="sw-shirt"');
    expect(text).toMatch(/only the size on the printer/i);
    expect(text).toMatch(/keeps the time it came in/i);
  });

  /* Families ask the PTA what it would take to win Principal for the
     Day, one text message at a time. The page answers — with a number
     and never a name, rounded down so it is honest in the safe
     direction. */
  describe('what first place has raised', () => {
    const forRocket = (id, name, cents) => recordDonation(env.DB, paidSession({
      id, amount_total: cents,
      metadata: { students: JSON.stringify([{ c: ROOM_A, n: name }]) },
    }), 1756100000);

    it('prints the leader’s total, rounded down to the hundred', async () => {
      await forRocket('cs_a', 'Sammy Webber', 125000);   // $1,250, one gift
      await forRocket('cs_b', 'Sammy Webber', 4900);     // and $49 more
      await forRocket('cs_c', 'Leo Park', 40000);
      const { text } = await page('/prizes');
      // $1,299 rounds down to $1,200: never up, and never the real
      // figure, so matching it to the dollar doesn't take the lead.
      expect(text).toContain('Our current first place student has raised more than $1,200 so far.');
      expect(text).not.toContain('$1,299');
      expect(text).not.toContain('$1,300');
    });

    it('names nobody, and says nothing about anyone in second', async () => {
      await forRocket('cs_a', 'Sammy Webber', 125000);
      await forRocket('cs_b', 'Leo Park', 40000);
      const { text } = await page('/prizes');
      expect(text).not.toContain('Sammy');
      expect(text).not.toContain('Leo Park');
      expect(text).not.toContain('$400');
      for (const needle of PII) expect(text).not.toContain(needle);
      /* The dollar figure and nothing else about the leader — not how
         many gifts are behind it, not when the last one landed. Every
         extra fact is one more thing published about one child. */
      expect(text).toMatch(/first place student has raised more than \$1,200 so far\.</);
    });

    it('counts a Rocket the way the PTA’s own sheet counts one', async () => {
      // Two spellings are one child; a gift split between two Rockets
      // is split here too. Both are the tally the Rockets sheet uses,
      // so the page and Mission Control can't print different leaders.
      await forRocket('cs_a', 'Sammy Webber', 60000);
      await forRocket('cs_b', 'sammy webber', 60000);
      await recordDonation(env.DB, paidSession({
        id: 'cs_split', amount_total: 100000,
        metadata: { students: JSON.stringify([{ c: ROOM_A, n: 'Leo Park' }, { c: ROOM_A, n: 'Ada Chen' }]) },
      }), 1756100000);
      const { text } = await page('/prizes');
      // Sammy's two spellings make $1,200; the split gift gives Leo
      // $500, so it is Sammy in front.
      expect(text).toContain('more than $1,200 so far');
    });

    /* The lunch has no cap, so this one is a count of winners rather
       than a bar. It is the evidence that ten gifts is a thing
       children here actually do. */
    it('counts the Rockets who have already earned the lunch', async () => {
      const gifts = (name, n) => Promise.all(Array.from({ length: n }, (_, i) =>
        recordDonation(env.DB, paidSession({
          id: `cs_${name}_${i}`, amount_total: 1000,
          metadata: { students: JSON.stringify([{ c: ROOM_A, n: name }]) },
        }), 1756100000)));
      await gifts('Sammy', data.LUNCH.gifts);        // exactly ten: in
      await gifts('Audrey', data.LUNCH.gifts + 4);   // more than ten: in
      await gifts('Leo', data.LUNCH.gifts - 1);      // one short: out
      const { text } = await page('/prizes');
      expect(text).toContain('2 Rockets have earned a seat so far.');
      expect(text).not.toContain('Sammy');
      expect(text).not.toContain('Leo');
    });

    it('says it in the singular for the first one', async () => {
      await Promise.all(Array.from({ length: data.LUNCH.gifts }, (_, i) =>
        recordDonation(env.DB, paidSession({
          id: `cs_solo_${i}`, amount_total: 1000,
          metadata: { students: JSON.stringify([{ c: ROOM_A, n: 'Sammy Webber' }]) },
        }), 1756100000)));
      const { text } = await page('/prizes');
      expect(text).toContain('1 Rocket has earned a seat so far.');
    });

    /* Same two figures on the board, off the tally it already builds.
       If these ever disagreed with the prizes page, the argument is
       with a family. */
    it('shows the same two numbers on the Rally Board', async () => {
      await recordDonation(env.DB, paidSession({
        id: 'cs_big', amount_total: 125000,
        metadata: { students: JSON.stringify([{ c: ROOM_A, n: 'Sammy Webber' }]) },
      }), 1756100000);
      await Promise.all(Array.from({ length: data.LUNCH.gifts }, (_, i) =>
        recordDonation(env.DB, paidSession({
          id: `cs_many_${i}`, amount_total: 1000,
          metadata: { students: JSON.stringify([{ c: ROOM_B, n: 'Audrey Webber' }]) },
        }), 1756100000)));

      const board = await page('/rally-board');
      expect(board.text).toContain('More than $1,200');
      expect(board.text).toContain('<strong>1 Rocket</strong> has earned a seat');
      for (const needle of PII) expect(board.text).not.toContain(needle);
      expect(board.text).not.toContain('Sammy');
      expect(board.text).not.toContain('Audrey');

      // And the prizes page agrees, to the dollar.
      const prizes = await page('/prizes');
      expect(prizes.text).toContain('more than $1,200 so far');
      expect(prizes.text).toContain('1 Rocket has earned a seat so far.');
    });

    it('leaves the line off the page entirely before there is a number', async () => {
      const { text } = await page('/prizes');
      expect(text).not.toContain('first place student has raised');
      // And no "0 Rockets have earned a seat", which reads as a prize
      // nobody can reach.
      expect(text).not.toContain('earned a seat');
      expect(text).not.toContain('id="lunch-count"');
      // The prize itself stays on the page either way.
      expect(text).toContain('catered lunch with Ms. Malpass');
      // Removed, not emptied: nothing to style around or read out.
      expect(text).not.toContain('id="prize-lead"');
      // And the prize itself is still on the page.
      expect(text).toContain('Principal for the Day');
    });

    it('stays off the page while the leader is under the first hundred', async () => {
      await forRocket('cs_a', 'Sammy Webber', 9900);
      const { text } = await page('/prizes');
      expect(text).not.toContain('first place student has raised');
      expect(text).not.toContain('$0');
    });

    it('does not count gifts that named no Rocket as a contender', async () => {
      // A classroom with no name folds into one bucket that can hold
      // several families; publishing it would be a total nobody raised.
      await recordDonation(env.DB, paidSession({
        id: 'cs_nameless', amount_total: 500000,
        metadata: { students: JSON.stringify([{ c: ROOM_A, n: '' }]) },
      }), 1756100000);
      await forRocket('cs_a', 'Sammy Webber', 30000);
      const { text } = await page('/prizes');
      expect(text).toContain('more than $300 so far');
      expect(text).not.toContain('$5,000');
    });
  });

  it('marks the current page in the nav', async () => {
    expect((await page('/')).text).toContain('<a href="/" aria-current="page">Home</a>');
    expect((await page('/rally-board')).text).toContain('<a href="/rally-board" aria-current="page">Rally Board</a>');
    expect((await page('/why-we-rally')).text).toContain('<a href="/why-we-rally" aria-current="page">Why We Rally</a>');
    expect((await page('/donate')).text).toContain('href="/donate" aria-current="page">Donate');
    expect((await page('/matching')).text).not.toContain('aria-current');
  });

  it('paints the live total and the priority card on home', async () => {
    await gift();
    const { text } = await page('/');
    expect(text).toContain('id="stat-raised">$100</span>');
    expect(text).toContain(`id="stat-goal">$${data.CAMPAIGN.goal.toLocaleString('en-US')}</span>`);
    // Priority cards show what a priority has raised, never a per-priority
    // goal: the six goals are annual program costs and do not add up to the
    // Rally's own target.
    expect(text).toContain('<strong>$100</strong> raised<');
    expect(text).not.toContain(`raised of $${P_MAIN.goal.toLocaleString('en-US')}`);
    expect(text).toContain('<clipPath id="traj-clip">');
  });

  it('spreads a Support It All gift evenly across the six cards', async () => {
    await gift({ metadata: { priority: data.SUPPORT_ALL.id } });
    const { text } = await page('/');
    // $100 over six is $16.67 each, and the six must add back to $100:
    // the cards read $17, $17, $17, $17, $16, $16.
    const raised = [...text.matchAll(/<strong>\$(\d+)<\/strong> raised</g)].map((m) => Number(m[1]));
    expect(raised).toHaveLength(data.PRIORITIES.length);
    expect(raised.reduce((a, b) => a + b, 0)).toBe(100);
    expect(Math.max(...raised) - Math.min(...raised)).toBeLessThanOrEqual(1);
    // The ticker still counts it once, as one gift of the whole amount.
    expect(text).toContain('id="stat-raised">$100</span>');
  });

  it('offers Support It All as a seventh choice on the donate form', async () => {
    const { text } = await page('/donate');
    expect(text).toContain(`<input type="radio" name="priority" value="${data.SUPPORT_ALL.id}">`);
    expect(text).toContain(data.SUPPORT_ALL.name);
  });

  it('names the grand prize and how participation is counted on prizes', async () => {
    const { text } = await page('/prizes');
    expect(text).toContain('Principal for the Day');
    // The fairness line is the answer to the question every parent asks,
    // so it stays on the page: any amount, and a share of your own class.
    expect(text).toContain('any amount');
    expect(text).toContain('a class of 18 and a class of 32');

    /* The lunch is the one Rocket prize counted in gifts rather than
       dollars, and the page and the thank-you nudge have to agree on
       the number — a family told "2 more gifts" by one and "7 more" by
       the other would rightly write in. */
    expect(text).toContain(`<h3>${data.LUNCH.gifts} gifts</h3>`);
    expect(text).toContain('Ms. Malpass and Mr. Strong');
    // It has no cap, and saying so is the point of it.
    expect(text).toMatch(/no cap/i);
    expect(text).toContain(`every Rocket who reaches ${data.LUNCH.gifts} comes`);


  });

  /* The weekly send is off (no cron in wrangler.jsonc). Mission
     Control must not go on promising one — a PTA that reads "the next
     send is Thursday at 5pm" stops sending recaps by hand, and the
     teachers simply hear nothing. Turning the cron back on means
     putting this copy back too. */
  it('does not promise teachers an automatic send', async () => {
    const { text } = await page('/admin');
    expect(text).toContain('Nothing sends on its own');
    expect(text).not.toMatch(/every thursday at 5pm/i);
    expect(text).not.toMatch(/the next send is/i);
    // The way it happens now is right there in the panel.
    expect(text).toContain('data-download="recaps"');
  });

  it('puts annual partners above rally partners on the wall, biggest first', async () => {
    const { text } = await page('/partners');
    const [top] = data.ANNUAL_LEVELS;
    const apollo = data.PARTNERS.find((p) => p.annual === top.id);
    const orbit = data.PARTNERS.find((p) => p.annual && p.annual !== top.id);
    expect(text).toContain(`size-${top.size}`);
    expect(text).toContain(`class="partner-tier">${top.name}<`);
    expect(text.indexOf(apollo.name)).toBeLessThan(text.indexOf(orbit.name));
  });

  /* A partner is added by hand: a file into site/img/partners/ and a
     line in data.js. Nothing connects the two, so a typo in the
     filename ships a business a broken image on the wall their
     sponsorship paid for — and it looks fine in review, because the
     name and the badge are right. */
  it('serves the logo file every listed partner names', async () => {
    const listed = data.PARTNERS.filter((p) => p.logo);
    expect(listed.length).toBeGreaterThan(0);
    for (const p of listed) {
      const res = await SELF.fetch(`https://rally.test/img/partners/${p.logo}`);
      expect(res.status, `${p.name} → ${p.logo}`).toBe(200);
      expect(res.headers.get('content-type'), p.name).toContain('image/');
    }
  });

  it('shows every annual partner on the wall and on the board', async () => {
    const wall = await page('/partners');
    const board = await page('/rally-board');
    // Business names carry ampersands, which the renderer escapes.
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    for (const p of data.PARTNERS.filter((x) => x.annual)) {
      const level = data.annualLevelById(p.annual);
      for (const { text } of [wall, board]) {
        expect(text).toContain(esc(p.name));
        expect(text).toContain(`/img/partners/${p.logo}`);
        expect(text).toContain(`class="partner-tier">${level.name}<`);
      }
    }
  });

  /* A family arrives at the board looking for its teacher's row. The
     explanation of what the order means is what you read afterwards,
     so it sits under the list; the prizes, which are the reason to
     care about the order at all, sit above it. */
  it('puts the prizes above the class list and the sorting note below it', async () => {
    const { text } = await page('/rally-board');
    const at = (needle) => text.indexOf(needle);
    expect(at('id="prizes-head"')).toBeGreaterThan(-1);
    expect(at('id="prizes-head"')).toBeLessThan(at('id="race"'));
    expect(at('id="race"')).toBeLessThan(at('id="race-rank"'));
    // All four prize cards are in the one block above the list.
    for (const id of ['shoe-note', 'prize-note', 'lead-note', 'lunch-note']) {
      expect(at(`id="${id}"`), id).toBeGreaterThan(-1);
      expect(at(`id="${id}"`), id).toBeLessThan(at('id="race"'));
    }
    // A card is a div, so the lines inside it can be paragraphs.
    expect(text).toContain('<div class="shoe-note" id="shoe-note">');
    expect(text).not.toContain('<p class="shoe-note"');
  });

  it('ranks the classroom and lists the donor on the board', async () => {
    await gift();
    const { text } = await page('/rally-board');
    const room = data.classroomById(ROOM_A);
    expect(text).toContain(`${room.teacher}<small class="grade">`);
    // Both prize races, each number saying which one it is.
    expect(text).toContain(`<span class="pct">${Math.round(100 / room.students)}%<small>participation</small></span>`);
    expect(text).toContain('<span class="raised">$100<small>total raised</small></span>');
    expect(text).not.toContain('family gifts so far');
    expect(text).not.toContain(`class of ${room.students}`);
    expect(text).toContain('<span class="who">The Rodriguez Family</span>');
    expect(text).toContain(`<small class="what">${P_MAIN.name}</small>`);
  });

  it('lists a paid partnership on the partner wall and the board', async () => {
    await partner('Galaxy Automotive');
    expect((await page('/partners')).text).toContain(', and Galaxy Automotive.');
    expect((await page('/rally-board')).text).toContain(', and Galaxy Automotive.');
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

  it('renders the shirt page complete, with the price from data.js', async () => {
    const { text } = await page('/shirt');
    expect(text).toContain('id="shirt-name-0"');
    expect(text).toContain(`<option value="${data.SHIRT.sizes[0].id}">`);
    // The price and the credit are stated once, in data.js.
    expect(text).toContain(`<strong>$${data.SHIRT.price}</strong>`);
    expect(text).toContain(`<strong>$${data.SHIRT.credit}</strong>`);
  });

  it('takes the shirt form off the page after the ordering deadline', async () => {
    try {
      vi.setSystemTime(new Date('2026-09-26T02:01:00Z')); // 7:01pm Pacific
      const { text } = await page('/shirt');
      // Gone from the served HTML, not hidden in it: no form to post,
      // no size picker to fill, nothing for a script to re-enable.
      expect(text).not.toContain('id="shirt-form"');
      expect(text).not.toContain('id="shirt-name-0"');
      expect(text).toContain(data.SHIRT.deadlineLabel);
      // And the home page stops sending families to it.
      expect((await page('/')).text).not.toContain('shirt-callout');
    } finally {
      vi.useRealTimers();
    }
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
    expect(board.text).toContain('<span class="num money">$0</span>');
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
    expect(await res.text()).toContain('raised of');
    expect(order.indexOf('db')).toBeLessThan(order.indexOf('asset done'));
  });

  it('serves a live page from the edge cache for the five minutes the browser keeps it', async () => {
    await gift({ id: 'cs_first', amount_total: 10000 });
    const ctx = createExecutionContext();
    const first = await worker.fetch(new Request('https://rally.test/rally-board'), env, ctx);
    const before = await first.text();
    await waitOnExecutionContext(ctx);
    expect(before).toContain('$100');

    await gift({ id: 'cs_second', amount_total: 20000 });
    const { text: again } = await page('/rally-board');
    expect(again).toBe(before);
    // A page with nothing live on it is never stored.
    expect(await caches.default.match('https://rally.test/prizes')).toBeUndefined();
  });

  it('carries the preload hint and a short cache life, and drops the asset etag', async () => {
    for (const path of PAGE_PATHS) {
      const { res } = await page(path);
      expect(res.headers.get('link'), path).toContain('</css/styles.css>; rel=preload');
      expect(res.headers.get('cache-control'), path).toBe('public, max-age=300');
      expect(res.headers.get('etag'), path).toBeNull();
      expect(res.headers.get('x-frame-options'), path).toBe('DENY');
    }
  });
});
