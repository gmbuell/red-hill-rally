/* Business Partners page: the partnership ladder (pick a tier, name
   your business, pay through Stripe) and the wall of current partners
   — all driven by data.js (PARTNER_TIERS / PARTNERS). The ladder and
   the curated wall (partnersView(null)) are baked into partners.html
   by scripts/skeleton.js, so the first paint is complete; online
   partners re-render the wall with same-sized cards when live data
   arrives. */

const partnersView = (online) => ({
  tiers: PARTNER_TIERS.map((t) => `
    <div class="tier-card" data-tier="${t.id}">
      <div class="tier-head">
        <h3>${t.name}</h3>
        <p class="tier-amount">${RH.money(t.amount)}</p>
      </div>
      <ul>${t.benefits.map((b) => `<li>${b}</li>`).join('')}</ul>
      <button type="button" class="btn small tier-pick" data-tier="${t.id}">Become a ${t.name}</button>
    </div>`).join(''),
  wall: RH.partnerWall(online,
    '<p class="hint">Your business could be first &mdash; the Rally launches in September.</p>'),
});

/* Browser wiring — absent when scripts/skeleton.js evaluates this file. */
if (typeof document !== 'undefined') (() => {
  let chosen = null;
  const form = RH.qs('#partner-form');
  const errorEl = RH.qs('#partner-error');

  const renderFeeLabel = () => {
    if (!chosen) return;
    const fee = feeCoverCents(chosen.amount * 100);
    RH.qs('#partner-fee-label').textContent =
      `Add ${RH.moneyCents(fee)} to cover card processing (${RH.moneyCents(chosen.amount * 100 + fee)} total) — 100% of our partnership reaches the school.`;
  };

  /* ---- the ladder (markup is baked; this is the pick handler) ---- */
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

  /* ---- the wall: the curated roster is baked; online partners merge
     in when live data arrives ---- */
  const wall = RH.qs('#partner-wall');
  RH.loadLive('/api/campaign', (live) => { wall.innerHTML = partnersView(live.partners).wall; });
})();
