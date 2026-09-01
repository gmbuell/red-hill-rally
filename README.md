# Rocket Rally — Red Hill Elementary PTA

The Rocket Rally fundraising site: static pages (`site/`, no build
step) plus a small Cloudflare Worker (`worker/`) for Stripe Checkout,
short student links, and live tallies in a D1 database.

**Live:** <https://red-hill-rally.gmbuell.workers.dev>

Design and architecture notes: `docs/design-decisions.md`. Brand
system: `docs/brand-guide.html`.

## Contributing

Typos, wrong numbers, roster changes, partners to add: open a pull
request, or a GitHub issue describing the change. This is the live
site for one school, not a general-purpose template.

Where things live:

- **Page copy** — the HTML pages in `site/` (`index.html`,
  `donate.html`, `matching.html`, …).
- **Goals, priorities, tier amounts, classroom roster, partner list** —
  `site/js/data.js`. After roster or partner edits, run the
  board-skeleton step (see **Develop**).
- **Styles** — `site/css/styles.css`, following the brand guide in
  `docs/brand-guide.html`.

`npm test` runs the full suite with fake keys — no secrets needed.
Deploys, secrets, Stripe, and the production database stay with the
maintainer, who reviews and ships merged PRs.

## Develop

```sh
npm install      # Node 22+
npx wrangler d1 migrations apply red-hill-rally --local  # once: local DB schema
npm run dev      # wrangler dev on http://localhost:8787
npm test         # vitest (workers pool) — API, webhook, privacy tests
npm run audit    # Lighthouse: every page, mobile + desktop (needs Chrome)
```

Local secrets live in `.dev.vars` (gitignored). Without Stripe keys,
checkout answers with its friendly "giving opens soon" message —
that's expected; everything else works.

**Rally Board skeleton** — rally-board.html ships with the board's
zero-state markup baked in (no layout shift on first paint; a real
board for no-JS visitors). After editing the classroom roster in
`site/js/data.js` or the board templates in `site/js/board.js`, run
`node scripts/board-skeleton.js --write` to regenerate it; `npm test`
and `npm run deploy` fail if it drifts.

**Demo data** — `seed/demo-donations.sql` fills the board with
prototype-scale numbers on the real roster. Apply/remove commands
are in the file header; it replaces whatever is in the donations and
links tables.

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
   mode); the site promises one, and each receipt's charge
   description already carries the IRS acknowledgment donors need to
   deduct gifts of $250+.
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

## Operations

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
- **Update goals/copy/tiers** — edit `site/js/data.js`; after roster
  or partner edits run the board-skeleton step (see **Develop**);
  redeploy.
- **Partner logos** — businesses upload a logo on the thank-you page
  right after paying; images **auto-publish** to /partners and the
  Rally Board (a PDF converts in the partner's browser, print original
  stored alongside — see `docs/design-decisions.md`). A PDF that fails
  to convert (or a curl/no-JS upload) is stored and held. Files live
  in the `red-hill-rally-logos` R2 bucket as
  `partner-logos/<opaque id>`, business name and session id in the
  object metadata (dashboard → R2).
  - *Publish a held PDF or an offline partner*: web-sized image into
    `site/img/partners/`, a `PARTNERS` entry in `site/js/data.js`,
    board-skeleton step, redeploy.
  - *Pull a published logo* (wrong file, inappropriate content):
    `npx wrangler d1 execute red-hill-rally --remote --command "UPDATE donations SET logo_id = '' WHERE donor_name = '<business>'"`
    — the wall, the board strip, and the direct /logo URL all stop
    within ~5 minutes (image cache); delete the R2 object in the
    dashboard too if the file itself should go. The partner's
    thank-you link can upload again, so to pull a logo for good,
    refund the partnership in Stripe and delete its row (see
    **Refunds**).
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
