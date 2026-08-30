/* Rocket Rally API. Static pages are served from ./site by the assets
   binding; only /api/* reaches this worker. */

import { createLink, resolveLink } from './links.js';
import { normalizeStudents } from './students.js';
import { createCheckoutSession, verifyWebhook } from './stripe.js';
import { recordDonation, campaignStats, boardStats, exportCsv } from './store.js';
import data from '../site/js/data.js';

const { ORG, CAMPAIGN, MAX_NAME, MAX_AMOUNT, MAX_STUDENTS, PARTNER_TIERS, feeCoverCents, priorityById, classroomById } = data;

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

/* A link's stored students, sanity-checked so a stale row (say, a
   classroom removed from the roster) fails cleanly. */
const validLinkStudents = (list) =>
  Array.isArray(list) && list.length >= 1 && list.length <= MAX_STUDENTS &&
  list.every((s) => s && typeof s.n === 'string' && s.n.trim() && s.n.length <= MAX_NAME
    && typeof s.c === 'string' && isClassroom(s.c));

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
  const norm = normalizeStudents(body && body.students, { nameRequired: true });
  if (norm.error || !norm.students.length) {
    return json({ error: norm.error || 'Please give a student name and pick a classroom.' }, 400);
  }
  const code = await createLink(env.DB, norm.students);
  if (!code) return json({ error: 'We couldn’t create the link just now — please try again.' }, 500);
  return json({ code });
}

async function handleLinkVerify(request, env) {
  const body = await request.json().catch(() => null);
  const students = await resolveLink(env.DB, body && body.code);
  if (!validLinkStudents(students)) {
    return json({ error: 'This link is not valid.' }, 400);
  }
  return json({ students: students.map((s) => ({ c: s.c, n: s.n })) });
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

  // The Rockets this gift credits: from the link if there is one,
  // otherwise the wizard's rows (validated here, never trusted).
  let students;
  let viaLink = false;
  if (body.link) {
    const linked = await resolveLink(env.DB, body.link);
    if (!validLinkStudents(linked)) {
      return json({ error: 'That student link is no longer valid — you can still type the student’s name on the previous step.' }, 400);
    }
    students = linked.map((s) => ({ c: s.c, n: s.n }));
    viaLink = true;
  } else {
    const norm = normalizeStudents(body.students);
    if (norm.error) return json({ error: norm.error }, 400);
    students = norm.students;
  }
  // Stripe caps a metadata value at 500 characters. Four 80-character
  // names fit (~425) unless a name is mostly quotes and backslashes.
  const studentsJson = JSON.stringify(students);
  if (studentsJson.length > 500) {
    return json({ error: 'Please shorten the student names.' }, 400);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Online giving isn’t quite open yet — please check back soon!' }, 503);
  }

  // The fee cover is voluntary and computed here, never client-side;
  // the webhook subtracts fee_cents back out so stats count the gift.
  const feeCents = body.coverFees === true ? feeCoverCents(amount * 100) : 0;

  const session = await createCheckoutSession(env, {
    amountCents: amount * 100,
    productName: `Rocket Rally — ${priority.name}`,
    feeCents,
    feeName: 'Covering card processing',
    description: TAX_ACKNOWLEDGMENT,
    successUrl: `${url.origin}/thanks?p=${priority.id}&amt=${amount}&sid={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${url.origin}/donate?p=${priority.id}`,
    metadata: {
      priority: priority.id,
      students: studentsJson,
      donor_name: donorName,
      visibility,
      employer_match: body.match ? '1' : '0',
      via_link: viaLink ? '1' : '0',
      fee_cents: String(feeCents),
    },
  });
  if (!session) {
    return json({ error: 'Our payment processor had a hiccup — nothing was charged. Please try again in a minute.' }, 502);
  }
  return json({ url: session.url });
}

/* A business picks a tier on /partners and pays its fixed price —
   no fee cover, no classroom credit; the tier rides in metadata. */
async function handlePartnerCheckout(request, env, url) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Please try that again.' }, 400);
  const tier = PARTNER_TIERS.find((t) => t.id === body.tier);
  if (!tier) return json({ error: 'Please pick a partnership level.' }, 400);
  const business = typeof body.business === 'string' ? body.business.trim().slice(0, MAX_NAME) : '';
  if (!business) return json({ error: 'Please tell us your business name.' }, 400);
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Online giving isn’t quite open yet — please check back soon!' }, 503);
  }
  // Same voluntary fee cover as family gifts; the webhook subtracts
  // fee_cents so the partnership counts at its tier price.
  const feeCents = body.coverFees === true ? feeCoverCents(tier.amount * 100) : 0;
  const session = await createCheckoutSession(env, {
    amountCents: tier.amount * 100,
    productName: `Rocket Rally Partnership — ${tier.name}`,
    feeCents,
    feeName: 'Covering card processing',
    // PTA decision: partner receipts carry the standard acknowledgment
    // — logo placement and posts are intangible recognition, not goods
    // or services.
    description: TAX_ACKNOWLEDGMENT,
    successUrl: `${url.origin}/thanks?partner=${tier.id}&sid={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${url.origin}/partners`,
    metadata: {
      kind: 'partner',
      partner_tier: tier.id,
      donor_name: business,
      visibility: 'public',
      fee_cents: String(feeCents),
    },
  });
  if (!session) {
    return json({ error: 'Our payment processor had a hiccup — nothing was charged. Please try again in a minute.' }, 502);
  }
  return json({ url: session.url });
}

/* A partner's logo, uploaded from the thank-you page. The Stripe
   session id in the success URL is the capability: uploads are only
   accepted for a session the webhook has recorded as a partnership.
   Image uploads auto-publish (served at /logo/<opaque id> and merged
   into the partner wall and board strip); PDFs are stored for the PTA
   to convert. Clearing donations.logo_id un-publishes a logo. */
const LOGO_MAX_BYTES = 15 * 1024 * 1024;

/* The public address of a logo is a hash — never the session id
   itself, which is the upload capability. */
const logoPublicId = async (sid) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`logo:${sid}`));
  return [...new Uint8Array(digest)].slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
};

const sniffLogoType = (buf) => {
  const b = new Uint8Array(buf);
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  // 8 KB window: real-world SVGs open with long comment/DOCTYPE preambles.
  const head = new TextDecoder().decode(b.slice(0, 8192)).trimStart().toLowerCase();
  if (head.startsWith('<') && head.includes('<svg')) return 'image/svg+xml';
  return null;
};

async function handleLogoUpload(request, env, url) {
  if (!env.LOGOS) return json({ error: 'Logo uploads aren’t open yet — please email us the file.' }, 503);
  const sid = url.searchParams.get('sid') || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return json({ error: 'This upload link isn’t valid.' }, 400);
  const row = await env.DB.prepare(
    "SELECT donor_name, partner_tier FROM donations WHERE id = ?1 AND partner_tier != ''")
    .bind(sid).first();
  if (!row) {
    return json({ error: 'We’re still confirming your payment — give it a few seconds and try again.' }, 404);
  }
  const form = await request.formData().catch(() => null);
  const file = form && form.get('logo');
  if (!file || typeof file === 'string') return json({ error: 'Please choose a logo file.' }, 400);
  if (file.size > LOGO_MAX_BYTES) return json({ error: 'That file is over 15 MB — a smaller export works great.' }, 413);
  const bytes = await file.arrayBuffer();
  const type = sniffLogoType(bytes);
  if (!type) return json({ error: 'Please upload a PNG, JPG, WebP, SVG, or PDF.' }, 415);

  const publicId = await logoPublicId(sid);
  const meta = (name) => ({
    business: row.donor_name, sid, filename: String(name || '').slice(0, 120),
  });
  // The ladder: logo placement starts at Rally Supporter. A Friend's
  // file is kept for the PTA but never published or promised.
  const tierAllowsLogo = row.partner_tier !== 'friend';

  // <img> can render everything but PDF. A PDF (browser conversion
  // failed, or a direct upload) goes to the held/original slot so it
  // can never clobber a published image or be served from /logo/ —
  // any logo already live stays live.
  if (type === 'application/pdf') {
    await env.LOGOS.put(`partner-logos/${publicId}-original`, bytes, {
      httpMetadata: { contentType: type },
      customMetadata: meta(file.name),
    });
    return json({ ok: true, published: false, reason: tierAllowsLogo ? 'pdf' : 'tier', logo: '' });
  }

  await env.LOGOS.put(`partner-logos/${publicId}`, bytes, {
    httpMetadata: { contentType: type },
    customMetadata: meta(file.name),
  });
  // A browser-side PDF conversion sends the print-quality original
  // along too — stored for the shirt/banner printers, never served.
  const orig = form.get('original');
  if (orig && typeof orig !== 'string' && orig.size > 0 && orig.size <= LOGO_MAX_BYTES) {
    const origBytes = await orig.arrayBuffer();
    if (sniffLogoType(origBytes) === 'application/pdf') {
      await env.LOGOS.put(`partner-logos/${publicId}-original`, origBytes, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: meta(orig.name),
      });
    }
  }
  if (!tierAllowsLogo) {
    return json({ ok: true, published: false, reason: 'tier', logo: '' });
  }
  await env.DB.prepare('UPDATE donations SET logo_id = ?2 WHERE id = ?1')
    .bind(sid, publicId).run();
  return json({ ok: true, published: true, logo: publicId });
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
      // Published partner logos, addressed by opaque public id only.
      const logo = url.pathname.match(/^\/logo\/([0-9a-f]{24})$/);
      if (logo && request.method === 'GET' && env.LOGOS) {
        try {
          // Published means a donation row still points here — clearing
          // logo_id (the kill switch) un-publishes the direct URL too,
          // even though the stored file remains.
          const published = await env.DB.prepare(
            'SELECT 1 AS ok FROM donations WHERE logo_id = ?1').bind(logo[1]).first();
          const obj = published ? await env.LOGOS.get(`partner-logos/${logo[1]}`) : null;
          if (obj) {
            return new Response(obj.body, {
              headers: {
                'content-type': obj.httpMetadata?.contentType || 'application/octet-stream',
                // Short cache, so a pulled logo disappears within minutes.
                'cache-control': 'public, max-age=300',
                // An uploaded SVG is an active document if opened directly
                // — this keeps it inert; nosniff pins every type.
                'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
                'x-content-type-options': 'nosniff',
              },
            });
          }
        } catch (err) {
          console.error(JSON.stringify({
            event: 'api_error', route: 'GET /logo', message: err && err.message,
          }));
          return new Response('', { status: 503 });
        }
      }
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
        case 'POST /api/partner/checkout': return await handlePartnerCheckout(request, env, url);
        case 'POST /api/partner/logo': return await handleLogoUpload(request, env, url);
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
