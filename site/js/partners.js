/* Business Partners page: pick a tier, name your business, pay through
   Stripe. The ladder and the wall are rendered by the worker; this is
   the pick handler and the checkout. */

(() => {
  let chosen = null;
  const form = RH.qs('#partner-form');
  const errorEl = RH.qs('#partner-error');

  const renderFeeLabel = () => {
    if (!chosen) return;
    const fee = feeCoverCents(chosen.amount * 100);
    RH.qs('#partner-fee-label').textContent =
      `Add ${RH.moneyCents(fee)} to cover processing fees (${RH.moneyCents(chosen.amount * 100 + fee)} total) — 100% of our partnership reaches the school.`;
  };

  /* ---- the ladder: the pick handler ---- */
  RH.qs('#tier-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.tier-pick');
    if (!btn) return;
    chosen = partnerTierById(btn.dataset.tier);
    document.querySelectorAll('.tier-card').forEach((card) =>
      card.classList.toggle('selected', card.dataset.tier === chosen.id));
    RH.qs('#chosen-tier').textContent = `${chosen.name} — ${RH.money(chosen.amount)}`;
    renderFeeLabel();
    form.hidden = false;
    errorEl.hidden = true;
    form.scrollIntoView({ block: 'center', behavior: 'smooth' });
    RH.qs('#biz-name').focus({ preventScroll: true });
  });

  /* ---- checkout ---- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chosen) return;
    const business = RH.qs('#biz-name').value.trim();
    RH.qs('#biz-field').classList.toggle('invalid', !business);
    if (!business) return;
    RH.checkout(form.querySelector('button[type="submit"]'), errorEl, '/api/partner/checkout', {
      tier: chosen.id,
      business,
      // Read live: browsers restore a reload's checkbox state without
      // firing 'change'. The server recomputes the amount.
      coverFees: RH.qs('#partner-cover-fees').checked,
    });
  });
  RH.qs('#biz-name').maxLength = MAX_NAME;
  RH.qs('#biz-name').addEventListener('input', () =>
    RH.qs('#biz-field').classList.remove('invalid'));
})();
