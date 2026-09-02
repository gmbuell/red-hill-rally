# Rocket Rally — Red Hill Elementary PTA

Fundraising site: pages in `site/` (vanilla JS, no build step)
rendered by a Cloudflare Worker in `worker/` that also handles Stripe
Checkout, short student links, D1 tallies, and R2 partner logos. **Production is
live** at <https://red-hill-rally.gmbuell.workers.dev>; there is no
staging environment.

Long-form docs, don't duplicate them here: `README.md` (setup, deploy,
go-live checklist, operations) and `docs/design-decisions.md`
(product decisions and data flow). Brand system: `docs/brand-guide.html`.

## Commands

| Command | What it does |
|---|---|
| `npm install` | wrangler, vitest + workers pool, lighthouse |
| `npx wrangler d1 migrations apply red-hill-rally --local` | once per clone: local D1 schema |
| `npm run dev` | `wrangler dev` on http://localhost:8787 |
| `npm test` | vitest (79 tests, ~3 s) |
| `npm run audit` | Lighthouse on every page, mobile + desktop; defaults to the live site (`npm run audit -- --url http://localhost:8787` for local). CI runs it with `--runs 3 --min 98` against `wrangler dev` |
| `npm run deploy` | **Ships to production** after applying remote D1 migrations |

Don't run `npm run deploy`, `wrangler d1 execute … --remote`, or
`wrangler secret put` unless asked; they all touch production.

## Layout

- `site/` — the pages. The HTML files hold structure and copy; the
  worker fills the header, footer, and each page's slots at request
  time (`worker/pages.js`). Home and the Rally Board load no scripts.
  Elsewhere, classic `<script defer>` files load in order
  `data.js` → `ui.js` → `<page>.js` and share globals: `RH` (helpers,
  from `ui.js`) and `CLASSROOMS`, `PRIORITIES`, `CAMPAIGN`, lookup
  functions (from `data.js`). No `import`/`export` in `site/js/*.js`.
- `site/js/data.js` — the single source of static config: org + EIN,
  priorities and tiers, classroom roster, partner ladder, curated
  partners, limits, fee-cover math. The worker imports the same file
  through its CommonJS export guard.
- `site/js/ui.js` — the render core shared with the worker through
  the same guard (the `html` tag, money and name formatting, student
  rows, the dart motif) plus browser-only form plumbing. Only the core
  is exported.
- `worker/index.js` — router for `/api/*`, `/l/<code>`, `/logo/<id>`,
  and every page. `pages.js` renders a page: it fetches the static
  HTML from the assets binding and streams it through HTMLRewriter,
  filling `.site-header`, `.site-footer`, and the page's slot ids from
  `views.js` (pure slot builders, the server-only motifs, the partner
  wall). `stripe.js` is Checkout + webhook HMAC over plain `fetch` (no
  SDK); `store.js` owns every D1 read/write and the CSV export;
  `students.js` is the one validator for student lists; `links.js`
  mints adjective-animal codes.
- `migrations/` — numbered D1 migrations. D1 tables: `donations` (id =
  Stripe session id, primary key), `donation_students` (one row per
  credited Rocket), `links` (code → students JSON + signature).
- `test/` — vitest on `@cloudflare/vitest-pool-workers`; migrations are
  read from disk and re-applied before each test.
- `.github/workflows/ci.yml` — PR gate: `npm test` plus Lighthouse
  ≥ 98 on every page, mobile and desktop. Lighthouse is the repo's
  `lighthouse` devDependency, so `npm run audit` and CI score alike.
- `docs/superpowers/` — brainstorm specs and plans, gitignored.

## Invariants the tests pin

- **Student names, donor email, and billing address never leave the
  backend.** `campaignStats` and `boardStats` must not select them.
  Only `exportCsv` (the admin student sheet behind `ADMIN_KEY`) reads
  student names; nothing serves email or address. No student picker or
  roster on any page. `test/pages.spec.js` probes the rendered pages
  for a seeded student name, email, and address.
- The classroom race ranks by participation (gifts ÷ class size),
  never dollars.
- Money is decided server-side: the worker computes the fee cover from
  the `coverFees` boolean, and every stat counts `amount_cents` (the
  gift), never `fee_cents`.
- The webhook records only sessions carrying this site's metadata
  (`priority` or `kind=partner`) with `payment_status=paid`; inserts
  are idempotent on the session id.
- Partner rows count in campaign dollars but not the family-gift tally
  or the classroom race.

## Gotchas

- `.dev.vars` holds the **production** `ADMIN_KEY`. Never print it.
  `vitest.config.mjs` overrides every secret with fakes; keep that.
  `STRIPE_SECRET_KEY` is absent locally, so local checkout answers 503
  by design.
- `npm test` prints a wall of `deleteAllDurableObjects()` stack traces
  from the pool's `reset()`. Noise; read the summary line.
- Don't add `"type": "module"` to `package.json`: `data.js` and
  `ui.js` rely on the CommonJS guard.
- Markup is built only with the `html` tag from `ui.js`: plain strings
  are escaped, nested `html`/`raw` values and arrays pass through,
  `null`/`false` vanish. Interpolated copy uses Unicode characters
  (’ · —), never entities, or they render literally.
- The site header and footer come from `worker/views.js`; the HTML
  files carry empty `<header>`/`<footer>` elements. The stat pages
  render into empty slot elements by id; a slot needs the id in the
  HTML and a key in the page's slot builder.
- Every navigation runs the worker: `run_worker_first` is `/*` minus
  the static folders. A new static folder under `site/` must be added
  to the exclusions in `wrangler.jsonc`. A stats failure renders the
  zero state (logged as `api_error`), never an error page.
- Internal URLs are extensionless (`/donate`, not `/donate.html`).
- The word lists in `worker/links.js` print on kids' handouts; any
  addition must be elementary-school-safe in every adjective+animal
  pairing.
- `TAX_ACKNOWLEDGMENT` in `worker/index.js` is the donors' IRS written
  acknowledgment. Change the wording with care.
- Stripe caps a metadata value at 500 characters; the students JSON is
  checked against that in checkout.

## Conventions

- Vanilla JS, 2-space indent, single quotes, semicolons. No TypeScript,
  framework, or bundler for the site.
- Comments say why, not what the spec said. Keep them short.
- Donor-facing strings use typographic apostrophes (’) and a warm,
  plain voice; error messages stay friendly.
- Tests derive fixtures from `data.js` (any priority, any classroom,
  one logo tier) rather than hardcoding this year's values.
  Hand-computed fee-math oracles stay literal on purpose.
- Checkout tests call `worker.fetch` directly so `vi.stubGlobal('fetch')`
  intercepts Stripe; everything else goes through `SELF.fetch`.
- New D1 column: add a numbered file in `migrations/`, apply `--local`,
  tests pick it up automatically.
- Commit messages: one imperative, sentence-case line, no type prefix.
- Review posture: skip attacker-only findings unless the fix is a few
  lines; prefer a README note over new code for manual admin paths
  (refunds, pulling a logo).
