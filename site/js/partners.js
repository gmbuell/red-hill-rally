/* Business Partners page: the partnership ladder (pick a tier, name
   your business, pay through Stripe) and the wall of current partners
   — all driven by data.js (PARTNER_TIERS / PARTNERS). */

(() => {
  let chosen = null;
  let coverFees = true; // opt-out; the server recomputes the amount
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
    chosen = PARTNER_TIERS.find((t) => t.id === btn.dataset.tier);
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
    const btn = form.querySelector('button[type="submit"]');
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Opening secure checkout…';
    errorEl.hidden = true;
    try {
      const { ok, data } = await RH.postJson('/api/partner/checkout', { tier: chosen.id, business, coverFees });
      if (ok && data.url) {
        location.href = data.url;
        return;
      }
      errorEl.textContent = data.error || 'We couldn’t start checkout — please try again.';
    } catch (err) {
      errorEl.textContent = 'We couldn’t reach the Rally — check your connection and try again.';
    }
    errorEl.hidden = false;
    btn.disabled = false;
    btn.innerHTML = label;
  });
  RH.qs('#biz-name').addEventListener('input', () =>
    RH.qs('#biz-field').classList.remove('invalid'));
  RH.qs('#partner-cover-fees').addEventListener('change', (e) => {
    coverFees = e.target.checked;
  });

  /* ---- the wall: curated roster immediately (no pop-in for the
     common case), online partners merged in when live data arrives ---- */
  const wall = RH.qs('#partner-wall');
  const tierName = (id) => {
    const t = PARTNER_TIERS.find((pt) => pt.id === id);
    return t ? t.name : '';
  };
  const renderWall = (online) => {
    const { logos: logoPartners, names: namePartners } = RH.partnerGroups(online);
    if (!logoPartners.length && !namePartners.length) {
      wall.innerHTML = '<p class="hint">Your business could be first &mdash; the Rally launches in September.</p>';
      return;
    }
    wall.innerHTML = `
    <ul class="partner-grid">${logoPartners.map((p) => `
      <li class="partner-card">
        <img src="${p.src}" alt="${RH.esc(p.name)} logo" loading="lazy">
        <span class="partner-name">${RH.esc(p.name)}</span>
        ${p.tier ? `<span class="partner-tier">${tierName(p.tier)}</span>` : ''}
      </li>`).join('')}
    </ul>${RH.partnerFriendsLine(namePartners)}`;
  };
  renderWall(null);
  RH.loadLive('/api/board', (live) => renderWall(live.partners));
})();
