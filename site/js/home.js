/* Home page: campaign meter and the six priority cards. Renders
   immediately with zeros so the first paint is complete (no pop-in
   layout shift), then patches in live totals from /api/campaign —
   the update replaces same-sized content, so nothing moves. */

(() => {
  RH.qs('#scatter').innerHTML = RH.scatter;

  const render = (raised, perPriority) => {
    RH.buildTrajectory(RH.qs('#trajectory'), raised / CAMPAIGN.goal);
    RH.qs('#stat-raised').textContent = RH.money(raised);
    RH.qs('#stat-goal').textContent = RH.money(CAMPAIGN.goal);

    RH.qs('#priority-grid').innerHTML = PRIORITIES.map((p) => {
      const pRaised = perPriority[p.id] || 0;
      return `
      <article class="priority-card">
        ${RH.icon(p.id, 'icon')}
        <h3>${p.name}</h3>
        <p class="blurb">${p.blurb}</p>
        <div class="trail-row">
          ${RH.trailSVG(pRaised / p.goal)}
          <p class="raised-line"><strong>${RH.money(pRaised)}</strong> raised of ${RH.money(p.goal)}</p>
        </div>
        <a class="go" href="/donate?p=${p.id}">Give to this</a>
      </article>`;
    }).join('');
  };

  render(0, {});
  RH.loadLive('/api/campaign', (live) => render(live.campaign.raised, live.priorities || {}));
})();
