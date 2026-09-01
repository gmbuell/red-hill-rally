/* Campaign configuration — the static facts of the Rocket Rally.
   Live numbers come from /api/campaign (totals) and /api/board (the
   classroom race and honor roll). The worker imports this same file
   for validation, so the classroom roster and priorities live in
   exactly one place. */

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

/* Optional donor-paid fee cover, shared by the worker (authoritative)
   and the donate form (display). The gross-up finds the extra cents so
   the PTA nets the full gift after Stripe's 2.9% + 30¢:
   total = (gift + 30¢) / (1 − 2.9%). */
const FEE_RATE = 0.029;
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
    name: 'Fund the Rocket',
    goal: 90000,
    blurb: 'Red Hill’s PTA funds what district budgets don’t: a school counselor for every child navigating a hard moment, a dedicated PE teacher, and Tier II academic support that catches struggling readers and mathematicians early. About $90,000 a year — the quiet backbone of the whole school.',
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
    blurb: 'New this year: a hands-on STEM enrichment lab in our library run by All Things Science — circuits, chemistry, coding, and engineering challenges for every class, TK through 5th. The kind of science one teacher with thirty kids can’t stage alone, made routine. The program costs $25,000 a year and scales directly with support: your gift literally buys lab time for all 510 Rockets.',
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
    blurb: 'Recess is a third of a kid’s social day, and the hardest part for many. Beyond Athletics coaches now turn lunch recess into organized games where everyone plays, sportsmanship is taught, and energy gets burned — teachers see it instantly in calmer, more focused afternoons.',
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
    blurb: 'The garden is Red Hill’s outdoor classroom — planting, patience, nutrition, and the joy of eating something you grew. This year we’re funding repairs, supplies, and improvements, with a possible curriculum refresh ($15,000 budgeted; every donated dollar and seedling reduces that cost).',
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
    blurb: 'Every Rocket gets visual art instruction, classical music education, enrichment assemblies, and access to a thriving performing-arts program — more than $20,000 a year of arts, nearly all of it PTA-funded and almost none of it, until now, ever presented to donors as something they could choose to support.',
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
    blurb: 'Most Red Hill classrooms have broken blinds. The fix is security window tinting in every classroom — letting staff block visibility into rooms when needed — plus improvements to the multi-purpose room our whole community uses. Total one-time cost: $40,000.',
    circle: { min: 500, label: 'Wing Sponsor' },
    tiers: [
      { amount: 25, impact: 'Joins hundreds of families powering the goal' },
      { amount: 100, impact: 'Upgrades or tints window glass for 1 classroom' },
      { amount: 250, impact: 'Co-sponsors full security/facility upgrades for 1 classroom' },
      { amount: 500, plus: true, impact: 'Fully upgrades a row/wing of classrooms — recognized in the annual impact report' },
    ],
  },
];

const CAMPAIGN = {
  goal: PRIORITIES.reduce((s, p) => s + p.goal, 0),      // 205,000
};

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

/* Business partnership ladder (September–October). Each tier includes
   every benefit of the tiers above it in this list — mirror the
   one-pager when editing. `logo` is whether the tier earns a logo on
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

/* Businesses backing this year's Rally, shown on /partners and the
   Rally Board. `tier` is a PARTNER_TIERS id — fill it in as each gift
   arrives — these six came in before tiers were tracked and sit at
   'supporter', the lowest logo tier, until confirmed (null shows a
   logo without a tier label; 'friend' lists
   the name instead of a logo, per the ladder). Web logos live in
   site/img/partners/; print-quality originals stay out of the repo
   (assets/partner-logos/, gitignored).
   The board bakes this list — run `node scripts/board-skeleton.js
   --write` after editing. */
const PARTNERS = [
  { name: 'Black Gold Pump & Supply', logo: 'black-gold-pump-supply.webp', tier: 'supporter' },
  { name: 'Earthco Landscape Services', logo: 'earthco-landscape.webp', tier: 'supporter' },
  { name: 'Felton Ninja Academy', logo: 'felton-ninja-academy.webp', tier: 'supporter' },
  { name: 'Galaxy Automotive & Tire', logo: 'galaxy-automotive.webp', tier: 'supporter' },
  { name: 'Sports Ambassadors of Quan', logo: 'aoq-sports.webp', tier: 'supporter' },
  { name: 'The O’Dell Group Real Estate', logo: 'odell-group.webp', tier: 'supporter' },
];

/* Lookup helpers shared by the worker and every page script. */
const priorityById = (id) => PRIORITIES.find((p) => p.id === id) || null;
const classroomById = (id) => CLASSROOMS.find((c) => c.id === id) || null;
const partnerTierById = (id) => PARTNER_TIERS.find((t) => t.id === id) || null;

/* Display names for the roster's grade codes; any other code reads
   "<code> grade". */
const GRADE_NAMES = { TK: 'Transitional K', K: 'Kindergarten', SDC: 'Special Day Class', '1st/2nd': '1st/2nd combo' };
const gradeName = (g) => GRADE_NAMES[g] || `${g} grade`;

/* Worker import — the browser loads this file as a plain script and
   never defines `module`. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ORG, PRIORITIES, CAMPAIGN, CLASSROOMS, PARTNER_TIERS, PARTNERS,
    MAX_NAME, MAX_AMOUNT, MAX_STUDENTS, feeCoverCents,
    priorityById, classroomById, partnerTierById,
  };
}
