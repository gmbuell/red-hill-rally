/* Shared UI helpers. The top half is the render core both the pages
   (as the RH global) and the worker (through the CommonJS export) use:
   the html tag that escapes by default, money and name formatting,
   the student-row markup, and the dart motif. The bottom half is
   browser-only form plumbing; the worker never calls it. */

/* data.js: globals in the browser (it loads first), a module in the
   worker bundle. */
const DATA = typeof module !== 'undefined' && module.exports
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

  return {
    html, raw, money, moneyCents, nameList, roomLabels,
    classroomOptions, studentRowsMarkup, LINK_ROWS, dartUp,
    qs, param, postJson, studentRows, checkout,
  };
})();

/* Worker import — the browser loads this file as a plain script and
   never defines `module`. Only the render core is exported. */
if (typeof module !== 'undefined' && module.exports) {
  const { html, raw, money, moneyCents, nameList, roomLabels, classroomOptions, studentRowsMarkup, LINK_ROWS, dartUp } = RH;
  module.exports = { html, raw, money, moneyCents, nameList, roomLabels, classroomOptions, studentRowsMarkup, LINK_ROWS, dartUp };
}
