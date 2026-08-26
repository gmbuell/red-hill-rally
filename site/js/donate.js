/* Donate flow: a four-step wizard ending in Stripe Checkout.
   URL params:
     p     — preselect a priority (e.g. /donate?p=stem)
     link  — a parent-created student link: a short code the server
             verifies and decodes (student names are never shown
             publicly; the prefill only travels to the PTA backend). */

(() => {
  const state = {
    step: 1,
    priority: RH.priorityById(RH.param('p')) || null,
    amount: 0,
    link: null, // verified {code, n: student name, c: classroom id}
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
  const renderAmounts = () => {
    const tiers = state.priority ? state.priority.tiers : [];
    RH.qs('#amount-grid').innerHTML = tiers.map((t) => `
      <button type="button" class="amount-btn ${state.amount === t.amount ? 'selected' : ''}" data-amount="${t.amount}">
        <span class="amt">${RH.money(t.amount)}</span>
        <span class="impact">${t.impact}</span>
      </button>`).join('');
  };

  /* ---- step 3: dedication ---- */
  const renderDedication = () => {
    const holder = RH.qs('#link-chip-holder');
    const manual = RH.qs('#manual-dedication');
    holder.hidden = !state.link;
    manual.hidden = !!state.link;
    if (!state.link) return;
    const room = RH.classroomById(state.link.c);
    holder.innerHTML = `
      <div class="link-chip">
        <svg class="icon" viewBox="20 4 24 50" aria-hidden="true">${RH.dartUp}</svg>
        <span class="who">Supporting ${RH.esc(state.link.n)}</span>
        <span class="meta">${room ? `${room.teacher} &middot; ${room.grade}` : 'Red Hill Elementary'}</span>
      </div>
      <p class="fine-print">Not who you meant to support? <button type="button" class="linklike" id="clear-link">Remove</button></p>`;
    RH.qs('#clear-link').addEventListener('click', () => {
      state.link = null;
      renderDedication();
    });
  };

  /* ---- step 4: summary ---- */
  const renderSummary = () => {
    const p = state.priority;
    let s = `<strong>${RH.money(state.amount)}</strong> to <strong>${p ? p.name : ''}</strong>`;
    const room = RH.classroomById(state.link ? state.link.c : RH.qs('#classroom').value);
    if (state.link) {
      s += `. Supporting <strong>${RH.esc(state.link.n)}</strong>`;
      if (room) s += ` (${room.teacher}&rsquo;s class)`;
      s += '.';
    } else if (room) {
      s += `. Credited to <strong>${room.teacher}&rsquo;s class</strong>.`;
    } else {
      s += '.';
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
    RH.qs('#stripe-note').hidden = state.step !== 4;
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
        classroom: RH.qs('#classroom').value,
        student: RH.qs('#student-name').value.trim(),
        visibility: visibility(),
        donorName: RH.qs('#donor-name').value.trim(),
        match: RH.qs('#match').checked,
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
  });

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('.amount-btn');
    if (btn) {
      state.amount = Number(btn.dataset.amount);
      RH.qs('#custom-amount').value = '';
      RH.qs('#custom-field').classList.remove('invalid');
      form.querySelectorAll('.amount-btn').forEach((b) =>
        b.classList.toggle('selected', b === btn));
    }
  });

  RH.qs('#custom-amount').addEventListener('input', (e) => {
    state.amount = Number(e.target.value) || 0;
    RH.qs('#custom-field').classList.remove('invalid');
    form.querySelectorAll('.amount-btn').forEach((b) => b.classList.remove('selected'));
  });

  form.addEventListener('submit', (e) => e.preventDefault());

  /* ---- boot ---- */
  RH.qs('#student-name').placeholder = RH.samplePlaceholder();
  RH.qs('#classroom').insertAdjacentHTML('beforeend', RH.classroomOptions());
  RH.qs('#custom-amount').max = MAX_AMOUNT;
  renderPriorities();
  showStep();

  /* Resolve a student-link code before trusting it — in the background,
     so step 1 paints without waiting on the round trip. */
  const code = RH.param('link');
  if (code) {
    RH.postJson('/api/link/verify', { code }).then(({ ok, data }) => {
      if (!ok) return;
      state.link = { code, ...data };
      const room = RH.classroomById(state.link.c);
      RH.qs('.flow-header').insertAdjacentHTML('beforeend',
        `<p class="link-banner">Supporting <strong>${RH.esc(state.link.n)}</strong>${room ? ` &middot; ${room.teacher}&rsquo;s class` : ''}</p>`);
      if (state.step === 3) renderDedication();
    }).catch(() => { /* invalid or unreachable: continue without a link */ });
  }
})();
