# Rocket Rally Site — Design & UX Decisions

The current load-bearing decisions for the Red Hill Elementary PTA
fundraising site (Rocket Rally campaign) — a decision set, not a
changelog; git history holds the how-we-got-here. Static
HTML/CSS/vanilla JS in `site/`, backed by a Cloudflare Worker — see
the README for running, deploying, and operations.

**View it:** `npm run dev`, then open <http://localhost:8787/>.
**Live:** <https://red-hill-rally.gmbuell.workers.dev>

## Scope

- **Campaign framing:** the site is the Rocket Rally campaign site (one
  fall ask, one goal) — not an evergreen giving site. No countdowns or
  event-day logistics.
- **Donation targets:** exactly six designated priorities — no
  "greatest need" general fund. Each priority has preset tier amounts
  with concrete impact copy.
- **Audience:** family and individual donors, plus local businesses
  through the online partner ladder on `/partners`.
- **Recognition surfaces:** donor honor roll + classroom leaderboard
  (one combined "Rally Board" page), per-priority progress on the
  home-page cards, and the partner wall on `/partners` and the board.
  No live donation ticker.

## The student-name privacy model (load-bearing)

- Student names are **never displayed anywhere on the site** — not on
  the Rally Board, not in the honor roll. Names stay backend-only so
  gifts credit the right student and classroom.
- The site never publishes student rosters and offers no student picker.
- A donor may **hand-type** student names during donation, or arrive
  via a **parent-created student link** (`student-link.html`) that
  prefills them. Either way the names are backend-only. One gift (or
  one link) credits up to four Rockets — one kid or the whole family.
- The link is a short memorable code — `/l/adjective-animal` (e.g.
  `/l/sunny-otter`) — typeable straight off a printed flyer; the
  student list is stored server-side under the code, and the same kids
  (any order, any case) always get the same code. Trade-off, accepted
  deliberately: codes are guessable, and a guessed code shows what any
  link holder sees — the students' names and classrooms on the donate
  page prefill chip.

## Leaderboard fairness

The classroom race ranks by **participation** (gifts ÷ class size), never
dollars — "a gift of any size moves your classroom's rocket exactly the
same." Dollar totals appear only in campaign/priority aggregates.

## Business partners

- A four-tier ladder ($250–$1,500) bought online through the same
  Stripe checkout. Logo placement starts at the second tier; the
  entry tier is name-only recognition.
- Partner dollars count in the campaign total but not the family-gift
  tally or the classroom race. Accepted quirk: partner gifts carry no
  priority, so the home hero can read higher than the sum of the
  priority cards — the hero shows everything the Rally brings in.
- The curated partner roster (`data.js`) and online partnerships merge
  client-side by a loose name key (case, punctuation, "&" vs "and");
  the highest tier wins and an uploaded logo replaces the curated one,
  so a listing can be raised but never demoted.
- Partner receipts carry the standard donation acknowledgment: logo
  placement and social posts are intangible recognition, not goods or
  services.

## Design system

Everything follows `brand-guide.html` (palette, Red Rule, motifs,
button/focus rules, WCAG 2.2 AA) with one deliberate deviation: the
site uses three of the guide's four type voices — Fraunces was dropped
to reduce font count; sub-headlines are set in Nunito Sans 800 and the
header wordmark in Oswald. The site's signature element is the
**flight trail**: progress is always a rocket on a dotted trail toward
a gold star — hero campaign meter (red rocket on a rising arc),
priority-card mini trails, the donate stepper, and the classroom race
rows. Home is a spirit stack; the Rally Board is a grid build with a
navy left rail (white dart climbing, desktop only).

Mobile is the primary surface: compact two-row header, stacked
full-width CTAs, two-up amount tiles, race rows that stack name over
trail, 13px minimum labels, no horizontal scroll at 390px.

## Pages

| Page | Role |
|---|---|
| `index.html` | Campaign hero + goal meter, six priority cards with progress, how-it-works, parent-link callout, trust strip |
| `donate.html` | 4-step wizard: priority → amount → Rockets (up to four, optional; prefilled+banner via `?link=`) → public/anonymous + summary. `?p=<id>` preselects a priority |
| `student-link.html` | Parent QR/link generator; copy/share/print handout card |
| `rally-board.html` | Classroom race (participation) + donor honor roll + partner strip |
| `partners.html` | Partnership ladder + checkout + partner wall |
| `matching.html` | Employer gift-matching how-to |
| `thanks.html` | Celebration thank-you, personalized impact line, matching nudge; partner logo uploader |

## How checkout and the data flow work

- "Continue to payment" POSTs the wizard state to `/api/checkout`,
  which creates a Stripe Checkout Session (metadata carries the
  student list, donor name, visibility, employer-match and link flags)
  and redirects to Stripe. Until `STRIPE_SECRET_KEY` is set, it
  returns a friendly "giving isn't open yet" notice instead.
- The wizard does not ask for an email: Stripe's checkout page
  collects it (for the receipt) along with the donor's full billing
  address (required), and the webhook stores both with the donation —
  backend only, for receipts, employer-match follow-up, and future
  outreach. One less form field on mobile, and donors can fix a typo'd
  email right where it matters.
- Live tallies come from the Stripe webhook feeding a D1 database,
  read back through `/api/campaign` (home, partners) and `/api/board`
  (Rally Board). `site/js/data.js` holds only static config
  (priorities, goals, tiers, roster, partners) and is shared with the
  worker.
- The parent link is a short server-stored code (`/api/link` mints it,
  `/l/<code>` redirects into the wizard); one code per set of
  students, case-insensitive on lookup. Internal URLs are
  extensionless (`/donate`). The asset layer answers browser
  navigations to unknown paths with the 404 page *before* the worker
  runs, so `/l/*`, `/api/*`, and `/logo/*` are listed in
  `run_worker_first`.
- Every Stripe receipt doubles as the IRS "contemporaneous written
  acknowledgment" donors need for gifts of $250+ (Pub 1771): the
  charge description carries the org name, EIN, and no-goods-or-
  services statement; the receipt itself supplies the amount and date.
- Donors can add a *voluntary* fee cover: a default-checked opt-out
  checkbox on the amount step adds a gross-up
  (`(gift + 30¢) / (1 − 2.9%)`, shared math in `data.js`) as a second
  Checkout line item ("Covering card processing"), disclosed with the
  total on the summary step. Because it's opt-in, it is *not* a card
  surcharge — none of the card-network surcharge rules apply, and the
  full amount remains a tax-deductible gift. The server computes the
  fee (`coverFees` boolean is all the client sends) and stamps
  `fee_cents` into session metadata; the webhook stores gift and fee
  in separate columns so campaign totals, the classroom race, and
  circle tiers count the intended gift only, while the admin CSV
  shows both.
- Still promised in the UI and owed by operations: email receipts
  (enable in Stripe), the Spring Impact Report, and employer-matching
  follow-up (flagged per gift in `/api/export.csv`).

## Partner logo pipeline

A partner's PDF logo is converted to an image in the partner's own
browser on the thank-you page (vendored pdf.js renders page 1 to a
canvas), so vector logos come out crisp with no server-side image
stack. The web image auto-publishes; the print-quality PDF original
is stored alongside in R2 for the shirt and banner printers. A PDF
the browser can't convert (or a no-JS upload) is stored and held.
Ops procedures: README, **Partner logos**.
