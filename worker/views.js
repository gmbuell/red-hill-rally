/* Page views: the brand motifs the worker draws (priority icons, the
   flight trail, the hero meter), the partner wall, the shared header
   and footer, and one slot builder per page — pure functions from the
   stats payload (null for the zero state) to {elementId: Html}.
   worker/pages.js streams them into the page HTML. */

import data from '../site/js/data.js';
import ui from '../site/js/ui.js';

const { ORG, PRIORITIES, CAMPAIGN, ANNUAL_COST, SHIRT, LUNCH, CLASSROOMS, boardClassrooms, PARTNER_TIERS, PARTNERS, ANNUAL_LEVELS, SUPPORT_ALL, priorityById, partnerTierById, annualLevelById, gradeName, priorityTarget, presentingPartner, shirtsOpen } = data;
const { html, raw, money, nameList, studentRowsMarkup, LINK_ROWS, SHIRT_ROWS, dartUp } = ui;

/* ---- motifs (from the brand guide's Spirit Kit) -------------------- */

const STAR = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';

// Red rocket pointing straight up (rotate it yourself), gold plume
const redRocketUp = raw(`
  <path d="M23.5 30 C18 32.5 15 37.5 14 44 C17.5 41.5 20.5 40.5 23.5 40.5 Z" fill="#000000"/>
  <path d="M40.5 30 C46 32.5 49 37.5 50 44 C46.5 41.5 43.5 40.5 40.5 40.5 Z" fill="#000000"/>
  <path d="M32 45 C36 49 37 53.5 32 60 C27 53.5 28 49 32 45 Z" fill="#E31E24"/>
  <path d="M32 47.5 C34.2 50.2 34.5 52.5 32 56.5 C29.5 52.5 29.8 50.2 32 47.5 Z" fill="#E31E24"/>
  <path d="M32 5 C37.5 10.5 40.5 17.5 40.5 26 L40.5 39 Q40.5 42 37.5 42 L26.5 42 Q23.5 42 23.5 39 L23.5 26 C23.5 17.5 26.5 10.5 32 5 Z" fill="#E31E24"/>
  <path d="M26.5 42 L37.5 42 L36.3 45.5 L27.7 45.5 Z" fill="#000000"/>
  <circle cx="32" cy="22" r="5.6" fill="#000000"/>
  <circle cx="32" cy="22" r="3.6" fill="#FFFFFF"/>`);

/* ---- program icons -------------------------------------------------- */

const ICONS = {
  people: raw(`<path d="M32 50C18 39 10 30 10 20a12 12 0 0 1 22-6.5A12 12 0 0 1 54 20c0 10-8 19-22 30z" fill="#E31E24"/>`),
  stem: raw(`<path d="M25 6h14v4h-2.5v12l11 20a6.5 6.5 0 0 1-5.7 9.7H22.2a6.5 6.5 0 0 1-5.7-9.7l11-20V10H25Z" fill="#000000"/>
    <circle cx="32" cy="40" r="3.4" fill="#E31E24"/>
    <circle cx="25.5" cy="45" r="2.2" fill="#FFFFFF"/>
    <circle cx="38" cy="46" r="1.8" fill="#FFFFFF"/>`),
  sports: raw(`<g transform="translate(-46 -24) scale(1.62)">
    <path d="M37 36.8 L37 28.5 C37 26.7 38.4 25.6 40.2 26 L44 26.9 C45.6 27.3 46.7 28.2 48 29.6 C50.5 32.3 54 34.2 58.3 35.2 C60.4 35.7 61.5 36.1 61.5 36.8 Z" fill="#000000"/>
    <path d="M37 28.5 C37 26.7 38.4 25.6 40.2 26 L44 26.9 L43.4 29.4 C41 28.4 38.9 28.2 37 28.5 Z" fill="#E31E24"/>
    <rect x="36" y="36.6" width="26" height="2.2" rx="1.1" fill="#FFFFFF"/>
    <rect x="36" y="38.8" width="26" height="3.4" rx="1.7" fill="#E31E24"/>
    <g stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round">
      <path d="M46 31 L49.8 29.7"/><path d="M48.3 33.4 L52.1 32.1"/>
    </g></g>`),
  garden: raw(`<g transform="translate(-3 -8) scale(1.15)">
    <g fill="#7FB069"><circle cx="14" cy="46" r="8"/><circle cx="24" cy="43" r="9.5"/><circle cx="33" cy="47" r="7"/></g>
    <g stroke="#7FB069" stroke-width="2.5" stroke-linecap="round"><path d="M46 52V37"/><path d="M56 52V42"/></g>
    <circle cx="46" cy="32" r="5" fill="#E31E24"/><circle cx="56" cy="38" r="4.2" fill="#E31E24"/>
    <circle cx="46" cy="32" r="1.8" fill="#FFFFFF"/><circle cx="56" cy="38" r="1.5" fill="#FFFFFF"/></g>`),
  arts: raw(`<g transform="translate(-59 -17) scale(1.05)">
    <path d="M76 21.5 C68.3 21.5 62.5 27 62.5 33.7 C62.5 40.4 68.3 45.5 75.6 45.5 C78.4 45.5 79.6 43.8 78.8 41.9 C78 39.9 79.2 38 81.6 38 L85.3 38 C87.6 38 89.5 36.2 89.5 33.9 C89.5 27 83.7 21.5 76 21.5 Z" fill="#000000"/>
    <circle cx="70.5" cy="28.5" r="2.1" fill="#E31E24"/>
    <circle cx="76.5" cy="26.8" r="2.1" fill="#E31E24"/>
    <circle cx="82.5" cy="28.8" r="2.1" fill="#FFFFFF"/>
    <circle cx="71.5" cy="38.5" r="2.4" fill="#F4F4F2"/></g>`),
  safety: raw(`<rect x="15" y="24" width="34" height="26" fill="#FFFFFF"/>
    <path d="M11 26 L32 9 L53 26 Z" fill="#000000"/>
    <circle cx="32" cy="20" r="2.6" fill="#E31E24"/>
    <path d="M32 9V2" stroke="#000000" stroke-width="1.6"/>
    <path d="M32 2l8 2.2-8 2.2Z" fill="#E31E24"/>
    <path d="M28 50V39q4-4 8 0v11z" fill="#E31E24"/>
    <g fill="#000000"><rect x="18.5" y="30" width="7" height="7" rx="1"/><rect x="38.5" y="30" width="7" height="7" rx="1"/></g>
    <g stroke="#FFFFFF" stroke-width="1"><path d="M22 30.5v6.5"/><path d="M18.5 33.5h7"/><path d="M42 30.5v6.5"/><path d="M38.5 33.5h7"/></g>`),
};

ICONS.all = raw(`<path d="${STAR}" transform="translate(9.2,5.2) scale(1.9)" fill="#E31E24"/>`);

const icon = (id, cls = 'icon') =>
  html`<svg class="${cls}" viewBox="0 0 64 56" aria-hidden="true">${ICONS[id] || ''}</svg>`;

/* ---- the flight trail ----------------------------------------------
   Straight mini trail: dotted path, dart at the current position, gold
   star at the goal. Decorative markup — the numbers live in adjacent
   text, so the graphic is aria-hidden. */
const trailSVG = (pct) => {
  const W = 220, H = 32, x0 = 8, x1 = 196, cy = 16;
  const p = Math.max(0, Math.min(pct, 1));
  const xp = x0 + (x1 - x0) * p;
  return html`
  <svg class="trail" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <line x1="${xp.toFixed(1)}" y1="${cy}" x2="${x1}" y2="${cy}"
      stroke="#6B6B6B" stroke-opacity="0.5" stroke-width="3.25"
      stroke-linecap="round" stroke-dasharray="0 9"/>
    <line x1="${x0}" y1="${cy}" x2="${xp.toFixed(1)}" y2="${cy}"
      stroke="#000000" stroke-width="3.25"
      stroke-linecap="round" stroke-dasharray="0 9"/>
    <g transform="translate(${(x1 + 12 - 6.6).toFixed(1)},${cy - 6.6}) scale(0.55)">
      <path d="${STAR}" fill="#E31E24" stroke="#000000" stroke-width="1.8"/>
    </g>
    <g transform="translate(${xp.toFixed(1)},${cy}) rotate(90) scale(0.55) translate(-32,-29)">
      ${dartUp}
    </g>
  </svg>`;
};

/* Hero campaign meter: the red rocket mid-flight on a rising dotted
   arc. The arc is one cubic Bézier, pre-sampled into an arc-length
   table so progress → point/tangent is plain math — no
   getPointAtLength on a just-written SVG, which forced a ~70ms
   layout pass per render. */
const TRAJ_D = 'M36 160 C 210 150 470 116 640 34';
const TRAJ_PTS = (() => {
  const bez = (a, b, c, d, t) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  const pts = [];
  for (let i = 0; i <= 128; i++) {
    const t = i / 128;
    const x = bez(36, 210, 470, 640, t);
    const y = bez(160, 150, 116, 34, t);
    const dist = i ? pts[i - 1].dist + Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y) : 0;
    pts.push({ x, y, dist });
  }
  return pts;
})();

/* Fraction of the arc's length → {x, y, angle} on the curve. */
const trajPointAt = (frac) => {
  const target = frac * TRAJ_PTS[128].dist;
  let i = 1;
  while (i < 128 && TRAJ_PTS[i].dist < target) i++;
  const a = TRAJ_PTS[i - 1], b = TRAJ_PTS[i];
  const k = (target - a.dist) / (b.dist - a.dist);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI,
  };
};

/* Past the goal the arc keeps going. The rocket flies on out of the
   frame, and the star it passed stops being the destination and
   becomes a milestone, labelled so nobody has to guess why the rocket
   is beyond it. The label is the only text in a decorative graphic, so
   the figures beside the meter still carry the whole story for a
   screen reader — the svg stays aria-hidden. */
const TRAJ_PAST = `${TRAJ_D} C 672 22 694 4 714 -24`;

const trajectoryDone = () => html`
  <svg viewBox="0 -62 800 330" aria-hidden="true">
    <path class="t-done" d="${TRAJ_PAST}" fill="none"
      stroke="#000000" stroke-width="4.5" stroke-linecap="round"
      stroke-dasharray="0 12"/>
    <g class="t-star" transform="translate(640,34)">
      <g transform="translate(-13,-13) scale(1.1)">
        <path d="${STAR}" fill="#E31E24" stroke="#000000" stroke-width="1.4"/>
      </g>
    </g>
    <line x1="640" y1="52" x2="640" y2="74" stroke="#5A6472" stroke-width="2.5"/>
    <text x="640" y="100" text-anchor="middle" font-family="Montserrat, sans-serif"
      font-size="22" font-weight="800" letter-spacing="2.4" fill="#5A6472">GOAL MET</text>
    <text x="640" y="130" text-anchor="middle" font-family="Montserrat, sans-serif"
      font-size="30" font-weight="800" fill="#0C2340">${money(CAMPAIGN.goal)}</text>
    <g class="t-rocket" transform="translate(714,-24) rotate(48) scale(0.95) translate(-32,-33)">
      ${redRocketUp}
    </g>
  </svg>`;

const trajectorySVG = (pct) => {
  if (pct >= 1) return trajectoryDone();
  const pt = trajPointAt(Math.max(0.02, Math.min(pct, 1)));
  return html`
  <svg viewBox="0 0 680 190" aria-hidden="true">
    <defs>
      <clipPath id="traj-clip"><rect x="0" y="0" width="${pt.x.toFixed(1)}" height="190"/></clipPath>
    </defs>
    <path class="t-rest" d="${TRAJ_D}" fill="none"
      stroke="#6B6B6B" stroke-opacity="0.5" stroke-width="4.5"
      stroke-linecap="round" stroke-dasharray="0 12"/>
    <path class="t-done" d="${TRAJ_D}" fill="none"
      stroke="#000000" stroke-width="4.5" stroke-linecap="round"
      stroke-dasharray="0 12" clip-path="url(#traj-clip)"/>
    <g class="t-star" transform="translate(640,20)">
      <g transform="translate(-13,-13) scale(1.1)">
        <path d="${STAR}" fill="#E31E24" stroke="#000000" stroke-width="1.4"/>
      </g>
    </g>
    <g class="t-rocket" transform="translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) rotate(${(pt.angle + 90).toFixed(1)}) scale(0.95) translate(-32,-33)">
      ${redRocketUp}
    </g>
  </svg>`;
};

/* The public partner list: the curated PARTNERS roster from data.js
   merged with online partnerships (the `partners` rows of the API
   payloads). Names match loosely (case, punctuation, "&" vs "and"),
   and a business seen more than once keeps its highest tier and the
   last logo it uploaded — an upgrade or re-purchase can raise a
   listing, never demote it. `src` is the logo URL, or '' for
   name-only recognition (a tier without `logo`, or no logo at all).
   An unknown tier id (a typo in data.js) lists the business without
   a badge rather than breaking the page. The board's partner count is
   this list's length. */
const mergedPartners = (online) => {
  const key = (name) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const rank = (tier) => PARTNER_TIERS.findIndex((t) => t.id === tier);
  const byKey = new Map();
  for (const p of PARTNERS) {
    byKey.set(key(p.name), {
      name: p.name, tier: p.tier || '', annual: p.annual || '', label: p.label || '',
      src: p.logo ? `/img/partners/${p.logo}` : '',
    });
  }
  for (const p of (online || []).filter((o) => o && o.name)) {
    const cur = byKey.get(key(p.name)) || { name: p.name, tier: '', annual: '', label: '', src: '' };
    if (rank(p.tier) > rank(cur.tier)) cur.tier = p.tier;
    if (p.logo) cur.src = `/logo/${p.logo}`;
    byKey.set(key(p.name), cur);
  }
  return [...byKey.values()].map((p) => {
    const tier = partnerTierById(p.tier);
    const level = annualLevelById(p.annual);
    return {
      ...p,
      /* An Annual Partner is already backing the whole year, so its
         level is the badge and it always keeps its logo. A plain
         `label` is the fallback for a partner the PTA is recognising
         without a rung: it names what they are and claims no dollar
         figure, so a real tier — from the roster or from checkout —
         always wins over it. */
      tierName: level ? level.name : (tier ? tier.name : (p.label || '')),
      size: level ? level.size : 'sm',
      src: !level && tier && !tier.logo ? '' : p.src,
    };
  });
};

/* Wall order: Apollo, then Orbit, then everyone else, so the
   year-round partners sit at the top at the size their level earns. */
const wallRank = (p) => {
  const i = ANNUAL_LEVELS.findIndex((l) => l.id === p.annual);
  return i === -1 ? ANNUAL_LEVELS.length : i;
};

/* The partner wall — identical on /partners and the Rally Board:
   full-size logo cards (name, tier badge), or `empty` when nobody is
   listed yet, plus the thanks line for name-only tiers. `all` is the
   mergedPartners list. */
const BUSINESS_LIST = new Intl.ListFormat('en', { type: 'conjunction' });
const partnerWall = (all, empty) => {
  const logos = all.filter((p) => p.src).sort((a, b) => wallRank(a) - wallRank(b));
  const names = all.filter((p) => !p.src);
  const cards = logos.length ? html`
    <ul class="partner-grid">${logos.map((p) => html`
      <li class="partner-card size-${p.size}">
        <img src="${p.src}" alt="${p.name} logo" loading="lazy">
        <span class="partner-name">${p.name}</span>
        ${p.tierName ? html`<small class="partner-tier">${p.tierName}</small>` : ''}
      </li>`)}
    </ul>` : (names.length ? '' : empty);
  // Business names carry their own ampersands, so this list joins with "and".
  const thanks = names.length ? html`
      <p class="partner-friends">With thanks to ${BUSINESS_LIST.format(names.map((p) => p.name))}.</p>` : '';
  return html`${cards}${thanks}`;
};

/* ---- the shared chrome ---------------------------------------------- */

/* Five links is what fits two rows on a 375px phone, and the header is
   sticky, so a sixth costs every family 37px of screen for the whole
   visit. Business Partners is the one aimed at businesses rather than
   families, so it comes out of the bar and stays in the footer. */
const NAV = [
  ['/', 'Home'], ['/student-link', 'Student Link'], ['/rally-board', 'Rally Board'],
  ['/prizes', 'Prizes'], ['/why-we-rally', 'Why We Rally'],
];
const current = (path, here) => (path === here ? raw(' aria-current="page"') : '');

export const header = (here) => html`
  <div class="wrap bar">
    <a class="wordmark" href="/">
      <span class="rh">Red Hill</span>
      <span class="org">Elementary PTA</span>
    </a>
    <nav class="site-nav" aria-label="Site">${NAV.map(([path, label]) => html`
      <a href="${path}"${current(path, here)}>${label}</a>`)}
    </nav>
    <a class="btn secondary small donate-cta" href="/donate"${current('/donate', here)}>Donate <span class="arrow" aria-hidden="true">→</span></a>
  </div>`;

export const footer = () => html`
  <span class="script">Thank you for investing in our students, staff &amp; school.</span>
  <nav aria-label="Footer">
    <a href="/">Home</a>
    <a href="/donate">Donate</a>
    <a href="/student-link">Student Link</a>
    <a href="/my-rocket">Student Progress</a>
    <a href="/shirt">Rally Shirts</a>
    <a href="/rally-board">Rally Board</a>
    <a href="/prizes">Prizes</a>
    <a href="/partners">Business Partners</a>
    <a href="/why-we-rally">Why We Rally</a>
  </nav>
  <p>${ORG.name} &middot; Home of the Rockets &middot; Tustin Unified School District</p>
  <p>Red Hill PTA is a 501(c)(3) nonprofit, EIN ${ORG.ein} &mdash; donations are tax-deductible. Many employers match gifts &mdash; <a href="/matching">here&rsquo;s how</a>.</p>`;

/* ---- pages ------------------------------------------------------------ */

/* Every child in the school, including the rooms the classroom race
   leaves out: they are Rockets, and a figure calling itself
   school-wide while quietly dropping 26 of them would be a lie.
   Rockets are capped per class the way the rows are, so the school
   can't read over 100%. Home and the Rally Board both call this, so
   the two pages cannot print different percentages for one school. */
export const schoolParticipation = (perClass) => {
  const rooms = perClass || {};   // a failed read hands us null, not undefined
  let seats = 0;
  let flying = 0;
  for (const c of CLASSROOMS) {
    const { rockets = 0 } = rooms[c.id] || {};
    seats += c.students;
    flying += Math.min(rockets, c.students);
  }
  return { seats, flying, pct: seats > 0 ? Math.round((flying / seats) * 100) : 0 };
};

/* Home: the campaign meter, its raised/goal figures, and the six
   priority cards. */
export const homeSlots = (live) => {
  const raised = live ? live.campaign.raised : 0;
  const per = (live && live.priorities) || {};
  const presenter = presentingPartner();

  /* Past the goal the hero has to change what it asks for. The dollar
     figure is met and stays met — no second number is invented to
     chase, which would tell the families who already gave that the
     finish line moves. Instead the goal becomes something achieved and
     the live ask becomes the one race still open: every Rocket in the
     air before giving closes. Dollars keep counting either way, and
     every gift after the goal still funds the same six programs. */
  const met = raised >= CAMPAIGN.goal;
  const school = schoolParticipation(live && live.classrooms);
  return {
    // The shirt callout carries the deadline while there is one to
    // make, and the whole card goes once there isn't: a button to a
    // closed order form is worse than no button.
    ...(shirtsOpen()
      ? { 'shirt-callout-note': html`Order a Rally shirt on its own &mdash; half of every shirt still counts toward your Rocket and their classroom. Ordering closes <strong>${SHIRT.deadlineLabel}</strong>.` }
      : { 'shirt-callout': null }),
    trajectory: trajectorySVG(raised / CAMPAIGN.goal),
    presented: presenter
      ? html`<p class="presented">The 2026 Rocket Rally is generously presented by our Annual Partner <strong>${presenter.name}</strong></p>`
      : '',
    /* Why keep giving with the goal met: the list costs more than the
       Rally was ever asking for, which /why-we-rally has said card by
       card all along. A gap to close is a reason; a bigger goal would
       have been a moved finish line. */
    'goal-met': met
      ? html`<p class="goal-met"><strong>We did it!</strong> The Red Hill community passed our ${money(CAMPAIGN.goal)} goal. The <a href="/why-we-rally">six</a> programs and priorities supported by the Red Hill PTA cost about <a href="/why-we-rally">${money(ANNUAL_COST)} each year</a>. Every gift from now until ${CAMPAIGN.closeDayLabel} helps fund them, and every class is still racing to 100% participation until giving closes.</p>`
      : null,
    'stat-raised': html`${money(raised)}`,
    // Second figure: the goal while it is still ahead, and once it is
    // behind us, the race that isn't finished.
    'stat-goal': met ? html`${school.pct}%` : html`${money(CAMPAIGN.goal)}`,
    'goal-label': met ? html`of Rockets have participated` : html`Our goal`,
    'goal-sub': met ? html`${school.flying} of ${school.seats} students` : null,
    // The year-round partners, named on the home page. Reads the same
    // roster the wall does, so a new Annual Partner appears in both.
    'partner-names': html`${BUSINESS_LIST.format(PARTNERS.filter((p) => p.annual).map((p) => p.name))}`,
    'priority-grid': html`${PRIORITIES.map((p) => {
      const pRaised = per[p.id] || 0;
      return html`
      <article class="priority-card">
        ${icon(p.id)}
        <h3>${p.name}</h3>
        <p class="blurb">${p.blurb}</p>
        <div class="trail-row">
          ${trailSVG(pRaised / priorityTarget(p))}
          <small class="raised-line"><strong>${money(pRaised)}</strong> raised</small>
        </div>
        <a class="go" href="/donate?p=${p.id}">Give to this</a>
      </article>`;
    })}`,
  };
};

/* Donate, step 1: one radio card per priority. Step 2 mentions the
   shirt add-on, so it carries the deadline and then stops mentioning
   shirts at all once they can't be ordered. */
export const donateSlots = () => ({
  'rocket-hint': shirtsOpen()
    ? html`Every gift counts for your Rocket and their class &mdash; and a Rally shirt does too, through <strong>${SHIRT.deadlineLabel}</strong>.`
    : html`Every gift counts for your Rocket and their class.`,
  'priority-options': html`${PRIORITIES.map((p) => html`
      <label class="option-card with-icon">
        <input type="radio" name="priority" value="${p.id}">
        ${icon(p.id)}
        <span class="name">${p.name}</span>
        <small class="desc">${p.blurb}</small>
      </label>`)}
      <label class="option-card with-icon support-all-option">
        <input type="radio" name="priority" value="${SUPPORT_ALL.id}">
        ${icon(SUPPORT_ALL.id)}
        <span class="name">${SUPPORT_ALL.name}</span>
        <small class="desc">${SUPPORT_ALL.blurb}</small>
      </label>`,
});

/* Rally Board: campaign totals, the classroom race (ranked by
   participation), the honor roll, and the partner strip. */
export const boardSlots = (live) => {
  const raised = live ? live.campaign.raised : 0;
  const perClass = (live && live.classrooms) || {};
  const donors = (live && live.donors) || [];
  const partners = mergedPartners(live && live.partners);

  /* Rank and count on the percentage the board prints, not the raw
     fraction behind it: a family reads the order off the rows, and a
     class shown at 80% that sorted below one shown at 80% because of a
     hidden decimal reads as a broken board. Ties break on dollars,
     which is what happens once classes start piling up at 100% —
     everyone can reach it, so participation stops separating them. */
  const measure = (c) => {
    const { rockets = 0, raised = 0 } = perClass[c.id] || {};
    const pct = c.students > 0 ? Math.min(rockets / c.students, 1) : 0;
    return { ...c, rockets, raised, pct, shown: Math.round(pct * 100) };
  };

  /* The race, the Golden Shoe line and the prize counts all read the
     same list, so a family can check every figure against the rows in
     front of them. `offBoard` rooms are not in it — see data.js for
     what that does and does not withhold. */
  const ranked = boardClassrooms().map(measure)
    .sort((a, b) => b.shown - a.shown || b.raised - a.raised);

  /* Two headline numbers, because the Rally is run on two: dollars and
     how many kids have participated. One number alone taught families
     that only the money counted, which is the opposite of the point — a
     $1 gift moves this second figure exactly as far as a $100 one. The
     percentage carries the count under it, because a share alone does
     not say how many children it is. Rockets are
     capped per class the way the rows are, so the school can't read
     over 100%. Deliberately not a gift or partner count: those invited
     arithmetic nobody should be doing, and read as bad news early. */
  const school = schoolParticipation(perClass);
  const met = raised >= CAMPAIGN.goal;
  /* Once the goal is behind us the headline stops counting toward a
     number already reached and says how far past it we are — the
     arithmetic done here, because "$52,775 raised of $50,000" makes a
     family do subtraction to find the good news. The exact-landing
     case says met rather than "$0 past". No new target takes its
     place. */
  const over = raised - CAMPAIGN.goal;
  const totals = [
    met
      ? [money(raised), 'raised', over > 0
        ? `${money(over)} past our ${money(CAMPAIGN.goal)} goal`
        : `our ${money(CAMPAIGN.goal)} goal, met`]
      : [money(raised), 'raised of ' + money(CAMPAIGN.goal), ''],
    [`${school.pct}%`, 'of Rockets have participated',
     `${school.flying} of ${school.seats} students`],
  /* The count is a div, not a span: pages and stylesheet are separate
     caches, so a phone can hold yesterday's CSS against today's markup
     for a while after a deploy. A span in that window runs straight on
     from the end of the label ("…PARTICIPATED40 of 505 students"); a
     div takes its own line with no stylesheet at all. */
  ].map(([num, label, sub]) => html`
      <div class="total"><span class="num money">${num}</span><span class="label">${label}</span>${
        sub ? html`<div class="sub">${sub}</div>` : ''}</div>`);

  const race = ranked.map((c, i) => html`
      <li class="${i < 3 && c.rockets > 0 ? 'leader' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="room">${c.teacher}<small class="grade">${gradeName(c.grade)}</small></span>
        <span class="trail">${trailSVG(c.pct)}</span>
        <span class="pct">${c.shown}%<small>participation</small></span>
        <span class="raised">${money(c.raised)}<small>total raised</small></span>
      </li>`);

  /* The Top Class prize is decided on dollars, not participation, so
     the class leading it needs saying out loud — the list beneath is
     ranked the other way, and nobody should have to scan it. Early on,
     several rooms sit level, and naming one of them as the leader is
     the kind of thing a family writes in about. */
  const most = Math.max(0, ...ranked.map((c) => c.raised));
  const leaders = most > 0 ? ranked.filter((c) => c.raised === most) : [];
  const shoeLine = !leaders.length
    ? html`Still anyone&rsquo;s. The Top Class prize goes to the room that raises the most.`
    : leaders.length === 1
      ? html`<strong>${leaders[0].teacher}&rsquo;s class</strong> &middot; ${money(most)} raised`
      : leaders.length <= 3
        ? html`<strong>${nameList(leaders.map((c) => `${c.teacher}’s`))} classes</strong>, tied at ${money(most)}`
        : html`<strong>${leaders.length} classes</strong> tied at ${money(most)}`;
  const goldenShoe = html`<small class="label">Leading for the Golden Shoe &middot; dollars raised</small> ${shoeLine}`;

  /* The other race is nothing like the shoe: the participation prizes
     are thresholds, so every class that reaches one wins it and there
     is no leader to name. Two counts say that without spelling it out,
     and keep a class sitting at 84% from reading the board as though
     it were losing to the room above it. */
  const at80 = ranked.filter((c) => c.shown >= 80).length;
  const at100 = ranked.filter((c) => c.shown >= 100).length;
  const classes = (n) => `${n} class${n === 1 ? '' : 'es'}`;
  const partLine = !at80
    ? html`Every class can earn funds for classroom supplies and needs. Reach 80% participation to earn $150 and 100% participation to earn $250. Every class that gets there wins, however many do.`
    : html`<strong>${classes(at80)}</strong> at 80% or more &middot; ${at100
      ? html`<strong>${at100}</strong> at 100%`
      : html`<strong>none</strong> at 100% yet`}<span class="every">Every class that gets there wins: $150 at 80%, $250 at 100%, however many classes make it.</span>`;
  const partNote = html`<small class="label">Classroom participation</small> ${partLine}`;

  /* The two student prizes, in the same pair of shapes as the two
     classroom ones above: Principal for the Day has a single winner
     like the Golden Shoe, and the lunch is a threshold like the
     participation prizes, so it gets a count of Rockets who have
     already won rather than a leader. The parallel is the point — a
     board that shows only leaders teaches families that the Rally is
     a contest they are losing.

     Both figures come off `boardStats`, which has already built the
     tally, so the board costs no extra read and cannot print a
     different leader than the prizes page. Neither carries a name:
     the dollars are rounded down to the hundred in `store.js`, so
     "more than" is literally true and matching the figure to the
     dollar does not take the lead. */
  const prizes = (live && live.prizes) || {};
  const lead = prizes.lead || 0;
  const lunch = prizes.lunch || 0;
  const leadNote = html`<small class="label">Principal for the Day &middot; most raised</small> ${lead
    ? html`<strong>More than ${money(lead)}</strong> in first place`
    : html`Still anyone&rsquo;s. It goes to the Rocket who raises the most.`}`;
  const lunchNote = html`<small class="label">Lunch with Ms. Malpass and Mr. Strong &middot; ${LUNCH.gifts} gifts</small> ${lunch
    ? html`<strong>${lunch} Rocket${lunch === 1 ? '' : 's'}</strong> ${lunch === 1 ? 'has' : 'have'} earned a seat`
    : html`Still open.`}<span class="every">${LUNCH.gifts} gifts of any size earns a seat, however many Rockets get there.</span>`;

  /* Named gifts newest first; anonymous gifts are tallied in one
     closing line so a busy campaign stays readable. */
  let roll;
  if (!donors.length) {
    roll = html`
        <li class="empty-roll">The honor roll is waiting for its first name &mdash;
          <a href="/donate">be the first family on the board</a>.</li>`;
  } else {
    const named = donors.filter((d) => !d.anon);
    const anonCount = donors.length - named.length;
    const items = named.map((d) => {
      const p = priorityById(d.priority);
      const tier = partnerTierById(d.partner);
      const what = [tier ? tier.name : (p ? p.name : '')];
      if (d.circle && p && p.circle) what.push(p.circle.label);
      return html`
        <li>
          <span class="who">${d.name}</span>
          <small class="what">${what.filter(Boolean).join(' · ')}</small>
        </li>`;
    });
    if (anonCount > 0) {
      items.push(html`
        <li class="anon-tally">
          <span class="who">&hellip; and ${anonCount} anonymous gift${anonCount === 1 ? '' : 's'}</span>
          <small class="what">every one moves a rocket</small>
        </li>`);
    }
    roll = html`${items}`;
  }

  return {
    'board-totals': html`${totals}`,
    /* The note under the figures explains what the Rally rewards. With
       the dollar goal met there is one race left to explain, so it
       stops splitting a family's attention two ways and points at the
       one thing still open, with the date it closes. */
    'totals-note': met
      ? html`We passed our ${money(CAMPAIGN.goal)} goal. The <a href="/why-we-rally">six</a> programs and priorities supported by the Red Hill PTA cost about <a href="/why-we-rally">${money(ANNUAL_COST)} each year</a>, so every gift helps fund them. Giving closes <strong>${CAMPAIGN.closeLabel}</strong>.`
      : html`We&rsquo;re rewarding two things: total dollars raised and participation. The ask is $100 a Rocket, but for participation any gift counts the same, whether it&rsquo;s $1 or $100. This is a school-wide effort.`,
    race: html`${race}`,
    /* Two races, and only one of them has a loser. Saying so under the
       list is the difference between a class at 84% reading the board
       as "we won $150" and reading it as "we're fifth". */
    'race-rank': html`<strong>Ordered by participation</strong>, the share of each class with at least one gift, with ties broken by dollars raised. The order is only how the list is sorted. A class lower down loses nothing: every class that reaches a participation prize wins it, however many get there. Only the Golden Shoe has a single winner.`,
    'shoe-note': goldenShoe,
    'prize-note': partNote,
    'lead-note': leadNote,
    'lunch-note': lunchNote,
    'honor-roll': roll,
    'board-partners': partnerWall(partners, html`
      <p class="board-lede">Your business could be up here &mdash; the Rally runs September&ndash;October.</p>`),
  };
};

/* Business Partners: the ladder and the wall. */
export const partnersSlots = (live) => ({
  'tier-grid': html`${PARTNER_TIERS.map((t) => html`
    <div class="tier-card" data-tier="${t.id}">
      <div class="tier-head">
        <h3>${t.name}</h3>
        <p class="tier-amount">${money(t.amount)}</p>
      </div>
      <ul>${t.benefits.map((b) => html`<li>${b}</li>`)}</ul>
      <button type="button" class="btn small tier-pick" data-tier="${t.id}">Become a ${t.name}</button>
    </div>`)}`,
  'partner-wall': partnerWall(mergedPartners(live && live.partners), html`
    <p class="hint">Your business could be first &mdash; the Rally launches in September.</p>`),
});

/* Prizes: what first place has raised, under the grand prize.

   A statement of fact rather than a challenge ("first place has
   raised…", not "it takes…"): the reader works out what they'd need,
   and the page isn't daring anyone. `store.prizeLead` rounds down to
   the nearest $100, so "more than" is the literal truth and the real
   leader is always a little further off than the page admits.

   Below $100 the slot returns null and the line leaves the page
   altogether — the same removal the shirt form uses. "First place has
   raised more than $0" is not a fact worth publishing, and early in a
   campaign it reads as a school nobody is giving to. The zero state
   (a failed D1 read) lands here too, so a page that couldn't count
   says nothing rather than something wrong. */
export const prizesSlots = (live) => {
  const lead = (live && live.lead) || 0;
  const lunch = (live && live.lunch) || 0;
  return {
    'prize-lead': lead < 100 ? null : html`
      <strong>Our current first place student has raised more than ${money(lead)} so far.</strong>
      <small>Updated as gifts come in.</small>`,
    /* The lunch has no cap, so this is a count of Rockets who have
       already won it, not a bar to clear. It is the evidence that ten
       gifts is a thing children here actually do — worth more than any
       amount of saying so. None yet and the line goes, rather than
       announcing that nobody has managed it. */
    'lunch-count': lunch ? html`<strong>${lunch} Rocket${lunch === 1 ? ' has' : 's have'} earned a seat so far.</strong>` : null,
  };
};

/* Student Link: the first (empty) row, so the form paints complete. */
export const linkSlots = () => ({
  'sibling-rows': studentRowsMarkup([{ c: '', n: '' }], LINK_ROWS),
});

/* Shirt page: the first (empty) Rocket row with its size picker, and
   the price line — both figures come from data.js, never the HTML.

   Past the deadline the form goes rather than greys out, and the page
   says what happened and points at the thing a family can still do.
   `null` removes the element, so whichever of the two is wrong for the
   moment never reaches the browser at all. */
export const shirtSlots = () => (shirtsOpen() ? {
  'shirt-assurance': html`Order by <strong>${SHIRT.deadlineLabel}</strong> &mdash; shirts come to your Rocket at school before Rally day`,
  'shirt-lede': html`Rally shirts are <strong>${money(SHIRT.price)}</strong>, and <strong>${money(SHIRT.credit)}</strong> of every one counts toward your Rocket and their classroom, the same as a gift. The rest buys the shirt.`,
  'shirt-rows': studentRowsMarkup([{ c: '', n: '', s: [] }], SHIRT_ROWS),
  'shirt-closed': null,
} : {
  'shirt-assurance': html`Ordering closed ${SHIRT.deadlineLabel}`,
  'shirt-form': null,
  'shirt-closed': html`Shirt ordering closed <strong>${SHIRT.deadlineLabel}</strong>, so the order could reach the printer in time for Rally day. Shirts are on their way to the Rockets who ordered one.`,
  'shirt-also': html`You can still give: <a href="/donate">make a donation</a> &mdash; every gift counts for your Rocket and their class.`,
});
