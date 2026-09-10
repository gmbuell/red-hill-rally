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
| `npm test` | vitest (159 tests, ~4 s) |
| `npm run audit` | Lighthouse on every page but `/admin` (noindex), mobile + desktop (needs Chrome); defaults to the live site (`npm run audit -- --url http://localhost:8787` for local). `--runs 3 --min 98` reproduces the CI gate, `--form mobile` limits it to one form factor |
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
- `worker/digest.js` — the Thursday classroom email's text, built from
  `classroomTotals` and the student sheet; `worker/mail.js` is the
  provider call (Resend over plain fetch, no SDK), off whenever its
  secrets are missing.
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
  credited Rocket, with that Rocket's shirt sizes), `links` (code →
  students JSON + signature), `teacher_emails` (classroom → address,
  typed into Mission Control) and `digest_log` (one row per classroom
  per week, so the Thursday send can't run twice).
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
  Only the report builders in `store.js` (behind `ADMIN_KEY`, as CSV
  and as `/api/admin.json`) read student names; nothing serves email
  or address. No student picker or
  roster on any page. `test/pages.spec.js` probes the rendered pages
  for a seeded student name, email, and address.
  - The one narrow exception is `GET /api/my-rockets?sid=…`, which the
    thank-you page calls: it returns the Rockets a single gift credited
    and what each has raised in total. The gate is the donor's own
    Stripe session id, which only they hold, and the names it returns
    are the ones that donor typed. It never returns a donor name, an
    email, or a per-donor amount, which is what `test/api.spec.js`
    pins — an anonymous gift counts toward the child's total and is
    never itemised.
- The classroom race ranks by participation (Rockets ÷ class size),
  never dollars. Each row also shows what the class has raised, for the
  Top Class prize, and a line above the list names whoever is leading
  that one; `classroomTotals` is the single source for both, so the
  board and the PTA's classroom sheet can't disagree about prize money.
  - Ranking uses the **rounded** percentage the row prints, not the
    fraction behind it, and ties break on dollars raised. A family
    reads the order off the rows, so a class shown at 80% sitting below
    another shown at 80% has to have a visible reason. The tiebreak
    matters most at 100%, which every class can reach, where
    participation stops separating anyone.
  - Two notes sit above the list because the board carries two
    different races: the Golden Shoe, which **one** class wins on
    dollars, and the participation prizes, which are thresholds
    **every** class can reach. The second is a count of classes at 80%
    and at 100%, never a leader, or the board would imply a prize for
    leading participation that the prizes page doesn't offer. Both
    counts use the same rounded percentage the rows print.
  - The board heads with **two** figures, dollars raised and the
    school-wide share of Rockets flying, because the Rally is run on
    both and one number alone taught families that only money counted.
    The share caps each class's Rockets at its roster the way the rows
    do, so gifts that named no Rocket can't push the school over 100%.
    Still no gift or partner count up there: those invite arithmetic
    nobody should be doing, and read as bad news early in a campaign.
  - The list says what it is ranked by, in copy directly above the
    first row. It cannot move below the list: a family scanning for
    their teacher reads row one within a second of arriving.
- Money is decided server-side: the worker computes the fee cover from
  the `coverFees` boolean and prices shirts from `SHIRT` in `data.js`,
  and every stat counts `amount_cents` (the gift plus each shirt's
  `credit`), never `fee_cents` or the rest of a shirt's price.
- A shirt needs a named Rocket, and a shirt alone is a complete order:
  `amount` may be 0 when the order holds a shirt.
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
- The worker exports `scheduled` as well as `fetch`: the Thursday
  digest. Local `wrangler dev` never fires it on its own — trigger one
  with `curl "http://localhost:8787/__scheduled?cron=0+0+*+*+5"`.
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
- `/admin` is a `noindex` page whose HTML holds no data: everything
  on it arrives from `/api/admin.json` behind the admin key, so the
  page-level PII probes pass and Lighthouse skips it (the SEO
  category scores `noindex` as a fault).
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
  acknowledgment; with shirts in the order it states their good-faith
  value (`SHIRT.value`) and the deductible remainder. Change the
  wording with care.
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

- **Reports** — <https://rocketrally.org/admin> ("Mission Control")
  shows all three sheets behind the key `ADMIN_KEY` in `.dev.vars`,
  with a download button for each; the key stays in the tab's session
  storage and travels as a Bearer header. The same CSVs by curl:

  ```sh
  curl -H "Authorization: Bearer <ADMIN_KEY>" \
    https://rocketrally.org/api/students.csv > students.csv
  ```

  and likewise `classrooms.csv` and `shirts.csv`. `…?key=<ADMIN_KEY>`
  also works in a browser but leaves the key in history and request
  logs. Partnerships and donor details are left out of all three;
  read donor contact details in the Stripe dashboard, and find
  employer-match follow-ups with `employer_match = 1` in D1.
  - *students.csv* (the shout-out sheet): grade, teacher, student,
    gifts, raised; each classroom's Rockets in roster order, biggest
    first. A gift naming several kids counts once for each and splits
    its dollars evenly, and each shirt's credit goes to its own
    Rocket; family gifts that named no Rocket sit in a last
    `No Rocket named` row so the sheet adds up to the board.
  - *classrooms.csv* (the marquee sheet): grade, teacher, students
    (class size), gifts, rockets, participation_pct, raised, shirts;
    every roster classroom, zeros included. *gifts* is every gift
    credited to the class; *rockets* is how many kids are behind them,
    each named Rocket once however many gifts they drew, plus one for
    each gift that named no Rocket. Participation is rockets ÷ class
    size, so three gifts for one kid read as one participant.
  - *shirts.csv* (for the printer): grade, teacher, student, size,
    quantity; one row per Rocket and size, merged across orders.
- **A family checking their Rocket** — the thank-you page shows what
  the Rockets that gift credited have raised across every gift, not
  just this one, so the URL Stripe hands the donor works as a private
  link they can bookmark and revisit as more gifts land. The page tells
  them to. Totals only, no donor names: donors chose public or
  anonymous for the honor roll, and neither was consent to be itemised
  to a family. A gift the PTA recorded by hand has an `off_` id that
  works the same way, so the PTA can hand a check-writing family their
  link.
  - *Losing the link* is the obvious failure, so `/my-rocket` takes an
    email address and mails back every gift that address made, each as
    its own thank-you link. It verifies nobody: only the inbox owner
    reads what arrives, and the address came from Stripe, so no list is
    kept and nothing new is exported. `POST /api/my-link` answers
    `{sent: true}` for any well-formed address whether or not it ever
    gave — otherwise the box would answer "did this family donate?" for
    anyone who typed a guess. `link_requests` holds a SHA-256 of the
    address and the last send time, one per 15 minutes, so the box can't
    be used to mail somebody repeatedly. With the mail secrets missing
    it takes the address and sends nothing, same as the Thursday digest.
- **Fixing a Rocket's name** — "Fix a Rocket's name" on /admin moves
  every gift under one spelling to another inside a single classroom,
  and merges them when the new name is already there. Donors type names
  by hand, so a child arrives as "Audrey", "Audrey Webber" and "audrey
  w"; each spelling is its own Rocket, which splits their total and
  credits the class with three participants instead of one, and
  participation decides the classroom prizes. The picker offers only
  names really in that class, and the classroom is part of the request
  so two children sharing a first name in different rooms can't be
  merged. A credit whose donor left the name blank can be given a name
  the same way.
- **Thursday emails to teachers** — a cron on the worker mails each
  classroom teacher their own class every Thursday at 5pm Pacific:
  participation, dollars, their Rockets by name, and how many more
  Rockets to the next prize. It reads the same `classroomTotals` the
  board and the classroom sheet do.
  - *Addresses* are typed into Mission Control ("Thursday emails to
    teachers"), one class per line, and stored in D1 — never in this
    repo, which is public. Saving replaces the whole list, so deleting
    a line takes that class off the send. The paste matches the roster
    on surname, so "Miss Convery" and "Ms. Convery" are one teacher.
  - *Before it goes out*, "Email me a sample" sends one class's copy to
    whoever asks. It mails no teacher and leaves the week untouched.
  - *Switching it off* is unsetting a mail secret, or clearing the
    address list. With `RESEND_API_KEY` or `MAIL_FROM` missing the
    handler logs `digest_skipped` and mails nobody, which is why the
    preview worker and local dev are silent.
  - *Sending twice is not possible in a week*: each classroom claims a
    row in `digest_log` keyed by the Monday of that week before it is
    mailed, so a retried cron is a no-op. A failed send releases its
    row so the next run retries that class. Mission Control shows when
    each class last got one.
  - *Setup, once*: a Resend account, `rocketrally.org` verified as a
    sending domain, then `npx wrangler secret put RESEND_API_KEY`,
    `MAIL_FROM` (the verified sender) and `MAIL_REPLY_TO` (a PTA inbox
    a teacher's reply should reach). Cron runs on UTC: `0 0 * * 5` is
    Thursday 5pm Pacific under daylight time and 4pm once it ends.
- **Checks and cash** — "Record a check" on /admin takes a gift the PTA
  received by hand and counts it exactly like a card gift: the ticker,
  the classroom race, the honor roll, the Rocket's own total. It takes
  no fee and sells no shirt, and it never touches Stripe, so there is
  no receipt — the PTA writes those itself. Recorded gifts carry an
  `off_` id instead of a session id and are the only rows the page can
  delete: the list under the form has a Remove button per gift, which
  is how a wrong amount gets fixed. A donor who wants their check
  listed as Anonymous gets the same treatment a card gift does.
- **Shirts** — price, fundraising credit, receipt value, and sizes
  are `SHIRT` in `site/js/data.js`; `MAX_SHIRTS` caps an order. Shirts
  are sold two ways: as an add-on under each Rocket in the donate
  wizard, and on their own at `/shirt`, one screen that posts the same
  checkout with no gift on top. A shirt bought there credits
  `SUPPORT_ALL`, since the buyer never picked a priority. The home
  page and the footer link it; the top nav deliberately doesn't.
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
  Totals, honor roll, and classroom credits drop off with it. A gift
  recorded by hand comes off from /admin instead — see **Checks and
  cash**.
- **Ad-hoc questions** — `npx wrangler d1 execute red-hill-rally
  --remote --command "SELECT ..."`, or the D1 console in the
  Cloudflare dashboard.
