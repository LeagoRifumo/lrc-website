/* LRC Portfolio Journal — members only. Each member's positions and journal live in the members database (Supabase) behind
   row level security: only the signed-in member can read or change their own rows. Prices come from the public 15-minute quotes
   file (data/scan/quotes.json) and, for names outside the scanner, from the Portfolio Desk (every 30 minutes), which also
   collects news and next results dates for every company members hold and emails market-moving news. */
(() => {
  const root = document.getElementById('pfRoot'); if (!root) return;
  const CFG = window.LRC_AUTH || {};
  const me = document.querySelector('script[src*="assets/js/portfolio.js"]');
  const BASE = me ? me.src.replace(/assets\/js\/portfolio\.js.*$/, '') : '';
  const DATA = window.LRC_DATA || (BASE + 'data/');
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = x => x !== null && x !== undefined && x !== '' && isFinite(x);
  const SAFE = window.LRC_SAFE === true;
  const GR = { 'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring' };
  const grade = v => !v ? '—' : SAFE ? (GR[v] || v) : v;
  const gcls = v => 'g-' + ({ 'STRONG BUY': 'top', 'BUY': 'strong', 'HOLD': 'avg', 'SELL': 'weak', 'STRONG SELL': 'low' }[v] || 'avg');
  const SYM = c => c === 'USD' ? '$' : 'R';
  const num = (x, d = 2) => ok(x) ? Number(x).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const money = (x, c, d) => ok(x) ? (x < 0 ? '−' : '') + SYM(c) + num(Math.abs(x), d ?? (Math.abs(x) >= 10000 ? 0 : 2)) : '—';
  const pct = (x, d = 1) => ok(x) ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%' : '—';
  const cls = x => !ok(x) || x === 0 ? '' : x > 0 ? 'up' : 'dn';
  const day = d => { try { return new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
  const ago = d => { const m = (Date.now() - new Date(d)) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const getJ = f => fetch(DATA + f + '?v=' + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).catch(() => null);
  const KINDS = { thesis: 'Thesis', note: 'Note', review: 'Review', trade: 'Trade', risk: 'Risk' };

  let sb = null, user = null, IDX = {}, Q = {}, QGEN = null, NEWS = {}, FX = null, POS = [], JRN = [], PROF = {}, base = store.get('lrc_pf_base', 'ZAR');

  const client = () => new Promise((res, rej) => {
    if (!CFG.url || !CFG.anon) return rej(new Error('members database not configured'));
    if (window.supabase) return res(window.supabase.createClient(CFG.url, CFG.anon));
    const s = document.createElement('script'); s.src = BASE + 'assets/vendor/supabase.js';
    s.onload = () => res(window.supabase.createClient(CFG.url, CFG.anon)); s.onerror = rej; document.head.appendChild(s);
  });

  const locked = () => {
    root.innerHTML = `<div class="pf-lock"><span class="eyebrow">Members only</span><h2>Your private <span class="gold">portfolio journal</span></h2>
      <p>Track the shares you own the way an equity analyst does: entry prices, position values, live profit and loss, LRC grades, news on every holding and a dated journal of your thesis and reviews. Prices refresh every 15 minutes, and we email you when market-moving news hits a company you hold.</p>
      <p class="muted">Only you can see your portfolio. It is stored in your account, not on the public website.</p>
      <div class="pf-lock-btns"><a class="btn btn-gold" href="${BASE}top-picks.html#join">Create a free account</a><a class="btn btn-ghost" href="${BASE}top-picks.html#join">Sign in</a></div></div>`;
  };

  /* ---------- prices ---------- */
  const loadPrices = async () => {
    const [qq, live] = await Promise.all([getJ('scan/quotes.json'), getJ('dashboards/live.json')]);
    if (qq && qq.q) { Q = qq.q; QGEN = qq.generated; }
    if (live) { const r = live.groups.flatMap(g => g.rows).find(x => x.name === 'USD / ZAR'); if (r && ok(r.latest)) FX = r.latest; }
  };
  const loadNews = async () => {
    const tk = [...new Set(POS.map(p => p.ticker))]; if (!tk.length) { NEWS = {}; return; }
    const { data } = await sb.from('portfolio_news').select('*').in('ticker', tk);
    NEWS = Object.fromEntries((data || []).map(r => [r.ticker, r]));
  };
  const price = p => {
    const q = Q[p.ticker], i = IDX[p.ticker], n = (NEWS[p.ticker] || {}).quote;
    if (q && ok(q[0])) return { px: q[0], chg: q[1], at: q[2], src: '15-min' };
    if (n && ok(n.px)) return { px: n.px, chg: n.chg, at: n.at, src: 'desk' };
    if (i && ok(i.px)) return { px: i.px, chg: i.chg, at: null, src: 'close' };
    return { px: null, chg: null, at: null, src: 'none' };
  };
  const toBase = (x, c) => !ok(x) ? null : c === base ? x : !FX ? null : base === 'ZAR' ? x * FX : x / FX;

  /* ---------- the book ---------- */
  const book = () => {
    const open = POS.filter(p => !p.closed_on), closed = POS.filter(p => p.closed_on);
    const rows = open.map(p => {
      const i = IDX[p.ticker] || {}, pr = price(p), c = p.currency || i.cur || (p.market === 'US' ? 'USD' : 'ZAR');
      const px = pr.px ?? p.entry_price, val = p.qty * px, cost = p.qty * p.entry_price;
      const dayAmt = ok(pr.chg) ? val - val / (1 + pr.chg) : null;
      return { p, i, pr, c, px, val, cost, pl: val - cost, plp: val / cost - 1, dayAmt, bval: toBase(val, c), bcost: toBase(cost, c), bpl: toBase(val - cost, c), bday: toBase(dayAmt, c) };
    });
    const tv = rows.reduce((a, r) => a + (r.bval || 0), 0), tc = rows.reduce((a, r) => a + (r.bcost || 0), 0), td = rows.reduce((a, r) => a + (r.bday || 0), 0);
    rows.forEach(r => r.w = tv ? (r.bval || 0) / tv : 0);
    rows.sort((a, b) => b.w - a.w);
    const real = closed.map(p => { const c = p.currency || (p.market === 'US' ? 'USD' : 'ZAR'); const pl = p.qty * ((p.exit_price || p.entry_price) - p.entry_price); return { p, c, pl, plp: (p.exit_price || p.entry_price) / p.entry_price - 1, bpl: toBase(pl, c) }; });
    return { rows, tv, tc, td, pl: tv - tc, plp: tc ? tv / tc - 1 : null, dayp: tv - td ? td / (tv - td) : null, real };
  };

  /* ---------- desk note: what an analyst would flag this morning ---------- */
  const deskNote = B => {
    const out = [], R = B.rows; if (!R.length) return '';
    const withDay = R.filter(r => ok(r.pr.chg)).sort((a, b) => b.pr.chg - a.pr.chg);
    if (withDay.length) {
      const b = withDay[0], w = withDay[withDay.length - 1];
      out.push(`Your book is <b class="${cls(B.td)}">${pct(B.dayp, 2)}</b> today (${money(B.td, base)}). ${b.pr.chg > 0 ? `Best: <b>${esc(b.p.ticker.replace('.JO', ''))}</b> <span class="up">${pct(b.pr.chg)}</span>` : ''}${w !== b && w.pr.chg < 0 ? `${b.pr.chg > 0 ? '; w' : 'W'}orst: <b>${esc(w.p.ticker.replace('.JO', ''))}</b> <span class="dn">${pct(w.pr.chg)}</span>` : ''}.`);
    }
    const big = R[0]; if (big && big.w > 0.25) out.push(`<b>Concentration:</b> ${esc(big.p.ticker.replace('.JO', ''))} is ${(big.w * 100).toFixed(0)}% of the book. Most analysts cap a single position at 10–20%.`);
    const soon = R.filter(r => { const d = (NEWS[r.p.ticker] || {}).next_results; if (!d) return false; const n = (new Date(d + 'T12:00:00') - Date.now()) / 864e5; return n >= -1 && n <= 10; });
    if (soon.length) out.push(`<b>Results coming:</b> ${soon.map(r => `${esc(r.p.ticker.replace('.JO', ''))} (${day(NEWS[r.p.ticker].next_results)})`).join(', ')}. Decide before the date: hold, trim or hedge.`);
    const weak = R.filter(r => ['SELL', 'STRONG SELL'].includes(r.i.v)); if (weak.length) out.push(`<b>Weak LRC grade:</b> ${weak.map(r => esc(r.p.ticker.replace('.JO', ''))).join(', ')}. Review the thesis; is it still intact?`);
    const stops = R.filter(r => ok(r.p.stop) && r.px <= r.p.stop); if (stops.length) out.push(`<b>Below your stop level:</b> ${stops.map(r => esc(r.p.ticker.replace('.JO', ''))).join(', ')}.`);
    const tgt = R.filter(r => ok(r.p.target_low) && r.px >= r.p.target_low); if (tgt.length) out.push(`<b>In your target range:</b> ${tgt.map(r => esc(r.p.ticker.replace('.JO', ''))).join(', ')}. Time to review: take profit or raise the target?`);
    const noTh = R.filter(r => !r.p.thesis); if (noTh.length) out.push(`<b>No written thesis:</b> ${noTh.slice(0, 6).map(r => esc(r.p.ticker.replace('.JO', ''))).join(', ')}. Write down why you own it; it is your exit rule when the reason changes.`);
    const mv = Object.values(NEWS).flatMap(n => (n.alerts || []).filter(a => (Date.now() - new Date(a.at)) < 864e5 * 2));
    if (mv.length) out.push(`<b>Market-moving news</b> on ${[...new Set(mv.map(a => a.t.replace('.JO', '')))].join(', ')} in the last 48 hours (see the news log).`);
    return out.map(s => `<li>${s}</li>`).join('');
  };

  /* ---------- render ---------- */
  const render = () => {
    const B = book(), R = B.rows, name = (PROF.full_name || '').split(' ')[0];
    const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const mk = k => { const g = {}; R.forEach(r => { const key = k(r); g[key] = (g[key] || 0) + r.w; }); return Object.entries(g).sort((a, b) => b[1] - a[1]); };
    const bars = (list) => list.map(([k, w]) => `<div class="pf-bar"><span>${esc(k)}</span><i><i style="width:${(w * 100).toFixed(1)}%"></i></i><b>${(w * 100).toFixed(0)}%</b></div>`).join('');
    const news = Object.values(NEWS).flatMap(n => (n.news || []).map(x => ({ ...x, t: n.ticker, mv: (n.alerts || []).some(a => a.url === x.url) })))
      .filter(x => POS.some(p => p.ticker === x.t && !p.closed_on)).sort((a, b) => new Date(b.published) - new Date(a.published)).slice(0, 40);
    const alerts = Object.values(NEWS).flatMap(n => (n.alerts || []).filter(a => !a.url).map(a => ({ ...a }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
    root.innerHTML = `
      <div class="pf-mast"><div><span class="pf-kick">PORTFOLIO JOURNAL · PRIVATE</span><h2>${name ? esc(name) + '’s' : 'My'} book</h2><small>${esc(today)} · prices ${QGEN ? 'as at ' + new Date(QGEN).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) + ' SAST, refreshed every 15 min' : 'from the last close'}</small></div>
        <div class="pf-tools"><div class="seg" id="pfBase"><button data-v="ZAR" class="${base === 'ZAR' ? 'on' : ''}">Rand</button><button data-v="USD" class="${base === 'USD' ? 'on' : ''}">Dollar</button></div>
        <button class="btn btn-gold" id="pfAddBtn">+ Add position</button><button class="btn btn-ghost" id="pfCsv" title="Download your positions as a spreadsheet">Export</button></div></div>
      <div class="pf-kpis">
        <div><span>Book value</span><b>${money(B.tv, base, 0)}</b><small>${R.length} open position${R.length === 1 ? '' : 's'}${FX ? ` · $1 = R${num(FX, 2)}` : ''}</small></div>
        <div><span>Invested</span><b>${money(B.tc, base, 0)}</b><small>at your entry prices</small></div>
        <div><span>Unrealised P/L</span><b class="${cls(B.pl)}">${money(B.pl, base, 0)}</b><small class="${cls(B.plp)}">${pct(B.plp)}</small></div>
        <div><span>Today</span><b class="${cls(B.td)}">${money(B.td, base, 0)}</b><small class="${cls(B.dayp)}">${pct(B.dayp, 2)}</small></div>
        <div><span>Realised P/L</span><b class="${cls(B.real.reduce((a, r) => a + (r.bpl || 0), 0))}">${money(B.real.reduce((a, r) => a + (r.bpl || 0), 0), base, 0)}</b><small>${B.real.length} closed</small></div>
      </div>
      ${R.length ? `<div class="pf-desk"><span class="pf-kick">DESK NOTE</span><ul>${deskNote(B)}</ul></div>` : `<div class="pf-empty"><h3>Start your book</h3><p>Add the shares you own: the company, your entry price and either the number of shares or the rand/dollar value of the position. Write one line on why you bought it. That is your thesis, and the journal keeps you honest.</p><button class="btn btn-gold" id="pfAdd2">+ Add your first position</button></div>`}
      ${R.length ? `<h3 class="pf-h">Positions ledger</h3>
      <div class="tbl-wrap"><table class="mc-tbl pf-tbl"><thead><tr><th>Company</th><th class="n">Shares</th><th class="n">Entry</th><th class="n">Last</th><th class="n">Today</th><th class="n">Value (${base === 'ZAR' ? 'R' : '$'})</th><th class="n">Weight</th><th class="n">P/L</th><th class="n">P/L %</th><th>LRC grade</th><th>Next results</th></tr></thead><tbody>
      ${R.map(r => `<tr class="clk" data-id="${r.p.id}"><td><b>${esc(r.p.ticker.replace('.JO', ''))}</b> <small>${esc(r.p.name || r.i.n || '')}</small>${(NEWS[r.p.ticker] || {}).alerts && NEWS[r.p.ticker].alerts.some(a => (Date.now() - new Date(a.at)) < 864e5) ? ' <span class="pf-flag" title="Market-moving news in the last 24 hours">NEWS</span>' : ''}</td>
        <td class="n">${num(r.p.qty, r.p.qty % 1 ? 4 : 0)}</td><td class="n">${money(r.p.entry_price, r.c)}</td><td class="n">${money(r.px, r.c)}${r.pr.src === 'none' ? ' <small title="No live price yet; the Portfolio Desk adds it within 30 minutes">*</small>' : ''}</td>
        <td class="n ${cls(r.pr.chg)}">${pct(r.pr.chg)}</td><td class="n">${money(r.bval, base, 0)}</td><td class="n">${(r.w * 100).toFixed(1)}%</td>
        <td class="n ${cls(r.bpl)}">${money(r.bpl, base, 0)}</td><td class="n ${cls(r.plp)}"><b>${pct(r.plp)}</b></td>
        <td>${r.i.v ? `<span class="pill ${gcls(r.i.v)}">${esc(grade(r.i.v))}</span> <small>${r.i.score ?? ''}</small>` : '<small class="muted">not covered</small>'}</td>
        <td>${(NEWS[r.p.ticker] || {}).next_results ? day(NEWS[r.p.ticker].next_results) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="src-note">Tap a position for its thesis, journal and news, or to edit or close it. LRC grades and scores come from the LRC Stock Scanner (updated twice a day). * = price not yet available.</p>
      <div class="pf-two"><div><h3 class="pf-h">Allocation by market</h3>${bars(mk(r => r.p.market === 'US' ? 'New York' : 'JSE'))}<h3 class="pf-h">Allocation by sector</h3>${bars(mk(r => r.i.sec || 'Other'))}</div>
        <div><h3 class="pf-h">Market-moving alerts</h3>${alerts.length ? `<ul class="pf-alerts">${alerts.map(a => `<li><span class="pf-tk">${esc(a.t.replace('.JO', ''))}</span>${esc(a.text)} <small>${ago(a.at)}</small></li>`).join('')}</ul>` : '<p class="muted">No big moves or results alerts on your holdings in the last few days.</p>'}
          <label class="pf-opt"><input type="checkbox" id="pfMail" ${PROF.portfolio_alerts !== false ? 'checked' : ''}> Email me market-moving news on my holdings</label><small class="muted">Big price moves (±5% in a day), results, trading statements and SENS, CEO changes, deals, upgrades and downgrades. At most one email per company per story.</small></div></div>` : ''}
      ${R.length ? `<h3 class="pf-h">News log: your holdings</h3>${news.length ? `<ul class="pf-news">${news.map(n => `<li class="${n.mv ? 'mv' : ''}"><span class="pf-tk">${esc(n.t.replace('.JO', ''))}</span><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><small>${esc(n.source || '')} · ${n.published ? ago(n.published) : ''}${n.mv ? ' · <b>market-moving</b>' : ''}</small></li>`).join('')}</ul>` : '<p class="muted">News on your holdings appears here within 30 minutes of adding them.</p>'}` : ''}
      <h3 class="pf-h">Journal</h3>
      <form class="pf-jform" id="pfJ"><select id="pfJt"><option value="">General</option>${[...new Set(POS.filter(p => !p.closed_on).map(p => p.ticker))].map(t => `<option value="${esc(t)}">${esc(t.replace('.JO', ''))}</option>`).join('')}</select>
        <select id="pfJk">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
        <textarea id="pfJb" maxlength="4000" rows="2" placeholder="What changed? e.g. 'Results beat; margins up. Thesis intact, holding.' or 'Trimmed 20%: position above 25% of the book.'"></textarea><button class="btn btn-gold">Add entry</button></form>
      ${JRN.length ? `<div class="pf-jrn">${JRN.slice(0, 60).map(j => `<div class="pf-je"><div class="pf-jd">${day(j.created_at)}<small>${new Date(j.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</small></div><div><span class="pf-kind k-${esc(j.kind)}">${esc(KINDS[j.kind] || j.kind)}</span>${j.ticker ? `<span class="pf-tk">${esc(j.ticker.replace('.JO', ''))}</span>` : ''}<p>${esc(j.body)}</p></div><button class="pf-del" data-j="${j.id}" title="Delete entry">×</button></div>`).join('')}</div>` : '<p class="muted">Your journal is empty. Analysts write down the thesis when they buy, review it at every result, and note why they sell.</p>'}
      ${B.real.length ? `<h3 class="pf-h">Closed positions</h3><div class="tbl-wrap"><table class="mc-tbl pf-tbl"><thead><tr><th>Company</th><th class="n">Shares</th><th class="n">Entry</th><th class="n">Exit</th><th>Held</th><th class="n">P/L</th><th class="n">P/L %</th></tr></thead><tbody>
        ${B.real.map(r => `<tr class="clk" data-id="${r.p.id}"><td><b>${esc(r.p.ticker.replace('.JO', ''))}</b> <small>${esc(r.p.name || '')}</small></td><td class="n">${num(r.p.qty, r.p.qty % 1 ? 4 : 0)}</td><td class="n">${money(r.p.entry_price, r.c)}</td><td class="n">${money(r.p.exit_price, r.c)}</td><td>${r.p.entry_date ? day(r.p.entry_date) : '—'} → ${day(r.p.closed_on)}</td><td class="n ${cls(r.bpl)}">${money(r.bpl, base, 0)}</td><td class="n ${cls(r.plp)}">${pct(r.plp)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="src-note">Private to your account: positions and journal are stored in the LRC members database and only you can read them (POPIA). Values in other currencies are converted at the latest USD/ZAR rate. Educational tool, not financial advice.</p>`;
    wire();
  };

  /* ---------- forms and drawer ---------- */
  let wrap = null;
  const drawer = html => {
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'sn-wrap'; wrap.innerHTML = '<div class="sn-back"></div><aside class="sn pf-sn" role="dialog" aria-modal="true"><div class="sn-in" id="pfIn"></div></aside>'; document.body.appendChild(wrap); wrap.querySelector('.sn-back').onclick = close; document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); }
    $('pfIn').innerHTML = html; document.documentElement.classList.add('sn-lock'); requestAnimationFrame(() => wrap.classList.add('open')); wrap.querySelector('.sn').scrollTop = 0;
    const x = $('pfIn').querySelector('.sn-x'); if (x) x.onclick = close;
  };
  const close = () => { if (wrap) { wrap.classList.remove('open'); document.documentElement.classList.remove('sn-lock'); } };
  const err = (m) => { const e = $('pfErr'); if (e) e.textContent = m; };

  const addForm = (p) => {
    const edit = !!p;
    drawer(`<div class="sn-top"><div><span class="pf-kick">${edit ? 'EDIT POSITION' : 'NEW POSITION'}</span><h2>${edit ? esc(p.ticker.replace('.JO', '')) : 'Add a holding'}</h2></div><button class="sn-x" aria-label="Close">×</button></div>
      <form class="pf-form" id="pfF">
        <label>Company<input id="fT" list="pfList" placeholder="Type a name or ticker, e.g. Naspers or AAPL" value="${edit ? esc(p.ticker) : ''}" ${edit ? 'readonly' : ''} required autocomplete="off"></label><datalist id="pfList"></datalist>
        <p class="pf-pick" id="fInfo"></p>
        <div class="pf-grid2"><label>Entry price (per share)<input id="fE" type="number" step="any" min="0" required value="${edit ? p.entry_price : ''}"></label><label>Entry date<input id="fD" type="date" value="${edit ? (p.entry_date || '') : new Date().toISOString().slice(0, 10)}"></label></div>
        <div class="seg pf-mode" id="fM"><button type="button" data-v="q" class="on">Number of shares</button><button type="button" data-v="v">Position value</button></div>
        <label id="fQl">Number of shares<input id="fQ" type="number" step="any" min="0" value="${edit ? p.qty : ''}"></label>
        <label id="fVl" hidden>Value invested (in the share's currency)<input id="fV" type="number" step="any" min="0"></label>
        <label>Thesis: why do you own it?<textarea id="fTh" rows="3" maxlength="4000" placeholder="e.g. 'Rand hedge with 20% earnings growth; buying below fair value. Sell if margins fall two results in a row.'">${edit ? esc(p.thesis || '') : ''}</textarea></label>
        <div class="pf-grid3"><label>Target range low<input id="fTl" type="number" step="any" value="${edit && ok(p.target_low) ? p.target_low : ''}"></label><label>Target range high<input id="fTh2" type="number" step="any" value="${edit && ok(p.target_high) ? p.target_high : ''}"></label><label>Review / stop level<input id="fS" type="number" step="any" value="${edit && ok(p.stop) ? p.stop : ''}"></label></div>
        <p class="pf-err" id="pfErr"></p><button class="btn btn-gold">${edit ? 'Save changes' : 'Add to my book'}</button></form>`);
    const list = $('pfList'), all = Object.values(IDX);
    let autoE = false;
    let picked = edit ? IDX[p.ticker] || { t: p.ticker, n: p.name, m: p.market, cur: p.currency } : null, mode = 'q';
    const info = () => { const i = picked; $('fInfo').innerHTML = i ? `<b>${esc(i.n || i.t)}</b> · ${i.m === 'US' ? 'New York' : 'JSE'} · ${i.cur || ''}${ok((Q[i.t] || [])[0] ?? i.px) ? ` · last ${money((Q[i.t] || [])[0] ?? i.px, i.cur)}` : ''}${i.v ? ` · LRC <span class="pill ${gcls(i.v)}">${esc(grade(i.v))}</span>` : ''}` : ''; };
    info();
    $('fT').oninput = e => {
      const s = e.target.value.trim().toUpperCase(); if (s.length < 1) { list.innerHTML = ''; return; }
      const hits = all.filter(i => i.t.toUpperCase().startsWith(s) || (i.n || '').toUpperCase().includes(s)).slice(0, 12);
      list.innerHTML = hits.map(i => `<option value="${esc(i.t)}">${esc(i.n)} (${i.m === 'US' ? 'NY' : 'JSE'})</option>`).join('');
      picked = IDX[s] || IDX[s + '.JO'] || null; info();
      if (picked && (!$('fE').value || autoE)) { const lp = (Q[picked.t] || [])[0] ?? picked.px; if (ok(lp)) { $('fE').value = lp; autoE = true; } }
    };
    $('fE').oninput = () => { autoE = false; };
    $('fM').querySelectorAll('button').forEach(b => b.onclick = () => { mode = b.dataset.v; $('fM').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('fQl').hidden = mode !== 'q'; $('fVl').hidden = mode !== 'v'; });
    $('pfF').onsubmit = async ev => {
      ev.preventDefault(); err('');
      const raw = $('fT').value.trim().toUpperCase(), i = picked || IDX[raw] || IDX[raw + '.JO'];
      const t = i ? i.t : raw; if (!/^[A-Z0-9.\-^=]{1,20}$/.test(t)) return err('Enter a valid ticker.');
      const e = +$('fE').value; if (!(e > 0)) return err('Enter your entry price.');
      const qty = mode === 'q' ? +$('fQ').value : +$('fV').value / e; if (!(qty > 0)) return err(mode === 'q' ? 'Enter the number of shares.' : 'Enter the value invested.');
      const m = i ? i.m : (t.endsWith('.JO') ? 'JSE' : 'US');
      const row = { ticker: t, name: i ? i.n : null, market: m, currency: i && i.cur ? i.cur : (m === 'US' ? 'USD' : 'ZAR'), qty, entry_price: e, entry_date: $('fD').value || null,
        thesis: $('fTh').value.trim() || null, target_low: ok($('fTl').value) && $('fTl').value !== '' ? +$('fTl').value : null, target_high: $('fTh2').value !== '' ? +$('fTh2').value : null, stop: $('fS').value !== '' ? +$('fS').value : null };
      const q = edit ? sb.from('portfolio_positions').update(row).eq('id', p.id) : sb.from('portfolio_positions').insert(row);
      const { error } = await q; if (error) return err(error.message);
      if (!edit) await sb.from('portfolio_journal').insert({ ticker: t, kind: 'trade', body: `Bought ${num(qty, qty % 1 ? 4 : 0)} × ${t.replace('.JO', '')} at ${money(e, row.currency)} (${money(qty * e, row.currency)}).${row.thesis ? ' Thesis: ' + row.thesis : ''}`.slice(0, 4000) });
      close(); await reload();
    };
  };

  const posView = id => {
    const p = POS.find(x => x.id === id); if (!p) return;
    const i = IDX[p.ticker] || {}, pr = price(p), c = p.currency || i.cur || 'ZAR', n = NEWS[p.ticker] || {};
    const px = p.closed_on ? p.exit_price : (pr.px ?? p.entry_price), plp = px / p.entry_price - 1;
    const jr = JRN.filter(j => j.ticker === p.ticker);
    drawer(`<div class="sn-top"><div><span class="sn-tk">${esc(p.ticker.replace('.JO', ''))}</span><span class="sn-mk">${p.market === 'US' ? 'New York' : 'JSE'}${p.closed_on ? ' · closed' : ''}</span><h2>${esc(p.name || i.n || p.ticker)}</h2><small>${num(p.qty, p.qty % 1 ? 4 : 0)} shares · entry ${money(p.entry_price, c)}${p.entry_date ? ' on ' + day(p.entry_date) : ''}</small></div>
        <div class="sn-px"><b>${money(px, c)}</b><span class="${cls(plp)}">${pct(plp)} since entry</span><small>${p.closed_on ? 'exit ' + day(p.closed_on) : 'today ' + pct(pr.chg)}</small></div><button class="sn-x" aria-label="Close">×</button></div>
      <div class="pf-kpis sm"><div><span>Value</span><b>${money(p.qty * px, c, 0)}</b></div><div><span>P/L</span><b class="${cls(plp)}">${money(p.qty * (px - p.entry_price), c, 0)}</b></div>
        <div><span>LRC grade</span><b>${i.v ? `<span class="pill ${gcls(i.v)}">${esc(grade(i.v))}</span>` : '—'}</b><small>${i.score ? 'score ' + i.score : ''}</small></div><div><span>Next results</span><b>${n.next_results ? day(n.next_results) : '—'}</b></div></div>
      ${ok(p.target_low) || ok(p.stop) ? `<p class="pf-p">${ok(p.target_low) ? `Your target range: <b>${money(p.target_low, c)}${ok(p.target_high) ? '–' + money(p.target_high, c) : ''}</b> (${pct(p.target_low / px - 1)} to the low end). ` : ''}${ok(p.stop) ? `Review level: <b>${money(p.stop, c)}</b> (${pct(p.stop / px - 1)}).` : ''}</p>` : ''}
      <h3 class="ev-h3">Thesis</h3><p class="pf-p">${p.thesis ? esc(p.thesis) : '<span class="muted">No thesis written yet. Edit the position to add one.</span>'}</p>
      <div class="pf-acts"><a class="btn btn-ghost" href="${BASE}stock.html?t=${encodeURIComponent(p.ticker)}">One-page summary</a><button class="btn btn-ghost" id="pvEdit">Edit</button>${p.closed_on ? '' : '<button class="btn btn-ghost" id="pvClose">Close position</button>'}<button class="btn btn-ghost pf-danger" id="pvDel">Delete</button></div>
      <div id="pvCloseF" hidden><form class="pf-form" id="pvCF"><div class="pf-grid2"><label>Exit price<input id="cE" type="number" step="any" min="0" value="${ok(pr.px) ? pr.px : ''}" required></label><label>Exit date<input id="cD" type="date" value="${new Date().toISOString().slice(0, 10)}"></label></div><label>Why are you selling?<textarea id="cW" rows="2" maxlength="2000" placeholder="e.g. 'Target reached' or 'Thesis broken: margins fell two results in a row.'"></textarea></label><p class="pf-err" id="pfErr"></p><button class="btn btn-gold">Close position</button></form></div>
      <h3 class="ev-h3">Journal for ${esc(p.ticker.replace('.JO', ''))}</h3>${jr.length ? jr.map(j => `<div class="pf-je"><div class="pf-jd">${day(j.created_at)}</div><div><span class="pf-kind k-${esc(j.kind)}">${esc(KINDS[j.kind] || j.kind)}</span><p>${esc(j.body)}</p></div></div>`).join('') : '<p class="muted">No entries yet.</p>'}
      <h3 class="ev-h3">News</h3>${(n.news || []).length ? `<ul class="pf-news">${n.news.slice(0, 15).map(x => `<li class="${(n.alerts || []).some(a => a.url === x.url) ? 'mv' : ''}"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a><small>${esc(x.source || '')} · ${x.published ? ago(x.published) : ''}</small></li>`).join('')}</ul>` : '<p class="muted">News appears within 30 minutes of adding a company.</p>'}`);
    $('pvEdit').onclick = () => addForm(p);
    if ($('pvClose')) $('pvClose').onclick = () => { $('pvCloseF').hidden = false; $('cE').focus(); };
    if ($('pvCF')) $('pvCF').onsubmit = async ev => {
      ev.preventDefault(); const e = +$('cE').value; if (!(e > 0)) return err('Enter the exit price.');
      const { error } = await sb.from('portfolio_positions').update({ exit_price: e, closed_on: $('cD').value || new Date().toISOString().slice(0, 10) }).eq('id', p.id); if (error) return err(error.message);
      await sb.from('portfolio_journal').insert({ ticker: p.ticker, kind: 'trade', body: `Sold ${num(p.qty, p.qty % 1 ? 4 : 0)} × ${p.ticker.replace('.JO', '')} at ${money(e, c)} (${pct(e / p.entry_price - 1)} on entry ${money(p.entry_price, c)}).${$('cW').value.trim() ? ' Reason: ' + $('cW').value.trim() : ''}`.slice(0, 4000) });
      close(); await reload();
    };
    $('pvDel').onclick = async () => { if (!confirm(`Delete ${p.ticker.replace('.JO', '')} from your book? This cannot be undone.`)) return; await sb.from('portfolio_positions').delete().eq('id', p.id); close(); await reload(); };
  };

  const csv = () => {
    const B = book(), lines = [['Ticker', 'Company', 'Market', 'Currency', 'Shares', 'Entry price', 'Entry date', 'Last price', 'Value', 'P/L', 'P/L %', 'Status', 'Exit price', 'Closed on', 'Thesis']];
    POS.forEach(p => { const r = B.rows.find(x => x.p.id === p.id); lines.push([p.ticker, p.name || '', p.market, p.currency, p.qty, p.entry_price, p.entry_date || '', r ? r.px : '', r ? r.val.toFixed(2) : '', r ? r.pl.toFixed(2) : '', r ? (r.plp * 100).toFixed(2) : '', p.closed_on ? 'Closed' : 'Open', p.exit_price || '', p.closed_on || '', p.thesis || '']); });
    const s = lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = 'LRC_portfolio_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };

  const wire = () => {
    [$('pfAddBtn'), $('pfAdd2')].forEach(b => b && (b.onclick = () => addForm()));
    if ($('pfCsv')) $('pfCsv').onclick = csv;
    root.querySelectorAll('#pfBase button').forEach(b => b.onclick = () => { base = b.dataset.v; store.set('lrc_pf_base', base); render(); });
    root.querySelectorAll('tr.clk').forEach(tr => tr.onclick = () => posView(tr.dataset.id));
    if ($('pfMail')) $('pfMail').onchange = async e => { PROF.portfolio_alerts = e.target.checked; await sb.from('profiles').update({ portfolio_alerts: e.target.checked }).eq('id', user.id); };
    if ($('pfJ')) $('pfJ').onsubmit = async ev => { ev.preventDefault(); const body = $('pfJb').value.trim(); if (!body) return; const { error } = await sb.from('portfolio_journal').insert({ ticker: $('pfJt').value || null, kind: $('pfJk').value, body }); if (!error) { await reloadJ(); render(); } };
    root.querySelectorAll('.pf-del').forEach(b => b.onclick = async () => { if (!confirm('Delete this journal entry?')) return; await sb.from('portfolio_journal').delete().eq('id', b.dataset.j); await reloadJ(); render(); });
  };

  const reloadJ = async () => { const { data } = await sb.from('portfolio_journal').select('*').order('created_at', { ascending: false }).limit(300); JRN = data || []; };
  const reload = async () => {
    const [{ data: pos, error }, , { data: prof }] = await Promise.all([sb.from('portfolio_positions').select('*').order('created_at'), reloadJ(), sb.from('profiles').select('full_name,portfolio_alerts').eq('id', user.id).maybeSingle()]);
    if (error) { root.innerHTML = `<div class="pf-lock"><h2>Portfolio not available yet</h2><p class="muted">${/relation|does not exist|schema cache/i.test(error.message) ? 'The portfolio database is being set up. Please check back shortly.' : esc(error.message)}</p></div>`; return; }
    POS = pos || []; PROF = prof || {};
    await loadNews(); render();
  };

  (async () => {
    try { sb = await client(); const { data: { session } } = await sb.auth.getSession(); if (!session) return locked(); user = session.user; } catch (e) { return locked(); }
    const [ix, et] = await Promise.all([getJ('scan/index.json'), getJ('scan/etfs.json')]);
    if (ix) { const C = ix.cols; ix.rows.forEach(a => { const o = Object.fromEntries(C.map((k, i) => [k, a[i]])); IDX[o.t] = o; }); }
    if (et) et.rows.forEach(e => { if (!IDX[e.t]) IDX[e.t] = { t: e.t, n: (e.full || e.n) + ' (ETF)', m: e.m, cur: e.cur, px: e.px, chg: e.chg, v: e.v, score: e.score, sec: 'ETFs' }; });
    await loadPrices(); await reload();
    setInterval(async () => { if (document.hidden) return; await loadPrices(); await loadNews(); if (!wrap || !wrap.classList.contains('open')) render(); }, 5 * 60 * 1000);
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') locked(); });
  })();
})();
