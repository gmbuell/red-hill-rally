# Rocket Rally Site — Design & UX Decisions

The product decisions behind the Red Hill Elementary PTA fundraising
site. How it is built and operated is in `CLAUDE.md`; the brand system
is `design-system/` (start with its readme).

**Live:** <https://rocketrally.org>

## Scope

- **Campaign framing:** one fall ask with one goal. The goal on the
  ticker is the Rally's own target. Each priority's goal in `data.js`
  is what that program costs for a year, most of it already covered
  by the annual fund, so it feeds the copy and the trail split and is
  never shown as a target.
- **Donation targets:** exactly six designated priorities, each with
  preset tier amounts and concrete impact copy.
- **Audience:** family and individual donors, plus local businesses
  through the online partner ladder on `/partners`.
- **Recognition surfaces:** donor honor roll and classroom race on one
  Rally Board page, per-priority progress on the home cards, the
  partner wall on `/partners` and the board, and the presenting
  partner's name in the home hero.
- **Prizes:** `/prizes` states the grand prize, the classroom prizes
  at 80% and 100% participation and for the top class, the student
  prizes, and how participation is counted.

## Student names

Student names stay in the backend, where their one job is crediting a
gift to the right Rockets and classroom. Donors supply them by
hand-typing in the wizard or by arriving through a parent-made link
that prefills them; one gift credits up to four Rockets.

The link is a short memorable code, `/l/adjective-animal`, typeable off
a printed flyer. The student list is stored server-side under the code,
and the same kids (any order, any case) always get the same code.
Accepted trade-off: codes are guessable, and a guessed code shows what
any link holder sees, the students' names and classrooms in the donate
page's prefill chip.

## Classroom race

The race ranks by participation (gifts ÷ class size): "a gift of any
size moves your classroom's rocket exactly the same." Dollar totals
appear in campaign and priority aggregates.

## Business partners

- Annual Partners (Apollo, then Orbit) back the school year-round
  through a separate program that runs July through the first week of
  September. They are curated in `data.js`, sit above the Rally ladder
  on the wall at a size their level earns, keep their logo whatever
  Rally tier they also buy, and one of them is credited by name in the
  home hero as presenting partner, text only, per the partnership
  terms.
- A four-tier Rally ladder ($250–$1,500) bought through the same
  Stripe checkout. Logo placement starts at the second tier; the entry
  tier is name-only recognition.
- Partner dollars count in the campaign total; the family-gift tally
  and the race count family gifts. A partnership is a gift to the
  whole Rally rather than a priority, so the home hero can read higher
  than the sum of the priority cards.
- The curated roster in `data.js` and online partnerships merge by a
  loose name key (case, punctuation, "&" vs "and"); the highest tier
  wins and an uploaded logo replaces the curated one, so a listing
  moves up the ladder and stays there.
- Partner receipts carry the standard donation acknowledgment: logo
  placement and social posts count as intangible recognition under
  the IRS rules.
- A partner's PDF logo converts to an image in the partner's own
  browser on the thank-you page (vendored pdf.js renders page 1 to a
  canvas), so vector logos come out crisp and the worker stays free of
  image libraries. The web image auto-publishes; the print-quality
  original is stored alongside in R2 for the shirt and banner
  printers. A PDF that arrives unconverted (a browser that failed, or
  a script upload) is stored and held for a manual decision.

## Design system

Everything follows `design-system/`, the 2026 Rocket Rally system:
black, white, and one red; Bebas Neue for display and numerals,
Montserrat for body copy and for labels set as small heavy caps with
wide tracking; square corners, 2px rules, no shadows; WCAG 2.2 AA.
The site keeps a white page and uses the system's paper tone as the
panel ground. Small red type takes a darker ink on light grounds and a
lighter glow on black, because the brand red alone clears 4.5:1 only
on pure white; fills, rules, and display type keep the true red.

The signature element is the **flight trail**, the site's expression
of the system's rocket progress meter: a rocket on a dotted trail
toward a red star, in the hero campaign meter, the priority-card mini
trails, the donate stepper, and the race rows. A priority card's trail
runs toward that priority's share of the campaign goal, in proportion
to its annual cost; the share is never printed, so the six cards reach
their stars together when the Rally reaches its goal. Home is a spirit
stack; the Rally Board is a grid build with a black left rail (white
dart climbing, desktop only).

Mobile is the primary surface: compact two-row header, stacked
full-width CTAs, two-up amount tiles, race rows that stack name over
trail, 13px minimum labels, everything within a 390px viewport.

Every page arrives fully rendered by the worker with live totals in
place, so the first paint is the final layout and a visitor with
scripts off sees the real numbers. Home and the Rally Board are pure
HTML and CSS.

## Pages

| Page | Role |
|---|---|
| `index.html` | Campaign hero + goal meter, six priority cards with progress, how-it-works, parent-link callout, trust strip |
| `donate.html` | 4-step wizard: priority → amount → Rockets (up to four, optional; prefilled+banner via `?link=`) → public/anonymous + summary. `?p=<id>` preselects a priority |
| `student-link.html` | Parent QR/link generator; copy/share/print handout card |
| `rally-board.html` | Classroom race (participation) + donor honor roll + partner strip |
| `prizes.html` | Grand prize, classroom and student prizes, how participation is counted |
| `partners.html` | Partnership ladder + checkout + partner wall |
| `matching.html` | Employer gift-matching how-to |
| `thanks.html` | Celebration thank-you, personalized impact line, matching nudge; partner logo uploader |

## Checkout

- "Continue to payment" POSTs the wizard state to `/api/checkout`,
  which creates a Stripe Checkout Session (metadata carries the
  student list, donor name, visibility, employer-match and link flags)
  and redirects to Stripe. Until `STRIPE_SECRET_KEY` is set it returns
  a friendly "giving isn't open yet" notice.
- Stripe's page collects the donor's email for the receipt along
  with a required billing address. Both stay in the backend; the PTA
  reads them in the Stripe dashboard for receipts and outreach.
- Every Stripe receipt doubles as the IRS "contemporaneous written
  acknowledgment" donors need for gifts of $250+ (Pub 1771): the
  charge description carries the org name, EIN, and
  no-goods-or-services statement; the receipt supplies amount and date.
- Donors can add a voluntary fee cover: a default-checked opt-out
  checkbox on the amount step adds a gross-up,
  `(gift + 30¢) / (1 − 2.2%)`, as a second Checkout line item
  ("Covering card processing"), disclosed with the total on the
  summary step. Because it is voluntary it is a gift rather than a
  card surcharge, so it stays outside the card-network surcharge
  rules and the full amount remains tax-deductible. Every tally counts
  the intended gift.
- Promised in the UI and owed by operations: email receipts (enable in
  Stripe), the Spring Impact Report, and employer-matching follow-up
  (the `employer_match` flag on each gift).
