const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'database');
const INDEX_FILE = path.join(DB_DIR, 'database.txt');
const HEADER = '# id|date|type|amount|category|note\n';

const STATIC = {
  '/': ['app.html', 'text/html; charset=utf-8'],
  '/app.html': ['app.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'application/javascript; charset=utf-8'],
};

fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '');

// ---------- helpers ----------
const httpErr = (status, message) => Object.assign(new Error(message), { status });
const clean = (s) => String(s ?? '').replace(/[|\r\n\t]+/g, ' ').trim();
const slugify = (n) =>
  n.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
const userFile = (slug) => path.join(DB_DIR, `user_${slug}.txt`);

// One write at a time per key, so simultaneous requests never corrupt a file
const queues = new Map();
function locked(key, task) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(task);
  queues.set(key, next.catch(() => {}));
  return next;
}

// ---------- database layer ----------
async function readUsers() {
  const raw = await fsp.readFile(INDEX_FILE, 'utf8');
  return raw.split('\n').filter(Boolean).map((line) => {
    const [slug, name, created] = line.split('|');
    return { slug, name, created };
  });
}

async function readTx(slug) {
  let raw;
  try {
    raw = await fsp.readFile(userFile(slug), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return raw.split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [id, date, type, amount, category, note] = l.split('|');
      return { id, date, type, amount: Number(amount), category, note: note || '' };
    });
}

// ---------- logic / evaluation ----------
function summarize(list) {
  let inC = 0, outC = 0;
  const cats = {};
  for (const t of list) {
    const cents = Math.round(t.amount * 100);
    if (t.type === 'in') inC += cents;
    else { outC += cents; cats[t.category] = (cats[t.category] || 0) + cents; }
  }
  return {
    totalIn: inC / 100,
    totalOut: outC / 100,
    balance: (inC - outC) / 100,
    count: list.length,
    categories: Object.entries(cats)
      .map(([name, c]) => ({ name, total: c / 100 }))
      .sort((a, b) => b.total - a.total),
  };
}

async function getData(slug) {
  const list = (await readTx(slug)).reverse().sort((a, b) => b.date.localeCompare(a.date));
  return { transactions: list, summary: summarize(list) };
}

function addUser(rawName) {
  const name = clean(rawName).slice(0, 40);
  const slug = slugify(name);
  if (!name || !slug) throw httpErr(400, 'Enter a name using letters or numbers');
  return locked('index', async () => {
    const users = await readUsers();
    if (users.some((u) => u.slug === slug)) throw httpErr(409, 'A user with this name already exists');
    const created = new Date().toISOString();
    await fsp.writeFile(userFile(slug), HEADER, { flag: 'wx' })
      .catch((e) => { if (e.code !== 'EEXIST') throw e; });
    await fsp.appendFile(INDEX_FILE, `${slug}|${name}|${created}\n`);
    return { slug, name, created };
  });
}

function addTx(slug, body) {
  const type = body.type;
  if (type !== 'in' && type !== 'out') throw httpErr(400, 'Choose money in or money out');

  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9)
    throw httpErr(400, 'Enter an amount greater than zero');

  const date = String(body.date || '');
  const parsed = new Date(date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed) || parsed.toISOString().slice(0, 10) !== date)
    throw httpErr(400, 'Enter a valid date');

  const category = clean(body.category).slice(0, 30) || 'Other';
  const note = clean(body.note).slice(0, 80);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const line = [id, date, type, amount.toFixed(2), category, note].join('|') + '\n';

  return locked(slug, async () => {
    await fsp.appendFile(userFile(slug), line);
    return getData(slug);
  });
}

function deleteTx(slug, id) {
  if (!/^[a-z0-9]{4,20}$/.test(id)) throw httpErr(400, 'Invalid transaction');
  return locked(slug, async () => {
    const file = userFile(slug);
    const lines = (await fsp.readFile(file, 'utf8')).split('\n');
    const kept = lines.filter((l) => !l.startsWith(id + '|'));
    if (kept.length === lines.length) throw httpErr(404, 'Transaction not found');
    const tmp = file + '.tmp';
    await fsp.writeFile(tmp, kept.join('\n'));
    await fsp.rename(tmp, file);
    return getData(slug);
  });
}

// ---------- HTTP layer ----------
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '', tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      data += chunk;
      if (data.length > 10000) { tooBig = true; reject(httpErr(413, 'Request too large')); }
    });
    req.on('end', () => {
      if (tooBig) return;
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(httpErr(400, 'Invalid JSON')); }
    });
  });
}

async function api(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean); // api, users, :slug, transactions, :id
  const m = req.method;
  if (parts[1] !== 'users') throw httpErr(404, 'Not found');

  if (parts.length === 2) {
    if (m === 'GET') return send(res, 200, await readUsers());
    if (m === 'POST') return send(res, 201, await addUser((await readBody(req)).name));
  }

  const slug = parts[2];
  if (!/^[a-z0-9-]{1,30}$/.test(slug)) throw httpErr(400, 'Invalid user');
  if (!(await readUsers()).some((u) => u.slug === slug)) throw httpErr(404, 'User not found');

  if (parts[3] === 'transactions') {
    if (parts.length === 4 && m === 'GET') return send(res, 200, await getData(slug));
    if (parts.length === 4 && m === 'POST') return send(res, 201, await addTx(slug, await readBody(req)));
    if (parts.length === 5 && m === 'DELETE') return send(res, 200, await deleteTx(slug, parts[4]));
  }
  throw httpErr(404, 'Not found');
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && STATIC[pathname]) {
      const [file, type] = STATIC[pathname];
      const content = await fsp.readFile(path.join(__dirname, file));
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      return res.end(content);
    }
    if (pathname.startsWith('/api/')) return await api(req, res, pathname);
    send(res, 404, { message: 'Not found' });
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { message: e.status ? e.message : 'Server error' });
  }
}).listen(PORT, () => console.log(`Expense Tracker running at http://localhost:${PORT}`));