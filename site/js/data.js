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

/* `circle` marks a priority's named $2,500 recognition tier: gifts of
   `min` dollars or more are badged with `label` on the honor roll. */
const PRIORITIES = [
  {
    id: 'people',
    name: 'Student Support Staff',
    goal: 90000,
    blurb: 'The heart of our campus. Unlike most elementary schools, Red Hill directly funds key personnel: a full-time school counselor, a dedicated physical education teacher, and Tier II academic intervention specialists who catch struggling readers and mathematicians before they fall behind.',
    circle: { min: 2500, label: 'Counselor Circle' },
    tiers: [
      { amount: 50, impact: 'Joins hundreds of families powering the annual fund' },
      { amount: 250, impact: 'A day of counselor support on campus' },
      { amount: 1000, impact: 'A week of the people programs' },
      { amount: 2500, impact: 'Counselor Circle — a personal impact briefing' },
    ],
  },
  {
    id: 'stem',
    name: 'Hands-On STEM Lab',
    goal: 25000,
    blurb: 'Weekly, interactive science for every student. Led by All Things Science, our lab provides hands-on experiments in coding, engineering, chemistry, and circuits — building scientific confidence early.',
    tiers: [
      { amount: 100, impact: "Materials for a classroom's experiment day" },
      { amount: 500, impact: 'One full week of STEM Lab, every class' },
      { amount: 2500, impact: 'A whole month of STEM Lab' },
    ],
  },
  {
    id: 'sports',
    name: 'Organized Sports at Lunch Recess',
    goal: 15000,
    blurb: 'Active, inclusive play. Partnering with Beyond Athletics, professional coaches turn lunchtime recess into structured games that teach teamwork, resolve conflicts, and ensure every child is included.',
    tiers: [
      { amount: 50, impact: 'Equipment: balls, cones, pinnies' },
      { amount: 250, impact: 'A full week of coached recess play' },
      { amount: 1000, impact: 'A month of coached recess play' },
    ],
  },
  {
    id: 'garden',
    name: 'School Garden Program',
    goal: 15000,
    blurb: 'Outdoor, hands-on learning. Provides hands-on nutrition and environmental science lessons, garden maintenance, and supply upkeep that enrich science curriculum across all grade levels.',
    tiers: [
      { amount: 100, impact: 'Soil, seeds, and tools for a season' },
      { amount: 250, impact: 'Sponsor a garden bed — your family name on it' },
      { amount: 1000, impact: 'A season of garden programming' },
    ],
  },
  {
    id: 'arts',
    name: 'Arts & Cultural Enrichment',
    goal: 20000,
    blurb: 'Inspiring creativity and performance. Fully funds visual arts instruction (Art Masters), classical music education (Class Act in partnership with Pacific Symphony), Red Hill performing arts, and visiting educational assemblies.',
    circle: { min: 2500, label: 'Season Patron' },
    tiers: [
      { amount: 100, impact: "Art supplies for a classroom's Art Masters unit" },
      { amount: 250, impact: 'An enrichment assembly seat-section' },
      { amount: 1000, impact: 'A full school assembly, recognized in the program' },
      { amount: 2500, impact: 'Season Patron — recognized at every performance' },
    ],
  },
  {
    id: 'safety',
    name: 'Campus Safety & Facility Upgrades',
    goal: 40000,
    blurb: 'Protecting and improving our learning spaces. A one-time capital investment to install classroom window tinting for enhanced campus security, alongside multi-purpose room (MPR) enhancements used by the entire school community.',
    tiers: [
      { amount: 250, impact: 'Tints one classroom window' },
      { amount: 1000, impact: 'Completes a full classroom' },
      { amount: 5000, impact: 'Completes a whole wing' },
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

/* Lookup helpers shared by the worker and every page script. */
const priorityById = (id) => PRIORITIES.find((p) => p.id === id) || null;
const classroomById = (id) => CLASSROOMS.find((c) => c.id === id) || null;

/* Worker import — the browser loads this file as a plain script and
   never defines `module`. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ORG, PRIORITIES, CAMPAIGN, CLASSROOMS,
    MAX_NAME, MAX_AMOUNT, priorityById, classroomById,
  };
}
