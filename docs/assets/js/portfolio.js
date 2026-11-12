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

  let BENCH = [], STALE = false, SNAP = [], FLOWS = [], sb = null, user = null, IDX = {}, Q = {}, QGEN = null, NEWS = {}, FX = null, POS = [], JRN = [], PROF = {}, base = store.get('lrc_pf_base', 'ZAR');

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
      const dir = p.side === 'short' ? -1 : 1, px = pr.px ?? p.entry_price, cost = p.qty * p.entry_price, pl = dir * p.qty * (px - p.entry_price), val = cost + pl;
      const dayAmt = ok(pr.chg) ? dir * (p.qty * px - p.qty * px / (1 + pr.chg)) : null;
      return { p, i, pr, c, px, val, cost, pl, plp: pl / cost, dayAmt, dir, bval: toBase(val, c), bcost: toBase(cost, c), bpl: toBase(pl, c), bday: toBase(dayAmt, c) };
    });
    const tv = rows.reduce((a, r) => a + (r.bval || 0), 0), tc = rows.reduce((a, r) => a + (r.bcost || 0), 0), td = rows.reduce((a, r) => a + (r.bday || 0), 0);
    rows.forEach(r => r.w = tv ? (r.bval || 0) / tv : 0);
    rows.sort((a, b) => b.w - a.w);
    const real = closed.map(p => { const c = p.currency || (p.market === 'US' ? 'USD' : 'ZAR'); const pl = (p.side === 'short' ? -1 : 1) * p.qty * ((p.exit_price || p.entry_price) - p.entry_price); return { p, c, pl, plp: pl / (p.qty * p.entry_price), bpl: toBase(pl, c) }; });
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


  /* ---------- account (cash, deposits) and track record ---------- */
  const zar = (x, c) => !ok(x) ? 0 : c === 'USD' ? x * (FX || 16.5) : x;
  const fromZar = x => !ok(x) ? null : base === 'ZAR' ? x : x / (FX || 16.5);
  const acct = B => {
    const cash = zar(+PROF.cash_zar || 0, 'ZAR') + zar(+PROF.cash_usd || 0, 'USD'), hasCash = ok(PROF.cash_zar) || ok(PROF.cash_usd);
    const sum = k => FLOWS.filter(f => f.kind === k).reduce((a, f) => a + zar(+f.amount, f.currency), 0);
    const dep = sum('deposit'), wd = sum('withdrawal'), divs = sum('dividend'), fees = sum('fee'), intr = sum('interest');
    const bookZ = B.rows.reduce((a, r) => a + zar(r.val, r.c), 0);
    return { cash, hasCash, dep, wd, net: dep - wd, divs, fees, intr, bookZ, value: bookZ + cash };
  };
  const acctStrip = B => {
    const A = acct(B), gain = A.net > 0 ? A.value - A.net : null;
    return `<div class="pf-acct"><div><span>Account value</span><b>${money(fromZar(A.value), base, 0)}</b><small>positions ${money(fromZar(A.bookZ), base, 0)} + cash ${A.hasCash ? money(fromZar(A.cash), base, 0) : '<a href="#" id="pfAcct2">add your cash</a>'}</small></div>
      <div><span>Net deposited</span><b>${A.net ? money(fromZar(A.net), base, 0) : '—'}</b><small>${A.dep ? `in ${money(fromZar(A.dep), base, 0)} · out ${money(fromZar(A.wd), base, 0)}` : 'record your deposits to see your true gain'}</small></div>
      <div><span>Total gain on deposits</span><b class="${cls(gain)}">${gain !== null ? money(fromZar(gain), base, 0) : '—'}</b><small class="${cls(gain)}">${gain !== null ? pct(gain / A.net) : 'account value minus money put in'}</small></div>
      <div><span>Income &amp; costs</span><b>${money(fromZar(A.divs + A.intr), base, 0)}</b><small>dividends and interest · fees ${money(fromZar(A.fees), base, 0)}</small></div>
      <div class="pf-acct-btn"><button class="btn btn-gold" data-flow="deposit">+ Deposit</button><button class="btn btn-ghost" data-flow="withdrawal">− Withdrawal</button><button class="btn btn-ghost" id="pfAcct">Cash &amp; history</button></div></div>`;
  };
  const series = B => {
    // daily book value (rand) from the Portfolio Desk, with today replaced by the live value
    const t = new Date().toISOString().slice(0, 10), A = acct(B);
    const pts = SNAP.filter(r => r.d < t).map(r => ({ d: r.d, b: +r.book || 0, inv: +r.invested || 0, f: +r.flow || 0 }));
    const todayFlow = POS.reduce((a, p) => { const c = p.currency || 'ZAR', dir = p.side === 'short' ? -1 : 1; let f = 0;
      if ((p.entry_date || (p.created_at || '').slice(0, 10)) === t) f += zar(p.qty * p.entry_price, c);
      if (p.closed_on === t) f -= zar(p.qty * p.entry_price + dir * p.qty * ((p.exit_price || p.entry_price) - p.entry_price), c); return a + f; }, 0);
    const snapAt = SNAP.reduce((a, r) => r.at > a ? r.at : a, ''), changed = POS.reduce((a, p) => { const x = p.updated_at || p.created_at || ''; return x > a ? x : a; }, '');
    STALE = !!(SNAP.length && changed && snapAt && changed > snapAt);
    if (!STALE && (B.rows.length || pts.length)) pts.push({ d: t, b: A.bookZ, inv: B.rows.reduce((a, r) => a + zar(r.cost, r.c), 0), f: todayFlow, live: true });
    let I = 100; const out = [];
    pts.forEach((p, i) => { const prev = i ? pts[i - 1].b : 0; const r = prev > 0 ? (p.b - p.f) / prev - 1 : 0; I *= 1 + (isFinite(r) && Math.abs(r) < 0.9 ? r : 0); out.push({ ...p, r: i ? r : 0, I }); });
    return out;
  };
  /* ---------- charts (plain SVG) ---------- */
  const COL = { p: '#E2B960', spx: '#5B9BFF', j200: '#2FBF71', inv: '#7d8597', dep: '#9b8cff' };
  const lineChart = (dates, lines, o = {}) => {
    const W = 760, H = o.h || 230, L = 52, R = 10, T = 12, Bm = 26, all = lines.flatMap(l => l.v.filter(ok));
    if (!all.length || dates.length < 2) return '<p class="muted">Not enough history yet.</p>';
    let lo = Math.min(...all, o.zero ? 0 : Infinity), hi = Math.max(...all, o.zero ? 0 : -Infinity); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    const X = i => L + (W - L - R) * i / (dates.length - 1), Y = v => T + (H - T - Bm) * (1 - (v - lo) / (hi - lo));
    const path = v => { let d = '', pen = false; v.forEach((x, i) => { if (!ok(x)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(x).toFixed(1); pen = true; }); return d; };
    const fmt = o.fmt || (v => v.toFixed(0));
    const yt = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = lo + (hi - lo) * f; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`; }).join('');
    const xi = [0, Math.round((dates.length - 1) / 3), Math.round(2 * (dates.length - 1) / 3), dates.length - 1];
    const xt = xi.map((i, k) => `<text x="${X(i)}" y="${H - 8}" class="ax" text-anchor="${k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}">${new Date(dates[i] + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: '2-digit' })}</text>`).join('');
    const base = o.baseLine !== undefined ? `<line x1="${L}" x2="${W - R}" y1="${Y(o.baseLine)}" y2="${Y(o.baseLine)}" stroke="#4a5060" stroke-width="1"/>` : '';
    const ls = lines.map(l => (l.area ? `<path d="${path(l.v)}L${X(dates.length - 1)},${Y(o.zero ? 0 : lo)}L${X(0)},${Y(o.zero ? 0 : lo)}Z" fill="${l.area}"/>` : '') + `<path d="${path(l.v)}" fill="none" stroke="${l.c}" stroke-width="${l.w || 2}" ${l.dash ? 'stroke-dasharray="5 4"' : ''}/>`).join('');
    const mk = (o.marks || []).map(m => { const i = dates.findIndex(d => d >= m.d); if (i < 0) return ''; const up = m.k === 'deposit'; return `<g><title>${esc(m.t)}</title><path d="M${X(i)},${H - Bm - 14} l-6,10 h12z" transform="${up ? '' : `rotate(180 ${X(i)} ${H - Bm - 9})`}" fill="${up ? '#2FBF71' : '#E05A4F'}"/></g>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="pf-chart">${yt}${base}${ls}${mk}${xt}</svg>`;
  };
  const barChart = (labels, sets) => {
    const W = 760, H = 210, L = 46, Bm = 26, T = 10, all = sets.flatMap(s => s.v.filter(ok)); if (!all.length) return '';
    const hi = Math.max(0.01, ...all), lo = Math.min(-0.01, ...all), Y = v => T + (H - T - Bm) * (hi - v) / (hi - lo);
    const gw = (W - L - 8) / labels.length, bw = Math.max(2, gw / (sets.length + 1));
    const bars = labels.map((lb, i) => sets.map((s, k) => { const v = s.v[i]; if (!ok(v)) return ''; const x = L + i * gw + bw * (k + 0.5), y = Y(Math.max(0, v)), h = Math.abs(Y(v) - Y(0));
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.9).toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" fill="${s.c}"><title>${esc(s.n)} ${esc(lb)}: ${pct(v)}</title></rect>`; }).join('') + `<text x="${L + i * gw + gw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${esc(lb)}</text>`).join('');
    const yt = [hi, 0, lo].map(v => `<text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${(v * 100).toFixed(0)}%</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="pf-chart"><line x1="${L}" x2="${W - 8}" y1="${Y(0)}" y2="${Y(0)}" stroke="#4a5060"/>${yt}${bars}</svg>`;
  };
  const legend = items => `<div class="pf-legend">${items.map(([c, t, dash]) => `<span><i ${dash ? 'class="dash"' : `style="background:${c}"`}></i>${t}</span>`).join('')}</div>`;


  /* value vs money put in: blue when above (in profit), red when below (in a drawdown on your money) */
  const pnlChart = (dates, val, bse, marks, fmt) => {
    const W = 760, H = 260, L = 56, R = 10, T = 12, Bm = 26, all = [...val, ...bse].filter(ok);
    if (all.length < 2) return '<p class="muted">Not enough history yet.</p>';
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const X = i => L + (W - L - R) * i / (dates.length - 1), Y = v => T + (H - T - Bm) * (1 - (v - lo) / (hi - lo));
    const UP = '#3B82F6', DN = '#E05A4F'; let fills = '', segs = '';
    for (let i = 1; i < dates.length; i++) {
      const a0 = val[i - 1], a1 = val[i], b0 = bse[i - 1], b1 = bse[i]; if (![a0, a1, b0, b1].every(ok)) continue;
      const d0 = a0 - b0, d1 = a1 - b1, x0 = X(i - 1), x1 = X(i);
      const piece = (xa, va, ba, xb, vb, bb, up) => { fills += `<polygon points="${xa},${Y(va)} ${xb},${Y(vb)} ${xb},${Y(bb)} ${xa},${Y(ba)}" fill="${up ? 'rgba(59,130,246,.22)' : 'rgba(224,90,79,.22)'}"/>`; segs += `<line x1="${xa}" y1="${Y(va)}" x2="${xb}" y2="${Y(vb)}" stroke="${up ? UP : DN}" stroke-width="2.6" stroke-linecap="round"/>`; };
      if ((d0 >= 0) === (d1 >= 0)) piece(x0, a0, b0, x1, a1, b1, d0 + d1 >= 0);
      else { const t = d0 / (d0 - d1), xm = x0 + (x1 - x0) * t, vm = a0 + (a1 - a0) * t, bm = b0 + (b1 - b0) * t; piece(x0, a0, b0, xm, vm, bm, d0 >= 0); piece(xm, vm, bm, x1, a1, b1, d1 >= 0); }
    }
    const bl = bse.map((v, i) => ok(v) ? `${X(i).toFixed(1)},${Y(v).toFixed(1)}` : null).filter(Boolean).join(' ');
    const yt = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = lo + (hi - lo) * f; return `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`; }).join('');
    const xi = [0, Math.round((dates.length - 1) / 3), Math.round(2 * (dates.length - 1) / 3), dates.length - 1];
    const xt = xi.map((i, k) => `<text x="${X(i)}" y="${H - 8}" class="ax" text-anchor="${k === 0 ? 'start' : k === 3 ? 'end' : 'middle'}">${new Date(dates[i] + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: '2-digit' })}</text>`).join('');
    const mk = (marks || []).map(m => { const i = dates.findIndex(d => d >= m.d); if (i < 0) return ''; const up = m.k === 'deposit'; return `<g><title>${esc(m.t)}</title><path d="M${X(i)},${H - Bm - 14} l-6,10 h12z" transform="${up ? '' : `rotate(180 ${X(i)} ${H - Bm - 9})`}" fill="${up ? '#2FBF71' : '#E05A4F'}"/></g>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="pf-chart">${yt}${fills}<polyline points="${bl}" fill="none" stroke="#c9ccd6" stroke-width="1.6" stroke-dasharray="6 4"/>${segs}${mk}${xt}</svg>`;
  };

  /* ---------- analytics maths ---------- */
  const stats = (rs, I0, dates) => {
    const n = rs.length; if (n < 2) return null;
    const mean = rs.reduce((a, x) => a + x, 0) / n, sd = Math.sqrt(rs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
    const tot = I0[I0.length - 1] / I0[0] - 1, yrs = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 3.156e10;
    let pk = -Infinity, dd = 0; I0.forEach(v => { pk = Math.max(pk, v); dd = Math.max(dd, 1 - v / pk); });
    const cagr = yrs >= 0.25 ? Math.pow(1 + tot, 1 / yrs) - 1 : null, vol = sd * Math.sqrt(252);
    return { tot, cagr, vol, dd, sharpe: cagr !== null && vol ? (cagr - RF) / vol : null };
  };
  const RF = 0.07; // South African cash / T-bill rate used for the Sharpe ratio
  const reg = (y, x) => { const n = Math.min(y.length, x.length); if (n < 20) return {}; const my = y.reduce((a, v) => a + v, 0) / n, mx = x.reduce((a, v) => a + v, 0) / n;
    let c = 0, vx = 0, vy = 0; for (let i = 0; i < n; i++) { c += (y[i] - my) * (x[i] - mx); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; } return { beta: vx ? c / vx : null, corr: vx && vy ? c / Math.sqrt(vx * vy) : null }; };

  let RNG = store.get('lrc_pf_rng', 'ALL');
  const perfSection = B => {
    const S0 = series(B);
    if (S0.length < 2) return S0.length ? `<h3 class="pf-h">Performance &amp; track record</h3><p class="muted">Your daily track record starts building tonight: the Portfolio Desk records your book every day from closing prices (and back-fills from your entry dates).</p>` : '';
    const last0 = S0[S0.length - 1], before = d => { let v = null; for (const p of S0) { if (p.d < d) v = p; else break; } return v; }, at = d => { let v = null; for (const p of S0) { if (p.d <= d) v = p; else break; } return v; };
    const ds = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    const y0 = new Date().getFullYear() + '-01-01', m0 = new Date().toISOString().slice(0, 8) + '01';
    const ret = p => p && p !== last0 ? last0.I / p.I - 1 : null;
    const per = [['Today', last0.r], ['1 week', ret(at(ds(7)))], ['This month', ret(before(m0)) ?? last0.I / S0[0].I - 1], ['3 months', ret(at(ds(91)))], ['This year', ret(before(y0)) ?? last0.I / S0[0].I - 1], ['Since start', last0.I / 100 - 1]];
    // range for the charts
    const RS = { '1M': ds(31), '3M': ds(92), '6M': ds(183), 'YTD': y0, '1Y': ds(366), 'ALL': '0000' };
    const S = S0.filter(p => p.d >= RS[RNG]); if (S.length < 2) S.unshift(...S0.slice(-2, -1));
    const dates = S.map(p => p.d);
    // benchmarks aligned to our dates (forward-filled), S&P 500 in rand so it compares like with like
    const bmap = {}; BENCH.forEach(r => bmap[r.d] = r); let lb = {};
    const BA = dates.map(d => { const r = bmap[d]; if (r) lb = { spx: r.spx ?? lb.spx, j200: r.j200 ?? lb.j200, fx: r.usdzar ?? lb.fx }; return { ...lb }; });
    const reb = arr => { const f = arr.find(ok); return arr.map(v => ok(v) && f ? v / f * 100 : null); };
    const pI = reb(S.map(p => p.I)), spI = reb(BA.map(b => ok(b.spx) && ok(b.fx) ? b.spx * b.fx : null)), jI = reb(BA.map(b => b.j200));
    const hasB = spI.some(ok) || jI.some(ok);
    const dr = arr => arr.slice(1).map((v, i) => ok(v) && ok(arr[i]) ? v / arr[i] - 1 : 0);
    const rp = dr(pI), rs = dr(spI), rj = dr(jI);
    const stP = stats(rp, pI, dates), stS = spI.some(ok) ? stats(rs, spI.map((v, i) => v ?? spI.find(ok)), dates) : null, stJ = jI.some(ok) ? stats(rj, jI.map(v => v ?? jI.find(ok)), dates) : null;
    const bS = reg(rp, rs), bJ = reg(rp, rj);
    const alpha = (st, bt, sb) => st && sb && ok(bt.beta) && st.cagr !== null && sb.cagr !== null ? st.cagr - (RF + bt.beta * (sb.cagr - RF)) : null;
    // drawdown series
    let pk = -Infinity; const ddv = pI.map(v => { pk = Math.max(pk, v); return v / pk - 1; });
    let pk2 = -Infinity; const ddS = spI.map(v => { if (!ok(v)) return null; pk2 = Math.max(pk2, v); return v / pk2 - 1; });
    let pk3 = -Infinity; const ddJ = jI.map(v => { if (!ok(v)) return null; pk3 = Math.max(pk3, v); return v / pk3 - 1; });
    // money: book value, invested, cumulative net deposits, markers
    const fl = FLOWS.filter(f => f.kind === 'deposit' || f.kind === 'withdrawal').slice().sort((a, b) => a.flow_date.localeCompare(b.flow_date));
    const cum = dates.map(d => fl.filter(f => f.flow_date <= d).reduce((a, f) => a + (f.kind === 'deposit' ? 1 : -1) * zar(+f.amount, f.currency), 0));
    const marks = fl.filter(f => f.flow_date >= dates[0]).map(f => ({ d: f.flow_date, k: f.kind, t: `${f.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} ${money(+f.amount, f.currency)} on ${day(f.flow_date)}` }));
    const mfmt = v => (base === 'ZAR' ? 'R' : '$') + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'k' : Math.round(v));
    // monthly
    const months = {}; S0.forEach(p => { const k = p.d.slice(0, 7); months[k] = months[k] || {}; months[k].last = p; });
    const keys = Object.keys(months).sort(), mret = {}; keys.forEach((k, i) => { mret[k] = months[k].last.I / (i ? months[keys[i - 1]].last.I : 100) - 1; });
    const mb = (field) => { const out = {}; let prev = null; const mm = {}; BENCH.forEach(r => { const v = field(r); if (ok(v)) mm[r.d.slice(0, 7)] = v; }); Object.keys(mm).sort().forEach(k => { if (prev !== null) out[k] = mm[k] / prev - 1; prev = mm[k]; }); return out; };
    const mS = mb(r => ok(r.spx) && ok(r.usdzar) ? r.spx * r.usdzar : null), mJ = mb(r => r.j200);
    const lastK = keys.slice(-12), MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const years = [...new Set(keys.map(k => k.slice(0, 4)))].sort().reverse(), ytd = y => keys.filter(k => k.startsWith(y)).reduce((a, k) => a * (1 + mret[k]), 1) - 1;
    const posM = keys.length ? keys.filter(k => mret[k] > 0).length / keys.length : null;
    const bestM = keys.reduce((a, k) => !a || mret[k] > mret[a] ? k : a, null), worstM = keys.reduce((a, k) => !a || mret[k] < mret[a] ? k : a, null);
    const ml = k => MN[+k.slice(5) - 1] + ' ' + k.slice(2, 4);
    const pf = v => ok(v) ? pct(v) : '—', nf = (v, d = 2) => ok(v) ? v.toFixed(d) : '—';
    const row = (k, a, b, c, good) => `<tr><td>${k}</td><td class="n"><b class="${good ? cls(a) : ''}">${a === null || a === undefined ? '—' : typeof a === 'number' ? (good === 'x' ? nf(a) : pct(a)) : a}</b></td><td class="n">${b === null || b === undefined ? '—' : typeof b === 'number' ? (good === 'x' ? nf(b) : pct(b)) : b}</td><td class="n">${c === null || c === undefined ? '—' : typeof c === 'number' ? (good === 'x' ? nf(c) : pct(c)) : c}</td></tr>`;
    const rngBtns = `<div class="seg pf-rng" id="pfRng">${Object.keys(RS).map(k => `<button data-v="${k}" class="${k === RNG ? 'on' : ''}">${k === 'ALL' ? 'All' : k}</button>`).join('')}</div>`;
    return `<h3 class="pf-h">Performance &amp; track record</h3>${STALE ? '<p class="pf-upd">⟳ Updating your track record after your latest changes. The full history refreshes within 30 minutes; figures below are up to the last update.</p>' : ''}
      <div class="pf-per">${per.map(([k, v]) => `<div><span>${k}</span><b class="${cls(v)}">${pct(v, k === 'Today' ? 2 : 1)}</b></div>`).join('')}</div>
      <div class="pf-chartbox"><div class="pf-ch-h"><b>Growth of 100 vs the market</b>${rngBtns}</div>${legend([[COL.p, 'My portfolio ' + pf(pI[pI.length - 1] / 100 - 1)], ...(hasB ? [[COL.spx, 'S&amp;P 500 (in rand) ' + pf(ok(spI[spI.length - 1]) ? spI[spI.length - 1] / 100 - 1 : null)], [COL.j200, 'SA Top 40 ' + pf(ok(jI[jI.length - 1]) ? jI[jI.length - 1] / 100 - 1 : null)]] : [])])}
        ${lineChart(dates, [{ v: spI, c: COL.spx, w: 1.6 }, { v: jI, c: COL.j200, w: 1.6 }, { v: pI, c: COL.p, w: 2.6 }], { baseLine: 100, fmt: v => v.toFixed(0) })}
        ${hasB ? '' : '<p class="muted">Benchmark lines appear after the Portfolio Desk\'s next run.</p>'}</div>
      ${(() => { const useDep = fl.length > 0, bse = useDep ? cum : S.map(p => p.inv), val = S.map(p => p.b), lv = val[val.length - 1], lb = bse[bse.length - 1], gap = lv - lb, up = gap >= 0;
        return `<div class="pf-chartbox pf-main"><div class="pf-ch-h"><b>My performance: value vs ${useDep ? 'money deposited' : 'money invested'}</b><span class="pf-gap ${up ? 'blue' : 'red'}">${up ? 'Above' : 'Below'} ${useDep ? 'deposits' : 'invested'} by ${money(fromZar(Math.abs(gap)), base, 0)} (${pct(lb ? gap / lb : null)})</span></div>
          ${legend([['#3B82F6', 'Value above what you put in'], ['#E05A4F', 'Value below what you put in (drawdown)'], ['#c9ccd6', useDep ? 'Net deposits' : 'Money invested', 1]])}
          ${pnlChart(dates, val.map(fromZar), bse.map(fromZar), marks, mfmt)}
          <p class="pf-note">${useDep ? 'Book value of your positions against the money you have deposited (deposits minus withdrawals). ▲ deposit · ▼ withdrawal (hover for the amount).' : 'Book value of your positions against the money you put into them. Add your deposits and withdrawals (buttons at the top) to measure against your deposits instead.'}</p></div>`; })()}
      <div class="pf-chartbox"><div class="pf-ch-h"><b>Drawdown: fall from the last high</b></div>${legend([['#E05A4F', 'My portfolio'], ...(hasB ? [[COL.spx, 'S&amp;P 500'], [COL.j200, 'SA Top 40']] : [])])}
        ${lineChart(dates, [{ v: ddS, c: COL.spx, w: 1.2 }, { v: ddJ, c: COL.j200, w: 1.2 }, { v: ddv, c: '#E05A4F', w: 2, area: 'rgba(224,90,79,.15)' }], { zero: true, fmt: v => (v * 100).toFixed(0) + '%', h: 190 })}
        <p class="pf-note">How far each was below its previous peak. Shallower is better.</p></div>
      <div class="pf-chartbox"><div class="pf-ch-h"><b>Monthly returns vs the market (last 12 months)</b></div>${legend([[COL.p, 'My portfolio'], [COL.spx, 'S&amp;P 500 (rand)'], [COL.j200, 'SA Top 40']])}
        ${barChart(lastK.map(ml), [{ n: 'Portfolio', c: COL.p, v: lastK.map(k => mret[k]) }, { n: 'S&P 500', c: COL.spx, v: lastK.map(k => mS[k]) }, { n: 'SA Top 40', c: COL.j200, v: lastK.map(k => mJ[k]) }])}</div>
      <h3 class="pf-h">Portfolio analytics <small class="muted">(${RNG === 'ALL' ? 'since start' : RNG} · ${dates.length} trading days)</small></h3>
      <div class="pf-two"><div class="tbl-wrap"><table class="mc-tbl pf-an"><thead><tr><th>Risk and return</th><th class="n">My portfolio</th><th class="n">S&amp;P 500 (R)</th><th class="n">SA Top 40</th></tr></thead><tbody>
        ${row('Total return', stP && stP.tot, stS && stS.tot, stJ && stJ.tot, 1)}
        ${row('Annualised return', stP && stP.cagr, stS && stS.cagr, stJ && stJ.cagr, 1)}
        ${row('Volatility (a year)', stP && (stP.vol * 100).toFixed(1) + '%', stS && (stS.vol * 100).toFixed(1) + '%', stJ && (stJ.vol * 100).toFixed(1) + '%')}
        ${row('Worst drawdown', stP && -stP.dd, stS && -stS.dd, stJ && -stJ.dd)}
        ${row('Sharpe ratio', stP && stP.sharpe, stS && stS.sharpe, stJ && stJ.sharpe, 'x')}
        ${row('Beta to the index', null, bS.beta, bJ.beta, 'x')}
        ${row('Correlation', null, bS.corr, bJ.corr, 'x')}
        ${row('Alpha (a year)', null, alpha(stP, bS, stS), alpha(stP, bJ, stJ))}</tbody></table>
        <p class="pf-note"><b>Sharpe</b> = return above cash (7%) per unit of risk; above 1 is good. <b>Beta</b> 1 = moves like the index, below 1 = calmer. <b>Alpha</b> = return beyond what the market explains. Annualised figures need at least 3 months of history.</p></div>
        <div><div class="pf-stats">
          ${['Positive months', 'Best month', 'Worst month', 'Months tracked'].map((k, i) => `<div><span>${k}</span><b>${[posM !== null ? Math.round(posM * 100) + '%' : '—', bestM ? pct(mret[bestM]) : '—', worstM ? pct(mret[worstM]) : '—', keys.length][i]}</b><small>${['', bestM ? ml(bestM) : '', worstM ? ml(worstM) : '', ''][i]}</small></div>`).join('')}</div>
          ${exposure(B)}</div></div>
      <div class="pf-two"><div><h3 class="pf-h sm">Monthly returns</h3><div class="tbl-wrap"><table class="mc-tbl pf-mtbl"><thead><tr><th>Year</th>${MN.map(m => `<th class="n">${m}</th>`).join('')}<th class="n">Year</th></tr></thead><tbody>
        ${years.map(y => `<tr><td><b>${y}</b></td>${MN.map((m, i) => { const k = `${y}-${String(i + 1).padStart(2, '0')}`, v = mret[k]; return `<td class="n ${cls(v)}" ${ok(v) ? `style="background:${v > 0 ? `rgba(47,191,113,${Math.min(0.45, Math.abs(v) * 4)})` : `rgba(196,74,61,${Math.min(0.45, Math.abs(v) * 4)})`}"` : ''}>${ok(v) ? (v * 100).toFixed(1) : ''}</td>`; }).join('')}<td class="n ${cls(ytd(y))}"><b>${pct(ytd(y))}</b></td></tr>`).join('')}</tbody></table></div>
        ${contrib(B)}</div>
        <div><h3 class="pf-h sm">Trading record</h3>${tradeRecord()}</div></div>
      <p class="src-note">Returns are time-weighted (deposits, withdrawals and new money into positions do not count as gains or losses) and measured in rand from daily closing prices recorded by the LRC Portfolio Desk; today uses live prices. The S&amp;P 500 is converted to rand so it compares like with like; the SA Top 40 uses the Satrix 40 ETF (price only, before dividends). Educational analytics, not advice.</p>`;
  };
  const exposure = B => {
    const R = B.rows, tot = R.reduce((a, r) => a + zar(r.p.qty * r.px, r.c), 0) || 1, A = acct(B);
    const lng = R.filter(r => r.p.side !== 'short').reduce((a, r) => a + zar(r.p.qty * r.px, r.c), 0), sh = R.filter(r => r.p.side === 'short').reduce((a, r) => a + zar(r.p.qty * r.px, r.c), 0);
    const usd = R.filter(r => r.c === 'USD').reduce((a, r) => a + zar(r.p.qty * r.px, r.c), 0);
    const kind = r => r.p.ticker.includes('=F') ? 'Commodities' : r.p.ticker.startsWith('^') ? 'Indices' : (r.i.sec === 'ETFs' ? 'ETFs' : 'Shares');
    const k = {}; R.forEach(r => { const x = kind(r); k[x] = (k[x] || 0) + zar(r.p.qty * r.px, r.c); });
    const top5 = R.slice().sort((a, b) => b.w - a.w).slice(0, 5).reduce((a, r) => a + r.w, 0);
    const eq = A.value || 1;
    return `<h3 class="pf-h sm">Exposure</h3><div class="pf-stats">
      <div><span>Long exposure</span><b>${money(fromZar(lng), base, 0)}</b><small>${pct(lng / eq).replace('+', '')} of account</small></div>
      <div><span>Short exposure</span><b>${money(fromZar(sh), base, 0)}</b><small>${pct(sh / eq).replace('+', '')} of account</small></div>
      <div><span>Gross / net</span><b>${((lng + sh) / eq * 100).toFixed(0)}% / ${((lng - sh) / eq * 100).toFixed(0)}%</b><small>gross over 100% means leverage</small></div>
      <div><span>Dollar exposure</span><b>${(usd / tot * 100).toFixed(0)}%</b><small>rand hedge: ${(usd / tot * 100).toFixed(0)}% of positions in USD</small></div>
      <div><span>Top 5 holdings</span><b>${(top5 * 100).toFixed(0)}%</b><small>of the book (concentration)</small></div>
      <div><span>Asset mix</span><b class="sm">${Object.entries(k).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${(v / tot * 100).toFixed(0)}%`).join(' · ') || '—'}</b></div></div>`;
  };
  const contrib = B => {
    const m = {}; B.rows.forEach(r => { m[r.p.ticker] = (m[r.p.ticker] || 0) + zar(r.pl, r.c); });
    POS.filter(p => p.closed_on).forEach(p => { const c = p.currency || 'ZAR', dir = p.side === 'short' ? -1 : 1; m[p.ticker] = (m[p.ticker] || 0) + zar(dir * p.qty * ((p.exit_price || p.entry_price) - p.entry_price), c); });
    const L = Object.entries(m).sort((a, b) => b[1] - a[1]); if (!L.length) return '';
    const mx = Math.max(...L.map(x => Math.abs(x[1]))) || 1, top = L.slice(0, 5), bot = L.slice(-5).reverse().filter(x => x[1] < 0 && !top.includes(x));
    const bar = ([t, v]) => `<div class="pf-cbar"><span>${esc(t.replace('.JO', ''))}</span><i><i class="${v >= 0 ? 'p' : 'n'}" style="width:${(Math.abs(v) / mx * 100).toFixed(1)}%"></i></i><b class="${cls(v)}">${money(fromZar(v), base, 0)}</b></div>`;
    return `<h3 class="pf-h sm">What made and lost money</h3>${top.map(bar).join('')}${bot.length ? bot.map(bar).join('') : ''}<p class="pf-note">Open and closed profit/loss per company since you started.</p>`;
  };
  const tradeRecord = () => {
    const cl = POS.filter(p => p.closed_on).map(p => { const dir = p.side === 'short' ? -1 : 1, c = p.currency || 'ZAR'; const pl = dir * p.qty * ((p.exit_price || p.entry_price) - p.entry_price);
      return { p, pl: zar(pl, c), r: pl / (p.qty * p.entry_price), days: p.entry_date ? (new Date(p.closed_on) - new Date(p.entry_date)) / 864e5 : null }; });
    const wins = cl.filter(x => x.pl > 0), losses = cl.filter(x => x.pl < 0), gw = wins.reduce((a, x) => a + x.pl, 0), gl = -losses.reduce((a, x) => a + x.pl, 0);
    const avg = xs => xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;
    const traded = POS.reduce((a, p) => { const c = p.currency || 'ZAR'; return a + zar(p.qty * p.entry_price, c) + (p.closed_on ? zar(p.qty * (p.exit_price || p.entry_price), c) : 0); }, 0);
    const bt = cl.slice().sort((a, b) => b.r - a.r), stat = (k, v, s) => `<div><span>${k}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
    const hold = avg(cl.map(x => x.days).filter(ok)), exp = cl.length ? (gw - gl) / cl.length : null;
    return `<div class="pf-stats">${stat('Total traded', money(fromZar(traded), base, 0), `${POS.length} trades · ${cl.length} closed`)}
      ${stat('Win rate', cl.length ? Math.round(wins.length / cl.length * 100) + '%' : '—', `${wins.length} wins · ${losses.length} losses`)}
      ${stat('Average win', wins.length ? pct(avg(wins.map(x => x.r))) : '—', wins.length ? money(fromZar(gw / wins.length), base, 0) : '')}
      ${stat('Average loss', losses.length ? pct(avg(losses.map(x => x.r))) : '—', losses.length ? money(fromZar(-gl / losses.length), base, 0) : '')}
      ${stat('Profit factor', gl > 0 ? (gw / gl).toFixed(2) : wins.length ? '∞' : '—', 'gross wins ÷ gross losses')}
      ${stat('Expectancy', exp !== null ? money(fromZar(exp), base, 0) : '—', 'average profit per closed trade')}
      ${stat('Average holding', hold !== null ? Math.round(hold) + ' days' : '—', '')}
      ${stat('Realised profit', money(fromZar(gw - gl), base, 0), 'closed trades')}
      ${stat('Best trade', bt[0] ? pct(bt[0].r) : '—', bt[0] ? esc(bt[0].p.ticker.replace('.JO', '')) : '')}
      ${stat('Worst trade', bt.length ? pct(bt[bt.length - 1].r) : '—', bt.length ? esc(bt[bt.length - 1].p.ticker.replace('.JO', '')) : '')}</div>`;
  };
  const acctForm = (e, pre) => {
    if (e && e.preventDefault) e.preventDefault();
    const KF = { deposit: 'Deposit', withdrawal: 'Withdrawal', dividend: 'Dividend received', fee: 'Fee / cost', interest: 'Interest received' };
    drawer(`<div class="sn-top"><div><span class="pf-kick">ACCOUNT</span><h2>Cash &amp; deposits</h2><small>So we can show your account value and your true gain on the money you put in</small></div><button class="sn-x" aria-label="Close">×</button></div>
      <h3 class="ev-h3">Cash in your account now</h3><form class="pf-form" id="caF"><div class="pf-grid2"><label>Rand cash (R)<input id="caZ" type="number" step="any" min="0" value="${ok(PROF.cash_zar) ? PROF.cash_zar : ''}"></label><label>Dollar cash ($)<input id="caU" type="number" step="any" min="0" value="${ok(PROF.cash_usd) ? PROF.cash_usd : ''}"></label></div>
        <p class="pf-err" id="pfErr"></p><button class="btn btn-gold">Save cash</button>${PROF.cash_at ? `<small class="muted">Last updated ${day(PROF.cash_at)}</small>` : ''}</form>
      <h3 class="ev-h3">Money in and out</h3><form class="pf-form" id="flF"><div class="pf-grid3"><label>Type<select id="flK">${Object.entries(KF).map(([k, l]) => `<option value="${k}" ${k === pre ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Amount<input id="flA" type="number" step="any" min="0" required></label><label>Currency<select id="flC"><option>ZAR</option><option>USD</option></select></label></div>
        <div class="pf-grid2"><label>Date<input id="flD" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Note<input id="flN" maxlength="500" placeholder="optional"></label></div><button class="btn btn-gold">Add</button></form>
      ${FLOWS.length ? `<div class="tbl-wrap"><table class="mc-tbl pf-tbl"><thead><tr><th>Date</th><th>Type</th><th class="n">Amount</th><th>Note</th><th></th></tr></thead><tbody>${FLOWS.map(f => `<tr><td>${day(f.flow_date)}</td><td>${esc(KF[f.kind] || f.kind)}</td><td class="n ${f.kind === 'withdrawal' || f.kind === 'fee' ? 'dn' : 'up'}">${money(+f.amount, f.currency)}</td><td><small>${esc(f.note || '')}</small></td><td><button class="pf-del" data-f="${f.id}" title="Delete">×</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No deposits or withdrawals recorded yet. Add your first deposit (the money you funded the account with) to see your true return.</p>'}`);
    if (pre) setTimeout(() => { const a = $('flA'); if (a) { a.scrollIntoView({ block: 'center' }); a.focus(); } }, 350);
    $('caF').onsubmit = async ev => { ev.preventDefault(); const z = $('caZ').value, u = $('caU').value;
      const { error } = await sb.from('profiles').update({ cash_zar: z === '' ? null : +z, cash_usd: u === '' ? null : +u, cash_at: new Date().toISOString() }).eq('id', user.id); if (error) return err(error.message); close(); await reload(); };
    $('flF').onsubmit = async ev => { ev.preventDefault(); const a = +$('flA').value; if (!(a > 0)) return;
      const { error } = await sb.from('portfolio_flows').insert({ kind: $('flK').value, amount: a, currency: $('flC').value, flow_date: $('flD').value || null, note: $('flN').value.trim() || null }); if (error) return alert(error.message); await reload(); acctForm(); };
    $('pfIn').querySelectorAll('[data-f]').forEach(b => b.onclick = async () => { if (!confirm('Delete this entry?')) return; await sb.from('portfolio_flows').delete().eq('id', b.dataset.f); await reload(); acctForm(); });
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
        <button class="btn btn-gold" id="pfAddBtn">+ Add position</button><button class="btn btn-ghost" id="pfImp" title="Upload your trades from a spreadsheet or broker export">Import trades</button><button class="btn btn-ghost" id="pfCsv" title="Download your positions as a spreadsheet">Export</button></div></div>
      ${acctStrip(B)}
      <div class="pf-kpis">
        <div><span>Positions value</span><b>${money(B.tv, base, 0)}</b><small>${R.length} open position${R.length === 1 ? '' : 's'}${FX ? ` · $1 = R${num(FX, 2)}` : ''}</small></div>
        <div><span>Invested</span><b>${money(B.tc, base, 0)}</b><small>at your entry prices</small></div>
        <div><span>Unrealised P/L</span><b class="${cls(B.pl)}">${money(B.pl, base, 0)}</b><small class="${cls(B.plp)}">${pct(B.plp)}</small></div>
        <div><span>Today</span><b class="${cls(B.td)}">${money(B.td, base, 0)}</b><small class="${cls(B.dayp)}">${pct(B.dayp, 2)}</small></div>
        <div><span>Realised P/L</span><b class="${cls(B.real.reduce((a, r) => a + (r.bpl || 0), 0))}">${money(B.real.reduce((a, r) => a + (r.bpl || 0), 0), base, 0)}</b><small>${B.real.length} closed</small></div>
      </div>
      ${R.length ? `<div class="pf-desk"><span class="pf-kick">DESK NOTE</span><ul>${deskNote(B)}</ul></div>` : `<div class="pf-empty"><h3>Start your book</h3><p>Add the shares you own: the company, your entry price and either the number of shares or the rand/dollar value of the position. Write one line on why you bought it. That is your thesis, and the journal keeps you honest.</p><div class="pf-lock-btns"><button class="btn btn-gold" id="pfAdd2">+ Add your first position</button><button class="btn btn-ghost" id="pfImp2">Import all my trades (CSV)</button></div></div>`}
      ${perfSection(B)}
      ${R.length ? `<h3 class="pf-h">Positions ledger</h3>
      <div class="tbl-wrap"><table class="mc-tbl pf-tbl"><thead><tr><th>Company</th><th class="n">Shares</th><th class="n">Entry</th><th class="n">Last</th><th class="n">Today</th><th class="n">Value (${base === 'ZAR' ? 'R' : '$'})</th><th class="n">Weight</th><th class="n">P/L</th><th class="n">P/L %</th><th>LRC grade</th><th>Next results</th></tr></thead><tbody>
      ${R.map(r => `<tr class="clk" data-id="${r.p.id}"><td><b>${esc(r.p.ticker.replace('.JO', ''))}</b>${r.p.side === 'short' ? ' <span class="pf-short">SHORT</span>' : ''} <small>${esc(r.p.name || r.i.n || '')}</small>${(NEWS[r.p.ticker] || {}).alerts && NEWS[r.p.ticker].alerts.some(a => (Date.now() - new Date(a.at)) < 864e5) ? ' <span class="pf-flag" title="Market-moving news in the last 24 hours">NEWS</span>' : ''}</td>
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
        ${B.real.map(r => `<tr class="clk" data-id="${r.p.id}"><td><b>${esc(r.p.ticker.replace('.JO', ''))}</b>${r.p.side === 'short' ? ' <span class="pf-short">SHORT</span>' : ''} <small>${esc(r.p.name || '')}</small></td><td class="n">${num(r.p.qty, r.p.qty % 1 ? 4 : 0)}</td><td class="n">${money(r.p.entry_price, r.c)}</td><td class="n">${money(r.p.exit_price, r.c)}</td><td>${r.p.entry_date ? day(r.p.entry_date) : '—'} → ${day(r.p.closed_on)}</td><td class="n ${cls(r.bpl)}">${money(r.bpl, base, 0)}</td><td class="n ${cls(r.plp)}">${pct(r.plp)}</td></tr>`).join('')}</tbody></table></div>` : ''}
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
        <div class="seg pf-mode" id="fSd"><button type="button" data-v="long" class="${!edit || p.side !== 'short' ? 'on' : ''}">Long (bought)</button><button type="button" data-v="short" class="${edit && p.side === 'short' ? 'on' : ''}">Short (sold first)</button></div>
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
    let side = edit && p.side === 'short' ? 'short' : 'long';
    $('fSd').querySelectorAll('button').forEach(b => b.onclick = () => { side = b.dataset.v; $('fSd').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
    $('fM').querySelectorAll('button').forEach(b => b.onclick = () => { mode = b.dataset.v; $('fM').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('fQl').hidden = mode !== 'q'; $('fVl').hidden = mode !== 'v'; });
    $('pfF').onsubmit = async ev => {
      ev.preventDefault(); err('');
      const raw = $('fT').value.trim().toUpperCase(), R0 = resolve(raw), i = picked || (R0 && R0.i);
      const t = i ? i.t : (R0 ? R0.t : raw); if (!/^[A-Z0-9.\-^=]{1,20}$/.test(t)) return err('Enter a valid ticker.');
      const e = +$('fE').value; if (!(e > 0)) return err('Enter your entry price.');
      const qty = mode === 'q' ? +$('fQ').value : +$('fV').value / e; if (!(qty > 0)) return err(mode === 'q' ? 'Enter the number of shares.' : 'Enter the value invested.');
      const m = i ? i.m : (t.endsWith('.JO') ? 'JSE' : 'US');
      const row = { side, ticker: t, name: i ? i.n : null, market: m, currency: i && i.cur ? i.cur : (m === 'US' ? 'USD' : 'ZAR'), qty, entry_price: e, entry_date: $('fD').value || null,
        thesis: $('fTh').value.trim() || null, target_low: ok($('fTl').value) && $('fTl').value !== '' ? +$('fTl').value : null, target_high: $('fTh2').value !== '' ? +$('fTh2').value : null, stop: $('fS').value !== '' ? +$('fS').value : null };
      const q = edit ? sb.from('portfolio_positions').update(row).eq('id', p.id) : sb.from('portfolio_positions').insert(row);
      const { error } = await q; if (error) return err(error.message);
      if (!edit) await sb.from('portfolio_journal').insert({ ticker: t, kind: 'trade', body: `${side === 'short' ? 'Shorted' : 'Bought'} ${num(qty, qty % 1 ? 4 : 0)} × ${t.replace('.JO', '')} at ${money(e, row.currency)} (${money(qty * e, row.currency)}).${row.thesis ? ' Thesis: ' + row.thesis : ''}`.slice(0, 4000) });
      close(); await reload();
    };
  };

  const posView = id => {
    const p = POS.find(x => x.id === id); if (!p) return;
    const i = IDX[p.ticker] || {}, pr = price(p), c = p.currency || i.cur || 'ZAR', n = NEWS[p.ticker] || {};
    const dir = p.side === 'short' ? -1 : 1, px = p.closed_on ? p.exit_price : (pr.px ?? p.entry_price), plp = dir * (px / p.entry_price - 1);
    const jr = JRN.filter(j => j.ticker === p.ticker);
    drawer(`<div class="sn-top"><div><span class="sn-tk">${esc(p.ticker.replace('.JO', ''))}</span><span class="sn-mk">${p.market === 'US' ? 'New York' : 'JSE'}${p.closed_on ? ' · closed' : ''}</span><h2>${esc(p.name || i.n || p.ticker)}</h2><small>${p.side === 'short' ? '<span class="pf-short">SHORT</span> ' : ''}${num(p.qty, p.qty % 1 ? 4 : 0)} shares · entry ${money(p.entry_price, c)}${p.entry_date ? ' on ' + day(p.entry_date) : ''}</small></div>
        <div class="sn-px"><b>${money(px, c)}</b><span class="${cls(plp)}">${pct(plp)} since entry</span><small>${p.closed_on ? 'exit ' + day(p.closed_on) : 'today ' + pct(pr.chg)}</small></div><button class="sn-x" aria-label="Close">×</button></div>
      <div class="pf-kpis sm"><div><span>Value</span><b>${money(p.qty * px, c, 0)}</b></div><div><span>P/L</span><b class="${cls(plp)}">${money(dir * p.qty * (px - p.entry_price), c, 0)}</b></div>
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
      await sb.from('portfolio_journal').insert({ ticker: p.ticker, kind: 'trade', body: `${dir < 0 ? 'Covered short' : 'Sold'} ${num(p.qty, p.qty % 1 ? 4 : 0)} × ${p.ticker.replace('.JO', '')} at ${money(e, c)} (${pct(dir * (e / p.entry_price - 1))} on entry ${money(p.entry_price, c)}).${$('cW').value.trim() ? ' Reason: ' + $('cW').value.trim() : ''}`.slice(0, 4000) });
      close(); await reload();
    };
    $('pvDel').onclick = async () => { if (!confirm(`Delete ${p.ticker.replace('.JO', '')} from your book? This cannot be undone.`)) return; await sb.from('portfolio_positions').delete().eq('id', p.id); close(); await reload(); };
  };


  /* ---------- import trades (CSV from Excel, Google Sheets or a broker export) ---------- */
  const TEMPLATE = 'Ticker,Side,Shares,Entry price,Entry date,Value,Thesis\nNPN.JO,long,150,610,2026-05-12,,Tencent discount narrowing via buybacks\nIWM,long,60,236,2026-11-03,,Strong US economy helps small caps\nTLT,short,40,88.50,2026-11-03,,Hot inflation keeps long yields rising\nMRP.JO,long,,205,2026-09-01,61500,Best SA value retailer\n';
  const ALIAS = { XAUUSD: 'GC=F', GOLD: 'GC=F', XAGUSD: 'SI=F', SILVER: 'SI=F', USOIL: 'CL=F', WTI: 'CL=F', UKOIL: 'BZ=F', BRENT: 'BZ=F', XPTUSD: 'PL=F',
    US500: '^GSPC', SPX500: '^GSPC', SPX: '^GSPC', NAS100: '^NDX', US100: '^NDX', USTEC: '^NDX', US30: '^DJI', DJ30: '^DJI', US2000: '^RUT', RUSSELL2000: '^RUT', SA40: '^J200.JO' };
  const ANAME = { 'GC=F': 'Gold (XAUUSD)', 'SI=F': 'Silver (XAGUSD)', 'CL=F': 'WTI crude oil', 'BZ=F': 'Brent crude oil', 'PL=F': 'Platinum (XPTUSD)', '^GSPC': 'S&P 500 index (US500)',
    '^NDX': 'Nasdaq-100 index (NAS100)', '^DJI': 'Dow Jones 30 (US30)', '^RUT': 'Russell 2000 index (US2000)', '^J200.JO': 'JSE Top 40 index (SA40)' };
  const parseCSV = txt => {
    txt = txt.replace(/^﻿/, '').trim(); if (!txt) return [];
    const first = txt.split(/\r?\n/)[0], d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < txt.length; i++) { const ch = txt[i];
      if (q) { if (ch === '"' && txt[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
      else if (ch === '"') q = true; else if (ch === d) { row.push(f); f = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += ch; }
    row.push(f); rows.push(row);
    return { rows: rows.filter(r => r.some(x => x.trim() !== '')), d };
  };
  const numv = (v, d) => { if (v === undefined || v === null) return NaN; let s = String(v).trim().replace(/[R$€£\s ]/g, ''); if (!s) return NaN;
    if (d === ';' || /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return parseFloat(s); };
  const datev = v => { const s = String(v || '').trim(); if (!s) return null; let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{10}$/.test(s)) return new Date(+s * 1000).toISOString().slice(0, 10);
    const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); };
  const resolve = raw => {
    let s = String(raw || '').trim().toUpperCase().replace(/\s+/g, ''); if (!s) return null;
    s = s.replace(/^(NASDAQ|NYSE|AMEX|ARCA|JSE|BATS):/, '').replace(/\.(US|O|N|K|OQ)$/, '').replace(/\.J$/, '.JO').replace(/\.SJ$/, '.JO');
    if (ALIAS[s]) s = ALIAS[s];
    const hit = IDX[s] || IDX[s + '.JO'] || IDX[s.replace('.', '-')];
    return hit ? { t: hit.t, i: hit } : { t: s, i: ANAME[s] ? { t: s, n: ANAME[s], m: s.endsWith('.JO') ? 'JSE' : 'US', cur: s.endsWith('.JO') ? 'ZAR' : 'USD' } : null };
  };
  const loadXLSX = () => window.XLSX ? Promise.resolve(window.XLSX) : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; sc.onload = () => res(window.XLSX); sc.onerror = rej; document.head.appendChild(sc); });
  const CASH = /(deposit|withdraw|dividend|fee|commission|interest|charge|transfer in|transfer out|funding)/i;
  const importForm = () => {
    drawer(`<div class="sn-top"><div><span class="pf-kick">IMPORT</span><h2>Upload trades or a full statement</h2><small>Excel or CSV: your broker's statement, an open-trades export, or the LRC template</small></div><button class="sn-x" aria-label="Close">×</button></div>
      <div class="pf-p"><ol class="ev-ul"><li><b>Full history:</b> upload your broker's <b>account statement / trade history</b> (closed trades) and your <b>open trades</b> export. Upload one, then the other: trades already in your book are skipped, so nothing is counted twice.</li>
        <li>We read these columns (any order, any of these names): <b>Symbol</b>/Ticker, <b>Direction</b>/Side/Type (buy, long, sell, short), <b>Qty</b>/Shares/Units/Lots, <b>Open price</b>/Entry price, <b>Open date</b>/Entry date, <b>Close price</b>/Exit price and <b>Close date</b>/Exit date (for closed trades), <b>Trade ID</b>, <b>Value</b>, <b>Notes</b>.</li>
        <li><b>Cash lines</b> on the statement (deposits, withdrawals, dividends, fees, interest) are picked up too when they have an amount, so your account value and true return are right.</li>
        <li>JSE codes with or without .JO; CFD names like XAUUSD, NAS100, US30 and US2000 are recognised. Only have a PDF statement? Most brokers let you download Excel/CSV; if not, send it to us.</li></ol>
        <p>Or start from the <a href="#" id="imTpl">LRC template</a>.</p></div>
      <label class="pf-drop"><input type="file" id="imF" accept=".csv,.txt,.xlsx,.xls,text/csv"><span>Choose an Excel or CSV file</span></label>
      <details class="pf-paste"><summary>…or paste the rows here</summary><textarea id="imT" rows="6" placeholder="Symbol,Direction,Qty,Open price,Open date,Close price,Close date"></textarea><button class="btn btn-ghost" type="button" id="imGo">Preview</button></details>
      <div id="imPrev"></div>`);
    $('imTpl').onclick = e => { e.preventDefault(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'LRC_portfolio_template.csv'; a.click(); };
    let cashCur = store.get('lrc_pf_cashcur', 'USD'), lastTxt = '';
    const preview = txt => {
      lastTxt = txt;
      const P_ = parseCSV(txt); if (!P_.rows || P_.rows.length < 2) { $('imPrev').innerHTML = '<p class="pf-err">No rows found.</p>'; return; }
      const norm = h => String(h || '').trim().toLowerCase().replace(/[^a-z/% ]/g, '').replace(/\s+/g, ' ');
      const finder = H => (...names) => H.findIndex(h => names.some(n => h === n || h.startsWith(n)));
      // statements often have a title block: find the header row (first row with a symbol column and a price column)
      let hr = 0;
      for (let i = 0; i < Math.min(40, P_.rows.length); i++) { const f = finder(P_.rows[i].map(norm)); if (f('ticker', 'symbol', 'instrument', 'code', 'stock', 'security') >= 0 && f('open price', 'entry price', 'price', 'avg price', 'average price', 'entry', 'amount') >= 0) { hr = i; break; } }
      const H = P_.rows[hr].map(norm), col = finder(H), colP = (...names) => { for (const n of names) { const i = H.findIndex(h => h === n || h.startsWith(n)); if (i >= 0) return i; } return -1; };
      const cT = col('ticker', 'symbol', 'instrument', 'code', 'stock', 'security', 'share'), cS = col('side', 'direction', 'buy/sell', 'buysell', 'action', 'type', 'transaction'),
        cQ = col('shares', 'qty', 'quantity', 'units', 'volume', 'lots', 'size', 'amount of shares'),
        cE = col('open price', 'entry price', 'opening price', 'avg price', 'average price', 'buy price', 'price', 'entry', 'cost per'),
        cD = col('open date', 'open time', 'entry date', 'opened', 'opening date', 'trade date', 'date', 'time'),
        cX = col('close price', 'exit price', 'closing price', 'sell price', 'close rate'), cXD = col('close date', 'close time', 'exit date', 'closed', 'closing date'),
        cV = col('value', 'invested', 'cost', 'total', 'exposure', 'consideration'), cN = col('thesis', 'notes', 'note', 'comment', 'reason'),
        cId = col('trade id', 'position id', 'ticket', 'deal id', 'order id', 'id'), cA = col('amount', 'net amount', 'credit', 'cash', 'profit', 'pl', 'p/l'),
        cDesc = colP('description', 'details', 'narrative', 'comment', 'transaction', 'type');
      if (cT < 0 && cA < 0) { $('imPrev').innerHTML = `<p class="pf-err">We could not find a Symbol/Ticker column. Found: ${esc(P_.rows[hr].join(', '))}</p>`; return; }
      const have = new Set(POS.map(p => p.ext_id).filter(Boolean)), seen = new Set(), flows = [];
      const out = P_.rows.slice(hr + 1).map((r, n) => {
        const desc = [...new Set([cS >= 0 ? r[cS] : '', cDesc >= 0 ? r[cDesc] : '', cT >= 0 ? r[cT] : ''].map(x => String(x || '').trim()).filter(Boolean))].join(' · ');
        const tk = cT >= 0 ? String(r[cT] || '').trim() : '';
        // cash line: no tradable symbol, but a deposit / withdrawal / dividend / fee / interest description and an amount
        if ((!tk || CASH.test(tk)) && CASH.test(desc)) {
          const amt = numv(cA >= 0 ? r[cA] : cV >= 0 ? r[cV] : '', P_.d); if (!(Math.abs(amt) > 0)) return { n: n + hr + 2, skip: 'cash line without amount' };
          const kind = /withdraw|transfer out/i.test(desc) ? 'withdrawal' : /dividend/i.test(desc) ? (amt < 0 ? 'fee' : 'dividend') : /interest/i.test(desc) ? (amt < 0 ? 'fee' : 'interest') : /fee|commission|charge/i.test(desc) ? 'fee' : amt < 0 ? 'withdrawal' : 'deposit';
          flows.push({ kind, amount: Math.abs(amt), currency: cashCur, flow_date: cD >= 0 ? datev(r[cD]) || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10), note: String(desc).trim().slice(0, 200) });
          return { n: n + hr + 2, cash: flows[flows.length - 1] };
        }
        if (!tk) return null;
        const R = resolve(tk), e = numv(r[cE], P_.d); let q = cQ >= 0 ? Math.abs(numv(r[cQ], P_.d)) : NaN; const v = cV >= 0 ? Math.abs(numv(r[cV], P_.d)) : NaN;
        if (!(q > 0) && v > 0 && e > 0) q = v / e;
        const sd = String(cS >= 0 ? r[cS] : '').trim().toLowerCase(), side = /^(short|sell|s\b|sold)/.test(sd) || (cQ >= 0 && numv(r[cQ], P_.d) < 0) ? 'short' : 'long';
        const xp = cX >= 0 ? numv(r[cX], P_.d) : NaN, xd = cXD >= 0 ? datev(r[cXD]) : null;
        const id = cId >= 0 && String(r[cId] || '').trim() ? String(r[cId]).trim().slice(0, 60) : null;
        const i = R && R.i, m = i ? i.m : (R && R.t.endsWith('.JO') ? 'JSE' : 'US');
        const okRow = R && /^[A-Z0-9.\-^=]{1,20}$/.test(R.t) && e > 0 && q > 0;
        const dup = id && (have.has(id) || seen.has(id)); if (id) seen.add(id);
        const closed = xp > 0 && !!xd;
        return { n: n + hr + 2, ok: okRow && !dup, dup, known: !!(i && IDX[i.t]), raw: tk, closed,
          row: okRow ? { side, ticker: R.t, name: i ? i.n : null, market: m, currency: i && i.cur ? i.cur : (m === 'US' ? 'USD' : 'ZAR'), qty: q, entry_price: e, entry_date: cD >= 0 ? datev(r[cD]) : null,
            exit_price: closed ? xp : null, closed_on: closed ? xd : null, ext_id: id, thesis: [cN >= 0 ? String(r[cN] || '').trim() : '', id ? 'Trade ID ' + id : ''].filter(Boolean).join(' · ') || null } : null,
          why: dup ? 'already in your book' : !R ? 'no ticker' : !(e > 0) ? 'no entry price' : !(q > 0) ? 'no shares or value' : '' };
      }).filter(Boolean);
      const trades = out.filter(x => !x.cash && !x.skip), good = trades.filter(x => x.ok), bad = trades.filter(x => !x.ok), nOpen = good.filter(x => !x.closed).length, nClosed = good.length - nOpen;
      const first = good.map(x => x.row.entry_date).filter(Boolean).sort()[0];
      $('imPrev').innerHTML = `<h3 class="ev-h3">Preview: ${nOpen} open and ${nClosed} closed trade${good.length === 1 ? '' : 's'}${flows.length ? `, ${flows.length} cash line${flows.length === 1 ? '' : 's'}` : ''}${bad.length ? ` · ${bad.length} skipped` : ''}</h3>
        ${first ? `<p class="muted">History from ${day(first)}. Your daily track record will be rebuilt from that date (up to 2 years back) within 30 minutes of importing.</p>` : ''}
        <div class="tbl-wrap"><table class="mc-tbl pf-tbl"><thead><tr><th>Row</th><th>Ticker</th><th>Side</th><th class="n">Shares</th><th class="n">Entry</th><th>Opened</th><th class="n">Exit</th><th>Closed</th><th>Status</th></tr></thead><tbody>
        ${trades.map(x => `<tr><td>${x.n}</td><td><b>${esc(x.row ? x.row.ticker.replace('.JO', '') : x.raw || '—')}</b> <small>${esc(x.row && x.row.name || '')}</small></td><td>${x.row ? (x.row.side === 'short' ? '<span class="pf-short">SHORT</span>' : 'Long') : ''}</td>
          <td class="n">${x.row ? num(x.row.qty, x.row.qty % 1 ? 4 : 0) : ''}</td><td class="n">${x.row ? money(x.row.entry_price, x.row.currency) : ''}</td><td>${x.row && x.row.entry_date ? day(x.row.entry_date) : '—'}</td>
          <td class="n">${x.row && x.row.exit_price ? money(x.row.exit_price, x.row.currency) : ''}</td><td>${x.row && x.row.closed_on ? day(x.row.closed_on) : x.row ? '<span class="up">open</span>' : ''}</td>
          <td>${!x.ok ? `<span class="${x.dup ? 'muted' : 'dn'}">Skipped: ${x.why}</span>` : x.known ? '<span class="up">✓ matched</span>' : '<span class="muted">✓ priced by the Portfolio Desk</span>'}</td></tr>`).join('')}</tbody></table></div>
        ${flows.length ? `<h3 class="ev-h3">Cash lines</h3><div class="pf-cur">Cash amounts on this statement are in <div class="seg" id="imCur"><button data-v="USD" class="${cashCur === 'USD' ? 'on' : ''}">Dollars</button><button data-v="ZAR" class="${cashCur === 'ZAR' ? 'on' : ''}">Rand</button></div></div><div class="tbl-wrap"><table class="mc-tbl pf-tbl"><thead><tr><th>Date</th><th>Type</th><th class="n">Amount</th><th>Description</th></tr></thead><tbody>${flows.map(f => `<tr><td>${day(f.flow_date)}</td><td>${esc(f.kind)}</td><td class="n">${money(f.amount, f.currency)}</td><td><small>${esc(f.note)}</small></td></tr>`).join('')}</tbody></table></div>` : ''}
        <p class="pf-err" id="pfErr"></p>${good.length || flows.length ? `<button class="btn btn-gold" id="imDo">Import ${good.length} trade${good.length === 1 ? '' : 's'}${flows.length ? ` and ${flows.length} cash line${flows.length === 1 ? '' : 's'}` : ''}</button>` : ''}`;
      if ($('imCur')) $('imCur').querySelectorAll('button').forEach(b => b.onclick = () => { cashCur = b.dataset.v; store.set('lrc_pf_cashcur', cashCur); preview(lastTxt); });
      if (good.length || flows.length) $('imDo').onclick = async () => {
        $('imDo').disabled = true; $('imDo').textContent = 'Importing…';
        const fail = m => { $('imDo').disabled = false; $('imDo').textContent = 'Try again'; err(m); };
        for (let k = 0; k < good.length; k += 100) { const { error } = await sb.from('portfolio_positions').insert(good.slice(k, k + 100).map(x => x.row)); if (error) return fail(error.message); }
        for (let k = 0; k < flows.length; k += 100) { const { error } = await sb.from('portfolio_flows').insert(flows.slice(k, k + 100)); if (error) return fail(error.message); }
        await sb.from('portfolio_journal').insert({ kind: 'trade', body: `Imported ${nOpen} open and ${nClosed} closed trade${good.length === 1 ? '' : 's'}${flows.length ? ` and ${flows.length} cash line${flows.length === 1 ? '' : 's'}` : ''}${first ? ' (history from ' + first + ')' : ''}: ${[...new Set(good.map(x => x.row.ticker.replace('.JO', '')))].slice(0, 20).join(', ')}.` });
        close(); await reload();
      };
    };
    $('imF').onchange = async e => {
      const f = e.target.files[0]; if (!f) return; if (f.size > 5e6) { $('imPrev').innerHTML = '<p class="pf-err">That file is too large (max 5 MB).</p>'; return; }
      if (/\.xlsx?$/i.test(f.name)) {
        $('imPrev').innerHTML = '<p class="muted">Reading the spreadsheet…</p>';
        try { const X = await loadXLSX(), wb = X.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
          const best = wb.SheetNames.map(n => X.utils.sheet_to_csv(wb.Sheets[n], { dateNF: 'yyyy-mm-dd' })).sort((a, b) => b.length - a.length);
          preview(best[0]); } catch (x) { $('imPrev').innerHTML = '<p class="pf-err">Could not read that Excel file. Save it as CSV and try again.</p>'; }
        return;
      }
      if (/\.pdf$/i.test(f.name)) { $('imPrev').innerHTML = '<p class="pf-err">PDF statements can\'t be read here. Download the Excel or CSV version from your broker.</p>'; return; }
      const r = new FileReader(); r.onload = () => preview(String(r.result)); r.readAsText(f);
    };
    $('imGo').onclick = () => preview($('imT').value);
  };

  const csv = () => {
    const B = book(), lines = [['Ticker', 'Side', 'Company', 'Market', 'Currency', 'Shares', 'Entry price', 'Entry date', 'Last price', 'Value', 'P/L', 'P/L %', 'Status', 'Exit price', 'Closed on', 'Thesis']];
    POS.forEach(p => { const r = B.rows.find(x => x.p.id === p.id); lines.push([p.ticker, p.side || 'long', p.name || '', p.market, p.currency, p.qty, p.entry_price, p.entry_date || '', r ? r.px : '', r ? r.val.toFixed(2) : '', r ? r.pl.toFixed(2) : '', r ? (r.plp * 100).toFixed(2) : '', p.closed_on ? 'Closed' : 'Open', p.exit_price || '', p.closed_on || '', p.thesis || '']); });
    const s = lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = 'LRC_portfolio_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  };

  const wire = () => {
    [$('pfAddBtn'), $('pfAdd2')].forEach(b => b && (b.onclick = () => addForm()));
    [$('pfImp'), $('pfImp2')].forEach(b => b && (b.onclick = importForm));
    if ($('pfCsv')) $('pfCsv').onclick = csv;
    root.querySelectorAll('#pfBase button').forEach(b => b.onclick = () => { base = b.dataset.v; store.set('lrc_pf_base', base); render(); });
    root.querySelectorAll('tr.clk').forEach(tr => tr.onclick = () => posView(tr.dataset.id));
    if ($('pfAcct')) $('pfAcct').onclick = acctForm;
    root.querySelectorAll('#pfRng button').forEach(b => b.onclick = () => { RNG = b.dataset.v; store.set('lrc_pf_rng', RNG); render(); });
    root.querySelectorAll('[data-flow]').forEach(b => b.onclick = () => acctForm(null, b.dataset.flow));
    if ($('pfAcct2')) $('pfAcct2').onclick = acctForm;
    if ($('pfMail')) $('pfMail').onchange = async e => { PROF.portfolio_alerts = e.target.checked; await sb.from('profiles').update({ portfolio_alerts: e.target.checked }).eq('id', user.id); };
    if ($('pfJ')) $('pfJ').onsubmit = async ev => { ev.preventDefault(); const body = $('pfJb').value.trim(); if (!body) return; const { error } = await sb.from('portfolio_journal').insert({ ticker: $('pfJt').value || null, kind: $('pfJk').value, body }); if (!error) { await reloadJ(); render(); } };
    root.querySelectorAll('.pf-del').forEach(b => b.onclick = async () => { if (!confirm('Delete this journal entry?')) return; await sb.from('portfolio_journal').delete().eq('id', b.dataset.j); await reloadJ(); render(); });
  };

  const reloadJ = async () => { const { data } = await sb.from('portfolio_journal').select('*').order('created_at', { ascending: false }).limit(300); JRN = data || []; };
  const reload = async () => {
    const [{ data: pos, error }, , { data: prof }] = await Promise.all([sb.from('portfolio_positions').select('*').order('created_at'), reloadJ(), sb.from('profiles').select('*').eq('id', user.id).maybeSingle()]);
    const [{ data: sn }, { data: fl }] = await Promise.all([sb.from('portfolio_snapshots').select('d,book,invested,flow,n,at').order('d').limit(1000), sb.from('portfolio_flows').select('*').order('flow_date', { ascending: false }).limit(500)]);
    SNAP = sn || []; FLOWS = fl || [];
    if (!BENCH.length && SNAP.length) { const { data: bm } = await sb.from('portfolio_bench').select('d,spx,j200,usdzar').gte('d', SNAP[0].d).order('d').limit(1000); BENCH = bm || []; }
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
