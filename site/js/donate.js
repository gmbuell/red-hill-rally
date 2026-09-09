/* Donate flow: a four-step wizard (priority, Rockets and shirts,
   amount, thanks) ending in Stripe Checkout.
   URL params:
     p     — preselect a priority (e.g. /donate?p=stem)
     link  — a parent-created student link: a short code the server
             verifies and decodes into one kid or the whole family
             (student names are never shown publicly; the prefill only
             travels to the PTA backend). */

(() => {
  const { html } = RH;
  const state = {
    step: 1,
    priority: priorityById(RH.param('p')),
    amount: 0,
    link: null, // verified {code, students: [{c, n}]}
    linkShirts: [], // sizes per linked Rocket, in link order
  };

  const form = RH.qs('#donate-form');
  const backBtn = RH.qs('#back-btn');
  const nextBtn = RH.qs('#next-btn');
  const errorEl = RH.qs('#checkout-error');

  /* Step 2's rows: classroom first, name optional, shirts under each. */
  const rows = RH.studentRows({
    rowsEl: RH.qs('#student-rows'),
    addBtn: RH.qs('#add-student'),
    prefix: 'rocket',
    shirts: true,
    classError: 'Please pick a classroom for this Rocket.',
  });

  /* Shirts in the order: the link's Rockets or the rows. */
  const shirtCount = () => (state.link ? state.linkShirts : rows.students.map((st) => st.s))
    .reduce((n, sizes) => n + (sizes ? sizes.length : 0), 0);
  const shirtCents = () => shirtCount() * SHIRT.price * 100;
  const giftCents = () => Math.round(state.amount) * 100;
  const shirtsLabel = () => `${shirtCount()} Rally shirt${shirtCount() === 1 ? '' : 's'}`;

  const visibility = () => RH.qs('input[name="visibility"]:checked').value;

  /* ---- step 1: priority cards — rendered by the worker; the wiring
     below only checks the chosen one ---- */

  /* ---- step 3: amounts ---- */
  const feeCents = () => feeCoverCents(giftCents() + shirtCents());

  const feeLabel = RH.qs('#fee-label');
  const feeLabelIdle = feeLabel.textContent; // the HTML's no-amount-yet copy
  const renderFeeLabel = () => {
    feeLabel.textContent = giftCents() + shirtCents() > 0
      ? `Add ${RH.moneyCents(feeCents())} to cover processing fees — 100% of my gift reaches the school.`
      : feeLabelIdle;
  };

  /* With shirts in the order, a gift on top is optional. */
  const renderShirtNote = () => {
    const note = RH.qs('#shirt-note');
    note.hidden = !shirtCount();
    note.innerHTML = html`<strong>${shirtsLabel()}</strong> in your order (${RH.moneyCents(shirtCents())}). A gift on top is optional &mdash; leave the amount blank to skip it.`;
  };

  /* Designated-gift disclosure, named for the chosen priority. */
  const renderRedirectNote = () => {
    const p = state.priority;
    const program = p ? (p.sentenceName || p.name) : 'the program you selected';
    RH.qs('#redirect-note').innerHTML =
      html`Your gift will be used to support <strong>${program}</strong>. If a program becomes fully funded, or if unforeseen circumstances prevent us from executing a program, Red Hill Elementary PTA reserves the right to redirect these funds to the area of greatest need that most closely aligns with your original intent.`;
  };

  const renderAmounts = () => {
    const tiers = state.priority ? state.priority.tiers : [];
    RH.qs('#amount-grid').innerHTML = html`${tiers.map((t) => html`
      <button type="button" class="amount-btn ${state.amount === t.amount ? 'selected' : ''}" data-amount="${t.amount}">
        <span class="amt">${RH.money(t.amount)}${t.plus ? '+' : ''}</span>
        <span class="impact">${t.impact}</span>
      </button>`)}`;
    renderFeeLabel();
    renderShirtNote();
    renderRedirectNote();
  };

  /* ---- step 2: the Rockets this gift credits, and their shirts ---- */

  /* "Ms. Convery’s class" / "Ms. Convery’s & Mr. Zweber’s classes". */
  const classLabel = (ids) => {
    const teachers = [...new Set(ids.map((id) => classroomById(id)).filter(Boolean).map((r) => r.teacher))];
    if (!teachers.length) return '';
    return RH.nameList(teachers.map((t) => `${t}’s`)) + (teachers.length > 1 ? ' classes' : ' class');
  };

  /* Link-mode fragments shared by the chip, the banner, and the summary. */
  const linkNames = () => RH.nameList(state.link.students.map((st) => st.n));
  const linkRooms = () => classLabel(state.link.students.map((st) => st.c));
  const dropLink = () => {
    state.link = null;
    state.linkShirts = [];
    const banner = RH.qs('.link-banner');
    if (banner) banner.remove();
  };

  const renderDedication = () => {
    const holder = RH.qs('#link-chip-holder');
    const manual = RH.qs('#manual-dedication');
    holder.hidden = !state.link;
    manual.hidden = !!state.link;
    if (!state.link) {
      rows.render();
      return;
    }
    holder.innerHTML = html`
      <div class="link-chip">
        <svg class="icon" viewBox="20 4 24 50" aria-hidden="true">${RH.dartUp}</svg>
        <span class="who">Supporting ${linkNames()}</span>
        <span class="meta">${RH.roomLabels(state.link.students).join(' \u00a0·\u00a0 ')}</span>
      </div>
      <small class="fine-print">Not who you meant to support? <button type="button" class="linklike" id="clear-link">Remove</button></small>
      ${state.link.students.map((st, i) => RH.shirtPickerMarkup('linked', i, state.linkShirts[i] || [], st.n))}`;
    holder.querySelectorAll('.shirts').forEach((el, i) => RH.setShirts(el, state.linkShirts[i] || []));
    RH.qs('#clear-link').addEventListener('click', () => {
      dropLink();
      renderDedication();
    });
  };
  RH.qs('#link-chip-holder').addEventListener('change', (e) => {
    const picker = e.target.closest('.shirts');
    if (!picker) return;
    state.linkShirts[Number(picker.dataset.row)] = RH.shirtsIn(picker);
    renderDedication();
  });

  /* ---- step 4: summary ---- */
  const renderSummary = () => {
    const p = state.priority;
    const name = p ? p.name : '';
    const parts = [state.amount > 0
      ? html`<strong>${RH.money(state.amount)}</strong> to <strong>${name}</strong>${shirtCount() ? html`, plus <strong>${shirtsLabel()}</strong> (${RH.moneyCents(shirtCents())})` : ''}`
      : html`<strong>${shirtsLabel()}</strong> (${RH.moneyCents(shirtCents())}), ${RH.money(shirtCount() * SHIRT.credit)} of it to <strong>${name}</strong>`];
    if (state.link) {
      const rooms = linkRooms();
      parts.push(html`. Supporting <strong>${linkNames()}</strong>${rooms ? ` (${rooms})` : ''}.`);
    } else {
      const rooms = classLabel(rows.students.map((st) => st.c).filter(Boolean));
      parts.push(rooms ? html`. Credited to <strong>${rooms}</strong>.` : '.');
    }
    // Full price disclosure before Stripe: the fee cover and the total.
    const fee = coverFees() ? feeCents() : 0;
    if (fee) parts.push(html` You’re adding <strong>${RH.moneyCents(fee)}</strong> to cover processing fees.`);
    if (fee || shirtCount()) parts.push(html` <strong>${RH.moneyCents(giftCents() + shirtCents() + fee)}</strong> total.`);
    RH.qs('#summary-text').innerHTML = html`${parts}`;
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
    if (state.step === 2) renderDedication();
    if (state.step === 3) renderAmounts();
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
    if (state.step === 2 && !state.link) {
      // A name with no classroom can't be credited, and a shirt needs
      // the Rocket's name — say so, per row.
      if (!rows.validate((st) => ({
        c: !!(st.n.trim() || st.s.length) && !st.c,
        n: !!st.s.length && !st.n.trim(),
      }))) return false;
    }
    if (state.step === 3) {
      const custom = Number(RH.qs('#custom-amount').value);
      if (!state.amount && custom > 0) state.amount = custom;
      state.amount = Math.round(state.amount);
      // Show the whole-dollar figure that will actually be charged.
      if (custom > 0 && state.amount > 0) RH.qs('#custom-amount').value = state.amount;
      const overMax = state.amount > MAX_AMOUNT;
      RH.qs('#custom-field .error').textContent = overMax
        ? `Online gifts max out at ${RH.money(MAX_AMOUNT)}.`
        : 'Please pick an amount or enter your own.';
      // Shirts alone are a complete order.
      if (invalid('#custom-field', overMax || !(state.amount > 0 || shirtCount()))) return false;
    }
    if (state.step === 4) {
      const name = RH.qs('#donor-name').value.trim();
      const needName = visibility() === 'public' && !name;
      invalid('#donor-name-field', needName);
      if (needName) return false;
    }
    return true;
  };

  /* The fee-cover box is read live, never cached: browsers restore a
     reload's checkbox state without firing 'change'. */
  const coverFees = () => RH.qs('#cover-fees').checked;

  /* Hand the wizard state to the server, which creates the Stripe
     Checkout Session and sends back its payment URL. */
  const startCheckout = async () => {
    const { ok, data } = await RH.checkout(nextBtn, errorEl, '/api/checkout', {
      priority: state.priority.id,
      amount: state.amount,
      link: state.link ? state.link.code : '',
      shirts: state.linkShirts,
      students: rows.students,
      visibility: visibility(),
      donorName: RH.qs('#donor-name').value.trim(),
      match: RH.qs('#match').checked,
      coverFees: coverFees(),
    });
    if (!ok && data.reason === 'link' && state.link) {
      // The link died mid-session: drop it so Back shows the rows.
      dropLink();
      renderSummary();
    }
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
      state.priority = priorityById(e.target.value);
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
      renderFeeLabel();
    }
  });

  RH.qs('#custom-amount').addEventListener('input', (e) => {
    state.amount = Number(e.target.value) || 0;
    RH.qs('#custom-field').classList.remove('invalid');
    form.querySelectorAll('.amount-btn').forEach((b) => b.classList.remove('selected'));
    renderFeeLabel();
  });

  form.addEventListener('submit', (e) => e.preventDefault());

  /* ---- boot ---- */
  RH.qs('#custom-amount').max = MAX_AMOUNT;
  RH.qs('#donor-name').maxLength = MAX_NAME;
  /* A ?p= arrival (home-page tile, or Stripe's cancel URL) has already
     chosen a priority — check its card and start on the Rocket step;
     Back still reaches the cards with that choice checked. */
  if (state.priority) {
    RH.qs(`input[name="priority"][value="${state.priority.id}"]`).checked = true;
    state.step = 2;
  }
  showStep();

  /* Resolve a student-link code before trusting it — in the background,
     so step 1 paints without waiting on the round trip. */
  const code = RH.param('link');
  if (code) {
    // A dead or unreachable link must say so — the donor arrived
    // expecting a student to be credited.
    const linkFailed = () => RH.qs('.flow-header').insertAdjacentHTML('beforeend',
      html`<p class="link-banner warn">That student link didn’t work &mdash; you can still choose a classroom on step 3.</p>`);
    RH.postJson('/api/link/verify', { code }).then(({ ok, data }) => {
      if (!ok || !Array.isArray(data.students) || !data.students.length) { linkFailed(); return; }
      state.link = { code, students: data.students };
      const rooms = linkRooms();
      RH.qs('.flow-header').insertAdjacentHTML('beforeend',
        html`<p class="link-banner">Supporting <strong>${linkNames()}</strong>${rooms ? html` &middot; ${rooms}` : ''}</p>`);
      if (state.step === 2) renderDedication();
      if (state.step === 4) renderSummary(); // a slow verify can land after the donor advanced
    }).catch(linkFailed);
  }
})();
