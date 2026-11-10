const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const dbDir = path.join(__dirname, 'data');
const upDir = path.join(dbDir, 'uploads');
fs.mkdirSync(upDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL REFERENCES companies(id),
  email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL,
  name TEXT NOT NULL, address TEXT, status TEXT DEFAULT 'Active', notes TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, property_id INTEGER NOT NULL,
  category TEXT NOT NULL, stored_name TEXT NOT NULL, original_name TEXT NOT NULL,
  mime TEXT, size INTEGER, uploaded_by TEXT, uploaded_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL,
  company_name TEXT NOT NULL, trade TEXT NOT NULL, contact_name TEXT, phone TEXT, email TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL,
  property_id INTEGER NOT NULL, sub_id INTEGER NOT NULL,
  scheduled_date TEXT, status TEXT DEFAULT 'Scheduled', notes TEXT,
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, sub_id INTEGER NOT NULL,
  stars INTEGER NOT NULL, comment TEXT, rated_by TEXT, created_at TEXT DEFAULT (datetime('now')));
`);

const app = express();
app.use(express.json());
app.use(session({
  secret: 'builders-harbor-secret-change-me',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 }
}));

function user(req) { return req.session.user || null; }
function requireAuth(req, res, next) { if (user(req)) return next(); res.status(401).json({ error: 'Not logged in' }); }
function requireOwner(req, res, next) {
  const u = user(req);
  if (u && u.role === 'owner') return next();
  res.status(403).json({ error: 'Only the account owner can do that' });
}
function cid(req) { return user(req).company_id; }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, upDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + path.extname(file.originalname || ''))
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

/* ---------- auth ---------- */
app.post('/api/auth/register', (req, res) => {
  const { company_name, name, email, password } = req.body || {};
  if (!company_name || !name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(400).json({ error: 'That email is already registered' });
  const c = db.prepare('INSERT INTO companies (name) VALUES (?)').run(company_name);
  const hash = bcrypt.hashSync(String(password), 10);
  const u = db.prepare('INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(Number(c.lastInsertRowid), String(email).toLowerCase(), hash, name, 'owner');
  req.session.user = { id: Number(u.lastInsertRowid), company_id: Number(c.lastInsertRowid), name, email: String(email).toLowerCase(), role: 'owner' };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash))
    return res.status(401).json({ error: 'Wrong email or password' });
  req.session.user = { id: u.id, company_id: u.company_id, name: u.name, email: u.email, role: u.role };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ ok: true })); });

app.get('/api/me', (req, res) => {
  const u = user(req);
  if (!u) return res.json({ user: null });
  const c = db.prepare('SELECT name FROM companies WHERE id = ?').get(u.company_id);
  res.json({ user: u, company: c ? c.name : '' });
});

/* ---------- team ---------- */
app.get('/api/team', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users WHERE company_id = ? ORDER BY role DESC, name').all(cid(req)));
});
app.post('/api/team', requireOwner, (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(400).json({ error: 'That email is already registered' });
  const hash = bcrypt.hashSync(String(password), 10);
  const r = db.prepare('INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(cid(req), String(email).toLowerCase(), hash, name, 'employee');
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.delete('/api/team/:id', requireOwner, (req, res) => {
  const t = db.prepare('SELECT * FROM users WHERE id = ? AND company_id = ?').get(req.params.id, cid(req));
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.role === 'owner') return res.status(400).json({ error: "You can't remove the owner" });
  db.prepare('DELETE FROM users WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

/* ---------- properties ---------- */
app.get('/api/properties', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM files f WHERE f.property_id = p.id) AS file_count,
      (SELECT COUNT(*) FROM assignments a WHERE a.property_id = p.id AND a.status != 'Done') AS open_jobs
    FROM properties p WHERE p.company_id = ? ORDER BY p.created_at DESC`).all(cid(req)));
});
app.post('/api/properties', requireAuth, (req, res) => {
  const { name, address, status, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Property name is required' });
  const r = db.prepare('INSERT INTO properties (company_id, name, address, status, notes) VALUES (?, ?, ?, ?, ?)')
    .run(cid(req), name, address || '', status || 'Active', notes || '');
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
function getProperty(req, res) {
  const p = db.prepare('SELECT * FROM properties WHERE id = ? AND company_id = ?').get(req.params.id, cid(req));
  if (!p) { res.status(404).json({ error: 'Not found' }); return null; }
  return p;
}
app.get('/api/properties/:id', requireAuth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const files = db.prepare('SELECT id, category, original_name, mime, size, uploaded_by, uploaded_at FROM files WHERE property_id = ? ORDER BY uploaded_at DESC').all(p.id);
  const assignments = db.prepare(`
    SELECT a.*, s.company_name, s.trade FROM assignments a JOIN subs s ON s.id = a.sub_id
    WHERE a.property_id = ? ORDER BY a.scheduled_date`).all(p.id);
  res.json({ property: p, files, assignments });
});
app.put('/api/properties/:id', requireAuth, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  const { name, address, status, notes } = req.body || {};
  db.prepare('UPDATE properties SET name = ?, address = ?, status = ?, notes = ? WHERE id = ?')
    .run(name || p.name, address ?? p.address, status || p.status, notes ?? p.notes, p.id);
  res.json({ ok: true });
});
app.delete('/api/properties/:id', requireOwner, (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  for (const f of db.prepare('SELECT * FROM files WHERE property_id = ?').all(p.id)) {
    try { fs.unlinkSync(path.join(upDir, f.stored_name)); } catch (e) {}
  }
  db.prepare('DELETE FROM files WHERE property_id = ?').run(p.id);
  db.prepare('DELETE FROM assignments WHERE property_id = ?').run(p.id);
  db.prepare('DELETE FROM properties WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

/* ---------- files ---------- */
app.post('/api/properties/:id/files', requireAuth, upload.single('file'), (req, res) => {
  const p = getProperty(req, res); if (!p) return;
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  const category = req.body.category || 'Other';
  db.prepare(`INSERT INTO files (company_id, property_id, category, stored_name, original_name, mime, size, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(cid(req), p.id, category, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, user(req).name);
  res.json({ ok: true });
});
app.get('/api/files/:id/download', requireAuth, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ? AND company_id = ?').get(req.params.id, cid(req));
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.download(path.join(upDir, f.stored_name), f.original_name);
});
app.delete('/api/files/:id', requireOwner, (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id = ? AND company_id = ?').get(req.params.id, cid(req));
  if (!f) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(upDir, f.stored_name)); } catch (e) {}
  db.prepare('DELETE FROM files WHERE id = ?').run(f.id);
  res.json({ ok: true });
});

/* ---------- subs ---------- */
const SUB_SELECT = `
  SELECT s.*,
    (SELECT ROUND(AVG(r.stars), 1) FROM ratings r WHERE r.sub_id = s.id) AS avg_rating,
    (SELECT COUNT(*) FROM ratings r WHERE r.sub_id = s.id) AS rating_count
  FROM subs s`;
app.get('/api/subs', requireAuth, (req, res) => {
  let rows = db.prepare(`${SUB_SELECT} WHERE s.company_id = ? ORDER BY s.company_name`).all(cid(req));
  const q = (req.query.q || '').toLowerCase().trim();
  const trade = (req.query.trade || '').trim();
  if (trade) rows = rows.filter(r => r.trade.toLowerCase() === trade.toLowerCase());
  if (q) rows = rows.filter(r =>
    [r.company_name, r.trade, r.contact_name, r.phone, r.email, r.notes]
      .some(v => (v || '').toLowerCase().includes(q)));
  res.json(rows);
});
app.post('/api/subs', requireAuth, (req, res) => {
  const { company_name, trade, contact_name, phone, email, notes } = req.body || {};
  if (!company_name || !trade) return res.status(400).json({ error: 'Company name and trade are required' });
  const r = db.prepare('INSERT INTO subs (company_id, company_name, trade, contact_name, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(cid(req), company_name, trade, contact_name || '', phone || '', email || '', notes || '');
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
function getSub(req, res) {
  const s = db.prepare(`${SUB_SELECT} WHERE s.id = ? AND s.company_id = ?`).get(req.params.id, cid(req));
  if (!s) { res.status(404).json({ error: 'Not found' }); return null; }
  return s;
}
app.get('/api/subs/:id', requireAuth, (req, res) => {
  const s = getSub(req, res); if (!s) return;
  const ratings = db.prepare('SELECT * FROM ratings WHERE sub_id = ? ORDER BY created_at DESC').all(s.id);
  const jobs = db.prepare(`
    SELECT a.*, p.name AS property_name FROM assignments a JOIN properties p ON p.id = a.property_id
    WHERE a.sub_id = ? ORDER BY a.scheduled_date DESC`).all(s.id);
  res.json({ sub: s, ratings, jobs });
});
app.put('/api/subs/:id', requireAuth, (req, res) => {
  const s = getSub(req, res); if (!s) return;
  const b = req.body || {};
  db.prepare('UPDATE subs SET company_name = ?, trade = ?, contact_name = ?, phone = ?, email = ?, notes = ? WHERE id = ?')
    .run(b.company_name || s.company_name, b.trade || s.trade, b.contact_name ?? s.contact_name,
         b.phone ?? s.phone, b.email ?? s.email, b.notes ?? s.notes, s.id);
  res.json({ ok: true });
});
app.delete('/api/subs/:id', requireOwner, (req, res) => {
  const s = getSub(req, res); if (!s) return;
  db.prepare('DELETE FROM ratings WHERE sub_id = ?').run(s.id);
  db.prepare('DELETE FROM assignments WHERE sub_id = ?').run(s.id);
  db.prepare('DELETE FROM subs WHERE id = ?').run(s.id);
  res.json({ ok: true });
});
app.post('/api/subs/:id/ratings', requireAuth, (req, res) => {
  const s = getSub(req, res); if (!s) return;
  const stars = parseInt((req.body || {}).stars, 10);
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'Pick a rating from 1 to 5 stars' });
  db.prepare('INSERT INTO ratings (company_id, sub_id, stars, comment, rated_by) VALUES (?, ?, ?, ?, ?)')
    .run(cid(req), s.id, stars, (req.body.comment || '').slice(0, 500), user(req).name);
  res.json({ ok: true });
});

/* ---------- assignments ---------- */
app.get('/api/assignments', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, s.company_name, s.trade, p.name AS property_name FROM assignments a
    JOIN subs s ON s.id = a.sub_id JOIN properties p ON p.id = a.property_id
    WHERE a.company_id = ? ORDER BY a.scheduled_date`).all(cid(req)));
});
app.post('/api/assignments', requireAuth, (req, res) => {
  const { property_id, sub_id, scheduled_date, notes } = req.body || {};
  const p = db.prepare('SELECT id FROM properties WHERE id = ? AND company_id = ?').get(property_id, cid(req));
  const s = db.prepare('SELECT id FROM subs WHERE id = ? AND company_id = ?').get(sub_id, cid(req));
  if (!p || !s) return res.status(400).json({ error: 'Pick a property and a sub' });
  const r = db.prepare('INSERT INTO assignments (company_id, property_id, sub_id, scheduled_date, status, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cid(req), p.id, s.id, scheduled_date || '', 'Scheduled', notes || '');
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});
app.put('/api/assignments/:id', requireAuth, (req, res) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ? AND company_id = ?').get(req.params.id, cid(req));
  if (!a) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  db.prepare('UPDATE assignments SET status = ?, scheduled_date = ?, notes = ? WHERE id = ?')
    .run(b.status || a.status, b.scheduled_date ?? a.scheduled_date, b.notes ?? a.notes, a.id);
  res.json({ ok: true });
});
app.delete('/api/assignments/:id', requireOwner, (req, res) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ? AND company_id = ?').get(req.params.id, cid(req));
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM assignments WHERE id = ?').run(a.id);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- demo seed ---------- */
function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;
  const c = db.prepare('INSERT INTO companies (name) VALUES (?)').run('Harbor Demo Builders');
  const co = Number(c.lastInsertRowid);
  const hash = bcrypt.hashSync('demo1234', 10);
  db.prepare('INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(co, 'demo@buildersharbor.com', hash, 'Demo Builder', 'owner');
  db.prepare('INSERT INTO users (company_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)')
    .run(co, 'mike@buildersharbor.com', hash, 'Mike Torres', 'employee');
  const props = [['Maple Street Duplex', '48 Maple St, Newark NJ', 'Active'],
                 ['Riverside Condos Unit 4B', '220 Riverside Dr, Jersey City NJ', 'Active'],
                 ['Oakwood Kitchen Remodel', '17 Oakwood Ln, Montclair NJ', 'Wrapping up']];
  const pids = {};
  for (const [n, a, s] of props) {
    const r = db.prepare('INSERT INTO properties (company_id, name, address, status) VALUES (?, ?, ?, ?)').run(co, n, a, s);
    pids[n] = Number(r.lastInsertRowid);
  }
  const subsData = [
    ['Ironline Framing', 'Framing', 'Ray Donnelly', '973-555-0141', 'ray@ironlineframing.com'],
    ['Amp & Ohm Electric', 'Electrical', 'Priya Nair', '201-555-0177', 'priya@ampohm.com'],
    ['ClearFlow Plumbing', 'Plumbing', 'Sam Ortiz', '908-555-0132', 'sam@clearflowplumbing.com'],
    ['SolidRock Drywall', 'Drywall', 'Dan Kowalski', '732-555-0188', 'dan@solidrockdw.com'],
    ['TrueTemp HVAC', 'HVAC', 'Miguel Santos', '973-555-0119', 'miguel@truetemphvac.com'],
    ['Harbor City Cabinets', 'Cabinetry', 'Elena Brooks', '646-555-0165', 'elena@harborcitycabinets.com']
  ];
  const sids = {};
  subsData.forEach(([cn, tr, contact, phone, email], i) => {
    const r = db.prepare('INSERT INTO subs (company_id, company_name, trade, contact_name, phone, email) VALUES (?, ?, ?, ?, ?, ?)')
      .run(co, cn, tr, contact, phone, email);
    sids[cn] = Number(r.lastInsertRowid);
    const stars = [5, 4, 3, 5, 4, 5][i];
    db.prepare('INSERT INTO ratings (company_id, sub_id, stars, comment, rated_by) VALUES (?, ?, ?, ?, ?)')
      .run(co, sids[cn], stars, ['Clean work, stayed on schedule', 'Solid work, good communication', 'Decent work but ran two weeks late', 'Excellent crew, fair pricing', 'Reliable, will hire again', 'Beautiful installs, on time'][i], 'Demo Builder');
  });
  const jobs = [['Maple Street Duplex', 'Ironline Framing', '2026-11-16', 'Scheduled'],
                ['Maple Street Duplex', 'Amp & Ohm Electric', '2026-11-20', 'Scheduled'],
                ['Riverside Condos Unit 4B', 'SolidRock Drywall', '2026-11-12', 'In progress'],
                ['Oakwood Kitchen Remodel', 'Harbor City Cabinets', '2026-11-05', 'Done']];
  for (const [pn, sn, d, st] of jobs)
    db.prepare('INSERT INTO assignments (company_id, property_id, sub_id, scheduled_date, status) VALUES (?, ?, ?, ?, ?)')
      .run(co, pids[pn], sids[sn], d, st);
  const filesData = [['Maple Street Duplex', 'Plans', 'architectural-plans-set-A.pdf'],
                     ['Maple Street Duplex', 'Site plans', 'site-plan-rev3.pdf'],
                     ['Maple Street Duplex', 'Quotes', 'ironline-framing-quote.pdf'],
                     ['Riverside Condos Unit 4B', 'Plans', 'unit-4b-floorplans.pdf'],
                     ['Oakwood Kitchen Remodel', 'Quotes', 'harbor-city-cabinets-quote.pdf'],
                     ['Oakwood Kitchen Remodel', 'Photos', 'kitchen-progress-week3.jpg']];
  for (const [pn, cat, fname] of filesData)
    db.prepare(`INSERT INTO files (company_id, property_id, category, stored_name, original_name, mime, size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(co, pids[pn], cat, 'demo-' + fname.replace(/[^a-z0-9.-]/gi, ''), fname,
           fname.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', 250000, 'Demo Builder');
}

seed();
app.listen(PORT, () => console.log(`Builders Harbor running on http://localhost:${PORT}`));
