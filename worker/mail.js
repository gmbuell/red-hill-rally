/* Outbound email over plain fetch, no SDK — the same shape as
   stripe.js. One provider (Resend), one call.

   Three secrets, all set with `wrangler secret put`, none of them in
   this repository: RESEND_API_KEY, MAIL_FROM (the verified sender, e.g.
   "Rocket Rally <rally@rocketrally.org>"), and MAIL_REPLY_TO (a real
   PTA inbox, so a teacher who replies reaches a person).

   With any of them missing, sending is off. That is what keeps the
   preview worker and local dev from mailing anyone: they hold no
   secrets, so every send here is a no-op they can log. */

export const mailConfigured = (env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

export async function sendEmail(env, { to, subject, text }) {
  if (!mailConfigured(env)) return { ok: false, error: 'email is not configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [to],
        subject,
        text,
        ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}),
      }),
    });
    if (!res.ok) {
      // The provider's message is useful and carries no donor data, so
      // it goes in the log and into Mission Control's status column.
      const detail = await res.text().catch(() => '');
      console.error(JSON.stringify({ event: 'mail_error', status: res.status, detail: detail.slice(0, 300) }));
      return { ok: false, error: `provider said ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error(JSON.stringify({ event: 'mail_error', message: err && err.message }));
    return { ok: false, error: 'could not reach the email provider' };
  }
}
