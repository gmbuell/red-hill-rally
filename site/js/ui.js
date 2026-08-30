/* Shared UI helpers: brand motifs and the flight-trail progress
   vocabulary. (Student links are signed tokens issued by /api/link —
   the site only carries them, never decodes them itself.) */

const RH = (() => {

  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

  const moneyCents = (cents) => '$' + (cents / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const qs = (sel) => document.querySelector(sel);

  const param = (name) => new URLSearchParams(location.search).get(name);

  /* ---- shared form/data plumbing ---- */

  const classroomOptions = () => CLASSROOMS.map((c) =>
    `<option value="${c.id}">${c.teacher} (${c.grade})</option>`).join('');

  const samplePlaceholder = () =>
    `e.g. ${Math.random() < 0.5 ? 'Teddy' : 'Finn'} Buell`;

  /* POST JSON, parse JSON back; {ok, data} — network errors still throw. */
  const postJson = async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };

  /* Fetch live stats (/api/campaign or /api/board); on any failure the
     caller's zeros stay up. */
  const loadLive = async (path, render) => {
    try {
      const res = await fetch(path);
      if (res.ok) render(await res.json());
    } catch (err) { /* keep the zeros */ }
  };

  /* Escape user-supplied text (donor names, student names) before it
     is interpolated into innerHTML. */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ---- motifs (from the brand guide's Spirit Kit) -------------------- */

  const STAR = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';

  // Badge rocket: the primary mark (navy silhouette, white porthole, red dashes)
  const badgeRocket = (cls) => `
  <svg class="${cls || ''}" viewBox="0 0 64 64" aria-hidden="true">
    <g transform="rotate(45 32 32)">
      <path d="M25 28 C20 32 17 37 16.5 43 L25 38 Z" fill="#0A2B4E"/>
      <path d="M39 28 C44 32 47 37 47.5 43 L39 38 Z" fill="#0A2B4E"/>
      <path d="M32 6 C36.5 11 39 18 39 26 L39 38 L25 38 L25 26 C25 18 27.5 11 32 6 Z" fill="#0A2B4E"/>
      <path d="M27.5 38 L36.5 38 L34.5 43 L29.5 43 Z" fill="#0A2B4E"/>
      <circle cx="32" cy="21" r="4.8" fill="#FFFFFF"/>
      <g stroke="#B92025" stroke-width="2.5" stroke-linecap="round">
        <path d="M28.5 46.5 L28.5 51.5"/><path d="M32 46.5 L32 55"/><path d="M35.5 46.5 L35.5 51.5"/>
      </g>
    </g>
  </svg>`;

  // Red rocket pointing straight up (rotate it yourself), gold plume
  const redRocketUp = `
    <path d="M23.5 30 C18 32.5 15 37.5 14 44 C17.5 41.5 20.5 40.5 23.5 40.5 Z" fill="#0A2B4E"/>
    <path d="M40.5 30 C46 32.5 49 37.5 50 44 C46.5 41.5 43.5 40.5 40.5 40.5 Z" fill="#0A2B4E"/>
    <path d="M32 45 C36 49 37 53.5 32 60 C27 53.5 28 49 32 45 Z" fill="#F5B70F"/>
    <path d="M32 47.5 C34.2 50.2 34.5 52.5 32 56.5 C29.5 52.5 29.8 50.2 32 47.5 Z" fill="#B92025"/>
    <path d="M32 5 C37.5 10.5 40.5 17.5 40.5 26 L40.5 39 Q40.5 42 37.5 42 L26.5 42 Q23.5 42 23.5 39 L23.5 26 C23.5 17.5 26.5 10.5 32 5 Z" fill="#B92025"/>
    <path d="M26.5 42 L37.5 42 L36.3 45.5 L27.7 45.5 Z" fill="#0A2B4E"/>
    <circle cx="32" cy="22" r="5.6" fill="#0A2B4E"/>
    <circle cx="32" cy="22" r="3.6" fill="#FFFFFF"/>`;

  // The dart, pointing straight up (accent rocket, legible small)
  const dartUp = `
    <path d="M27 31 C24.5 33.5 23.2 36.5 23 40 C25 38.2 26 37.6 27 37.2 Z" fill="#B92025"/>
    <path d="M37 31 C39.5 33.5 40.8 36.5 41 40 C39 38.2 38 37.6 37 37.2 Z" fill="#B92025"/>
    <path d="M32 8 C35.5 13 37 19 37 26 L37 36 L27 36 L27 26 C27 19 28.5 13 32 8 Z" fill="#0A2B4E"/>
    <circle cx="32" cy="20" r="3" fill="#FFFFFF"/>
    <g stroke-linecap="round">
      <path d="M32 40 L32 50" stroke="#B92025" stroke-width="2.5"/>
      <path d="M27.5 39 L27.5 45.5" stroke="#0A2B4E" stroke-width="2"/>
      <path d="M36.5 39 L36.5 45.5" stroke="#0A2B4E" stroke-width="2"/>
    </g>`;

  /* ---- program icons -------------------------------------------------- */

  const ICONS = {
    people: `<path d="M32 50C18 39 10 30 10 20a12 12 0 0 1 22-6.5A12 12 0 0 1 54 20c0 10-8 19-22 30z" fill="#B92025"/>`,
    stem: `<path d="M25 6h14v4h-2.5v12l11 20a6.5 6.5 0 0 1-5.7 9.7H22.2a6.5 6.5 0 0 1-5.7-9.7l11-20V10H25Z" fill="#0A2B4E"/>
      <circle cx="32" cy="40" r="3.4" fill="#F5B70F"/>
      <circle cx="25.5" cy="45" r="2.2" fill="#FFFFFF"/>
      <circle cx="38" cy="46" r="1.8" fill="#FFFFFF"/>`,
    sports: `<g transform="translate(-46 -24) scale(1.62)">
      <path d="M37 36.8 L37 28.5 C37 26.7 38.4 25.6 40.2 26 L44 26.9 C45.6 27.3 46.7 28.2 48 29.6 C50.5 32.3 54 34.2 58.3 35.2 C60.4 35.7 61.5 36.1 61.5 36.8 Z" fill="#0A2B4E"/>
      <path d="M37 28.5 C37 26.7 38.4 25.6 40.2 26 L44 26.9 L43.4 29.4 C41 28.4 38.9 28.2 37 28.5 Z" fill="#B92025"/>
      <rect x="36" y="36.6" width="26" height="2.2" rx="1.1" fill="#FFFFFF"/>
      <rect x="36" y="38.8" width="26" height="3.4" rx="1.7" fill="#B92025"/>
      <g stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round">
        <path d="M46 31 L49.8 29.7"/><path d="M48.3 33.4 L52.1 32.1"/>
      </g></g>`,
    garden: `<g transform="translate(-3 -8) scale(1.15)">
      <g fill="#7FB069"><circle cx="14" cy="46" r="8"/><circle cx="24" cy="43" r="9.5"/><circle cx="33" cy="47" r="7"/></g>
      <g stroke="#7FB069" stroke-width="2.5" stroke-linecap="round"><path d="M46 52V37"/><path d="M56 52V42"/></g>
      <circle cx="46" cy="32" r="5" fill="#B92025"/><circle cx="56" cy="38" r="4.2" fill="#F5B70F"/>
      <circle cx="46" cy="32" r="1.8" fill="#FFFFFF"/><circle cx="56" cy="38" r="1.5" fill="#FFFFFF"/></g>`,
    arts: `<g transform="translate(-59 -17) scale(1.05)">
      <path d="M76 21.5 C68.3 21.5 62.5 27 62.5 33.7 C62.5 40.4 68.3 45.5 75.6 45.5 C78.4 45.5 79.6 43.8 78.8 41.9 C78 39.9 79.2 38 81.6 38 L85.3 38 C87.6 38 89.5 36.2 89.5 33.9 C89.5 27 83.7 21.5 76 21.5 Z" fill="#0A2B4E"/>
      <circle cx="70.5" cy="28.5" r="2.1" fill="#F5B70F"/>
      <circle cx="76.5" cy="26.8" r="2.1" fill="#B92025"/>
      <circle cx="82.5" cy="28.8" r="2.1" fill="#E9F1F9"/>
      <circle cx="71.5" cy="38.5" r="2.4" fill="#F7FAFD"/></g>`,
    safety: `<rect x="15" y="24" width="34" height="26" fill="#FFFFFF"/>
      <path d="M11 26 L32 9 L53 26 Z" fill="#0A2B4E"/>
      <circle cx="32" cy="20" r="2.6" fill="#F5B70F"/>
      <path d="M32 9V2" stroke="#0A2B4E" stroke-width="1.6"/>
      <path d="M32 2l8 2.2-8 2.2Z" fill="#B92025"/>
      <path d="M28 50V39q4-4 8 0v11z" fill="#B92025"/>
      <g fill="#0A2B4E"><rect x="18.5" y="30" width="7" height="7" rx="1"/><rect x="38.5" y="30" width="7" height="7" rx="1"/></g>
      <g stroke="#FFFFFF" stroke-width="1"><path d="M22 30.5v6.5"/><path d="M18.5 33.5h7"/><path d="M42 30.5v6.5"/><path d="M38.5 33.5h7"/></g>`,
  };

  const icon = (id, cls) =>
    `<svg class="${cls || 'icon'}" viewBox="0 0 64 56" aria-hidden="true">${ICONS[id] || ''}</svg>`;

  /* ---- the flight trail ----------------------------------------------
     Straight mini trail: dotted path, dart at the current position, gold
     star at the goal. Decorative markup — the numbers live in adjacent
     text, so the graphic is aria-hidden. */
  const trailSVG = (pct) => {
    const W = 220, H = 32, x0 = 8, x1 = 196, cy = 16;
    const p = Math.max(0, Math.min(pct, 1));
    const xp = x0 + (x1 - x0) * p;
    return `
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

  const buildTrajectory = (container, pct) => {
    const pt = trajPointAt(Math.max(0.02, Math.min(pct, 1)));
    container.innerHTML = `
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

  /* Star scatter: 2–3 mixed stars clustered near a headline. */
  const scatter = `
    <svg class="sparkle" style="top:9%;left:calc(50% + 218px);" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="#B92025"/></svg>
    <svg class="sparkle" style="top:19%;left:calc(50% + 262px);" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="#0A2B4E"/></svg>
    <svg class="sparkle" style="top:7%;left:calc(50% - 252px);" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="#F5B70F"/></svg>`;

  /* "Mia", "Mia & Leo", "Mia, Leo & Sam". */
  const nameList = (names) => names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;

  /* The public partner list: the curated PARTNERS roster from data.js
     merged with online partnerships (the board payload's `partners`).
     A paid online row is the fresher record, so on a name match it
     wins the tier — keeping the curated logo until an upload replaces
     it. `src` is the logo URL, or '' for name-only recognition (the
     'friend' tier, or no logo at all). */
  const mergedPartners = (online) => {
    const key = (name) => name.trim().toLowerCase();
    const entry = (name, tier, src) => ({ name, tier: tier || '', src: tier === 'friend' ? '' : src });
    const live = (online || []).filter((p) => p && p.name);
    const liveKeys = new Set(live.map((p) => key(p.name)));
    const merged = PARTNERS
      .filter((p) => !liveKeys.has(key(p.name)))
      .map((p) => entry(p.name, p.tier, p.logo ? `/img/partners/${p.logo}` : ''));
    const seen = new Set(merged.map((p) => key(p.name)));
    for (const p of live) {
      if (seen.has(key(p.name))) continue;
      seen.add(key(p.name));
      const curated = PARTNERS.find((c) => key(c.name) === key(p.name));
      const src = p.logo ? `/logo/${p.logo}`
        : (curated && curated.logo ? `/img/partners/${curated.logo}` : '');
      merged.push(entry(p.name, p.tier, src));
    }
    return merged;
  };

  /* Display split shared by the /partners wall and the board strip:
     logo cards vs name-only recognition, plus the common thanks line. */
  const partnerGroups = (online) => {
    const all = mergedPartners(online);
    return { logos: all.filter((p) => p.src), names: all.filter((p) => !p.src) };
  };
  const partnerFriendsLine = (names) => (names.length ? `
      <p class="partner-friends">With thanks to ${nameList(names.map((p) => esc(p.name)))}.</p>` : '');

  /* priorityById / classroomById come from data.js, loaded before us. */
  return {
    money, moneyCents, qs, param, esc, nameList,
    mergedPartners, partnerGroups, partnerFriendsLine,
    classroomOptions, samplePlaceholder, postJson, loadLive,
    badgeRocket, dartUp, icon,
    trailSVG, buildTrajectory, scatter,
    priorityById, classroomById,
  };
})();
