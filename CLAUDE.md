# Rocket Rally — Red Hill Elementary PTA

Fundraising site: pages in `site/` (vanilla JS, no build step)
rendered by a Cloudflare Worker in `worker/` that also handles Stripe
Checkout, short student links, D1 tallies, and R2 partner logos. **Production is
live** at <https://rocketrally.org> (www redirects there; the
production worker's workers.dev hostname is off, which is where the
sandbox Stripe webhook still points). Every PR gets a **preview** on a
second worker, `red-hill-rally-preview`, with its own D1 database
(demo donations), its own logo bucket, and no secrets; the preview URL
is in the PR's "Workers Builds" check (details link), and
<https://red-hill-rally-preview.gmbuell.workers.dev> tracks `main`.

Product decisions: `docs/design-decisions.md`. Brand
system: `docs/design-system/` (its readme first; tokens, guideline
cards, and a reference UI kit sit beside it). The README is a
two-sentence pointer; this file is the operating manual.

## Commands

| Command | What it does |
|---|---|
| `npm install` | wrangler, vitest + workers pool, lighthouse |
| `npx wrangler d1 migrations apply red-hill-rally --local` | once per clone: local D1 schema |
| `npm run dev` | `wrangler dev` on http://localhost:8787 |
| `npm test` | vitest (91 tests, ~3 s) |
| `npm run audit` | Lighthouse on every page, mobile + desktop (needs Chrome); defaults to the live site (`npm run audit -- --url http://localhost:8787` for local). `--runs 3 --min 98` reproduces the CI gate, `--form mobile` limits it to one form factor |
| `npm run wcag` | WCAG 2.2 checks on every page, mobile + desktop (needs Chrome): text contrast, non-text contrast, focus rings, target size, body leading ≥ 1.5, body text ≥ 16px and labels ≥ 13px. Defaults to the live site (`npm run wcag -- --url http://localhost:8787` for local, `--page donate --form mobile` to narrow). Each cell shows how many elements the check examined |
| `npm run deploy` | **Ships to production**: the worker and every file under `site/`. The `predeploy` step runs the tests, then applies pending D1 migrations to the remote database, so schema and code ship together. Every push to `main` runs this through Cloudflare Workers Builds (dashboard → the worker → Settings → Build), so merging a PR deploys it |
| `npm run preview` | What Workers Builds runs for every branch except `main` (the preview worker's Settings → Build holds the two triggers): applies pending migrations to the preview database, then uploads a version of the preview worker; the PR's "Workers Builds" check carries the preview URL, and `<branch>-red-hill-rally-preview.gmbuell.workers.dev` follows the branch. `npm run preview:deploy` is the `main` counterpart, a full deploy of the preview worker. Both need a Cloudflare login and touch only the preview worker |
| `npx wrangler tail red-hill-rally` | Production logs (`--env preview` for the preview worker) |

Don't run `npm run deploy`, `wrangler d1 execute … --remote`, or
`wrangler secret put` unless asked; they all touch production. The
normal way to ship is a PR into `main`, landed by fast-forward: rebase
the branch onto `main`, let the checks pass, then `git merge --ff-only`
on `main` and push (this checkout has `merge.ff=only`). GitHub offers
only Rebase and merge, and branch protection requires linear history;
the button keeps history linear but gives the commits new hashes.
`npm test` runs with fake keys, so contributors can work without
secrets; the maintainer reviews and ships PRs.

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
- `seed/demo-donations.sql` — prototype-scale demo donations on the
  real roster; apply/remove commands are in its header. It replaces
  whatever is in the donations and links tables.
- `.github/workflows/ci.yml` — PR gate: `npm test`, then Lighthouse
  ≥ 98 and the WCAG checks on every page, mobile and desktop, against
  a `wrangler dev` seeded with the demo donations. Branch protection
  requires the `test` and `lighthouse` jobs, so the WCAG step blocks a
  merge by living in the `lighthouse` job. Lighthouse is the repo's
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

- The preview worker is the `preview` environment in `wrangler.jsonc`:
  same code, own bindings. It holds no secrets, so checkout answers
  503 and the export 401 there, and a preview reads the demo seed, not
  real gifts. A PR that adds a migration applies it to the preview
  database before the version uploads, so a bad migration fails the
  preview build. Reseed the preview database with
  `npx wrangler d1 execute red-hill-rally-preview --env preview --remote --file seed/demo-donations.sql`.
  Bindings are per environment: a new binding goes in both the top
  level and `env.preview`.
- `.dev.vars` holds the **production** `ADMIN_KEY`. Never print it.
  `vitest.config.mjs` overrides every secret with fakes; keep that.
  `STRIPE_SECRET_KEY` is absent locally, so local checkout answers 503
  by design.
- `npm test` prints a wall of `deleteAllDurableObjects()` stack traces
  from the pool's `reset()`. Noise; read the summary line.
- Don't add `"type": "module"` to `package.json`: `data.js` and
  `ui.js` rely on the CommonJS guard.
- Markup with interpolated values is built only with the `html` tag
  from `ui.js`: plain strings are escaped, nested `html`/`raw` values
  and arrays pass through, `null`/`false` vanish. Interpolated copy
  uses Unicode characters (’ · —), never entities, or they render
  literally.
- The site header and footer come from `worker/views.js`; the HTML
  files carry empty `<header>`/`<footer>` elements. The one exception
  is `404.html`, which carries a baked copy: the asset layer serves it
  by itself for a missing file under a static folder, where the worker
  never runs. `test/pages.spec.js` pins that copy to `views.js`; when
  the chrome changes, paste the new markup in. The stat pages render
  into empty slot elements by id; a slot needs the id in the HTML and
  a key in the page's slot builder (a test checks every key has its
  id).
- Text sizes are gated: text inside `p`, `li`, `td`, `dd`, `dt`, or
  `blockquote` is body copy at 16px or larger with line-height 1.5;
  everything else is a label or caption at 13px or larger. The root is
  16px, so `0.95rem` on a paragraph fails. A caption that sits inside
  body copy (fine print, a card description, the grade under a
  teacher's name) is a `<small>`, which is always caption text. The
  gate sees each page as first loaded plus its `[hidden]` elements;
  markup that appears after a click (the amount buttons, student rows)
  and error copy, empty or `display: none` until something goes wrong,
  are unchecked. A control drawn as a box keeps a 3:1
  background or border against its surroundings.
- Every navigation runs the worker: `run_worker_first` is `/*` minus
  the static folders. A new static folder under `site/` must be added
  to the exclusions in `wrangler.jsonc`. A stats failure renders the
  zero state (logged as `api_error`, sent `no-store`), never an error
  page.
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
  lines; prefer a note under **Operations** over new code for manual
  admin paths (refunds, pulling a logo).

## Going live

The site is wired to the Stripe **sandbox**: the full flow works end
to end with test cards (`4242 4242 4242 4242`) on play money. To
flip to live, in this order:

1. **Live Stripe key** — `npx wrangler secret put STRIPE_SECRET_KEY`
   with the live-mode key (Dashboard → Developers → API keys).
2. **Live webhook** — in the Stripe dashboard (live mode) add an
   endpoint for
   `https://rocketrally.org/api/stripe/webhook`
   listening for **both** `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` (the second covers
   bank-debit payments that confirm later, so those gifts reach the
   tallies), then `npx wrangler secret put
   STRIPE_WEBHOOK_SECRET` with its signing secret. The sandbox
   endpoint can stay; it only receives sandbox events, and the worker
   holds one webhook secret at a time.
3. **Receipts** — turn on email receipts in Stripe settings (live
   mode). The site promises one, and each charge description carries
   the IRS acknowledgment donors need to deduct gifts of $250+.
4. **Clear test data** (last, so the campaign opens on an empty
   board) —
   `npx wrangler d1 execute red-hill-rally --remote --command "DELETE FROM donation_students; DELETE FROM donations; DELETE FROM links"`.
5. **Prove it live** — one small real donation with a real card:
   the tally moves on the Rally Board, the receipt arrives with the
   acknowledgment line, the Rocket shows on the student sheet. Refund
   it from Stripe and remove the row (see **Refunds**), or let it open
   the campaign.

## Operations

- **Student sheet** (what each class and each Rocket has raised) —
  the key is `ADMIN_KEY` in `.dev.vars`:

  ```sh
  curl -H "Authorization: Bearer <ADMIN_KEY>" \
    https://rocketrally.org/api/export.csv > students.csv
  ```

  `…/api/export.csv?key=<ADMIN_KEY>` also works in a browser but
  leaves the key in history and request logs. Columns are grade,
  teacher, student, gifts, raised: every roster classroom lists its
  Rockets, biggest first, then a `Class total` row. A gift naming
  several kids counts once for each and splits its dollars evenly;
  family gifts that named no Rocket sit in a last `No Rocket named`
  row so the sheet adds up to the board. Partnerships are left out.
  Donor contact details stay in the backend: read them in the Stripe
  dashboard, and find employer-match follow-ups with
  `employer_match = 1` in D1.
- **Goals, copy, tiers, roster, partners** — edit `site/js/data.js`
  (page copy lives in the HTML files); redeploy. The campaign goal is
  the ticker figure; a priority's goal is its annual program cost and
  only shapes copy and the card trails. An Annual Partner carries
  `annual`, and `presenting: true` names the one the home hero credits.
- **Partner logos** — businesses upload a logo on the thank-you page
  right after paying; images **auto-publish** to /partners and the
  Rally Board (a PDF converts in the partner's browser, print original
  stored alongside; see `docs/design-decisions.md`). A PDF that fails
  to convert, or a script upload, is stored and held. Files live
  in the `red-hill-rally-logos` R2 bucket as
  `partner-logos/<opaque id>`, business name and session id in the
  object metadata.
  - *Publish a held PDF or an offline partner*: web-sized image into
    `site/img/partners/`, a `PARTNERS` entry in `site/js/data.js`,
    redeploy.
  - *Pull a published logo* (wrong file, inappropriate content):
    `npx wrangler d1 execute red-hill-rally --remote --command "UPDATE donations SET logo_id = '' WHERE donor_name = '<business>'"`.
    The wall, the board strip, and the direct /logo URL stop within
    ~5 minutes (image cache); delete the R2 object too if the file
    itself should go. The partner's thank-you link can upload again,
    so to pull a logo for good, refund the partnership and delete its
    row.
- **Refunds** — the tallies keep a refunded gift until its row is
  deleted. After refunding, delete the gift's row by its Stripe session id (`cs_…`,
  shown on the payment in the dashboard):
  `npx wrangler d1 execute red-hill-rally --remote --command "DELETE FROM donations WHERE id = 'cs_…'"`.
  Totals, honor roll, and classroom credits drop off with it.
- **Ad-hoc questions** — `npx wrangler d1 execute red-hill-rally
  --remote --command "SELECT ..."`, or the D1 console in the
  Cloudflare dashboard.
