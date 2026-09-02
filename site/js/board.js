/* Rally Board: campaign totals, the classroom race, and the honor roll.
   The zero-state skeleton is baked into rally-board.html (kept in sync
   by scripts/skeleton.js, which calls boardView(null)), so the
   first paint is complete with no layout shift; live /api/board data
   then re-renders rows of identical size, so the swap moves nothing. */

const boardView = (live) => {
  const raised = live ? live.campaign.raised : 0;
  const gifts = live ? live.campaign.gifts : 0;
  const perClass = (live && live.classrooms) || {};
  const donors = (live && live.donors) || [];
  /* Business partners: the curated roster (baked into the skeleton)
     plus online partnerships once live data arrives — used for the
     totals tile and the strip below. */
  const { logos: logoPartners, names: namePartners } = RH.partnerGroups(live && live.partners);

  const totals = [
    [RH.money(raised), 'raised of ' + RH.money(CAMPAIGN.goal)],
    [gifts, 'family gifts so far'],
    [logoPartners.length + namePartners.length, 'business partners'],
    [CLASSROOMS.length, 'classrooms flying'],
  ].map(([num, label]) => `
      <div class="total"><span class="num money">${num}</span><span class="label">${label}</span></div>`
  ).join('');

  /* ---- classroom race, ranked by participation ---- */
  const ranked = [...CLASSROOMS]
    .map((c) => {
      const classGifts = perClass[c.id] || 0;
      return { ...c, gifts: classGifts, pct: c.students > 0 ? Math.min(classGifts / c.students, 1) : 0 };
    })
    .sort((a, b) => b.pct - a.pct);

  const race = ranked.map((c, i) => `
      <li class="${i < 3 && c.gifts > 0 ? 'leader' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="room">${c.teacher}<span class="grade">${gradeName(c.grade)}</span></span>
        <span class="trail-holder trail">${RH.trailSVG(c.pct)}</span>
        <span class="pct">${Math.round(c.pct * 100)}%<span class="families">${c.gifts} gift${c.gifts === 1 ? '' : 's'} &middot; class of ${c.students}</span></span>
      </li>`).join('');

  /* ---- honor roll (named gifts newest first; anonymous gifts are
     tallied in one closing line so a busy campaign stays readable) ---- */
  let roll;
  if (!donors.length) {
    roll = `
        <li class="empty-roll">The honor roll is waiting for its first name &mdash;
          <a href="/donate">be the first family on the board</a>.</li>`;
  } else {
    const named = donors.filter((d) => !d.anon);
    const anonCount = donors.length - named.length;
    const items = named.map((d) => {
      const p = priorityById(d.priority);
      const tier = partnerTierById(d.partner);
      let what = tier ? tier.name : (p ? p.name : '');
      if (d.circle && p && p.circle) what += (what ? ' &middot; ' : '') + p.circle.label;
      return `
        <li>
          <span class="who">${RH.esc(d.name)}</span>
          <span class="what">${what}</span>
        </li>`;
    });
    if (anonCount > 0) {
      items.push(`
        <li class="anon-tally">
          <span class="who">&hellip; and ${anonCount} anonymous gift${anonCount === 1 ? '' : 's'}</span>
          <span class="what">every one moves a rocket</span>
        </li>`);
    }
    roll = items.join('');
  }

  /* ---- business partner cards (same treatment as /partners) ---- */
  const partners = RH.partnerWall(live && live.partners, `
      <p class="board-lede">Your business could be up here &mdash; the Rally runs September&ndash;October.</p>`);

  return { totals, race, roll, partners };
};

/* Browser wiring — absent when scripts/skeleton.js evaluates this
   file in Node to generate the static skeleton. */
if (typeof document !== 'undefined') {
  RH.loadLive('/api/board', (live) => {
    const v = boardView(live);
    RH.qs('#board-totals').innerHTML = v.totals;
    RH.qs('#race').innerHTML = v.race;
    RH.qs('#honor-roll').innerHTML = v.roll;
    RH.qs('#board-partners').innerHTML = v.partners;
  });
}
