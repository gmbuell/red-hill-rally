# Rocket Rally — Production on Cloudflare (design)

Turns the finished design prototype in `site/` into the production site:
real payments, real tallies, signed student links, hosted on Cloudflare.
Front-end design/UX is done and unchanged except where mock data is
replaced by live data.

## Architecture

One **Cloudflare Worker** (`red-hill-rally`) serves everything:

- **Static assets** — the existing `site/` directory, unmodified build-free
  HTML/CSS/JS (user's zero-tooling choice stands; wrangler bundles only
  the worker script).
- **API routes** under `/api/*`, handled by the worker:

| Route | Purpose |
|---|---|
| `GET /api/campaign` | Live totals: raised per priority + overall, gifts per classroom, public honor roll. 60 s cache. |
| `POST /api/link` | Stores `{n: student, c: classroom}` in the D1 `links` table under a short memorable adjective-animal code (`sunny-otter`); one code per student+classroom (re-creating returns the same code). Shared as `/l/<code>`, which 302s into the donate wizard. (History: v1 used stateless HMAC-signed tokens — unguessable but far too long to hand-type off a flyer; replaced 2026-08-25 and `LINK_SIGNING_KEY` retired.) |
| `POST /api/link/verify` | Resolves a code (case/whitespace-tolerant) so the donate page can show the prefill chip. Invalid → 400, page falls back to no-link. Codes are guessable by design — the accepted trade for typeability; a hit reveals the chip contents (student name + classroom). |
| `POST /api/checkout` | Validates the wizard state, creates a Stripe Checkout Session (direct `fetch` to Stripe's REST API — no SDK), returns `{url}`. Student name, classroom, donor name, visibility, employer-match flag travel in session `metadata`. The wizard collects no email — Stripe's page collects it (receipt) plus the full billing address (`billing_address_collection=required`); both come back in the webhook's `customer_details` and are stored for PTA outreach. Missing `STRIPE_SECRET_KEY` → 503 with a friendly "giving opens soon" message. |
| `POST /api/stripe/webhook` | Verifies the Stripe signature (HMAC, timing-safe), records `checkout.session.completed` payments. Idempotent on session id. |
| `GET /api/export.csv?key=` | Admin-only (ADMIN_KEY secret, timing-safe compare): full donation records — the PTA backend view where student names and emails are allowed. |

- **Donation store: D1** (`red-hill-rally` database), one row per
  Stripe session with the session id as primary key, so webhook
  retries are idempotent inserts (`ON CONFLICT DO NOTHING`).
  `/api/campaign` aggregates with one batched set of SQL queries
  (strongly consistent — gifts appear on the board as soon as the
  webhook lands, modulo the 60 s browser cache), and the admin export
  is a single `SELECT`. (History: v1 shipped on Workers KV because the
  API token initially lacked D1 permissions; once the token was fixed
  the store — isolated in `worker/store.js` — was migrated to D1
  while it held zero donations, and the KV namespace was deleted.)

## Data flow changes in `site/`

- `js/data.js` stays the single source for **static** campaign config
  (priority copy/goals/tiers, classroom roster) and gains a CommonJS
  export tail so the worker imports the same file for validation.
  All **mock live numbers go away**: `raised`, `gifts`, `DONORS`.
- `home.js` / `board.js` fetch `/api/campaign` and render live numbers;
  API failure renders zeros; empty honor roll gets a "be the first"
  empty state.
- `donate.js`: `?link=` is verified via the API; "Continue to payment"
  POSTs to `/api/checkout` and redirects to Stripe; errors render inline
  (aria-live). The employer-match checkbox is now actually sent.
- `student-link.js` requests the signed token from `/api/link` instead
  of client-side base64.
- The thanks page is the Stripe `success_url`
  (`/thanks?p=…&amt=…&sid={CHECKOUT_SESSION_ID}`) — existing
  personalization keeps working with no API call.

## Privacy invariants (unchanged, now enforced server-side)

- `/api/campaign` never returns student names, emails, or billing
  contact details; anonymous donors are returned as "Anonymous" with no
  identifying fields.
- Student names exist only in D1 rows + Stripe metadata (PTA backend),
  surfaced solely through the admin export. The same rule covers the
  donor's email and billing name/address captured on Stripe's page.
- Classroom race ranks by participation (gifts ÷ families), never dollars.
- Circle labels (Counselor Circle / Season Patron) are computed
  server-side from amount ≥ $2,500 on `people`/`arts`; amounts
  themselves are not published.

## Secrets & config

- `ADMIN_KEY` — generated and set at deploy time (value kept in the
  gitignored `.dev.vars`).
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — only the PTA's Stripe
  account can supply these; until set, the site is fully live except
  checkout returns the friendly 503.
- `wrangler.jsonc`: current `compatibility_date`, `nodejs_compat`,
  `observability` enabled, D1 binding `DB` (migrations in
  `migrations/`), assets from `site/`.
- Clean URLs: the assets layer serves `/donate`, `/rally-board`, etc.
  (it 307s `.html` requests), so all internal links and the Stripe
  success/cancel URLs use the extensionless form.

## Testing & verification

- Vitest + `@cloudflare/vitest-pool-workers`: link sign/verify/tamper,
  checkout validation + unconfigured-Stripe 503 + Stripe call shape
  (fetchMock), webhook signature verify + idempotent insert, campaign
  aggregation privacy (no student names in output).
- Smoke: `wrangler dev` + curl per endpoint, then deployed-URL checks
  and a browser pass (mobile 390 px) against the live site.

## Deploy target

`https://red-hill-rally.gmbuell.workers.dev` (default workers.dev
route; a custom/PTA domain can be attached later in the dashboard
without code changes).

## Launch checklist left for the PTA (only-user-can-do items)

1. Replace the invented classroom roster in `site/js/data.js` with the
   real one; redeploy.
2. `wrangler secret put STRIPE_SECRET_KEY` (live key).
3. Create a Stripe webhook endpoint → `/api/stripe/webhook`, events
   `checkout.session.completed` **and**
   `checkout.session.async_payment_succeeded`;
   `wrangler secret put STRIPE_WEBHOOK_SECRET`.
4. Enable email receipts in Stripe dashboard (the UI promises a receipt).
