/* Donate flow: a four-step wizard ending in Stripe Checkout.
   URL params:
     p     — preselect a priority (e.g. /donate?p=stem)
     link  — a parent-created student link: a short code the server
             verifies and decodes into one kid or the whole family
             (student names are never shown publicly; the prefill only
             travels to the PTA backend). */

(() => {
  const state = {
    step: 1,
    priority: RH.priorityById(RH.param('p')) || null,
    amount: 0,
    coverFees: true, // opt-out; the server recomputes the amount
    students: [{ c: '', n: '' }], // step 3 rows: classroom id + optional name
    link: null, // verified {code, students: [{c, n}]}
  };

  const form = RH.qs('#donate-form');
  const backBtn = RH.qs('#back-btn');
  const nextBtn = RH.qs('#next-btn');
  const errorEl = RH.qs('#checkout-error');

  const visibility = () => RH.qs('input[name="visibility"]:checked').value;

  /* ---- step 1: priority cards ---- */
  const renderPriorities = () => {
    RH.qs('#priority-options').innerHTML = PRIORITIES.map((p) => `
      <label class="option-card with-icon">
        <input type="radio" name="priority" value="${p.id}"
          ${state.priority && state.priority.id === p.id ? 'checked' : ''}>
        ${RH.icon(p.id, 'icon')}
        <span class="name">${p.name}</span>
        <p class="desc">${p.blurb}</p>
      </label>`).join('');
  };

  /* ---- step 2: amounts ---- */
  const feeCents = () => feeCoverCents(Math.round(state.amount) * 100);

  const renderFeeLabel = () => {
    RH.qs('#fee-label').textContent = state.amount > 0
      ? `Add ${RH.moneyCents(feeCents())} to cover card processing — 100% of my gift reaches the school.`
      : 'Add a little extra to cover card processing — 100% of my gift reaches the school.';
  };

  /* Designated-gift disclosure, named for the chosen priority. */
  const renderRedirectNote = () => {
    const program = state.priority ? state.priority.name : 'the program you selected';
    RH.qs('#redirect-note').innerHTML =
      `Your gift will be used to support <strong>${program}</strong>. If a program becomes fully funded, or if unforeseen circumstances prevent us from executing a program, Red Hill Elementary PTA reserves the right to redirect these funds to the area of greatest need that most closely aligns with your original intent.`;
  };

  const renderAmounts = () => {
    const tiers = state.priority ? state.priority.tiers : [];
    RH.qs('#amount-grid').innerHTML = tiers.map((t) => `
      <button type="button" class="amount-btn ${state.amount === t.amount ? 'selected' : ''}" data-amount="${t.amount}">
        <span class="amt">${RH.money(t.amount)}${t.plus ? '+' : ''}</span>
        <span class="impact">${t.impact}</span>
      </button>`).join('');
    renderFeeLabel();
    renderRedirectNote();
  };

  /* ---- step 3: the Rockets this gift credits ---- */
  const renderStudentRows = () => {
    RH.qs('#student-rows').innerHTML = state.students.map((st, i) => `
      <div class="student-row" data-row="${i}">
        <div class="field">
          <label for="classroom-${i}">Classroom</label>
          <select id="classroom-${i}" data-field="c">
            <option value="">Choose a classroom&hellip;</option>
            ${RH.classroomOptions()}
          </select>
          <p class="error">Please pick a classroom for this Rocket.</p>
        </div>
        <div class="field">
          <label for="student-${i}">Student name <span class="optional">&middot; optional</span></label>
          <input type="text" id="student-${i}" data-field="n" autocomplete="off" maxlength="${MAX_NAME}" placeholder="${RH.esc(RH.samplePlaceholder())}">
        </div>
        ${state.students.length > 1 ? '<button type="button" class="linklike remove-student">Remove</button>' : ''}
      </div>`).join('');
    state.students.forEach((st, i) => {
      RH.qs(`#classroom-${i}`).value = st.c;
      RH.qs(`#student-${i}`).value = st.n;
    });
    RH.qs('#add-student').hidden = state.students.length >= MAX_STUDENTS;
  };

  /* "Ms. Convery's class" / "Ms. Convery's & Mr. Zweber's classes". */
  const classLabel = (ids) => {
    const teachers = [...new Set(ids.map((id) => RH.classroomById(id)).filter(Boolean).map((r) => r.teacher))];
    if (!teachers.length) return '';
    return RH.nameList(teachers.map((t) => `${t}&rsquo;s`)) + (teachers.length > 1 ? ' classes' : ' class');
  };

  const renderDedication = () => {
    const holder = RH.qs('#link-chip-holder');
    const manual = RH.qs('#manual-dedication');
    holder.hidden = !state.link;
    manual.hidden = !!state.link;
    if (!state.link) {
      renderStudentRows();
      return;
    }
    const names = RH.nameList(state.link.students.map((st) => RH.esc(st.n)));
    const rooms = [...new Set(state.link.students.map((st) => {
      const room = RH.classroomById(st.c);
      return room ? `${room.teacher} &middot; ${room.grade}` : 'Red Hill Elementary';
    }))];
    holder.innerHTML = `
      <div class="link-chip">
        <svg class="icon" viewBox="20 4 24 50" aria-hidden="true">${RH.dartUp}</svg>
        <span class="who">Supporting ${names}</span>
        <span class="meta">${rooms.join(' &nbsp;&middot;&nbsp; ')}</span>
      </div>
      <p class="fine-print">Not who you meant to support? <button type="button" class="linklike" id="clear-link">Remove</button></p>`;
    RH.qs('#clear-link').addEventListener('click', () => {
      state.link = null;
      const banner = RH.qs('.link-banner');
      if (banner) banner.remove();
      renderDedication();
    });
  };

  /* ---- step 4: summary ---- */
  const renderSummary = () => {
    const p = state.priority;
    let s = `<strong>${RH.money(state.amount)}</strong> to <strong>${p ? p.name : ''}</strong>`;
    if (state.link) {
      const names = RH.nameList(state.link.students.map((st) => RH.esc(st.n)));
      const rooms = classLabel(state.link.students.map((st) => st.c));
      s += `. Supporting <strong>${names}</strong>${rooms ? ` (${rooms})` : ''}.`;
    } else {
      const rooms = classLabel(state.students.map((st) => st.c).filter(Boolean));
      s += rooms ? `. Credited to <strong>${rooms}</strong>.` : '.';
    }
    // Full price disclosure before Stripe: the fee cover and the total.
    if (state.coverFees) {
      const gift = Math.round(state.amount) * 100;
      s += ` You&rsquo;re adding <strong>${RH.moneyCents(feeCents())}</strong> to cover card processing &mdash; <strong>${RH.moneyCents(gift + feeCents())}</strong> total.`;
    }
    RH.qs('#summary-text').innerHTML = s;
  };

  /* ---- wizard chrome ---- */
  const showStep = () => {
    form.querySelectorAll('.flow-panel').forEach((el) => {
      el.hidden = Number(el.dataset.panel) !== state.step;
    });
    document.querySelectorAll('.stepper li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('current', n === state.step);
      li.classList.toggle('done', n < state.step);
    });
    backBtn.style.visibility = state.step === 1 ? 'hidden' : 'visible';
    nextBtn.innerHTML = state.step === 4
      ? 'Continue to payment <span class="arrow" aria-hidden="true">→</span>'
      : 'Next <span class="arrow" aria-hidden="true">→</span>';
    errorEl.hidden = true;
    if (state.step === 2) renderAmounts();
    if (state.step === 3) renderDedication();
    if (state.step === 4) renderSummary();
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const invalid = (fieldSel, bad) => {
    RH.qs(fieldSel).classList.toggle('invalid', bad);
    return bad;
  };

  const validate = () => {
    if (state.step === 1) {
      if (!state.priority) {
        RH.qs('#priority-options').scrollIntoView({ block: 'center' });
        return false;
      }
    }
    if (state.step === 2) {
      const custom = Number(RH.qs('#custom-amount').value);
      if (!state.amount && custom > 0) state.amount = custom;
      state.amount = Math.round(state.amount);
      const overMax = state.amount > MAX_AMOUNT;
      RH.qs('#custom-field .error').textContent = overMax
        ? `Online gifts max out at $${MAX_AMOUNT.toLocaleString('en-US')}.`
        : 'Please pick an amount or enter your own.';
      if (invalid('#custom-field', overMax || !(state.amount > 0))) return false;
    }
    if (state.step === 3 && !state.link) {
      // A name with no classroom can't be credited — say so, per row.
      let bad = false;
      state.students.forEach((st, i) => {
        const missing = !!st.n.trim() && !st.c;
        RH.qs(`#classroom-${i}`).closest('.field').classList.toggle('invalid', missing);
        bad = bad || missing;
      });
      if (bad) return false;
    }
    if (state.step === 4) {
      const name = RH.qs('#donor-name').value.trim();
      const needName = visibility() === 'public' && !name;
      invalid('#donor-name-field', needName);
      if (needName) return false;
    }
    return true;
  };

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  /* Hand the wizard state to the server, which creates the Stripe
     Checkout Session and sends back its payment URL. */
  const startCheckout = async () => {
    nextBtn.disabled = true;
    const label = nextBtn.innerHTML;
    nextBtn.innerHTML = 'Opening secure checkout…';
    errorEl.hidden = true;
    try {
      const { ok, data } = await RH.postJson('/api/checkout', {
        priority: state.priority.id,
        amount: state.amount,
        link: state.link ? state.link.code : '',
        students: state.students,
        visibility: visibility(),
        donorName: RH.qs('#donor-name').value.trim(),
        match: RH.qs('#match').checked,
        coverFees: state.coverFees,
      });
      if (ok && data.url) {
        location.href = data.url;
        return;
      }
      showError(data.error || 'We couldn’t start checkout — please try again.');
    } catch (err) {
      showError('We couldn’t reach the Rally — check your connection and try again.');
    }
    nextBtn.disabled = false;
    nextBtn.innerHTML = label;
  };

  nextBtn.addEventListener('click', () => {
    if (!validate()) return;
    if (state.step < 4) {
      state.step += 1;
      showStep();
    } else {
      startCheckout();
    }
  });

  backBtn.addEventListener('click', () => {
    if (state.step > 1) {
      state.step -= 1;
      showStep();
    }
  });

  /* ---- event wiring ---- */
  form.addEventListener('change', (e) => {
    if (e.target.name === 'priority') {
      state.priority = RH.priorityById(e.target.value);
      state.amount = 0;
      RH.qs('#custom-amount').value = '';
    }
    if (e.target.name === 'visibility') {
      RH.qs('#donor-name-field').hidden = e.target.value !== 'public';
    }
    if (e.target.id === 'cover-fees') {
      state.coverFees = e.target.checked;
    }
  });

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('.amount-btn');
    if (btn) {
      state.amount = Number(btn.dataset.amount);
      RH.qs('#custom-amount').value = '';
      RH.qs('#custom-field').classList.remove('invalid');
      form.querySelectorAll('.amount-btn').forEach((b) =>
        b.classList.toggle('selected', b === btn));
      renderFeeLabel();
    }
  });

  RH.qs('#custom-amount').addEventListener('input', (e) => {
    state.amount = Number(e.target.value) || 0;
    RH.qs('#custom-field').classList.remove('invalid');
    form.querySelectorAll('.amount-btn').forEach((b) => b.classList.remove('selected'));
    renderFeeLabel();
  });

  const rowsEl = RH.qs('#student-rows');
  const onRowEdit = (e) => {
    const row = e.target.closest('.student-row');
    const field = e.target.dataset.field;
    if (!row || !field) return;
    state.students[Number(row.dataset.row)][field] = e.target.value;
    e.target.closest('.field').classList.remove('invalid');
  };
  rowsEl.addEventListener('input', onRowEdit);
  rowsEl.addEventListener('change', onRowEdit);
  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-student');
    if (!btn) return;
    state.students.splice(Number(btn.closest('.student-row').dataset.row), 1);
    renderStudentRows();
  });
  RH.qs('#add-student').addEventListener('click', () => {
    if (state.students.length >= MAX_STUDENTS) return;
    state.students.push({ c: '', n: '' });
    renderStudentRows();
    RH.qs(`#classroom-${state.students.length - 1}`).focus();
  });

  form.addEventListener('submit', (e) => e.preventDefault());

  /* ---- boot ---- */
  RH.qs('#custom-amount').max = MAX_AMOUNT;
  renderPriorities();
  /* A ?p= arrival (home-page tile, or Stripe's cancel URL) has already
     chosen a priority — start on the amount step; Back still reaches
     the priority cards with that choice checked. */
  if (state.priority) state.step = 2;
  showStep();

  /* Resolve a student-link code before trusting it — in the background,
     so step 1 paints without waiting on the round trip. */
  const code = RH.param('link');
  if (code) {
    RH.postJson('/api/link/verify', { code }).then(({ ok, data }) => {
      if (!ok || !Array.isArray(data.students) || !data.students.length) return;
      state.link = { code, students: data.students };
      const names = RH.nameList(state.link.students.map((st) => RH.esc(st.n)));
      const rooms = classLabel(state.link.students.map((st) => st.c));
      RH.qs('.flow-header').insertAdjacentHTML('beforeend',
        `<p class="link-banner">Supporting <strong>${names}</strong>${rooms ? ` &middot; ${rooms}` : ''}</p>`);
      if (state.step === 3) renderDedication();
      if (state.step === 4) renderSummary(); // a slow verify can land after the donor advanced
    }).catch(() => { /* invalid or unreachable: continue without a link */ });
  }
})();
