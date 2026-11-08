(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const CATEGORIES = {
    in: ['Salary', 'Freelance', 'Interest', 'Gift', 'Other'],
    out: ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Education', 'Other'],
  };

  const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  const state = { users: [], slug: null, type: 'in', filter: 'all', data: null };

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = (n) =>
    (n < 0 ? '-' : '') + '₹' +
    Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (d) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  let toastTimer;
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  async function api(path, options = {}) {
    const res = await fetch('/api' + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Something went wrong');
    return body;
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    $('themeBtn').innerHTML = theme === 'dark' ? SUN : MOON;
  }

  $('themeBtn').addEventListener('click', () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // ---------- users ----------
  async function loadUsers() {
    state.users = await api('/users');
    const has = state.users.length > 0;

    $('userSelect').classList.toggle('hidden', !has);
    $('welcome').classList.toggle('hidden', has);
    $('dashboard').classList.toggle('hidden', !has);
    if (!has) { state.slug = null; return; }

    $('userSelect').innerHTML = state.users
      .map((u) => `<option value="${esc(u.slug)}">${esc(u.name)}</option>`).join('');

    const saved = localStorage.getItem('user');
    const valid = (s) => state.users.some((u) => u.slug === s);
    state.slug = valid(state.slug) ? state.slug : valid(saved) ? saved : state.users[0].slug;
    $('userSelect').value = state.slug;
    await loadData();
  }

  $('userSelect').addEventListener('change', async (e) => {
    state.slug = e.target.value;
    localStorage.setItem('user', state.slug);
    try { await loadData(); } catch (err) { toast(err.message); }
  });

  function openUserDialog() {
    $('userName').value = '';
    $('userError').textContent = '';
    $('userDialog').showModal();
    $('userName').focus();
  }
  $('addUserBtn').addEventListener('click', openUserDialog);
  $('welcomeAdd').addEventListener('click', openUserDialog);
  $('cancelUser').addEventListener('click', () => $('userDialog').close());

  $('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const user = await api('/users', { method: 'POST', body: JSON.stringify({ name: $('userName').value }) });
      state.slug = user.slug;
      localStorage.setItem('user', user.slug);
      $('userDialog').close();
      await loadUsers();
      toast(`${user.name} added`);
    } catch (err) {
      $('userError').textContent = err.message;
    }
  });

  // ---------- transactions ----------
  async function loadData() {
    state.data = await api(`/users/${state.slug}/transactions`);
    render();
  }

  function setType(type) {
    state.type = type;
    document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    $('category').innerHTML = CATEGORIES[type].map((c) => `<option>${c}</option>`).join('');
    $('submitTx').textContent = type === 'in' ? 'Add money in' : 'Add money out';
  }

  document.querySelectorAll('.seg').forEach((b) =>
    b.addEventListener('click', () => setType(b.dataset.type)));

  $('txForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      state.data = await api(`/users/${state.slug}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          type: state.type,
          amount: $('amount').value,
          category: $('category').value,
          date: $('date').value,
          note: $('note').value,
        }),
      });
      $('amount').value = '';
      $('note').value = '';
      render();
      toast(state.type === 'in' ? 'Money in added' : 'Money out added');
    } catch (err) {
      toast(err.message);
    }
  });

  $('txBody').addEventListener('click', async (e) => {
    const id = e.target.dataset.del;
    if (!id || !confirm('Remove this transaction?')) return;
    try {
      state.data = await api(`/users/${state.slug}/transactions/${id}`, { method: 'DELETE' });
      render();
      toast('Transaction removed');
    } catch (err) {
      toast(err.message);
    }
  });

  $('filterTabs').addEventListener('click', (e) => {
    const f = e.target.dataset.filter;
    if (!f) return;
    state.filter = f;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.filter === f));
    renderTable();
  });

  // ---------- rendering ----------
  function render() {
    const { summary } = state.data;
    $('totalIn').textContent = money(summary.totalIn);
    $('totalOut').textContent = money(summary.totalOut);
    $('balance').textContent = money(summary.balance);
    $('balance').className = summary.balance < 0 ? 'out' : '';
    renderBreakdown(summary);
    renderTable();
  }

  function renderBreakdown(s) {
    const box = $('breakdown');
    if (!s.categories.length) {
      box.innerHTML = '<p class="empty">No spending recorded yet.</p>';
      return;
    }
    box.innerHTML = s.categories.map((c) => {
      const pct = s.totalOut ? Math.round((c.total / s.totalOut) * 100) : 0;
      return `<div class="cat-row">
        <div class="cat-top"><span>${esc(c.name)}</span><span>${money(c.total)}<em>${pct}%</em></span></div>
        <div class="bar"><span style="width:${Math.max(pct, 2)}%"></span></div>
      </div>`;
    }).join('');
  }

  function renderTable() {
    const rows = state.data.transactions.filter((t) => state.filter === 'all' || t.type === state.filter);
    $('empty').classList.toggle('hidden', rows.length > 0);
    $('txBody').innerHTML = rows.map((t) => `<tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="pill ${t.type}">${t.type === 'in' ? 'In' : 'Out'}</span></td>
      <td>${esc(t.category)}</td>
      <td class="note">${esc(t.note) || '<span class="muted">—</span>'}</td>
      <td class="amt ${t.type}">${t.type === 'in' ? '+' : '−'}${money(t.amount)}</td>
      <td><button class="link-btn danger" data-del="${esc(t.id)}">Remove</button></td>
    </tr>`).join('');
  }

  // ---------- start ----------
  applyTheme(document.documentElement.getAttribute('data-theme'));
  setType('in');
  $('date').value = today();
  loadUsers().catch((err) => toast(err.message));
})();