const $app = document.getElementById('app');
const TRADES = ['Framing','Electrical','Plumbing','Drywall','HVAC','Roofing','Concrete','Masonry','Cabinetry','Painting','Flooring','Tile','Windows & Doors','Insulation','Other'];
const CATS = ['Plans','Site plans','Quotes','Permits','Photos','Inspections','Budget','Other'];
const STATUSES = ['Scheduled','In progress','Done'];
let me = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? esc(d) : x.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }); };

async function api(path, method = 'GET', body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
  return data;
}

function toast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
  setTimeout(() => { t.className = ''; }, 2600);
}

function stars(avg) {
  if (avg == null) return '<span class="stars"><span class="off">★★★★★</span></span><span class="rateval">No ratings yet</span>';
  const full = Math.round(avg);
  return '<span class="stars">' + '★'.repeat(full) + '<span class="off">' + '★'.repeat(5 - full) + '</span></span><span class="rateval">' + avg + '</span>';
}

function header(active) {
  if (!me) return `<header><div class="appbar"><a class="logo" href="#/">⚓ Builders Harbor</a><div style="flex:1"></div><a href="#/login" style="color:#cdd9e8;font-size:14px;padding:8px 12px">Log in</a><a class="btn sm" href="#/register">Get started</a></div></header>`;
  const L = (h, label) => `<a href="#${h}" class="${active === label ? 'active' : ''}">${label}</a>`;
  return `<header><div class="appbar"><a class="logo" href="#/dashboard">⚓ Builders Harbor</a>
    <nav>${L('/dashboard','Dashboard')}${L('/subs','Sub directory')}${L('/team','Team')}</nav>
    <span class="who">${esc(me.user.name)} · ${esc(me.company)}${me.user.role === 'owner' ? ' · owner' : ''}</span>
    <button class="btn ghost sm" id="logoutBtn" style="color:#cdd9e8;border-color:#3d5570">Log out</button></div></header>`;
}

function bindHeader() {
  const b = document.getElementById('logoutBtn');
  if (b) b.onclick = async () => { await api('/api/auth/logout', 'POST'); me = null; location.hash = '#/'; route(); };
}

function shell(active, inner) {
  $app.innerHTML = header(active) + `<main class="wrap">${inner}</main>`;
  bindHeader();
}

/* ---------- public ---------- */
function viewLanding() {
  shell(null, `
  <div class="hero"><h1>Builders Harbor</h1>
    <p>The private platform for builders. Every property in one place, your subs one search away.</p>
    <a class="btn" href="#/register">Create your account</a> &nbsp; <a class="btn ghost" href="#/login" style="color:#fff;border-color:#5b7899">Log in</a>
  </div>
  <div class="wrap"><div class="features">
    <div class="feature"><h3>Properties with folders</h3><p>Every property gets its own space. Plans, site plans, quotes, permits and photos, filed and searchable.</p></div>
    <div class="feature"><h3>Sub directory</h3><p>All your trades in one searchable directory. Find the right sub for any job in seconds.</p></div>
    <div class="feature"><h3>Scheduling</h3><p>Assign subs to jobs with dates and status, so you always know who's on what.</p></div>
    <div class="feature"><h3>Ratings</h3><p>Rate every sub after the work. Your ratings build a record you can trust when you award the next job.</p></div>
  </div>
  <p class="muted" style="text-align:center;margin-top:26px">Try the demo: demo@buildersharbor.com / demo1234</p></div>`);
}

function authForm(kind) {
  shell(null, `
  <div style="max-width:400px;margin:40px auto">
    <div class="card">
      <h2>${kind === 'login' ? 'Log in' : 'Create your company account'}</h2>
      <div id="authErr" style="color:var(--red);font-size:13px;margin-bottom:6px"></div>
      ${kind === 'register' ? `<label>Company name</label><input id="f_company"><label>Your name</label><input id="f_name">` : ''}
      <label>Email</label><input id="f_email" type="email" autocomplete="username">
      <label>Password</label><input id="f_pass" type="password" autocomplete="${kind === 'login' ? 'current' : 'new'}-password">
      <div class="mt"><button class="btn" id="authBtn" style="width:100%">${kind === 'login' ? 'Log in' : 'Create account'}</button></div>
      <p class="muted mt">${kind === 'login' ? `New here? <a href="#/register">Create an account</a>` : `Already have an account? <a href="#/login">Log in</a>`}</p>
    </div></div>`);
  document.getElementById('authBtn').onclick = async () => {
    const body = { email: document.getElementById('f_email').value.trim(), password: document.getElementById('f_pass').value };
    if (kind === 'register') { body.company_name = document.getElementById('f_company').value.trim(); body.name = document.getElementById('f_name').value.trim(); }
    try {
      const r = await api('/api/auth/' + kind, 'POST', body);
      me = { user: r.user, company: body.company_name || '' };
      if (kind === 'login') me = await api('/api/me');
      location.hash = '#/dashboard'; route();
    } catch (e) { document.getElementById('authErr').textContent = e.message; }
  };
}

/* ---------- dashboard ---------- */
async function viewDashboard() {
  const [props, subs, jobs] = await Promise.all([api('/api/properties'), api('/api/subs'), api('/api/assignments')]);
  const upcoming = jobs.filter(j => j.status !== 'Done').slice(0, 5);
  shell('Dashboard', `
  <h1>Dashboard</h1><p class="sub">Everything for ${esc(me.company)}, in one place.</p>
  <div class="statrow">
    <div class="stat"><b>${props.length}</b><span>Properties</span></div>
    <div class="stat"><b>${subs.length}</b><span>Subs on file</span></div>
    <div class="stat"><b>${jobs.filter(j => j.status !== 'Done').length}</b><span>Open jobs</span></div>
    <div class="stat"><b>${props.reduce((a, p) => a + p.file_count, 0)}</b><span>Files filed</span></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <h2 style="margin:8px 0">Properties</h2><button class="btn sm" id="newPropBtn">+ New property</button>
  </div>
  <div id="propFormSlot"></div>
  <div class="grid" id="propGrid"></div>
  ${upcoming.length ? `<h2 class="mt">Coming up</h2><div class="card"><table><tr><th>When</th><th>Property</th><th>Sub</th><th>Status</th></tr>
    ${upcoming.map(j => `<tr><td>${fmtDate(j.scheduled_date)}</td><td><a href="#/property/${j.property_id}">${esc(j.property_name)}</a></td><td>${esc(j.company_name)}</td><td><span class="badge ${j.status.replace(' ','-')}">${esc(j.status)}</span></td></tr>`).join('')}</table></div>` : ''}`);
  const g = document.getElementById('propGrid');
  g.innerHTML = props.length ? props.map(p => `
    <a class="card propcard" href="#/property/${p.id}">
      <div class="top"><h3>${esc(p.name)}</h3><span class="badge ${p.status.replace(' ','-')}">${esc(p.status)}</span></div>
      <p class="addr">${esc(p.address || 'No address yet')}</p>
      <div class="meta"><span>📁 ${p.file_count} files</span><span>🔧 ${p.open_jobs} open jobs</span></div>
    </a>`).join('') : '<div class="empty card">No properties yet. Add your first one to get started.</div>';
  document.getElementById('newPropBtn').onclick = () => {
    const slot = document.getElementById('propFormSlot');
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="card"><h2>New property</h2>
      <div class="row"><div><label>Name</label><input id="np_name"></div><div><label>Address</label><input id="np_addr"></div></div>
      <div class="row"><div><label>Status</label><select id="np_status"><option>Active</option><option>Planning</option><option>Wrapping up</option><option>On hold</option></select></div>
      <div><label>Notes</label><input id="np_notes"></div></div>
      <div class="mt"><button class="btn" id="np_save">Create property</button></div></div>`;
    document.getElementById('np_save').onclick = async () => {
      try {
        await api('/api/properties', 'POST', { name: document.getElementById('np_name').value.trim(), address: document.getElementById('np_addr').value.trim(), status: document.getElementById('np_status').value, notes: document.getElementById('np_notes').value.trim() });
        toast('Property created'); viewDashboard();
      } catch (e) { toast(e.message, true); }
    };
  };
}

/* ---------- property ---------- */
async function viewProperty(id) {
  const { property: p, files, assignments } = await api('/api/properties/' + id);
  const byCat = {};
  CATS.forEach(c => byCat[c] = []);
  files.forEach(f => { (byCat[f.category] = byCat[f.category] || []).push(f); });
  const subs = await api('/api/subs');
  const isOwner = me.user.role === 'owner';
  shell(null, `
  <a class="backlink" href="#/dashboard">← Dashboard</a>
  <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
    <div><h1>${esc(p.name)}</h1><p class="sub">${esc(p.address || '')} · <span class="badge ${p.status.replace(' ','-')}">${esc(p.status)}</span></p></div>
    ${isOwner ? `<button class="btn danger sm" id="delProp">Delete property</button>` : ''}
  </div>
  <h2>Files</h2>
  <div class="card"><div class="formrow">
    <div><label>Category</label><select id="up_cat">${CATS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div><label>File (PDF, image, doc, up to 50 MB)</label><input type="file" id="up_file"></div>
    <div><button class="btn sm" id="up_btn">Upload</button></div>
  </div></div>
  ${files.length ? Object.keys(byCat).filter(c => byCat[c].length).map(c => `
    <div class="card"><h2>${c}</h2>${byCat[c].map(f => `
      <div class="filerow"><span class="name">${esc(f.original_name)}</span>
      <span class="meta">${fmtSize(f.size)} · ${esc(f.uploaded_by)} · ${f.uploaded_at.slice(0, 10)}</span>
      <a class="btn ghost sm" href="/api/files/${f.id}/download">Download</a>
      ${isOwner ? `<button class="btn danger sm" data-delfile="${f.id}">Delete</button>` : ''}</div>`).join('')}</div>`).join('')
    : '<div class="empty card">No files yet. Upload plans, site plans, quotes and more above.</div>'}
  <h2 class="mt">Subs on this job</h2>
  <div class="card"><div class="formrow">
    <div><label>Sub</label><select id="as_sub">${subs.map(s => `<option value="${s.id}">${esc(s.company_name)} (${esc(s.trade)})</option>`).join('')}</select></div>
    <div><label>Date</label><input type="date" id="as_date"></div>
    <div><label>Notes</label><input id="as_notes" placeholder="Optional"></div>
    <div><button class="btn sm" id="as_btn">Schedule</button></div>
  </div></div>
  ${assignments.length ? `<div class="card"><table><tr><th>Sub</th><th>Trade</th><th>Date</th><th>Status</th>${isOwner ? '<th></th>' : ''}</tr>
    ${assignments.map(a => `<tr><td><a href="#/sub/${a.sub_id}">${esc(a.company_name)}</a></td><td>${esc(a.trade)}</td><td>${fmtDate(a.scheduled_date)}</td>
      <td><select data-status="${a.id}" style="width:auto;padding:4px 6px">${STATUSES.map(s => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      ${isOwner ? `<td><button class="btn danger sm" data-deljob="${a.id}">Remove</button></td>` : ''}</tr>`).join('')}</table></div>`
    : '<div class="empty card">No subs scheduled on this property yet.</div>'}`);
  const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  document.getElementById('up_btn').onclick = async () => {
    const f = document.getElementById('up_file').files[0];
    if (!f) return toast('Choose a file first', true);
    const fd = new FormData(); fd.append('file', f); fd.append('category', document.getElementById('up_cat').value);
    try { await api(`/api/properties/${id}/files`, 'POST', fd); toast('File uploaded'); viewProperty(id); } catch (e) { toast(e.message, true); }
  };
  document.getElementById('as_btn').onclick = async () => {
    const subId = document.getElementById('as_sub').value;
    if (!subId) return toast('Add a sub to the directory first', true);
    try { await api('/api/assignments', 'POST', { property_id: Number(id), sub_id: Number(subId), scheduled_date: document.getElementById('as_date').value, notes: document.getElementById('as_notes').value }); toast('Sub scheduled'); viewProperty(id); } catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll('[data-status]').forEach(el => el.onchange = async () => {
    try { await api('/api/assignments/' + el.dataset.status, 'PUT', { status: el.value }); toast('Status updated'); } catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll('[data-deljob]').forEach(el => el.onclick = async () => {
    try { await api('/api/assignments/' + el.dataset.deljob, 'DELETE'); toast('Removed'); viewProperty(id); } catch (e) { toast(e.message, true); }
  });
  document.querySelectorAll('[data-delfile]').forEach(el => el.onclick = async () => {
    try { await api('/api/files/' + el.dataset.delfile, 'DELETE'); toast('File deleted'); viewProperty(id); } catch (e) { toast(e.message, true); }
  });
  const dp = document.getElementById('delProp');
  if (dp) dp.onclick = async () => {
    if (!confirm('Delete this property and all its files?')) return;
    try { await api('/api/properties/' + id, 'DELETE'); toast('Property deleted'); location.hash = '#/dashboard'; } catch (e) { toast(e.message, true); }
  };
}

/* ---------- subs ---------- */
let subFilter = { q: '', trade: '' };
async function viewSubs() {
  const subs = await api('/api/subs?q=' + encodeURIComponent(subFilter.q) + '&trade=' + encodeURIComponent(subFilter.trade));
  const isOwner = me.user.role === 'owner';
  shell('Sub directory', `
  <h1>Sub directory</h1><p class="sub">Every trade you work with, searchable.</p>
  <div class="formrow"><div style="flex:2"><input id="sub_q" placeholder="Search by name, trade, contact, phone…" value="${esc(subFilter.q)}"></div></div>
  <div class="chips mt"><span class="chip ${!subFilter.trade ? 'on' : ''}" data-trade="">All trades</span>
    ${[...new Set(TRADES)].map(t => `<span class="chip ${subFilter.trade === t ? 'on' : ''}" data-trade="${t}">${t}</span>`).join('')}</div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn sm" id="newSubBtn">+ Add sub</button></div>
  <div id="subFormSlot"></div>
  <div class="grid" id="subGrid">
    ${subs.length ? subs.map(s => `
    <a class="card propcard" href="#/sub/${s.id}">
      <div class="top"><h3>${esc(s.company_name)}</h3><span class="badge">${esc(s.trade)}</span></div>
      <p class="addr">${esc(s.contact_name || '')}${s.contact_name && s.phone ? ' · ' : ''}${esc(s.phone || '')}</p>
      ${stars(s.avg_rating)}
    </a>`).join('') : '<div class="empty card">No subs match. Add one to build your directory.</div>'}
  </div>`);
  const refresh = () => viewSubs();
  document.getElementById('sub_q').oninput = e => { subFilter.q = e.target.value; clearTimeout(refresh._t); refresh._t = setTimeout(() => { const v = document.getElementById('sub_q'); refresh(); const n = document.getElementById('sub_q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 350); };
  document.querySelectorAll('.chip[data-trade]').forEach(c => c.onclick = () => { subFilter.trade = c.dataset.trade; refresh(); });
  document.getElementById('newSubBtn').onclick = () => {
    const slot = document.getElementById('subFormSlot');
    if (slot.innerHTML) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="card"><h2>Add a sub</h2>
      <div class="row"><div><label>Company name</label><input id="ns_name"></div><div><label>Trade</label><select id="ns_trade">${TRADES.map(t => `<option>${t}</option>`).join('')}</select></div></div>
      <div class="row"><div><label>Contact name</label><input id="ns_contact"></div><div><label>Phone</label><input id="ns_phone"></div></div>
      <div class="row"><div><label>Email</label><input id="ns_email" type="email"></div><div><label>Notes</label><input id="ns_notes"></div></div>
      <div class="mt"><button class="btn" id="ns_save">Save sub</button></div></div>`;
    document.getElementById('ns_save').onclick = async () => {
      try {
        await api('/api/subs', 'POST', { company_name: document.getElementById('ns_name').value.trim(), trade: document.getElementById('ns_trade').value, contact_name: document.getElementById('ns_contact').value.trim(), phone: document.getElementById('ns_phone').value.trim(), email: document.getElementById('ns_email').value.trim(), notes: document.getElementById('ns_notes').value.trim() });
        subFilter = { q: '', trade: '' }; toast('Sub saved'); viewSubs();
      } catch (e) { toast(e.message, true); }
    };
  };
}

async function viewSub(id) {
  const { sub: s, ratings, jobs } = await api('/api/subs/' + id);
  const isOwner = me.user.role === 'owner';
  shell(null, `
  <a class="backlink" href="#/subs">← Sub directory</a>
  <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap">
    <div><h1>${esc(s.company_name)}</h1><p class="sub"><span class="badge">${esc(s.trade)}</span> ${esc(s.contact_name || '')}${s.contact_name && s.phone ? ' · ' : ''}${esc(s.phone || '')}${s.email ? ' · ' + esc(s.email) : ''}</p></div>
    ${isOwner ? `<button class="btn danger sm" id="delSub">Delete sub</button>` : ''}
  </div>
  <div class="statrow"><div class="stat"><b>${s.avg_rating ?? '—'}</b><span>Average rating</span></div>
    <div class="stat"><b>${s.rating_count}</b><span>Ratings</span></div>
    <div class="stat"><b>${jobs.length}</b><span>Jobs on record</span></div></div>
  ${s.notes ? `<div class="card"><h2>Notes</h2><p style="margin:0">${esc(s.notes)}</p></div>` : ''}
  <div class="card"><h2>Rate this sub</h2>
    <div class="starpick" id="starPick">${[1,2,3,4,5].map(i => `<span data-star="${i}">☆</span>`).join('')}</div>
    <label>Comment</label><textarea id="rate_comment" rows="2" placeholder="How was the work?"></textarea>
    <div class="mt"><button class="btn sm" id="rate_btn">Save rating</button></div></div>
  <div class="card"><h2>Ratings</h2>
    ${ratings.length ? ratings.map(r => `<div class="filerow"><span class="stars">${'★'.repeat(r.stars)}<span class="off">${'★'.repeat(5 - r.stars)}</span></span><span class="name">${esc(r.comment || '')}</span><span class="meta">${esc(r.rated_by)} · ${r.created_at.slice(0, 10)}</span></div>`).join('') : '<div class="empty">No ratings yet.</div>'}</div>
  <div class="card"><h2>Jobs</h2>
    ${jobs.length ? `<table><tr><th>Property</th><th>Date</th><th>Status</th></tr>${jobs.map(j => `<tr><td><a href="#/property/${j.property_id}">${esc(j.property_name)}</a></td><td>${fmtDate(j.scheduled_date)}</td><td><span class="badge ${j.status.replace(' ','-')}">${esc(j.status)}</span></td></tr>`).join('')}</table>` : '<div class="empty">Not scheduled on any job yet.</div>'}</div>`);
  let picked = 0;
  const pick = document.getElementById('starPick');
  pick.querySelectorAll('[data-star]').forEach(st => st.onclick = () => {
    picked = Number(st.dataset.star);
    pick.querySelectorAll('[data-star]').forEach(x => x.textContent = Number(x.dataset.star) <= picked ? '★' : '☆');
    pick.querySelectorAll('[data-star]').forEach(x => x.className = Number(x.dataset.star) <= picked ? 'on' : '');
  });
  document.getElementById('rate_btn').onclick = async () => {
    if (!picked) return toast('Pick a star rating first', true);
    try { await api(`/api/subs/${id}/ratings`, 'POST', { stars: picked, comment: document.getElementById('rate_comment').value }); toast('Rating saved'); viewSub(id); } catch (e) { toast(e.message, true); }
  };
  const ds = document.getElementById('delSub');
  if (ds) ds.onclick = async () => {
    if (!confirm('Delete this sub, their ratings and job history?')) return;
    try { await api('/api/subs/' + id, 'DELETE'); toast('Sub deleted'); location.hash = '#/subs'; } catch (e) { toast(e.message, true); }
  };
}

/* ---------- team ---------- */
async function viewTeam() {
  const team = await api('/api/team');
  const isOwner = me.user.role === 'owner';
  shell('Team', `
  <h1>Team</h1><p class="sub">Everyone with access to your company account.</p>
  ${isOwner ? `<div class="card"><h2>Add an employee</h2>
    <div class="row"><div><label>Name</label><input id="te_name"></div><div><label>Email</label><input id="te_email" type="email"></div></div>
    <div class="row"><div><label>Temporary password (they can log in with it)</label><input id="te_pass"></div><div></div></div>
    <div class="mt"><button class="btn sm" id="te_btn">Add employee</button></div></div>` : ''}
  <div class="card"><table><tr><th>Name</th><th>Email</th><th>Role</th>${isOwner ? '<th></th>' : ''}</tr>
    ${team.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="badge">${u.role === 'owner' ? 'Owner' : 'Employee'}</span></td>
    ${isOwner && u.role !== 'owner' ? `<td><button class="btn danger sm" data-delteam="${u.id}">Remove</button></td>` : '<td></td>'}</tr>`).join('')}</table></div>`);
  const btn = document.getElementById('te_btn');
  if (btn) btn.onclick = async () => {
    try {
      await api('/api/team', 'POST', { name: document.getElementById('te_name').value.trim(), email: document.getElementById('te_email').value.trim(), password: document.getElementById('te_pass').value });
      toast('Employee added'); viewTeam();
    } catch (e) { toast(e.message, true); }
  };
  document.querySelectorAll('[data-delteam]').forEach(el => el.onclick = async () => {
    if (!confirm('Remove this employee?')) return;
    try { await api('/api/team/' + el.dataset.delteam, 'DELETE'); toast('Removed'); viewTeam(); } catch (e) { toast(e.message, true); }
  });
}

/* ---------- router ---------- */
async function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  try {
    if (!me) { const r = await api('/api/me'); me = r.user ? r : null; }
    if (!me) { if (parts[0] === 'login') return authForm('login'); if (parts[0] === 'register') return authForm('register'); return viewLanding(); }
    if (parts.length === 0 || parts[0] === 'dashboard') return await viewDashboard();
    if (parts[0] === 'property' && parts[1]) return await viewProperty(parts[1]);
    if (parts[0] === 'subs') return await viewSubs();
    if (parts[0] === 'sub' && parts[1]) return await viewSub(parts[1]);
    if (parts[0] === 'team') return await viewTeam();
    return await viewDashboard();
  } catch (e) {
    if (e.message === 'Not logged in') { me = null; location.hash = '#/login'; return route(); }
    shell(null, `<div class="empty card">${esc(e.message)}</div>`);
  }
}
window.addEventListener('hashchange', route);
route();
