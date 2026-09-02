/* Page rendering. Every navigation reaches the worker, which streams
   the static page from the assets binding through HTMLRewriter,
   filling the shared header and footer and, per page, the live slots
   (campaign totals, the classroom race, the partner wall). A stats
   failure renders the zero state, never an error page. */

import { campaignStats, boardStats } from './store.js';
import { header, footer, homeSlots, donateSlots, boardSlots, partnersSlots, linkSlots } from './views.js';

/* The pages with something to render beyond the chrome: a D1 read
   (`live`) and a slot builder. A page in site/ with neither needs no
   entry. */
export const PAGES = {
  '/': { live: campaignStats, slots: homeSlots },
  '/donate': { slots: donateSlots },
  '/rally-board': { live: boardStats, slots: boardSlots },
  '/partners': { live: campaignStats, slots: partnersSlots },
  '/student-link': { slots: linkSlots },
};

const fill = (fragment) => ({
  element(el) { el.setInnerContent(String(fragment), { html: true }); },
});

export async function renderPage(request, env) {
  const path = new URL(request.url).pathname;
  const page = PAGES[path] || {};
  // The D1 read runs alongside the asset round trip rather than after
  // it. A failed read is logged and renders the zero state.
  const stats = page.live && request.method === 'GET'
    ? page.live(env.DB).then((live) => ({ live, failed: false }), (err) => {
      console.error(JSON.stringify({ event: 'api_error', route: `GET ${path}`, message: err && err.message }));
      return { live: null, failed: true };
    })
    : Promise.resolve({ live: null, failed: false });

  const asset = await env.ASSETS.fetch(request);
  // Redirects (/donate.html → /donate), method errors, and any stray
  // file pass through untouched; pages and the 404 page get rendered.
  const isPage = (asset.status === 200 || asset.status === 404)
    && (asset.headers.get('content-type') || '').startsWith('text/html');
  if (!isPage) return asset;

  const { live, failed } = await stats;
  const slots = asset.status === 200 && page.slots ? page.slots(live) : {};

  // The body changes, so the asset's validator and length no longer
  // apply; the security headers still do. Sixty seconds
  // matches the API cache the pages used to read. The zero state a
  // failed read produces must not be cached: the next visit tries D1
  // again.
  const headers = new Headers(asset.headers);
  headers.delete('etag');
  headers.delete('content-length');
  headers.set('cache-control', failed ? 'no-store' : 'public, max-age=60');
  // Early Hints: the browser fetches the stylesheet during server
  // think-time. Only pages carry the hint; Chrome acts on it from any
  // response, and from a script or font response it re-preloads a
  // stylesheet that is already loaded, then warns the preload went
  // unused.
  headers.set('link', '</css/styles.css>; rel=preload; as=style');

  const rewriter = new HTMLRewriter()
    .on('.site-header', fill(header(path)))
    .on('.site-footer', fill(footer()));
  for (const [id, fragment] of Object.entries(slots)) rewriter.on(`#${id}`, fill(fragment));
  return rewriter.transform(new Response(asset.body, { status: asset.status, headers }));
}
