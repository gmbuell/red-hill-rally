import { env, SELF, createExecutionContext, reset } from 'cloudflare:test';
import { afterEach, describe, it, expect, vi } from 'vitest';
import worker from '../worker/index.js';
import data from '../site/js/data.js';

/* Fixture config derives from data.js, so the edits the README invites
   (rename a tier, change a price, update the roster) don't break the
   suite: any two priorities, any three classrooms, one logo tier and
   one name-only tier will do — the tests pin mechanics, not this
   year's values. Hand-computed fee-math oracles stay literal on
   purpose, so the gross-up test isn't a tautology. */
const [P_MAIN, P_ALT] = data.PRIORITIES;
const [ROOM_A, ROOM_B, ROOM_C] = data.CLASSROOMS.map((c) => c.id);
const LOGO_TIER = data.PARTNER_TIERS.find((t) => t.logo);
const NAME_TIER = data.PARTNER_TIERS.find((t) => !t.logo);

/* Checkout tests run the worker in this isolate so the outbound Stripe
   call can be stubbed at the fetch global. */
const stubStripe = (reply = { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }) => {
  const calls = [];
  vi.stubGlobal('fetch', async (input, init) => {
    const target = typeof input === 'string' ? input : input.url;
    if (!target.startsWith('https://api.stripe.com/')) {
      throw new Error('unexpected outbound fetch: ' + target);
    }
    calls.push({ url: target, body: init && init.body });
    return new Response(JSON.stringify(reply), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  return calls;
};

const jsonRequest = (path, body) => new Request(`https://rally.test${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
/* Call a handler in this isolate (so stubbed fetch applies), with
   optional env overrides. */
const direct = (path) => (body, envOverride = {}) =>
  worker.fetch(jsonRequest(path, body), { ...env, ...envOverride }, createExecutionContext());
const checkoutDirect = direct('/api/checkout');
const partnerDirect = direct('/api/partner/checkout');

const post = (path, body) => SELF.fetch(jsonRequest(path, body));
const getJson = async (path) => (await SELF.fetch(`https://rally.test${path}`)).json();

const validCheckout = {
  priority: P_MAIN.id,
  amount: 100,
  link: '',
  students: [{ c: ROOM_A, n: 'Mia Rodriguez' }],
  visibility: 'public',
  donorName: 'The Rodriguez Family',
  match: true,
};

/* ---- Stripe webhook helpers ---- */

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const signPayload = async (payload, secret, t = Math.floor(Date.now() / 1000)) => {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  return `t=${t},v1=${hex(sig)}`;
};

const sessionEvent = (over = {}) => JSON.stringify({
  type: over.type || 'checkout.session.completed',
  created: 1756100000,
  data: {
    object: {
      id: over.id || 'cs_test_abc',
      amount_total: over.amount_total ?? 10000,
      payment_status: over.payment_status || 'paid',
      customer_details: {
        email: 'fam@example.com',
        name: 'Rosa Rodriguez',
        address: {
          line1: '123 Rocket Way', line2: 'Apt 4', city: 'Tustin',
          state: 'CA', postal_code: '92780', country: 'US',
        },
      },
      metadata: {
        priority: P_MAIN.id,
        students: JSON.stringify([{ c: ROOM_A, n: 'Mia Rodriguez' }]),
        donor_name: 'The Rodriguez Family',
        visibility: 'public',
        employer_match: '1',
        via_link: '1',
        ...(over.metadata || {}),
      },
    },
  },
});

/* A paid Rally Champion partnership, as the webhook sees it. */
const partnerSession = (over = {}) => sessionEvent({
  id: 'cs_partner', amount_total: LOGO_TIER.amount * 100,
  ...over,
  metadata: {
    kind: 'partner', partner_tier: LOGO_TIER.id, priority: '',
    donor_name: 'Galaxy Automotive & Tire', students: '', fee_cents: '0',
    ...(over.metadata || {}),
  },
});

const deliverWebhook = async (payload, sigOverride) => {
  const signature = sigOverride ?? await signPayload(payload, 'whsec_test_secret');
  return SELF.fetch('https://rally.test/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: payload,
  });
};

afterEach(async () => {
  vi.unstubAllGlobals();
  await reset();
});

/* ---- student links ---- */

describe('student links', () => {
  const mia = { n: 'Mia Rodríguez', c: ROOM_A };
  const leo = { n: 'Leo Park', c: ROOM_B };

  it('creates a short memorable code and resolves it', async () => {
    const created = await post('/api/link', { students: [mia] });
    expect(created.status).toBe(200);
    const { code } = await created.json();
    expect(code).toMatch(/^[a-z]+-[a-z]+(-\d{2})?$/);

    const verified = await post('/api/link/verify', { code });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ students: [{ c: ROOM_A, n: 'Mia Rodríguez' }] });
  });

  it('reuses the code for the same student and classroom', async () => {
    const { code } = await (await post('/api/link', { students: [leo] })).json();
    const { code: again } = await (await post('/api/link', { students: [{ n: '  leo park ', c: ROOM_B }] })).json();
    expect(again).toBe(code);
    // Same name in a different classroom is a different link.
    const { code: other } = await (await post('/api/link', { students: [{ n: 'Leo Park', c: ROOM_C }] })).json();
    expect(other).not.toBe(code);
  });

  it('one link can name every sibling, in the order entered', async () => {
    const { code } = await (await post('/api/link', { students: [mia, leo] })).json();
    const verified = await (await post('/api/link/verify', { code })).json();
    expect(verified.students).toEqual([{ c: ROOM_A, n: 'Mia Rodríguez' }, { c: ROOM_B, n: 'Leo Park' }]);
    // The same kids, reversed and recased, is the same family.
    const { code: again } = await (await post('/api/link', {
      students: [{ n: 'LEO PARK', c: ROOM_B }, { n: 'mia rodríguez', c: ROOM_A }],
    })).json();
    expect(again).toBe(code);
    // A different set is a different link — the single-kid links too.
    const { code: solo } = await (await post('/api/link', { students: [mia] })).json();
    expect(solo).not.toBe(code);
  });

  it('resolves hand-typed codes case-insensitively', async () => {
    const { code } = await (await post('/api/link', { students: [{ n: 'Zoe F', c: ROOM_A }] })).json();
    const res = await post('/api/link/verify', { code: `  ${code.toUpperCase()} ` });
    expect(res.status).toBe(200);
  });

  it('rejects unknown and malformed codes', async () => {
    expect((await post('/api/link/verify', { code: 'unlikely-critter' })).status).toBe(400);
    expect((await post('/api/link/verify', { code: 'DROP TABLE links' })).status).toBe(400);
    expect((await post('/api/link/verify', {})).status).toBe(400);
  });

  it('rejects bad payloads', async () => {
    const bad = async (body) => (await post('/api/link', body)).status;
    expect(await bad({})).toBe(400);
    expect(await bad({ students: [] })).toBe(400);
    expect(await bad({ students: [{ n: '', c: ROOM_A }] })).toBe(400);
    expect(await bad({ students: [{ n: 'Mia', c: 'not-a-room' }] })).toBe(400);
    expect(await bad({ students: [{ n: 'x'.repeat(data.MAX_NAME + 1), c: ROOM_A }] })).toBe(400);
    expect(await bad({ students: Array.from({ length: data.MAX_STUDENTS + 1 }, (_, i) => ({ n: `Kid ${i}`, c: ROOM_A })) })).toBe(400);
    expect(await bad({ n: 'Mia', c: ROOM_A })).toBe(400); // the pre-family shape
  });

  it('heals a migration-backfilled signature for an accented name', async () => {
    // Migration 0005 backfilled signatures with SQLite's ASCII-only
    // lower(): 'JOSÉ Rodríguez' became 'josÉ rodríguez'.
    await env.DB.prepare(`INSERT INTO links (code, students, signature, created)
      VALUES ('sunny-otter', ?1, ?2, 1787000000)`)
      .bind(JSON.stringify([{ c: ROOM_A, n: 'JOSÉ Rodríguez' }]),
        JSON.stringify([{ c: ROOM_A, n: 'josÉ rodríguez' }])).run();
    const { code } = await (await post('/api/link', { students: [{ n: 'JOSÉ Rodríguez', c: ROOM_A }] })).json();
    expect(code).toBe('sunny-otter');
    // Healed: the modern signature now finds it directly too.
    const { code: again } = await (await post('/api/link', { students: [{ n: 'josé rodríguez', c: ROOM_A }] })).json();
    expect(again).toBe('sunny-otter');
  });

  it('redirects the short /l/ path to the donate page', async () => {
    const res = await SELF.fetch('https://rally.test/l/Sunny-Otter', { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://rally.test/donate?link=sunny-otter');
  });
});

/* ---- checkout ---- */

describe('checkout', () => {
  it('creates a Stripe session with full metadata', async () => {
    const calls = stubStripe();
    const res = await checkoutDirect(validCheckout);
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://checkout.stripe.com/c/pay/cs_1');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const sent = new URLSearchParams(String(calls[0].body));
    expect(sent.get('mode')).toBe('payment');
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe('10000');
    expect(JSON.parse(sent.get('metadata[students]'))).toEqual([{ c: ROOM_A, n: 'Mia Rodriguez' }]);
    expect(sent.has('metadata[classroom]')).toBe(false);
    expect(sent.has('metadata[student_name]')).toBe(false);
    expect(sent.get('metadata[visibility]')).toBe('public');
    expect(sent.get('metadata[employer_match]')).toBe('1');
    // Stripe's page collects contact details; the wizard sends none.
    expect(sent.get('billing_address_collection')).toBe('required');
    expect(sent.has('customer_email')).toBe(false);
    // Every receipt doubles as the IRS written acknowledgment.
    expect(sent.get('payment_intent_data[description]'))
      .toContain('Red Hill Elementary PTA (EIN 33-0973857)');
    expect(sent.get('payment_intent_data[description]'))
      .toContain('No goods or services were provided');
    expect(sent.get('success_url')).toContain('{CHECKOUT_SESSION_ID}');
  });

  it('a family link credits every sibling and overrides hand-typed rows', async () => {
    const { code } = await (await post('/api/link', {
      students: [{ n: 'Leo Park', c: ROOM_B }, { n: 'Ana Park', c: 'michel' }],
    })).json();
    const calls = stubStripe({ id: 'cs_2', url: 'https://checkout.stripe.com/c/pay/cs_2' });
    const res = await checkoutDirect({ ...validCheckout, link: code });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(JSON.parse(sent.get('metadata[students]')))
      .toEqual([{ c: ROOM_B, n: 'Leo Park' }, { c: 'michel', n: 'Ana Park' }]);
    expect(sent.get('metadata[via_link]')).toBe('1');
    // Backing out of Stripe must land on the wizard with the link intact.
    expect(sent.get('cancel_url')).toBe(`https://rally.test/donate?p=${P_MAIN.id}&link=${code}`);
  });

  it('carries every Rocket, and drops untouched rows', async () => {
    const calls = stubStripe();
    const res = await checkoutDirect({ ...validCheckout, students: [
      { c: ROOM_A, n: 'Mia Rodriguez' }, { c: '', n: '' }, { c: ROOM_B, n: '' },
    ] });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(JSON.parse(sent.get('metadata[students]')))
      .toEqual([{ c: ROOM_A, n: 'Mia Rodriguez' }, { c: ROOM_B, n: '' }]);
    expect(sent.get('metadata[via_link]')).toBe('0');
  });

  it('accepts a gift with no Rocket at all', async () => {
    const calls = stubStripe();
    const res = await checkoutDirect({ ...validCheckout, students: [] });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(sent.get('metadata[students]')).toBe('[]');
  });

  it('rejects invalid requests', async () => {
    const bad = async (patch) => (await post('/api/checkout', { ...validCheckout, ...patch })).status;
    expect(await bad({ priority: 'nope' })).toBe(400);
    expect(await bad({ amount: 0 })).toBe(400);
    expect(await bad({ amount: 10.5 })).toBe(400);
    expect(await bad({ amount: data.MAX_AMOUNT + 1 })).toBe(400);
    expect(await bad({ donorName: '' })).toBe(400);            // public needs a name
    expect(await bad({ link: 'nope-nope' })).toBe(400);           // no such link
    expect(await bad({ students: [{ c: '', n: 'Mia' }] })).toBe(400);     // name, no classroom
    expect(await bad({ students: [{ c: 'not-a-room', n: 'Mia' }] })).toBe(400);  // not on the roster
    expect(await bad({ students: Array.from({ length: data.MAX_STUDENTS + 1 }, (_, i) => ({ c: ROOM_A, n: `K${i}` })) })).toBe(400);
  });

  it('adds a fee-cover line item when the donor covers card costs', async () => {
    const calls = stubStripe();
    const res = await checkoutDirect({ ...validCheckout, coverFees: true });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    // The gift line is unchanged; the gross-up rides as its own line
    // item ($100 needs $3.30 extra to net $100 after 2.9% + 30¢).
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe('10000');
    expect(sent.get('line_items[1][quantity]')).toBe('1');
    expect(sent.get('line_items[1][price_data][unit_amount]')).toBe('330');
    expect(sent.get('line_items[1][price_data][product_data][name]')).toBe('Covering card processing');
    expect(sent.get('metadata[fee_cents]')).toBe('330');
  });

  it('rounds the fee-cover gross-up to the nearest cent', async () => {
    const calls = stubStripe();
    await checkoutDirect({ ...validCheckout, amount: 1, coverFees: true });
    const sent = new URLSearchParams(String(calls[0].body));
    // ($1.00 + 30¢) / 0.971 = $1.34 charged → 34¢ fee cover.
    expect(sent.get('line_items[1][price_data][unit_amount]')).toBe('34');
  });

  it('omits the fee line when the donor declines', async () => {
    const calls = stubStripe();
    await checkoutDirect({ ...validCheckout, coverFees: false });
    const sent = new URLSearchParams(String(calls[0].body));
    expect(sent.has('line_items[1][price_data][unit_amount]')).toBe(false);
    expect(sent.get('metadata[fee_cents]')).toBe('0');
  });

  it('allows anonymous gifts without a donor name', async () => {
    stubStripe({ id: 'cs_3', url: 'https://checkout.stripe.com/c/pay/cs_3' });
    const res = await checkoutDirect({ ...validCheckout, visibility: 'anon', donorName: '' });
    expect(res.status).toBe(200);
  });

  it('returns a friendly 503 before Stripe is configured', async () => {
    const res = await checkoutDirect(validCheckout, { STRIPE_SECRET_KEY: undefined });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/isn’t quite open yet/);
  });
});

/* ---- webhook → campaign stats ---- */

describe('webhook and campaign stats', () => {
  it('records a paid session and reports it, without leaking PII', async () => {
    expect((await deliverWebhook(sessionEvent())).status).toBe(200);

    const campaignRes = await SELF.fetch('https://rally.test/api/campaign');
    expect(campaignRes.status).toBe(200);
    const campaignText = await campaignRes.text();
    const stats = JSON.parse(campaignText);
    expect(stats.campaign).toEqual({ raised: 100, goal: data.CAMPAIGN.goal, gifts: 1 });
    expect(stats.priorities[P_MAIN.id]).toBe(100);
    // The home payload carries no donor rows — those live on /api/board.
    expect(stats.donors).toBeUndefined();
    expect(stats.classrooms).toBeUndefined();

    const boardRes = await SELF.fetch('https://rally.test/api/board');
    expect(boardRes.status).toBe(200);
    const boardText = await boardRes.text();
    const board = JSON.parse(boardText);
    expect(board.campaign).toEqual({ raised: 100, goal: data.CAMPAIGN.goal, gifts: 1 });
    expect(board.classrooms[ROOM_A]).toBe(1);
    expect(board.donors).toEqual([{
      name: 'The Rodriguez Family', priority: P_MAIN.id, anon: false, circle: false, partner: '',
    }]);

    // The privacy model: student names, emails, and billing contact
    // details never leave the backend.
    for (const text of [campaignText, boardText]) {
      expect(text).not.toContain('Mia');
      expect(text).not.toContain('example.com');
      expect(text).not.toContain('Rosa');
      expect(text).not.toContain('Rocket Way');
      expect(text).not.toContain('92780');
    }
  });

  it('is idempotent across Stripe retries', async () => {
    await deliverWebhook(sessionEvent());
    await deliverWebhook(sessionEvent());
    const stats = await getJson('/api/campaign');
    expect(stats.campaign.gifts).toBe(1);
  });

  it('credits every listed Rocket\'s classroom, once per Rocket', async () => {
    const family = sessionEvent({
      id: 'cs_family',
      metadata: { students: JSON.stringify([
        { c: ROOM_A, n: 'Mia Okafor' },
        { c: ROOM_B, n: 'Leo Okafor' },
        { c: ROOM_B, n: 'Theo Okafor' },
      ]) },
    });
    await deliverWebhook(family);
    await deliverWebhook(family); // Stripe retry: no double credit
    const board = await getJson('/api/board');
    expect(board.classrooms).toEqual({ [ROOM_A]: 1, [ROOM_B]: 2 });
    expect(board.campaign.gifts).toBe(1); // one gift, three Rockets
    expect(JSON.stringify(board)).not.toContain('Okafor'); // student names stay backend-only
  });

  it('stops counting a classroom credit once its gift row is deleted', async () => {
    // The go-live wipe and a refund both delete from `donations` by
    // hand; the race must not keep counting the orphaned credits.
    await deliverWebhook(sessionEvent({ id: 'cs_gone' }));
    await env.DB.prepare("DELETE FROM donations WHERE id = 'cs_gone'").run();
    const board = await getJson('/api/board');
    expect(board.classrooms).toEqual({});
    expect(board.campaign.gifts).toBe(0);
  });

  it('ignores paid sessions this site did not create', async () => {
    // A Payment Link for spirit wear on the same Stripe account fires
    // the same webhook, with none of the wizard's metadata.
    await deliverWebhook(sessionEvent({
      id: 'cs_spiritwear',
      metadata: { priority: '', students: '', donor_name: '', visibility: '', employer_match: '', via_link: '' },
    }));
    const stats = await getJson('/api/campaign');
    expect(stats.campaign).toEqual({ raised: 0, goal: data.CAMPAIGN.goal, gifts: 0 });
  });

  it('rejects bad signatures and stale timestamps', async () => {
    const payload = sessionEvent();
    expect((await deliverWebhook(payload, 't=1,v1=deadbeef')).status).toBe(400);
    // A signature part with no '=' is malformed, not a server error.
    expect((await deliverWebhook(payload, `t=${Math.floor(Date.now() / 1000)},v1`)).status).toBe(400);
    const stale = await signPayload(payload, 'whsec_test_secret', Math.floor(Date.now() / 1000) - 3600);
    expect((await deliverWebhook(payload, stale)).status).toBe(400);
    const wrongKey = await signPayload(payload, 'whsec_wrong');
    expect((await deliverWebhook(payload, wrongKey)).status).toBe(400);
  });

  it('ignores unpaid sessions', async () => {
    await deliverWebhook(sessionEvent({ payment_status: 'unpaid' }));
    const stats = await getJson('/api/campaign');
    expect(stats.campaign.gifts).toBe(0);
  });

  it('credits the base gift, not the fee cover, to campaign totals', async () => {
    await deliverWebhook(sessionEvent({ amount_total: 10330, metadata: { fee_cents: '330' } }));
    const stats = await getJson('/api/campaign');
    expect(stats.campaign.raised).toBe(100);
    expect(stats.priorities[P_MAIN.id]).toBe(100);
  });

  it('judges circle tiers on the base gift, not gift plus fee', async () => {
    // Charged exactly the circle minimum, but part of it is fee
    // cover — the base gift lands just below the tier.
    await deliverWebhook(sessionEvent({
      id: 'cs_fee_edge', amount_total: P_ALT.circle.min * 100,
      metadata: { priority: P_ALT.id, fee_cents: '1524' },
    }));
    const board = await getJson('/api/board');
    expect(board.donors[0].circle).toBe(false);
  });

  it('badges the open-ended top tier of every priority, not just the named circles', async () => {
    for (const p of data.PRIORITIES) {
      const top = p.tiers[p.tiers.length - 1];
      expect(top.plus, p.id).toBe(true);
      expect(p.circle?.min, p.id).toBe(top.amount);
      expect(p.circle?.label, p.id).toBeTruthy();
    }
    await deliverWebhook(sessionEvent({
      id: 'cs_badge', amount_total: P_MAIN.circle.min * 100,
      metadata: { priority: P_MAIN.id, donor_name: 'The Okafor Family' },
    }));
    const board = await getJson('/api/board');
    expect(board.donors.find((d) => d.name === 'The Okafor Family').circle).toBe(true);
  });

  it('lists anonymous gifts as Anonymous and honors circle tiers', async () => {
    await deliverWebhook(sessionEvent({ id: 'cs_anon', metadata: { visibility: 'anon' } }));
    await deliverWebhook(sessionEvent({
      id: 'cs_circle', amount_total: P_ALT.circle.min * 100,
      metadata: { priority: P_ALT.id, donor_name: 'The Whitmore Family' },
    }));
    const board = await getJson('/api/board');
    const names = board.donors.map((d) => d.name);
    expect(names).toContain('Anonymous');
    const circle = board.donors.find((d) => d.name === 'The Whitmore Family');
    expect(circle.circle).toBe(true);
  });
});

/* ---- business partner checkout ---- */

describe('business partner checkout', () => {
  const validPartner = { tier: LOGO_TIER.id, business: '  Galaxy Automotive & Tire ' };

  it('creates a Stripe session at the tier price with partner metadata', async () => {
    const calls = stubStripe();
    const res = await partnerDirect(validPartner);
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://checkout.stripe.com/c/pay/cs_1');
    const sent = new URLSearchParams(String(calls[0].body));
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe(String(LOGO_TIER.amount * 100));
    expect(sent.get('line_items[0][price_data][product_data][name]')).toBe(`Rocket Rally Partnership — ${LOGO_TIER.name}`);
    expect(sent.has('line_items[1][price_data][unit_amount]')).toBe(false); // fee cover not requested
    expect(sent.get('metadata[kind]')).toBe('partner');
    expect(sent.get('metadata[partner_tier]')).toBe(LOGO_TIER.id);
    expect(sent.get('metadata[donor_name]')).toBe('Galaxy Automotive & Tire');
    // Per PTA decision: partner receipts keep the standard donation
    // acknowledgment — logos and posts are intangible recognition.
    expect(sent.get('payment_intent_data[description]')).toContain('No goods or services were provided');
    // The sid is what unlocks the thank-you page's logo upload.
    expect(sent.get('success_url')).toContain(`/thanks?partner=${LOGO_TIER.id}&sid={CHECKOUT_SESSION_ID}`);
    expect(sent.get('cancel_url')).toContain('/partners');
  });

  it('adds the fee cover when the business opts in', async () => {
    const calls = stubStripe();
    const res = await partnerDirect({ ...validPartner, coverFees: true });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    const fee = data.feeCoverCents(LOGO_TIER.amount * 100);
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe(String(LOGO_TIER.amount * 100));
    expect(sent.get('line_items[1][price_data][unit_amount]')).toBe(String(fee));
    expect(sent.get('line_items[1][price_data][product_data][name]')).toBe('Covering card processing');
    expect(sent.get('metadata[fee_cents]')).toBe(String(fee));
  });

  it('rejects a bad tier or a missing business name', async () => {
    stubStripe();
    expect((await partnerDirect({ tier: 'platinum', business: 'Acme' })).status).toBe(400);
    expect((await partnerDirect({ tier: LOGO_TIER.id, business: '   ' })).status).toBe(400);
    expect((await partnerDirect({})).status).toBe(400);
  });

  it('returns a friendly 503 before Stripe is configured', async () => {
    const res = await partnerDirect(validPartner, { STRIPE_SECRET_KEY: undefined });
    expect(res.status).toBe(503);
  });

  it('records a partnership: campaign dollars, no family-gift count, tier on the roll', async () => {
    await deliverWebhook(sessionEvent()); // one $100 family gift
    await deliverWebhook(partnerSession());
    const board = await getJson('/api/board');
    expect(board.campaign.raised).toBe(100 + LOGO_TIER.amount); // the $100 family gift + the partnership
    expect(board.campaign.gifts).toBe(1);       // family gifts only
    expect(board.classrooms).toEqual({ [ROOM_A]: 1 }); // no classroom credit for partners
    const partner = board.donors.find((d) => d.name === 'Galaxy Automotive & Tire');
    expect(partner.partner).toBe(LOGO_TIER.id);
    expect(partner.circle).toBe(false);
    // The wall reads the light payload too — same rows on both.
    const wall = { name: 'Galaxy Automotive & Tire', tier: LOGO_TIER.id, logo: '' };
    expect(board.partners).toEqual([wall]);
    expect((await getJson('/api/campaign')).partners).toEqual([wall]);
    const csv = await (await SELF.fetch('https://rally.test/api/export.csv?key=test-admin-key')).text();
    expect(csv).toContain('partner_tier');
    expect(csv).toContain(`"${LOGO_TIER.id}"`);
  });
});

/* ---- partner logo upload ---- */

describe('partner logo upload', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const upload =(sid, body, name = 'logo.png') => {
    const fd = new FormData();
    fd.append('logo', new File([body], name));
    return SELF.fetch(`https://rally.test/api/partner/logo?sid=${encodeURIComponent(sid)}`, {
      method: 'POST', body: fd,
    });
  };

  it('stores a paid partner\'s logo under an opaque public id and publishes it', async () => {
    await deliverWebhook(partnerSession());
    const res = await upload('cs_partner', PNG);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.published).toBe(true);
    // Opaque id: never the session id, which is the upload capability.
    expect(body.logo).toMatch(/^[0-9a-f]{24}$/);
    const obj = await env.LOGOS.get(`partner-logos/${body.logo}`);
    expect(obj).not.toBeNull();
    expect(obj.httpMetadata.contentType).toBe('image/png');
    expect(obj.customMetadata.business).toBe('Galaxy Automotive & Tire');

    // Live on the board payload, addressed by the public id only.
    const board = await getJson('/api/board');
    expect(board.partners).toEqual([{ name: 'Galaxy Automotive & Tire', tier: LOGO_TIER.id, logo: body.logo }]);
    expect(JSON.stringify(board.partners)).not.toContain('cs_partner');

    // And served publicly, locked down against active content.
    const img = await SELF.fetch(`https://rally.test/logo/${body.logo}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(img.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(img.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await SELF.fetch('https://rally.test/logo/deadbeefdeadbeefdeadbeef')).status).toBe(404);
  });

  it('holds PDFs for the PTA instead of publishing them', async () => {
    await deliverWebhook(partnerSession());
    const res = await upload('cs_partner', new TextEncoder().encode('%PDF-1.4 fake'), 'logo.pdf');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.published).toBe(false);
    expect(body.reason).toBe('pdf');
    const board = await getJson('/api/board');
    expect(board.partners).toEqual([{ name: 'Galaxy Automotive & Tire', tier: LOGO_TIER.id, logo: '' }]);
  });

  it('a later PDF upload never clobbers or un-publishes a live logo', async () => {
    await deliverWebhook(partnerSession());
    const { logo } = await (await upload('cs_partner', PNG)).json();
    const res = await upload('cs_partner', new TextEncoder().encode('%PDF-1.4 print file'), 'print.pdf');
    expect((await res.json()).reason).toBe('pdf');
    // The PNG is still published and still served; the PDF went to the
    // held/original slot instead of the display key.
    const board = await getJson('/api/board');
    expect(board.partners[0].logo).toBe(logo);
    const img = await SELF.fetch(`https://rally.test/logo/${logo}`);
    expect(img.headers.get('content-type')).toBe('image/png');
    const held = await env.LOGOS.get(`partner-logos/${logo}-original`);
    expect(held.httpMetadata.contentType).toBe('application/pdf');
  });

  it('un-publishes when the PTA clears logo_id, even though the file remains', async () => {
    await deliverWebhook(partnerSession());
    const { logo } = await (await upload('cs_partner', PNG)).json();
    expect((await SELF.fetch(`https://rally.test/logo/${logo}`)).status).toBe(200);
    await env.DB.prepare("UPDATE donations SET logo_id = '' WHERE id = 'cs_partner'").run();
    expect((await SELF.fetch(`https://rally.test/logo/${logo}`)).status).toBe(404);
    expect(await env.LOGOS.get(`partner-logos/${logo}`)).not.toBeNull();
  });

  it('keeps a name-only tier\'s file but never promises the wall', async () => {
    await deliverWebhook(sessionEvent({
      id: 'cs_friend', amount_total: NAME_TIER.amount * 100,
      metadata: {
        kind: 'partner', partner_tier: NAME_TIER.id, priority: '',
        donor_name: 'Friendly LLC', students: '', fee_cents: '0',
      },
    }));
    const res = await upload('cs_friend', PNG);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.published).toBe(false);
    expect(body.reason).toBe('tier');
    const board = await getJson('/api/board');
    expect(board.partners).toEqual([{ name: 'Friendly LLC', tier: NAME_TIER.id, logo: '' }]);
  });

  it('accepts an SVG whose <svg> tag sits past a long preamble', async () => {
    await deliverWebhook(partnerSession());
    const svg = '<!--' + 'x'.repeat(2000) + '--><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const res = await upload('cs_partner', new TextEncoder().encode(svg), 'logo.svg');
    expect(res.status).toBe(200);
    const { logo, published } = await res.json();
    expect(published).toBe(true);
    const img = await SELF.fetch(`https://rally.test/logo/${logo}`);
    expect(img.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('answers a broken R2 read with a controlled error, not an exception', async () => {
    await deliverWebhook(partnerSession());
    const { logo } = await (await upload('cs_partner', PNG)).json();
    const res = await worker.fetch(
      new Request(`https://rally.test/logo/${logo}`),
      { ...env, LOGOS: { get() { throw new Error('r2 down'); } } },
      createExecutionContext(),
    );
    expect(res.status).toBe(503);
  });

  it('rejects uploads that aren\'t from a paid partnership', async () => {
    expect((await upload('cs_unknown', PNG)).status).toBe(404);
    await deliverWebhook(sessionEvent()); // a family gift, not a partnership
    expect((await upload('cs_test_abc', PNG)).status).toBe(404);
    expect((await upload('DROP TABLE donations', PNG)).status).toBe(400);
  });

  it('stores the print original alongside a browser-converted logo', async () => {
    await deliverWebhook(partnerSession());
    const send = (orig) => {
      const fd = new FormData();
      fd.append('logo', new File([PNG], 'logo.png'));
      fd.append('original', new File([orig], 'logo.pdf'));
      return SELF.fetch('https://rally.test/api/partner/logo?sid=cs_partner', { method: 'POST', body: fd });
    };
    // A junk "original" is quietly skipped; the logo still publishes.
    expect((await send(new TextEncoder().encode('#!/bin/sh'))).status).toBe(200);
    const { logo } = await (await send(new TextEncoder().encode('%PDF-1.4 original'))).json();
    // (first request stored nothing under -original; second did)
    const orig = await env.LOGOS.get(`partner-logos/${logo}-original`);
    expect(orig).not.toBeNull();
    expect(orig.httpMetadata.contentType).toBe('application/pdf');
    expect(orig.customMetadata.business).toBe('Galaxy Automotive & Tire');
    // The published logo is still the PNG, not the PDF.
    const img = await SELF.fetch(`https://rally.test/logo/${logo}`);
    expect(img.headers.get('content-type')).toBe('image/png');
  });

  it('rejects files that aren\'t logo formats', async () => {
    await deliverWebhook(partnerSession());
    const res = await upload('cs_partner', new TextEncoder().encode('#!/bin/sh\nevil'));
    expect(res.status).toBe(415);
  });
});

/* ---- admin export ---- */

describe('admin export', () => {
  it('requires the admin key', async () => {
    expect((await SELF.fetch('https://rally.test/api/export.csv')).status).toBe(401);
    expect((await SELF.fetch('https://rally.test/api/export.csv?key=wrong')).status).toBe(401);
  });

  it('fails closed when ADMIN_KEY is unset', async () => {
    const res = await worker.fetch(
      new Request('https://rally.test/api/export.csv?key=anything'),
      { ...env, ADMIN_KEY: undefined },
      createExecutionContext(),
    );
    expect(res.status).toBe(401);
  });

  it('returns full records for the PTA, via bearer auth', async () => {
    await deliverWebhook(sessionEvent());
    const res = await SELF.fetch('https://rally.test/api/export.csv', {
      headers: { authorization: 'Bearer test-admin-key' },
    });
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // Excel UTF-8 BOM
    const csv = new TextDecoder().decode(bytes);
    expect(csv).toContain('Mia Rodriguez');
    expect(csv).toContain('priority,partner_tier,students,donor_name');
    expect(csv).toContain(`"Mia Rodriguez — ${data.classroomById(ROOM_A).teacher}"`);
    expect(csv).not.toContain('student_name');
    expect(csv).toContain('fam@example.com');
    expect(csv).toContain('"100.00"');
    // Billing contact details captured from Stripe's checkout page.
    expect(csv).toContain('Rosa Rodriguez');
    expect(csv).toContain('123 Rocket Way');
    expect(csv).toContain('"Tustin","CA","92780","US"');
  });

  it('exports the gift and the fee cover as separate columns', async () => {
    await deliverWebhook(sessionEvent({ amount_total: 10330, metadata: { fee_cents: '330' } }));
    const res = await SELF.fetch('https://rally.test/api/export.csv?key=test-admin-key');
    const csv = await res.text();
    expect(csv).toContain('fee_dollars');
    expect(csv).toContain('"100.00"');
    expect(csv).toContain('"3.30"');
  });

  it('neutralizes spreadsheet formulas in exported names', async () => {
    await deliverWebhook(sessionEvent({
      id: 'cs_evil',
      metadata: {
        donor_name: '=HYPERLINK("http://evil")',
        students: JSON.stringify([{ c: ROOM_A, n: '@SUM(A1)' }]),
      },
    }));
    const res = await SELF.fetch('https://rally.test/api/export.csv?key=test-admin-key');
    const csv = await res.text();
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain(`"'@SUM(A1) — ${data.classroomById(ROOM_A).teacher}"`);
  });
});
