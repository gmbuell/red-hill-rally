/* Page views: the brand motifs the worker draws (priority icons, the
   flight trail, the hero meter), the partner wall, the shared header
   and footer, and one slot builder per page — pure functions from the
   stats payload (null for the zero state) to {elementId: Html}.
   worker/pages.js streams them into the page HTML. */

import data from '../site/js/data.js';
import ui from '../site/js/ui.js';

const { ORG, PRIORITIES, CAMPAIGN, CLASSROOMS, PARTNER_TIERS, PARTNERS, priorityById, partnerTierById, gradeName } = data;
const { html, raw, money, nameList, studentRowsMarkup, LINK_ROWS, dartUp } = ui;

/* ---- motifs (from the brand guide's Spirit Kit) -------------------- */

const STAR = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';

// Red rocket pointing straight up (rotate it yourself), gold plume
const redRocketUp = raw(`
  <path d="M23.5 30 C18 32.5 15 37.5 14 44 C17.5 41.5 20.5 40.5 23.5 40.5 Z" fill="#0A2B4E"/>
  <path d="M40.5 30 C46 32.5 49 37.5 50 44 C46.5 41.5 43.5 40.5 40.5 40.5 Z" fill="#0A2B4E"/>
  <path d="M32 45 C36 49 37 53.5 32 60 C27 53.5 28 49 32 45 Z" fill="#F5B70F"/>
  <path d="M32 47.5 C34.2 50.2 34.5 52.5 32 56.5 C29.5 52.5 29.8 50.2 32 47.5 Z" fill="#B92025"/>
  <path d="M32 5 C37.5 10.5 40.5 17.5 40.5 26 L40.5 39 Q40.5 42 37.5 42 L26.5 42 Q23.5 42 23.5 39 L23.5 26 C23.5 17.5 26.5 10.5 32 5 Z" fill="#B92025"/>
  <path d="M26.5 42 L37.5 42 L36.3 45.5 L27.7 45.5 Z" fill="#0A2B4E"/>
  <circle cx="32" cy="22" r="5.6" fill="#0A2B4E"/>
  <circle cx="32" cy="22" r="3.6" fill="#FFFFFF"/>`);

/* ---- program icons -------------------------------------------------- */

const ICONS = {
  people: raw(`<path d="M32 50C18 39 10 30 10 20a12 12 0 0 1 22-6.5A12 12 0 0 1 54 20c0 10-8 19-22 30z" fill="#B92025"/>`),
  stem: raw(`<path d="M25 6h14v4h-2.5v12l11 20a6.5 6.5 0 0 1-5.7 9.7H22.2a6.5 6.5 0 0 1-5.7-9.7l11-20V10H25Z" fill="#0A2B4E"/>
    <circle cx="32" cy="40" r="3.4" fill="#F5B70F"/>
    <circle cx="25.5" cy="45" r="2.2" fill="#FFFFFF"/>
    <circle cx="38" cy="46" r="1.8" fill="#FFFFFF"/>`),
  sports: raw(`<g transform="translate(-46 -24) scale(1.62)">
    <path d="M37 36.8 L37 28.5 C37 26.7 38.4 25.6 40.2 26 L44 26.9 C45.6 27.3 46.7 28.2 48 29.6 C50.5 32.3 54 34.2 58.3 35.2 C60.4 35.7 61.5 36.1 61.5 36.8 Z" fill="#0A2B4E"/>
    <path d="M37 28.5 C37 26.7 38.4 25.6 40.2 26 L44 26.9 L43.4 29.4 C41 28.4 38.9 28.2 37 28.5 Z" fill="#B92025"/>
    <rect x="36" y="36.6" width="26" height="2.2" rx="1.1" fill="#FFFFFF"/>
    <rect x="36" y="38.8" width="26" height="3.4" rx="1.7" fill="#B92025"/>
    <g stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round">
      <path d="M46 31 L49.8 29.7"/><path d="M48.3 33.4 L52.1 32.1"/>
    </g></g>`),
  garden: raw(`<g transform="translate(-3 -8) scale(1.15)">
    <g fill="#7FB069"><circle cx="14" cy="46" r="8"/><circle cx="24" cy="43" r="9.5"/><circle cx="33" cy="47" r="7"/></g>
    <g stroke="#7FB069" stroke-width="2.5" stroke-linecap="round"><path d="M46 52V37"/><path d="M56 52V42"/></g>
    <circle cx="46" cy="32" r="5" fill="#B92025"/><circle cx="56" cy="38" r="4.2" fill="#F5B70F"/>
    <circle cx="46" cy="32" r="1.8" fill="#FFFFFF"/><circle cx="56" cy="38" r="1.5" fill="#FFFFFF"/></g>`),
  arts: raw(`<g transform="translate(-59 -17) scale(1.05)">
    <path d="M76 21.5 C68.3 21.5 62.5 27 62.5 33.7 C62.5 40.4 68.3 45.5 75.6 45.5 C78.4 45.5 79.6 43.8 78.8 41.9 C78 39.9 79.2 38 81.6 38 L85.3 38 C87.6 38 89.5 36.2 89.5 33.9 C89.5 27 83.7 21.5 76 21.5 Z" fill="#0A2B4E"/>
    <circle cx="70.5" cy="28.5" r="2.1" fill="#F5B70F"/>
    <circle cx="76.5" cy="26.8" r="2.1" fill="#B92025"/>
    <circle cx="82.5" cy="28.8" r="2.1" fill="#E9F1F9"/>
    <circle cx="71.5" cy="38.5" r="2.4" fill="#F7FAFD"/></g>`),
  safety: raw(`<rect x="15" y="24" width="34" height="26" fill="#FFFFFF"/>
    <path d="M11 26 L32 9 L53 26 Z" fill="#0A2B4E"/>
    <circle cx="32" cy="20" r="2.6" fill="#F5B70F"/>
    <path d="M32 9V2" stroke="#0A2B4E" stroke-width="1.6"/>
    <path d="M32 2l8 2.2-8 2.2Z" fill="#B92025"/>
    <path d="M28 50V39q4-4 8 0v11z" fill="#B92025"/>
    <g fill="#0A2B4E"><rect x="18.5" y="30" width="7" height="7" rx="1"/><rect x="38.5" y="30" width="7" height="7" rx="1"/></g>
    <g stroke="#FFFFFF" stroke-width="1"><path d="M22 30.5v6.5"/><path d="M18.5 33.5h7"/><path d="M42 30.5v6.5"/><path d="M38.5 33.5h7"/></g>`),
};

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
      stroke="#5A6474" stroke-opacity="0.5" stroke-width="3.25"
      stroke-linecap="round" stroke-dasharray="0 9"/>
    <line x1="${x0}" y1="${cy}" x2="${xp.toFixed(1)}" y2="${cy}"
      stroke="#0A2B4E" stroke-width="3.25"
      stroke-linecap="round" stroke-dasharray="0 9"/>
    <g transform="translate(${(x1 + 12 - 6.6).toFixed(1)},${cy - 6.6}) scale(0.55)">
      <path d="${STAR}" fill="#F5B70F" stroke="#0A2B4E" stroke-width="1.8"/>
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

const trajectorySVG = (pct) => {
  const pt = trajPointAt(Math.max(0.02, Math.min(pct, 1)));
  return html`
  <svg viewBox="0 0 680 190" aria-hidden="true">
    <defs>
      <clipPath id="traj-clip"><rect x="0" y="0" width="${pt.x.toFixed(1)}" height="190"/></clipPath>
    </defs>
    <path class="t-rest" d="${TRAJ_D}" fill="none"
      stroke="#5A6474" stroke-opacity="0.5" stroke-width="4.5"
      stroke-linecap="round" stroke-dasharray="0 12"/>
    <path class="t-done" d="${TRAJ_D}" fill="none"
      stroke="#0A2B4E" stroke-width="4.5" stroke-linecap="round"
      stroke-dasharray="0 12" clip-path="url(#traj-clip)"/>
    <g class="t-star" transform="translate(640,20)">
      <g transform="translate(-13,-13) scale(1.1)">
        <path d="${STAR}" fill="#F5B70F" stroke="#0A2B4E" stroke-width="1.4"/>
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
    byKey.set(key(p.name), { name: p.name, tier: p.tier || '', src: p.logo ? `/img/partners/${p.logo}` : '' });
  }
  for (const p of (online || []).filter((o) => o && o.name)) {
    const cur = byKey.get(key(p.name)) || { name: p.name, tier: '', src: '' };
    if (rank(p.tier) > rank(cur.tier)) cur.tier = p.tier;
    if (p.logo) cur.src = `/logo/${p.logo}`;
    byKey.set(key(p.name), cur);
  }
  return [...byKey.values()].map((p) => {
    const tier = partnerTierById(p.tier);
    return { ...p, tierName: tier ? tier.name : '', src: tier && !tier.logo ? '' : p.src };
  });
};

/* The partner wall — identical on /partners and the Rally Board:
   full-size logo cards (name, tier badge), or `empty` when nobody is
   listed yet, plus the thanks line for name-only tiers. `all` is the
   mergedPartners list. */
const partnerWall = (all, empty) => {
  const logos = all.filter((p) => p.src);
  const names = all.filter((p) => !p.src);
  const cards = logos.length ? html`
    <ul class="partner-grid">${logos.map((p) => html`
      <li class="partner-card">
        <img src="${p.src}" alt="${p.name} logo" loading="lazy">
        <span class="partner-name">${p.name}</span>
        ${p.tierName ? html`<small class="partner-tier">${p.tierName}</small>` : ''}
      </li>`)}
    </ul>` : (names.length ? '' : empty);
  const thanks = names.length ? html`
      <p class="partner-friends">With thanks to ${nameList(names.map((p) => p.name))}.</p>` : '';
  return html`${cards}${thanks}`;
};

/* ---- the shared chrome ---------------------------------------------- */

const NAV = [
  ['/', 'Home'], ['/rally-board', 'Rally Board'],
  ['/student-link', 'Student Link'], ['/partners', 'Business Partners'],
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
    <a href="/rally-board">Rally Board</a>
    <a href="/student-link">Student Link</a>
    <a href="/partners">Business Partners</a>
  </nav>
  <p>${ORG.name} &middot; Home of the Rockets &middot; Tustin Unified School District</p>
  <p>Red Hill PTA is a 501(c)(3) nonprofit, EIN ${ORG.ein} &mdash; donations are tax-deductible. Many employers match gifts &mdash; <a href="/matching">here&rsquo;s how</a>.</p>`;

/* ---- pages ------------------------------------------------------------ */

/* Home: the campaign meter, its raised/goal figures, and the six
   priority cards. */
export const homeSlots = (live) => {
  const raised = live ? live.campaign.raised : 0;
  const per = (live && live.priorities) || {};
  return {
    trajectory: trajectorySVG(raised / CAMPAIGN.goal),
    'stat-raised': html`${money(raised)}`,
    'stat-goal': html`${money(CAMPAIGN.goal)}`,
    'priority-grid': html`${PRIORITIES.map((p) => {
      const pRaised = per[p.id] || 0;
      return html`
      <article class="priority-card">
        ${icon(p.id)}
        <h3>${p.name}</h3>
        <p class="blurb">${p.blurb}</p>
        <div class="trail-row">
          ${trailSVG(pRaised / p.goal)}
          <small class="raised-line"><strong>${money(pRaised)}</strong> raised of ${money(p.goal)}</small>
        </div>
        <a class="go" href="/donate?p=${p.id}">Give to this</a>
      </article>`;
    })}`,
  };
};

/* Donate, step 1: one radio card per priority. */
export const donateSlots = () => ({
  'priority-options': html`${PRIORITIES.map((p) => html`
      <label class="option-card with-icon">
        <input type="radio" name="priority" value="${p.id}">
        ${icon(p.id)}
        <span class="name">${p.name}</span>
        <small class="desc">${p.blurb}</small>
      </label>`)}`,
});

/* Rally Board: campaign totals, the classroom race (ranked by
   participation), the honor roll, and the partner strip. */
export const boardSlots = (live) => {
  const raised = live ? live.campaign.raised : 0;
  const gifts = live ? live.campaign.gifts : 0;
  const perClass = (live && live.classrooms) || {};
  const donors = (live && live.donors) || [];
  const partners = mergedPartners(live && live.partners);

  const totals = [
    [money(raised), 'raised of ' + money(CAMPAIGN.goal)],
    [gifts, 'family gifts so far'],
    [partners.length, 'business partners'],
    [CLASSROOMS.length, 'classrooms flying'],
  ].map(([num, label]) => html`
      <div class="total"><span class="num money">${num}</span><span class="label">${label}</span></div>`);

  const ranked = [...CLASSROOMS]
    .map((c) => {
      const classGifts = perClass[c.id] || 0;
      return { ...c, gifts: classGifts, pct: c.students > 0 ? Math.min(classGifts / c.students, 1) : 0 };
    })
    .sort((a, b) => b.pct - a.pct);
  const race = ranked.map((c, i) => html`
      <li class="${i < 3 && c.gifts > 0 ? 'leader' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="room">${c.teacher}<small class="grade">${gradeName(c.grade)}</small></span>
        <span class="trail">${trailSVG(c.pct)}</span>
        <span class="pct">${Math.round(c.pct * 100)}%<small class="families">${c.gifts} gift${c.gifts === 1 ? '' : 's'} &middot; class of ${c.students}</small></span>
      </li>`);

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
    race: html`${race}`,
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

/* Student Link: the first (empty) row, so the form paints complete. */
export const linkSlots = () => ({
  'sibling-rows': studentRowsMarkup([{ c: '', n: '' }], LINK_ROWS),
});
