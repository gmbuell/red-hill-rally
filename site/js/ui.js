/* Shared UI helpers. The top half is the render core both the pages
   (as the RH global) and the worker (through the CommonJS export) use:
   the html tag that escapes by default, money and name formatting,
   the student-row markup, and the dart motif. The bottom half is
   browser-only form plumbing; the worker never calls it. */

/* data.js: globals in the browser (it loads first), a module in the
   worker bundle. */
const DATA = typeof module !== 'undefined'
  ? require('./data.js')
  : { CLASSROOMS, classroomById, MAX_NAME, MAX_STUDENTS };

const RH = (() => {

  /* ---- markup, escaped by default ------------------------------------
     Only the html tag and raw() produce an Html, so any plain string
     that reaches a template is text and gets escaped — donor, partner,
     and student names never need escaping by hand. Assigning an Html
     to innerHTML stringifies it. */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  class Html {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  const part = (v) => {
    if (v instanceof Html) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    if (v == null || v === false) return '';
    return esc(v);
  };
  const html = (strings, ...values) => {
    let out = strings[0];
    for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
    return new Html(out);
  };
  const raw = (s) => new Html(String(s));

  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

  const moneyCents = (cents) => '$' + (cents / 100)
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* "Mia", "Mia & Leo", "Mia, Leo & Sam". */
  const nameList = (names) => names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;

  /* "Mrs. Hesseltine · TK" for each distinct classroom in a student list. */
  const roomLabels = (students) => [...new Set(students.map((st) => {
    const room = DATA.classroomById(st.c);
    return room ? `${room.teacher} · ${room.grade}` : 'Red Hill Elementary';
  }))];

  const classroomOptions = () => DATA.CLASSROOMS.map((c) =>
    html`<option value="${c.id}">${c.teacher} (${c.grade})</option>`);

  /* The name hint alternates by row, never at random, so a re-render
     repeats the same markup. */
  const samplePlaceholder = (i) => `e.g. ${['Teddy', 'Finn'][i % 2]} Buell`;

  const classId = (prefix, i) => `${prefix}-class-${i}`;
  const nameId = (prefix, i) => `${prefix}-name-${i}`;

  /* Markup for a list of Rocket rows — classroom + name — shared by the
     donate wizard (classroom first, name optional) and the Student Link
     page (name first, required); the worker renders the link page's
     first row with it. */
  const studentRowsMarkup = (students, { prefix, nameFirst = false, classError, nameError = '' }) => {
    const classField = (i) => html`
        <div class="field">
          <label for="${classId(prefix, i)}">Classroom</label>
          <select id="${classId(prefix, i)}" data-field="c">
            <option value="">Choose a classroom&hellip;</option>
            ${classroomOptions()}
          </select>
          <p class="error">${classError}</p>
        </div>`;
    const nameField = (i) => html`
        <div class="field">
          <label for="${nameId(prefix, i)}">Student name${nameError ? '' : html` <span class="optional">&middot; optional</span>`}</label>
          <input type="text" id="${nameId(prefix, i)}" data-field="n" autocomplete="off" maxlength="${DATA.MAX_NAME}" placeholder="${samplePlaceholder(i)}">
          ${nameError ? html`<p class="error">${nameError}</p>` : ''}
        </div>`;
    return html`${students.map((st, i) => html`
      <div class="student-row" data-row="${i}">
        ${nameFirst ? [nameField(i), classField(i)] : [classField(i), nameField(i)]}
        ${students.length > 1 ? html`<button type="button" class="linklike remove-student">Remove</button>` : ''}
      </div>`)}`;
  };

  /* The Student Link page's rows: name first, and required — the link
     is printed with the names on it. */
  const LINK_ROWS = {
    prefix: 'sibling',
    nameFirst: true,
    nameError: 'Please enter your student’s name.',
    classError: 'Please choose your student’s classroom.',
  };

  /* ---- browser-only plumbing ------------------------------------------ */

  const qs = (sel) => document.querySelector(sel);

  const param = (name) => new URLSearchParams(location.search).get(name);

  /* POST JSON, parse JSON back; {ok, data} — network errors still throw. */
  const postJson = async (path, body) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };

  /* A list of Rocket rows — classroom + name — shared by the donate
     wizard (classroom first, name optional) and the Student Link page
     (name first, required). Owns the array, renders into rowsEl, wires
     edit/remove/add, and hides the add button at DATA.MAX_STUDENTS.
     `validate(check)` marks fields invalid per `check(st) -> {c, n}`
     and returns whether every row passed. */
  const studentRows = ({ rowsEl, addBtn, ...shape }) => {
    const { prefix, nameFirst = false } = shape;
    const students = [{ c: '', n: '' }];
    const render = () => {
      rowsEl.innerHTML = studentRowsMarkup(students, shape);
      students.forEach((st, i) => {
        qs(`#${classId(prefix, i)}`).value = st.c;
        qs(`#${nameId(prefix, i)}`).value = st.n;
      });
      addBtn.hidden = students.length >= DATA.MAX_STUDENTS;
    };
    const onEdit = (e) => {
      const row = e.target.closest('.student-row');
      const field = e.target.dataset.field;
      if (!row || !field) return;
      students[Number(row.dataset.row)][field] = e.target.value;
      e.target.closest('.field').classList.remove('invalid');
    };
    rowsEl.addEventListener('input', onEdit);
    rowsEl.addEventListener('change', onEdit);
    rowsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-student');
      if (!btn) return;
      students.splice(Number(btn.closest('.student-row').dataset.row), 1);
      render();
    });
    addBtn.addEventListener('click', () => {
      if (students.length >= DATA.MAX_STUDENTS) return;
      students.push({ c: '', n: '' });
      render();
      qs(`#${(nameFirst ? nameId : classId)(prefix, students.length - 1)}`).focus();
    });
    const validate = (check) => students.reduce((ok, st, i) => {
      const bad = check(st);
      qs(`#${classId(prefix, i)}`).closest('.field').classList.toggle('invalid', !!bad.c);
      qs(`#${nameId(prefix, i)}`).closest('.field').classList.toggle('invalid', !!bad.n);
      return ok && !bad.c && !bad.n;
    }, true);
    return { students, render, validate };
  };

  /* Hand a form off to Stripe: hold the button while the session is
     created, follow the payment URL, or restore the button, show the
     failure in errorEl, and return it for the page to act on. Browser
     Back from Stripe can restore a page from the bfcache exactly as it
     was left, so pageshow revives whichever button was mid-handoff. */
  let handoff = null;
  if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && handoff) {
        handoff.btn.disabled = false;
        handoff.btn.innerHTML = handoff.label;
      }
    });
  }
  const checkout = async (btn, errorEl, path, body) => {
    handoff = { btn, label: btn.innerHTML };
    btn.disabled = true;
    btn.innerHTML = 'Opening secure checkout…';
    errorEl.hidden = true;
    let result;
    try {
      result = await postJson(path, body);
      if (result.ok && result.data.url) {
        location.href = result.data.url;
        return result;
      }
      result.data.error = result.data.error || 'We couldn’t start checkout — please try again.';
    } catch (err) {
      result = { ok: false, data: { error: 'We couldn’t reach the Rally — check your connection and try again.' } };
    }
    errorEl.textContent = result.data.error;
    errorEl.hidden = false;
    btn.disabled = false;
    btn.innerHTML = handoff.label;
    handoff = null;
    return result;
  };

  /* ---- motifs (from the brand guide's Spirit Kit) -------------------- */

  const STAR = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';

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
  const dartUp = raw(`
    <path d="M27 31 C24.5 33.5 23.2 36.5 23 40 C25 38.2 26 37.6 27 37.2 Z" fill="#B92025"/>
    <path d="M37 31 C39.5 33.5 40.8 36.5 41 40 C39 38.2 38 37.6 37 37.2 Z" fill="#B92025"/>
    <path d="M32 8 C35.5 13 37 19 37 26 L37 36 L27 36 L27 26 C27 19 28.5 13 32 8 Z" fill="#0A2B4E"/>
    <circle cx="32" cy="20" r="3" fill="#FFFFFF"/>
    <g stroke-linecap="round">
      <path d="M32 40 L32 50" stroke="#B92025" stroke-width="2.5"/>
      <path d="M27.5 39 L27.5 45.5" stroke="#0A2B4E" stroke-width="2"/>
      <path d="M36.5 39 L36.5 45.5" stroke="#0A2B4E" stroke-width="2"/>
    </g>`);

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

  const trajectorySVG = (pct) => {
    const pt = trajPointAt(Math.max(0.02, Math.min(pct, 1)));
    return `
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
     The board's partner count is this list's length. */
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
      return { ...p, src: tier && !tier.logo ? '' : p.src };
    });
  };

  /* The partner wall — identical on /partners and the Rally Board:
     full-size logo cards (name, tier badge), or `emptyHtml` when
     nobody is listed yet, plus the thanks line for name-only tiers. */
  const partnerWall = (online, emptyHtml) => {
    const all = mergedPartners(online);
    const logos = all.filter((p) => p.src);
    const names = all.filter((p) => !p.src);
    const cards = logos.length ? `
    <ul class="partner-grid">${logos.map((p) => `
      <li class="partner-card">
        <img src="${p.src}" alt="${esc(p.name)} logo" loading="lazy">
        <span class="partner-name">${esc(p.name)}</span>
        ${p.tier ? `<span class="partner-tier">${partnerTierById(p.tier).name}</span>` : ''}
      </li>`).join('')}
    </ul>` : (names.length ? '' : emptyHtml);
    const thanks = names.length ? `
      <p class="partner-friends">With thanks to ${nameList(names.map((p) => esc(p.name)))}.</p>` : '';
    return cards + thanks;
  };

  return {
    html, raw, money, moneyCents, nameList, roomLabels,
    classroomOptions, studentRowsMarkup, LINK_ROWS, dartUp,
    qs, param, postJson, studentRows, checkout,
    // moved to worker/views.js, and esc retired, in the next step:
    esc, mergedPartners, partnerWall, icon, trailSVG, trajectorySVG,
  };
})();

/* Worker import — the browser loads this file as a plain script and
   never defines `module`. Only the render core is exported. */
if (typeof module !== 'undefined' && module.exports) {
  const { html, raw, money, moneyCents, nameList, roomLabels, classroomOptions, studentRowsMarkup, LINK_ROWS, dartUp } = RH;
  module.exports = { html, raw, money, moneyCents, nameList, roomLabels, classroomOptions, studentRowsMarkup, LINK_ROWS, dartUp };
}
