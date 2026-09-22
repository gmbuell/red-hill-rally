import { env } from 'cloudflare:test';
import { afterEach, describe, it, expect, vi } from 'vitest';
import data from '../site/js/data.js';
import { homeSlots, partnersSlots, boardSlots, donateSlots, shirtSlots, schoolParticipation } from '../worker/views.js';
import { PAGES } from '../worker/pages.js';
import ui from '../site/js/ui.js';

const { money } = ui;

const [P_MAIN] = data.PRIORITIES;

/* The dart's x on a card's trail: 8 at the start, 196 at the star. */
const dartX = (card) => Number(card.match(/translate\(([\d.]+),16\) rotate\(90\)/)[1]);
const cardFor = (live, p) => String(homeSlots(live)['priority-grid']).split('<article')
  .find((c) => c.includes(`<h3>${p.name}</h3>`));

/* Passing the goal is the one state the hero has to change its mind
   about: the figure it was counting toward is now history, and the ask
   moves to the race that is still open. No second dollar target is
   invented — the families who already gave are not told the finish
   line moved. */
describe('once the dollar goal is met', () => {
  const [RA, RB] = data.CLASSROOMS;
  const seats = data.CLASSROOMS.reduce((n, c) => n + c.students, 0);
  const live = (raised, classrooms = {}) => ({
    campaign: { raised, gifts: 1 }, priorities: {}, classrooms,
  });

  it('counts every child in the school, and no class over its own size', () => {
    const rooms = {
      [RA.id]: { rockets: RA.students + 5, raised: 100 },  // more gifts than kids
      [RB.id]: { rockets: 2, raised: 50 },
    };
    const { flying, seats: total, pct } = schoolParticipation(rooms);
    expect(total).toBe(seats);
    // The overfull class counts its own size, never more.
    expect(flying).toBe(RA.students + 2);
    expect(pct).toBe(Math.round((flying / seats) * 100));
  });

  it('survives a failed read rather than blanking the hero', () => {
    expect(schoolParticipation(null).pct).toBe(0);
    expect(String(homeSlots(null)['stat-raised'])).toContain('$0');
  });

  it('keeps counting toward the goal until it is reached', () => {
    const under = homeSlots(live(data.CAMPAIGN.goal - 1));
    expect(under['goal-met']).toBeNull();
    expect(String(under['stat-goal'])).toBe(String(money(data.CAMPAIGN.goal)));
    expect(String(under['goal-label'])).toBe('Our goal');
    expect(under['goal-sub']).toBeNull();
  });

  it('turns the second figure into the race still open', () => {
    const rooms = { [RA.id]: { rockets: RA.students, raised: 5000 } };
    const met = homeSlots(live(data.CAMPAIGN.goal, rooms));
    const school = schoolParticipation(rooms);
    expect(String(met['stat-goal'])).toBe(`${school.pct}%`);
    expect(String(met['goal-label'])).toContain('participated');
    expect(String(met['goal-sub'])).toBe(`${school.flying} of ${school.seats} students`);
    // The dollars keep climbing; they are not frozen at the goal.
    expect(String(homeSlots(live(data.CAMPAIGN.goal + 2500, rooms))['stat-raised']))
      .toBe(String(money(data.CAMPAIGN.goal + 2500)));
  });

  it('says the goal is met and gives the gap as the reason to keep going', () => {
    const banner = String(homeSlots(live(data.CAMPAIGN.goal))['goal-met']);
    expect(banner).toContain(String(money(data.CAMPAIGN.goal)));
    expect(banner).toContain(data.CAMPAIGN.closeDayLabel);
    // The year's cost is the ask now, and both halves of the claim are
    // links to the page that itemises it, rather than a number with
    // nothing behind it.
    expect(banner).toContain(String(money(data.ANNUAL_COST)));
    expect(banner.match(/href="\/why-we-rally"/g) || []).toHaveLength(2);
    // Nothing that reads as a fresh target to chase.
    expect(banner).not.toMatch(/stretch|new goal|next goal/i);
  });

  it('leaves the one-time campus work out of the year\'s cost', () => {
    // A capital project folded into a yearly figure would overstate
    // the gap the copy asks families to help close.
    const every = data.PRIORITIES.reduce((s, p) => s + p.goal, 0);
    const once = data.PRIORITIES.filter((p) => p.oneTime).reduce((s, p) => s + p.goal, 0);
    expect(once).toBeGreaterThan(0);
    expect(data.ANNUAL_COST).toBe(every - once);
    expect(data.ANNUAL_COST).toBeGreaterThan(data.CAMPAIGN.goal);
  });

  it("retires the goal from the board's label and points at participation", () => {
    const under = boardSlots(live(data.CAMPAIGN.goal - 1));
    expect(String(under['board-totals'])).toContain(`raised of ${money(data.CAMPAIGN.goal)}`);
    expect(String(under['totals-note'])).toContain('two things');

    const met = boardSlots(live(data.CAMPAIGN.goal));
    expect(String(met['board-totals'])).toContain(`past our ${money(data.CAMPAIGN.goal)} goal`);
    expect(String(met['board-totals'])).not.toContain(`raised of ${money(data.CAMPAIGN.goal)}`);
    const note = String(met['totals-note']);
    expect(note).toContain(String(money(data.ANNUAL_COST)));
    expect(note).toContain(data.CAMPAIGN.closeLabel);
  });

  /* The participation prizes are thresholds, not places. A class at
     84% has already won $150, and a board that only ranks them teaches
     the opposite. */
  it('says every class that gets there wins, however many do', () => {
    const rooms = {};
    // One class over 80%, one nowhere near, so the counts are non-zero.
    rooms[RA.id] = { rockets: RA.students, raised: 900 };
    rooms[RB.id] = { rockets: 1, raised: 25 };
    for (const slots of [boardSlots(live(1000, rooms)), boardSlots(live(1000))]) {
      const prize = String(slots['prize-note']);
      expect(prize).toMatch(/every class that gets there wins/i);
      expect(prize).toMatch(/however many/i);
    }
    // And the line under the list says the order is not the contest.
    const rank = String(boardSlots(live(1000, rooms))['race-rank']);
    expect(rank).toContain('only how the list is sorted');
    expect(rank).toMatch(/loses nothing/i);
    expect(rank).toContain('Golden Shoe has a single winner');
  });

  it('shows one school one way: home and the board agree on the share', () => {
    const rooms = { [RA.id]: { rockets: 3, raised: 300 }, [RB.id]: { rockets: 5, raised: 500 } };
    const pct = schoolParticipation(rooms).pct;
    expect(String(homeSlots(live(data.CAMPAIGN.goal, rooms))['stat-goal'])).toBe(`${pct}%`);
    expect(String(boardSlots(live(data.CAMPAIGN.goal, rooms))['board-totals'])).toContain(`${pct}%`);
  });
});

describe('page views', () => {
  it('splits the campaign goal across the priorities by annual cost', () => {
    const targets = data.PRIORITIES.map(data.priorityTarget);
    expect(targets.reduce((s, t) => s + t, 0)).toBeCloseTo(data.CAMPAIGN.goal, 6);
    for (const t of targets) expect(t).toBeGreaterThan(0);
  });

  it('runs a priority card trail toward its share of the goal, never its annual cost', () => {
    const live = (raised) => ({ campaign: { raised, gifts: 0 }, priorities: { [P_MAIN.id]: raised } });
    const target = data.priorityTarget(P_MAIN);
    expect(target).toBeLessThan(P_MAIN.goal);
    expect(dartX(cardFor(live(target), P_MAIN))).toBe(196);
    expect(dartX(cardFor(live(target / 2), P_MAIN))).toBe(102);
    expect(String(homeSlots(live(target))['priority-grid'])).not.toContain('raised of');
  });

  it('credits the presenting partner in the hero from the roster', () => {
    const { name } = data.presentingPartner();
    expect(String(homeSlots(null).presented)).toContain(`<strong>${name}</strong>`);
    const saved = data.PARTNERS.splice(0);
    try {
      expect(String(homeSlots(null).presented)).toBe('');
    } finally {
      data.PARTNERS.push(...saved);
    }
  });

  it('lists a curated partner whose tier id is unknown instead of throwing', () => {
    data.PARTNERS.push({ name: 'Typo Tire', logo: 'typo-tire.webp', tier: 'suporter' });
    try {
      expect(String(partnersSlots(null)['partner-wall'])).toContain('Typo Tire');
      expect(String(boardSlots(null)['board-partners'])).toContain('Typo Tire');
    } finally {
      data.PARTNERS.pop();
    }
  });

  /* The board carries two races that are easy to confuse: the Golden
     Shoe, which one class wins on dollars, and the participation
     prizes, which every class can win by reaching a threshold.

     Rockets are given as a share of the class, then turned into whole
     children: a fraction that lands mid-child would make the
     percentage the board prints drift from what the test meant. */
  const board = (rooms) => {
    const classrooms = {};
    let raised = 0;
    for (const [i, [share, dollars]] of rooms.entries()) {
      const room = data.CLASSROOMS[i];
      // A share above 1 is a Rocket count: some class sizes (19, 33)
      // cannot express a round percentage, so a test that cares about
      // the exact figure names the children instead of the fraction.
      const rockets = share > 1 ? share : Math.round(room.students * share);
      if (share <= 1) expect(rockets / room.students, `room ${i}`).toBeCloseTo(share, 6);
      classrooms[room.id] = { rockets, raised: dollars };
      raised += dollars;
    }
    const slots = boardSlots({ campaign: { raised, gifts: 0 }, classrooms, donors: [], partners: [] });
    return {
      totals: String(slots['board-totals']),
      shoe: String(slots['shoe-note']),
      prizes: String(slots['prize-note']),
      order: [...String(slots.race).matchAll(/<span class="room">([^<]*)/g)].map((m) => m[1]),
    };
  };

  it('heads the board with both measures, so neither reads as the only one', () => {
    // Half of one class in, nobody else: 10 of the school's seats.
    const seats = data.CLASSROOMS.reduce((n, c) => n + c.students, 0);
    const { totals } = board([[0.5, 900]]);
    expect(totals).toContain('$900');
    expect(totals).toContain('raised of');
    expect(totals).toContain(`${Math.round((data.CLASSROOMS[0].students * 0.5 / seats) * 100)}%`);
    expect(totals).toContain('of Rockets have participated');
  });

  it('never shows the school over 100% when a class draws more Rockets than seats', () => {
    // Gifts naming nobody each count as a Rocket, so a class can carry
    // more credits than children; the rows cap it and so must the head.
    const rooms = {};
    for (const c of data.CLASSROOMS) rooms[c.id] = { rockets: c.students + 5, raised: 10 };
    const totals = String(boardSlots({
      campaign: { raised: 10, gifts: 0 }, classrooms: rooms, donors: [], partners: [],
    })['board-totals']);
    expect(totals).toContain('100%');
    expect(totals).not.toMatch(/1[1-9]\d%|[2-9]\d\d%/);
  });

  it('names the dollar leader for the shoe and only counts classes for participation', () => {
    // Second room leads participation; the first raised the most.
    const { shoe, prizes } = board([[0.5, 900], [1, 100]]);
    expect(shoe).toContain('dollars raised');
    expect(shoe).toContain(`${data.CLASSROOMS[0].teacher}&rsquo;s class`);
    expect(shoe).toContain('$900');
    // The shoe line must not claim the participation leader.
    expect(shoe).not.toContain(`${data.CLASSROOMS[1].teacher}&rsquo;s class`);
    expect(prizes).toContain('Classroom participation');
    expect(prizes).toContain('<strong>1 class</strong> at 80% or more');
    expect(prizes).toContain('<strong>1</strong> at 100%');
    // The participation card never names a class: nobody wins it by leading.
    for (const room of data.CLASSROOMS) expect(prizes).not.toContain(room.teacher);
  });

  it('counts every class at 80% or more, and says when none is at 100%', () => {
    const { prizes } = board([[0.8, 10], [17, 10], [0.75, 10]]);
    expect(prizes).toContain('<strong>2 classes</strong> at 80% or more');
    expect(prizes).toContain('<strong>none</strong> at 100% yet');
  });

  it('points an empty board at the prizes instead of naming a leader', () => {
    const { shoe, prizes } = board([]);
    expect(shoe).toContain('Still anyone&rsquo;s');
    expect(prizes).toContain('Every class can earn funds');
    expect(prizes).toContain('80% participation to earn $150');
    expect(prizes).toContain('100% participation to earn $250');
    expect(prizes).not.toContain('<strong>');
  });

  it('ranks classes tied on participation by dollars raised', () => {
    // Everyone at 100%: participation has stopped separating them.
    const { order } = board([[1, 100], [1, 700], [1, 400]]);
    const [a, b, c] = data.CLASSROOMS.map((r) => r.teacher);
    expect(order.slice(0, 3)).toEqual([b, c, a]);
  });

  it('breaks a tie on the percentage it prints, not the fraction behind it', () => {
    /* Two rooms printing the same percentage off different fractions.
       The lower fraction is given the bigger total, so sorting on the
       raw fraction and sorting on the printed one disagree, and only
       the printed one matches the rows a family is reading. */
    const pair = (() => {
      for (const a of data.CLASSROOMS) {
        for (const b of data.CLASSROOMS) {
          if (a.id === b.id || !a.students || !b.students) continue;
          for (let ra = 1; ra <= a.students; ra += 1) {
            for (let rb = 1; rb <= b.students; rb += 1) {
              const fa = ra / a.students, fb = rb / b.students;
              if (fa < fb && Math.round(fa * 100) === Math.round(fb * 100)) {
                return { a, ra, b, rb };
              }
            }
          }
        }
      }
      return null;
    })();
    expect(pair, 'roster has no two class sizes that can print the same percent').not.toBeNull();

    const { a, ra, b, rb } = pair;
    const classrooms = {
      [a.id]: { rockets: ra, raised: 990 },  // lower fraction, more money
      [b.id]: { rockets: rb, raised: 10 },
    };
    const slots = boardSlots({ campaign: { raised: 1000, gifts: 0 }, classrooms, donors: [], partners: [] });
    const order = [...String(slots.race).matchAll(/<span class="room">([^<]*)/g)].map((m) => m[1]);
    expect(order.indexOf(a.teacher)).toBeLessThan(order.indexOf(b.teacher));
  });

  /* Two rooms are kept off the public race. Everything else about them
     carries on, which is the whole point of the flag. */
  describe('a classroom kept off the board', () => {
    const off = data.CLASSROOMS.filter((c) => c.offBoard);
    const on = data.CLASSROOMS.filter((c) => !c.offBoard);

    const boardWith = (rooms) => {
      const classrooms = {};
      let raised = 0;
      for (const [room, rockets, dollars] of rooms) {
        classrooms[room.id] = { rockets, raised: dollars };
        raised += dollars;
      }
      const slots = boardSlots({ campaign: { raised, gifts: 0 }, classrooms, donors: [], partners: [] });
      return {
        totals: String(slots['board-totals']),
        shoe: String(slots['shoe-note']),
        prizes: String(slots['prize-note']),
        race: String(slots.race),
      };
    };

    it('is configured, or none of the rest of this means anything', () => {
      expect(off.length).toBeGreaterThan(0);
      expect(data.boardClassrooms()).toEqual(on);
    });

    it('never appears as a row in the race', () => {
      const { race } = boardWith(off.map((c) => [c, c.students, 5000]));
      for (const c of off) expect(race, c.teacher).not.toContain(c.teacher);
      // The rooms that are on the board still all render.
      expect(race.match(/<span class="room">/g)).toHaveLength(on.length);
    });

    it('is never named for the Golden Shoe, however much it raised', () => {
      const { shoe } = boardWith([
        [off[0], 1, 90000],
        [on[0], on[0].students, 100],
      ]);
      expect(shoe).not.toContain(off[0].teacher);
      expect(shoe).toContain(on[0].teacher);
    });

    it('is left out of the classes-at-80% count, so the count matches the rows', () => {
      const { prizes } = boardWith(off.map((c) => [c, c.students, 100]));
      // Every off-board room at 100%, no on-board room anywhere near it.
      expect(prizes).toContain('Every class can earn funds');
    });

    it('still counts toward the school-wide participation figure', () => {
      const seats = data.CLASSROOMS.reduce((n, c) => n + c.students, 0);
      const kids = off.reduce((n, c) => n + c.students, 0);
      const { totals } = boardWith(off.map((c) => [c, c.students, 100]));
      expect(totals).toContain(`${kids} of ${seats} students`);
      expect(totals).toContain(`${Math.round((kids / seats) * 100)}%`);
    });
  });

  /* A partner recognised without a rung on the ladder. The roster has
     real entries carrying a label, so each assertion looks at the one
     card under test rather than the whole wall. */
  const cardFor2 = (name) => String(partnersSlots(null)['partner-wall'])
    .split('<li').find((c) => c.includes(`>${name}<`));

  it('badges a roster partner from its plain label', () => {
    data.PARTNERS.push({ name: 'Label Co', logo: 'label-co.webp', label: 'Badge Only' });
    try {
      const card = cardFor2('Label Co');
      expect(card).toBeTruthy();
      expect(card).toContain('Badge Only');
    } finally {
      data.PARTNERS.pop();
    }
  });

  it('lets a real tier outrank a plain label', () => {
    const tier = data.PARTNER_TIERS.find((t) => t.logo);
    data.PARTNERS.push({ name: 'Label Co', logo: 'label-co.webp', label: 'Badge Only', tier: tier.id });
    try {
      const card = cardFor2('Label Co');
      expect(card).toContain(tier.name);
      expect(card).not.toContain('Badge Only');
    } finally {
      data.PARTNERS.pop();
    }
  });

  it('has an element in the HTML for every slot a page renders into', async () => {
    // HTMLRewriter ignores a selector nothing matches, so a renamed id
    // would ship an empty element with no error anywhere but here.
    // Both sides of the shirt deadline, because each renders ids the
    // other doesn't.
    for (const at of [BEFORE, AFTER]) {
      vi.setSystemTime(at);
      for (const [path, { slots }] of Object.entries(PAGES)) {
        if (!slots) continue;
        const text = await (await env.ASSETS.fetch(`https://rally.test${path}`)).text();
        for (const id of Object.keys(slots(null))) expect(text, `${path} #${id}`).toContain(`id="${id}"`);
      }
    }
    vi.useRealTimers();
  });
});

/* The shirt order goes to the printer at a stated moment, and after it
   a shirt bought on the site could not be printed and handed out
   before Rally day. So the deadline is a fact in data.js that the
   pages read, not a sentence typed into three of them. */
const DEADLINE = data.SHIRT.deadline;
// 7pm Pacific on the deadline day is 02:00 UTC the next morning.
const AT = new Date('2026-09-26T02:00:00Z');
const BEFORE = new Date('2026-09-26T01:59:00Z');
const AFTER = new Date('2026-09-26T02:01:00Z');

describe('the shirt ordering deadline', () => {
  afterEach(() => vi.useRealTimers());

  it('stays open through the deadline minute and shuts the one after', () => {
    expect(DEADLINE).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(data.shirtsOpen(BEFORE)).toBe(true);
    // The stated minute is still ordering time: a family clicking
    // Continue at 7:00 on the dot gets their shirt.
    expect(data.shirtsOpen(AT)).toBe(true);
    expect(data.shirtsOpen(AFTER)).toBe(false);
  });

  it('reads the clock in Pacific, so an afternoon order is not closed by UTC', () => {
    // 1pm Pacific on deadline day — but 20:00 on a UTC clock, which is
    // already past 19:00. Comparing UTC would shut the shirt page six
    // hours early, on the busiest afternoon it has.
    const fridayAfternoon = new Date('2026-09-25T20:00:00Z');
    expect(data.pacificAt(fridayAfternoon)).toBe('2026-09-25 13:00');
    expect(data.shirtsOpen(fridayAfternoon)).toBe(true);
  });

  it('names the deadline on the shirt page, the donate form and the home callout', () => {
    vi.setSystemTime(BEFORE);
    const { deadlineLabel } = data.SHIRT;
    expect(String(shirtSlots()['shirt-assurance'])).toContain(deadlineLabel);
    expect(String(donateSlots()['rocket-hint'])).toContain(deadlineLabel);
    expect(String(homeSlots(null)['shirt-callout-note'])).toContain(deadlineLabel);
  });

  it('takes the order form off the shirt page once ordering has closed', () => {
    vi.setSystemTime(AFTER);
    const slots = shirtSlots();
    // null is the signal pages.js removes the element on — the form
    // must not merely be styled shut, or a stale tab could post it.
    expect(slots['shirt-form']).toBeNull();
    expect(slots['shirt-rows']).toBeUndefined();
    expect(String(slots['shirt-closed'])).toContain(data.SHIRT.deadlineLabel);
    expect(String(slots['shirt-also'])).toContain('/donate');
  });

  it('stops offering shirts on the donate form and the home page once closed', () => {
    vi.setSystemTime(AFTER);
    expect(String(donateSlots()['rocket-hint'])).not.toContain('shirt');
    expect(homeSlots(null)['shirt-callout']).toBeNull();
    expect(homeSlots(null)['shirt-callout-note']).toBeUndefined();
  });
});
