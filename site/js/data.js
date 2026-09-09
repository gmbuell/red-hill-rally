/* Campaign configuration — the static facts of the Rocket Rally.
   Live numbers (totals, the classroom race, the honor roll) come from
   D1 and are rendered into the pages by the worker. The worker imports
   this same file for validation and rendering, so the classroom roster
   and priorities live in exactly one place. */

const ORG = {
  name: 'Red Hill Elementary PTA',
  /* Federal tax ID (EIN) — appears in the tax-acknowledgment line on
     every Stripe receipt. */
  ein: '33-0973857',
};

/* Gift limits, enforced by the API and mirrored by the donate form. */
const MAX_NAME = 80;      // characters, donor and student names
const MAX_AMOUNT = 50000; // dollars, per gift
const MAX_STUDENTS = 4;   // Rockets credited per gift, and per family link
const MAX_SHIRTS = 10;    // shirts per checkout

/* The Rally shirt, an add-on under each Rocket on the donate form. A
   family pays `price`; `credit` of it counts as fundraising for that
   Rocket and their classroom (the rest is the shirt), and `value` is
   the good-faith fair-market value the receipt states, the part of
   the payment a donor may not deduct (IRS Pub 1771). */
const SHIRT = {
  price: 20,
  credit: 10,
  value: 10,
  sizes: [
    { id: 'YXS', label: 'Youth XS' },
    { id: 'YS', label: 'Youth S' },
    { id: 'YM', label: 'Youth M' },
    { id: 'YL', label: 'Youth L' },
    { id: 'YXL', label: 'Youth XL' },
    { id: 'AS', label: 'Adult S' },
    { id: 'AM', label: 'Adult M' },
    { id: 'AL', label: 'Adult L' },
    { id: 'AXL', label: 'Adult XL' },
    { id: 'A2XL', label: 'Adult 2XL' },
  ],
};
const shirtSizeById = (id) => SHIRT.sizes.find((z) => z.id === id) || null;

/* Optional donor-paid fee cover, shared by the worker (authoritative)
   and the donate form (display). The gross-up finds the extra cents so
   the PTA nets the full gift after Stripe's nonprofit rate,
   2.2% + 30¢: total = (gift + 30¢) / (1 − 2.2%). */
const FEE_RATE = 0.022;
const FEE_FLAT_CENTS = 30;
const feeCoverCents = (amountCents) =>
  Math.round((amountCents + FEE_FLAT_CENTS) / (1 - FEE_RATE)) - amountCents;

/* `circle` is a priority's named recognition tier: gifts of `min`
   dollars or more are badged with `label` on the honor roll. Every
   priority badges its open-ended top tier, which `plus` flags and the
   donate form shows as "$500+". */
const PRIORITIES = [
  {
    id: 'people',
    name: 'Essential Support Staff',
    goal: 90000,
    blurb: 'PTA funding helps provide the people and support our district budget doesn’t fully cover, including counseling, PE and academic intervention.',
    circle: { min: 500, label: 'Counselor Circle' },
    tiers: [
      { amount: 25, impact: 'Joins hundreds of families powering the annual fund' },
      { amount: 100, impact: 'A day of academic support on campus' },
      { amount: 250, impact: 'A week of the people programs' },
      { amount: 500, plus: true, impact: 'Counselor Circle — personal impact briefing from the VP of Ways and Means' },
    ],
  },
  {
    id: 'stem',
    name: 'The STEM Lab',
    goal: 25000,
    blurb: 'A hands-on STEM enrichment lab where every student explores science, engineering, coding and more through grade-level activities.',
    circle: { min: 500, label: 'Lab Sponsor' },
    tiers: [
      { amount: 25, impact: 'Materials for a classroom’s experiment day' },
      { amount: 100, impact: 'Co-sponsors a STEM Lab visit for one class' },
      { amount: 250, impact: 'Co-sponsors a STEM Lab visit for an entire grade level' },
      { amount: 500, plus: true, impact: 'Co-sponsors a class’s STEM Lab visits for the entire school year' },
    ],
  },
  {
    id: 'sports',
    name: 'Play With Purpose',
    goal: 15000,
    blurb: 'Beyond Athletics coaches turn lunch recess into organized games that build confidence, sportsmanship and positive play.',
    circle: { min: 500, label: 'Season Sponsor' },
    tiers: [
      { amount: 25, impact: 'Equipment: balls, cones, pinnies' },
      { amount: 100, impact: 'A full month of coached recess play for one class' },
      { amount: 250, impact: 'A full month of coached recess play for one grade level' },
      { amount: 500, plus: true, impact: 'Season sponsor — recognized at Friday Flag' },
    ],
  },
  {
    id: 'garden',
    name: 'The Red Hill Garden',
    goal: 15000,
    blurb: 'Our outdoor classroom brings learning to life through planting, harvesting and a new grade-level-specific curriculum.',
    circle: { min: 500, label: 'Garden Bed Sponsor' },
    tiers: [
      { amount: 25, impact: 'Soil, seeds, and tools' },
      { amount: 100, impact: 'Sponsors 1 full garden visit for a class (plus extra supplies)' },
      { amount: 250, impact: 'Sponsors 3 garden visits for a class (a full trimester)' },
      { amount: 500, plus: true, impact: 'Sponsors 1 garden visit for an entire grade level — named garden bed' },
    ],
  },
  {
    id: 'arts',
    name: 'Arts at Red Hill',
    goal: 20000,
    blurb: 'PTA funding brings visual art, music, enrichment assemblies and performing arts experiences to Red Hill students.',
    circle: { min: 500, label: 'Season Patron' },
    tiers: [
      { amount: 25, impact: 'Art supplies for a classroom’s Art Masters unit' },
      { amount: 100, impact: 'An enrichment assembly seat-section (or co-sponsors Class Act workshops)' },
      { amount: 250, impact: 'Fully sponsors 1 class for the Annual School Performance or 1 full Art Masters unit' },
      { amount: 500, plus: true, impact: 'Season Patron — sponsors Class Act workshops for a full grade level (includes recognition + 2 tickets to this year’s RHPA performance)' },
    ],
  },
  {
    id: 'safety',
    name: 'A Safer, Brighter Campus',
    goal: 40000,
    blurb: 'PTA-funded campus improvements include classroom window tinting and upgrades to shared spaces used by our entire school community.',
    circle: { min: 500, label: 'Wing Sponsor' },
    tiers: [
      { amount: 25, impact: 'Joins hundreds of families powering the goal' },
      { amount: 100, impact: 'Upgrades or tints window glass for 1 classroom' },
      { amount: 250, impact: 'Co-sponsors full security/facility upgrades for 1 classroom' },
      { amount: 500, plus: true, impact: 'Fully upgrades a row/wing of classrooms — recognized in the annual impact report' },
    ],
  },
];

/* The seventh way to give: one gift divided evenly across all six.
   Deliberately not a member of PRIORITIES — the home cards, the goal
   share math and the per-priority tallies are all keyed to the six —
   but `priorityById` answers for it, so the donate wizard, checkout,
   the thank-you page and the honor roll treat it like any other
   choice. `sentenceName` is the form that reads correctly inside a
   sentence, where "your gift to Support It All" would not. */
const SUPPORT_ALL = {
  id: 'all',
  name: 'Support It All',
  sentenceName: 'all six fundraising priorities',
  blurb: 'Can’t pick just one? Neither can we. Your gift spreads evenly across all six.',
  tiers: [
    { amount: 25, impact: 'A share into every one of the six' },
    { amount: 100, impact: 'Every program on the list feels this' },
    { amount: 250, impact: 'A real lift for all six at once' },
    { amount: 500, plus: true, impact: 'Backs the whole Rally, top to bottom' },
  ],
};

/* The campaign goal is the number on the ticker and the thermometer
   outside school: what the Rally itself is trying to raise this fall.
   It is deliberately not the sum of the priority goals — those are
   what each program costs to run for a year, most of it already
   covered by the annual fund, so adding them up would advertise a
   target the Rally is not chasing. */
const CAMPAIGN = {
  goal: 50000,
};

/* A priority's share of the campaign goal, in proportion to its
   annual cost. A home card's trail runs toward this figure, which is
   never printed: the cards reach the star together when the Rally
   reaches its goal. */
const priorityTarget = (p) =>
  CAMPAIGN.goal * p.goal / PRIORITIES.reduce((s, q) => s + q.goal, 0);

/* The classroom roster, keyed by teacher. `students` is the class
   size and sets the participation denominator in the classroom race. */
const CLASSROOMS = [
  { id: 'hesseltine', teacher: 'Mrs. Hesseltine', grade: 'TK', students: 20 },
  { id: 'wass', teacher: 'Mrs. Wass', grade: 'TK', students: 20 },
  { id: 'montgomery', teacher: 'Mrs. Montgomery', grade: 'TK', students: 20 },
  { id: 'michel', teacher: 'Mrs. Michel', grade: 'K', students: 27 },
  { id: 'convery', teacher: 'Ms. Convery', grade: 'K', students: 29 },
  { id: 'marshall', teacher: 'Ms. Marshall', grade: 'K', students: 24 },
  { id: 'knott', teacher: 'Mrs. Knott', grade: '1st', students: 26 },
  { id: 'ludes', teacher: 'Mrs. Ludes', grade: '1st', students: 26 },
  { id: 'miller', teacher: 'Ms. Miller', grade: '1st', students: 26 },
  { id: 'sharp', teacher: 'Mrs. Sharp', grade: '1st/2nd', students: 26 },
  { id: 'bryan', teacher: 'Mrs. Bryan', grade: '2nd', students: 26 },
  { id: 'bowers', teacher: 'Mrs. Bowers', grade: '2nd', students: 25 },
  { id: 'zweber', teacher: 'Mr. Zweber', grade: '3rd', students: 32 },
  { id: 'harrison', teacher: 'Mrs. Harrison', grade: '3rd', students: 31 },
  { id: 'sianez', teacher: 'Mrs. Sianez', grade: '4th', students: 32 },
  { id: 'herman', teacher: 'Mrs. Herman', grade: '4th', students: 32 },
  { id: 'crain', teacher: 'Mrs. Crain', grade: '5th', students: 29 },
  { id: 'knutson', teacher: 'Mr. Knutson', grade: '5th', students: 29 },
  { id: 'bishop', teacher: 'Mr. Bishop', grade: 'SDC', students: 13 },
  { id: 'smith', teacher: 'Mrs. Smith', grade: 'SDC', students: 11 },
];

/* Business partnership ladder. Each tier includes every benefit of
   the tiers above it in this list. `logo` is whether the tier earns a logo on
   the site (the wall, the board, the thank-you uploader) — a tier
   without it is listed by name. */
const PARTNER_TIERS = [
  { id: 'friend', name: 'Rally Friend', amount: 250, logo: false, benefits: [
    'Name on the Rocket Rally webpage',
    'Social media thank-you during Rally week',
  ] },
  { id: 'supporter', name: 'Rally Supporter', amount: 500, logo: true, benefits: [
    'Digital marquee rotation (1 week, Rally week only)',
    'Logo on the Rocket Rally webpage',
  ] },
  { id: 'champion', name: 'Rally Champion', amount: 750, logo: true, benefits: [
    'Logo on the Rocket Rally event shirt',
    'Featured Instagram post',
    'Mention in the Rally newsletter issue',
  ] },
  { id: 'mvp', name: 'Rally MVP', amount: 1500, logo: true, benefits: [
    'Instagram Story added alongside the featured post',
    'Mid-size logo on the Rocket Rally walk-to-school sponsor boards (route and arrival gates)',
  ] },
];

/* Annual Partnership levels. These are the year-round partnerships
   that run July through the first week of September, separate from the
   Rally-only ladder above: an Annual Partner is already backing the
   whole year, so they sit above the Rally tiers on the wall rather
   than inside them. `size` drives how large the logo card renders. */
const ANNUAL_LEVELS = [
  { id: 'apollo', name: 'Apollo Partner', size: 'lg' },
  { id: 'orbit', name: 'Orbit Partner', size: 'md' },
];

/* Businesses backing this year's Rally, shown on /partners and the
   Rally Board. `annual` is an ANNUAL_LEVELS id for a year-round
   partner and outranks `tier`, a PARTNER_TIERS id filled in as each
   Rally gift arrives (null shows a logo without a tier label;
   'friend' lists the name instead of a logo, per the ladder).
   `presenting` marks the one partner the home hero credits by name,
   text only, per the partnership terms. Web logos live in
   site/img/partners/; print-quality originals stay out of the repo
   (assets/partner-logos/, gitignored). */
const PARTNERS = [
  { name: 'Earthco Landscape Services', logo: 'earthco-landscape.webp', annual: 'apollo', presenting: true },
  { name: 'The O’Dell Group Real Estate', logo: 'odell-group.webp', annual: 'apollo' },
  { name: 'AOQ Sports', logo: 'aoq-sports.webp', annual: 'orbit' },
  { name: 'Galaxy Automotive & Tire', logo: 'galaxy-automotive.webp', annual: 'orbit' },
  { name: 'Felton Ninja Academy', logo: 'felton-ninja-academy.webp', annual: 'orbit' },
  // Thanked by name, no level recorded: recognition the PTA is giving
  // now, not a ledger. A tier here would claim a dollar figure nobody
  // has settled, and one arriving through checkout still outranks it.
  { name: 'Black Gold Pump & Supply' },
  { name: 'CH Design & Renovation' },
  { name: 'Sakura Smiles Pediatric Dentistry' },
  { name: 'OC Mom Trainer' },
];

/* Lookup helpers shared by the worker and every page script. */
const priorityById = (id) =>
  (id === SUPPORT_ALL.id ? SUPPORT_ALL : PRIORITIES.find((p) => p.id === id) || null);
const classroomById = (id) => CLASSROOMS.find((c) => c.id === id) || null;
const partnerTierById = (id) => PARTNER_TIERS.find((t) => t.id === id) || null;
const annualLevelById = (id) => ANNUAL_LEVELS.find((l) => l.id === id) || null;
const presentingPartner = () => PARTNERS.find((p) => p.presenting) || null;

/* Display names for the roster's grade codes; any other code reads
   "<code> grade". */
const GRADE_NAMES = { TK: 'Transitional K', K: 'Kindergarten', SDC: 'Special Day Class', '1st/2nd': '1st/2nd combo' };
const gradeName = (g) => GRADE_NAMES[g] || `${g} grade`;

/* Worker import — the browser loads this file as a plain script and
   never defines `module`. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ORG, PRIORITIES, SUPPORT_ALL, CAMPAIGN, CLASSROOMS, PARTNER_TIERS, PARTNERS,
    ANNUAL_LEVELS,
    MAX_NAME, MAX_AMOUNT, MAX_STUDENTS, MAX_SHIRTS, SHIRT, feeCoverCents,
    priorityById, classroomById, partnerTierById, annualLevelById, gradeName, shirtSizeById,
    priorityTarget, presentingPartner,
  };
}
