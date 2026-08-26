/* Rocket Rally API. Static pages are served from ./site by the assets
   binding; only /api/* reaches this worker. */

import { createLink, resolveLink } from './links.js';
import { createCheckoutSession, verifyWebhook } from './stripe.js';
import { recordDonation, campaignStats, boardStats, exportCsv } from './store.js';
import data from '../site/js/data.js';

const { ORG, CAMPAIGN, MAX_NAME, MAX_AMOUNT, priorityById, classroomById } = data;

/* The charge description prints on every Stripe receipt, making it the
   donor's IRS written acknowledgment (Pub 1771): org name + the
   no-goods-or-services statement; amount and date are on the receipt
   itself. Required for donors to deduct gifts of $250+ — edit with
   care. */
const TAX_ACKNOWLEDGMENT =
  `Tax-deductible donation to ${ORG.name}` +
  (ORG.ein ? ` (EIN ${ORG.ein})` : '') +
  '. No goods or services were provided in exchange for this contribution.';

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

const isClassroom = (id) => !!classroomById(id);

/* {n: student name, c: classroom id} — sanity-check resolved links so a
   stale row (say, a classroom removed from the roster) fails cleanly. */
const validLinkPayload = (p) =>
  p && typeof p.n === 'string' && p.n.trim() && p.n.length <= MAX_NAME && isClassroom(p.c);

const timingSafeStringEqual = async (a, b) => {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  return crypto.subtle.timingSafeEqual(new Uint8Array(ha), new Uint8Array(hb));
};

async function handleLinkCreate(request, env) {
  const body = await request.json().catch(() => null);
  const name = body && typeof body.n === 'string' ? body.n.trim() : '';
  if (!body || !name || name.length > MAX_NAME || !isClassroom(body.c)) {
    return json({ error: 'Please give a student name and pick a classroom.' }, 400);
  }
  const code = await createLink(env.DB, name, body.c);
  if (!code) return json({ error: 'We couldn’t create the link just now — please try again.' }, 500);
  return json({ code });
}

async function handleLinkVerify(request, env) {
  const body = await request.json().catch(() => null);
  const payload = await resolveLink(env.DB, body && body.code);
  if (!validLinkPayload(payload)) {
    return json({ error: 'This link is not valid.' }, 400);
  }
  return json({ n: payload.n, c: payload.c });
}

async function handleCheckout(request, env, url) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Please try that again.' }, 400);

  const priority = priorityById(body.priority);
  if (!priority) return json({ error: 'Please pick a priority to fund.' }, 400);

  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return json({ error: `Please choose a whole-dollar amount between $1 and $${MAX_AMOUNT.toLocaleString('en-US')}.` }, 400);
  }

  const visibility = body.visibility === 'anon' ? 'anon' : 'public';
  const donorName = typeof body.donorName === 'string' ? body.donorName.trim().slice(0, MAX_NAME) : '';
  if (visibility === 'public' && !donorName) {
    return json({ error: 'Please tell us the name to list — or choose anonymous.' }, 400);
  }

  let student = typeof body.student === 'string' ? body.student.trim().slice(0, MAX_NAME) : '';
  let classroom = isClassroom(body.classroom) ? body.classroom : '';
  let viaLink = false;
  if (body.link) {
    const payload = await resolveLink(env.DB, body.link);
    if (!validLinkPayload(payload)) {
      return json({ error: 'That student link is no longer valid — you can still type the student’s name on the previous step.' }, 400);
    }
    student = payload.n;
    classroom = payload.c;
    viaLink = true;
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Online giving isn’t quite open yet — please check back soon!' }, 503);
  }

  const session = await createCheckoutSession(env, {
    amountCents: amount * 100,
    productName: `Rocket Rally — ${priority.name}`,
    description: TAX_ACKNOWLEDGMENT,
    successUrl: `${url.origin}/thanks?p=${priority.id}&amt=${amount}&sid={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${url.origin}/donate?p=${priority.id}`,
    metadata: {
      priority: priority.id,
      classroom,
      student_name: student,
      donor_name: donorName,
      visibility,
      employer_match: body.match ? '1' : '0',
      via_link: viaLink ? '1' : '0',
    },
  });
  if (!session) {
    return json({ error: 'Our payment processor had a hiccup — nothing was charged. Please try again in a minute.' }, 502);
  }
  return json({ url: session.url });
}

async function handleWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'webhook not configured' }, 503);
  const payload = await request.text();
  const ok = await verifyWebhook(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: 'invalid signature' }, 400);

  const event = JSON.parse(payload);
  if (event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      await recordDonation(env.DB, session, event.created);
    }
  }
  return json({ received: true });
}

/* Prefer `Authorization: Bearer <ADMIN_KEY>` — the ?key= form works too
   but leaves the key in browser history and logged request URLs. */
async function handleExport(request, url, env) {
  const auth = request.headers.get('authorization') || '';
  const key = (auth.startsWith('Bearer ') ? auth.slice(7) : '') ||
    url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || !(await timingSafeStringEqual(key, env.ADMIN_KEY))) {
    return json({ error: 'unauthorized' }, 401);
  }
  return new Response(await exportCsv(env.DB), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="rocket-rally-donations.csv"',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      // The typeable short link off flyers and handouts: /l/sunny-otter.
      const short = url.pathname.match(/^\/l\/([A-Za-z0-9-]{1,40})\/?$/);
      if (short) {
        return Response.redirect(
          `${url.origin}/donate?link=${short[1].toLowerCase()}`, 302);
      }
      // Only paths that matched no asset reach the worker — serve the
      // branded 404 page (as a real 404, not the asset layer's 200).
      const page = await env.ASSETS.fetch(new Request(`${url.origin}/404`));
      return new Response(page.body, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    const route = `${request.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /api/campaign':
          return json(await campaignStats(env.DB, { CAMPAIGN }),
            200, { 'cache-control': 'public, max-age=60' });
        case 'GET /api/board':
          return json(await boardStats(env.DB, { CAMPAIGN }),
            200, { 'cache-control': 'public, max-age=60' });
        case 'POST /api/link': return await handleLinkCreate(request, env);
        case 'POST /api/link/verify': return await handleLinkVerify(request, env);
        case 'POST /api/checkout': return await handleCheckout(request, env, url);
        case 'POST /api/stripe/webhook': return await handleWebhook(request, env);
        case 'GET /api/export.csv': return await handleExport(request, url, env);
        default: return json({ error: 'not found' }, 404);
      }
    } catch (err) {
      console.error(JSON.stringify({
        event: 'api_error', route, message: err && err.message,
      }));
      return json({ error: 'Something went wrong on our end — please try again.' }, 500);
    }
  },
};
