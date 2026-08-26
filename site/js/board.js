/* Rally Board: campaign totals, the classroom race, and the honor roll.
   Renders immediately with zeros so the first paint is complete (no
   pop-in layout shift), then re-renders with live /api/board data —
   rows are uniform height, so the swap moves nothing. */

(() => {
  const render = (live) => {
    const raised = live ? live.campaign.raised : 0;
    const gifts = live ? live.campaign.gifts : 0;
    const perClass = (live && live.classrooms) || {};
    const donors = (live && live.donors) || [];

    RH.qs('#board-totals').innerHTML = [
      [RH.money(raised), 'raised of ' + RH.money(CAMPAIGN.goal)],
      [gifts, 'family gifts so far'],
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

    const gradeLabel = (g) =>
      g === 'TK' ? 'Transitional K'
        : g === 'K' ? 'Kindergarten'
        : g === 'SDC' ? 'Special Day Class'
        : g === '1st/2nd' ? '1st/2nd combo'
        : g + ' grade';

    RH.qs('#race').innerHTML = ranked.map((c, i) => `
      <li class="${i < 3 && c.gifts > 0 ? 'leader' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="room">${c.teacher}<span class="grade">${gradeLabel(c.grade)}</span></span>
        <span class="trail-holder trail">${RH.trailSVG(c.pct)}</span>
        <span class="pct">${Math.round(c.pct * 100)}%<span class="families">${c.gifts} of ${c.students} students</span></span>
      </li>`).join('');

    /* ---- honor roll (named gifts newest first; anonymous gifts are
       tallied in one closing line so a busy campaign stays readable) ---- */
    if (!donors.length) {
      RH.qs('#honor-roll').innerHTML = `
        <li class="empty-roll">The honor roll is waiting for its first name &mdash;
          <a href="/donate">be the first family on the board</a>.</li>`;
      return;
    }
    const named = donors.filter((d) => !d.anon);
    const anonCount = donors.length - named.length;
    const items = named.map((d) => {
      const p = RH.priorityById(d.priority);
      let what = p ? p.name : '';
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
    RH.qs('#honor-roll').innerHTML = items.join('');
  };

  render(null);
  RH.loadLive('/api/board', render);
})();
