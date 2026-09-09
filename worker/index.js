/* The Rocket Rally worker: /api/*, /l/<code> short links, /logo/<id>
   serving, and every page — the static HTML under ./site rendered
   through pages.js with the shared chrome and live slots (the branded
   404 included). Files are served by the assets binding; see
   run_worker_first in wrangler.jsonc. */

import { createLink, resolveLink } from './links.js';
import { normalizeStudents, shirtsMetadata } from './students.js';
import { createCheckoutSession, verifyWebhook } from './stripe.js';
import { recordDonation, campaignStats, boardStats, studentsReport, shirtsReport, classroomsReport, csv,
  recordOfflineGift, deleteOfflineGift, offlineGifts } from './store.js';
import { renderPage } from './pages.js';
import data from '../site/js/data.js';
import ui from '../site/js/ui.js';

const { moneyCents } = ui;
const { ORG, MAX_NAME, MAX_AMOUNT, SHIRT, feeCoverCents, priorityById, partnerTierById } = data;

/* The charge description prints on every Stripe receipt, making it the
   donor's IRS written acknowledgment (Pub 1771): org name, and either
   the no-goods-or-services statement or, when the payment bought
   shirts, their description and good-faith value with the deductible
   remainder; date is on the receipt itself. Required for donors to
   deduct gifts of $250+ — edit with care. */
const TAX_ACKNOWLEDGMENT = (totalCents, shirts) => {
  const org = `Tax-deductible donation to ${ORG.name}${ORG.ein ? ` (EIN ${ORG.ein})` : ''}.`;
  if (!shirts) return `${org} No goods or services were provided in exchange for this contribution.`;
  const value = shirts * SHIRT.value * 100;
  return `${org} Of this ${moneyCents(totalCents)} payment, ${moneyCents(value)} is the estimated fair market value of ` +
    `${shirts} Rocket Rally shirt${shirts === 1 ? '' : 's'} provided in return; ` +
    `the remaining ${moneyCents(totalCents - value)} is a contribution for which no other goods or services were provided.`;
};

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

/* A link's stored students, re-validated against today's roster so a
   stale row (say, a classroom removed) fails cleanly. Null when the
   code is unknown or its list no longer passes. */
const linkStudents = async (db, code) => {
  const norm = normalizeStudents(await resolveLink(db, code), { nameRequired: true });
  return norm.error || !norm.students.length ? null : norm.students;
};

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
  const students = await linkStudents(env.DB, body && body.code);
  if (!students) return json({ error: 'This link is not valid.' }, 400);
  return json({ students });
}

/* The half of checkout both flows share: the Stripe key guard, the
   voluntary fee cover (computed here, never client-side — the webhook
   subtracts fee_cents back out so stats count the gift), the receipt
   description, and the hand-off to Stripe's page. */
const startCheckout = async (env, { amountCents, shirts = 0, coverFees, productName, successUrl, cancelUrl, metadata }) => {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Online giving isn’t quite open yet — please check back soon!' }, 503);
  }
  const lineItems = [];
  if (amountCents > 0) lineItems.push({ name: productName, cents: amountCents });
  if (shirts > 0) lineItems.push({ name: 'Rocket Rally shirt', cents: SHIRT.price * 100, quantity: shirts });
  const charged = amountCents + shirts * SHIRT.price * 100;
  const feeCents = coverFees === true ? feeCoverCents(charged) : 0;
  if (feeCents > 0) lineItems.push({ name: 'Covering processing fees', cents: feeCents });
  const session = await createCheckoutSession(env, {
    lineItems,
    description: TAX_ACKNOWLEDGMENT(charged + feeCents, shirts),
    successUrl,
    cancelUrl,
    metadata: { ...metadata, fee_cents: String(feeCents) },
  });
  if (!session) {
    return json({ error: 'Our payment processor had a hiccup — nothing was charged. Please try again in a minute.' }, 502);
  }
  return json({ url: session.url });
};

async function handleCheckout(request, env, url) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Please try that again.' }, 400);

  const priority = priorityById(body.priority);
  if (!priority) return json({ error: 'Please pick a priority to fund.' }, 400);

  // $0 is allowed for a shirt-only order; that is checked once the
  // Rockets and their shirts are known.
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return json({ error: `Please choose a whole-dollar amount between $1 and $${MAX_AMOUNT.toLocaleString('en-US')}.` }, 400);
  }

  const visibility = body.visibility === 'anon' ? 'anon' : 'public';
  const donorName = typeof body.donorName === 'string' ? body.donorName.trim().slice(0, MAX_NAME) : '';
  if (visibility === 'public' && !donorName) {
    return json({ error: 'Please tell us the name to list — or choose anonymous.' }, 400);
  }

  // The Rockets this gift credits: from the link if there is one,
  // otherwise the wizard's rows (validated here, never trusted).
  let raw = body.students;
  let viaLink = false;
  if (body.link) {
    const linked = await linkStudents(env.DB, body.link);
    if (!linked) {
      // `reason` lets the wizard drop the dead link and show the rows.
      return json({ error: 'That student link is no longer valid — you can still type the student’s name on the previous step.', reason: 'link' }, 400);
    }
    // The wizard's shirt sizes arrive in link order, one list per Rocket.
    const shirts = Array.isArray(body.shirts) ? body.shirts : [];
    raw = linked.map((st, i) => ({ ...st, s: shirts[i] }));
    viaLink = true;
  }
  const norm = normalizeStudents(raw);
  if (norm.error) return json({ error: norm.error }, 400);
  const students = norm.students;
  const shirts = students.reduce((n, st) => n + (st.s ? st.s.length : 0), 0);
  if (!amount && !shirts) {
    return json({ error: 'Please choose a gift amount, or add a Rally shirt.' }, 400);
  }
  // Stripe caps a metadata value at 500 characters. Four 80-character
  // names fit (~425) unless a name is mostly quotes and backslashes.
  const studentsJson = JSON.stringify(students.map(({ c, n }) => ({ c, n })));
  if (studentsJson.length > 500) {
    return json({ error: 'Please shorten the student names.' }, 400);
  }

  return startCheckout(env, {
    amountCents: amount * 100,
    shirts,
    coverFees: body.coverFees,
    productName: `Rocket Rally — ${priority.name}`,
    successUrl: `${url.origin}/thanks?p=${priority.id}&amt=${amount}&shirts=${shirts}&sid={CHECKOUT_SESSION_ID}`,
    // Backing out of Stripe returns to the wizard with the link intact.
    cancelUrl: `${url.origin}/donate?p=${priority.id}${viaLink ? `&link=${encodeURIComponent(body.link)}` : ''}`,
    metadata: {
      priority: priority.id,
      students: studentsJson,
      shirts: shirtsMetadata(students),
      donor_name: donorName,
      visibility,
      employer_match: body.match ? '1' : '0',
      via_link: viaLink ? '1' : '0',
    },
  });
}

/* A business picks a tier on /partners and pays its fixed price — no
   classroom credit; the tier rides in metadata. */
async function handlePartnerCheckout(request, env, url) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Please try that again.' }, 400);
  const tier = partnerTierById(body.tier);
  if (!tier) return json({ error: 'Please pick a partnership level.' }, 400);
  const business = typeof body.business === 'string' ? body.business.trim().slice(0, MAX_NAME) : '';
  if (!business) return json({ error: 'Please tell us your business name.' }, 400);
  return startCheckout(env, {
    amountCents: tier.amount * 100,
    coverFees: body.coverFees,
    productName: `Rocket Rally Partnership — ${tier.name}`,
    successUrl: `${url.origin}/thanks?partner=${tier.id}&sid={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${url.origin}/partners`,
    metadata: {
      kind: 'partner',
      partner_tier: tier.id,
      donor_name: business,
      visibility: 'public',
    },
  });
}

/* A partner's logo, uploaded from the thank-you page. The Stripe
   session id in the success URL is the capability: uploads are only
   accepted for a session the webhook has recorded as a partnership. */
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
  // Sniffing needs only the head; the file itself streams to R2.
  const sniff = (blob) => blob.slice(0, 8192).arrayBuffer().then(sniffLogoType);
  const type = await sniff(file);
  if (!type) return json({ error: 'Please upload a PNG, JPG, WebP, SVG, or PDF.' }, 415);

  const publicId = await logoPublicId(sid);
  const meta = (name) => ({
    business: row.donor_name, sid, filename: String(name || '').slice(0, 120),
  });
  // The ladder decides: a tier without `logo` (Rally Friend) has its
  // file kept for the PTA but never published or promised.
  const tierAllowsLogo = !!partnerTierById(row.partner_tier)?.logo;

  // <img> can render everything but PDF. A PDF (browser conversion
  // failed, or a direct upload) goes to the held/original slot so it
  // can never clobber a published image or be served from /logo/ —
  // any logo already live stays live.
  if (type === 'application/pdf') {
    await env.LOGOS.put(`partner-logos/${publicId}-original`, file, {
      httpMetadata: { contentType: type },
      customMetadata: meta(file.name),
    });
    return json({ ok: true, published: false, reason: tierAllowsLogo ? 'pdf' : 'tier', logo: '' });
  }

  const puts = [env.LOGOS.put(`partner-logos/${publicId}`, file, {
    httpMetadata: { contentType: type },
    customMetadata: meta(file.name),
  })];
  // A browser-side PDF conversion sends the print-quality original
  // along too — stored for the shirt/banner printers, never served.
  const orig = form.get('original');
  if (orig && typeof orig !== 'string' && orig.size > 0 && orig.size <= LOGO_MAX_BYTES
      && await sniff(orig) === 'application/pdf') {
    puts.push(env.LOGOS.put(`partner-logos/${publicId}-original`, orig, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: meta(orig.name),
    }));
  }
  await Promise.all(puts);
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
    // Only sessions this worker created carry our metadata; anything
    // else on the account (a Payment Link, a Dashboard sale) is not
    // a Rally gift.
    const meta = session.metadata || {};
    const ours = !!meta.priority || meta.kind === 'partner';
    if (ours && session.payment_status === 'paid') {
      await recordDonation(env.DB, session, event.created);
    }
  }
  return json({ received: true });
}

/* The PTA's reports: each as a CSV, and all three at once as JSON
   for /admin. Prefer `Authorization: Bearer <ADMIN_KEY>` — the ?key=
   form works too but leaves the key in browser history and logged
   request URLs. */
const REPORTS = { students: studentsReport, shirts: shirtsReport, classrooms: classroomsReport };

const adminKeyOk = async (request, url, env) => {
  const auth = request.headers.get('authorization') || '';
  const key = (auth.startsWith('Bearer ') ? auth.slice(7) : '') ||
    url.searchParams.get('key') || '';
  return !!env.ADMIN_KEY && await timingSafeStringEqual(key, env.ADMIN_KEY);
};

/* A gift the PTA took in by hand: a check left in the office, cash at a
   Gathering. Validated exactly like a card gift — the same amount
   limits, the same roster check on the Rockets — because it reaches
   the same tables and the same public totals. */
async function handleOfflineGift(request, env, url) {
  if (!(await adminKeyOk(request, url, env))) return json({ error: 'unauthorized' }, 401);

  if (request.method === 'DELETE') {
    const removed = await deleteOfflineGift(env.DB, url.searchParams.get('id') || '');
    return removed ? json({ removed: true }) : json({ error: 'That gift is no longer here.' }, 404);
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Please try that again.' }, 400);

  const priority = priorityById(body.priority);
  if (!priority) return json({ error: 'Pick which priority this gift is for.' }, 400);

  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return json({ error: `Enter a whole-dollar amount between $1 and $${MAX_AMOUNT.toLocaleString('en-US')}.` }, 400);
  }

  const visibility = body.visibility === 'anon' ? 'anon' : 'public';
  const donorName = typeof body.donorName === 'string' ? body.donorName.trim().slice(0, MAX_NAME) : '';
  if (visibility === 'public' && !donorName) {
    return json({ error: 'Enter the name to list on the honor roll, or mark it anonymous.' }, 400);
  }

  const norm = normalizeStudents(body.students);
  if (norm.error) return json({ error: norm.error }, 400);

  const id = await recordOfflineGift(env.DB, {
    amountCents: amount * 100,
    priority: priority.id,
    donorName,
    visibility,
    // A shirt is bought, never recorded by hand, so sizes are dropped.
    students: norm.students.map((s) => ({ c: s.c, n: s.n })),
    createdSec: Math.floor(Date.now() / 1000),
  });
  return json({ id });
}

async function handleReport(request, url, env, name) {
  if (!(await adminKeyOk(request, url, env))) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (name === 'admin') {
    const [stats, ...reports] = await Promise.all([
      campaignStats(env.DB), ...Object.values(REPORTS).map((report) => report(env.DB)),
    ]);
    const body = { campaign: stats.campaign, offline: await offlineGifts(env.DB) };
    Object.keys(REPORTS).forEach((key, i) => { body[key] = reports[i]; });
    return json(body, 200, { 'cache-control': 'no-store' });
  }
  return new Response(csv(await REPORTS[name](env.DB)), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="rocket-rally-${name}.csv"`,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // One canonical host, so shared links and search results agree.
    if (url.hostname === 'www.rocketrally.org') {
      url.hostname = 'rocketrally.org';
      return Response.redirect(url.toString(), 301);
    }
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
      // Everything else is a page: the static HTML with the shared
      // chrome and live slots streamed in (the branded 404 included).
      try {
        return await renderPage(request, env);
      } catch (err) {
        console.error(JSON.stringify({
          event: 'api_error', route: `GET ${url.pathname}`, message: err && err.message,
        }));
        return new Response('Something went wrong on our end — please try again.', {
          status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    }
    const route = `${request.method} ${url.pathname}`;
    try {
      switch (route) {
        case 'GET /api/campaign':
          return json(await campaignStats(env.DB), 200, { 'cache-control': 'public, max-age=60' });
        case 'GET /api/board':
          return json(await boardStats(env.DB), 200, { 'cache-control': 'public, max-age=60' });
        case 'POST /api/link': return await handleLinkCreate(request, env);
        case 'POST /api/link/verify': return await handleLinkVerify(request, env);
        case 'POST /api/checkout': return await handleCheckout(request, env, url);
        case 'POST /api/partner/checkout': return await handlePartnerCheckout(request, env, url);
        case 'POST /api/partner/logo': return await handleLogoUpload(request, env, url);
        case 'POST /api/stripe/webhook': return await handleWebhook(request, env);
        case 'POST /api/offline-gift':
        case 'DELETE /api/offline-gift': return await handleOfflineGift(request, env, url);
        case 'GET /api/students.csv':
        case 'GET /api/shirts.csv':
        case 'GET /api/classrooms.csv':
        case 'GET /api/admin.json':
          return await handleReport(request, url, env, url.pathname.slice(5).replace(/\.(csv|json)$/, ''));
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
