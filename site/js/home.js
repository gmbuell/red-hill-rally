/* Home page: campaign meter, its raised/goal figures, and the six
   priority cards. The zero-state (homeView(0, {})) is baked into
   index.html by scripts/skeleton.js, so the first paint is complete;
   live /api/campaign totals then re-render same-sized content, so
   nothing moves. */

const homeView = (raised, perPriority) => ({
  trajectory: RH.trajectorySVG(raised / CAMPAIGN.goal),
  raised: RH.money(raised),
  goal: RH.money(CAMPAIGN.goal),
  cards: PRIORITIES.map((p) => {
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
  }).join(''),
});

/* Browser wiring — absent when scripts/skeleton.js evaluates this file. */
if (typeof document !== 'undefined') {
  RH.loadLive('/api/campaign', (live) => {
    const v = homeView(live.campaign.raised, live.priorities || {});
    RH.qs('#trajectory').innerHTML = v.trajectory;
    RH.qs('#stat-raised').innerHTML = v.raised;
    RH.qs('#priority-grid').innerHTML = v.cards;
  });
}
