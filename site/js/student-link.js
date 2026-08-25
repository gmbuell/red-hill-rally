/* Student link generator. The server stores {name, classroom} under a
   short memorable code (sunny-otter) and the link is /l/<code> — easy
   to type straight off a printed flyer. */

(() => {
  RH.qs('#sl-name').placeholder =
    `e.g. ${Math.random() < 0.5 ? 'Teddy' : 'Finn'} Buell`;

  const sel = RH.qs('#sl-class');
  sel.insertAdjacentHTML('beforeend', CLASSROOMS.map((c) =>
    `<option value="${c.id}">${c.teacher} (${c.grade})</option>`).join(''));

  const form = RH.qs('#link-form');
  const errorEl = RH.qs('#link-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const name = RH.qs('#sl-name').value.trim();
    const classId = sel.value;

    RH.qs('#f-name').classList.toggle('invalid', !name);
    RH.qs('#f-class').classList.toggle('invalid', !classId);
    if (!name || !classId) return;

    let code = '';
    let serverError = '';
    try {
      const res = await fetch('/api/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ n: name, c: classId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code) code = data.code;
      else serverError = data.error || '';
    } catch (err) { /* handled below */ }
    if (!code) {
      errorEl.textContent = serverError || 'We couldn’t create the link just now — please try again.';
      errorEl.hidden = false;
      return;
    }

    const room = RH.classroomById(classId);
    const link = new URL(`/l/${code}`, location.origin).toString();

    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    const dataUrl = qr.createDataURL(4, 4);

    RH.qs('#qr-img').src = dataUrl;
    RH.qs('#result-title').textContent = `${name}’s Rally link`;
    RH.qs('#link-line').textContent = link;

    const fill = (sel, fn) =>
      document.querySelectorAll(sel).forEach((el) => fn(el));
    fill('.pc-name', (el) => { el.textContent = name; });
    fill('.pc-class', (el) => { el.textContent = `${room.teacher} · ${room.grade}`; });
    fill('.pc-qr', (el) => { el.src = dataUrl; });
    fill('.pc-url', (el) => { el.textContent = link.replace(/^https?:\/\//, ''); });

    const result = RH.qs('#result');
    result.hidden = false;
    result.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const copyBtn = RH.qs('#copy-btn');
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(link).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1600);
      });
    };

    const shareBtn = RH.qs('#share-btn');
    if (navigator.share) {
      shareBtn.hidden = false;
      shareBtn.onclick = () => navigator.share({
        title: `Help ${name} fund the Rocket Rally`,
        url: link,
      }).catch(() => {});
    } else {
      shareBtn.hidden = true;
    }

    RH.qs('#print-btn').onclick = () => {
      document.body.classList.add('printing-card');
      window.print();
    };
    window.addEventListener('afterprint', () =>
      document.body.classList.remove('printing-card'));
  });
})();
