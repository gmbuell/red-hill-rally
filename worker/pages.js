/* Page rendering. Every navigation reaches the worker, which streams
   the static page from the assets binding through HTMLRewriter,
   filling the shared header and footer and, per page, the live slots
   (campaign totals, the classroom race, the partner wall). A stats
   failure renders the zero state, never an error page. */

import data from '../site/js/data.js';
import { campaignStats, boardStats, prizeStats } from './store.js';
import { finalePage, header, footer, homeSlots, donateSlots, boardSlots, partnersSlots, linkSlots, shirtSlots, prizesSlots } from './views.js';

/* The pages with something to render beyond the chrome: a D1 read
   (`live`) and a slot builder. A page in site/ with neither needs no
   entry. */
export const PAGES = {
  '/': { live: campaignStats, slots: homeSlots },
  '/donate': { slots: donateSlots },
  '/rally-board': { live: boardStats, slots: boardSlots },
  '/partners': { live: campaignStats, slots: partnersSlots },
  '/prizes': { live: prizeStats, slots: prizesSlots },
  '/student-link': { slots: linkSlots },
  '/shirt': { slots: shirtSlots },
};

/* A slot fills its element, or — when the builder hands back `null` —
   takes the element out of the page. Removal is how a state that no
   longer applies (the shirt form past its deadline, the closed notice
   before it) never reaches the browser to be styled around or
   submitted from. */
const fill = (fragment) => (fragment === null
  ? { element(el) { el.remove(); } }
  : { element(el) { el.setInnerContent(String(fragment), { html: true }); } });

const { siteWrapped } = data;

export async function renderPage(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;

  /* Once the Rally is wrapped, every public page serves the one page
     that says what the school did. Mission Control is exempt, because
     the PTA is still working in it.

     `/robots.txt` is exempt for the reason the holding notice exempts
     it: there isn't one, so it 404s, and a 404 means "no rules, crawl
     away". Answering it with HTML is a malformed robots.txt, which
     crawlers may read as rules they cannot parse -- and which drops the
     Lighthouse SEO score to 92 on *every* path, since every path is now
     this page. That failed the repo's own gate, which is how it was
     caught.

     It borrows the real page pipeline rather than short-circuiting the
     way the holding notice does: `/` is fetched from the assets binding
     for its security headers, its body is replaced, and the result goes
     in the same five-minute cache under one key, so every path costs a
     single D1 read between refreshes rather than one each. The total is
     live for exactly that reason -- a refunded gift corrects the page
     without anybody editing it. */
  const exemptFromFinale = path === '/admin' || path === '/robots.txt';
  if (siteWrapped() && request.method === 'GET' && !exemptFromFinale) {
    const key = new Request(`${url.origin}/__wrapped`);
    const hit = await caches.default.match(key);
    if (hit) return hit;
    let raised = 0; let partners = []; let failed = false;
    try {
      const live = await campaignStats(env.DB);
      raised = (live && live.campaign && live.campaign.raised) || 0;
      /* The same payload already carries the uploaded partner logos, so
         the closing page's wall costs nothing beyond the total's read. */
      partners = (live && live.partners) || [];
    } catch (err) {
      failed = true;
      console.error(JSON.stringify({ event: 'api_error', route: `GET ${path}`, message: err && err.message }));
    }
    const shell = await env.ASSETS.fetch(new Request(`${url.origin}/`));
    const headers = new Headers(shell.headers);
    headers.delete('etag');
    headers.delete('content-length');
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', failed ? 'no-store' : 'public, max-age=300');
    headers.set('link', '</css/styles.css>; rel=preload; as=style');
    const res = new Response(finalePage(raised, partners), { status: 200, headers });
    if (!failed) ctx.waitUntil(caches.default.put(key, res.clone()).catch(() => {}));
    return res;
  }
  const page = PAGES[path] || {};
  // A page that reads D1 is served from this location's cache for the
  // five minutes the browser is told to keep it, so a crawl or a
  // rally-night crowd costs one read per five minutes here instead of
  // one per view. The key is the path alone: a query string changes nothing
  // on these pages. The zero state is `no-store` below, so it never
  // enters the cache.
  const cacheKey = page.live && request.method === 'GET' ? new Request(url.origin + path) : null;
  const cached = cacheKey && await caches.default.match(cacheKey);
  if (cached) return cached;
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
  // apply; the security headers still do. Five minutes matches the
  // API cache. The zero state a
  // failed read produces must not be cached: the next visit tries D1
  // again.
  const headers = new Headers(asset.headers);
  headers.delete('etag');
  headers.delete('content-length');
  headers.set('cache-control', failed ? 'no-store' : 'public, max-age=300');
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
  const response = rewriter.transform(new Response(asset.body, { status: asset.status, headers }));
  if (cacheKey && asset.status === 200 && !failed) {
    // A cache that will not take the page is the next visitor's read,
    // never this one's error.
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch(() => {}));
  }
  return response;
}
