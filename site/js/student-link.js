/* Student link generator. The server stores a list of {name, classroom}
   — one kid or the whole family — under a short memorable code
   (sunny-otter) and the link is /l/<code> — easy to type straight off
   a printed flyer. */

(() => {
  const students = [{ n: '', c: '' }];
  const rowsEl = RH.qs('#sibling-rows');
  const form = RH.qs('#link-form');
  const errorEl = RH.qs('#link-error');

  const renderRows = () => {
    rowsEl.innerHTML = students.map((st, i) => `
      <div class="student-row" data-row="${i}">
        <div class="field">
          <label for="sl-name-${i}">Student name</label>
          <input type="text" id="sl-name-${i}" data-field="n" autocomplete="off" maxlength="${MAX_NAME}" placeholder="${RH.esc(RH.samplePlaceholder())}">
          <p class="error">Please enter your student&rsquo;s name.</p>
        </div>
        <div class="field">
          <label for="sl-class-${i}">Classroom</label>
          <select id="sl-class-${i}" data-field="c">
            <option value="">Choose a classroom&hellip;</option>
            ${RH.classroomOptions()}
          </select>
          <p class="error">Please choose your student&rsquo;s classroom.</p>
        </div>
        ${students.length > 1 ? '<button type="button" class="linklike remove-student">Remove</button>' : ''}
      </div>`).join('');
    students.forEach((st, i) => {
      RH.qs(`#sl-name-${i}`).value = st.n;
      RH.qs(`#sl-class-${i}`).value = st.c;
    });
    RH.qs('#add-sibling').hidden = students.length >= MAX_STUDENTS;
  };

  const onRowEdit = (e) => {
    const row = e.target.closest('.student-row');
    const field = e.target.dataset.field;
    if (!row || !field) return;
    students[Number(row.dataset.row)][field] = e.target.value;
    e.target.closest('.field').classList.remove('invalid');
  };
  rowsEl.addEventListener('input', onRowEdit);
  rowsEl.addEventListener('change', onRowEdit);
  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-student');
    if (!btn) return;
    students.splice(Number(btn.closest('.student-row').dataset.row), 1);
    renderRows();
  });
  RH.qs('#add-sibling').addEventListener('click', () => {
    if (students.length >= MAX_STUDENTS) return;
    students.push({ n: '', c: '' });
    renderRows();
    RH.qs(`#sl-name-${students.length - 1}`).focus();
  });
  renderRows();

  window.addEventListener('afterprint', () =>
    document.body.classList.remove('printing-card'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    let valid = true;
    students.forEach((st, i) => {
      const noName = !st.n.trim();
      const noClass = !st.c;
      RH.qs(`#sl-name-${i}`).closest('.field').classList.toggle('invalid', noName);
      RH.qs(`#sl-class-${i}`).closest('.field').classList.toggle('invalid', noClass);
      if (noName || noClass) valid = false;
    });
    if (!valid) return;
    const list = students.map((st) => ({ n: st.n.trim(), c: st.c }));

    let code = '';
    let serverError = '';
    try {
      const { ok, data } = await RH.postJson('/api/link', { students: list });
      if (ok && data.code) code = data.code;
      else serverError = data.error || '';
    } catch (err) { /* handled below */ }
    if (!code) {
      errorEl.textContent = serverError || 'We couldn’t create the link just now — please try again.';
      errorEl.hidden = false;
      return;
    }

    const headline = RH.nameList(list.map((st) => st.n));
    const rooms = [...new Set(list.map((st) => {
      const room = RH.classroomById(st.c);
      return `${room.teacher} · ${room.grade}`;
    }))];
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
