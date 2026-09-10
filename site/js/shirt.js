/* Shirt-only checkout: one screen for the family that wants the shirt
   and nothing else. It posts to the same endpoint the donate wizard
   does with no gift on top, so a shirt bought here counts exactly like
   a shirt bought there — its credit spread across all six priorities,
   since nobody picked one. */

(() => {
  const { html } = RH;

  const form = RH.qs('#shirt-form');
  const buyBtn = RH.qs('#buy-btn');
  const errorEl = RH.qs('#checkout-error');
  const nameField = RH.qs('#donor-name-field');

  const rows = RH.studentRows({
    rowsEl: RH.qs('#shirt-rows'),
    addBtn: RH.qs('#add-rocket'),
    ...RH.SHIRT_ROWS,
  });

  const shirtCount = () => rows.students.reduce((n, st) => n + st.s.length, 0);
  const shirtCents = () => shirtCount() * SHIRT.price * 100;
  const coverFees = () => RH.qs('#cover-fees').checked;
  const feeCents = () => feeCoverCents(shirtCents());
  const anon = () => RH.qs('#anon').checked;

  const shirtsLabel = (n) => `${n} Rally shirt${n === 1 ? '' : 's'}`;

  /* Who the credit lands on, named the way the order names them:
     "Mia Rodriguez and Mrs. Hesseltine’s class". Sizes can be picked
     before the name is typed, so every part is optional. */
  const ordering = () => rows.students.filter((st) => st.s.length);
  const creditedTo = () => {
    const names = [...new Set(ordering().map((st) => st.n.trim()).filter(Boolean))];
    const teachers = [...new Set(ordering().map((st) => classroomById(st.c)).filter(Boolean).map((r) => r.teacher))];
    const rooms = teachers.length
      ? RH.nameList(teachers.map((t) => `${t}’s`)) + (teachers.length > 1 ? ' classes' : ' class')
      : '';
    if (names.length && rooms) return `${RH.nameList(names)} and ${rooms}`;
    return names.length ? RH.nameList(names) : rooms || 'your Rocket and their class';
  };

  const renderSummary = () => {
    const n = shirtCount();
    if (!n) {
      RH.qs('#summary-text').textContent = 'Pick a size above and your order shows up here.';
      return;
    }
    const fee = coverFees() ? feeCents() : 0;
    RH.qs('#summary-text').innerHTML = html`
      <strong>${shirtsLabel(n)}</strong> (${RH.moneyCents(shirtCents())}), <strong>${RH.money(n * SHIRT.credit)}</strong> of it counting for ${creditedTo()}.${
      fee ? html` You’re adding <strong>${RH.moneyCents(fee)}</strong> to cover processing fees.` : ''}
      <strong>${RH.moneyCents(shirtCents() + fee)}</strong> total.`;
  };

  /* Every shirt is handed out by name, so a row that ordered one needs
     both the Rocket and the classroom. */
  const validate = () => {
    if (!rows.validate((st) => ({
      c: !!st.s.length && !st.c,
      n: !!st.s.length && !st.n.trim(),
    }))) return false;
    if (!shirtCount()) {
      errorEl.textContent = `Please pick a size — that’s what you’re ordering.`;
      errorEl.hidden = false;
      RH.qs('#shirt-rows').scrollIntoView({ block: 'center' });
      return false;
    }
    const needName = !anon() && !RH.qs('#donor-name').value.trim();
    nameField.classList.toggle('invalid', needName);
    return !needName;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    if (!validate()) return;
    RH.checkout(buyBtn, errorEl, '/api/checkout', {
      priority: SUPPORT_ALL.id,
      amount: 0,
      // Backing out of Stripe belongs here, not in the donate wizard.
      back: 'shirt',
      students: rows.students,
      visibility: anon() ? 'anon' : 'public',
      donorName: RH.qs('#donor-name').value.trim(),
      coverFees: coverFees(),
    });
  });

  form.addEventListener('input', (e) => {
    if (e.target.id === 'donor-name') nameField.classList.remove('invalid');
    renderSummary();
  });
  form.addEventListener('change', (e) => {
    if (e.target.id === 'anon') nameField.hidden = anon();
    renderSummary();
  });

  RH.qs('#donor-name').maxLength = MAX_NAME;
  rows.render();
  renderSummary();
})();
