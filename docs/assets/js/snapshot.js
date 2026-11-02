/* LRC Company Snapshot — opens when you click a company in the Stock Scanner (and on the Sectors page).
   A quick fundamentals view built from the scanner's company file (data/scan/t/<T>.json) and the statements file (data/fs/<T>.json).
   The full one-page summary (stock.html) stays one click away. Respects SAFE MODE (no LRC targets, grade labels). */
(() => {
  const D = window.LRC_DATA || 'data/';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = x => x !== null && x !== undefined && isFinite(x);
  const CUR = c => c === 'ZAR' ? 'R' : c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : '';
  const n2 = (x, d = 2) => ok(x) ? Number(x).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const money = (x, c) => ok(x) ? CUR(c) + n2(x, x >= 1000 ? 0 : 2) : '—';
  const pc = (x, d = 1) => ok(x) && Math.abs(x) <= 3 ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%' : '—';
  const pp = (x, d = 1) => ok(x) ? (x * 100).toFixed(d) + '%' : '—';
  const big = (x, c) => { if (!ok(x)) return '—'; const a = Math.abs(x), s = x < 0 ? '−' : ''; return s + CUR(c) + (a >= 1e12 ? (a / 1e12).toFixed(2) + ' trillion' : a >= 1e9 ? (a / 1e9).toFixed(1) + 'bn' : a >= 1e6 ? (a / 1e6).toFixed(0) + 'm' : n2(a, 0)); };
  const mult = x => ok(x) ? (x <= 0 ? 'neg.' : x.toFixed(1) + 'x') : '—';
    const GR = { 'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring' };
  const grade = v => !v ? '—' : window.LRC_SAFE === true ? (GR[v] || v) : v;
  const gcol = s => !ok(s) ? '#5C6478' : s >= 75 ? '#1E8E5A' : s >= 60 ? '#2FBF71' : s >= 40 ? '#C9A227' : s >= 25 ? '#D9653B' : '#B3261E';
  const get = f => fetch(D + f + '?v=' + Math.floor(Date.now() / 6e5)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const BASE = (document.querySelector('script[src*="assets/js/snapshot.js"]') || {}).src?.replace(/assets\/js\/snapshot\.js.*$/, '') || '';
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  /* ---------- small SVG charts ---------- */
  const gauge = (score, label) => {
    const s = ok(score) ? Math.max(0, Math.min(100, score)) : 50, a = Math.PI * (1 - s / 100), x = 60 + 46 * Math.cos(a), y = 62 - 46 * Math.sin(a);
    const seg = (f, t, c) => { const a1 = Math.PI * (1 - f / 100), a2 = Math.PI * (1 - t / 100); return `<path d="M${60 + 50 * Math.cos(a1)} ${62 - 50 * Math.sin(a1)} A50 50 0 0 1 ${60 + 50 * Math.cos(a2)} ${62 - 50 * Math.sin(a2)}" stroke="${c}" stroke-width="10" fill="none"/>`; };
    return `<div class="sn-gauge"><svg viewBox="0 0 120 72" aria-hidden="true">${seg(0, 25, '#B3261E')}${seg(25, 40, '#D9653B')}${seg(40, 60, '#C9A227')}${seg(60, 75, '#2FBF71')}${seg(75, 100, '#1E8E5A')}
      <line x1="60" y1="62" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="#fff"/></svg>
      <b style="color:${gcol(score)}">${ok(score) ? Math.round(score) : '—'}</b><span>${esc(label)}</span></div>`;
  };
  const priceChart = (h, cur) => {
    if (!h || !h.c || h.c.length < 20) return '<p class="sn-empty">Not enough price history yet.</p>';
    const c = h.c, d0 = new Date(h.d0 + 'T12:00:00'), dates = [d0]; let t = +d0;
    for (const g of (h.gap || '')) { t += (+g || 1) * 864e5; dates.push(new Date(t)); }
    const sma = n => c.map((_, i) => i >= n - 1 ? c.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n : null);
    const s50 = sma(50), s200 = sma(200), W = 640, H = 220, P = 34;
    const lo = Math.min(...c) * 0.97, hi = Math.max(...c) * 1.03, X = i => P + (W - P - 8) * i / (c.length - 1), Y = v => 10 + (H - 34) * (1 - (v - lo) / (hi - lo));
    const line = (arr, col, w, dash) => { const pts = arr.map((v, i) => ok(v) ? `${X(i).toFixed(1)},${Y(v).toFixed(1)}` : null).filter(Boolean); return pts.length ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="${w}"${dash ? ' stroke-dasharray="5 4"' : ''}/>` : ''; };
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = lo + (hi - lo) * f; return `<text x="2" y="${Y(v) + 4}" class="ax">${CUR(cur)}${v >= 1000 ? Math.round(v).toLocaleString('en-ZA') : v.toFixed(v < 10 ? 2 : 0)}</text><line x1="${P}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/>`; }).join('');
    const months = []; let last = -1; dates.forEach((d, i) => { const m = d.getMonth(); if (m !== last && m % 3 === 0 && i > 5) { months.push(`<text x="${X(i)}" y="${H - 6}" class="ax" text-anchor="middle">${d.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' })}</text>`); } last = m; });
    const up = c[c.length - 1] >= c[0];
    return `<svg viewBox="0 0 ${W} ${H}" class="sn-svg" role="img" aria-label="Share price, about two years">${ticks}${months.join('')}${line(s200, '#9AA1B2', 1.5, true)}${line(s50, '#F2CE72', 1.6)}${line(c, up ? '#5ED39A' : '#F08A7E', 2.2)}</svg>
      <div class="sn-legend"><span style="--c:${up ? '#5ED39A' : '#F08A7E'}">Daily close</span><span style="--c:#F2CE72">50-day average</span><span style="--c:#9AA1B2">200-day average</span></div>`;
  };
  const finChart = (fs, per, cur) => {
    const S = fs && fs[per]; if (!S || !S.dates || !S.dates.length) return '<p class="sn-empty">No reported figures in our statements file yet.</p>';
    const n = per === 'annual' ? 6 : 8, k = S.dates.length, from = Math.max(0, k - n), dates = S.dates.slice(from);
    const rev = (S.rows.rev || []).slice(from), ni = (S.rows.ni || []).slice(from);
    const vals = rev.concat(ni).filter(ok); if (!vals.length) return '<p class="sn-empty">Revenue and profit not reported in this period type.</p>';
    const W = 640, H = 220, P = 44, top = Math.max(...vals, 0), bot = Math.min(...vals, 0), Y = v => 12 + (H - 46) * (1 - (v - bot) / ((top - bot) || 1)), bw = (W - P - 10) / dates.length;
    const mg = rev.map((r, i) => ok(r) && r && ok(ni[i]) ? ni[i] / r : null), mlo = Math.min(...mg.filter(ok), 0), mhi = Math.max(...mg.filter(ok), 0.01), MY = v => 12 + (H - 46) * (1 - (v - mlo) / ((mhi - mlo) || 1));
    const unit = top >= 5e9 || bot <= -5e9 ? [1e9, 'bn'] : [1e6, 'm'];
    let g = `<line x1="${P}" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" class="gl0"/>`;
    [bot, (top + bot) / 2, top].forEach(v => { g += `<text x="2" y="${Y(v) + 4}" class="ax">${CUR(cur)}${(v / unit[0]).toFixed(Math.abs(v / unit[0]) < 10 ? 1 : 0)}${unit[1]}</text>`; });
    dates.forEach((d, i) => {
      const x = P + bw * i + bw * 0.12, w = bw * 0.36;
      if (ok(rev[i])) g += `<rect x="${x}" y="${Math.min(Y(rev[i]), Y(0))}" width="${w}" height="${Math.abs(Y(rev[i]) - Y(0))}" fill="#2FBF71" rx="2"><title>Revenue ${big(rev[i], cur)}</title></rect>`;
      if (ok(ni[i])) g += `<rect x="${x + w + 2}" y="${Math.min(Y(ni[i]), Y(0))}" width="${w}" height="${Math.abs(Y(ni[i]) - Y(0))}" fill="${ni[i] >= 0 ? '#C9CEDA' : '#F08A7E'}" rx="2"><title>Net profit ${big(ni[i], cur)}</title></rect>`;
      g += `<text x="${P + bw * i + bw / 2}" y="${H - 8}" class="ax" text-anchor="middle">${per === 'annual' ? 'FY' + d.slice(2, 4) : d.slice(5, 7) + '/' + d.slice(2, 4)}</text>`;
    });
    const mp = mg.map((v, i) => ok(v) ? `${(P + bw * i + bw / 2).toFixed(1)},${MY(v).toFixed(1)}` : null).filter(Boolean);
    if (mp.length > 1) g += `<polyline points="${mp.join(' ')}" fill="none" stroke="#F2CE72" stroke-width="2" stroke-dasharray="4 3"/>` + mg.map((v, i) => ok(v) ? `<circle cx="${P + bw * i + bw / 2}" cy="${MY(v)}" r="3" fill="#F2CE72"><title>Net margin ${pp(v)}</title></circle>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="sn-svg" role="img" aria-label="Revenue, net profit and net margin">${g}</svg>
      <div class="sn-legend"><span style="--c:#2FBF71">Revenue</span><span style="--c:#C9CEDA">Net profit</span><span style="--c:#F2CE72">Net margin (dotted)</span></div>`;
  };

  /* ---------- the drawer ---------- */
  let box, lastFocus;
  const ensure = () => {
    if (box) return box;
    box = document.createElement('div'); box.className = 'sn-wrap'; box.innerHTML = '<div class="sn-back"></div><aside class="sn" role="dialog" aria-modal="true" aria-label="Company snapshot"><div class="sn-in" id="snIn"></div></aside>';
    document.body.appendChild(box);
    box.querySelector('.sn-back').onclick = close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) close(); });
    return box;
  };
  const close = () => { if (!box) return; box.classList.remove('open'); document.documentElement.classList.remove('sn-lock'); const u = new URL(location.href); u.searchParams.delete('snap'); history.replaceState(null, '', u); if (lastFocus) lastFocus.focus(); };

  const open = async t => {
    ensure(); lastFocus = document.activeElement;
    const IN = $('snIn'); IN.innerHTML = `<div class="sn-top"><b>${esc(t.replace('.JO', ''))}</b><button class="sn-x" aria-label="Close">×</button></div><p class="muted-load">Loading the company snapshot…</p>`;
    IN.querySelector('.sn-x').onclick = close;
    box.classList.add('open'); document.documentElement.classList.add('sn-lock');
    const u = new URL(location.href); u.searchParams.set('snap', t); history.replaceState(null, '', u);
    let d, fs = null;
    try { d = await get('scan/t/' + t.replace('^', '_') + '.json'); } catch (e) { IN.innerHTML = `<div class="sn-top"><b>${esc(t)}</b><button class="sn-x" aria-label="Close">×</button></div><p class="muted-load">We don't have a snapshot for this company yet. <a href="${BASE}stock.html?t=${encodeURIComponent(t)}">Open the one-page summary →</a></p>`; IN.querySelector('.sn-x').onclick = close; return; }
    try { fs = await get('fs/' + t.replace('^', '_') + '.json'); } catch (e) {}
    render(IN, d, fs);
  };

  const render = (IN, d, fs) => {
    const r = d.row || {}, f = d.f || {}, tech = d.tech || {}, prof = d.profile || {}, cx = d.context || {}, cur = r.cur;
    const M = (d.medians || {}).market || {}, Sx = (d.medians || {}).sector || d.sector_medians || {};
    const price = tech.price ?? r.px, lo = tech.lo52, hi = tech.hi52, pos = ok(lo) && ok(hi) && hi > lo ? (price - lo) / (hi - lo) : null;
    const summ = (prof.summary || '').split(/(?<=\.)\s+/).slice(0, 3).join(' ');
    const rt = f.rec_trend || {}, rtot = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce((a, k) => a + (rt[k] || 0), 0);
    const mineSet = new Set(store.get('lrc_mine', []));
    const verdictCls = v => v === 'Undervalued' ? 'up' : v === 'Overvalued' ? 'dn' : 'flat';
    const VK = ['fpe', 'tpe', 'peg', 'ps', 'pb', 'pfcf', 'ev_ebitda'];
    const vrows = (d.valuation || []).filter(x => VK.includes(x.k)).map(x => `<tr><td>${esc(x.label)}</td><td class="n"><b>${x.k === 'div_yield' ? pp(x.v) : mult(x.v)}</b></td><td class="n">${x.k === 'div_yield' ? pp(x.sector) : mult(x.sector)}</td><td class="n">${ok(M[x.k]) ? (x.k === 'div_yield' ? pp(M[x.k]) : mult(M[x.k])) : '—'}</td><td><span class="sn-v ${verdictCls(x.verdict)}">${esc({ Undervalued: 'Cheaper', Overvalued: 'Dearer', 'Fairly valued': 'In line' }[x.verdict] || '—')}</span></td></tr>`).join('');
    const F = [
      ['Growth', [['Revenue growth (y/y)', pc(f.rev_growth), pc(Sx.rev_growth), f.rev_growth >= Sx.rev_growth], ['Earnings growth (y/y)', pc(f.eps_growth), pc(Sx.eps_growth), f.eps_growth >= Sx.eps_growth], ['EPS growth next year (est.)', pc(f.eps_growth_next), pc(Sx.eps_growth_next), f.eps_growth_next >= Sx.eps_growth_next]]],
      ['Profitability', [['Gross margin', pp(f.gross_margin), pp(Sx.gross_margin), f.gross_margin >= Sx.gross_margin], ['Operating margin', pp(f.op_margin), pp(Sx.op_margin), f.op_margin >= Sx.op_margin], ['Return on equity', pp(f.roe), pp(Sx.roe), f.roe >= Sx.roe]]],
      ['Financial health', [['Debt / equity', ok(f.de) ? (f.de / 100).toFixed(2) : '—', ok(Sx.de) ? (Sx.de / 100).toFixed(2) : '—', ok(f.de) && ok(Sx.de) ? f.de <= Sx.de : null], ['Current ratio', ok(f.current_ratio) ? f.current_ratio.toFixed(2) : '—', ok(Sx.current_ratio) ? Sx.current_ratio.toFixed(2) : '—', f.current_ratio >= Sx.current_ratio], ['Free cash flow', big(f.fcf, cur), '', ok(f.fcf) ? f.fcf > 0 : null]]],
      ['Income', [['Dividend yield', pp(f.div_yield), pp(Sx.div_yield), ok(f.div_yield) && f.div_yield > 0 ? f.div_yield >= (Sx.div_yield || 0) : null], ['Payout ratio', pp(f.payout, 0), pp(Sx.payout, 0), ok(f.payout) ? f.payout > 0 && f.payout < 0.8 : null]]]];
    const grp = r.grp || {}, G = [['valuation', 'Valuation'], ['growth', 'Growth'], ['profitability', 'Profitability'], ['health', 'Financial health'], ['income', 'Income'], ['sentiment', 'Analysts & sentiment'], ['technical', 'Price trend']];
    const acts = (f.analyst_actions || []).filter(a => a.action === 'up' || a.action === 'down' || a.action === 'init').slice(0, 4);
    const ne = f.next_earnings || r.ne, dn = ne ? Math.round((new Date(ne + 'T12:00:00') - Date.now()) / 864e5) : null;
    IN.innerHTML = `
      <div class="sn-top"><div><span class="sn-tk">${esc(r.t.replace('.JO', ''))}</span><span class="sn-mk">${r.m === 'JSE' ? 'JSE' : 'New York'}</span><h2>${esc(r.n)}</h2><small>${esc(prof.sector || r.sec || '')}${prof.industry ? ' · ' + esc(prof.industry) : ''}${prof.country ? ' · ' + esc(prof.country) : ''}</small></div>
        <div class="sn-px"><b>${money(price, cur)}</b><span class="${(r.chg ?? 0) >= 0 ? 'up' : 'dn'}">${pc(r.chg)} today</span><small>Prices ${esc((d.as_of || {})[r.m] || tech.date || '')}</small></div><button class="sn-x" aria-label="Close">×</button></div>
      <div class="sn-sum">
        <div class="sn-scores">${gauge(r.score, 'Trading score')}${gauge(r.iv_score, 'Investment score')}
          <div class="sn-badges"><span class="pill ${'g-' + ({ 'STRONG BUY': 'top', 'BUY': 'strong', 'HOLD': 'avg', 'SELL': 'weak', 'STRONG SELL': 'low' }[r.v] || 'avg')}">Trading: ${esc(grade(r.v))}</span><span class="pill ${'g-' + ({ 'STRONG BUY': 'top', 'BUY': 'strong', 'HOLD': 'avg', 'SELL': 'weak', 'STRONG SELL': 'low' }[r.iv_v] || 'avg')}">Long term: ${esc(grade(r.iv_v))}</span><span class="sn-v ${r.val === 'UNDERVALUED' ? 'up' : r.val === 'OVERVALUED' ? 'dn' : 'flat'}">${esc((r.val || 'fair value').toLowerCase())} · model est.</span></div></div>
        <div class="sn-about"><div class="lbl">COMPANY SUMMARY</div><p>${esc(summ || 'No company description from our data provider yet.')}</p>
          <div class="sn-facts"><div><span>Market value</span><b>${big(f.mcap || r.mcap, cur)}</b></div><div><span>Size in sector</span><b>${ok(cx.sec_rank) ? '#' + cx.sec_rank + ' of ' + cx.sec_n : '—'}</b></div>
            <div><span>52-week range</span><b>${money(lo, cur)} – ${money(hi, cur)}</b>${ok(pos) ? `<i class="sn-rng"><i style="left:${Math.max(0, Math.min(100, pos * 100))}%"></i></i>` : ''}</div>
            <div><span>Traded a day</span><b>${big(tech.value_traded, cur)}</b></div><div><span>Next results</span><b class="${dn !== null && dn >= 0 && dn <= 14 ? 'warn' : ''}">${ne ? new Date(ne + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) + (dn !== null && dn >= 0 ? ` · ${dn} d` : '') : '—'}</b></div>
            <div><span>Employees</span><b>${prof.employees ? Number(prof.employees).toLocaleString('en-ZA') : '—'}</b></div></div></div></div>
      <div class="sn-grid2">
        <div class="sn-card"><div class="lbl">SHARE PRICE · ABOUT 2 YEARS</div>${priceChart(d.history, cur)}
          <div class="sn-perf">${[['1 week', tech.perf_1w], ['1 month', tech.perf_1m], ['3 months', tech.perf_3m], ['6 months', tech.perf_6m], ['1 year', tech.perf_1y], ['This year', tech.perf_ytd]].map(([k, v]) => `<span>${k}<b class="${(v ?? 0) >= 0 ? 'up' : 'dn'}">${pc(v)}</b></span>`).join('')}</div></div>
        <div class="sn-card"><div class="lbl-row"><div class="lbl">REVENUE, NET PROFIT &amp; MARGIN</div><div class="seg sn-per"><button data-per="annual" class="on">Yearly</button><button data-per="quarterly">Quarterly</button></div></div><div id="snFin">${finChart(fs, 'annual', (fs && fs.cur) || cur)}</div></div>
      </div>
      <div class="sn-grid2">
        <div class="sn-card"><div class="lbl">VALUATION — COMPANY VS SECTOR AND MARKET</div><div class="tbl-wrap"><table class="sn-tbl"><thead><tr><th>Measure</th><th class="n">Company</th><th class="n">Sector</th><th class="n">Market</th><th>vs sector</th></tr></thead><tbody>${vrows || '<tr><td colspan="5">No valuation readings yet.</td></tr>'}</tbody></table></div><p class="sn-note">Lower is cheaper for every multiple. Sector and market = median of the companies in the same sector / the whole market.</p></div>
        <div class="sn-card"><div class="lbl">FUNDAMENTALS — COMPANY VS SECTOR</div><table class="sn-tbl"><tbody>${F.map(([h, rows]) => `<tr class="sn-h"><td colspan="3">${h}</td></tr>` + rows.map(([k, v, s, good]) => `<tr><td>${k}</td><td class="n"><b class="${good === true ? 'up' : good === false ? 'dn' : ''}">${v}</b></td><td class="n">${s ? 'sector ' + s : ''}</td></tr>`).join('')).join('')}</tbody></table></div>
      </div>
      <div class="sn-grid2">
        <div class="sn-card"><div class="lbl">WHERE IT SCORES WELL — AND WHERE IT DOESN'T</div><div class="sn-bars">${G.map(([k, l]) => { const v = grp[k]; return `<div><span>${l}</span><i><i style="width:${ok(v) ? v : 0}%;background:${gcol(v)}"></i></i><b>${ok(v) ? Math.round(v) : '—'}</b></div>`; }).join('')}</div><p class="sn-note">Each area is scored 0–100 against companies in the same sector and market.</p></div>
        <div class="sn-card"><div class="lbl">WHAT PROFESSIONAL ANALYSTS SAY</div>
          ${rtot ? `<div class="sn-rec">${[['strongBuy', 'Strong buy', '#1E8E5A'], ['buy', 'Buy', '#2FBF71'], ['hold', 'Hold', '#9AA1B2'], ['sell', 'Sell', '#D9653B'], ['strongSell', 'Strong sell', '#B3261E']].map(([k, l, c]) => `<div><i style="height:${Math.round((rt[k] || 0) / rtot * 100)}%;background:${c}"></i><b>${rt[k] || 0}</b><span>${l}</span></div>`).join('')}</div>` : '<p class="sn-empty">No analyst ratings in our data for this company.</p>'}
          <p class="sn-note">${f.n_analysts ? `${f.n_analysts} analyst${f.n_analysts === 1 ? '' : 's'} cover this company. ` : ''}${ok(f.target_median) ? `Their median price target is ${money(f.target_median, cur)} (${pc(f.target_median / price - 1)} from today; range ${money(f.target_low, cur)}–${money(f.target_high, cur)}). Third-party forecasts, not LRC's.` : ''}</p>
          ${acts.length ? `<div class="sn-acts">${acts.map(a => `<span>${esc(a.date)} · <b>${esc(a.firm)}</b> ${a.action === 'up' ? '<em class="up">upgraded</em>' : a.action === 'down' ? '<em class="dn">downgraded</em>' : 'started'} ${a.from ? esc(a.from) + ' → ' : ''}${esc(a.to || '')}</span>`).join('')}</div>` : ''}</div>
      </div>
      ${(cx.rivals || []).length ? `<div class="sn-rivals"><span class="lbl">COMPARE WITH RIVALS</span>${cx.rivals.map(x => `<button data-snap="${esc(x.t)}">${esc(x.t.replace('.JO', ''))} <small>${esc(x.n)}</small></button>`).join('')}</div>` : ''}
      <div class="sn-cta"><a class="btn btn-gold" href="${BASE}stock.html?t=${encodeURIComponent(r.t)}">Open the one-page summary →</a><a class="btn btn-ghost" href="${BASE}analyzer.html?t=${encodeURIComponent(r.t)}">Analyse every number</a><button class="btn btn-ghost sn-star">${mineSet.has(r.t) ? '★ On my list' : '☆ Add to my list'}</button></div>
      <p class="sn-note" style="margin-top:14px">Educational information from the LRC Stock Scanner, not financial advice. Sources: ${esc(d.source || 'Yahoo Finance; LRC scoring rules')}${fs && fs.src ? '; ' + esc((fs.src || []).join('; ')) : ''}.</p>`;
    IN.querySelector('.sn-x').onclick = close;
    IN.querySelectorAll('.sn-per button').forEach(b => b.onclick = () => { IN.querySelectorAll('.sn-per button').forEach(x => x.classList.toggle('on', x === b)); $('snFin').innerHTML = finChart(fs, b.dataset.per, (fs && fs.cur) || cur); });
    IN.querySelectorAll('[data-snap]').forEach(b => b.onclick = () => open(b.dataset.snap));
    const st = IN.querySelector('.sn-star'); st.onclick = () => { const s = new Set(store.get('lrc_mine', [])); s.has(r.t) ? s.delete(r.t) : s.add(r.t); store.set('lrc_mine', [...s]); st.textContent = s.has(r.t) ? '★ On my list' : '☆ Add to my list'; };
    // remember for "Recently viewed"
    try { const k = 'lrc_recent', l = JSON.parse(localStorage.getItem(k)) || [], url = `${BASE}stock.html?t=${encodeURIComponent(r.t)}`; localStorage.setItem(k, JSON.stringify([{ l: r.t.replace('.JO', ''), u: url }].concat(l.filter(x => x.u !== url)).slice(0, 8))); } catch (e) {}
    IN.parentElement.scrollTop = 0;
    IN.querySelector('.sn-x').focus();
  };

  window.LRCSnap = { open, close };

  /* Clicking a company row (or a [data-snap] link) opens the snapshot instead of leaving the page.
     Ctrl/⌘-click or middle-click still opens the one-page summary in a new tab. */
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest('.star, th, input, select, label, .sn-wrap')) return;
    const sn = e.target.closest('[data-snap]'); if (sn && !sn.closest('.sn-wrap')) { e.preventDefault(); e.stopPropagation(); open(sn.dataset.snap); return; }
    // any link to a company opens the snapshot first — except links that ARE the one-page summary button
    const al = e.target.closest('a[href*="stock.html?t="]');
    if (al) {
      if (al.hasAttribute('data-summary') || al.target === '_blank' || /summary|1-page|one-page|full report|pdf|statement|thesis/i.test(al.textContent || '')) return;
      const t = decodeURIComponent(((al.getAttribute('href') || '').match(/stock\.html\?t=([^&#]+)/) || [])[1] || '');
      if (t) { e.preventDefault(); e.stopPropagation(); open(t); }
      return;
    }
    const tr = e.target.closest('tr[data-t], tr[onclick*="stock.html?t="]');
    if (!tr) return;
    const a = e.target.closest('a'); if (a) return;
    const t = tr.dataset.t || decodeURIComponent(((tr.getAttribute('onclick') || '').match(/stock\.html\?t=([^'"&]+)/) || [])[1] || '');
    if (!t) return;
    e.preventDefault(); e.stopPropagation(); open(t);
  }, true);
  const s0 = new URLSearchParams(location.search).get('snap'); if (s0) open(s0);
})();
