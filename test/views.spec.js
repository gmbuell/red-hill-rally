import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import data from '../site/js/data.js';
import { partnersSlots, boardSlots } from '../worker/views.js';
import { PAGES } from '../worker/pages.js';

describe('page views', () => {
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
