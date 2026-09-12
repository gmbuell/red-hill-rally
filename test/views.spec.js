import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import data from '../site/js/data.js';
import { homeSlots, partnersSlots, boardSlots } from '../worker/views.js';
import { PAGES } from '../worker/pages.js';

const [P_MAIN] = data.PRIORITIES;

/* The dart's x on a card's trail: 8 at the start, 196 at the star. */
const dartX = (card) => Number(card.match(/translate\(([\d.]+),16\) rotate\(90\)/)[1]);
const cardFor = (live, p) => String(homeSlots(live)['priority-grid']).split('<article')
  .find((c) => c.includes(`<h3>${p.name}</h3>`));

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

  it('has an element in the HTML for every slot a page renders into', async () => {
    // HTMLRewriter ignores a selector nothing matches, so a renamed id
    // would ship an empty element with no error anywhere but here.
    for (const [path, { slots }] of Object.entries(PAGES)) {
      if (!slots) continue;
      const text = await (await env.ASSETS.fetch(`https://rally.test${path}`)).text();
      for (const id of Object.keys(slots(null))) expect(text, `${path} #${id}`).toContain(`id="${id}"`);
    }
  });
});
