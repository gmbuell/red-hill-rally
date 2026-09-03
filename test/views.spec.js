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
