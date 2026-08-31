# Rocket Rally — Red Hill Elementary PTA

The Rocket Rally fundraising site: static pages (`site/`, no build
step) plus a small Cloudflare Worker (`worker/`) for Stripe Checkout,
short student links, and live tallies in a D1 database.

**Live:** <https://red-hill-rally.gmbuell.workers.dev>

Design and architecture notes: `docs/design-decisions.md` and
`docs/superpowers/specs/2026-08-25-production-cloudflare-design.md`.

## Develop

```sh
npm install
npm run dev      # wrangler dev on http://localhost:8787
npm test         # vitest (workers pool) — API, webhook, privacy tests
npm run audit    # Lighthouse: every page, mobile + desktop
```

Local secrets live in `.dev.vars` (gitignored — currently also holds
the production `ADMIN_KEY` value).

**Rally Board skeleton** — rally-board.html ships with the board's
zero-state markup baked in (no layout shift on first paint; a real
board for no-JS visitors). After editing the classroom roster in
`site/js/data.js` or the board templates in `site/js/board.js`, run
`node scripts/board-skeleton.js --write` to regenerate it; `npm test`
and `npm run deploy` fail if it drifts.

**Demo data** — `seed/demo-donations.sql` fills the board with
prototype-style numbers on the real roster ($127,450 raised, 311
gifts, full honor roll). Apply/remove commands are in the file header;
it replaces whatever is in the donations and links tables.

## Deploy

```sh
npm run deploy
```

That ships the worker and every file under `site/` in one go. The
`predeploy` step first checks the baked board skeleton and applies any
pending D1 migrations to the remote database (`wrangler d1 migrations
apply red-hill-rally --remote`), so schema and code always ship
together.

## Before the campaign goes out to families

The site is currently wired to the Stripe **sandbox**: the full flow
works end to end with test cards (`4242 4242 4242 4242`), and nothing
charges real money. To flip to live:

1. **Live Stripe key** — `npx wrangler secret put STRIPE_SECRET_KEY`
   with the live-mode key (Dashboard → Developers → API keys).
2. **Live webhook** — in the Stripe dashboard (live mode) add an
   endpoint for
   `https://red-hill-rally.gmbuell.workers.dev/api/stripe/webhook`
   listening for **both** `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` (the second covers
   bank-debit-style payments that confirm later — without it those
   gifts would never hit the tallies), then
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET` with its signing
   secret. (The sandbox webhook endpoint can stay; it only ever
   receives sandbox events, and the worker holds one webhook secret at
   a time.)
3. **Receipts** — turn on email receipts in Stripe settings (live
   mode); the site promises one. Every receipt already carries the
   IRS-required donation acknowledgment ("No goods or services were
   provided…") via the charge description, so each emailed receipt
   doubles as the written acknowledgment donors need to deduct gifts
   of $250+.
4. **Clear test data** (last, so nothing sneaks in between) —
   `npx wrangler d1 execute red-hill-rally --remote --command "DELETE FROM donation_students; DELETE FROM donations; DELETE FROM links"`
   (demo donations, their classroom credits, and any test student
   links).
5. **Prove it live** — make one small real donation with a real card:
   confirm the tally moves on the Rally Board, the email receipt
   arrives with the acknowledgment line, and the gift appears in the
   CSV export. Refund it from the Stripe dashboard if you like (see
   **Refunds** below for removing the row — or just let your own gift
   open the campaign).

## PTA operations

- **Donation report** (who gave, which student/classroom to credit,
  employer-match follow-ups) — the key is `ADMIN_KEY` in `.dev.vars`:

  ```sh
  curl -H "Authorization: Bearer <ADMIN_KEY>" \
    https://red-hill-rally.gmbuell.workers.dev/api/export.csv > rally.csv
  ```

  (`…/api/export.csv?key=<ADMIN_KEY>` also works in a browser, but
  leaves the key in browser history and request logs.) Each row also
  carries the donor's billing name and full mailing address from
  Stripe's checkout page — useful for thank-you notes and future
  outreach. This is the only place student names, emails, and
  addresses ever leave the backend; don't share the key.
- **Update goals/copy/tiers** — edit `site/js/data.js`; if the
  classroom roster changed, run `node scripts/board-skeleton.js
  --write`; redeploy.
- **Partner logos** — businesses upload their logo on the thank-you
  page right after paying. Uploads **auto-publish** to /partners and
  the Rally Board strip; a PDF is converted to PNG in the partner's
  own browser (vendored pdf.js) and publishes like any image, with the
  original PDF stored alongside as `…-original` for print. A PDF that
  fails to convert (or a curl/no-JS upload) is stored and held. Files
  live in the `red-hill-rally-logos` R2 bucket as
  `partner-logos/<opaque id>`, with the business name and session id
  in the object metadata (dashboard → R2). To publish a held PDF or
  an offline partner: web-sized image into `site/img/partners/`, a
  `PARTNERS` entry in `site/js/data.js`, then
  `node scripts/board-skeleton.js --write`. **To pull a published
  logo** (wrong file, inappropriate content):
  `npx wrangler d1 execute red-hill-rally --remote --command "UPDATE donations SET logo_id = '' WHERE donor_name = '<business>'"`
  — the wall, the board strip, and the direct /logo URL all stop
  within ~5 minutes (image cache); delete the R2 object in the
  dashboard too if the file itself should go. Clearing `logo_id` is
  not permanent — the partner's thank-you link can upload again — so
  to pull a logo for good, refund the partnership in Stripe and delete
  its row (see **Refunds**). (One-time setup, already done:
  `npx wrangler r2 bucket create red-hill-rally-logos`.)
- **Refunds** — a refund in Stripe does not touch the site's tallies.
  After refunding, delete the gift's row by its Stripe session id (the
  `id` column in the export):
  `npx wrangler d1 execute red-hill-rally --remote --command "DELETE FROM donations WHERE id = 'cs_…'"`
  — the totals, honor roll, and any classroom credits drop off with
  it.
- **Ad-hoc questions** — the donations live in D1 (`donations`, one row
  per gift; `donation_students`, one row per Rocket credited — a family
  gift lists several):
  `npx wrangler d1 execute red-hill-rally --remote --command "SELECT ..."`
  (or the D1 console in the Cloudflare dashboard).
- **Logs** — `npx wrangler tail red-hill-rally`.
