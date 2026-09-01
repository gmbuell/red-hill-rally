# Rocket Rally Site — Design & UX Decisions

Design and UX decisions for the Red Hill Elementary PTA fundraising
site (Rocket Rally campaign). Static HTML/CSS/vanilla JS in `site/`,
now backed in production by a Cloudflare Worker — see the README for
running and deploying.

**View it:** `npm run dev`, then open <http://localhost:8787/>.
**Live:** <https://red-hill-rally.gmbuell.workers.dev>

## Scope decisions (agreed in brainstorming)

- **Campaign framing:** the site is the Rocket Rally campaign site (one
  fall ask, one goal) — not an evergreen giving site. No Walk Day or
  countdowns on the site (removed 2026-08-25).
- **Donation targets:** exactly the six priorities from the Fundraising
  Priority Overview — no "greatest need" general fund. Preset tier
  amounts and impact copy come from the Volunteer Toolkit one-pagers.
- **Audience:** family/individual donors only. Business sponsorships stay
  offline for now.
- **Recognition surfaces:** donor honor roll + classroom leaderboard
  (one combined "Rally Board" page) and per-priority progress on the
  home-page cards. No live donation ticker.

## The student-name privacy model (load-bearing)

- Student names are **never displayed anywhere on the site** — not on the
  Rally Board, not in the honor roll (decided 2026-08-25, superseding an
  earlier link-as-display-permission model). Names go only to the PTA so
  gifts credit the right student and classroom.
- The site never publishes student rosters and offers no student picker.
- A donor may **hand-type** a student name during donation, or arrive via
  a **parent-created student link** (`student-link.html`) that prefills
  student and classroom. Either way the name is backend-only.
- The link is a short memorable code — `/l/adjective-animal` (e.g.
  `/l/sunny-otter`) — typeable straight off a printed flyer. The
  student name + classroom are stored server-side under the code
  (decided 2026-08-25, superseding the earlier stateless signed-token
  design, which produced URLs far too long to hand-type). Trade-off,
  accepted deliberately: codes are guessable, and a guessed code shows
  what any link holder sees — the student's name and classroom on the
  donate page prefill chip.

## Leaderboard fairness

The classroom race ranks by **participation** (gifts ÷ families), never
dollars — "a gift of any size moves your classroom's rocket exactly the
same." Dollar totals appear only in campaign/priority aggregates.

## Design system

Everything follows `brand-guide.html` (palette, Red
Rule, motifs, button/focus rules, WCAG 2.2 AA) with one deliberate
deviation: the site uses three of the guide's four type voices. Fraunces
was dropped (2026-08-25, to reduce font count) — sub-headlines are set
in Nunito Sans 800 and the header wordmark in Oswald. The
site's signature element is the **flight trail**: progress is always a
rocket on a dotted trail toward a gold star — hero campaign meter (red
rocket on a rising arc), priority-card mini trails, the donate stepper,
and the classroom race rows. Home is a spirit stack; the Rally Board is
a grid build with a navy left rail (white dart climbing, desktop only).

Mobile is the primary surface: compact two-row header, stacked
full-width CTAs, two-up amount tiles, race rows that stack name over
trail, 13px minimum labels, no horizontal scroll at 390px.

## Pages

| Page | Role |
|---|---|
| `index.html` | Campaign hero + goal meter, six priority cards with progress, how-it-works, parent-link callout, trust strip |
| `donate.html` | 4-step wizard: priority → amount → student/classroom (optional; prefilled+banner when arriving via `?link=`) → public/anonymous + summary. `?p=<id>` preselects a priority |
| `student-link.html` | Parent QR/link generator, all client-side; copy/share/print handout card |
| `rally-board.html` | Classroom race (participation) + donor honor roll |
| `thanks.html` | Celebration thank-you, personalized impact line, matching nudge |

## Production notes (implemented 2026-08-25)

- "Continue to payment" POSTs the wizard state to `/api/checkout`, which
  creates a Stripe Checkout Session (metadata carries classroom, student
  name, link flag, visibility, donor name, employer-match) and redirects
  to Stripe. Until `STRIPE_SECRET_KEY` is set, it returns a friendly
  "giving isn't open yet" notice instead.
- The wizard does not ask for an email: Stripe's checkout page collects
  it (for the receipt) along with the donor's full billing address
  (required), and the webhook stores both with the donation — PTA
  backend only, for receipts, employer-match follow-up, and future
  outreach. One less form field on mobile, and donors can fix a typo'd
  email right where it matters.
- Honor roll, race tallies, and campaign totals come live from
  `/api/campaign`, fed by the Stripe webhook into a D1 database.
  `site/js/data.js` now holds only static config (priorities, goals,
  tiers, classroom roster) and is shared with the worker.
- The parent link is a short server-stored code (`/api/link` mints it,
  `/l/<code>` redirects into the wizard); one code per student +
  classroom, case-insensitive on lookup. Internal URLs are
  extensionless (`/donate`). The asset layer answers browser
  navigations to unknown paths with the 404 page *before* the worker
  runs, so `/l/*` and `/api/*` are listed in `run_worker_first`.
- Every Stripe receipt doubles as the IRS "contemporaneous written
  acknowledgment" donors need for gifts of $250+ (Pub 1771): the charge
  description carries "Tax-deductible donation to Red Hill Elementary
  PTA. No goods or services were provided in exchange for this
  contribution." (plus the EIN once `ORG.ein` is set in `data.js`), and
  the receipt itself supplies the org name, amount, and date. Verified
  rendering on a live sandbox receipt 2026-08-25.
- Donors can add a *voluntary* fee cover (2026-08-26): a default-checked
  opt-out checkbox on the amount step adds a gross-up
  (`(gift + 30¢) / (1 − 2.9%)`, shared math in `data.js`) as a second
  Checkout line item ("Covering card processing"), disclosed with the
  total on the summary step. Because it's opt-in, it is *not* a card
  surcharge — none of the card-network surcharge rules (credit-only,
  3% cap, preview API) apply, and the full amount remains a
  tax-deductible gift to the PTA. The server computes the fee
  (`coverFees` boolean is all the client sends) and stamps `fee_cents`
  into session metadata; the webhook stores the gift and fee in
  separate columns so campaign totals, the classroom race, and circle
  tiers count the intended gift only, while the admin CSV shows both.
- Still promised in the UI and owed by operations: email receipts
  (enable in Stripe), the Spring Impact Report, and employer-matching
  follow-up (flagged per gift in `/api/export.csv`).
