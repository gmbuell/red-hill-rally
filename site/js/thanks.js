/* Thank-you page: personalize the impact line from the handoff params. */

(() => {
  RH.qs('#thanks-rocket').innerHTML = RH.badgeRocket('rocket-float');

  const p = RH.priorityById(RH.param('p'));
  const amt = Number(RH.param('amt')) || 0;
  const line = RH.qs('#impact-line');

  if (p && amt) {
    const tier = p.tiers.find((t) => t.amount === amt);
    const what = tier
      ? tier.impact.charAt(0).toLowerCase() + tier.impact.slice(1)
      : `real, visible support for ${p.name}`;
    line.innerHTML =
      `Your <strong>${RH.money(amt)}</strong> funds ${what}.`;
  } else {
    line.textContent =
      'Your gift joins hundreds of families powering the Rally.';
  }
})();
