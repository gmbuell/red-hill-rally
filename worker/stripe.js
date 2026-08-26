/* Stripe over plain fetch, no SDK: Checkout Session creation and
   webhook signature verification. */

const enc = new TextEncoder();

/* Returns the session object ({id, url, ...}) or null on any Stripe
   error (already logged; the caller turns null into a friendly 502). */
export async function createCheckoutSession(env, { amountCents, productName, feeCents, feeName, successUrl, cancelUrl, description, metadata }) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('submit_type', 'donate');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  // Becomes the charge description, which Stripe prints on the email
  // receipt — this line carries the IRS donation-acknowledgment text.
  params.set('payment_intent_data[description]', description);
  // Stripe's page collects email (for the receipt) and, with this, the
  // donor's full billing address — both come back in the webhook's
  // customer_details for the PTA's records.
  params.set('billing_address_collection', 'required');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(amountCents));
  params.set('line_items[0][price_data][product_data][name]', productName);
  // The donor's opt-in fee cover rides as its own line item, so the
  // receipt itemizes the gift and the extra separately.
  if (feeCents > 0) {
    params.set('line_items[1][quantity]', '1');
    params.set('line_items[1][price_data][currency]', 'usd');
    params.set('line_items[1][price_data][unit_amount]', String(feeCents));
    params.set('line_items[1][price_data][product_data][name]', feeName);
  }
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, value);
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    console.error(JSON.stringify({
      event: 'stripe_checkout_error',
      status: res.status,
      message: data && data.error && data.error.message,
    }));
    return null;
  }
  return data;
}

const hexToBytes = (hex) => {
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

/* Stripe-Signature: t=<unix>,v1=<hex hmac of "t.payload">[,v1=...] */
export async function verifyWebhook(payload, sigHeader, secret) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!sigHeader) return false;
  let timestamp = null;
  const candidates = [];
  for (const part of sigHeader.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key.trim() === 't') timestamp = value;
    if (key.trim() === 'v1') candidates.push(value);
  }
  if (!timestamp || !candidates.length) return false;
  if (Math.abs(nowSec - Number(timestamp)) > 300) return false; // replay window

  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${payload}`)));

  for (const candidate of candidates) {
    const given = hexToBytes(candidate.trim());
    if (given && given.length === expected.length &&
        crypto.subtle.timingSafeEqual(given, expected)) {
      return true;
    }
  }
  return false;
}
