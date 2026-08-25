import { env, SELF, createExecutionContext, reset } from 'cloudflare:test';
import { afterEach, describe, it, expect, vi } from 'vitest';
import worker from '../worker/index.js';

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

const checkoutDirect = (body, envOverride = {}) =>
  worker.fetch(
    new Request('https://rally.test/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { ...env, ...envOverride },
    createExecutionContext(),
  );

const post = (path, body) => SELF.fetch(`https://rally.test${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const validCheckout = {
  priority: 'stem',
  amount: 100,
  link: '',
  classroom: 'convery',
  student: 'Mia Rodriguez',
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
        priority: 'stem',
        classroom: 'convery',
        student_name: 'Mia Rodriguez',
        donor_name: 'The Rodriguez Family',
        visibility: 'public',
        employer_match: '1',
        via_link: '1',
        ...(over.metadata || {}),
      },
    },
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
  it('creates a short memorable code and resolves it', async () => {
    const created = await post('/api/link', { n: 'Mia Rodríguez', c: 'convery' });
    expect(created.status).toBe(200);
    const { code } = await created.json();
    expect(code).toMatch(/^[a-z]+-[a-z]+(-\d{2})?$/);

    const verified = await post('/api/link/verify', { code });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ n: 'Mia Rodríguez', c: 'convery' });
  });

  it('reuses the code for the same student and classroom', async () => {
    const { code } = await (await post('/api/link', { n: 'Leo Park', c: 'zweber' })).json();
    const { code: again } = await (await post('/api/link', { n: '  leo park ', c: 'zweber' })).json();
    expect(again).toBe(code);
    // Same name in a different classroom is a different link.
    const { code: other } = await (await post('/api/link', { n: 'Leo Park', c: 'harrison' })).json();
    expect(other).not.toBe(code);
  });

  it('resolves hand-typed codes case-insensitively', async () => {
    const { code } = await (await post('/api/link', { n: 'Zoe F', c: 'hesseltine' })).json();
    const res = await post('/api/link/verify', { code: `  ${code.toUpperCase()} ` });
    expect(res.status).toBe(200);
  });

  it('rejects unknown and malformed codes', async () => {
    expect((await post('/api/link/verify', { code: 'unlikely-critter' })).status).toBe(400);
    expect((await post('/api/link/verify', { code: 'DROP TABLE links' })).status).toBe(400);
    expect((await post('/api/link/verify', {})).status).toBe(400);
  });

  it('rejects bad payloads', async () => {
    expect((await post('/api/link', { n: '', c: 'convery' })).status).toBe(400);
    expect((await post('/api/link', { n: 'Mia', c: 'r99' })).status).toBe(400);
    expect((await post('/api/link', { n: 'x'.repeat(200), c: 'convery' })).status).toBe(400);
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
    expect(sent.get('metadata[student_name]')).toBe('Mia Rodriguez');
    expect(sent.get('metadata[classroom]')).toBe('convery');
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

  it('a student link overrides hand-typed credit fields', async () => {
    const { code } = await (await post('/api/link', { n: 'Leo Park', c: 'zweber' })).json();
    const calls = stubStripe({ id: 'cs_2', url: 'https://checkout.stripe.com/c/pay/cs_2' });
    const res = await checkoutDirect({ ...validCheckout, link: code });
    expect(res.status).toBe(200);
    const sent = new URLSearchParams(String(calls[0].body));
    expect(sent.get('metadata[student_name]')).toBe('Leo Park');
    expect(sent.get('metadata[classroom]')).toBe('zweber');
    expect(sent.get('metadata[via_link]')).toBe('1');
  });

  it('rejects invalid requests', async () => {
    const bad = async (patch) => (await post('/api/checkout', { ...validCheckout, ...patch })).status;
    expect(await bad({ priority: 'nope' })).toBe(400);
    expect(await bad({ amount: 0 })).toBe(400);
    expect(await bad({ amount: 10.5 })).toBe(400);
    expect(await bad({ amount: 999999 })).toBe(400);
    expect(await bad({ donorName: '' })).toBe(400);            // public needs a name
    expect(await bad({ link: 'forged.token' })).toBe(400);
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

    const res = await SELF.fetch('https://rally.test/api/campaign');
    expect(res.status).toBe(200);
    const text = await res.text();
    const stats = JSON.parse(text);
    expect(stats.campaign).toEqual({ raised: 100, goal: 205000, gifts: 1 });
    expect(stats.priorities.stem).toBe(100);
    expect(stats.classrooms.convery).toBe(1);
    expect(stats.donors).toEqual([{
      name: 'The Rodriguez Family', priority: 'stem', anon: false, circle: false,
    }]);
    // The privacy model: student names, emails, and billing contact
    // details never leave the backend.
    expect(text).not.toContain('Mia');
    expect(text).not.toContain('example.com');
    expect(text).not.toContain('Rosa');
    expect(text).not.toContain('Rocket Way');
    expect(text).not.toContain('92780');
  });

  it('is idempotent across Stripe retries', async () => {
    await deliverWebhook(sessionEvent());
    await deliverWebhook(sessionEvent());
    const stats = await (await SELF.fetch('https://rally.test/api/campaign')).json();
    expect(stats.campaign.gifts).toBe(1);
  });

  it('rejects bad signatures and stale timestamps', async () => {
    const payload = sessionEvent();
    expect((await deliverWebhook(payload, 't=1,v1=deadbeef')).status).toBe(400);
    const stale = await signPayload(payload, 'whsec_test_secret', Math.floor(Date.now() / 1000) - 3600);
    expect((await deliverWebhook(payload, stale)).status).toBe(400);
    const wrongKey = await signPayload(payload, 'whsec_wrong');
    expect((await deliverWebhook(payload, wrongKey)).status).toBe(400);
  });

  it('ignores unpaid sessions', async () => {
    await deliverWebhook(sessionEvent({ payment_status: 'unpaid' }));
    const stats = await (await SELF.fetch('https://rally.test/api/campaign')).json();
    expect(stats.campaign.gifts).toBe(0);
  });

  it('lists anonymous gifts as Anonymous and honors circle tiers', async () => {
    await deliverWebhook(sessionEvent({ id: 'cs_anon', metadata: { visibility: 'anon' } }));
    await deliverWebhook(sessionEvent({
      id: 'cs_circle', amount_total: 250000,
      metadata: { priority: 'people', donor_name: 'The Whitmore Family' },
    }));
    const stats = await (await SELF.fetch('https://rally.test/api/campaign')).json();
    const names = stats.donors.map((d) => d.name);
    expect(names).toContain('Anonymous');
    const circle = stats.donors.find((d) => d.name === 'The Whitmore Family');
    expect(circle.circle).toBe(true);
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
    expect(csv).toContain('fam@example.com');
    expect(csv).toContain('"100.00"');
    // Billing contact details captured from Stripe's checkout page.
    expect(csv).toContain('Rosa Rodriguez');
    expect(csv).toContain('123 Rocket Way');
    expect(csv).toContain('"Tustin","CA","92780","US"');
  });

  it('neutralizes spreadsheet formulas in exported names', async () => {
    await deliverWebhook(sessionEvent({
      id: 'cs_evil',
      metadata: { donor_name: '=HYPERLINK("http://evil")', student_name: '@SUM(A1)' },
    }));
    const res = await SELF.fetch('https://rally.test/api/export.csv?key=test-admin-key');
    const csv = await res.text();
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(csv).toContain('"\'@SUM(A1)"');
  });
});
