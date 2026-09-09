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
    participation_pct: 'Participation', raised: 'Raised', shirts: 'Shirts',
    student: 'Rocket', size: 'Size', quantity: 'Qty',
  };
  const NUMERIC = new Set(['students', 'gifts', 'participation_pct', 'raised', 'shirts', 'quantity']);
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

  const authed = (path) => fetch(path, { headers: { authorization: `Bearer ${keyOf()}` } });

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
