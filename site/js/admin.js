/* Mission Control: the PTA's three reports on one page, behind the
   admin key. The key lives in this tab's sessionStorage and travels
   only as a Bearer header — never in a URL — and downloads fetch the
   CSV the same way and save it from a blob. */

(() => {
  const { html } = RH;
  const form = RH.qs('#key-form');
  const reports = RH.qs('#reports');
  const errorEl = RH.qs('#admin-error');
  const keyOf = () => sessionStorage.getItem('adminKey') || '';

  /* Column ids -> what the PTA reads, and how a cell prints. */
  const LABELS = {
    grade: 'Grade', teacher: 'Teacher', students: 'Class size', gifts: 'Gifts',
    rockets: 'Rockets', participation_pct: 'Participation', raised: 'Raised', shirts: 'Shirts',
    student: 'Rocket', size: 'Size', quantity: 'Qty',
  };
  const NUMERIC = new Set(['students', 'gifts', 'rockets', 'participation_pct', 'raised', 'shirts', 'quantity']);
  const show = (col, v) => (col === 'raised' ? RH.moneyCents(Math.round(Number(v) * 100))
    : col === 'participation_pct' ? `${v}%` : v);

  /* A sortable table: click a header to sort by it, again to flip.
     `sorted` names the column the server already ordered by. */
  const renderTable = (table, { columns, rows }, sort = { col: null, desc: true }) => {
    let list = rows;
    if (sort.col !== null) {
      const i = columns.indexOf(sort.col);
      const num = NUMERIC.has(sort.col);
      list = [...rows].sort((a, b) => {
        const d = num ? Number(a[i]) - Number(b[i]) : String(a[i]).localeCompare(String(b[i]));
        return sort.desc ? -d : d;
      });
    }
    table.innerHTML = html`
      <thead><tr>${columns.map((col) => html`
        <th scope="col" class="${NUMERIC.has(col) ? 'num' : ''}"${sort.col === col ? html` aria-sort="${sort.desc ? 'descending' : 'ascending'}"` : ''}>
          <button type="button" data-sort="${col}">${LABELS[col] || col}</button>
        </th>`)}
      </tr></thead>
      <tbody>${list.length ? list.map((row) => html`
        <tr>${row.map((v, i) => html`<td class="${NUMERIC.has(columns[i]) ? 'num' : ''}">${show(columns[i], v)}</td>`)}</tr>`)
        : html`<tr><td colspan="${columns.length}" class="empty">Nothing here yet.</td></tr>`}
      </tbody>`;
    table.querySelectorAll('[data-sort]').forEach((btn) => btn.addEventListener('click', () => {
      const col = btn.dataset.sort;
      renderTable(table, { columns, rows }, { col, desc: sort.col === col ? !sort.desc : NUMERIC.has(col) });
    }));
  };

  const authed = (path, init = {}) => fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${keyOf()}`, ...(init.headers || {}) },
  });

  /* ---- gifts the PTA takes in by hand ---- */

  const offErr = RH.qs('#off-error');
  const offDone = RH.qs('#off-done');

  /* The two pickers hold the same options the donate form does, so a
     recorded check can only ever name a real priority and a real
     classroom — the server checks again regardless. */
  RH.qs('#off-priority').innerHTML = html`${[...PRIORITIES, SUPPORT_ALL].map((p) =>
    html`<option value="${p.id}">${p.name}</option>`)}`;
  RH.qs('#off-class').innerHTML = html`<option value="">No Rocket named</option>${RH.classroomOptions()}`;

  const renderOffline = (rows) => {
    const table = RH.qs('#offline-table');
    table.innerHTML = html`
      <thead><tr>
        <th scope="col">Recorded</th><th scope="col">Name</th><th scope="col">Rocket</th>
        <th scope="col">Priority</th><th scope="col" class="num">Amount</th><th scope="col"></th>
      </tr></thead>
      <tbody>${rows.length ? rows.map((r) => html`
        <tr>
          <td>${new Date(r.created * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
          <td>${r.donor}</td>
          <td>${r.rockets || '—'}</td>
          <td>${r.priority}</td>
          <td class="num">${RH.money(r.amount)}</td>
          <td><button type="button" class="linklike" data-remove="${r.id}">Remove</button></td>
        </tr>`)
        : html`<tr><td colspan="6" class="empty">Nothing recorded by hand yet.</td></tr>`}
      </tbody>`;
  };

  RH.qs('#offline-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    offErr.hidden = true;
    offDone.hidden = true;
    const btn = RH.qs('#off-save');
    const classroom = RH.qs('#off-class').value;
    const student = RH.qs('#off-student').value.trim();
    const body = {
      amount: Number(RH.qs('#off-amount').value),
      priority: RH.qs('#off-priority').value,
      donorName: RH.qs('#off-donor').value.trim(),
      visibility: RH.qs('#off-anon').checked ? 'anon' : 'public',
      students: classroom ? [{ c: classroom, n: student }] : [],
    };
    btn.disabled = true;
    const { ok, data: res } = await RH.postJson('/api/offline-gift', body, {
      authorization: `Bearer ${keyOf()}`,
    }).catch(() => ({ ok: false, data: {} }));
    btn.disabled = false;
    if (!ok) {
      offErr.textContent = res.error || 'That didn’t save — please try again.';
      offErr.hidden = false;
      return;
    }
    offDone.textContent = `Recorded ${RH.money(body.amount)}. It’s on the board now.`;
    offDone.hidden = false;
    /* Clear the Rocket too, not just the name: a classroom left
       selected would quietly credit the next check to the wrong one. */
    RH.qs('#off-amount').value = '';
    RH.qs('#off-donor').value = '';
    RH.qs('#off-class').value = '';
    RH.qs('#off-student').value = '';
    RH.qs('#off-anon').checked = false;
    load();
  });

  /* Removing is the reason this list exists: a wrong amount has to be
     fixable here rather than by asking someone with database access. */
  RH.qs('#offline-table').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    btn.disabled = true;
    const res = await authed(`/api/offline-gift?id=${encodeURIComponent(btn.dataset.remove)}`, { method: 'DELETE' })
      .catch(() => null);
    if (!res || !res.ok) {
      btn.disabled = false;
      fail('That gift didn’t come off — please refresh and try again.');
      return;
    }
    load();
  });

  /* ---- fixing a mistyped Rocket ---- */

  /* The picker is built from the Rockets sheet the page already has,
     so it can only ever offer names that really are in that class. */
  let rockets = { rows: [], columns: [] };
  let noNameLabel = '';
  const teacherOf = (id) => (CLASSROOMS.find((c) => c.id === id) || {}).teacher || '';

  const namesIn = (classroomId) => {
    const teacher = teacherOf(classroomId);
    return rockets.rows.filter((r) => r[1] === teacher).map((r) => r[2]);
  };

  const renderRenameNames = () => {
    const names = namesIn(RH.qs('#rn-class').value);
    RH.qs('#rn-from').innerHTML = names.length
      ? html`${names.map((n) => html`<option value="${n}">${n}</option>`)}`
      : html`<option value="">No Rockets in this class yet</option>`;
    // Merge targets: the other names already in the room.
    RH.qs('#rn-names').innerHTML = html`${names
      .filter((n) => n !== noNameLabel)
      .map((n) => html`<option value="${n}"></option>`)}`;
  };

  RH.qs('#rn-class').innerHTML = html`${RH.classroomOptions()}`;
  RH.qs('#rn-class').addEventListener('change', renderRenameNames);

  RH.qs('#rename-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const failEl = RH.qs('#rn-error');
    const doneEl = RH.qs('#rn-done');
    failEl.hidden = true;
    doneEl.hidden = true;
    const picked = RH.qs('#rn-from').value;
    const to = RH.qs('#rn-to').value.trim();
    if (!picked && picked !== noNameLabel) {
      failEl.textContent = 'Pick the name to fix first.';
      failEl.hidden = false;
      return;
    }
    if (!to) {
      failEl.textContent = 'Type the name it should be.';
      failEl.hidden = false;
      return;
    }
    const btn = RH.qs('#rn-save');
    btn.disabled = true;
    const { ok, data: res } = await RH.postJson('/api/rename-rocket', {
      classroom: RH.qs('#rn-class').value,
      // An unnamed credit is stored as an empty name, not as the label.
      from: picked === noNameLabel ? '' : picked,
      to,
    }, { authorization: `Bearer ${keyOf()}` }).catch(() => ({ ok: false, data: {} }));
    btn.disabled = false;
    if (!ok) {
      failEl.textContent = res.error || 'That didn’t save — please try again.';
      failEl.hidden = false;
      return;
    }
    doneEl.textContent = `Moved ${res.moved} gift${res.moved === 1 ? '' : 's'} to ${res.to}.`;
    doneEl.hidden = false;
    RH.qs('#rn-to').value = '';
    load();
  });

  /* ---- the Thursday emails ---- */

  /* The address list is edited as plain text — 20 lines a PTA volunteer
     can paste from the office directory — and matched to the roster on
     surname, so "Ms. Convery" and "Miss Convery" are the same teacher. */
  const surnameOf = (name) => String(name).replace(/^(Mrs\.|Mr\.|Ms\.|Miss)\s+/i, '').trim().toLowerCase();
  const roomBySurname = {};
  CLASSROOMS.forEach((c) => { roomBySurname[surnameOf(c.teacher)] = c; });

  const parseList = (text) => {
    const rows = [];
    const bad = [];
    text.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      const [who, ...rest] = line.split(',');
      const room = roomBySurname[surnameOf(who || '')];
      const email = rest.join(',').trim();
      if (room && email) rows.push({ c: room.id, e: email });
      else bad.push(line.trim());
    });
    return { rows, bad };
  };

  const renderDigest = (digest) => {
    const emails = (digest && digest.emails) || {};
    const history = (digest && digest.history) || [];
    RH.qs('#digest-list').value = CLASSROOMS
      .filter((c) => emails[c.id])
      .map((c) => `${c.teacher}, ${emails[c.id]}`).join('\n');

    const withAddress = CLASSROOMS.filter((c) => emails[c.id]).length;
    RH.qs('#digest-state').textContent = !digest || !digest.ready
      ? 'Email isn’t switched on for this site yet, so nothing will send.'
      : `${withAddress} of ${CLASSROOMS.length} classes have an address. The next send is Thursday at 5pm.`;

    const last = {};
    history.forEach((row) => { if (!last[row.classroom]) last[row.classroom] = row; });
    const table = RH.qs('#digest-table');
    const any = Object.keys(last).length;
    table.innerHTML = html`
      <thead><tr>
        <th scope="col">Class</th><th scope="col">Address</th><th scope="col">Last sent</th>
      </tr></thead>
      <tbody>${CLASSROOMS.map((c) => {
        const row = last[c.id];
        return html`<tr>
          <td>${c.teacher}</td>
          <td>${emails[c.id] || '—'}</td>
          <td>${row
            ? `${new Date(row.sent * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${row.status === 'sent' ? '' : ` (${row.status})`}`
            : (any ? 'not yet' : '—')}</td>
        </tr>`;
      })}
      </tbody>`;
  };

  RH.qs('#digest-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const field = RH.qs('#digest-list').closest('.field');
    const failEl = RH.qs('#digest-fail');
    const doneEl = RH.qs('#digest-done');
    field.classList.remove('invalid');
    failEl.hidden = true;
    doneEl.hidden = true;
    const { rows, bad } = parseList(RH.qs('#digest-list').value);
    if (bad.length) {
      RH.qs('#digest-error').textContent = `We couldn’t read: ${bad.join(' · ')}`;
      field.classList.add('invalid');
      return;
    }
    const btn = RH.qs('#digest-save');
    btn.disabled = true;
    const { ok, data: res } = await RH.postJson('/api/teacher-emails', { rows }, {
      authorization: `Bearer ${keyOf()}`,
    }).catch(() => ({ ok: false, data: {} }));
    btn.disabled = false;
    if (!ok) {
      failEl.textContent = res.error || 'That didn’t save — please try again.';
      failEl.hidden = false;
      return;
    }
    doneEl.textContent = `Saved. ${res.saved} class${res.saved === 1 ? '' : 'es'} will get an email Thursday.`;
    doneEl.hidden = false;
    load();
  });

  RH.qs('#digest-send-test').addEventListener('click', async () => {
    const failEl = RH.qs('#digest-fail');
    const doneEl = RH.qs('#digest-done');
    failEl.hidden = true;
    doneEl.hidden = true;
    const btn = RH.qs('#digest-send-test');
    btn.disabled = true;
    const { ok, data: res } = await RH.postJson('/api/digest-test', {
      to: RH.qs('#digest-to').value.trim(),
    }, { authorization: `Bearer ${keyOf()}` }).catch(() => ({ ok: false, data: {} }));
    btn.disabled = false;
    if (!ok) {
      failEl.textContent = res.error || 'The sample didn’t send — please try again.';
      failEl.hidden = false;
      return;
    }
    doneEl.textContent = 'Sample sent. Check your inbox.';
    doneEl.hidden = false;
  });

  const fail = (msg) => { errorEl.textContent = msg; errorEl.hidden = false; };

  const load = async () => {
    errorEl.hidden = true;
    let res;
    try { res = await authed('/api/admin.json'); } catch { fail('We couldn’t reach the Rally — check your connection and try again.'); return; }
    if (res.status === 401) {
      sessionStorage.removeItem('adminKey');
      form.hidden = false;
      reports.hidden = true;
      RH.qs('#key-form .field').classList.add('invalid');
      return;
    }
    if (!res.ok) { fail('The reports didn’t load — please try again in a minute.'); return; }
    const data = await res.json();
    form.hidden = true;
    reports.hidden = false;
    const shirts = data.classrooms.rows.reduce((n, row) => n + Number(row[row.length - 1]), 0);
    RH.qs('#admin-totals').innerHTML = html`
      <div class="total"><span class="num">${RH.money(data.campaign.raised)}</span><span class="label">raised of ${RH.money(data.campaign.goal)}</span></div>
      <div class="total"><span class="num">${data.campaign.gifts}</span><span class="label">family gifts</span></div>
      <div class="total"><span class="num">${shirts}</span><span class="label">shirts ordered</span></div>`;
    RH.qs('#as-of').textContent = `As of ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`;
    renderTable(RH.qs('#classrooms-table'), data.classrooms, { col: 'participation_pct', desc: true });
    renderTable(RH.qs('#students-table'), data.students);
    renderTable(RH.qs('#shirts-table'), data.shirts);
    renderOffline(data.offline || []);
    renderDigest(data.digest);
    rockets = data.students;
    noNameLabel = data.noName || '';
    renderRenameNames();
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = RH.qs('#admin-key').value.trim();
    RH.qs('#key-form .field').classList.remove('invalid');
    if (!key) return;
    sessionStorage.setItem('adminKey', key);
    load();
  });
  RH.qs('#admin-key').addEventListener('input', () => RH.qs('#key-form .field').classList.remove('invalid'));
  RH.qs('#refresh-btn').addEventListener('click', load);
  RH.qs('#close-btn').addEventListener('click', () => {
    sessionStorage.removeItem('adminKey');
    RH.qs('#admin-key').value = '';
    reports.hidden = true;
    form.hidden = false;
  });

  /* Downloads go through fetch so the key stays out of the address
     bar and the server's request log. */
  reports.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-download]');
    if (!btn) return;
    const name = btn.dataset.download;
    btn.disabled = true;
    try {
      const res = await authed(`/api/${name}.csv`);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: `rocket-rally-${name}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      fail(`${name}.csv didn’t download — please try again.`);
    }
    btn.disabled = false;
  });

  if (keyOf()) load();
})();
