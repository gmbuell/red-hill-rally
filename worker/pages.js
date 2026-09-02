/* Page rendering. Every navigation reaches the worker, which streams
   the static page from the assets binding through HTMLRewriter,
   filling the shared header and footer and, per page, the live slots
   (campaign totals, the classroom race, the partner wall). A stats
   failure renders the zero state, never an error page. */

import { campaignStats, boardStats } from './store.js';
import { header, footer, homeSlots, donateSlots, boardSlots, partnersSlots, linkSlots } from './views.js';

const PAGES = {
  '/': { live: campaignStats, slots: homeSlots },
  '/donate': { slots: donateSlots },
  '/rally-board': { live: boardStats, slots: boardSlots },
  '/partners': { live: campaignStats, slots: partnersSlots },
  '/student-link': { slots: linkSlots },
  '/matching': {},
  '/thanks': {},
};

const fill = (fragment) => ({
  element(el) { el.setInnerContent(String(fragment), { html: true }); },
});

export async function renderPage(request, env) {
  const asset = await env.ASSETS.fetch(request);
  // Redirects (/donate.html → /donate), method errors, and any stray
  // file pass through untouched; pages and the 404 page get rendered.
  const isPage = (asset.status === 200 || asset.status === 404)
    && (asset.headers.get('content-type') || '').startsWith('text/html');
  if (!isPage) return asset;

  const path = new URL(request.url).pathname;
  const page = (asset.status === 200 && PAGES[path]) || {};
  let live = null;
  if (page.live) {
    try {
      live = await page.live(env.DB);
    } catch (err) {
      console.error(JSON.stringify({ event: 'api_error', route: `GET ${path}`, message: err && err.message }));
    }
  }
  const slots = page.slots ? page.slots(live) : {};

  // The body changes, so the asset's validator and length no longer
  // apply; the security and preload headers still do. Sixty seconds
  // matches the API cache the pages used to read.
  const headers = new Headers(asset.headers);
  headers.delete('etag');
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=60');

  const rewriter = new HTMLRewriter()
    .on('.site-header', fill(header(path)))
    .on('.site-footer', fill(footer()));
  for (const [id, fragment] of Object.entries(slots)) rewriter.on(`#${id}`, fill(fragment));
  return rewriter.transform(new Response(asset.body, { status: asset.status, headers }));
}
