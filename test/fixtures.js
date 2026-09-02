/* Shared fixtures: a paid Checkout session the way Stripe reports it,
   the personal details in it that must never reach a public response,
   and the page list. */
import data from '../site/js/data.js';

const [P_MAIN] = data.PRIORITIES;
const [ROOM_A] = data.CLASSROOMS.map((c) => c.id);
const LOGO_TIER = data.PARTNER_TIERS.find((t) => t.logo);

/* A family gift: one Rocket, a public honor-roll name, an employer
   match, arrived through a student link. */
export const paidSession = (over = {}) => ({
  id: over.id || 'cs_test_abc',
  amount_total: over.amount_total ?? 10000,
  payment_status: over.payment_status || 'paid',
  customer_details: {
    email: 'fam@example.com',
    name: 'Rosa Rodriguez',
    address: {
      line1: '123 Rocket Way', line2: 'Apt 4', city: 'Tustin',
      // Not the school's own ZIP, which the copy prints.
      state: 'CA', postal_code: '99950', country: 'US',
    },
  },
  metadata: {
    priority: P_MAIN.id,
    students: JSON.stringify([{ c: ROOM_A, n: 'Mia Rodriguez' }]),
    donor_name: 'The Rodriguez Family',
    visibility: 'public',
    employer_match: '1',
    via_link: '1',
    fee_cents: '0',
    ...(over.metadata || {}),
  },
});

/* A paid partnership at the first logo tier. */
export const paidPartnership = (over = {}) => paidSession({
  id: 'cs_partner', amount_total: LOGO_TIER.amount * 100,
  ...over,
  metadata: {
    kind: 'partner', partner_tier: LOGO_TIER.id, priority: '',
    donor_name: 'Galaxy Automotive & Tire', students: '',
    ...(over.metadata || {}),
  },
});

/* Fragments of paidSession that are backend-only: the student, the
   donor's email and billing contact. Probe every public response. */
export const PII = ['Mia', 'example.com', 'Rosa', 'Rocket Way', '99950'];

/* The pages are the HTML files in site/ (the worker renders whatever
   is there); the 404 is served on its own. */
export const PAGE_PATHS = Object.keys(import.meta.glob('../site/*.html'))
  .map((f) => f.slice(f.lastIndexOf('/') + 1, -5))
  .filter((stem) => stem !== '404')
  .map((stem) => (stem === 'index' ? '/' : `/${stem}`));
