/* "Email me my Rocket link" for a family who lost the thank-you page.
   The server answers the same way whether or not that address ever
   gave, so this page says the same thing either way — anything else
   would let a stranger ask the site who donated. */

(() => {
  const form = RH.qs('#link-form');
  const field = RH.qs('#link-field');
  const failEl = RH.qs('#link-error');
  const doneEl = RH.qs('#link-done');

  RH.qs('#link-email').addEventListener('input', () => field.classList.remove('invalid'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    failEl.hidden = true;
    doneEl.hidden = true;
    field.classList.remove('invalid');
    const email = RH.qs('#link-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      field.classList.add('invalid');
      return;
    }
    const btn = RH.qs('#link-send');
    btn.disabled = true;
    const { ok } = await RH.postJson('/api/my-link', { email })
      .catch(() => ({ ok: false }));
    btn.disabled = false;
    if (!ok) {
      failEl.textContent = 'We couldn’t reach the Rally — check your connection and try again.';
      failEl.hidden = false;
      return;
    }
    doneEl.textContent = 'If that address gave to the Rally, the link is on its way. '
      + 'Check your inbox, and your spam folder just in case.';
    doneEl.hidden = false;
    form.reset();
  });
})();
