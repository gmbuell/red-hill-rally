/* Business Partners page: the partnership ladder (pick a tier, name
   your business, pay through Stripe) and the wall of current partners
   — all driven by data.js (PARTNER_TIERS / PARTNERS). */

(() => {
  let chosen = null;
  const form = RH.qs('#partner-form');
  const errorEl = RH.qs('#partner-error');

  const renderFeeLabel = () => {
    if (!chosen) return;
    const fee = feeCoverCents(chosen.amount * 100);
    RH.qs('#partner-fee-label').textContent =
      `Add ${RH.moneyCents(fee)} to cover card processing (${RH.moneyCents(chosen.amount * 100 + fee)} total) — 100% of our partnership reaches the school.`;
  };

  /* ---- the ladder ---- */
  RH.qs('#tier-grid').innerHTML = PARTNER_TIERS.map((t) => `
    <div class="tier-card" data-tier="${t.id}">
      <div class="tier-head">
        <h3>${t.name}</h3>
        <p class="tier-amount">${RH.money(t.amount)}</p>
      </div>
      <ul>${t.benefits.map((b) => `<li>${b}</li>`).join('')}</ul>
      <button type="button" class="btn small tier-pick" data-tier="${t.id}">Become a ${t.name}</button>
    </div>`).join('');

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

  /* ---- the wall: curated roster immediately (no pop-in for the
     common case), online partners merged in when live data arrives ---- */
  const wall = RH.qs('#partner-wall');
  const renderWall = (online) => {
    wall.innerHTML = RH.partnerWall(online,
      '<p class="hint">Your business could be first &mdash; the Rally launches in September.</p>');
  };
  renderWall(null);
  RH.loadLive('/api/campaign', (live) => renderWall(live.partners));
})();
