/* Student link generator. The server stores a list of {name, classroom}
   — one kid or the whole family — under a short memorable code
   (sunny-otter) and the link is /l/<code> — easy to type straight off
   a printed flyer. */

/* The rows' shape: name first, and required — the link is printed with
   the names on it. scripts/skeleton.js bakes the empty first row into
   student-link.html from it (linkView()), so the first paint is
   complete; the live render below repeats the same markup. */
const LINK_ROWS = {
  prefix: 'sibling',
  nameFirst: true,
  nameError: 'Please enter your student&rsquo;s name.',
  classError: 'Please choose your student&rsquo;s classroom.',
};
const linkView = () => ({
  rows: RH.studentRowsMarkup([{ c: '', n: '' }], { ...LINK_ROWS, placeholder: RH.samplePlaceholder(0) }),
});

/* Browser wiring — absent when scripts/skeleton.js evaluates this file. */
if (typeof document !== 'undefined') (() => {
  const form = RH.qs('#link-form');
  const errorEl = RH.qs('#link-error');

  const rows = RH.studentRows({
    rowsEl: RH.qs('#sibling-rows'),
    addBtn: RH.qs('#add-sibling'),
    ...LINK_ROWS,
  });
  rows.render();

  window.addEventListener('afterprint', () =>
    document.body.classList.remove('printing-card'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    if (!rows.validate((st) => ({ n: !st.n.trim(), c: !st.c }))) return;
    const list = rows.students.map((st) => ({ n: st.n.trim(), c: st.c }));
    // One request at a time: a double-tap must not race two results.
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    let code = '';
    let serverError = '';
    try {
      const { ok, data } = await RH.postJson('/api/link', { students: list });
      if (ok && data.code) code = data.code;
      else serverError = data.error || '';
    } catch (err) { /* handled below */ }
    submitBtn.disabled = false;
    if (!code) {
      errorEl.textContent = serverError || 'We couldn’t create the link just now — please try again.';
      errorEl.hidden = false;
      return;
    }

    const headline = RH.nameList(list.map((st) => st.n));
    const rooms = RH.roomLabels(list);
    const link = new URL(`/l/${code}`, location.origin).toString();

    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const dataUrl = qr.createDataURL(4, 4);

    RH.qs('#qr-img').src = dataUrl;
    RH.qs('#result-title').textContent = `${headline}’s Rally link`;
    RH.qs('#link-line').textContent = link;

    RH.qs('.pc-name').textContent = headline;
    RH.qs('.pc-class').innerHTML = rooms.map(RH.esc).join('<br>');
    RH.qs('.pc-qr').src = dataUrl;
    RH.qs('.pc-url').textContent = link.replace(/^https?:\/\//, '');

    const result = RH.qs('#result');
    result.hidden = false;
    result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const copyBtn = RH.qs('#copy-btn');
    copyBtn.hidden = !navigator.clipboard; // plain http, some in-app browsers
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(link).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1600);
      }).catch(() => { copyBtn.textContent = 'Select the link above to copy'; });
    };

    const shareBtn = RH.qs('#share-btn');
    if (navigator.share) {
      shareBtn.hidden = false;
      shareBtn.onclick = () => navigator.share({
        title: `Help ${headline} fund the Rocket Rally`,
        url: link,
      }).catch(() => {});
    } else {
      shareBtn.hidden = true;
    }

    RH.qs('#print-btn').onclick = () => {
      document.body.classList.add('printing-card');
      window.print();
    };
  });
})();
