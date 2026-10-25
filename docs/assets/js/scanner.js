// LRC Scanner + one-page stock summary (reads data/scan/*.json written by the daily GitHub Action)
(() => {
const D = window.LRC_DATA || 'data/';
const $ = id => document.getElementById(id);
const get = f => fetch(D + f + (f.includes('?') ? '&' : '?') + 'v=' + Math.floor(Date.now() / 6e5)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ok = x => x !== null && x !== undefined && isFinite(x);
const CUR = c => (c === 'ZAR' ? 'R' : c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : '');
const n2 = (x, d = 2) => ok(x) ? Number(x).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const px = (x, c) => ok(x) ? CUR(c) + n2(x, x >= 1000 ? 0 : 2) : '—';
const pc = (x, d = 1) => ok(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%' : '—';
const pp = (x, d = 1) => ok(x) ? (x * 100).toFixed(d) + '%' : '—';
const big = (x, c) => { if (!ok(x)) return '—'; const a = Math.abs(x); const s = a >= 1e12 ? (x / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (x / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (x / 1e6).toFixed(0) + 'M' : n2(x, 0); return CUR(c) + s; };
const chgPct = (to, from) => ok(to) && ok(from) && from ? pc(to / from - 1, 1) : '—';
const mult = x => ok(x) ? (x <= 0 ? 'neg.' : x.toFixed(1) + 'x') : '—';
const sigCls = v => 'sig sig-' + String(v || 'hold').toLowerCase().replace(/\s+/g, '-');
const cc = v => v === null || v === undefined ? 'cn' : v >= 2 ? 'c2' : v >= 1 ? 'c1' : v <= -2 ? 'cm2' : v <= -1 ? 'cm1' : 'c0';
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
const mine = () => new Set(store.get('lrc_mine', []));
const toggleMine = t => { const s = mine(); s.has(t) ? s.delete(t) : s.add(t); store.set('lrc_mine', [...s]); return s.has(t); };
const getMkt = () => store.get('lrc_mkt', 'JSE');
const setMkt = m => { store.set('lrc_mkt', m); window.dispatchEvent(new CustomEvent('lrcmarket', { detail: m })); };
const when = iso => { try { return new Date(iso).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' SAST'; } catch (e) { return iso; } };
const fail = (el, what) => { el.innerHTML = `<p class="muted-load" style="padding:20px">The ${what} is not available yet — it is built by the daily scanner run. If you opened this file on your computer, it works once the site is online.</p>`; };
window.LRCScan = { getMkt, setMkt };

/* =================== SCANNER PAGE =================== */
if ($('scTbl')) {
  let S, E, SE, mkt = getMkt(), tab = (location.hash || '#stocks').slice(1), sortK = 'total', sortD = -1, shown = 120;
  const sel = $('scMkt'); sel.value = mkt;
  sel.addEventListener('change', () => { mkt = sel.value; setMkt(mkt); shown = 120; fillSectors(); drawAll(); });
  window.addEventListener('lrcmarket', e => { if (e.detail !== mkt) { mkt = e.detail; sel.value = mkt; shown = 120; fillSectors(); drawAll(); } });
  const tabs = document.querySelectorAll('#scTabs button');
  const showTab = t => { tab = ['stocks', 'setups', 'invest', 'etfs', 'sectors', 'how'].includes(t) ? t : 'stocks'; tabs.forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    ['stocks', 'setups', 'invest', 'etfs', 'sectors', 'how'].forEach(p => $('pane-' + p).hidden = p !== tab); history.replaceState(null, '', '#' + tab); drawAll(); };
  tabs.forEach(b => b.addEventListener('click', () => showTab(b.dataset.t)));

  const COLS = [
    { k: 'trend', l: 'TREND', g: 'tech', d: r => ({ 2: 'Up ▲▲', 1: 'Up ▲', 0: 'Flat', '-1': 'Down ▼', '-2': 'Down ▼▼' })[r.sc.trend] },
    { k: 'momentum', l: 'MOMENTUM', g: 'tech', d: r => ok(r.raw.rs) ? pc(r.raw.rs, 0) : r.sc.momentum, t: 'Momentum: 6-month return minus the benchmark' },
    { k: 'setup', l: 'SETUP', g: 'tech', d: r => r.setup || '—' },
    { k: 'extension', l: 'RSI / EXT', g: 'tech', d: r => ok(r.rsi) ? r.rsi.toFixed(0) : '—', t: 'RSI(14); red = stretched (>3 ATR above the 20-day or RSI>78)' },
    { k: 'volume', l: 'VOLUME', g: 'tech', d: r => ok(r.raw.uv) ? r.raw.uv.toFixed(2) : '—', t: 'Up-day vs down-day volume, 20 sessions' },
    { k: 'analysts', l: 'ANALYSTS', g: 'sent', d: r => ok(r.raw.rec) ? r.raw.rec.toFixed(1) + (r.raw.na ? ` (${r.raw.na})` : '') : '—', t: 'Consensus 1 = Strong buy … 5 = Sell (number of analysts)' },
    { k: 'target', l: 'TARGET', g: 'sent', d: r => pc(r.raw.tgt_up, 0), t: 'Upside to the median analyst target' },
    { k: 'short', l: 'SHORT %', g: 'sent', d: r => pp(r.raw.short, 1), t: 'Short interest, % of float' },
    { k: 'fpe', l: 'FWD P/E', g: 'fund', d: r => mult(r.raw.fpe) },
    { k: 'tpe', l: 'TTM P/E', g: 'fund', d: r => mult(r.raw.tpe) },
    { k: 'ps', l: 'P/SALES', g: 'fund', d: r => mult(r.raw.ps) },
    { k: 'rev_growth', l: 'REV GROWTH', g: 'fund', d: r => pc(r.raw.rev_growth, 0) },
    { k: 'eps_growth', l: 'EPS GROWTH', g: 'fund', d: r => pc(r.raw.eps_growth, 0) },
    { k: 'de', l: 'DEBT/EQ', g: 'fund', d: r => ok(r.raw.de) ? (r.raw.de / 100).toFixed(2) : '—' },
    { k: 'roe', l: 'ROE', g: 'fund', d: r => pp(r.raw.roe, 0) },
    { k: 'pfcf', l: 'P/FCF', g: 'fund', d: r => mult(r.raw.pfcf) },
    { k: 'div_yield', l: 'DIV YIELD', g: 'fund', d: r => ok(r.raw.div_yield) && r.raw.div_yield > 0 ? pp(r.raw.div_yield, 1) : '—' },
  ];
  const rowsFor = () => {
    if (!S) return [];
    const q = ($('scQ').value || '').toLowerCase(), sec = $('scSec').value, sg = $('scSig').value, st = $('scSet').value, vl = $('scVal').value, my = mine();
    return S.rows.filter(r => r.m === mkt && (sec === 'all' || r.sec === sec) && (sg === 'all' || r.v === sg) &&
      (st === 'all' || (st === 'none' ? !r.setup : r.setup === st)) && (!$('scCov').checked || r.cov || r.res) && (!$('scMine').checked || my.has(r.t)) &&
      (vl === 'all' || (vl === 'under' ? r.sc.fpe === 1 : r.sc.fpe === -1)) && (!q || (r.t + ' ' + r.n + ' ' + (r.ind || '')).toLowerCase().includes(q)));
  };
  const sortVal = (r, k) => k === 'total' ? r.total / (r.max || 1) : k === 't' ? r.t : k === 'chg' ? r.chg : k === 'ne' ? (r.ne || '9') : (r.sc[k] ?? -9) * 1000 + (ok(r.raw[k]) ? (['fpe', 'tpe', 'ps', 'pfcf', 'de'].includes(k) ? -r.raw[k] : r.raw[k]) : 0) / 1e6;
  function drawStocks() {
    const rows = rowsFor().sort((a, b) => { const x = sortVal(a, sortK), y = sortVal(b, sortK); return (x > y ? 1 : x < y ? -1 : 0) * sortD; });
    const my = mine();
    const th = (k, l, t = '') => `<th data-k="${k}" title="${esc(t)}" class="${sortK === k ? 'sorted' + (sortD > 0 ? ' asc' : '') : ''}">${l}</th>`;
    let h = `<thead><tr><th class="grp" style="background:#0A0D15;position:sticky;left:0;z-index:3"></th><th class="grp" colspan="3" style="background:#0A0D15"></th><th class="grp g-tech" colspan="5">TECHNICAL READINGS</th><th class="grp g-sent" colspan="3">SENTIMENT</th><th class="grp g-fund" colspan="9">FINANCIAL READINGS (vs sector)</th><th class="grp" colspan="2" style="background:#0A0D15;color:var(--gold-2)">CATALYSTS</th></tr><tr>
      <th data-k="t" style="position:sticky;left:0;z-index:3;text-align:left">COMPANY</th>${th('total', 'LRC SCORE')}<th>LRC STOCK SCANNER</th>${th('chg', 'PRICE · 1D')}` +
      COLS.map(c => th(c.k, c.l, c.t)).join('') + `<th>EVENTS</th>${th('ne', 'RESULTS')}</tr></thead><tbody>`;
    h += rows.slice(0, shown).map(r => {
      const sc = r.total / (r.max || 1);
      const cov = r.cov ? `<span class="pill p-${r.cov.rating.toLowerCase()}" title="LRC analyst rating ${esc(r.cov.rated || '')}">LRC ${esc(r.cov.rating)}</span> ` : r.res ? '<span class="tag">LRC research</span>' : '';
      return `<tr data-t="${esc(r.t)}"><td class="nm"><button class="star ${my.has(r.t) ? 'on' : ''}" data-s="${esc(r.t)}" title="Add to my list">★</button><b>${esc(r.t.replace('.JO', ''))}</b> ${cov}<small>${esc(r.n)} · ${esc(r.sec)}</small></td>
        <td class="${cc(sc >= .45 ? 2 : sc >= .18 ? 1 : sc <= -.45 ? -2 : sc <= -.18 ? -1 : 0)}"><span class="hc">${r.total}/${r.max}</span></td><td class="plain"><span class="${sigCls(r.v)}">${esc(r.v)}</span></td>
        <td class="plain" style="text-align:right">${px(r.px, r.cur)}<small style="display:block;color:${r.chg >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(r.chg)}</small></td>` +
        COLS.map(c => `<td class="${cc(r.sc[c.k])}"><span class="hc">${esc(c.d(r) ?? '—')}</span></td>`).join('') +
        `<td class="plain" style="text-align:left;white-space:normal;min-width:150px">${(r.cat || []).map(x => `<span class="tag ${/^Results/.test(x) ? 'ev' : ''}">${esc(x)}</span>`).join('')}</td><td class="plain">${esc(r.ne || '—')}</td></tr>`;
    }).join('') + '</tbody>';
    $('scTbl').innerHTML = h;
    $('scMore').hidden = rows.length <= shown; $('scMore').textContent = `Show more (${rows.length - shown} more)`;
    const all = S.rows.filter(r => r.m === mkt);
    const cnt = v => all.filter(r => v.includes(r.v)).length;
    $('scKpis').innerHTML = [[all.length, 'companies scanned'], [cnt(['BUY', 'STRONG BUY']), 'on BUY / STRONG BUY'], [cnt(['SELL', 'STRONG SELL']), 'on SELL / STRONG SELL'],
      [all.filter(r => r.setup === 'Breakout' || r.setup === 'Retest').length, 'breakouts & retests today'], [rows.length, 'match your filters']].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  }
  function fillSectors() {
    if (!S) return;
    const secs = [...new Set(S.rows.filter(r => r.m === mkt).map(r => r.sec))].sort();
    ['scSec', 'invSec'].forEach(id => { const el = $(id), v = el.value; el.innerHTML = '<option value="all">All sectors</option>' + secs.map(s => `<option>${esc(s)}</option>`).join(''); if (secs.includes(v)) el.value = v; });
  }
  function drawSetups() {
    const acct = parseFloat($('acct').value) || 0, risk = (parseFloat($('riskPct').value) || 1) / 100;
    $('acctCur').textContent = mkt === 'JSE' ? 'R' : '$';
    const rs = (S ? S.rows : []).filter(r => r.m === mkt && r.plan);
    const tbl = (side, el) => {
      const list = rs.filter(r => r.plan.side === side).sort((a, b) => (side === 'Long' ? -1 : 1) * (a.total / a.max - b.total / b.max));
      el.innerHTML = `<thead><tr><th>COMPANY</th><th>SETUP</th><th>LRC STOCK SCANNER</th><th>ENTRY</th><th>STOP · DOWNSIDE</th><th>TARGET 1 · UPSIDE</th><th>TARGET 2 · UPSIDE</th><th>SIZE</th><th>EVENT RISK</th></tr></thead><tbody>` +
        (list.length ? list.map(r => { const p = r.plan, rps = Math.abs(p.entry - p.stop), sh = rps ? Math.floor(acct * risk / rps) : 0;
          const d = r.ne ? Math.round((new Date(r.ne) - new Date()) / 864e5) : null;
          return `<tr style="cursor:pointer" onclick="location.href='stock.html?t=${encodeURIComponent(r.t)}'"><td><span class="tic">${esc(r.t.replace('.JO', ''))}</span><small>${esc(r.n)}</small></td>
          <td>${esc(r.setup)}<small>level ${px(r.lvl, r.cur)}</small></td><td><span class="${sigCls(r.v)}">${esc(r.v)}</span><small>${r.total}/${r.max}</small></td>
          <td class="n">${px(p.entry, r.cur)}</td><td class="n">${px(p.stop, r.cur)}<small style="color:#F08A7E">${chgPct(p.stop, p.entry)}</small></td><td class="n">${px(p.t1, r.cur)}<small style="color:#5ED39A">${chgPct(p.t1, p.entry)}</small></td><td class="n">${px(p.t2, r.cur)}<small style="color:#5ED39A">${chgPct(p.t2, p.entry)}</small></td>
          <td class="n">${sh.toLocaleString('en-ZA')}<small>≈ ${px(sh * p.entry, r.cur)}</small></td><td>${d !== null && d >= 0 && d <= 14 ? `<span class="tag ev">Results in ${d}d</span>` : '—'}</td></tr>`; }).join('')
          : `<tr><td colspan="9" style="color:var(--muted)">No ${side.toLowerCase()} setups in this market today.</td></tr>`) + '</tbody>';
    };
    tbl('Long', $('stLong')); tbl('Short', $('stShort'));
  }
  function drawInvest() {
    const g = $('invG').value, sec = $('invSec').value;
    const list = (S ? S.rows : []).filter(r => r.m === mkt && r.inv && (g === 'all' || (g === 'A' ? r.inv.g === 'A' : r.inv.g !== 'C')) && (sec === 'all' || r.sec === sec) && (!$('invMos').checked || r.inv.mos > 0))
      .sort((a, b) => b.inv.p - a.inv.p || (b.inv.mos ?? -9) - (a.inv.mos ?? -9));
    $('invTbl').innerHTML = `<thead><tr><th>COMPANY</th><th>GRADE</th><th>CHECKS PASSED</th><th>ROE</th><th>FWD P/E</th><th>P/FCF</th><th>DEBT/EQ</th><th>EPS GROWTH /YR</th><th>REVENUE GROWTH /YR</th><th>UPSIDE TO LRC TARGET</th><th>LRC STOCK SCANNER</th></tr></thead><tbody>` +
      (list.length ? list.slice(0, 200).map(r => `<tr style="cursor:pointer" onclick="location.href='stock.html?t=${encodeURIComponent(r.t)}'"><td><span class="tic">${esc(r.t.replace('.JO', ''))}</span><small>${esc(r.n)} · ${esc(r.sec)}</small></td>
        <td><span class="pill p-${r.inv.g.toLowerCase()}">${r.inv.g}</span></td><td class="n">${r.inv.p} / ${r.inv.k}</td><td class="n">${pp(r.raw.roe, 0)}</td><td class="n">${mult(r.raw.fpe)}</td><td class="n">${mult(r.raw.pfcf)}</td>
        <td class="n">${ok(r.raw.de) ? (r.raw.de / 100).toFixed(2) : '—'}</td><td class="n">${pc(r.inv.ec, 0)}</td><td class="n">${pc(r.inv.rc, 0)}</td>
        <td class="n" style="color:${(r.inv.mos ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(r.inv.mos, 0)}</td><td><span class="${sigCls(r.v)}">${esc(r.v)}</span></td></tr>`).join('')
        : '<tr><td colspan="11" style="color:var(--muted)">No companies pass these filters today.</td></tr>') + '</tbody>';
  }
  let etfView = 'group';
  document.querySelectorAll('#etfView .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#etfView .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); etfView = b.dataset.v; drawEtfs(); }));
  function drawEtfs() {
    if (!E) return fail($('etfOut'), 'ETF scan');
    const rs = E.rows.filter(r => r.m === mkt);
    const tbl = list => `<div class="tbl-wrap"><table class="heat" style="min-width:1100px"><thead><tr><th style="text-align:left;position:sticky;left:0;z-index:3">ETF</th><th>SCORE</th><th>LRC STOCK SCANNER</th><th>PRICE</th><th class="g-tech">TREND</th><th class="g-tech">MOMENTUM</th><th class="g-tech">SETUP</th><th class="g-tech">RSI</th><th class="g-tech">VOLUME</th><th>1W</th><th>1M</th><th>3M</th><th>6M</th><th>YTD</th><th>ENTRY PLAN</th></tr></thead><tbody>` +
      list.map(r => `<tr><td class="nm"><b>${esc(r.t.replace('.JO', ''))}</b><small>${esc(r.n)}${r.full ? ' · ' + esc(r.full) : ''}</small></td><td class="${cc(r.total >= 4 ? 2 : r.total >= 2 ? 1 : r.total <= -4 ? -2 : r.total <= -2 ? -1 : 0)}"><span class="hc">${r.total}/${r.max}</span></td>
        <td class="plain"><span class="${sigCls(r.v)}">${esc(r.v)}</span></td><td class="plain">${px(r.px, r.cur)}</td>
        <td class="${cc(r.sc.trend)}"><span class="hc">${({ 2: 'Up ▲▲', 1: 'Up ▲', '-1': 'Down ▼', '-2': 'Down ▼▼' })[r.sc.trend] || 'Flat'}</span></td><td class="${cc(r.sc.momentum)}"><span class="hc">${pc(r.rs, 0)}</span></td>
        <td class="${cc(r.sc.setup)}"><span class="hc">${esc(r.setup || '—')}</span></td><td class="${cc(r.sc.extension)}"><span class="hc">${ok(r.rsi) ? r.rsi.toFixed(0) : '—'}</span></td><td class="${cc(r.sc.volume)}"><span class="hc">${r.sc.volume > 0 ? 'Accum.' : r.sc.volume < 0 ? 'Distrib.' : '—'}</span></td>
        ${['p1w', 'p1m', 'p3m', 'p6m', 'ytd'].map(k => `<td class="plain" style="color:${(r[k] ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(r[k])}</td>`).join('')}
        <td class="plain" style="text-align:left">${r.plan ? `${r.plan.side} above ${px(r.plan.entry, r.cur)} · stop ${chgPct(r.plan.stop, r.plan.entry)} · target ${chgPct(r.plan.t1, r.plan.entry)}` : '—'}</td></tr>`).join('') + '</tbody></table></div>';
    if (etfView === 'rank') { $('etfOut').innerHTML = tbl(rs); return; }
    const order = ['Broad market', 'Sectors', 'Themes', 'Commodities & bonds', 'International'];
    $('etfOut').innerHTML = order.filter(g => rs.some(r => r.g === g)).map(g => `<h3 style="font-size:28px;margin-top:34px;color:#fff">${esc(g)}</h3>` + tbl(rs.filter(r => r.g === g))).join('');
  }
  function drawSectors() {
    if (!SE) return fail($('secOut'), 'sector scan');
    const rs = SE.rows.filter(r => r.m === mkt).sort((a, b) => b.score - a.score);
    $('secOut').innerHTML = rs.map(r => `<div class="sec-card"><h3>${esc(r.sec)} <span class="${sigCls(r.v)}">${esc(r.v)}</span></h3>
      <div class="sbar"><i style="left:calc(${(r.score + 10) * 5}% - 2px)"></i></div><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>−10</span><b style="color:var(--gold-2);font-size:15px">${r.score > 0 ? '+' : ''}${r.score}</b><span>+10</span></div>
      <dl><dt>Companies scanned</dt><dd>${r.n}</dd><dt>On BUY / on SELL</dt><dd>${pp(r.bull, 0)} / ${pp(r.bear, 0)}</dd><dt>Above 50-day average</dt><dd>${pp(r.above50, 0)}</dd><dt>Breakouts & retests</dt><dd>${r.setups}</dd>
      <dt>Sector ETF</dt><dd>${r.etf ? `${esc(r.etf.replace('.JO', ''))} <span class="${sigCls(r.etf_v)}" style="font-size:9.5px">${esc(r.etf_v || '')}</span>` : '—'}</dd><dt>ETF 1 month</dt><dd>${pc(r.etf_p1m)}</dd></dl>
      <p class="sec-tk" style="margin-top:10px;font-size:12.5px;color:var(--muted)">Strongest: ${r.top.map(t => `<a href="stock.html?t=${encodeURIComponent(t)}">${esc(t.replace('.JO', ''))}</a>`).join('')}<br>Weakest: ${r.bottom.map(t => `<a href="stock.html?t=${encodeURIComponent(t)}">${esc(t.replace('.JO', ''))}</a>`).join('')}</p></div>`).join('') || '<p class="muted-load">No sectors yet.</p>';
  }
  function drawAll() {
    if (!S) return;
    if (tab === 'stocks') drawStocks(); else if (tab === 'setups') drawSetups(); else if (tab === 'invest') drawInvest(); else if (tab === 'etfs') drawEtfs(); else if (tab === 'sectors') drawSectors();
  }
  ['scQ', 'scSec', 'scSig', 'scSet', 'scVal', 'scCov', 'scMine'].forEach(id => $(id).addEventListener(id === 'scQ' ? 'input' : 'change', () => { shown = 120; drawStocks(); }));
  ['invG', 'invSec', 'invMos'].forEach(id => $(id).addEventListener('change', drawInvest));
  ['acct', 'riskPct'].forEach(id => $(id).addEventListener('input', () => { store.set('lrc_' + id, $(id).value); drawSetups(); }));
  ['acct', 'riskPct'].forEach(id => { const v = store.get('lrc_' + id, null); if (v) $(id).value = v; });
  $('scMore').addEventListener('click', () => { shown += 200; drawStocks(); });
  $('scTbl').addEventListener('click', e => {
    const st = e.target.closest('.star'); if (st) { e.stopPropagation(); st.classList.toggle('on', toggleMine(st.dataset.s)); return; }
    const th = e.target.closest('th[data-k]'); if (th) { const k = th.dataset.k; sortD = sortK === k ? -sortD : (k === 't' || k === 'ne' ? 1 : -1); sortK = k; drawStocks(); return; }
    const tr = e.target.closest('tr[data-t]'); if (tr) location.href = 'stock.html?t=' + encodeURIComponent(tr.dataset.t);
  });
  $('scCsv').addEventListener('click', () => {
    const rows = rowsFor(); const head = ['Ticker', 'Name', 'Market', 'Sector', 'Price', 'Currency', 'Change 1D', 'LRC score', 'Max', 'LRC Stock Scanner', 'Setup', 'Entry', 'Stop', 'Target 1', 'Target 2', 'LRC Analyst Target', 'Fwd PE', 'TTM PE', 'P/S', 'P/FCF', 'Revenue growth', 'EPS growth', 'Debt/Equity %', 'ROE', 'Dividend yield', 'Analyst consensus', 'Target upside', 'Short float', 'Next results', 'LRC analyst rating'];
    const csv = [head].concat(rows.map(r => [r.t, r.n, r.m, r.sec, r.px, r.cur, r.chg, r.total, r.max, r.v, r.setup || '', r.plan?.entry ?? '', r.plan?.stop ?? '', r.plan?.t1 ?? '', r.plan?.t2 ?? '', r.tgt ?? '', r.raw.fpe ?? '', r.raw.tpe ?? '', r.raw.ps ?? '', r.raw.pfcf ?? '', r.raw.rev_growth ?? '', r.raw.eps_growth ?? '', r.raw.de ?? '', r.raw.roe ?? '', r.raw.div_yield ?? '', r.raw.rec ?? '', r.raw.tgt_up ?? '', r.raw.short ?? '', r.ne || '', r.cov?.rating || '']))
      .map(a => a.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `LRC_Scanner_${mkt}_${(S.as_of || {})[mkt] || ''}.csv`; a.click();
  });
  Promise.allSettled([get('scan/stocks.json'), get('scan/etfs.json'), get('scan/sectors.json')]).then(([a, b, c]) => {
    if (a.status !== 'fulfilled') { fail($('scTbl'), 'scanner'); return; }
    S = a.value; E = b.status === 'fulfilled' ? b.value : null; SE = c.status === 'fulfilled' ? c.value : null;
    $('scMeta').innerHTML = `<span class="ai">● Built by <b>${esc(S.agent)}</b></span><span>Prices as of <b>JSE ${esc(S.as_of?.JSE || '—')} · NY ${esc(S.as_of?.US || '—')}</b></span><span>Updated <b>${when(S.generated)}</b></span><span><b>${S.rows.length}</b> companies · <b>${E ? E.rows.length : 0}</b> ETFs</span>`;
    fillSectors(); showTab(tab);
  });
}

/* =================== WATCHLIST PAGE (coverage + trading + investment + news, both markets) =================== */
if ($('wlCov')) {
  let mkt = getMkt(), COV = null, L = null, NEWS = null;
  const link = t => `stock.html?t=${encodeURIComponent(t)}`;
  const nm = (t, n) => `<a href="${link(t)}"><span class="tic">${esc(t.replace('.JO', ''))}</span><small>${esc(n)}</small></a>`;
  const head1 = t => { const x = NEWS && NEWS.companies && NEWS.companies[t]; const h = x && x.news && x.news[0]; return h ? `<a href="${esc(h.url)}" target="_blank" rel="noopener" style="font-size:12.5px;color:#C9CEDA">${esc(h.title.slice(0, 90))}${h.title.length > 90 ? '…' : ''}</a><small>${esc(h.source)}${h.published ? ' · ' + esc(h.published.slice(0, 10)) : ''}</small>` : '<small>—</small>'; };
  const draw = () => {
    const cov = (COV ? COV.companies : []).filter(c => (c.ticker.endsWith('.JO') ? 'JSE' : 'US') === mkt);
    const cur = mkt === 'JSE' ? 'ZAR' : 'USD';
    $('wlCov').innerHTML = `<thead><tr><th>COMPANY</th><th>LRC RATING</th><th>PRICE</th><th>LRC ANALYST TARGET</th><th>UPSIDE</th><th>SINCE RATING</th><th>NEXT RESULTS</th><th>LATEST NEWS</th></tr></thead><tbody>` +
      (cov.length ? cov.map(c => `<tr><td>${nm(c.ticker, c.name)}</td><td><span class="pill p-${c.rating.toLowerCase()}">${esc(c.rating)}</span>${c.under_review ? '<small style="color:#F2CE72">under review</small>' : `<small>rated ${esc(c.rated || '')}</small>`}</td>
        <td class="n">${px(c.price, cur)}</td><td class="n">${px(c.target_6m, cur)}</td><td class="n" style="color:${(c.upside ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(c.upside)}</td><td class="n">${pc(c.since_rating)}</td><td>${esc(c.next_earnings || '—')}</td><td style="max-width:320px">${head1(c.ticker)}</td></tr>`).join('')
        : `<tr><td colspan="8" style="color:var(--muted)">No ${mkt === 'JSE' ? 'JSE' : 'New York'} companies carry an LRC analyst rating yet — the trading and investment watchlists below are built by the LRC Stock Scanner.</td></tr>`) + '</tbody>';
    const l = (L && L.lists && L.lists[mkt]) || { long: [], short: [], investment: [] };
    const trade = (rows, side) => `<thead><tr><th>COMPANY</th><th>SETUP</th><th>LRC STOCK SCANNER</th><th>ENTRY</th><th>STOP · ${side === 'Long' ? 'DOWNSIDE' : 'UPSIDE'}</th><th>TARGET 1</th><th>TARGET 2</th><th>RESULTS</th><th>LATEST NEWS</th></tr></thead><tbody>` +
      (rows.length ? rows.map(r => `<tr><td>${nm(r.t, r.n)}${r.cov ? ` <span class="pill p-${r.cov.rating.toLowerCase()}">LRC ${esc(r.cov.rating)}</span>` : ''}</td><td>${esc(r.setup)}<small>level ${px(r.lvl, r.cur)}</small></td><td><span class="${sigCls(r.v)}">${esc(r.v)}</span><small>${r.total}/${r.max}</small></td>
        <td class="n">${px(r.entry, r.cur)}</td><td class="n">${px(r.stop, r.cur)}<small style="color:#F08A7E">${pc(r.stop_pct)}</small></td><td class="n">${px(r.t1, r.cur)}<small style="color:#5ED39A">${pc(r.t1_pct)}</small></td><td class="n">${px(r.t2, r.cur)}<small style="color:#5ED39A">${pc(r.t2_pct)}</small></td>
        <td>${r.ne ? `<span class="tag ${Math.round((new Date(r.ne) - new Date()) / 864e5) <= 14 ? 'ev' : ''}">${esc(r.ne)}</span>` : '—'}</td><td style="max-width:300px">${head1(r.t)}</td></tr>`).join('')
        : `<tr><td colspan="9" style="color:var(--muted)">No ${side.toLowerCase()} setups pass the rules in this market today.</td></tr>`) + '</tbody>';
    $('wlLong').innerHTML = trade(l.long, 'Long'); $('wlShort').innerHTML = trade(l.short, 'Short');
    $('wlInv2').innerHTML = `<thead><tr><th>COMPANY</th><th>GRADE</th><th>CHECKS</th><th>PRICE</th><th>LRC ANALYST TARGET</th><th>UPSIDE</th><th>LRC STOCK SCANNER</th><th>LATEST NEWS</th></tr></thead><tbody>` +
      (l.investment.length ? l.investment.map(r => `<tr><td>${nm(r.t, r.n)}<small>${esc(r.sec)}</small></td><td><span class="pill p-${r.inv.g.toLowerCase()}">${r.inv.g}</span></td><td class="n">${r.inv.p}/${r.inv.k}</td><td class="n">${px(r.px, r.cur)}</td><td class="n">${px(r.tgt, r.cur)}</td>
        <td class="n" style="color:#5ED39A">${pc(r.tgt_up)}</td><td><span class="${sigCls(r.v)}">${esc(r.v)}</span></td><td style="max-width:300px">${head1(r.t)}</td></tr>`).join('')
        : '<tr><td colspan="8" style="color:var(--muted)">No companies pass the investment checks with upside today.</td></tr>') + '</tbody>';
    const R = (L && L.rules) || {};
    $('wlLongNote').textContent = R.long || ''; $('wlShortNote').textContent = R.short || ''; $('wlInvNote').textContent = R.investment || '';
    const names = new Set([...cov.map(c => c.ticker), ...l.long.map(r => r.t), ...l.short.map(r => r.t), ...l.investment.map(r => r.t)]);
    const items = [];
    if (NEWS) for (const t of names) { const x = NEWS.companies[t]; if (x) (x.news || []).forEach(n => items.push({ ...n, t })); }
    items.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
    $('wlNews').innerHTML = items.slice(0, 30).map(n => `<a class="wi" href="${esc(n.url)}" target="_blank" rel="noopener"><span class="wt"><span class="tk">${esc(n.t.replace('.JO', ''))}</span> ${esc(n.title)}</span><span class="wm"><b>${esc(n.source)}</b>${n.published ? ' · ' + esc(when(n.published)) : ''}</span></a>`).join('') || '<p class="muted-load">News for the watchlist companies is collected after each scanner run.</p>';
    $('wlKpis').innerHTML = [[cov.length, 'analyst-rated (' + ['BUY', 'HOLD', 'SELL'].map(k => cov.filter(c => c.rating === k).length + ' ' + k).join(' · ') + ')'], [l.long.length, 'long setups'], [l.short.length, 'short setups'], [l.investment.length, 'investment ideas'], [items.length, 'recent news stories']]
      .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  };
  window.addEventListener('lrcmarket', e => { mkt = e.detail; draw(); });
  Promise.allSettled([get('coverage.json'), get('scan/lists.json'), get('intel/index.json')]).then(([a, b, c]) => {
    COV = a.status === 'fulfilled' ? a.value : null; L = b.status === 'fulfilled' ? b.value : null; NEWS = c.status === 'fulfilled' ? c.value : null; draw();
  });
}

/* =================== ONE-PAGE STOCK SUMMARY =================== */
if ($('paper')) {
  const T = (new URLSearchParams(location.search).get('t') || 'AAPL').toUpperCase();
  const P = $('paper');
  $('goT').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) location.href = 'stock.html?t=' + encodeURIComponent(e.target.value.trim().toUpperCase()); });
  $('dlPdf').addEventListener('click', () => window.print());
  $('cpLink').addEventListener('click', () => { navigator.clipboard?.writeText(location.href); $('cpLink').textContent = 'Link copied ✓'; });
  const mb = $('addMine'); const setMb = () => mb.textContent = mine().has(T) ? '★ On my list' : '☆ Add to my list'; setMb();
  mb.addEventListener('click', () => { toggleMine(T); setMb(); });
  let STORE = { report_price: 'R100', report_pay_link: '', order_email: 'info@leagorifumocapital.co.za', brokers: [] }, INTEL = null;
  const buyHref = (name) => STORE.report_pay_link || `mailto:${STORE.order_email}?subject=${encodeURIComponent(`Order: LRC full report — ${name} (${T}) — ${STORE.report_price}`)}&body=${encodeURIComponent(`Hi LRC team,\n\nI would like to buy the full LRC research report on ${name} (${T}) for ${STORE.report_price}. Please send payment details.\n\nName:\nPhone:\n`)}`;
  Promise.allSettled([get('scan/t/' + T.replace('^', '_') + '.json'), get('research/' + T + '.json'), get('store.json'), get('intel/' + T.replace('^', '_') + '.json')]).then(([a, b, st, it]) => {
    if (st.status === 'fulfilled') STORE = { ...STORE, ...st.value };
    if (it.status === 'fulfilled') INTEL = it.value;
    $('buyRep').textContent = `Buy the full report — ${STORE.report_price}`;
    if (a.status !== 'fulfilled') { P.innerHTML = `<h1>${esc(T)}</h1><p style="margin-top:12px">This company is not in the LRC Scanner universe yet (or today's scan has not run). <a href="scanner.html" style="color:#1F3BB3">Open the scanner</a> to pick another, or ask us to add it.</p>`; return; }
    render(a.value, b.status === 'fulfilled' ? b.value : null);
    const nm = a.value.row.n;
    $('buyRep').href = buyHref(nm); if (STORE.report_pay_link) $('buyRep').target = '_blank';
    $('afterPaper').innerHTML = `<div class="edu-note" style="max-width:none;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between"><span><b>FULL REPORT</b> This one-page summary is free. The full LRC report on ${esc(nm)} — business, financial statements, three-way valuation, risks and ESG — costs <b style="color:var(--gold-2)">${esc(STORE.report_price)}</b>. ${esc(STORE.report_delivery || '')}</span><a class="btn btn-gold" href="${esc(buyHref(nm))}"${STORE.report_pay_link ? ' target="_blank" rel="noopener"' : ''}>Buy the full report — ${esc(STORE.report_price)}</a></div>` +
      (STORE.brokers && STORE.brokers.length ? `<div class="edu-note" style="max-width:none;margin-top:14px"><b>TRADE ${esc(T.replace('.JO', ''))} WITH OUR PARTNERS</b> ${STORE.brokers.map(x => `<a class="btn btn-ghost" style="margin:6px 8px 0 0;padding:9px 14px" href="${esc(x.url)}" target="_blank" rel="noopener sponsored">${esc(x.name)}${x.markets ? ' · ' + esc(x.markets) : ''}</a>`).join('')}<br><small style="color:var(--muted)">Referral links: LRC may earn a fee if you open an account. It does not change our research.</small></div>` : '');
  });

  function render(d, R) {
    const r = d.row, t = d.tech, f = d.f, pr = d.profile || {}, c = r.cur, pl = d.plan, inv = d.investment;
    document.title = `LRC ${r.t} Summary ${r.ne ? '' : ''}— ${r.n} | Leago Rifumo Capital`;
    const today = new Date();
    const days = ds => ds ? Math.round((new Date(ds) - today) / 864e5) : null;
    const sigTxt = r.v;
    const tg = d.targets || {};
    // title
    let title, sub = '';
    const lrcT = r.cov ? r.cov.target : (R && R.target) ? R.target : (tg.lrc ?? tg.blend);
    const word = r.cov ? r.cov.rating : sigTxt;
    const cap = w => w.split(' ').map(x => x[0] + x.slice(1).toLowerCase()).join(' ');
    if (R && R.title) title = R.title;
    else title = `${cap(word)} Idea: LRC Analyst Target ${ok(lrcT) ? px(lrcT, c) + ` (${pc(lrcT / t.price - 1, 0)})` : 'n/a'}`;
    const analyst = R ? `${esc(R.analyst || 'Prayer Nkuna')} <span class="badge-an">${esc(R.analyst && /agent/i.test(R.analyst) ? 'LRC RESEARCH AGENT' : 'LRC ANALYST VIEW')}</span>` : 'Prayer Nkuna, Analyst · LRC Stock Scanner';
    const updated = R ? R.updated : (d.generated || '').slice(0, 10);
    const ret = (x) => `<span style="color:${(x ?? 0) >= 0 ? '#0F7B3F' : '#C5221F'};font-weight:700">${pc(x)}</span>`;

    // ---------- auto bullets ----------
    const drivers = [];
    if (t.setup) drivers.push(`<b>Technical:</b> ${esc(t.setup)} at ${px(t.setup_level, c)}${t.setup_note ? ' — ' + esc(t.setup_note) : ''}${t.setup_day ? ` (${esc(t.setup_day)})` : ''}.`);
    if (f.next_earnings) drivers.push(`<b>Next results:</b> ${esc(f.next_earnings)} (${days(f.next_earnings)} days) — the key near-term catalyst.`);
    (f.analyst_actions || []).slice(0, 3).forEach(a => drivers.push(`${esc(a.firm)} ${a.action === 'up' ? 'upgraded' : a.action === 'down' ? 'downgraded' : a.action === 'init' ? 'initiated' : 'reiterated'} to <b>${esc(a.to || '—')}</b>${a.from && a.action !== 'main' ? ` from ${esc(a.from)}` : ''} (${esc(a.date)}).`));
    if (ok(f.rev_growth) && f.rev_growth > 0.1) drivers.push(`Revenue growing ${pc(f.rev_growth, 0)} year on year.`);
    if (ok(f.eps_growth_fwd)) drivers.push(`Consensus expects EPS growth of ${pc(f.eps_growth_fwd, 0)} this year${ok(f.eps_growth_next) ? ` and ${pc(f.eps_growth_next, 0)} next year` : ''}.`);
    if (t.price >= t.hi52 * 0.995) drivers.push('Trading at a new 52-week high.');
    if (f.ex_div) drivers.push(`Ex-dividend date: ${esc(f.ex_div)}.`);
    const health = [];
    if (ok(f.revenue)) health.push(`Revenue (TTM) ${big(f.revenue, c)}${ok(f.rev_growth) ? `, ${pc(f.rev_growth, 0)} y/y (latest quarter)` : ''}.`);
    if (ok(f.gross_margin) || ok(f.op_margin)) health.push(`Margins: gross ${pp(f.gross_margin, 0)}, operating ${pp(f.op_margin, 0)}, net ${pp(f.profit_margin, 0)}.`);
    if (ok(f.eps_growth)) health.push(`EPS growth last quarter ${pc(f.eps_growth, 0)} y/y; trailing EPS ${px(f.trailing_eps, c)}${ok(f.forward_eps) ? `, forward EPS ${px(f.forward_eps, c)}` : ''}.`);
    if (ok(f.de)) health.push(`Debt-to-equity ${(f.de / 100).toFixed(2)}x${ok(f.cash) && ok(f.debt) ? `; cash ${big(f.cash, c)} vs debt ${big(f.debt, c)}` : ''}.`);
    if (ok(f.fcf)) health.push(`Free cash flow (TTM) ${big(f.fcf, c)}${ok(f.current_ratio) ? `; current ratio ${f.current_ratio.toFixed(2)}` : ''}.`);
    const sec = INTEL && INTEL.sec;
    if (sec && sec.annual) {
      const last = arr => arr && arr.length ? arr[arr.length - 1] : null;
      const ar = last(sec.annual.revenue), an = last(sec.annual.net_income), pr2 = sec.annual.revenue && sec.annual.revenue.length > 1 ? sec.annual.revenue[sec.annual.revenue.length - 2] : null;
      if (ar) health.push(`Official (SEC 10-K, year to ${esc(ar.end)}): revenue ${big(ar.value, 'USD')}${pr2 ? ` (${pc(ar.value / pr2.value - 1, 0)} y/y)` : ''}${an ? `, net income ${big(an.value, 'USD')}` : ''}${sec.annual_fcf ? `, free cash flow ${big(sec.annual_fcf.value, 'USD')} (operating cash flow less capex)` : ''}.`);
    }
    const perf = [`Current price: <b>${px(t.price, c)}</b> (${pc(t.chg_1d)} on the day).`,
      `Short term: ${ret(t.perf_1w)} on the week, ${ret(t.perf_1m)} on the month.`,
      `Mid term: ${ret(t.perf_ytd)} year to date; ${ret(t.perf_6m)} over 6 months${ok(t.rs_6m) ? ` (${pc(t.rs_6m)} vs ${esc(d.benchmark)})` : ''}.`,
      `Trend: price ${t.price > t.sma50 ? 'above' : 'below'} the 50-day (${px(t.sma50, c)}) and ${t.sma200 ? (t.price > t.sma200 ? 'above' : 'below') + ` the 200-day (${px(t.sma200, c)})` : 'no 200-day yet'}; RSI ${ok(t.rsi) ? t.rsi.toFixed(0) : '—'}.`];
    const risks = [];
    const vv = k => (d.valuation || []).find(x => x.k === k) || {};
    if (vv('fpe').verdict === 'Overvalued' || vv('tpe').verdict === 'Overvalued') risks.push('Valuation: priced above its sector on earnings multiples — less room for disappointment.');
    if (ok(f.tpe) && f.tpe < 0) risks.push('Loss-making on a trailing basis.');
    if (ok(f.de) && f.de > 150 && !['Financial Services', 'Real Estate'].includes(r.sec)) risks.push(`High debt: debt-to-equity ${(f.de / 100).toFixed(1)}x.`);
    if (ok(f.rev_growth) && f.rev_growth < 0) risks.push(`Revenue shrinking (${pc(f.rev_growth, 0)} y/y).`);
    if (ok(f.eps_growth) && f.eps_growth < 0) risks.push(`Earnings falling (${pc(f.eps_growth, 0)} y/y last quarter).`);
    if (ok(f.fcf) && f.fcf < 0) risks.push('Negative free cash flow.');
    if (f.next_earnings && days(f.next_earnings) <= 14) risks.push(`Event risk: results in ${days(f.next_earnings)} days.`);
    if (ok(f.short_float) && f.short_float > 0.1) risks.push(`High short interest (${pp(f.short_float)} of float).`);
    if (t.sma200 && t.price < t.sma200) risks.push('Below the 200-day average — the long-term trend is against buyers.');
    if (ok(f.beta) && f.beta > 1.5) risks.push(`High beta (${f.beta.toFixed(2)}): moves more than the market.`);
    if (!risks.length) risks.push('No red flags from the automated checks — read the latest results and SENS/filings for company-specific risks.');
    const recLbl = x => !ok(x) ? '—' : x <= 1.5 ? 'Strong buy' : x <= 2.5 ? 'Buy' : x <= 3.5 ? 'Hold' : x <= 4.5 ? 'Sell' : 'Strong sell';
    const rt = f.rec_trend || {};
    const sent = [];
    if (ok(f.rec_mean)) sent.push(`Analyst consensus: <b>${recLbl(f.rec_mean)}</b> (${f.rec_mean.toFixed(1)} on a 1–5 scale, ${f.n_analysts || '—'} analysts)${rt.buy !== undefined ? ` — ${(rt.strongBuy || 0) + (rt.buy || 0)} buy / ${rt.hold || 0} hold / ${(rt.sell || 0) + (rt.strongSell || 0)} sell` : ''}.`);
    if (ok(f.target_median)) sent.push(`Median target ${px(f.target_median, c)} (${pc(f.target_median / t.price - 1, 0)}); range ${px(f.target_low, c)}–${px(f.target_high, c)}.`);
    if (INTEL && INTEL.news && INTEL.news.length) sent.push(`${INTEL.news.length} news stories in the last two weeks; latest: “${esc(INTEL.news[0].title)}” (${esc(INTEL.news[0].source)}).`);
    if (!sent.length) sent.push('Limited analyst coverage on the data feed.');
    const own = [];
    if (ok(f.inst)) own.push(`Institutional ownership ${pp(f.inst, 0)}.`);
    if (ok(f.insiders)) own.push(`Insiders hold ${pp(f.insiders, 1)}.`);
    if (ok(f.short_float)) own.push(`Short interest ${pp(f.short_float, 1)} of float.`);
    const mgmt = (pr.officers || []).map(o => `${esc(o.title || '')}: ${esc(o.name || '')}`);
    const bizText = pr.summary ? esc(pr.summary.split(/(?<=\.)\s+/).slice(0, 3).join(' ')) : '';
    const autoBottom = `${esc(r.n)} scores <b>${r.total}/${r.max}</b> on the LRC Stock Scanner (<b>${esc(r.v)}</b>): technicals ${r.tech > 0 ? '+' : ''}${r.tech}, sentiment ${r.sent > 0 ? '+' : ''}${r.sent}, fundamentals ${r.fund > 0 ? '+' : ''}${r.fund}. ` +
      (t.setup ? `The chart shows a <b>${esc(t.setup.toLowerCase())}</b> at ${px(t.setup_level, c)}. ` : (t.sma200 && t.price > t.sma200 ? 'The long-term trend is up but there is no fresh setup today. ' : 'The trend is weak; patience until a base or retest forms. ')) +
      (vv('fpe').verdict && vv('fpe').verdict !== '—' ? `On forward earnings it looks <b>${esc(vv('fpe').verdict.toLowerCase())}</b> against its sector. ` : '') +
      (f.next_earnings ? `Next catalyst: results on ${esc(f.next_earnings)}.` : '');
    const ul = a => `<ul>${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
    const S = (k, auto) => R && R[k] && R[k].length ? ul(R[k].map(esc)) : ul(auto);

    // ---------- chart ----------
    const chart = priceChart(d, 470, 230);
    const fin = finChart(d.financials, c, 470, 170);
    const vals = (d.valuation || []).filter(v => v.v !== null && v.v !== undefined);
    const vcls = v => ({ Undervalued: 'v-under', Overvalued: 'v-over', 'Fairly valued': 'v-fair', Strong: 'v-strong', Weak: 'v-weak', 'In line': 'v-fair', 'Low debt': 'v-low', 'High debt': 'v-high', 'Loss-making': 'v-neg', 'Negative FCF': 'v-neg' })[v] || 'v-fair';
    const fmtV = (k, v) => ['fpe', 'tpe', 'ps', 'pfcf', 'peg', 'pb'].includes(k) ? (v <= 0 ? 'neg.' : v.toFixed(2)) : k === 'de' ? (v / 100).toFixed(2) + 'x' : k === 'current_ratio' ? v.toFixed(2) : pp(v, 1);
    const tgRows = [['Latest share price', t.price, false], ['Analyst median target', tg.analyst_median], ['P/FCF-based value', tg.pfcf], ['PEG-based value', tg.peg], ['Sector P/E-based value', tg.sector_pe],
      ['LRC Analyst Target (6 months)', lrcT]].filter(x => ok(x[1]));
    const heat = Object.entries(r.sc).filter(([k, v]) => v !== null).map(([k, v]) => `<span class="h${v >= 2 ? 2 : v >= 1 ? 1 : v <= -2 ? 'm2' : v <= -1 ? 'm1' : 0}">${esc(({ trend: 'Trend', momentum: 'Momentum', setup: 'Setup', extension: 'Extension', volume: 'Volume', analysts: 'Analysts', target: 'Target', short: 'Short int.', fpe: 'Fwd P/E', tpe: 'TTM P/E', ps: 'P/S', pfcf: 'P/FCF', rev_growth: 'Rev growth', eps_growth: 'EPS growth', de: 'Debt', roe: 'ROE', div_yield: 'Dividend' })[k] || k)} ${v > 0 ? '+' : ''}${v}</span>`).join('');
    const gauge = gaugeSvg(r.total, r.max, r.v);

    P.innerHTML = `
    <div class="ph"><div class="tkbox">${esc(r.t.replace('.JO', ''))}<small>${r.m === 'JSE' ? 'JSE' : 'NYSE / NASDAQ'}</small></div>
      <div><div style="font-size:15px;font-weight:800;color:#16223D">${esc(r.n)}</div><h1>${esc(title)}</h1></div><img src="assets/img/logo-lrc.png" alt="Leago Rifumo Capital"></div>
    <div class="pfacts">
      <div><b>Market cap / Price:</b> ${big(f.mcap, c)} / ${px(t.price, c)}<br><b>52-wk low / high:</b> ${px(t.lo52, c)} / ${px(t.hi52, c)}<br><b>Beta / Yield:</b> ${ok(f.beta) ? f.beta.toFixed(2) : '—'} / ${pp(f.div_yield, 2)}<br><b>Sector:</b> ${esc(r.sec)}${r.ind ? ' · ' + esc(r.ind) : ''}</div>
      <div>${R && R.guidance ? R.guidance.slice(0, 4).map(g => `<b>${esc(g.split(':')[0])}:</b>${esc(g.split(':').slice(1).join(':'))}`).join('<br>') :
        `<b>Next results:</b> ${esc(f.next_earnings || 'not announced')}<br><b>Analysts:</b> ${recLbl(f.rec_mean)}${f.n_analysts ? ` (${f.n_analysts})` : ''}${ok(f.target_median) ? ` · median target ${px(f.target_median, c)}` : ''}<br><b>EPS growth (this yr / next yr est.):</b> ${pc(f.eps_growth_fwd, 0)} / ${pc(f.eps_growth_next, 0)}<br><b>Fwd P/E vs sector:</b> ${mult(f.fpe)} vs ${mult(d.sector_medians?.fpe)}`}</div>
      <div><b>Last updated:</b> ${esc(updated)}<br><b>Analyst name:</b> ${analyst}<br><b>LRC Stock Scanner:</b> <span class="${sigCls(r.v)}" style="font-size:10px">${esc(r.v)}</span> ${r.total}/${r.max}${r.cov ? `<br><b>LRC analyst rating:</b> ${esc(r.cov.rating)} (${esc(r.cov.rated || '')})` : ''}${R && R.geo_mix ? `<br><b>Geo %:</b> ${esc(R.geo_mix)}` : ''}</div>
    </div>
    <div class="bar">Fundamentals <small>${R ? 'ANALYST VIEW + LIVE DATA' : 'AUTOMATED FROM LIVE DATA'}</small></div>
    <div class="cols"><div>
      <h4>Drivers / <span class="red">Catalysts</span>:</h4>${S('drivers', drivers.length ? drivers : ['No dated catalysts on the data feed.'])}
      <h4>Financial Health (Financials):</h4>${S('financial_health', health.length ? health : ['Financial data not available on the feed.'])}
      <h4>Stock Performance &amp; Trends Summary:</h4>${ul(perf.concat(R && R.performance ? R.performance.map(esc) : []))}
      <div class="${R && R.competition ? '' : 'biz'}"><h4>${R && R.competition ? 'Competition / Distribution / Production:' : 'Business:'}</h4>${R && R.competition ? ul(R.competition.map(esc)) : `<p>${bizText || '—'}</p>`}</div>
    </div><div>
      <h4>Management:</h4>${S('management', mgmt.length ? mgmt : ['—'])}
      <h4>Risks (to the long thesis):</h4>${S('risks', risks)}
      <h4>Analyst &amp; News Sentiment:</h4>${S('news_sentiment', sent)}
      <h4>Insider Activity &amp; Institutional Ownership:</h4>${S('ownership', own.length ? own : ['—'])}
      ${chart}
    </div></div>
    <p class="bl"><b class="k">Bottom Line:</b> ${R && R.bottom_line ? esc(R.bottom_line) : autoBottom}</p>
    <div class="bar">Valuation <small>VS ${esc(r.sec.toUpperCase())} · ${r.m === 'JSE' ? 'JSE' : 'NEW YORK'} MEDIAN</small></div>
    <div class="cols"><div>
      <table><thead><tr><th>Metric</th><th style="text-align:right">Value</th><th style="text-align:right">Sector</th><th>vs sector</th></tr></thead><tbody>
      ${vals.map(v => `<tr><td>${esc(v.label)}</td><td class="n">${fmtV(v.k, v.v)}</td><td class="n">${ok(v.sector) ? fmtV(v.k, v.sector) : '—'}</td><td class="${vcls(v.verdict)}">${esc(v.verdict)}</td></tr>`).join('')}
      </tbody></table>
    </div><div>
      <div class="gauge">${gauge}<div><b style="color:#16223D">LRC score ${r.total}/${r.max}</b><br><span style="color:#5C6478;font-size:12px">Technicals ${r.tech > 0 ? '+' : ''}${r.tech} · Sentiment ${r.sent > 0 ? '+' : ''}${r.sent} · Fundamentals ${r.fund > 0 ? '+' : ''}${r.fund}</span><div class="heatstrip">${heat}</div></div></div>
      <div class="tg" style="margin-top:10px">${tgRows.map(([l, v, g]) => `<span>${esc(l)}</span><span style="text-align:right;color:#5C6478">${g === false ? '' : pc(v / t.price - 1, 0)}</span><span class="${g === false ? '' : 'gv' + (v < t.price ? ' neg' : '')}" style="text-align:right;font-weight:800">${px(v, c)}</span>`).join('')}</div>
      ${R && R.valuation ? `<h4>Analyst valuation:</h4>${ul(R.valuation.map(esc))}` : ''}
      ${inv ? `<h4>Investment track (5–10 yrs): grade ${esc(inv.grade)} · ${inv.passed}/${inv.known} checks</h4><p style="font-size:11.5px;color:#5C6478">${inv.checks.filter(x => x.ok !== null).map(x => `<span style="color:${x.ok ? '#0F7B3F' : '#C5221F'}">${x.ok ? '✔' : '✘'} ${esc(x.k)}</span>`).join(' · ')}</p>` : ''}
    </div></div>
    <p class="bl"><b class="k">Bottom Line:</b> ${R && R.valuation_bottom_line ? esc(R.valuation_bottom_line) : `Against the median ${esc(r.sec)} company in ${r.m === 'JSE' ? 'the JSE' : 'New York'}, the shares look <b>${esc((vv('fpe').verdict || vv('tpe').verdict || 'n/a').toLowerCase())}</b> on earnings and <b>${esc((vv('pfcf').verdict || 'n/a').toLowerCase())}</b> on free cash flow. ${ok(lrcT) ? `The LRC Analyst Target is ${px(lrcT, c)} (${pc(lrcT / t.price - 1, 0)} from today).` : ''}`}
      ${R && R.catalysts_to_watch ? ` <b style="color:#C5221F">Catalysts to watch:</b> ${esc(R.catalysts_to_watch)}` : f.next_earnings ? ` <b style="color:#C5221F">Catalyst to watch:</b> results on ${esc(f.next_earnings)}.` : ''}</p>
    <div class="bar pg2">Technical Setup &amp; Entry Plan <small>LRC HOUSE RULES · RISK 1% OF THE ACCOUNT PER TRADE</small></div>
    ${pl ? `<p><b>${esc(pl.side)} — ${esc(t.setup)}.</b> ${esc(pl.how)}. ${pl.event_risk ? `<b style="color:#C5221F">${esc(pl.event_risk)}.</b>` : ''}</p>
      <div class="plan"><div>Entry<b>${px(pl.entry, c)}</b></div><div>Stop<b>${px(pl.stop, c)}</b>${chgPct(pl.stop, pl.entry)}</div><div>Target 1<b>${px(pl.t1, c)}</b>${chgPct(pl.t1, pl.entry)}</div><div>Target 2<b>${px(pl.t2, c)}</b>${chgPct(pl.t2, pl.entry)}</div><div>LRC Analyst Target<b>${ok(lrcT) ? px(lrcT, c) : '—'}</b>${chgPct(lrcT, t.price)} from today</div><div>Next major level<b>${pl.next_level ? px(pl.next_level, c) : '—'}</b>${pl.next_level ? chgPct(pl.next_level, pl.entry) : ''}</div></div>
      <p style="font-size:11.5px;color:#5C6478;margin-top:6px">Position size risks 1% of the account if the stop is hit. Example: ${r.m === 'JSE' ? 'R100,000' : '$10,000'} account → ${Math.floor((r.m === 'JSE' ? 1000 : 100) / pl.risk_per_share).toLocaleString('en-ZA')} shares.${pl.next_level ? `` : ''}</p>`
      : `<p>No breakout or retest setup today. Major support: ${(t.supports || []).map(s => px(s.price, c) + ` (${s.touches} touches)`).join(', ') || '—'}. Major resistance: ${(t.resistances || []).map(s => px(s.price, c) + ` (${s.touches} touches)`).join(', ') || '—'}. The scanner flags a <b>breakout</b> when price closes through resistance on 1.5× volume, or a <b>retest</b> when it pulls back to support and holds.</p>`}
    ${INTEL && ((INTEL.news || []).length || (INTEL.sec && INTEL.sec.filings || []).length) ? `<div class="bar">Latest News &amp; Filings <small>UPDATED ${esc(when(INTEL.generated))}</small></div>
      <div class="cols"><div><h4>News</h4><ul>${(INTEL.news || []).slice(0, 6).map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:#1F3BB3">${esc(n.title)}</a> <span style="color:#7A8296">— ${esc(n.source)}${n.published ? ', ' + esc(n.published.slice(0, 10)) : ''}</span></li>`).join('') || '<li>No recent stories.</li>'}</ul></div>
      <div>${INTEL.sec ? `<h4>SEC filings</h4><ul>${(INTEL.sec.filings || []).slice(0, 5).map(f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:#1F3BB3">${esc(f.form)}</a> ${esc(f.date)} — ${esc(f.desc)}</li>`).join('')}</ul><p style="font-size:11.5px;color:#5C6478">Insider (Form 4) filings in the last 90 days: ${INTEL.sec.insider_filings_90d}</p>` : `<h4>Company announcements</h4><p style="font-size:12px">JSE companies publish results and trading statements on SENS — the news list includes SENS stories carried by South African financial media.</p>`}</div></div>` : ''}
    ${fin ? `<div class="bar">Financials <small>QUARTERLY REVENUE · NET INCOME · NET MARGIN (${esc(fin.cur)})</small></div>${fin.svg}` : ''}
    <p class="src">Sources: ${R ? `LRC analyst research (${esc(R.analyst)}, ${esc(R.updated)}); ` : ''}${esc((d.sources || ['Yahoo Finance prices, fundamentals and analyst data']).concat(INTEL ? INTEL.sources || [] : []).join('; '))}${R && R.sources ? '; ' + esc(R.sources.slice(0, 6).join('; ')) : ''}. Scored by the LRC Stock Scanner (${esc(when(d.generated))}). Valuation verdicts compare each ratio with the median of the same sector in the same market. LRC Analyst Target: set by the analyst for companies with a completed LRC Work-sheet; otherwise calculated automatically every day: 60% analyst consensus and 40% LRC valuation models (P/FCF, PEG and sector P/E), kept within 20% of the consensus.
      <b>Educational only — not financial advice.</b> Leago Rifumo Capital · Ermelo, Mpumalanga · leagorifumocapital.co.za</p>`;
  }

  function series(d) {
    const h = d.history; if (!h || !h.c) return null;
    const dates = [h.d0]; let cur = new Date(h.d0 + 'T00:00:00Z');
    for (const g of h.gap) { cur = new Date(cur.getTime() + (+g) * 864e5); dates.push(cur.toISOString().slice(0, 10)); }
    const c = h.c, ma = n => c.map((_, i) => i + 1 >= n ? c.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n : null);
    return { dates, c, s50: ma(50), s200: ma(200) };
  }
  function priceChart(d, W, H) {
    const s = series(d); if (!s) return '';
    const n = Math.min(252, s.c.length), off = s.c.length - n;
    const C = s.c.slice(off), A = s.s50.slice(off), B = s.s200.slice(off), dt = s.dates.slice(off);
    const t = d.tech, pl = d.plan, cur = d.row.cur;
    const lv = [...(t.supports || []).slice(0, 2).map(x => ({ y: x.price, c: '#0F9D58', l: 'Support' })), ...(t.resistances || []).slice(0, 2).map(x => ({ y: x.price, c: '#C5221F', l: 'Resistance' }))];
    if (pl) lv.push({ y: pl.entry, c: '#1F3BB3', l: 'Entry' }, { y: pl.stop, c: '#C5221F', l: 'Stop' }, { y: pl.t1, c: '#0F9D58', l: 'T1' }, { y: pl.t2, c: '#0F9D58', l: 'T2' });
    const all = C.concat(A.filter(ok), B.filter(ok), lv.map(x => x.y)).filter(ok);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const L = 8, Rr = 70, Tp = 16, Bt = 22, w = W - L - Rr, h = H - Tp - Bt;
    const X = i => L + i * w / (n - 1), Y = v => Tp + (hi - v) / (hi - lo) * h;
    const path = arr => arr.map((v, i) => ok(v) ? `${X(i).toFixed(1)},${Y(v).toFixed(1)}` : null).filter(Boolean).map((p, i) => (i ? 'L' : 'M') + p).join('');
    let months = '', last = '';
    dt.forEach((x, i) => { const m = x.slice(0, 7); if (m !== last && i > 3) { months += `<text x="${X(i)}" y="${H - 6}" font-size="9" fill="#7A8296" text-anchor="middle">${new Date(x).toLocaleString('en-ZA', { month: 'short' })}</text>`; } last = m; });
    const lines = lv.filter(x => ok(x.y)).map(x => `<line x1="${L}" x2="${L + w}" y1="${Y(x.y)}" y2="${Y(x.y)}" stroke="${x.c}" stroke-dasharray="4 3" stroke-width="1"/><text x="${L + w + 4}" y="${Y(x.y) + 3}" font-size="9" fill="${x.c}">${x.l} ${px(x.y, cur)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:10px;border:1px solid #E3E6EE;border-radius:4px">
      <text x="${L}" y="11" font-size="10" fill="#16223D" font-weight="700">Daily close · 50-day (gold) · 200-day (green) · 12 months</text>
      <path d="${path(B)}" fill="none" stroke="#2E9E5B" stroke-width="1.3"/><path d="${path(A)}" fill="none" stroke="#D9A93E" stroke-width="1.3"/>
      <path d="${path(C)}" fill="none" stroke="#16223D" stroke-width="1.5"/>${lines}${months}
      <circle cx="${X(n - 1)}" cy="${Y(C[n - 1])}" r="3" fill="#1F3BB3"/></svg>`;
  }
  function finChart(fin, cur, W, H) {
    if (!fin) return null;
    const rev = fin.quarterlyTotalRevenue || [], ni = fin.quarterlyNetIncome || [];
    let use = rev.length >= 3 ? 'q' : 'a';
    const R = use === 'q' ? rev : (fin.annualTotalRevenue || []), N = use === 'q' ? ni : (fin.annualNetIncome || []);
    if (R.length < 2) return null;
    const rows = R.map(x => ({ d: x.date, r: x.value, n: (N.find(y => y.date === x.date) || {}).value, cur: x.currency })).filter(x => ok(x.r));
    const cc = rows[0].cur || cur;
    const mx = Math.max(...rows.map(x => Math.max(x.r, x.n || 0))), mn = Math.min(0, ...rows.map(x => x.n || 0));
    const L = 50, Rr = 40, Tp = 14, Bt = 20, w = W - L - Rr, h = H - Tp - Bt, bw = w / rows.length;
    const Y = v => Tp + (mx - v) / (mx - mn) * h;
    const fmtB = v => (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : (v / 1e6).toFixed(0) + 'M');
    const bars = rows.map((x, i) => { const x0 = L + i * bw + bw * 0.15, bW = bw * 0.33;
      return `<rect x="${x0}" y="${Y(x.r)}" width="${bW}" height="${Y(0) - Y(x.r)}" fill="#2E9E5B"/>` + (ok(x.n) ? `<rect x="${x0 + bW + 2}" y="${Math.min(Y(x.n), Y(0))}" width="${bW}" height="${Math.abs(Y(0) - Y(x.n))}" fill="${x.n >= 0 ? '#9AA0A6' : '#C5221F'}"/>` : '') +
        `<text x="${x0 + bW}" y="${H - 6}" font-size="9" fill="#7A8296" text-anchor="middle">${x.d.slice(2, 7)}</text><text x="${x0 + bW / 2}" y="${Y(x.r) - 2}" font-size="8" fill="#16223D" text-anchor="middle">${fmtB(x.r)}</text>`; }).join('');
    const mg = rows.map((x, i) => ok(x.n) && x.r ? [L + i * bw + bw / 2, x.n / x.r] : null).filter(Boolean);
    const mMax = Math.max(0.05, ...mg.map(m => m[1])), mMin = Math.min(0, ...mg.map(m => m[1]));
    const YM = v => Tp + (mMax - v) / (mMax - mMin) * h;
    const line = mg.map((m, i) => (i ? 'L' : 'M') + m[0] + ',' + YM(m[1])).join('');
    return { cur: cc, svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:640px;border:1px solid #E3E6EE;border-radius:4px">${bars}
      <path d="${line}" fill="none" stroke="#D9A93E" stroke-width="1.6"/>${mg.map(m => `<circle cx="${m[0]}" cy="${YM(m[1])}" r="2.5" fill="#D9A93E"/><text x="${m[0] + 4}" y="${YM(m[1]) - 4}" font-size="8" fill="#9C7426">${(m[1] * 100).toFixed(0)}%</text>`).join('')}
      <line x1="${L}" x2="${L + w}" y1="${Y(0)}" y2="${Y(0)}" stroke="#C9CED8"/><text x="4" y="${Tp + 8}" font-size="9" fill="#7A8296">${cc}</text>
      <rect x="${L + w - 150}" y="2" width="8" height="8" fill="#2E9E5B"/><text x="${L + w - 138}" y="10" font-size="9" fill="#5C6478">Revenue</text><rect x="${L + w - 92}" y="2" width="8" height="8" fill="#9AA0A6"/><text x="${L + w - 80}" y="10" font-size="9" fill="#5C6478">Net income</text><text x="${L + w - 22}" y="10" font-size="9" fill="#9C7426">Margin</text></svg>` };
  }
  function gaugeSvg(total, max, v) {
    const x = Math.max(-1, Math.min(1, total / (max || 1))), ang = Math.PI * (1 - (x + 1) / 2), cx = 60, cy = 58, r = 46;
    const arc = (a0, a1, col) => { const p0 = [cx + r * Math.cos(a0), cy - r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)]; return `<path d="M${p0} A${r},${r} 0 0,1 ${p1}" stroke="${col}" stroke-width="12" fill="none"/>`; };
    return `<svg width="120" height="78" viewBox="0 0 120 78">${arc(Math.PI, Math.PI * 0.62, '#C5221F')}${arc(Math.PI * 0.62, Math.PI * 0.38, '#BFC5D0')}${arc(Math.PI * 0.38, 0, '#0F9D58')}
      <line x1="${cx}" y1="${cy}" x2="${cx + (r - 6) * Math.cos(ang)}" y2="${cy - (r - 6) * Math.sin(ang)}" stroke="#E25D2B" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="5" fill="#1F3BB3"/>
      <text x="${cx}" y="76" text-anchor="middle" font-size="12" font-weight="800" fill="#16223D">${total}</text></svg>`;
  }
}
})();
