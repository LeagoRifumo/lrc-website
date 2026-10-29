// LRC Scanner + one-page stock summary (reads data/scan/*.json written by the daily LRC scanner run)
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
const S100 = r => r.score ?? 50;
const c100 = v => v === null || v === undefined ? null : v >= 80 ? 2 : v >= 60 ? 1 : v >= 40 ? 0 : v >= 20 ? -1 : -2;
const GRADE = v => v === null || v === undefined ? '—' : v >= 80 ? 'A' : v >= 60 ? 'B' : v >= 40 ? 'C' : v >= 20 ? 'D' : 'F';
const GRP = [['valuation', 'VALUATION'], ['growth', 'GROWTH'], ['profitability', 'PROFITABILITY'], ['health', 'FINANCIAL HEALTH'], ['income', 'INCOME'], ['sentiment', 'SENTIMENT'], ['technical', 'TECHNICAL']];
const gInt = v => v === null || v === undefined ? null : v >= 75 ? 2 : v >= 60 ? 1 : v >= 40 ? 0 : v >= 25 ? -1 : -2;
const TREND = { 2: 'Up ▲▲', 1: 'Up ▲', 0: 'Flat', '-1': 'Down ▼', '-2': 'Down ▼▼' };
const fmtR = (f, v) => v === null || v === undefined ? '—' : f === 'x' ? (v <= 0 ? 'neg.' : v.toFixed(1) + 'x') : f === 'p' ? pc(v, Math.abs(v) < 0.1 ? 1 : 0) : f === 'de' ? (v / 100).toFixed(2)
  : f === 'r' ? (+v).toFixed(2) : f === 'r1' ? (+v).toFixed(1) : f === 'r0' ? (+v).toFixed(0) : f === 'i' ? (v > 0 ? '+' : '') + v : f === 't' ? TREND[v] : f === 's' ? v : String(v);
const fmtP = (k, f, v) => (['div_yield', 'payout', 'short_float', 'insiders', 'inst', 'gross_margin', 'op_margin', 'profit_margin', 'roe', 'roa', 'fcf_margin'].includes(k) && f === 'p') ? (v === null || v === undefined ? '—' : (v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0) + '%') : fmtR(f, v);
const valCls = v => v === 'UNDERVALUED' ? 'sig sig-buy' : v === 'OVERVALUED' ? 'sig sig-sell' : 'sig sig-hold';
const scoreCell = r => `<span class="hc" title="Ranks above ${S100(r)}% of the companies scanned in this market">${S100(r)}</span>`;
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
const SAFE = window.LRC_SAFE === true && !$('paper');   // the one-page summary (stock.html) is not in safe mode   // set in main.js: hides BUY/SELL wording, entry plans and targets until LRC is licensed

/* =================== SCANNER PAGE =================== */
if ($('scTbl')) {
  let S, E, SE, mkt = getMkt(), tab = (location.hash || '#stocks').slice(1), sortD = -1, shown = 120;
  const sel = $('scMkt'); sel.value = mkt;
  sel.addEventListener('change', () => { mkt = sel.value; setMkt(mkt); shown = 120; fillSectors(); drawAll(); });
  window.addEventListener('lrcmarket', e => { if (e.detail !== mkt) { mkt = e.detail; sel.value = mkt; shown = 120; fillSectors(); drawAll(); } });
  const tabs = document.querySelectorAll('#scTabs button');
  const showTab = t => { if (SAFE && t === 'setups') t = 'stocks'; tab = ['stocks', 'setups', 'invest', 'etfs', 'sectors', 'how'].includes(t) ? t : 'stocks'; tabs.forEach(b => b.classList.toggle('on', b.dataset.t === tab));
    mode = tab === 'invest' ? 'investment' : 'trading';
    ['stocks', 'setups', 'invest', 'etfs', 'sectors', 'how'].forEach(p => $('pane-' + p).hidden = !(p === tab || (p === 'stocks' && tab === 'invest')) || (p === 'invest'));
    $('scWrap').classList.toggle('wide', tab === 'stocks' || tab === 'invest' || tab === 'etfs'); history.replaceState(null, '', '#' + tab); const tb = $('scTabs'), on = tb.querySelector('button.on'); if (on && tb.scrollWidth > tb.clientWidth) tb.scrollLeft = on.offsetLeft - (tb.clientWidth - on.offsetWidth) / 2; drawAll(); };
  document.querySelectorAll('#scView .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#scView .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); view = b.dataset.v; drawStocks(); }));
  $('scFull').addEventListener('click', () => { const w = $('scTblWrap'); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen(); else w.classList.toggle('fs'); });
  tabs.forEach(b => b.addEventListener('click', () => showTab(b.dataset.t)));

  let view = 'overview', mode = 'trading';
  const SC = r => mode === 'investment' ? (r.iv_score ?? 50) : S100(r), RT = r => mode === 'investment' ? r.iv_v : r.v, NT = r => mode === 'investment' ? r.iv_note : r.v_note;
  const rowsFor = () => {
    if (!S) return [];
    const q = ($('scQ').value || '').toLowerCase(), sec = $('scSec').value, sg = $('scSig').value, st = $('scSet').value, vl = $('scVal').value, my = mine();
    return S.rows.filter(r => r.m === mkt && (sec === 'all' || r.sec === sec) && (sg === 'all' || RT(r) === sg) &&
      (st === 'all' || (st === 'none' ? !r.setup : r.setup === st)) && (!$('scMine').checked || my.has(r.t)) &&
      (vl === 'all' || (vl === 'under' ? r.val === 'UNDERVALUED' : vl === 'over' ? r.val === 'OVERVALUED' : r.val === 'FAIR VALUE')) && (!q || (r.t + ' ' + r.n + ' ' + (r.ind || '')).toLowerCase().includes(q)));
  };
  const rdv = (r, k) => (r.rd && r.rd[k]) ? r.rd[k] : null;
  const RORD = { 'STRONG BUY': 4, 'BUY': 3, 'HOLD': 2, 'SELL': 1, 'STRONG SELL': 0 };
  const money = (v, cur) => !ok(v) ? '—' : (cur === 'ZAR' ? 'R' : '$') + (v >= 1e9 ? (v / 1e9).toFixed(1) + 'bn' : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'm' : Math.round(v / 1e3) + 'k');
  const liq = r => `<b style="color:${r.liq === 'thin' ? '#F2CE72' : '#E3E6EE'}">${money(r.vt, r.cur)}</b><small style="display:block;color:var(--muted)">${ok(r.rv) ? `<span style="color:${r.rv >= 1.5 ? '#5ED39A' : 'inherit'}">${r.rv.toFixed(1)}× vol</span>` : ''}${ok(r.atrp) ? ` · ${(r.atrp * 100).toFixed(1)}%` : ''}</small>`;
  const sortVal = (r, k) => k === 'vt' ? (r.vt || 0) : k === 'rv' ? (r.rv ?? -1) : k === 'atr' ? (r.atrp ?? -1) : k === 'score' ? SC(r) : k === 'rt' ? (RORD[RT(r)] ?? -1) * 1000 + SC(r) : k === 'chk' ? (r.inv ? r.inv.p : -1) : k === 't' ? r.t : k === 'chg' ? r.chg : k === 'ne' ? (r.ne || '9') : k === 'up' ? (r.tgt ? r.tgt / r.px - 1 : -9)
    : k === 'val' ? ({ UNDERVALUED: 2, 'FAIR VALUE': 1, OVERVALUED: 0 })[r.val] ?? -1 : k.startsWith('g:') ? ((r.grp || {})[k.slice(2)] ?? -1)
    : (() => { const x = rdv(r, k); return x ? (x[1] ?? -9) * 1e9 + (typeof x[0] === 'number' ? x[0] : 0) : -9e12; })();
  let sortK = 'rt';
  function drawStocks() {
    const rows = rowsFor().sort((a, b) => { const x = sortVal(a, sortK), y = sortVal(b, sortK); return (x > y ? 1 : x < y ? -1 : 0) * sortD; });
    const my = mine(), MED = (S.medians || {})[mkt] || {};
    const th = (k, l, t = '') => `<th data-k="${k}" title="${esc(t)}" class="${sortK === k ? 'sorted' + (sortD > 0 ? ' asc' : '') : ''}">${l}</th>`;
    const left = r => {
      const cov = r.cov ? `<span class="pill p-${r.cov.rating.toLowerCase()}" title="LRC analyst rating ${esc(r.cov.rated || '')}">LRC ${esc(r.cov.rating)}</span> ` : '';
      return `<td class="nm"><button class="star ${my.has(r.t) ? 'on' : ''}" data-s="${esc(r.t)}" title="Add to my list">★</button><b>${esc(r.t.replace('.JO', ''))}</b> ${cov}${r.liq === 'thin' ? '<span class="liq-thin" title="Thinly traded: under R1m (JSE) or $5m (New York) a day">thin</span> ' : ''}<small>${esc(r.n)} · ${esc(r.sec)}</small></td>
        <td class="${cc(gInt(SC(r)))}"><span class="hc" title="${mode === 'investment' ? 'Investment score: valuation 25%, profitability 25%, financial health 20%, growth 20%, income 10%' : 'Trading score: technical 35%, growth 20%, sentiment 20%, valuation 10%, profitability 10%, financial health 5%'}">${SC(r)}</span></td>
        <td class="plain"><span class="${sigCls(RT(r))}" title="${esc(NT(r) || '')}">${esc(RT(r))}</span>${NT(r) && !SAFE ? `<small style="display:block;color:#F2CE72;font-size:10px;margin-top:2px">${esc((() => { const n = String(NT(r)).split('; ').pop().replace(/^Capped by the LRC Analyst Target \((.*)\)$/, 'target $1'); return n.length > 46 ? n.slice(0, 44) + '…' : n; })())}</small>` : ''}</td>
        <td class="plain"><span class="${valCls(r.val)}" style="font-size:9px">${esc(r.val || '—')}</span></td>
        <td class="plain" style="text-align:right">${px(r.px, r.cur)}<small style="display:block;color:${r.chg >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(r.chg)}</small></td>
        <td class="plain liqc" style="text-align:right" title="Value traded a day (20-day average) · today's volume vs normal · average daily move">${liq(r)}</td>`;
    };
    const head = `<th data-k="t" style="position:sticky;left:0;z-index:3;text-align:left">COMPANY</th>${th('score', mode === 'investment' ? 'INVESTMENT SCORE' : 'TRADING SCORE', '50 = neutral; 75+ STRONG BUY, 60+ BUY, 40+ HOLD, 25+ SELL, below 25 STRONG SELL')}${th('rt', (mode === 'investment' ? 'INVESTMENT RATING' : 'TRADING RATING') + ' ⇅', 'Tap to sort: STRONG BUY first, tap again for STRONG SELL first')}${th('val', 'VALUATION VERDICT')}${th('chg', 'PRICE · 1D')}${th('vt', 'LIQUIDITY<small style="display:block;color:var(--muted);font-weight:500">value / day · vol · move</small>', 'Not scored. Value traded a day (20-day average), today\'s volume vs normal, and the average daily move (ATR %). Traders need enough of both to get in and out.')}`;
    let h;
    if (view === 'overview') {
      const ORD = mode === 'investment' ? ['valuation', 'profitability', 'health', 'growth', 'income', 'sentiment', 'technical'] : ['technical', 'growth', 'sentiment', 'valuation', 'profitability', 'health', 'income'];
      const G2 = ORD.map(k => GRP.find(g => g[0] === k));
      const WT = mode === 'investment' ? { valuation: 25, profitability: 25, health: 20, growth: 20, income: 10 } : { technical: 35, growth: 20, sentiment: 20, valuation: 10, profitability: 10, health: 5 };
      h = `<thead><tr>${head}` + G2.map(([k, l]) => th('g:' + k, `${l}<small style="display:block;color:var(--muted);font-weight:500">${WT[k] ? WT[k] + '% weight' : 'shown, not weighted'}</small>`, 'Group score 0-100 from its readings (50 = neutral)')).join('') +
        (mode === 'investment' ? `${th('chk', 'QUALITY CHECKS')}${th('up', 'UPSIDE TO LRC TARGET')}` : `<th>SETUP</th>${th('up', 'UPSIDE TO 6-MONTH LRC TARGET')}`) + `<th>EVENTS</th>${th('ne', 'RESULTS')}</tr></thead><tbody>` +
        rows.slice(0, shown).map(r => `<tr data-t="${esc(r.t)}">${left(r)}` + G2.map(([k]) => { const v = (r.grp || {})[k]; return `<td class="${cc(gInt(v))}" style="${WT[k] ? '' : 'opacity:.55'}"><span class="hc">${v ?? '—'}</span></td>`; }).join('') +
          (mode === 'investment' ? `<td class="plain">${r.inv ? `<span class="pill p-${r.inv.g.toLowerCase()}">${r.inv.g}</span> ${r.inv.p}/${r.inv.k}` : '—'}</td>` : `<td class="${cc(r.tp ? r.tp.setup : 0)}"><span class="hc">${esc(r.setup || '—')}</span></td>`) +
          `<td class="plain" style="color:${r.tgt && r.tgt >= r.px ? '#5ED39A' : '#F08A7E'}">${r.tgt ? pc(r.tgt / r.px - 1, 0) : '—'}</td>
          <td class="plain" style="text-align:left;white-space:normal;min-width:130px">${(r.cat || []).map(x => `<span class="tag ${/^Results/.test(x) ? 'ev' : ''}">${esc(x)}</span>`).join('')}</td><td class="plain">${esc(r.ne || '—')}</td></tr>`).join('') + '</tbody>';
    } else {
      const defs = (S.readings || []).filter(d => d.g === view);
      h = `<thead><tr>${head}` + defs.map(d => th(d.k, d.l.toUpperCase() + (d.max === 2 ? ' (±2)' : ''), 'Big number = the company. Small = sector median. Colour: bright green / green = better, grey = neutral, red / bright red = worse.')).join('') + `</tr></thead><tbody>` +
        rows.slice(0, shown).map(r => {
          const sm = MED[r.sec] || {}, mm = MED._market || {};
          return `<tr data-t="${esc(r.t)}">${left(r)}` + defs.map(d => {
            const x = rdv(r, d.k); const v = x ? x[0] : null, p = x ? x[1] : null, it = x ? x[2] : null;
            const sec = sm[d.k], mk = mm[d.k];
            const showMed = !['trend', 'setup'].includes(d.k) && (sec !== undefined && sec !== null);
            return `<td class="${x && p !== null ? cc(it) : 'cn'}" title="${esc(`${d.l}: ${fmtP(d.k, d.f, v)} · sector median ${fmtP(d.k, d.f, sec)} · market median ${fmtP(d.k, d.f, mk)} · points ${p === null || p === undefined ? 'not scored' : (p > 0 ? '+' : '') + p}`)}"><span class="hc">${esc(fmtP(d.k, d.f, v))}${showMed ? `<small style="display:block;font-size:9.5px;font-weight:500;opacity:.8">sector ${esc(fmtP(d.k, d.f, sec))}</small>` : ''}</span></td>`;
          }).join('') + '</tr>';
        }).join('') + '</tbody>';
    }
    $('scTbl').innerHTML = h;
    $('scMore').hidden = rows.length <= shown; $('scMore').textContent = `Show more (${rows.length - shown} more)`;
    const all = S.rows.filter(r => r.m === mkt);
    const cnt = v => all.filter(r => v.includes(RT(r))).length;
    $('scMode').innerHTML = SAFE ? (mode === 'investment' ? '<b>INVESTMENT SCANNER · 5–10 YEARS</b> Scores each company for long-term quality: valuation 25%, profitability 25%, financial health 20%, long-term growth 20%, income 10%. Grades: Top scoring 75+, Strong 60–74, Average 40–59, Weak 25–39, Lowest scoring below 25. Grades describe the company against its sector; they are not a recommendation to buy or sell.'
      : '<b>TRADING SCANNER · 3–12 MONTHS</b> Scores each company on what tends to matter over months: technical 35%, growth 20%, sentiment 20%, valuation 10%, profitability 10%, financial health 5%. Grades: Top scoring 75+, Strong 60–74, Average 40–59, Weak 25–39, Lowest scoring below 25. Grades describe the data; they are not a recommendation to buy or sell.') : mode === 'investment' ? '<b>INVESTMENT SCANNER · 5–10 YEARS</b> Built for buy-and-hold: valuation 25%, profitability 25%, financial health 20%, long-term growth 20%, income 10%. Technicals and sentiment are shown but not weighted. A BUY cannot be OVERVALUED and a SELL cannot be UNDERVALUED.'
      : '<b>TRADING SCANNER · 3–12 MONTHS</b> Built for trades with a 6-month LRC Analyst Target: technical 35%, growth 20%, sentiment 20%, valuation 10%, profitability 10%, financial health 5%. A BUY needs upside to the 6-month target and a SELL needs downside. Entry plans are on the Setups tab.';
    $('scKpis').innerHTML = [[all.length, 'companies scanned'], [cnt(['BUY', 'STRONG BUY']), 'rated BUY / STRONG BUY'], [cnt(['HOLD']), 'rated HOLD'], [cnt(['SELL', 'STRONG SELL']), 'rated SELL / STRONG SELL'],
      [all.filter(r => r.val === 'UNDERVALUED').length, 'undervalued']].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  }
  function fillSectors() {
    if (!S) return;
    const secs = [...new Set(S.rows.filter(r => r.m === mkt).map(r => r.sec))].sort();
    ['scSec', 'invSec'].forEach(id => { const el = $(id), v = el.value; el.innerHTML = '<option value="all">All sectors</option>' + secs.map(s => `<option>${esc(s)}</option>`).join(''); if (secs.includes(v)) el.value = v; });
  }
  function drawSetups() {
    const rs = (S ? S.rows : []).filter(r => r.m === mkt && r.plan);
    const tbl = (side, el) => {
      const list = rs.filter(r => r.plan.side === side).sort((a, b) => (side === 'Long' ? -1 : 1) * (S100(a) - S100(b)));
      el.innerHTML = `<thead><tr><th>COMPANY</th><th>SETUP</th><th>LRC STOCK SCANNER</th><th>ENTRY</th><th>STOP · DOWNSIDE</th><th>TARGET 1 · UPSIDE</th><th>TARGET 2 · UPSIDE</th><th>EVENT RISK</th></tr></thead><tbody>` +
        (list.length ? list.map(r => { const p = r.plan;
          const d = r.ne ? Math.round((new Date(r.ne) - new Date()) / 864e5) : null;
          return `<tr style="cursor:pointer" onclick="location.href='stock.html?t=${encodeURIComponent(r.t)}'"><td><span class="tic">${esc(r.t.replace('.JO', ''))}</span><small>${esc(r.n)}</small></td>
          <td>${esc(r.setup)}<small>level ${px(r.lvl, r.cur)}</small></td><td><span class="${sigCls(r.v)}">${esc(r.v)}</span><small>LRC score ${S100(r)}/100</small></td>
          <td class="n">${px(p.entry, r.cur)}</td><td class="n">${px(p.stop, r.cur)}<small style="color:#F08A7E">${chgPct(p.stop, p.entry)}</small></td><td class="n">${px(p.t1, r.cur)}<small style="color:#5ED39A">${chgPct(p.t1, p.entry)}</small></td><td class="n">${px(p.t2, r.cur)}<small style="color:#5ED39A">${chgPct(p.t2, p.entry)}</small></td>
          <td>${d !== null && d >= 0 && d <= 14 ? `<span class="tag ev">Results in ${d}d</span>` : '—'}</td></tr>`; }).join('')
          : `<tr><td colspan="8" style="color:var(--muted)">No ${side.toLowerCase()} setups in this market today.</td></tr>`) + '</tbody>';
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
    const tbl = list => `<div class="tbl-wrap"><table class="heat" style="min-width:1100px"><thead><tr><th style="text-align:left;position:sticky;left:0;z-index:3">ETF</th><th>LRC SCORE</th><th>RATING</th><th>PRICE</th><th class="g-tech">TREND</th><th class="g-tech">VS MARKET (6M)</th><th class="g-tech">SETUP</th><th class="g-tech">RSI</th><th class="g-tech">VOLUME</th><th>1W</th><th>1M</th><th>3M</th><th>6M</th><th>YTD</th><th>ENTRY PLAN</th></tr></thead><tbody>` +
      list.map(r => `<tr><td class="nm"><b>${esc(r.t.replace('.JO', ''))}</b><small>${esc(r.n)}${r.full ? ' · ' + esc(r.full) : ''}</small></td><td class="${cc(c100(S100(r)))}">${scoreCell(r)}</td>
        <td class="plain"><span class="${sigCls(r.v)}">${esc(r.v)}</span></td><td class="plain">${px(r.px, r.cur)}</td>
        <td class="${cc(r.tp.trend)}"><span class="hc">${({ 2: 'Up ▲▲', 1: 'Up ▲', '-1': 'Down ▼', '-2': 'Down ▼▼' })[r.tp.trend] || 'Flat'}</span></td><td class="${cc((r.rs ?? 0) > 0.05 ? 1 : (r.rs ?? 0) < -0.05 ? -1 : 0)}"><span class="hc">${pc(r.rs, 0)}</span></td>
        <td class="${cc(r.tp.setup)}"><span class="hc">${esc(r.setup || '—')}</span></td><td class="${cc(r.tp.extension)}"><span class="hc">${ok(r.rsi) ? r.rsi.toFixed(0) : '—'}</span></td><td class="${cc(r.tp.volume)}"><span class="hc">${r.tp.volume > 0 ? 'Accum.' : r.tp.volume < 0 ? 'Distrib.' : '—'}</span></td>
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
      <div class="sbar"><i style="left:calc(${r.score}% - 2px)"></i></div><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>0</span><b style="color:var(--gold-2);font-size:15px">Sector score ${r.score}/100</b><span>100</span></div>
      <dl><dt>Companies scanned</dt><dd>${r.n}</dd><dt>Average company LRC score</dt><dd>${r.avg}/100</dd><dt>Rated BUY / rated SELL</dt><dd>${pp(r.bull, 0)} / ${pp(r.bear, 0)}</dd><dt>Above 50-day average</dt><dd>${pp(r.above50, 0)}</dd><dt>Breakouts & retests</dt><dd>${r.setups}</dd>
      <dt>Sector ETF score</dt><dd>${r.etf ? `${esc(r.etf.replace('.JO', ''))} ${r.etf_score ?? '—'}/100` : '—'}</dd><dt>ETF 1 month</dt><dd>${pc(r.etf_p1m)}</dd></dl>
      <p class="sec-tk" style="margin-top:10px;font-size:12.5px;color:var(--muted)">Strongest: ${r.top.map(t => `<a href="stock.html?t=${encodeURIComponent(t)}">${esc(t.replace('.JO', ''))}</a>`).join('')}<br>Weakest: ${r.bottom.map(t => `<a href="stock.html?t=${encodeURIComponent(t)}">${esc(t.replace('.JO', ''))}</a>`).join('')}</p></div>`).join('') || '<p class="muted-load">No sectors yet.</p>';
  }
  function drawAll() {
    if (!S) return;
    if (tab === 'stocks' || tab === 'invest') drawStocks(); else if (tab === 'setups') drawSetups(); else if (tab === 'etfs') drawEtfs(); else if (tab === 'sectors') drawSectors();
  }
  $('scSort').addEventListener('change', () => { const [k, d] = $('scSort').value.split(':'); sortK = k; sortD = +d; shown = 120; drawStocks(); });
  ['scQ', 'scSec', 'scSig', 'scSet', 'scVal', 'scMine'].forEach(id => $(id).addEventListener(id === 'scQ' ? 'input' : 'change', () => { shown = 120; drawStocks(); }));
  ['invG', 'invSec', 'invMos'].forEach(id => $(id).addEventListener('change', drawInvest));
  $('scMore').addEventListener('click', () => { shown += 200; drawStocks(); });
  $('scTbl').addEventListener('click', e => {
    const st = e.target.closest('.star'); if (st) { e.stopPropagation(); st.classList.toggle('on', toggleMine(st.dataset.s)); return; }
    const th = e.target.closest('th[data-k]'); if (th) { const k = th.dataset.k; sortD = sortK === k ? -sortD : (k === 't' || k === 'ne' ? 1 : -1); sortK = k; const o = [...$('scSort').options].find(x => x.value === k + ':' + sortD); $('scSort').value = o ? o.value : $('scSort').value; drawStocks(); return; }
    const tr = e.target.closest('tr[data-t]'); if (tr) location.href = 'stock.html?t=' + encodeURIComponent(tr.dataset.t);
  });
  $('scCsv').addEventListener('click', () => {
    const rows = rowsFor(); if (SAFE) { const gr = v => ({ 'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring' })[v] || v;
      const csv = [['Ticker', 'Name', 'Market', 'Sector', 'Price', 'Currency', 'Change 1D', 'Trading score (0-100)', 'Trading grade', 'Investment score (0-100)', 'Investment grade', 'Valuation (model estimate)', 'Valuation', 'Growth', 'Profitability', 'Financial health', 'Income', 'Sentiment', 'Technical', 'Setup', 'Fwd PE', 'TTM PE', 'P/S', 'P/FCF', 'Revenue growth', 'EPS growth', 'Debt/Equity %', 'ROE', 'Dividend yield', 'Next results']].concat(rows.map(r => [r.t, r.n, r.m, r.sec, r.px, r.cur, r.chg, S100(r), gr(r.v), r.iv_score ?? '', gr(r.iv_v), r.val || '', ...GRP.map(([k]) => (r.grp || {})[k] ?? ''), r.setup || '', r.raw.fpe ?? '', r.raw.tpe ?? '', r.raw.ps ?? '', r.raw.pfcf ?? '', r.raw.rev_growth ?? '', r.raw.eps_growth ?? '', r.raw.de ?? '', r.raw.roe ?? '', r.raw.div_yield ?? '', r.ne || '']))
        .map(a => a.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `LRC_Scanner_${mkt}_${(S.as_of || {})[mkt] || ''}.csv`; a.click(); return; }
    const head = ['Ticker', 'Name', 'Market', 'Sector', 'Price', 'Currency', 'Change 1D', 'LRC score (0-100)', 'LRC Stock Scanner rating', 'Valuation verdict', 'Valuation', 'Growth', 'Profitability', 'Financial health', 'Income', 'Sentiment', 'Technical', 'Setup', 'Entry', 'Stop', 'Target 1', 'Target 2', 'LRC Analyst Target', 'Fwd PE', 'TTM PE', 'P/S', 'P/FCF', 'Revenue growth', 'EPS growth', 'Debt/Equity %', 'ROE', 'Dividend yield', 'Analyst consensus', 'Target upside', 'Short float', 'Next results', 'LRC analyst rating'];
    const csv = [head].concat(rows.map(r => [r.t, r.n, r.m, r.sec, r.px, r.cur, r.chg, S100(r), r.v, r.val || '', ...GRP.map(([k]) => (r.grp || {})[k] ?? ''), r.setup || '', r.plan?.entry ?? '', r.plan?.stop ?? '', r.plan?.t1 ?? '', r.plan?.t2 ?? '', r.tgt ?? '', r.raw.fpe ?? '', r.raw.tpe ?? '', r.raw.ps ?? '', r.raw.pfcf ?? '', r.raw.rev_growth ?? '', r.raw.eps_growth ?? '', r.raw.de ?? '', r.raw.roe ?? '', r.raw.div_yield ?? '', r.raw.rec ?? '', r.raw.tgt_up ?? '', r.raw.short ?? '', r.ne || '', r.cov?.rating || '']))
      .map(a => a.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `LRC_Scanner_${mkt}_${(S.as_of || {})[mkt] || ''}.csv`; a.click();
  });
  Promise.allSettled([get('scan/stocks.json'), get('scan/etfs.json'), get('scan/sectors.json'), get('scan/quotes.json')]).then(([a, b, c, qq]) => {
    if (a.status !== 'fulfilled') { fail($('scTbl'), 'scanner'); return; }
    S = a.value; E = b.status === 'fulfilled' ? b.value : null; SE = c.status === 'fulfilled' ? c.value : null;
    // live prices (refreshed every 15 minutes) laid over the last full scan
    if (qq.status === 'fulfilled' && qq.value && qq.value.q && qq.value.generated > S.generated) { const Q = qq.value.q; S.rows.forEach(r => { const x = Q[r.t]; if (x && x[0]) { r.px = x[0]; if (x[1] !== null && x[1] !== undefined) r.chg = x[1]; } }); S.live = qq.value.generated; }
    $('scMeta').innerHTML = `<span class="ai">● Built by <b>${esc((window.LRCBrand || (x => x))(S.agent))}</b></span><span>Prices as of <b>JSE ${esc(S.as_of?.JSE || '—')} · NY ${esc(S.as_of?.US || '—')}</b></span><span>Scored <b>${when(S.generated)}</b></span>${S.live ? `<span class="ai">● Live prices <b>${when(S.live)}</b></span>` : ''}<span><b>${S.rows.length}</b> companies · <b>${E ? E.rows.length : 0}</b> ETFs</span>`;
    fillSectors(); showTab(tab);
  });
}

/* =================== WATCHLIST PAGE (automated: top 5 BUY / SELL, trading + investment, both markets) =================== */
if ($('wlTB')) {
  let mkt = getMkt(), COV = null, L = null, NEWS = null;
  const link = t => `stock.html?t=${encodeURIComponent(t)}`;
  const nm = (t, n, extra = '') => `<a href="${link(t)}"><span class="tic">${esc(t.replace('.JO', ''))}</span>${extra}<small>${esc(n)}</small></a>`;
  const head1 = t => { const x = NEWS && NEWS.companies && NEWS.companies[t]; const h = x && x.news && x.news[0]; return h ? `<a href="${esc(h.url)}" target="_blank" rel="noopener" style="font-size:12.5px;color:#C9CEDA">${esc(h.title.slice(0, 90))}${h.title.length > 90 ? '…' : ''}</a><small>${esc(h.source)}${h.published ? ' · ' + esc(h.published.slice(0, 10)) : ''}</small>` : '<small>—</small>'; };
  const upCell = x => `<td class="n" style="color:${(x ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(x, 0)}</td>`;
  const resCell = ne => `<td>${ne ? `<span class="tag ${Math.round((new Date(ne) - new Date()) / 864e5) <= 14 ? 'ev' : ''}">${esc(ne)}</span>` : '—'}</td>`;
  const covPill = r => r.cov ? ` <span class="pill p-${r.cov.rating.toLowerCase()}">LRC ${esc(r.cov.rating)}</span>` : '';
  const none = (n, what) => `<tr class="empty"><td colspan="${n}" style="color:var(--muted);white-space:normal">${what}</td></tr>`;
  const trade = (rows, side) => `<thead><tr><th>#</th><th>COMPANY</th><th>TRADING RATING</th><th>PRICE · 1D</th><th>UPSIDE TO 6-M TARGET</th><th>VALUATION</th><th>${SAFE ? 'SETUP' : 'SETUP · ENTRY PLAN'}</th><th>RESULTS</th><th>LATEST NEWS</th></tr></thead><tbody>` +
    (rows.length ? rows.map((r, i) => `<tr><td class="rk">${i + 1}</td><td>${nm(r.t, r.n, covPill(r))}</td><td><span class="${sigCls(r.v)}">${esc(r.v)}</span><small>score ${r.score}/100</small></td>
      <td class="n">${px(r.px, r.cur)}<small style="color:${(r.chg ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(r.chg)}</small></td>${upCell(r.tgt_up)}<td><span class="${valCls(r.val)}" style="font-size:9px">${esc(r.val || '—')}</span></td>
      <td>${r.setup ? esc(r.setup) : '—'}${SAFE ? '' : r.entry ? `<small>${side === 'Long' ? 'buy above' : 'sell below'} ${px(r.entry, r.cur)} · stop ${pc(r.stop_pct)} · target ${pc(r.t1_pct)}</small>` : '<small>no entry trigger yet</small>'}</td>
      ${resCell(r.ne)}<td class="news">${head1(r.t)}</td></tr>`).join('')
      : none(9, `No ${mkt === 'JSE' ? 'JSE' : 'New York'} company is rated ${side === 'Long' ? 'BUY' : 'SELL'} by the Trading scanner today.`)) + '</tbody>';
  const invest = (rows, side) => `<thead><tr><th>#</th><th>COMPANY</th><th>INVESTMENT RATING</th><th>PRICE · 1D</th><th>UPSIDE TO LRC TARGET</th><th>VALUATION</th><th>QUALITY CHECKS</th><th>RESULTS</th><th>LATEST NEWS</th></tr></thead><tbody>` +
    (rows.length ? rows.map((r, i) => `<tr><td class="rk">${i + 1}</td><td>${nm(r.t, r.n, covPill(r))}<small>${esc(r.sec)}</small></td><td><span class="${sigCls(r.iv_v)}">${esc(r.iv_v)}</span><small>score ${r.iv_score}/100</small></td>
      <td class="n">${px(r.px, r.cur)}<small style="color:${(r.chg ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(r.chg)}</small></td>${upCell(r.tgt_up)}<td><span class="${valCls(r.val)}" style="font-size:9px">${esc(r.val || '—')}</span></td>
      <td>${r.inv ? `<span class="pill p-${r.inv.g.toLowerCase()}">${r.inv.g}</span> ${r.inv.p}/${r.inv.k}` : '—'}</td>${resCell(r.ne)}<td class="news">${head1(r.t)}</td></tr>`).join('')
      : none(9, `No ${mkt === 'JSE' ? 'JSE' : 'New York'} company is rated ${side === 'Long' ? 'BUY' : 'SELL'} by the Investment scanner today.`)) + '</tbody>';
  const note = (shown, total, word) => total > shown ? `Showing the best ${shown} of ${total} companies rated ${word} today.` : total ? `${total === 1 ? 'Only 1 company is' : 'All ' + total + ' companies'} rated ${word} today ${total === 1 ? 'is' : 'are'} shown.` : '';
  const box = $('wlMktBox');
  const drawBox = () => { box.innerHTML = `<div class="seg" role="group" aria-label="Market">${[['JSE', 'JSE · Johannesburg'], ['US', 'New York']].map(([v, l]) => `<button data-m="${v}" class="${mkt === v ? 'on' : ''}">${l}</button>`).join('')}</div>`; };
  box.addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b && b.dataset.m !== mkt) setMkt(b.dataset.m); });
  const draw = () => {
    drawBox();
    const l = (L && L.lists && L.lists[mkt]) || { trading_buy: [], trading_sell: [], invest_buy: [], invest_sell: [], counts: {} };
    const c = l.counts || {};
    $('wlTB').innerHTML = trade(l.trading_buy, 'Long'); $('wlTS').innerHTML = trade(l.trading_sell, 'Short');
    $('wlIB').innerHTML = invest(l.invest_buy, 'Long'); $('wlIS').innerHTML = invest(l.invest_sell, 'Short');
    $('wlTbNote').textContent = note(l.trading_buy.length, c.trading_buy, 'BUY or STRONG BUY for trading');
    $('wlTsNote').textContent = note(l.trading_sell.length, c.trading_sell, 'SELL or STRONG SELL for trading');
    $('wlIbNote').textContent = note(l.invest_buy.length, c.invest_buy, 'BUY or STRONG BUY for investing');
    $('wlIsNote').textContent = note(l.invest_sell.length, c.invest_sell, 'SELL or STRONG SELL for investing');
    const cov = [];   // fully automated: no hand-rated coverage
    const names = new Set([...l.trading_buy, ...l.trading_sell, ...l.invest_buy, ...l.invest_sell].map(r => r.t).concat(cov.map(x => x.ticker)));
    const items = [];
    if (NEWS) for (const t of names) { const x = NEWS.companies[t]; if (x) (x.news || []).forEach(n => items.push({ ...n, t })); }
    items.sort((a, b) => (b.published || '').localeCompare(a.published || ''));
    $('wlNews').innerHTML = items.slice(0, 30).map(n => `<a class="wi" href="${esc(n.url)}" target="_blank" rel="noopener"><span class="wt"><span class="tk">${esc(n.t.replace('.JO', ''))}</span> ${esc(n.title)}</span><span class="wm"><b>${esc(n.source)}</b>${n.published ? ' · ' + esc(when(n.published)) : ''}</span></a>`).join('') || '<p class="muted-load">News for the watchlist companies is collected after each scanner run.</p>';
    $('wlKpis').innerHTML = [[l.trading_buy.length, 'trading BUY'], [l.trading_sell.length, 'trading SELL'], [l.invest_buy.length, 'investment BUY'], [l.invest_sell.length, 'investment SELL'], [c.scanned ?? '—', 'companies scanned']]
      .map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    if (L) $('wlMeta').innerHTML = `<span class="ai">● Built by <b>LRC Stock Scanner</b> · automatic</span><span>Prices as of <b>${esc((L.as_of || {})[mkt] || '—')}</b></span><span>Updated <b>${when(L.generated)}</b></span>`;
    const R = SAFE ? { trading_buy: 'The 5 highest Trading scores per market (3–12 month view: technical 35%, growth 20%, sentiment 20%, valuation 10%, profitability 10%, financial health 5%).', trading_sell: 'The 5 lowest Trading scores per market.', invest_buy: 'The 5 highest Investment scores per market (5–10 year view: valuation 25%, profitability 25%, financial health 20%, growth 20%, income 10%).', invest_sell: 'The 5 lowest Investment scores per market.', auto: 'Rebuilt automatically after every LRC Stock Scanner run. Grades describe the data; they are not a recommendation to buy or sell.' } : ((L && L.rules) || {});
    $('wlRules').innerHTML = [['Trading BUY', R.trading_buy], ['Trading SELL', R.trading_sell], ['Investment BUY', R.invest_buy], ['Investment SELL', R.invest_sell], ['Automatic', R.auto]]
      .filter(x => x[1]).map(([h, t]) => `<div class="card"><h3>${h}</h3><p>${esc(t)}</p></div>`).join('');
  };
  window.addEventListener('lrcmarket', e => { mkt = e.detail; draw(); });
  Promise.allSettled([get('coverage.json'), get('scan/lists.json'), get('intel/index.json')]).then(([a, b, c]) => {
    COV = a.status === 'fulfilled' ? a.value : null; L = b.status === 'fulfilled' ? b.value : null; NEWS = c.status === 'fulfilled' ? c.value : null; draw();
  });
}

/* =================== RESEARCH PAGE: companies worth researching (linked to watchlist, earnings, articles, news) =================== */
if ($('riOut')) {
  let mkt = getMkt(), I = null, L = null, A = null, NEWS = null, theme = 'quality_value';
  $('riOut').addEventListener('click', e => { const b = e.target.closest('button[data-th]'); if (b) { theme = b.dataset.th; draw(); } });
  const LBL = { trading_buy: 'Trading BUY', trading_sell: 'Trading SELL', invest_buy: 'Investment BUY', invest_sell: 'Investment SELL' };
  const box = $('riMkt');
  box.addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (b && b.dataset.m !== mkt) setMkt(b.dataset.m); });
  const draw = () => {
    box.innerHTML = `<div class="seg" role="group" aria-label="Market">${[['JSE', 'JSE · Johannesburg'], ['US', 'New York']].map(([v, l]) => `<button data-m="${v}" class="${mkt === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    if (!I) return fail($('riOut'), 'research ideas list');
    const onList = {};
    Object.values((L && L.lists) || {}).forEach(l => Object.entries(LBL).forEach(([k, lbl]) => (l[k] || []).forEach(x => (onList[x.t] = onList[x.t] || []).push(lbl))));
    const arts = {};
    ((A && A.articles) || []).forEach(a => (a.tickers || []).forEach(t => { const k = /\.JO$/.test(t) ? t : (I.ideas.JSE && Object.values(I.ideas.JSE).flat().some(x => x.t === t + '.JO') ? t + '.JO' : t); (arts[k] = arts[k] || []).push(a); }));
    const g = I.ideas[mkt] || {};
    if (!g[theme] || !g[theme].length) theme = (I.groups.find(G => (g[G.key] || []).length) || I.groups[0]).key;
    const G = I.groups.find(x => x.key === theme) || I.groups[0], list = g[G.key] || [];
    const spot = (g.quality_value || [])[0] || (g.top_scores || [])[0];
    const bar = (l, v, r) => `<div class="fl-bar"><span>${l}</span><i><b style="width:${v ?? 0}%;background:${(v ?? 0) >= 60 ? '#2FA36B' : (v ?? 0) >= 40 ? '#8A92A6' : '#D9534F'}"></b></i><em>${v ?? '—'}</em><span class="${sigCls(r)}">${esc(r || '—')}</span></div>`;
    const links = x => { const d = x.ne ? Math.round((new Date(x.ne) - new Date()) / 864e5) : null;
      return (onList[x.t] || []).map(l => `<a class="wtag ${/SELL/.test(l) ? 's' : 'b'}" href="watchlist.html">${esc(l)}</a>`).join('') + (x.ne ? `<a class="tag${d !== null && d <= 14 ? ' ev' : ''}" href="earnings.html#${mkt === 'JSE' ? 'jse' : 'us'}">Results ${esc(x.ne)}</a>` : '') + (arts[x.t] || []).slice(0, 1).map(a => `<a class="tag" href="${esc(a.url)}">Our article</a>`).join(''); };
    const head = x => { const h = NEWS && NEWS.companies && NEWS.companies[x.t] && (NEWS.companies[x.t].news || [])[0]; return h; };
    const themeOf = t => (I.groups.find(G => (g[G.key] || []).some(y => y.t === t)) || {}).title || '';
    const spotHtml = spot ? (() => { const h = head(spot); return `<div class="fl-spot"><div class="fl-spot-l"><span class="eyebrow" style="margin:0">Spotlight · ${esc(themeOf(spot.t))}</span>
        <a class="fl-spot-name" href="stock.html?t=${encodeURIComponent(spot.t)}"><span class="tic">${esc(spot.t.replace('.JO', ''))}</span> ${esc(spot.n)}</a>
        <p class="fl-meta">${esc(spot.ind || spot.sec)} · ${px(spot.px, spot.cur)} <span style="color:${(spot.chg ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(spot.chg)}</span> · <span class="${valCls(spot.val)}">${esc(spot.val || '—')}</span>${spot.q ? ` <span class="pill p-${spot.q.toLowerCase()}">Quality ${esc(spot.q)}</span>` : ''}</p>
        <p class="fl-why">${esc(spot.why)}</p>${h ? `<a class="ri-news" href="${esc(h.url)}" target="_blank" rel="noopener">${esc(h.title.slice(0, 110))}${h.title.length > 110 ? '…' : ''}<small>${esc(h.source)}${h.published ? ' · ' + esc(h.published.slice(0, 10)) : ''}</small></a>` : ''}
        <div class="ri-links" style="margin-top:12px">${links(spot)}</div></div>
      <div class="fl-spot-r">${bar('Trading · 3–12 m', spot.score, spot.v)}${bar('Investment · 5–10 y', spot.iv_score, spot.iv_v)}<a class="btn btn-gold" href="stock.html?t=${encodeURIComponent(spot.t)}" style="margin-top:14px">Open the one-page summary →</a></div></div>`; })() : '';
    const tabs = `<div class="fl-tabs" role="tablist">${I.groups.map(T => `<button data-th="${T.key}" class="${T.key === theme ? 'on' : ''}">${esc(T.title)} <small>${(g[T.key] || []).length}</small></button>`).join('')}</div>`;
    const rows = list.length ? `<div class="fl-list">${list.map((x, i) => `<div class="fl-row"><span class="fl-rk">${i + 1}</span>
        <a class="fl-co" href="stock.html?t=${encodeURIComponent(x.t)}"><span class="tic">${esc(x.t.replace('.JO', ''))}</span> <b>${esc(x.n)}</b><small>${esc(x.ind || x.sec)} · ${px(x.px, x.cur)} <span style="color:${(x.chg ?? 0) >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(x.chg)}</span></small></a>
        <div class="fl-sc">${bar('Trading', x.score, x.v)}${bar('Investment', x.iv_score, x.iv_v)}</div>
        <div class="fl-wh"><div class="fl-va"><span class="${valCls(x.val)}">${esc(x.val || '—')}</span>${x.q ? ` <span class="pill p-${x.q.toLowerCase()}">Quality ${esc(x.q)}</span>` : ''}</div><p>${esc(x.why)}</p><div class="ri-links">${links(x)}</div></div>
        <a class="fl-go" href="stock.html?t=${encodeURIComponent(x.t)}" aria-label="Open the one-page summary">Summary →</a></div>`).join('')}</div>`
      : `<p class="muted-load" style="padding:16px 0">No ${mkt === 'JSE' ? 'JSE' : 'New York'} company fits this theme today.</p>`;
    $('riOut').innerHTML = spotHtml + `<h2 class="wl-h" style="margin-top:46px">Four themes <span class="gold">— ${mkt === 'JSE' ? 'JSE' : 'New York'}</span></h2>` + tabs + `<p class="wl-note" style="margin-top:12px">${esc(G.rule)}</p>` + rows +
      `<p class="src-note" style="margin-top:22px">${esc(I.note)} See also: <a href="scanner.html">LRC Stock Scanner</a> · <a href="watchlist.html">Watchlist</a> · <a href="earnings.html">Earnings calendar</a> · <a href="articles.html">Articles</a>.</p>`;
    $('riMeta').innerHTML = `<span class="ai">● LRC Focus List · automatic</span><span>Prices as of <b>${esc((I.as_of || {})[mkt] || '—')}</b></span><span>Updated <b>${when(I.generated)}</b></span><span><b>${Object.values(g).reduce((a, v) => a + v.length, 0)}</b> companies on the Focus List</span>`;
  };
  window.addEventListener('lrcmarket', e => { mkt = e.detail; draw(); });
  Promise.allSettled([get('scan/research_ideas.json'), get('scan/lists.json'), get('articles.json'), get('intel/index.json')]).then(([a, b, c, d]) => {
    I = a.status === 'fulfilled' ? a.value : null; L = b.status === 'fulfilled' ? b.value : null; A = c.status === 'fulfilled' ? c.value : null; NEWS = d.status === 'fulfilled' ? d.value : null; draw();
  });
}

/* =================== TRACK RECORD PAGE =================== */
if ($('trTbl')) {
  let mkt = getMkt(), T = null, rkey = 'by_rating';
  document.querySelectorAll('#trMode .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#trMode .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); rkey = b.dataset.v; draw(); }));
  const col = { BUY: '#2FA36B', HOLD: '#9AA1B2', SELL: '#E3262B', ALL: '#F2CE72' };  // ALL = market (every company scanned)
  const chart = c => {
    if (!c || !c.dates || c.dates.length < 2) return '<p class="muted-load">The chart starts after the second daily snapshot.</p>';
    const W = 1000, H = 300, L = 44, R = 150, Tp = 16, B = 26, w = W - L - R, h = H - Tp - B, n = c.dates.length;
    const all = ['BUY', 'HOLD', 'SELL', 'ALL'].flatMap(k => c[k]); let lo = Math.min(...all), hi = Math.max(...all); const pd = (hi - lo) * 0.1 || 1; lo -= pd; hi += pd;
    const X = i => L + i * w / (n - 1), Y = v => Tp + (hi - v) / (hi - lo) * h;
    const path = a => a.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('');
    const ys = [0, .25, .5, .75, 1].map(k => lo + (hi - lo) * k).map(v => `<line x1="${L}" x2="${L + w}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.06)"/><text x="${L - 6}" y="${Y(v) + 4}" fill="#9AA1B2" font-size="11" text-anchor="end">${v.toFixed(0)}</text>`).join('');
    const step = Math.max(1, Math.ceil(n / 8));
    const xs = c.dates.map((d, i) => i % step === 0 || i === n - 1 ? `<text x="${X(i)}" y="${H - 6}" fill="#9AA1B2" font-size="11" text-anchor="middle">${d.slice(5)}</text>` : '').join('');
    const lab = ['BUY', 'HOLD', 'SELL', 'ALL'].map(k => ({ k, y: Y(c[k][n - 1]), v: c[k][n - 1] })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 14) lab[i].y = lab[i - 1].y + 14;
    return `<div class="tbl-wrap" style="padding:10px"><svg viewBox="0 0 ${W} ${H}" width="100%">${ys}${xs}${['ALL', 'HOLD', 'SELL', 'BUY'].map(k => `<path d="${path(c[k])}" fill="none" stroke="${col[k]}" stroke-width="${k === 'ALL' ? 1.6 : 2.4}" ${k === 'ALL' ? 'stroke-dasharray="6 4"' : ''}/>`).join('')}
      ${lab.map(l => `<text x="${L + w + 6}" y="${l.y + 4}" fill="${col[l.k]}" font-size="12" font-weight="700">${l.k === "ALL" ? "MARKET" : l.k} ${l.v.toFixed(1)}</text>`).join('')}</svg></div>`;
  };
  let hz = '1 month';
  document.querySelectorAll('#trHz .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#trHz .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); hz = b.dataset.h; draw(); }));
  const draw = () => {
    const m = T && T.markets && T.markets[mkt];
    $('trMeta').innerHTML = T ? `<span class="ai">● LRC Track Record</span><span>Tracking since <b>${esc(T.since || '—')}</b></span><span><b>${T.days}</b> daily snapshots</span><span>Updated <b>${when(T.generated)}</b></span>` : '';
    $('trMk').textContent = '— ' + (mkt === 'JSE' ? 'JSE' : 'New York');
    if (!m) { $('trVerdict').innerHTML = '<p class="muted-load">The first snapshot is saved after the next scanner run.</p>'; return; }
    const c = m.curves || {}; const n = (c.dates || []).length;
    const ret = k => n > 1 ? c[k][n - 1] / 100 - 1 : null;
    const b = ret('BUY'), s = ret('SELL'), a = ret('ALL'), hd = ret('HOLD');
    const days = n > 1 ? Math.round((new Date(c.dates[n - 1]) - new Date(c.dates[0])) / 864e5) : 0;
    const spread = ok(b) && ok(s) ? b - s : null;
    const early = days < 90;
    const state = !ok(spread) ? ['WAITING', '#9AA1B2', 'The first measurement appears after the second daily snapshot.'] :
      early ? ['TOO EARLY TO JUDGE', '#F2CE72', `Only ${days} day${days === 1 ? '' : 's'} of history. We need at least 3 months before the numbers mean anything.`] :
      spread > 0.02 && b > a ? ['WORKING', '#2FA36B', 'BUY-rated shares are beating the market and the SELL-rated shares.'] :
      spread < -0.02 ? ['NOT WORKING', '#E3262B', 'SELL-rated shares are doing better than BUY-rated shares. We review the rules when this lasts.'] : ['NO CLEAR EDGE YET', '#9AA1B2', 'BUY and SELL ratings are performing about the same.'];
    $('trVerdict').innerHTML = `<div class="trv-badge" style="border-color:${state[1]};color:${state[1]}">${state[0]}</div>
      <p class="trv-text">Since <b>${esc(c.dates?.[0] || '—')}</b> (${days} days): shares rated <b class="up">BUY</b> moved <b>${pc(b)}</b>, the market <b>${pc(a)}</b> and shares rated <b class="dn">SELL</b> <b>${pc(s)}</b>.
      ${ok(spread) ? `BUY minus SELL: <b style="color:${spread >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(spread)}</b>.` : ''} ${esc(state[2])}</p>`;
    // simple bars: return since tracking began, by group
    const grp = [['BUY', b, '#2FA36B'], ['HOLD', hd, '#9AA1B2'], ['SELL', s, '#E3262B'], ['MARKET (all)', a, '#F2CE72']].filter(x => ok(x[1]));
    const mx = Math.max(0.005, ...grp.map(x => Math.abs(x[1])));
    $('trBars').innerHTML = grp.length ? grp.map(([l, v, col]) => `<div class="trb"><span>${l}</span><div class="trb-track"><i class="trb-mid"></i><b style="${v >= 0 ? 'left:50%' : `right:50%`};width:${Math.abs(v) / mx * 50}%;background:${col}"></b></div><em style="color:${v >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(v, 2)}</em></div>`).join('') + '<p class="trb-note">Return since tracking began · bars to the right = up, to the left = down</p>' : '';
    $('trChart').innerHTML = chart(c);
    const rows = ['STRONG BUY', 'BUY', 'HOLD', 'SELL', 'STRONG SELL', 'MARKET'];
    const box = ((m[rkey] || {})[hz]) || {};
    const any = rows.some(g => box[g]);
    $('trTbl').innerHTML = `<thead><tr><th>RATING</th><th>AVERAGE RETURN</th><th>VS MARKET</th><th>HIT RATE</th><th>SHARES / PERIODS</th></tr></thead><tbody>` +
      (any ? rows.map(g => { const x = box[g]; const lbl = g === 'MARKET' ? '<b>Market average</b>' : `<span class="${sigCls(g)}">${g}</span>`;
        if (!x) return `<tr><td>${lbl}</td><td colspan="4" style="color:var(--muted)">no shares with this rating in the measured period</td></tr>`;
        const good = g.includes('SELL') ? x.vs_market <= 0 : x.vs_market >= 0;
        return `<tr><td>${lbl}</td><td class="n"><b style="color:${x.avg_return >= 0 ? '#5ED39A' : '#F08A7E'}">${pc(x.avg_return)}</b></td><td class="n">${x.vs_market !== undefined ? `<span style="color:${good ? '#5ED39A' : '#F08A7E'}">${pc(x.vs_market)} ${good ? '✓' : '✗'}</span>` : '—'}</td><td class="n">${x.hit_rate !== undefined ? `<b>${pp(x.hit_rate, 0)}</b>` : '—'}</td><td class="n">${x.avg_names ?? '—'} / ${x.periods}</td></tr>`; }).join('')
        : `<tr><td colspan="5" style="color:var(--muted)">Not enough history yet: results ${esc(hz)} after a rating appear once the first ratings are ${esc(hz)} old (the record started ${esc(T.since || '')}).</td></tr>`) + '</tbody>';
    const st = m.setups || {};
    $('trSet').innerHTML = `<thead><tr><th>SIDE</th><th>REACHED TARGET 1</th><th>STOPPED OUT</th><th>STILL OPEN</th><th>EXPIRED (30 DAYS)</th><th>WIN RATE</th></tr></thead><tbody>` +
      ['Long', 'Short'].map(k => { const o = st[k] || {}; return `<tr><td>${k === 'Long' ? 'Long (buy)' : 'Short (sell)'}</td><td class="n">${o.target ?? 0}</td><td class="n">${o.stop ?? 0}</td><td class="n">${o.open ?? 0}</td><td class="n">${o.expired ?? 0}</td><td class="n"><b>${o.win_rate === null || o.win_rate === undefined ? '—' : pp(o.win_rate, 0)}</b></td></tr>`; }).join('') + '</tbody>';
    const tg = m.targets || {};
    $('trTgt').innerHTML = tg.evaluated ? `<b style="color:var(--gold-2)">${pp(tg.hit_rate, 0)}</b> of ${tg.evaluated} LRC Analyst Targets set at least 6 months ago were reached within 6 months.` : 'Targets are judged 6 months after they are set, so this fills in from six months after the record started.';
  };
  window.addEventListener('lrcmarket', e => { mkt = e.detail; draw(); });
  get('track/performance.json').then(j => { T = j; draw(); }).catch(() => { T = null; draw(); });
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
    if (window.LRCRegion) STORE = window.LRCRegion.localize(STORE);
    if (it.status === 'fulfilled') INTEL = it.value;
    if ($('toAz')) $('toAz').href = 'analyzer.html?t=' + encodeURIComponent(T);
    $('buyRep').innerHTML = `<span class="lbl-lg">Buy the full report</span><span class="lbl-sm">Full report</span> — ${esc(STORE.report_price)}`;
    if (a.status !== 'fulfilled') { P.innerHTML = `<h1>${esc(T)}</h1><p style="margin-top:12px">This company is not in the LRC Scanner universe yet (or today's scan has not run). <a href="scanner.html" style="color:#1F3BB3">Open the scanner</a> to pick another, or ask us to add it.</p>`; return; }
    render(a.value, b.status === 'fulfilled' ? b.value : null);
    const nm = a.value.row.n;
    $('buyRep').href = buyHref(nm); if (STORE.report_pay_link) $('buyRep').target = '_blank';
    $('afterPaper').innerHTML = `<div class="edu-note" style="max-width:none;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between"><span><b>FULL REPORT</b> This one-page summary is free. The full LRC report on ${esc(nm)} — business, financial statements, three-way valuation, risks and ESG — costs <b style="color:var(--gold-2)">${esc(STORE.report_price)}</b>. ${esc(STORE.report_delivery || '')}${window.LRCRegion ? `<small class="cur-note">${window.LRCRegion.note()}</small>` : ''}</span><a class="btn btn-gold" href="${esc(buyHref(nm))}"${STORE.report_pay_link ? ' target="_blank" rel="noopener"' : ''}>Buy the full report — ${esc(STORE.report_price)}</a></div>` +
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
    if (SAFE) title = `Trading score ${S100(r)}/100 · Investment score ${r.iv_score ?? '—'}/100`;
    else if (R && R.title) title = R.title;
    else title = `${cap(word)} Idea: LRC Analyst Target ${ok(lrcT) ? px(lrcT, c) + ` (${pc(lrcT / t.price - 1, 0)})` : 'n/a'}`;
    const analyst = R ? `${esc(R.analyst || 'Prayer Nkuna')} <span class="badge-an">${esc(R.analyst && /agent|LRC Research/i.test(R.analyst) ? 'LRC RESEARCH' : 'LRC ANALYST VIEW')}</span>` : 'Prayer Nkuna, Analyst · LRC Stock Scanner';
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
    // ---- mini thesis (why + what next) from the 37 readings ----
    const DEF = d.readings_def || [], MS = (d.medians || {}).sector || {}, MM = (d.medians || {}).market || {};
    const rdAll = DEF.map(x => ({ ...x, r: (r.rd || {})[x.k] })).filter(x => x.r && x.r[1] !== null && x.r[1] !== undefined);
    const phrase = x => `${x.l} ${fmtP(x.k, x.f, x.r[0])}${MS[x.k] !== undefined && MS[x.k] !== null && !['trend', 'setup', 'momentum'].includes(x.k) ? ` vs sector ${fmtP(x.k, x.f, MS[x.k])}` : ''}`;
    const pros = rdAll.filter(x => x.r[1] > 0).sort((a, b) => b.r[2] - a.r[2] || b.max - a.max).slice(0, 3);
    const cons = rdAll.filter(x => x.r[1] < 0).sort((a, b) => a.r[2] - b.r[2] || b.max - a.max).slice(0, 2);
    const gl = Object.entries(r.grp || {}).filter(([, v]) => v !== null).sort((a, b) => b[1] - a[1]);
    const gname = k => (GRP.find(g => g[0] === k) || [k, k])[1].toLowerCase();
    const upT = ok(lrcT) ? lrcT / t.price - 1 : null;
    const nextBits = [];
    if (f.next_earnings) nextBits.push(`results on ${esc(f.next_earnings)} (${days(f.next_earnings)} days) — the next test of the growth story`);
    if (t.setup === 'Near breakout' || t.setup === 'Breakout') nextBits.push(`a close above ${px(t.setup_level, c)} would confirm the breakout`);
    else if (t.setup === 'Retest') nextBits.push(`holding support at ${px(t.setup_level, c)} keeps the uptrend intact`);
    else if (t.setup === 'Breakdown' || t.setup === 'Failed retest') nextBits.push(`staying below ${px(t.setup_level, c)} keeps the pressure on`);
    else if ((t.supports || [])[0]) nextBits.push(`major support sits at ${px(t.supports[0].price, c)}${(t.resistances || [])[0] ? ` and resistance at ${px(t.resistances[0].price, c)}` : ''}`);
    if (ok(upT) && !SAFE) nextBits.push(`the LRC Analyst Target of ${px(lrcT, c)} implies ${pc(upT, 0)} over 6 months`);
    // ---- investment thesis: the company as a whole (business, competitive position, industry, management, balance sheet) + the numbers ----
    const X = d.context || {}, SX = X.sector || null, mktName = r.m === 'JSE' ? 'the JSE' : 'New York';
    const T0 = (R && R.thesis && typeof R.thesis === 'object') ? R.thesis : {};   // research agent / analyst text replaces the automated line when present
    const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
    const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
    const pct0 = x => pp(x, 0);
    const finCo = ['Financial Services', 'Real Estate'].includes(r.sec);
    const sizeWord = X.mkt_rank && X.mkt_n ? (X.mkt_rank <= Math.max(3, X.mkt_n * 0.1) ? `one of the largest companies in ${mktName}` : X.mkt_rank <= X.mkt_n * 0.5 ? `a large company by ${mktName} standards` : `a smaller company by ${mktName} standards`) : '';
    // what it does
    const sents = (pr.summary || '').split(/(?<=\.)\s+(?=[A-Z])/);
    let what = sents.slice(0, 2).join(' '); if (what.length > 330) what = sents[0];
    // competitive position: profitability and growth against the median company in its own sector
    const vsSec = (k, hi = 1.15, lo = 0.85) => { const v = f[k], m = MS[k]; if (!ok(v) || !ok(m) || m <= 0) return 0; return v >= m * hi ? 1 : v <= m * lo ? -1 : 0; };
    const qK = finCo ? ['roe', 'roa', 'profit_margin'] : ['op_margin', 'roe', 'gross_margin'];
    const qS = qK.reduce((a, k) => a + vsSec(k), 0);
    const qTxt = finCo ? `return on equity of ${pct0(f.roe)} vs ${pct0(MS.roe)} for the median peer and a net margin of ${pct0(f.profit_margin)} vs ${pct0(MS.profit_margin)}`
      : `an operating margin of ${pct0(f.op_margin)} vs ${pct0(MS.op_margin)} for the median peer and a return on equity of ${pct0(f.roe)} vs ${pct0(MS.roe)}`;
    const gS = ok(f.rev_growth) && ok(MS.rev_growth) ? (f.rev_growth > MS.rev_growth + 0.03 ? 1 : f.rev_growth < MS.rev_growth - 0.03 ? -1 : 0) : 0;
    const gTxt = ok(f.rev_growth) && ok(MS.rev_growth) ? `sales are growing ${pc(f.rev_growth, 0)} vs ${pc(MS.rev_growth, 0)} for the sector${gS > 0 ? ', which suggests it is winning business from rivals' : gS < 0 ? ', so it is losing ground to faster-growing rivals' : ''}` : '';
    const compTxt = (ok(f.roe) || ok(f.op_margin)) ? `${cap1(qS >= 2 ? 'it is more profitable than most rivals' : qS <= -2 ? 'it is less profitable than most rivals' : 'its profitability is close to the sector average')}: ${qTxt}${qS >= 2 ? ' — a sign of pricing power, scale or a cost advantage' : qS <= -2 ? ' — it has less room for error if prices or costs move against it' : ''}.${gTxt ? ' ' + cap1(gTxt) + '.' : ''}` : '';
    // industry backdrop
    const indS = SX ? (SX.score >= 60 ? 1 : SX.score < 45 ? -1 : 0) : 0;
    const inTop = SX && (SX.top || []).includes(r.t), inBot = SX && (SX.bottom || []).includes(r.t);
    const indTxt = SX ? `The ${esc(r.sec)} sector in ${mktName} scores ${SX.score}/100 (${esc(SX.v)}): ${pct0(SX.above50)} of its ${SX.n} companies trade above their 50-day average${ok(SX.etf_p1m) ? ` and the ${esc(SX.etf_name || SX.etf || 'sector')} ETF moved ${pc(SX.etf_p1m, 0)} in a month` : ''} — ${indS > 0 ? 'the industry wind is behind it' : indS < 0 ? 'the industry is a headwind right now' : 'a neutral industry backdrop'}.${inTop ? ` ${esc(r.n)} is one of the three strongest names in its sector on our scanner.` : inBot ? ` ${esc(r.n)} is one of the three weakest names in its sector on our scanner.` : ''}` : '';
    // management, shareholders and dividends
    const ceo = (pr.officers || []).find(o => /CEO|Chief Executive/i.test(o.title || ''));
    const ceoName = ceo ? esc(String(ceo.name || '').replace(/^(Mr|Ms|Mrs|Dr|Prof)\.?\s+/i, '').replace(/\s+(BEng|BSc|MBA|CA\s*\(SA\)|CPA|PhD|BCom|BAcc|CFA|LLB)[^,]*$/i, '').split(',')[0]) : '';
    const insS = ok(f.insiders) ? (f.insiders >= 0.05 ? 1 : 0) : 0;
    const dv = d.dividends || [], now = Date.now(), yr = 365.25 * 864e5;
    const dsum = (from, to) => dv.filter(x => { const t_ = new Date(x.date).getTime(); return t_ > now - from * yr && t_ <= now - to * yr; }).reduce((a, x) => a + (x.amount || 0), 0);
    const d1 = dsum(1, 0), d0 = dsum(2, 1), divG = d1 && d0 ? d1 / d0 - 1 : null;
    const divS = ok(divG) ? (divG > 0.05 ? 1 : divG < -0.1 ? -1 : 0) : 0;
    const acts = f.analyst_actions || [], ups = acts.filter(a => a.action === 'up').length, downs = acts.filter(a => a.action === 'down').length;
    const mgmtBits = [];
    if (ceoName) mgmtBits.push(`run by ${ceoName} (${esc(ceo.title)})`);
    if (ok(f.insiders)) mgmtBits.push(f.insiders >= 0.05 ? `insiders own ${pp(f.insiders, 1)} of the shares, so management's interests are tied to shareholders'` : `insiders own only ${pp(f.insiders, 1)} of the shares`);
    if (ok(f.inst)) mgmtBits.push(`institutions hold ${pct0(f.inst)}`);
    if (ok(divG)) mgmtBits.push(`dividends paid in the last 12 months are ${divG >= 0 ? 'up' : 'down'} ${pc(Math.abs(divG), 0).replace('+', '')} on the year before${ok(f.payout) ? ` (payout ratio ${pct0(f.payout)})` : ''}`);
    else if (ok(f.div_yield) && f.div_yield > 0) mgmtBits.push(`it pays a ${pp(f.div_yield, 1)} dividend yield`);
    if (ups || downs) mgmtBits.push(`brokers have made ${ups} upgrade${ups === 1 ? '' : 's'} and ${downs} downgrade${downs === 1 ? '' : 's'} recently`);
    const mgmtTxt = mgmtBits.length ? cap1(mgmtBits.join('; ')) + '.' : '';
    // balance sheet
    const netCash = ok(f.cash) && ok(f.debt) ? f.cash - f.debt : null;
    const bsS = finCo ? 0 : (ok(f.de) ? (f.de < 60 && (f.fcf ?? 0) > 0 ? 1 : f.de > 150 || (f.fcf ?? 0) < 0 ? -1 : 0) : 0);
    const bsTxt = finCo ? '' : [ok(netCash) ? (netCash >= 0 ? `net cash of ${big(netCash, c)}` : `net debt of ${big(-netCash, c)}`) : '', ok(f.de) ? `debt-to-equity ${(f.de / 100).toFixed(2)}x` : '', ok(f.fcf) ? `free cash flow ${f.fcf >= 0 ? 'of' : ''} ${big(f.fcf, c)} over the last year` : ''].filter(Boolean).join(', ');
    // ---- short thesis: who the company is, three reasons from different areas of the company, the main risk, what next ----
    const F = [];   // a: area, s: +1 buy / -1 sell, w: weight, txt: short reason
    const add = (a, s, w, txt) => F.push({ a, s, w, txt });
    const vsP = (v, m, fm) => ok(v) && ok(m) ? ` (${fm(v)} vs ${fm(m)} for peers)` : '';
    if (ok(f.roe) || ok(f.op_margin)) add('business', qS >= 2 ? 1 : qS <= -2 ? -1 : 0, 3, qS >= 0 ? `more profitable than most rivals${finCo ? (ok(f.roe) && ok(MS.roe) ? ` (ROE ${pct0(f.roe)} vs ${pct0(MS.roe)})` : '') : (ok(f.op_margin) && ok(MS.op_margin) ? ` (operating margin ${pct0(f.op_margin)} vs ${pct0(MS.op_margin)})` : '')}` : `less profitable than its rivals${finCo ? (ok(f.roe) && ok(MS.roe) ? ` (ROE ${pct0(f.roe)} vs ${pct0(MS.roe)})` : '') : (ok(f.op_margin) && ok(MS.op_margin) ? ` (operating margin ${pct0(f.op_margin)} vs ${pct0(MS.op_margin)})` : '')}`);
    if (gS) add('growth', gS, 3, gS > 0 ? `growing sales faster than its sector (${pc(f.rev_growth, 0)} vs ${pc(MS.rev_growth, 0)})` : `growing sales slower than its sector (${pc(f.rev_growth, 0)} vs ${pc(MS.rev_growth, 0)})`);
    else if (ok(f.eps_growth_fwd)) add('growth', f.eps_growth_fwd > 0.08 ? 1 : f.eps_growth_fwd < 0 ? -1 : 0, 2, f.eps_growth_fwd >= 0 ? `earnings expected to grow ${pc(f.eps_growth_fwd, 0)} this year` : `earnings expected to fall ${pc(f.eps_growth_fwd, 0)} this year`);
    if (ok(f.tpe) && f.tpe < 0) add('growth', -1, 3, 'loss-making');
    if (SX) add('industry', indS, 2, indS >= 0 ? `a supportive industry (${esc(r.sec)} sector ${SX.score}/100)` : `a weak industry (${esc(r.sec)} sector ${SX.score}/100)`);
    if (bsS) add('balance', bsS, 2, bsS > 0 ? (ok(netCash) && netCash > 0 ? 'net cash and positive free cash flow' : 'low debt and positive free cash flow') : (ok(f.fcf) && f.fcf < 0 ? 'negative free cash flow' : `high debt (debt-to-equity ${(f.de / 100).toFixed(1)}x)`));
    if (insS) add('management', 1, 1, `management owns ${pp(f.insiders, 0)} of the shares`);
    if (divS) add('management', divS, 1, divS > 0 ? `a rising dividend (+${(divG * 100).toFixed(0)}%)` : `a dividend cut (${(divG * 100).toFixed(0)}%)`);
    if (ok(upT) && !SAFE) add('valuation', upT >= 0.05 ? 1 : upT <= -0.03 ? -1 : 0, 3, `${pc(upT, 0)} to the LRC Analyst Target (${px(lrcT, c)})`);
    else if (ok(f.fpe) && f.fpe > 0 && ok(d.sector_medians?.fpe)) { const rel = f.fpe / d.sector_medians.fpe - 1; add('valuation', rel < -0.15 ? 1 : rel > 0.25 ? -1 : 0, 2, `${rel < 0 ? 'cheaper' : 'dearer'} than peers (${f.fpe.toFixed(1)}x vs ${d.sector_medians.fpe.toFixed(1)}x forward earnings)`); }
    if (t.sma200) add('price', t.price > t.sma200 && t.price > t.sma50 ? 1 : t.price < t.sma200 && t.price < t.sma50 ? -1 : 0, 2, t.price > t.sma200 && t.price > t.sma50 ? 'the share price is in an uptrend' : 'the share price is in a downtrend');
    if (ok(f.rec_mean)) add('sentiment', f.rec_mean <= 2.2 ? 1 : f.rec_mean >= 3.2 ? -1 : 0, 1, `analysts rate it ${recLbl(f.rec_mean).toLowerCase()}`);
    const dir = /BUY/.test(r.v) ? 1 : /SELL/.test(r.v) ? -1 : 0;
    const pickBy = (s_, n) => { const c_ = F.filter(x => x.s === s_).sort((a, b) => b.w - a.w), out = [], used = new Set();
      c_.forEach(x => { if (out.length < n && !used.has(x.a)) { out.push(x); used.add(x.a); } }); return out; };
    const forV = dir === 0 ? pickBy(1, 2) : pickBy(dir, 3), agV = dir === 0 ? pickBy(-1, 2) : pickBy(-dir, 2);
    if (f.next_earnings && days(f.next_earnings) >= 0 && days(f.next_earnings) <= 14) agV.push({ txt: `results in ${days(f.next_earnings)} days` });
    const list = a => { const v = a.map(x => x.txt); return v.length > 1 ? v.slice(0, -1).join(', ') + ' and ' + v[v.length - 1] : v.join(''); };
    const sizeAdj = X.mkt_rank && X.mkt_n ? (X.mkt_rank <= Math.max(3, X.mkt_n * 0.1) ? 'a leading' : X.mkt_rank <= X.mkt_n * 0.5 ? 'a large' : 'a mid-sized') : 'a';
    const indLbl = (r.ind || r.sec || '').toLowerCase().replace(/&/g, 'and').replace(/\s+-\s+/g, ' ');
    const whoShort = `${esc(r.n)}: ${sizeAdj} ${r.m === 'JSE' ? 'JSE' : 'New York'}-listed ${esc(indLbl)} company${pr.country && !((r.m === 'JSE') === (pr.country === 'South Africa')) ? ` based in ${esc(pr.country)}` : ''}`;
    const trSide = dir > 0 ? 'Why buy' : dir < 0 ? 'Why sell' : 'For / against';
    const strengths = pickBy(1, 3), weaknesses = pickBy(-1, 2);
    if (f.next_earnings && days(f.next_earnings) >= 0 && days(f.next_earnings) <= 14) weaknesses.push({ txt: `results in ${days(f.next_earnings)} days` });
    const safeBottom = `<b>Thesis:</b> ${T0.summary ? esc(T0.summary) : `${whoShort}. Trading score ${S100(r)}/100 (<b>${esc(r.v)}</b>) · Investment score ${r.iv_score ?? '—'}/100 (<b>${esc(r.iv_v || 'HOLD')}</b>) · valuation <b>${esc((r.val || 'fair value').toLowerCase())}</b> (model estimate).`}` +
      `<br><b>Strengths:</b> ${strengths.length ? cap1(list(strengths)) + '.' : 'no standout strength in the data.'}` +
      `<br><b>Weaknesses:</b> ${weaknesses.length ? cap1(list(weaknesses)) + '.' : 'no major weakness in the data.'}` +
      `<br><b>Next:</b> ${nextBits.length ? cap1(nextBits[0]) : 'no dated event'}.`;
    const autoBottom = SAFE ? safeBottom : `<b>Thesis:</b> ${T0.summary ? esc(T0.summary) : `${whoShort}. Trading <b>${esc(r.v)}</b> (3–12 m) · Investment <b>${esc(r.iv_v || 'HOLD')}</b> (5–10 y) · <b>${esc((r.val || 'fair value').toLowerCase())}</b>.`}` +
      `<br><b>${trSide}:</b> ${dir === 0 ? `${forV.length ? cap1(list(forV)) : '—'} <i>vs</i> ${agV.length ? list(agV) : '—'}.` : (forV.length ? cap1(list(forV)) + '.' : 'the readings lean this way, with no single standout.')}` +
      (dir !== 0 ? `<br><b>Risk:</b> ${T0.risks_to_thesis ? esc(T0.risks_to_thesis) : agV.length ? cap1(list(agV)) + '.' : 'no strong signal against this view in the data — watch the next results.'}` : '') +
      `<br><b>Next:</b> ${nextBits.length ? cap1(nextBits[0]) : 'no dated catalyst'}.`;
    const ul = a => `<ul>${a.map(x => `<li>${x}</li>`).join('')}</ul>`;
    const S = (k, auto) => R && R[k] && R[k].length ? ul(R[k].map(esc)) : ul(auto);

    // ---------- chart ----------
    const chart = priceChart(d, 470, 240);
    const fin = finChart(d.financials, c, 760, 230, d.sec_q);
    const vals = (d.valuation || []).filter(v => v.v !== null && v.v !== undefined);
    const vcls = v => ({ Undervalued: 'v-under', Overvalued: 'v-over', 'Fairly valued': 'v-fair', Strong: 'v-strong', Weak: 'v-weak', 'In line': 'v-fair', 'Low debt': 'v-low', 'High debt': 'v-high', 'Loss-making': 'v-neg', 'Negative FCF': 'v-neg' })[v] || 'v-fair';
    const fmtV = (k, v) => ['fpe', 'tpe', 'ps', 'pfcf', 'peg', 'pb'].includes(k) ? (v <= 0 ? 'neg.' : v.toFixed(2)) : k === 'de' ? (v / 100).toFixed(2) + 'x' : k === 'current_ratio' ? v.toFixed(2) : pp(v, 1);
    const tgM = [['Method 1: Discounted cash flow (DCF)', tg.dcf], ['Method 2: Residual income (banks & insurers)', tg.residual_income], ['Method 3: Dividend & buyback model', tg.ddm],
      ['Method 4: EV/EBITDA vs sector peers', tg.ev_ebitda], ['Analyst consensus (median, 3+ analysts)', (f.n_analysts || 0) >= 3 ? tg.analyst_median : null]].filter(x => ok(x[1]));
    const tgW = tgM.length ? 1 / tgM.length : 0;
    if (tgM.length) { tg.low = Math.min(...tgM.map(x => x[1])); tg.high = Math.max(...tgM.map(x => x[1])); }
    const tgTable = tgM.length && !(r.cov || (R && R.target)) ? `<table class="rtab tgt-tbl"><thead><tr><th>Methodology</th><th style="text-align:right">Implied value</th><th style="text-align:right">vs current (${px(t.price, c)})</th><th style="text-align:right">Weight</th></tr></thead><tbody>` +
      tgM.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n"><b>${px(v, c)}</b></td><td class="n" style="color:${v >= t.price ? '#0F7B3F' : '#C5221F'}">${pc(v / t.price - 1, 1)}</td><td class="n">${(tgW * 100).toFixed(0)}%</td></tr>`).join('') +
      `${ok(tg.low) && ok(tg.high) ? `<tr><td>Range (lowest – highest method)</td><td class="n">${px(tg.low, c)} – ${px(tg.high, c)}</td><td class="n">${pc(tg.low / t.price - 1, 0)} to ${pc(tg.high / t.price - 1, 0)}</td><td class="n">—</td></tr>` : ''}` +
      `<tr class="tgt-final"><td><b>LRC Analyst Target (equal-weight average)</b></td><td class="n"><b>${px(lrcT, c)}</b></td><td class="n"><b>${pc(lrcT / t.price - 1, 1)}</b></td><td class="n"><b>100%</b></td></tr>` +
      `${ok(tg.implied_growth) ? `<tr><td colspan="4" style="color:#5C6478">Method 5: Reverse DCF — today's price assumes free cash flow grows about <b>${pc(tg.implied_growth, 0)} a year</b> for five years (shown, not averaged).</td></tr>` : ''}</tbody></table>` : '';
    const tgRows = [['Latest share price', t.price, false], ['LRC Analyst Target (average)', lrcT]].filter(x => ok(x[1]));
    const tgRange = '', tgRev = '';
    const heat = GRP.map(([k, l]) => { const v = (r.grp || {})[k]; const w = v ?? 0; return `<div class="fbar"><span>${l[0] + l.slice(1).toLowerCase()}</span><i><b style="width:${w}%;background:${v === null || v === undefined ? '#C9CED8' : v >= 60 ? '#0F9D58' : v >= 40 ? '#9AA0A6' : '#C5221F'}"></b></i><em>${v ?? '—'}</em></div>`; }).join('');
    const chip = (p, it) => p === null || p === undefined ? '<span style="color:#9AA0A6">—</span>' : `<span class="rchip r${it >= 2 ? 'p2' : it >= 1 ? 'p1' : it <= -2 ? 'm2' : it <= -1 ? 'm1' : '0'}">${p > 0 ? '+' + p : p} ${p > 0 ? 'Better' : p < 0 ? 'Worse' : 'Neutral'}</span>`;
    const rtab = groups => `<table class="rtab"><thead><tr><th>Reading</th><th style="text-align:right">${esc(r.t.replace('.JO', ''))}</th><th style="text-align:right">Sector</th><th style="text-align:right">Market</th><th>Score</th></tr></thead><tbody>` +
      groups.map(([gk, gl]) => `<tr class="rg"><td colspan="5">${esc(gl)} <span>${(r.grp || {})[gk] ?? '—'}/100</span></td></tr>` + DEF.filter(x => x.g === gk).map(x => { const q = (r.rd || {})[x.k]; const nomed = ['trend', 'setup'].includes(x.k);
        return `<tr><td>${esc(x.l)}</td><td class="n"><b>${esc(fmtP(x.k, x.f, q ? q[0] : null))}</b></td><td class="n">${nomed ? '' : esc(fmtP(x.k, x.f, MS[x.k]))}</td><td class="n">${nomed ? '' : esc(fmtP(x.k, x.f, MM[x.k]))}</td><td>${chip(q ? q[1] : null, q ? q[2] : 0)}</td></tr>`; }).join('')).join('') + '</tbody></table>';
    const gauge = gaugeSvg(S100(r));

    P.innerHTML = `
    <div class="ph"><div class="tkbox">${esc(r.t.replace('.JO', ''))}<small>${r.m === 'JSE' ? 'JSE' : 'NYSE / NASDAQ'}</small></div>
      <div><div style="font-size:15px;font-weight:800;color:#16223D">${esc(r.n)}</div><h1>${esc(title)}</h1>${ok(tg.low) && ok(tg.high) && !SAFE ? `<div class="trange"><b>Target range:</b> ${px(tg.low, c)} – ${px(tg.high, c)} <span>(${pc(tg.low / t.price - 1, 0)} to ${pc(tg.high / t.price - 1, 0)})</span>${tg.n_methods ? ` · average of ${tg.n_methods} valuation ${tg.n_methods === 1 ? 'input' : 'inputs'}` : ''} · <a href="#ivchart" class="no-print">see the chart ↓</a></div>` : ''}</div><img src="assets/img/logo-lrc.png" alt="Leago Rifumo Capital"></div>
    <div class="pfacts">
      <div><b>Market cap / Price:</b> ${big(f.mcap, c)} / ${px(t.price, c)}<br><b>52-wk low / high:</b> ${px(t.lo52, c)} / ${px(t.hi52, c)}<br><b>Beta / Yield:</b> ${ok(f.beta) ? f.beta.toFixed(2) : '—'} / ${pp(f.div_yield, 2)}<br><b>Sector:</b> ${esc(r.sec)}${r.ind ? ' · ' + esc(r.ind) : ''}</div>
      <div>${R && R.guidance ? R.guidance.slice(0, 4).map(g => `<b>${esc(g.split(':')[0])}:</b>${esc(g.split(':').slice(1).join(':'))}`).join('<br>') :
        `<b>Next results:</b> ${esc(f.next_earnings || 'not announced')}<br><b>Analysts:</b> ${recLbl(f.rec_mean)}${f.n_analysts ? ` (${f.n_analysts})` : ''}${ok(f.target_median) ? ` · median target ${px(f.target_median, c)}` : ''}<br><b>EPS growth (this yr / next yr est.):</b> ${pc(f.eps_growth_fwd, 0)} / ${pc(f.eps_growth_next, 0)}<br><b>Fwd P/E vs sector:</b> ${mult(f.fpe)} vs ${mult(d.sector_medians?.fpe)}`}</div>
      <div><b>Last updated:</b> ${esc(updated)}<br><b>Analyst name:</b> ${analyst}<br><b>Trading (3–12 m):</b> <span class="${sigCls(r.v)}" style="font-size:10px">${esc(r.v)}</span> ${S100(r)}/100${ok(lrcT) && !SAFE ? `<br><b>Target:</b> ${px(lrcT, c)}${ok(tg.low) && ok(tg.high) ? ` <span style="color:#5C6478">(range ${px(tg.low, c)} – ${px(tg.high, c)})</span>` : ''}` : ''}<br><b>Investment (5–10 y):</b> <span class="${sigCls(r.iv_v)}" style="font-size:10px">${esc(r.iv_v || '—')}</span> ${r.iv_score ?? '—'}/100<br><b>Valuation:</b> <span class="${valCls(r.val)}" style="font-size:9.5px">${esc(r.val || '—')}</span>${r.v_note && !SAFE ? `<br><span style="font-size:11px;color:#7A8296">${esc(r.v_note)}</span>` : ''}${r.cov ? `<br><b>LRC analyst rating:</b> ${esc(r.cov.rating)} (${esc(r.cov.rated || '')})` : ''}${R && R.geo_mix ? `<br><b>Geo %:</b> ${esc(R.geo_mix)}` : ''}</div>
    </div>
    <div class="pwhy" id="pWhy"></div>
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
    <p class="bl"><b class="k">Bottom Line:</b> ${R && R.bottom_line ? esc(R.bottom_line) + '<br>' + autoBottom.replace('<b>Thesis:</b>', '<b>Model check:</b>') : autoBottom}</p>
    <div class="bar">Valuation <small>VS ${esc(r.sec.toUpperCase())} · ${r.m === 'JSE' ? 'JSE' : 'NEW YORK'} MEDIAN</small></div>
    <div class="cols"><div>
      <p style="margin-bottom:6px"><b style="color:#16223D">Valuation verdict:</b> <span class="${valCls(r.val)}" style="font-size:11px">${esc(r.val || '—')}</span></p>
      ${rtab(GRP.slice(0, 3))}
    </div><div>
      <div class="gauge">${gauge}<div><b style="color:#16223D">Trading ${S100(r)}/100 · ${esc(r.v)} &nbsp;|&nbsp; Investment ${r.iv_score ?? '—'}/100 · ${esc(r.iv_v || '—')}</b><br><span style="color:#5C6478;font-size:11.5px">${r.pts > 0 ? '+' : ''}${r.pts} points of a possible ±${r.max}. Group scores (0–100, 50 = neutral):</span><div class="fbars">${heat}</div></div></div>
      ${SAFE ? '' : tgTable ? `<div style="margin-top:10px">${tgTable}${tg.inputs ? `<p style="font-size:10.5px;color:#7A8296;margin-top:4px">Assumptions: cost of equity ${pp(tg.inputs.r, 1)} (10-year bond yield + equity risk premium, adjusted for beta); growth years 1–5 ${pp(tg.inputs.g1, 0)} fading to ${pp(tg.inputs.g_term, 1)} long-term. Methods that do not fit the company are left out.</p>` : ''}</div>` : `<div class="tg" style="margin-top:10px">${tgRows.map(([l, v, g]) => `<span>${esc(l)}</span><span style="text-align:right;color:#5C6478">${g === false ? '' : pc(v / t.price - 1, 0)}</span><span class="${g === false ? '' : 'gv' + (v < t.price ? ' neg' : '')}" style="text-align:right;font-weight:800">${px(v, c)}</span>`).join('')}${tgRange}${tgRev}</div>${tg.basis ? `<p style="font-size:10.5px;color:#7A8296;margin-top:4px">Average of: ${esc(tg.basis)}.${tg.inputs ? ` Cost of equity ${pp(tg.inputs.r, 1)}, growth years 1–5 ${pp(tg.inputs.g1, 0)} fading to ${pp(tg.inputs.g_term, 1)}.` : ''}</p>` : ''}`}
      ${R && R.valuation ? `<h4>Analyst valuation:</h4>${ul(R.valuation.map(esc))}` : ''}
      ${inv ? `<h4>Investment track (5–10 yrs): grade ${esc(inv.grade)} · ${inv.passed}/${inv.known} checks</h4><p style="font-size:11.5px;color:#5C6478">${inv.checks.filter(x => x.ok !== null).map(x => `<span style="color:${x.ok ? '#0F7B3F' : '#C5221F'}">${x.ok ? '✔' : '✘'} ${esc(x.k)}</span>`).join(' · ')}</p>` : ''}
    </div></div>
    ${ok(lrcT) && !SAFE ? `<div class="bar" id="ivchart">Intrinsic Value vs Market Price <small>LRC VALUE OVER TIME · BUY / HOLD / SELL ZONES</small></div><div id="ivBox">${ivChart(d, lrcT, 760, 300)}</div>` : ''}
    <div class="bar">All Fundamentals <small>37 READINGS · COMPANY vs SECTOR MEDIAN vs MARKET MEDIAN</small></div>
    <div class="cols"><div>${rtab(GRP.slice(3, 5))}</div><div>${rtab(GRP.slice(5))}</div></div>
    <p class="bl"><b class="k">Bottom Line:</b> ${R && R.valuation_bottom_line ? esc(R.valuation_bottom_line) : `Against the median ${esc(r.sec)} company in ${r.m === 'JSE' ? 'the JSE' : 'New York'}, the shares look <b>${esc((vv('fpe').verdict || vv('tpe').verdict || 'n/a').toLowerCase())}</b> on earnings and <b>${esc((vv('pfcf').verdict || 'n/a').toLowerCase())}</b> on free cash flow. ${ok(lrcT) && !SAFE ? `The LRC Analyst Target is ${px(lrcT, c)} (${pc(lrcT / t.price - 1, 0)} from today).` : ''}`}
      ${R && R.catalysts_to_watch ? ` <b style="color:#C5221F">Catalysts to watch:</b> ${esc(R.catalysts_to_watch)}` : f.next_earnings ? ` <b style="color:#C5221F">Catalyst to watch:</b> results on ${esc(f.next_earnings)}.` : ''}</p>
    <div class="bar pg2">Technical Picture <small>TREND · SETUP · MAJOR SUPPORT &amp; RESISTANCE</small></div>
    <p>${t.setup ? `<b>${esc(t.setup)}</b> at ${px(t.setup_level, c)}${t.setup_note ? ' — ' + esc(t.setup_note) : ''}. ` : 'No breakout or retest setup today. '}Price is ${t.price > t.sma50 ? 'above' : 'below'} the 50-day average (${px(t.sma50, c)})${t.sma200 ? ` and ${t.price > t.sma200 ? 'above' : 'below'} the 200-day (${px(t.sma200, c)})` : ''}; RSI ${ok(t.rsi) ? t.rsi.toFixed(0) : '—'}.
      Major support: ${(t.supports || []).map(s => px(s.price, c) + ` (${s.touches} touches)`).join(', ') || '—'}. Major resistance: ${(t.resistances || []).map(s => px(s.price, c) + ` (${s.touches} touches)`).join(', ') || '—'}.
      ${f.next_earnings && days(f.next_earnings) <= 14 ? `<b style="color:#C5221F">Results in ${days(f.next_earnings)} days — expect bigger moves.</b>` : ''} <span style="color:#5C6478">Trade plans with entry levels are on the <a href="scanner.html#setups" style="color:#1F3BB3">scanner's Setups tab</a>.</span></p>
    ${INTEL && ((INTEL.news || []).length || (INTEL.sec && INTEL.sec.filings || []).length) ? `<div class="bar">Latest News &amp; Filings <small>UPDATED ${esc(when(INTEL.generated))}</small></div>
      <div class="cols"><div><h4>News</h4><ul>${(INTEL.news || []).slice(0, 6).map(n => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:#1F3BB3">${esc(n.title)}</a> <span style="color:#7A8296">— ${esc(n.source)}${n.published ? ', ' + esc(n.published.slice(0, 10)) : ''}</span></li>`).join('') || '<li>No recent stories.</li>'}</ul></div>
      <div>${INTEL.sec ? `<h4>SEC filings</h4><ul>${(INTEL.sec.filings || []).slice(0, 5).map(f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener" style="color:#1F3BB3">${esc(f.form)}</a> ${esc(f.date)} — ${esc(f.desc)}</li>`).join('')}</ul><p style="font-size:11.5px;color:#5C6478">Insider (Form 4) filings in the last 90 days: ${INTEL.sec.insider_filings_90d}</p>` : `<h4>Company announcements</h4><p style="font-size:12px">JSE companies publish results and trading statements on SENS — the news list includes SENS stories carried by South African financial media.</p>`}</div></div>` : ''}
    ${fin ? `<div class="bar">Financials <small>${fin.q ? 'LAST ' + fin.n + ' QUARTERS' : 'ANNUAL'} · REVENUE · NET INCOME · NET MARGIN (${esc(fin.cur)})</small></div>${fin.svg}${!fin.q && r.m === 'JSE' ? '<p style="font-size:11px;color:#5C6478">JSE companies report half-yearly, so the chart shows full financial years.</p>' : ''}` : ''}
    <p class="src">Sources: ${R ? `LRC analyst research (${esc(R.analyst)}, ${esc(R.updated)}); ` : ''}${esc((d.sources || ['Yahoo Finance prices, fundamentals and analyst data']).concat(INTEL ? INTEL.sources || [] : []).join('; '))}${R && R.sources ? '; ' + esc(R.sources.slice(0, 6).join('; ')) : ''}. Scored by the LRC Stock Scanner (${esc(when(d.generated))}). Valuation verdicts compare each ratio with the median of the same sector in the same market. LRC Analyst Target: the average of the LRC valuation methods that fit the company (1 DCF on free cash flow, 2 residual income for banks and insurers, 3 dividend & buyback model for income sectors, 4 EV/EBITDA against sector peers) and the analyst consensus when three or more analysts cover it; the range is the lowest to the highest of those values. 5 Reverse DCF shows the growth the price already assumes.
      <b>Educational only — not financial advice.</b> Leago Rifumo Capital · Ermelo, Mpumalanga · leagorifumocapital.co.za</p>`;
    try { const sl = r.t.toLowerCase().replace('.jo', '-jse').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''), cu = 'https://www.leagorifumocapital.co.za/shares/' + sl + '.html';
      const cn = document.querySelector('link[rel=canonical]'); if (cn) cn.href = cu;
      const md = document.querySelector('meta[name=description]'); if (md) md.content = `${r.n} (${r.t.replace('.JO', '')}) one-page summary: LRC scores, valuation vs peers, thesis and financial statements.`;
      document.title = `${r.n} (${r.t.replace('.JO', '')}) One-Page Summary, Thesis & Financial Statements | Leago Rifumo Capital`; } catch (e) { }
    try { renderThesis({ d, r, t, f, pr, c, X, SX, MS, lrcT, upT, what, compTxt, indTxt, mgmtTxt, bsTxt, pickBy, nextBits, recLbl, days, finCo, sizeWord, mktName, cap1 }); } catch (e) { console.error(e); }
    loadStatements(r, c, d, lrcT);
  }

  /* ---------- LRC THESIS: why we are looking at this company (automated from the data, refreshed every scanner run) ---------- */
  function renderThesis(o) {
    const { d, r, t, f, pr, c, X, SX, MS, lrcT, upT, what, compTxt, indTxt, mgmtTxt, bsTxt, pickBy, nextBits, recLbl, days, finCo, sizeWord, mktName, cap1 } = o;
    const el = $('thesisSec'); if (!el) return;
    const nm = esc(r.n), tk = esc(r.t.replace('.JO', ''));
    const radar = [];
    if (/STRONG/.test(r.v)) radar.push(`It is rated <b>${esc(r.v)}</b> on our Trading scanner (score ${S100(r)}/100) — one of the ${/BUY/.test(r.v) ? 'strongest' : 'weakest'} readings in ${mktName}.`);
    if (/STRONG/.test(r.iv_v || '')) radar.push(`It is rated <b>${esc(r.iv_v)}</b> on our Investment scanner (score ${r.iv_score}/100) for 5–10 year investors.`);
    if (t.setup) radar.push(`The chart shows a <b>${esc(t.setup.toLowerCase())}</b> at ${px(t.setup_level, c)}${t.setup_note ? ' — ' + esc(t.setup_note) : ''}.`);
    if (r.val === 'UNDERVALUED') radar.push(`Our valuation models say the shares are <b>undervalued</b>${ok(upT) ? ` (${pc(upT, 0)} to the LRC Analyst Target)` : ''}.`);
    else if (r.val === 'OVERVALUED') radar.push(`Our valuation models say the shares are <b>overvalued</b>${ok(upT) ? ` (${pc(upT, 0)} to the LRC Analyst Target)` : ''}.`);
    if (ok(t.perf_1m) && Math.abs(t.perf_1m) >= 0.1) radar.push(`The share price has moved <b>${pc(t.perf_1m, 0)}</b> in the past month.`);
    if (f.next_earnings && days(f.next_earnings) >= 0 && days(f.next_earnings) <= 30) radar.push(`Results are due on <b>${esc(f.next_earnings)}</b> (${days(f.next_earnings)} days).`);
    (o.extra || []).forEach(x => radar.push(x));
    if (!radar.length) radar.push(`${nm} is ${sizeWord || 'a company'} we score every day; the picture is mixed, which is useful to know before you act.`);
    const strengths = pickBy(1, 4), weaknesses = pickBy(-1, 4);
    const ig = ['valuation', 'profitability', 'health', 'growth', 'income'].map(k => [k, (r.grp || {})[k]]).filter(x => ok(x[1])).sort((a, b) => b[1] - a[1]);
    const gn = k => ({ valuation: 'valuation', profitability: 'profitability', health: 'financial health', growth: 'long-term growth', income: 'dividend income' })[k];
    const rivals = (X.rivals || []).map(x => `<a href="stock.html?t=${encodeURIComponent(x.t)}">${esc(x.n)}</a>`);
    const fpe = f.fpe, sfpe = d.sector_medians?.fpe, mfpe = (d.medians?.market || {}).fpe;
    const valBits = [];
    if (ok(fpe) && fpe > 0) valBits.push(`${tk} trades on <b>${fpe.toFixed(1)}x</b> forward earnings${ok(sfpe) ? ` vs ${sfpe.toFixed(1)}x for its sector` : ''}${ok(mfpe) ? ` and ${mfpe.toFixed(1)}x for the ${r.m === 'JSE' ? 'JSE' : 'New York'} market` : ''}.`);
    else if (ok(f.tpe) && f.tpe < 0) valBits.push(`${tk} is loss-making, so earnings multiples do not apply — investors are paying for a recovery or future growth.`);
    if (ok(f.pfcf) && f.pfcf > 0) valBits.push(`Price to free cash flow is ${f.pfcf.toFixed(1)}x${ok(MS.pfcf) ? ` (sector ${MS.pfcf.toFixed(1)}x)` : ''}.`);
    if (ok(f.div_yield) && f.div_yield > 0) valBits.push(`The dividend yield is ${pp(f.div_yield, 1)}.`);
    if (ok(f.target_median)) valBits.push(`The median analyst target is ${px(f.target_median, c)} (${pc(f.target_median / t.price - 1, 0)}).`);
    const tgx = d.targets || {};
    if (ok(tgx.implied_growth)) valBits.push(`<b>Reverse DCF:</b> today's price assumes free cash flow grows about <b>${pc(tgx.implied_growth, 0)} a year</b> for five years${ok((tgx.inputs || {}).g1) ? ` — our base case is ${pc(tgx.inputs.g1, 0)}` : ''}.`);
    if (ok(lrcT)) valBits.push(`The <b>LRC Analyst Target</b> is <b>${px(lrcT, c)}</b>${ok(tgx.low) && ok(tgx.high) ? ` (range ${px(tgx.low, c)} – ${px(tgx.high, c)})` : ''}, ${pc(upT, 0)} from ${px(t.price, c)}${tgx.basis ? ` — the average of ${esc(tgx.basis)}` : ''}. Valuation verdict: <b>${esc((r.val || 'fair value').toLowerCase())}</b> (model estimate).`);
    const li = a => a.map(x => `<li>${x}</li>`).join('');
    const trWhy = strengths.length || weaknesses.length ? (/BUY/.test(r.v) ? `The case rests on ${strengths.slice(0, 3).map(x => x.txt).join(', ') || 'the overall score'}.` : /SELL/.test(r.v) ? `The case rests on ${weaknesses.slice(0, 3).map(x => x.txt).join(', ') || 'the overall score'}.` : `Strengths (${strengths.slice(0, 2).map(x => x.txt).join(', ') || '—'}) are balanced by weaknesses (${weaknesses.slice(0, 2).map(x => x.txt).join(', ') || '—'}).`) : '';
    el.innerHTML = `<div class="th-head"><div><span class="eyebrow">LRC Thesis</span><h2>Why we're looking at <span class="gold">${nm}</span></h2></div>
        <div class="th-chips"><span class="${sigCls(r.v)}">TRADING ${esc(r.v)}</span><span class="${sigCls(r.iv_v)}">INVESTMENT ${esc(r.iv_v || 'HOLD')}</span><span class="${valCls(r.val)}">${esc(r.val || 'FAIR VALUE')}</span></div></div>
      <div class="th-grid">
        <div class="th-card th-wide"><h3>Why it's on our radar</h3><ul>${li(radar)}</ul></div>
        <div class="th-card"><h3>The company</h3><p>${esc(what) || nm + ' is listed on ' + mktName + '.'}</p><p>${nm} is ${sizeWord || 'listed on ' + mktName}${X.mkt_rank ? ` (number ${X.mkt_rank} of ${X.mkt_n} by market value in our ${r.m === 'JSE' ? 'JSE' : 'New York'} universe)` : ''}, in the ${esc(r.sec)}${r.ind ? ' · ' + esc(r.ind) : ''} industry.${rivals.length ? ` Main listed rivals we track: ${rivals.join(', ')}.` : ''}</p></div>
        <div class="th-card"><h3>The fundamentals</h3>${[compTxt, bsTxt ? cap1(bsTxt) + '.' : '', indTxt, mgmtTxt].filter(Boolean).map(x => `<p>${x}</p>`).join('')}<div id="thHist"></div></div>
        <div class="th-card"><h3>Valuation</h3>${valBits.map(x => `<p>${x}</p>`).join('') || '<p>Not enough valuation data on the feed.</p>'}</div>
        <div class="th-card th-bull"><h3>Bull case</h3><ul>${li(strengths.map(x => cap1(x.txt) + '.')) || '<li>No standout strength in the data.</li>'}</ul></div>
        <div class="th-card th-bear"><h3>Bear case</h3><ul>${li(weaknesses.map(x => cap1(x.txt) + '.')) || '<li>No major weakness in the data.</li>'}</ul></div>
        <div class="th-card th-wide th-rec"><h3>Our recommendation</h3>
          <div class="th-recs"><div><b class="${sigCls(r.v)}">TRADING · ${esc(r.v)}</b><span>3–12 months · score ${S100(r)}/100</span><p>${trWhy}${ok(upT) ? ` The LRC Analyst Target implies ${pc(upT, 0)} over 6 months.` : ''}${r.v_note ? ' ' + esc(r.v_note) + '.' : ''}</p></div>
          <div><b class="${sigCls(r.iv_v)}">INVESTMENT · ${esc(r.iv_v || 'HOLD')}</b><span>5–10 years · score ${r.iv_score ?? '—'}/100</span><p>${ig.length ? `Best on ${gn(ig[0][0])} (${ig[0][1]}/100)${ig.length > 1 ? `, weakest on ${gn(ig[ig.length - 1][0])} (${ig[ig.length - 1][1]}/100)` : ''}. ` : ''}${r.iv_note ? esc(r.iv_note) + '. ' : ''}${r.val === 'UNDERVALUED' ? 'The price looks low against our valuation models, which gives long-term investors a margin of safety.' : r.val === 'OVERVALUED' ? 'The price already looks high against our valuation models, so long-term returns depend on growth beating expectations.' : 'The price is close to our estimate of fair value.'}</p></div></div></div>
        <div class="th-card th-wide"><h3>What to watch next</h3><ul>${li(nextBits.map(x => cap1(x) + '.')) || '<li>No dated catalyst on the feed.</li>'}${f.ex_div ? `<li>Ex-dividend date: ${esc(f.ex_div)}.</li>` : ''}</ul></div>
      </div>
      <p class="th-foot">This thesis is written automatically from the latest LRC Stock Scanner data (${esc(when(d.generated))}) and updates after every scan. It is a starting point for your own research. <a href="shares/${r.t.toLowerCase().replace('.jo', '-jse').replace(/[^a-z0-9-]+/g, '-')}.html">Company profile page →</a> <b>Educational only — not financial advice.</b></p>`;
    const pw = $('pWhy');
    const drawWhy = items => { if (pw) pw.innerHTML = `<b>Why we're looking at ${nm}:</b> ${items.slice(0, 3).map(x => x.replace(/<\/?a[^>]*>/g, '')).join(' ')} <span class="no-print"><a href="#thesisSec">Full LRC Thesis ↓</a> · <a href="#fsSec">Financial statements ↓</a></span>`; };
    drawWhy(radar);
    // extra radar reasons from the watchlist and the Focus List
    Promise.allSettled([get('scan/lists.json'), get('scan/research_ideas.json')]).then(([L, RI]) => {
      const add = [];
      const NAMES = { trading_buy: 'Trading BUY list', trading_sell: 'Trading SELL list', invest_buy: 'Investment BUY list', invest_sell: 'Investment SELL list' };
      if (L.status === 'fulfilled') Object.entries((L.value.lists || {})[r.m] || {}).forEach(([k, a]) => { if (Array.isArray(a) && a.some(x => x.t === r.t)) add.push(`It is on the <a href="watchlist.html">LRC Watchlist</a> — ${esc(NAMES[k] || k)} (top 5 in ${mktName}).`); });
      if (RI.status === 'fulfilled') { const v = RI.value, G = {}; (v.groups || []).forEach(g => G[g.key] = g.title);
        Object.entries((v.ideas || {})[r.m] || {}).forEach(([k, a]) => { const x = Array.isArray(a) ? a.find(y => y.t === r.t) : null; if (x) add.push(`It is on the <a href="research.html">LRC Focus List</a> — ${esc(G[k] || k)}${x.why ? ': ' + esc(x.why) : ''}.`); }); }
      if (add.length) { const ul = el.querySelector('.th-card ul'); if (ul) ul.insertAdjacentHTML('afterbegin', add.map(x => `<li>${x}</li>`).join('')); }
      if (add.length) drawWhy(add.concat(radar));
    });
  }

  /* ---------- FINANCIAL STATEMENTS (annual 5+ years and quarterly / interim) ---------- */
  function loadStatements(r, c0, d, V) {
    const el = $('fsSec'); if (!el) return;
    get('fs/' + r.t.replace('^', '_') + '.json').then(fs => { try { drawIV(fs, d, V); } catch (e) { console.error(e); } drawStatements(el, fs, r); }).catch(() => {
      el.innerHTML = `<div class="th-head"><div><span class="eyebrow">Financial statements</span><h2>${esc(r.n)} <span class="gold">financial statements</span></h2></div></div><p class="muted-load">The statements for this company are being collected and appear within a day.</p>`;
    });
  }
  function drawStatements(el, fs, r) {
    const cur = fs.cur || r.cur, sym = CUR(cur) || (cur + ' ');
    const LBL = {}; (fs.lines || []).forEach(([k, l, st, kind]) => LBL[k] = { l, st, kind });
    let per = 'annual', st = 'is';
    const ST = { is: 'Income statement', bs: 'Balance sheet', cf: 'Cash flow' };
    const ORDER = { is: [], bs: [], cf: [] }; (fs.lines || []).forEach(([k, l, s]) => ORDER[s].push(k));
    const colLbl = (dte, p) => { const x = new Date(dte + 'T00:00:00'); const mo = x.toLocaleString('en-GB', { month: 'short' });
      return p === 'annual' ? `FY${x.getFullYear()}${x.getMonth() === 11 ? '' : `<small>${mo}</small>`}` : `${mo} ${x.getFullYear()}`; };
    const unitOf = data => { const ta = (data.rows.ta || data.rows.rev || []).filter(ok).map(Math.abs); const m = ta.length ? Math.max(...ta) : 0; return m >= 5e10 ? [1e9, 'billions'] : [1e6, 'millions']; };
    const fmt = (v, kind, U) => { if (!ok(v)) return '<span class="fs-na">—</span>'; const x = kind === 'e' ? v : kind === 's' ? v / 1e6 : v / U[0];
      const s = Math.abs(x).toLocaleString('en-ZA', { minimumFractionDigits: kind === 'e' ? 2 : Math.abs(x) < 10 ? 1 : 0, maximumFractionDigits: kind === 'e' ? 2 : Math.abs(x) < 10 ? 1 : 0 });
      return v < 0 ? `<span class="fs-neg">(${s})</span>` : s; };
    const ratio = (data, a, b, i) => { const x = (data.rows[a] || [])[i], y = (data.rows[b] || [])[i]; return ok(x) && ok(y) && y !== 0 ? x / y : null; };
    const RAT = {
      is: [['Gross margin', d_ => i => ratio(d_, 'gp', 'rev', i), 'p'], ['Operating margin', d_ => i => ratio(d_, 'op', 'rev', i), 'p'], ['Net margin', d_ => i => ratio(d_, 'ni', 'rev', i), 'p'],
        ['Revenue growth', d_ => i => { const k = per === 'annual' ? 1 : 4, a = (d_.rows.rev || [])[i], b = (d_.rows.rev || [])[i - k]; return ok(a) && ok(b) && b ? a / b - 1 : null; }, 'g']],
      bs: [['Current ratio', d_ => i => ratio(d_, 'ca', 'cl', i), 'x'], ['Debt to equity', d_ => i => ratio(d_, 'debt', 'eq', i), 'x'], ['Equity to assets', d_ => i => ratio(d_, 'eq', 'ta', i), 'p']],
      cf: [['Free cash flow margin', d_ => i => ratio(d_, 'fcf', 'rev', i), 'p'], ['Cash conversion (CFO ÷ net income)', d_ => i => ratio(d_, 'cfo', 'ni', i), 'x'], ['Capex as % of revenue', d_ => i => { const v = ratio(d_, 'capex', 'rev', i); return ok(v) ? -v : null; }, 'p']]
    };
    const KEY = { is: [['rev', 'Revenue', '#D9A93E'], ['ni', 'Net income', '#2BB673']], bs: [['ta', 'Total assets', '#D9A93E'], ['tl', 'Total liabilities', '#C5221F'], ['eq', 'Equity', '#2BB673']], cf: [['cfo', 'Cash from operations', '#D9A93E'], ['fcf', 'Free cash flow', '#2BB673'], ['capex', 'Capex', '#C5221F']] };
    const chart = (data, U) => {
      const keys = KEY[st].filter(([k]) => (data.rows[k] || []).some(ok)); const n = data.dates.length; if (!keys.length || !n) return '';
      const W = 760, H = 190, L = 54, R = 10, T = 12, B = 26, w = W - L - R, h = H - T - B;
      const vals = keys.flatMap(([k]) => (data.rows[k] || []).filter(ok).map(v => v / U[0])); let hi = Math.max(0, ...vals), lo = Math.min(0, ...vals); if (hi === lo) hi = lo + 1;
      const Y = v => T + (hi - v) / (hi - lo) * h, gw = w / n, bw = Math.min(26, (gw - 10) / keys.length);
      let g = `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#3A4152"/>`;
      [hi, (hi + lo) / 2, lo].forEach(v => { g += `<text x="${L - 6}" y="${Y(v) + 3}" font-size="10" fill="#8A93A6" text-anchor="end">${v.toLocaleString('en-ZA', { maximumFractionDigits: v !== 0 && Math.abs(v) < 10 ? 1 : 0 })}</text>`; });
      data.dates.forEach((dte, i) => { const x0 = L + i * gw + (gw - bw * keys.length) / 2;
        keys.forEach(([k, l, col], j) => { const v = (data.rows[k] || [])[i]; if (!ok(v)) return; const y1 = Y(Math.max(0, v / U[0])), y2 = Y(Math.min(0, v / U[0]));
          g += `<rect x="${x0 + j * bw}" y="${y1}" width="${bw - 2}" height="${Math.max(1, y2 - y1)}" fill="${col}" rx="2"><title>${esc(l)} ${colLbl(dte, per).replace(/<[^>]+>/g, ' ')}: ${sym}${(v / U[0]).toLocaleString('en-ZA', { maximumFractionDigits: 1 })} ${U[1]}</title></rect>`; });
        g += `<text x="${L + i * gw + gw / 2}" y="${H - 8}" font-size="10" fill="#8A93A6" text-anchor="middle">${colLbl(dte, per).replace(/<small>.*<\/small>/, '')}</text>`; });
      return `<div class="fs-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(ST[st])} chart">${g}</svg><div class="fs-leg">${keys.map(([k, l, col]) => `<span><i style="background:${col}"></i>${esc(l)}</span>`).join('')}</div></div>`;
    };
    const csv = () => { const data = fs[per]; const U = unitOf(data); const rows = [['Line (' + cur + ' ' + U[1] + ')'].concat(data.dates)];
      ['is', 'bs', 'cf'].forEach(s => { rows.push([ST[s]]); ORDER[s].forEach(k => { if (data.rows[k]) rows.push([LBL[k].l].concat(data.rows[k].map(v => !ok(v) ? '' : LBL[k].kind === 'e' ? v : LBL[k].kind === 's' ? (v / 1e6).toFixed(2) : (v / U[0]).toFixed(2)))); }); });
      const b = new Blob([rows.map(r_ => r_.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${r.t}_financial_statements_${per}.csv`; a.click(); };
    const draw = () => {
      const data = fs[per] || { dates: [], rows: {} }, U = unitOf(data), n = data.dates.length;
      const keys = ORDER[st].filter(k => (data.rows[k] || []).some(ok));
      const yoy = k => { const a = data.rows[k] || [], s = per === 'annual' ? 1 : (fs.interim ? 2 : 4); const x = a[n - 1], y = a[n - 1 - s]; return ok(x) && ok(y) && y !== 0 ? (x - y) / Math.abs(y) : null; };
      const body = keys.length ? keys.map(k => { const L_ = LBL[k] || { l: k, kind: 'm' }, ch = yoy(k), bold = ['rev', 'gp', 'op', 'ni', 'eps', 'ta', 'tl', 'eq', 'cfo', 'fcf'].includes(k);
          return `<tr class="${bold ? 'fs-b' : ''}"><td>${esc(L_.l)}${L_.kind === 'e' ? ` <small>${sym.trim()}</small>` : L_.kind === 's' ? ' <small>millions</small>' : ''}</td>${data.rows[k].map(v => `<td class="n">${fmt(v, L_.kind, U)}</td>`).join('')}<td class="n fs-ch ${ok(ch) ? (ch >= 0 ? 'up' : 'dn') : ''}">${ok(ch) ? pc(ch, 0) : '—'}</td></tr>`; }).join('') +
        `<tr class="fs-sep"><td colspan="${n + 2}">Key ratios</td></tr>` + RAT[st].map(([l, fn, f_]) => { const g_ = fn(data); const vs = data.dates.map((_, i) => g_(i));
          if (!vs.some(ok)) return ''; return `<tr class="fs-r"><td>${esc(l)}</td>${vs.map(v => `<td class="n">${!ok(v) ? '—' : f_ === 'x' ? v.toFixed(2) + 'x' : f_ === 'g' ? pc(v, 0) : pp(v, 1)}</td>`).join('')}<td></td></tr>`; }).join('')
        : `<tr><td colspan="${n + 2}" class="muted-load">${per !== 'annual' && fs.interim && st !== 'bs' ? 'JSE companies report every six months. The data feed carries their interim balance sheets but not the interim income statement or cash flow — switch to Annual, or Balance sheet.' : 'No figures on the data feed for this statement.'}</td></tr>`;
      if (!keys.length) { el.querySelector('.fs-body').innerHTML = `<p class="fs-empty">${per !== 'annual' && fs.interim && st !== 'bs' ? 'JSE companies report every six months. The data feed carries their interim balance sheets but not the interim income statement or cash flow — choose <b>Annual</b>, or the <b>Balance sheet</b>.' : 'No figures on the data feed for this statement.'}</p>`; el.querySelectorAll('[data-per]').forEach(b => b.classList.toggle('on', b.dataset.per === per)); el.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === st)); return; }
      el.querySelector('.fs-body').innerHTML = `${keys.length ? chart(data, U) : ''}<div class="tbl-wrap"><table class="wl fs-tbl"><thead><tr><th>${esc(ST[st])} <small>${esc(cur || '')} ${U[1]}</small></th>${data.dates.map(dte => `<th class="n">${colLbl(dte, per)}</th>`).join('')}<th class="n">${per === 'annual' ? 'Y/Y' : fs.interim ? 'vs year ago' : 'Y/Y'}</th></tr></thead><tbody>${body}</tbody></table></div>`;
      el.querySelectorAll('[data-per]').forEach(b => b.classList.toggle('on', b.dataset.per === per));
      el.querySelectorAll('[data-st]').forEach(b => b.classList.toggle('on', b.dataset.st === st));
    };
    const ya = (fs.annual || {}).dates || [], yq = (fs.quarterly || {}).dates || [];
    el.innerHTML = `<div class="th-head"><div><span class="eyebrow">Financial statements</span><h2>${esc(r.n)} <span class="gold">financial statements</span></h2>
        <p class="fs-sub">${ya.length} financial years${ya.length ? ` (FY${ya[0].slice(0, 4)}–FY${ya[ya.length - 1].slice(0, 4)})` : ''} and the latest ${yq.length} ${fs.interim ? 'reporting periods (JSE companies report half-yearly)' : 'quarters'}. Figures in ${esc(cur || '')} ${'as reported'}.</p></div>
        <div class="fs-ctl"><div class="seg"><button data-st="is">Income statement</button><button data-st="bs">Balance sheet</button><button data-st="cf">Cash flow</button></div>
        <div class="seg"><button data-per="annual">Annual</button><button data-per="quarterly">${fs.interim ? 'Interim' : 'Quarterly'}</button></div><button class="btn btn-ghost fs-csv">Download CSV</button></div></div>
      <div class="fs-body"></div>
      <p class="th-foot">Sources: ${esc((fs.src || []).join('; '))}. Updated ${esc(fs.updated || '')}; refreshed weekly and kept year by year, so the history grows. Negative numbers in brackets. Y/Y = change in the latest period against the same period a year earlier.</p>`;
    el.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { per = b.dataset.per; draw(); });
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { st = b.dataset.st; draw(); });
    el.querySelector('.fs-csv').onclick = csv;
    draw();
    // 5-year history line in the thesis
    const A = fs.annual || {}, rv = (A.rows || {}).rev || [], ni = (A.rows || {}).ni || [], fcf = (A.rows || {}).fcf || [], so = (A.rows || {}).so || (A.rows || {}).shares || [];
    const idx = rv.map((v, i) => ok(v) ? i : -1).filter(i => i >= 0);
    const hb = [];
    if (idx.length >= 3) { const a = idx[0], b = idx[idx.length - 1], yrs = (new Date(A.dates[b]) - new Date(A.dates[a])) / 3.156e10, cg = yrs > 0 && rv[a] > 0 && rv[b] > 0 ? Math.pow(rv[b] / rv[a], 1 / yrs) - 1 : null;
      if (ok(cg)) hb.push(`revenue has grown ${pc(cg, 1)} a year over ${Math.round(yrs)} years`); }
    const nP = ni.filter(ok); if (nP.length >= 3) hb.push(`it made a profit in ${nP.filter(v => v > 0).length} of the last ${nP.length} years`);
    const fP = fcf.filter(ok); if (fP.length >= 3) hb.push(`free cash flow was positive in ${fP.filter(v => v > 0).length} of ${fP.length} years`);
    const sP = so.filter(ok); if (sP.length >= 3) { const ch = sP[sP.length - 1] / sP[0] - 1; if (Math.abs(ch) >= 0.02) hb.push(`the share count has ${ch < 0 ? 'fallen' : 'risen'} ${pp(Math.abs(ch), 0)} (${ch < 0 ? 'buybacks add to each share' : 'new shares dilute existing holders'})`); }
    const th = $('thHist'); if (th && hb.length) th.innerHTML = `<p><b>Track record (financial statements):</b> ${hb.join('; ')}. <a href="#fsSec">See the statements ↓</a></p>`;
  }

  /* ---------- LRC intrinsic value over time (own design) ----------
     The same valuation methods as the LRC Analyst Target, re-run on each year's (or each quarter's trailing-12-month) reported
     figures with today's cost of equity and growth assumptions, then scaled so the latest point equals today's LRC Analyst Target.
     Price = month-end closes (yearly view) or daily closes (quarterly view). Zones: 20%+ below value = BUY, 20%+ above = SELL. */
  function ivSeries(fs, d, V, per) {
    const f = d.f || {}, fx = f.fx_used || 1, tg = d.targets || {}, inp = tg.inputs || {}, sec = d.row.sec;
    const r = inp.r || 0.11, gT = ok(inp.g_term) ? inp.g_term : 0.03, g1 = ok(inp.g1) ? inp.g1 : gT;
    const fin = sec === 'Financial Services', ddmS = ['Real Estate', 'Utilities', 'Financial Services'].includes(sec);
    const mEV = (d.sector_medians || {}).ev_ebitda;
    const S = fs[per] || {}, dates = S.dates || [], R = S.rows || {};
    const at = (k, i) => { const a = R[k] || []; return ok(a[i]) ? a[i] * fx : null; };
    const flow = (k, i) => { if (per === 'annual') return at(k, i); if (i < 3) return null; let s = 0; for (let q = i - 3; q <= i; q++) { const v = at(k, q); if (v === null) return null; s += v; } return s; };
    const dcf = (cf, sh) => { let v = 0, c = cf; for (let y = 1; y <= 5; y++) { c *= 1 + g1 + (gT - g1) * (y - 1) / 4; v += c / Math.pow(1 + r, y); } v += c * (1 + gT) / (r - gT) / Math.pow(1 + r, 5); return v / sh; };
    const pts = [];
    dates.forEach((dte, i) => {
      const shOf = k => (R[k] || []).map((v, q) => ok(v) ? [Math.abs(q - i), v] : null).filter(Boolean).sort((a, b) => a[0] - b[0])[0];
      const shx = (R.so && ok(R.so[i]) ? R.so[i] : null) || (R.shares && ok(R.shares[i]) ? R.shares[i] : null) || (shOf('so') || shOf('shares') || [])[1];   // nearest reported share count when a year has none
      const sh = shx; if (!sh) return;
      const m = [];
      const fcf = (() => { const v = flow('fcf', i); if (v !== null) return v; const a = flow('cfo', i), b = flow('capex', i); return a !== null && b !== null ? a + b : null; })(), eb = flow('ebitda', i), debt = at('debt', i), cash = at('cash', i), eq = at('eq', i), ni = flow('ni', i);
      if (!fin && ok(fcf) && fcf > 0) m.push(dcf(fcf, sh));
      if (!fin && ok(eb) && eb > 0 && ok(mEV) && mEV > 0) { const e = eb * mEV - ((debt || 0) - (cash || 0)); if (e > 0) m.push(e / sh); }
      const paid = -((flow('div', i) || 0) + (flow('buyback', i) || 0));
      const roe = ok(ni) && ok(eq) && eq > 0 ? Math.max(0, Math.min(0.35, ni / eq)) : null, pay = ok(ni) && ni > 0 ? Math.max(0, Math.min(1, paid / ni)) : 0.5;
      if (fin && ok(eq) && eq > 0 && ok(roe)) { const gb = Math.max(0, Math.min(0.15, roe * (1 - pay))); let b = eq / sh, v = b; for (let y = 1; y <= 5; y++) { v += (roe - r) * b / Math.pow(1 + r, y); b *= 1 + gb; } const rt = (roe - r) * b; v += rt > 0 ? rt * (1 + gT) / (r - gT) / Math.pow(1 + r, 5) : rt / Math.pow(1 + r, 5); if (v > 0) m.push(v); }
      if (ddmS && paid > 0 && ok(roe)) { const gd = Math.max(0, Math.min(gT + 0.015, roe * (1 - pay))); if (r - gd > 0.02) m.push(paid / sh * (1 + gd) / (r - gd)); }
      if (m.length) pts.push({ date: dte, raw: m.reduce((a, b) => a + b, 0) / m.length });
    });
    if (!pts.length) return null;
    const last = pts[pts.length - 1].raw, k = V / last;
    const ok_k = k > 0.2 && k < 5;
    pts.forEach(p => p.v = ok_k ? p.raw * k : p.raw);
    return { pts, k, calibrated: ok_k, g1, gT };
  }
  function drawIV(fs, d, V) {
    const box = $('ivBox'); if (!box || !ok(V)) return;
    const interim = !!fs.interim, nm = d.row.n, cur = d.row.cur, P0 = d.tech.price, tg = d.targets || {};
    let per = 'annual';
    const nice = (lo, hi, n) => { const raw = (hi - lo) / n, p10 = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 2.5, 5, 10].map(m => m * p10).find(s => s >= raw) || raw; const out = []; for (let v = Math.floor(lo / st) * st; v <= hi + st - 1e-9; v += st) out.push(v); return out; };
    const money = v => CUR(cur) + (v === 0 ? '0' : v >= 1000 ? Math.round(v).toLocaleString('en-ZA') : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
    // 1. plain-English verdict + price-vs-value meter (same for both views)
    const ratio = P0 / V, gap = ratio - 1;
    const zone = ratio <= 0.8 ? { k: 'cheap', w: 'looks CHEAP', c: '#0F7B3F', bg: '#E7F4EB', s: `The share price is ${Math.round(-gap * 100)}% below what we think the company is worth.` }
      : ratio >= 1.2 ? { k: 'dear', w: 'looks EXPENSIVE', c: '#B3261E', bg: '#FCEBE8', s: `The share price is ${Math.round(gap * 100)}% above what we think the company is worth.` }
      : { k: 'fair', w: 'is FAIRLY PRICED', c: '#5C6478', bg: '#F3F4F8', s: `The share price is within 20% of what we think the company is worth (${gap >= 0 ? Math.round(gap * 100) + '% above' : Math.round(-gap * 100) + '% below'}).` };
    const mPos = Math.max(0, Math.min(1, (ratio - 0.5) / 1.0));   // meter: 0.5x value .. 1.5x value
    const head = `<div class="ivh" style="background:${zone.bg};border-color:${zone.c}"><div class="ivh-t"><b style="color:${zone.c}">${esc(nm)} ${zone.w}</b><span>${zone.s}</span></div>
      <div class="ivh-n"><div><small>Share price</small><b style="color:#B5651D">${px(P0, cur)}</b></div><div><small>What we think it's worth</small><b style="color:#1F3BB3">${px(V, cur)}</b></div></div></div>
      <div class="ivm"><div class="ivm-bar"><span class="c">CHEAP</span><span class="f">FAIR PRICE</span><span class="e">EXPENSIVE</span><i style="left:${(mPos * 100).toFixed(1)}%"><em style="${mPos < 0.08 ? 'left:0;transform:none' : mPos > 0.92 ? 'left:auto;right:0;transform:none' : ''}">price today</em></i></div>
      <div class="ivm-scale"><span>50% below value</span><span>20% below</span><span>= value</span><span>20% above</span><span>50% above</span></div></div>`;
    const render = () => {
      let ser = ivSeries(fs, d, V, per);
      const body = box.querySelector('.ivbody');
      if (!ser || ser.pts.length < 2) { body.innerHTML = `<p class="ivnote">${per === 'quarterly' ? (interim ? 'JSE companies report every six months and the data feed has no quarterly cash flow for them — the history is shown yearly.' : 'Not enough quarterly figures for a history yet.') : 'Not enough reported years for a history yet.'}</p>`; return; }
      // smooth one-off years so the line shows the trend, not accounting noise
      if (per === 'annual' && ser.pts.length >= 3) ser.pts = ser.pts.map((p, i, a) => ({ ...p, v: i ? (a[i - 1].v + p.v) / 2 : p.v }));
      const tY = s => { const x = new Date(s.length === 7 ? s + '-15' : s); return x.getFullYear() + (x.getMonth() + x.getDate() / 31) / 12; };
      const T0 = tY(new Date().toISOString().slice(0, 10)), fwd = per === 'annual' ? 2 : 1;
      let price = per === 'annual' ? (fs.px_m || []).map(([m, c]) => [tY(m), c]) : [];
      if (price.length < 12) { const s = series(d); if (s) price = s.dates.map((x, i) => [tY(x), s.c[i]]); }
      price = price.filter(p => p[1] > 0); price.push([T0, P0]);
      let path = ser.pts.map(p => [tY(p.date), p.v]); path.push([T0, V]);
      const start = Math.max(path[0][0], price[0][0] - 0.1);
      path = path.filter(p => p[0] >= start - 1e-6); if (path.length < 2) path.unshift([start, path[0][1]]);
      price = price.filter(p => p[0] >= start);
      let pv = V; const proj = [[T0, V]]; for (let y = 1; y <= fwd; y++) { pv *= 1 + ser.g1 + (ser.gT - ser.g1) * (y - 1) / 4; proj.push([T0 + y, pv]); }
      const vAt = x => { const all = path.concat(proj.slice(1)); if (x <= all[0][0]) return all[0][1]; for (let i = 1; i < all.length; i++) if (x <= all[i][0]) { const [a, va] = all[i - 1], [b, vb] = all[i]; return va + (vb - va) * (x - a) / (b - a || 1); } return all[all.length - 1][1]; };
      const X0 = start, X1 = T0 + fwd;
      const vals = path.concat(proj).map(p => p[1]).concat(price.map(p => p[1]));
      const ticks = nice(Math.max(0, Math.min(...vals) * 0.8), Math.max(...vals) * 1.15, 4);
      const lo = ticks[0], hi = ticks[ticks.length - 1];
      const W = 760, H = 300, L = 56, Rm = 92, Tm = 12, Bm = 30, w = W - L - Rm, h = H - Tm - Bm;
      const X = x => L + (x - X0) / (X1 - X0) * w, Y = v => Tm + (hi - Math.min(hi, Math.max(lo, v))) / (hi - lo) * h;
      const xs = []; for (let x = X0; x <= X1 + 1e-9; x += (X1 - X0) / 100) xs.push(x);
      const band = (a, b) => xs.map(x => `${X(x).toFixed(1)},${Y(vAt(x) * a).toFixed(1)}`).join(' ') + ' ' + xs.slice().reverse().map(x => `${X(x).toFixed(1)},${Y(vAt(x) * b).toFixed(1)}`).join(' ');
      const halo = 'paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round"';
      let g = `<polygon points="${band(1.2, 99)}" fill="#FCEBE8"/><polygon points="${band(0.8, 1.2)}" fill="#F5F6F9"/><polygon points="${band(0, 0.8)}" fill="#E7F4EB"/>`;
      ticks.forEach(v => { g += `<line x1="${L}" x2="${L + w}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E6E8EE"/><text x="${L - 8}" y="${Y(v) + 4}" font-size="11" fill="#7A8296" text-anchor="end">${money(v)}</text>`; });
      if (per === 'annual') { for (let y = Math.ceil(X0); y <= X1; y++) if (Math.abs(y - T0) > 0.3) g += `<text x="${X(y)}" y="${H - 8}" font-size="11" fill="#7A8296" text-anchor="middle">${y}</text>`; }
      else for (let q = Math.ceil(X0 * 2) / 2; q <= X1; q += 0.5) { const yy = Math.floor(q + 1e-6); if (Math.abs(q - T0) < 0.15) continue; g += `<text x="${X(q)}" y="${H - 8}" font-size="11" fill="#7A8296" text-anchor="middle">${q - yy > 0.25 ? 'Jul' : 'Jan'} ${String(yy).slice(2)}</text>`; }
      g += `<rect x="${X(T0)}" y="${Tm}" width="${X(X1) - X(T0)}" height="${h}" fill="#fff" opacity=".45"/><line x1="${X(T0)}" x2="${X(T0)}" y1="${Tm}" y2="${Tm + h}" stroke="#16223D" stroke-width="1.2" stroke-dasharray="3 3"/>`;
      g += `<text x="${X(T0)}" y="${Tm + h + 18}" font-size="11" font-weight="800" fill="#16223D" text-anchor="middle">TODAY</text>`;
      // zone names on the right edge
      const yr = X1, zr = v => Math.max(Tm + 10, Math.min(Tm + h - 4, Y(v)));
      let zy = [zr((hi + vAt(yr) * 1.2) / 2), zr(vAt(yr)) + 4, zr((lo + vAt(yr) * 0.8) / 2)];
      for (let i = 1; i < 3; i++) if (zy[i] - zy[i - 1] < 15) zy[i] = zy[i - 1] + 15;
      if (zy[2] > Tm + h - 2) { zy[2] = Tm + h - 2; for (let i = 1; i >= 0; i--) if (zy[i + 1] - zy[i] < 15) zy[i] = zy[i + 1] - 15; }
      [['Expensive', '#B3261E'], ['Fair price', '#5C6478'], ['Cheap', '#0F7B3F']].forEach(([l, c], i) => { g += `<text x="${L + w + 8}" y="${zy[i]}" font-size="11.5" font-weight="800" fill="${c}">${l}</text>`; });
      // lines
      g += `<polyline points="${path.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="#1F3BB3" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      g += `<polyline points="${proj.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="#1F3BB3" stroke-width="2.6" stroke-dasharray="2 6" stroke-linecap="round"/>`;
      g += `<polyline points="${price.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="#E07B24" stroke-width="2.4" stroke-linejoin="round"/>`;
      path.slice(0, -1).forEach(p => { g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="#fff" stroke="#1F3BB3" stroke-width="2"><title>${money(p[1])}</title></circle>`; });
      g += `<circle cx="${X(T0)}" cy="${Y(V)}" r="6" fill="#1F3BB3" stroke="#fff" stroke-width="2"/><circle cx="${X(T0)}" cy="${Y(P0)}" r="6" fill="#E07B24" stroke="#fff" stroke-width="2"/>`;
      g += `<text x="${X(X1) - 2}" y="${Y(pv) - 10 < Tm + 12 ? Y(pv) + 20 : Y(pv) - 10}" font-size="11" font-weight="700" fill="#1F3BB3" text-anchor="end" ${halo}>our estimate ${money(pv)}</text>`;
      body.innerHTML = `<div class="ivwrap"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Share price compared with what we think ${esc(nm)} is worth">${g}</svg></div>
        <div class="ivleg"><span><i style="background:#1F3BB3"></i><b>What we think it's worth</b> (LRC value)</span><span><i style="background:#E07B24"></i><b>Share price</b></span><span><i style="background:#1F3BB3;height:3px;opacity:.6"></i>dotted = our estimate for the next ${fwd} year${fwd > 1 ? 's' : ''}</span></div>
        <div class="ivread"><b>How to read it:</b> when the orange price line is in the <span style="color:#0F7B3F;font-weight:700">green area</span> the shares cost at least 20% less than our value (cheap); in the <span style="color:#B3261E;font-weight:700">red area</span> they cost at least 20% more (expensive). The blue line moves as the company's profits and cash flow change.</div>
        <p class="ivnote">Method: our valuation methods (DCF, residual income, dividend & buyback model, EV/EBITDA vs peers) re-run on each ${per === 'annual' ? 'year' : 'quarter'}’s reported figures${ser.calibrated ? ', scaled so today equals the LRC Analyst Target' : ''}${per === 'annual' ? '; each point is the average of that year and the year before' : ''}. Estimate: ${pp(ser.g1, 0)} a year growth fading to ${pp(ser.gT, 1)}.${ok(tg.low) && ok(tg.high) ? ` Range of methods today: ${px(tg.low, cur)} – ${px(tg.high, cur)}.` : ''}${Math.abs(V / P0 - 2) < 0.005 || Math.abs(V / P0 - 0.5) < 0.005 ? ' <b>Note:</b> the methods point even further from the price, so the value is capped at ' + (V > P0 ? 'twice' : 'half') + ' the share price (our safety limit) — treat it with extra care.' : ''}</p>`;
      box.querySelectorAll('[data-ivp]').forEach(b => b.classList.toggle('on', b.dataset.ivp === per));
    };
    const ser0 = ivSeries(fs, d, V, 'annual');
    box.innerHTML = head + (ser0 && ser0.pts.length >= 2 ? `<div class="ivtop no-print"><span>Show history:</span><div class="seg"><button data-ivp="annual">Yearly</button><button data-ivp="quarterly">Quarterly</button></div></div><div class="ivbody"></div>` : box.innerHTML);
    if (!(ser0 && ser0.pts.length >= 2)) return;
    box.querySelectorAll('[data-ivp]').forEach(b => b.onclick = () => { per = b.dataset.ivp; render(); });
    render();
  }

  /* Intrinsic value vs market price: 2 years of price history, today's LRC value projected 5 years ahead with the model's growth
     assumptions, and the zones the valuation verdict uses (20%+ below value = undervalued, 20%+ above = overvalued). */
  function ivChart(d, V, W, H) {
    const s = series(d); if (!s || !ok(V) || V <= 0) return '';
    const tg = d.targets || {}, inp = tg.inputs || {}, cur = d.row.cur, P0 = d.tech.price;
    const n = Math.min(504, s.c.length), C = s.c.slice(-n), D = s.dates.slice(-n);
    const g1 = ok(inp.g1) ? inp.g1 : (ok(inp.g_term) ? inp.g_term : 0.04), gT = ok(inp.g_term) ? inp.g_term : g1;
    const proj = [V]; for (let y = 1; y <= 5; y++) proj.push(proj[y - 1] * (1 + g1 + (gT - g1) * (y - 1) / 4));
    const yrsBack = n / 252, X0 = -yrsBack, X1 = 5;
    const hiV = Math.max(...C, proj[5] * 1.2, V * 1.25, ok(tg.high) ? tg.high : 0), loV = Math.min(...C, V * 0.7, ok(tg.low) ? tg.low : Infinity);
    const lo = Math.max(0, loV * 0.85), hi = hiV * 1.06;
    const L = 58, R = 16, T = 14, B = 34, w = W - L - R, h = H - T - B;
    const X = x => L + (x - X0) / (X1 - X0) * w, Y = v => T + (hi - Math.min(hi, Math.max(lo, v))) / (hi - lo) * h;
    const ivAt = x => x <= 0 ? V : (() => { const k = Math.floor(x), f = x - k; return k >= 5 ? proj[5] : proj[k] * Math.pow(proj[k + 1] / proj[k], f); })();
    const xs = []; for (let x = X0; x <= X1 + 1e-9; x += (X1 - X0) / 80) xs.push(x);
    const band = (m1, m2) => xs.map(x => `${X(x).toFixed(1)},${Y(ivAt(x) * m1).toFixed(1)}`).join(' ') + ' ' + xs.slice().reverse().map(x => `${X(x).toFixed(1)},${Y(ivAt(x) * m2).toFixed(1)}`).join(' ');
    let g = '';
    g += `<polygon points="${band(1.2, 99)}" fill="#FBE9E7"/><polygon points="${band(0.8, 1.2)}" fill="#F4F5F7"/><polygon points="${band(0, 0.8)}" fill="#E8F5EC"/>`;
    // grid + axes
    const ticks = 4; for (let i = 0; i <= ticks; i++) { const v = lo + (hi - lo) * i / ticks; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E3E6EE"/><text x="${L - 6}" y="${Y(v) + 3}" font-size="10" fill="#7A8296" text-anchor="end">${CUR(cur)}${v >= 100 ? Math.round(v).toLocaleString('en-ZA') : v.toFixed(2)}</text>`; }
    for (let x = Math.ceil(X0); x <= X1; x++) g += `<line x1="${X(x)}" x2="${X(x)}" y1="${T}" y2="${T + h}" stroke="#EEF0F4"/><text x="${X(x)}" y="${H - 16}" font-size="10" fill="#7A8296" text-anchor="middle">${x === 0 ? 'Today' : (x > 0 ? '+' : '') + x + 'y'}</text>`;
    g += `<text x="${L + w / 2}" y="${H - 3}" font-size="10" fill="#7A8296" text-anchor="middle">Years (past 2 years of prices · next 5 years of projected value)</text>`;
    g += `<line x1="${X(0)}" x2="${X(0)}" y1="${T}" y2="${T + h}" stroke="#16223D" stroke-dasharray="3 3"/>`;
    // zone labels
    const zl = (txt, x, v, col) => `<text x="${X(x)}" y="${Y(v)}" font-size="10.5" font-weight="800" fill="${col}" letter-spacing=".04em" paint-order="stroke" stroke="rgba(255,255,255,.85)" stroke-width="4" stroke-linejoin="round">${txt}</text>`;
    const xl = 0.35, top = lo + (hi - lo) * 0.93;
    g += zl('SELL ZONE · overvalued (20%+ above value)', xl, Math.min(top, Math.max(ivAt(xl) * 1.2 + (hi - lo) * 0.06, (ivAt(xl) * 1.2 + hi) / 2)), '#B3261E');
    g += zl('HOLD ZONE · fair value (±20%)', xl, ivAt(xl) * 0.9, '#5C6478');
    g += zl('BUY ZONE · undervalued (20%+ below value)', xl, Math.max(lo + (hi - lo) * 0.05, (ivAt(xl) * 0.8 + lo) / 2), '#0F7B3F');
    // value range today (methods low-high)
    if (ok(tg.low) && ok(tg.high) && tg.high > tg.low) g += `<rect x="${X(0) - 5}" y="${Y(tg.high)}" width="10" height="${Math.max(2, Y(tg.low) - Y(tg.high))}" fill="#1F3BB3" opacity=".18" rx="3"><title>Range of the valuation methods: ${px(tg.low, cur)} – ${px(tg.high, cur)}</title></rect>`;
    // intrinsic value line: dashed in the past (today's estimate), solid ahead (projection)
    g += `<line x1="${X(X0)}" x2="${X(0)}" y1="${Y(V)}" y2="${Y(V)}" stroke="#1F3BB3" stroke-width="1.6" stroke-dasharray="5 4" opacity=".7"/>`;
    g += `<polyline points="${xs.filter(x => x >= 0).map(x => `${X(x).toFixed(1)},${Y(ivAt(x)).toFixed(1)}`).join(' ')}" fill="none" stroke="#1F3BB3" stroke-width="2.6"/>`;
    // market price
    g += `<polyline points="${C.map((v, i) => `${X(X0 + i / 252).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="#D9822B" stroke-width="2"/>`;
    // today's markers + labels (placed so they do not overlap)
    const up = V / P0 - 1, yP = Y(P0), yV = Y(V), apart = Math.abs(yP - yV) > 16;
    g += `<circle cx="${X(0)}" cy="${yP}" r="4.5" fill="#D9822B" stroke="#fff" stroke-width="1.5"/><circle cx="${X(0)}" cy="${yV}" r="4.5" fill="#1F3BB3" stroke="#fff" stroke-width="1.5"/>`;
    const pAbove = P0 >= V, yPl = pAbove ? Math.min(yP, yV) - 9 : Math.max(yP, yV) + 17, yVl = pAbove ? Math.max(yP, yV) + 17 : Math.min(yP, yV) - 9;
    g += `<text x="${X(0) - 9}" y="${yPl}" font-size="11.5" font-weight="800" fill="#B5651D" text-anchor="end" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">Price ${px(P0, cur)}</text>`;
    g += `<text x="${X(0) - 9}" y="${yVl}" font-size="11.5" font-weight="800" fill="#1F3BB3" text-anchor="end" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">LRC value ${px(V, cur)} (${pc(up, 0)})</text>`;
    g += `<text x="${X(5) - 4}" y="${Y(proj[5]) - 8}" font-size="10.5" font-weight="700" fill="#1F3BB3" text-anchor="end" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">${px(proj[5], cur)} in 5 years</text>`;
    const zone = up >= 0.2 ? ['BUY ZONE', '#0F7B3F', 'the price is 20%+ below our intrinsic value'] : up <= -0.2 ? ['SELL ZONE', '#B3261E', 'the price is 20%+ above our intrinsic value'] : ['HOLD ZONE', '#5C6478', 'the price is within 20% of our intrinsic value'];
    return `<div class="ivwrap"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Intrinsic value versus market price">${g}</svg></div>
      <div class="ivleg"><span><i style="background:#1F3BB3"></i>LRC intrinsic value (average of the valuation methods${ok(tg.low) ? `; range ${px(tg.low, cur)}–${px(tg.high, cur)}` : ''})</span><span><i style="background:#D9822B"></i>Market price</span>
        <span class="ivz" style="color:${zone[1]}">Today: <b>${zone[0]}</b> — ${zone[2]}.</span></div>
      <p class="ivnote">The value line ahead grows with our base-case growth (${pp(g1, 0)} a year fading to ${pp(gT, 1)}); behind today it shows today's estimate for reference, not past estimates.${ok(tg.implied_growth) ? ` Reverse DCF: today's price assumes about ${pc(tg.implied_growth, 0)} a year.` : ''}</p>`;
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
    const all = C.concat(A.filter(ok), B.filter(ok), lv.map(x => x.y)).filter(ok);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    const L = 8, Rr = 92, Tp = 16, Bt = 22, w = W - L - Rr, h = H - Tp - Bt;
    const X = i => L + i * w / (n - 1), Y = v => Tp + (hi - v) / (hi - lo) * h;
    const path = arr => arr.map((v, i) => ok(v) ? `${X(i).toFixed(1)},${Y(v).toFixed(1)}` : null).filter(Boolean).map((p, i) => (i ? 'L' : 'M') + p).join('');
    let months = '', last = '';
    dt.forEach((x, i) => { const m = x.slice(0, 7); if (m !== last && i > 3) { months += `<text x="${X(i)}" y="${H - 6}" font-size="9" fill="#7A8296" text-anchor="middle">${new Date(x).toLocaleString('en-ZA', { month: 'short' })}</text>`; } last = m; });
    const lvs = lv.filter(x => ok(x.y)).map(x => ({ ...x, py: Y(x.y), ly: Y(x.y) + 3 })).sort((a, b) => a.py - b.py);
    for (let i = 1; i < lvs.length; i++) if (lvs[i].ly - lvs[i - 1].ly < 11) lvs[i].ly = lvs[i - 1].ly + 11;  // keep labels apart
    const lines = lvs.map(x => `<line x1="${L}" x2="${L + w}" y1="${x.py}" y2="${x.py}" stroke="${x.c}" stroke-dasharray="4 3" stroke-width="1"/><text x="${L + w + 4}" y="${x.ly}" font-size="9" fill="${x.c}">${x.l} ${px(x.y, cur)}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:10px;border:1px solid #E3E6EE;border-radius:4px">
      <text x="${L}" y="11" font-size="10" fill="#16223D" font-weight="700">Daily close · 50-day (gold) · 200-day (green) · 12 months</text>
      <path d="${path(B)}" fill="none" stroke="#2E9E5B" stroke-width="1.3"/><path d="${path(A)}" fill="none" stroke="#D9A93E" stroke-width="1.3"/>
      <path d="${path(C)}" fill="none" stroke="#16223D" stroke-width="1.5"/>${lines}${months}
      <circle cx="${X(n - 1)}" cy="${Y(C[n - 1])}" r="3" fill="#1F3BB3"/></svg>`;
  }
  function finChart(fin, cur, W, H, secq) {
    const pickQ = () => {
      if (secq && (secq.revenue || []).length >= 4) return { R: secq.revenue, N: secq.net_income || [], q: true, cur: 'USD', src: 'SEC filings' };
      if (fin && (fin.quarterlyTotalRevenue || []).length >= 3) return { R: fin.quarterlyTotalRevenue, N: fin.quarterlyNetIncome || [], q: true, src: 'Yahoo Finance' };
      if (fin && (fin.annualTotalRevenue || []).length >= 2) return { R: fin.annualTotalRevenue, N: fin.annualNetIncome || [], q: false, src: 'Yahoo Finance' };
      return null;
    };
    const P = pickQ(); if (!P) return null;
    const rows = P.R.filter(x => ok(x.value)).slice(-8).map(x => ({ d: x.date, r: x.value, n: (P.N.find(y => y.date === x.date) || {}).value, cur: x.currency }));
    if (rows.length < 2) return null;
    const cc = P.cur || rows[rows.length - 1].cur || cur;
    const lbl = d => { const dt = new Date(d + 'T00:00:00Z'); return P.q ? `Q${Math.floor(dt.getUTCMonth() / 3) + 1} '${String(dt.getUTCFullYear()).slice(2)}` : 'FY ' + dt.getUTCFullYear(); };
    const fmtB = v => (Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(0) + 'M' : n2(v, 0));
    const vals = rows.flatMap(x => [x.r, x.n]).filter(ok);
    let hi = Math.max(...vals), lo = Math.min(0, ...vals); const pad = (hi - lo) * 0.12; hi += pad;
    const L = 52, Rr = 46, Tp = 30, Bt = 24, w = W - L - Rr, h = H - Tp - Bt, n = rows.length;
    const X = i => L + (n === 1 ? w / 2 : i * w / (n - 1)), Y = v => Tp + (hi - v) / (hi - lo) * h;
    const mg = rows.map(x => ok(x.n) && x.r ? x.n / x.r : null);
    const mv = mg.filter(ok); const mHi = Math.max(0.05, ...mv) * 1.15, mLo = Math.min(0, ...mv);
    const YM = v => Tp + (mHi - v) / (mHi - mLo) * h;
    const line = (arr, Yf) => arr.map((v, i) => ok(v) ? `${X(i).toFixed(1)},${Yf(v).toFixed(1)}` : null).filter(Boolean).map((p, i) => (i ? 'L' : 'M') + p).join('');
    const grid = [0, 0.25, 0.5, 0.75, 1].map(k => { const v = lo + (hi - lo) * k; return `<line x1="${L}" x2="${L + w}" y1="${Y(v)}" y2="${Y(v)}" stroke="#EEF0F4"/><text x="${L - 6}" y="${Y(v) + 3}" font-size="9" fill="#7A8296" text-anchor="end">${fmtB(v)}</text>`; }).join('');
    const mAx = [mLo, (mLo + mHi) / 2, mHi].map(v => `<text x="${L + w + 6}" y="${YM(v) + 3}" font-size="9" fill="#9C7426">${(v * 100).toFixed(0)}%</text>`).join('');
    const xl = rows.map((x, i) => `<text x="${X(i)}" y="${H - 7}" font-size="9" fill="#5C6478" text-anchor="middle">${lbl(x.d)}</text>`).join('');
    const dots = (arr, Yf, col, name, fmt) => arr.map((v, i) => ok(v) ? `<circle cx="${X(i)}" cy="${Yf(v)}" r="3" fill="${col}"><title>${lbl(rows[i].d)} ${name}: ${fmt(v)}</title></circle>` : '').join('');
    const last = rows[n - 1];
    const endLbl = (v, Yf, col, txt, dy) => ok(v) ? `<text x="${X(n - 1) - 6}" y="${Yf(v) + dy}" font-size="9.5" font-weight="700" fill="${col}" text-anchor="end">${txt}</text>` : '';
    const legend = `<g font-size="10" fill="#5C6478"><rect x="${L}" y="8" width="14" height="3" fill="#1E8E3E"/><text x="${L + 18}" y="12">Revenue</text><rect x="${L + 78}" y="8" width="14" height="3" fill="#16223D"/><text x="${L + 96}" y="12">Net income</text><rect x="${L + 170}" y="8" width="14" height="3" fill="#D9A93E"/><text x="${L + 188}" y="12">Net margin (right axis)</text><text x="${L + w + Rr - 4}" y="12" text-anchor="end" fill="#7A8296">${esc(cc || '')} · ${esc(P.src)}</text></g>`;
    const nPos = ok(last.n) && Y(last.n) - Y(last.r) < 14;
    return { cur: cc, q: P.q, n, svg: `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:760px;border:1px solid #E3E6EE;border-radius:4px;background:#fff">${legend}${grid}${mAx}
      <line x1="${L}" x2="${L + w}" y1="${Y(0)}" y2="${Y(0)}" stroke="#C9CED8"/>
      <path d="${line(mg, YM)}" fill="none" stroke="#D9A93E" stroke-width="1.6" stroke-dasharray="5 3"/>${dots(mg, YM, '#D9A93E', 'net margin', v => (v * 100).toFixed(1) + '%')}
      <path d="${line(rows.map(x => x.r), Y)}" fill="none" stroke="#1E8E3E" stroke-width="2.2"/>${dots(rows.map(x => x.r), Y, '#1E8E3E', 'revenue', fmtB)}
      <path d="${line(rows.map(x => x.n), Y)}" fill="none" stroke="#16223D" stroke-width="2.2"/>${dots(rows.map(x => x.n), Y, '#16223D', 'net income', fmtB)}
      ${endLbl(last.r, Y, '#1E8E3E', fmtB(last.r), -8)}${endLbl(last.n, Y, '#16223D', fmtB(last.n), nPos ? 16 : -8)}${xl}</svg>` };
  }
  function gaugeSvg(sc) {
    const x = Math.max(-1, Math.min(1, (sc - 50) / 50)), ang = Math.PI * (1 - (x + 1) / 2), cx = 60, cy = 58, r = 46;
    const arc = (a0, a1, col) => { const p0 = [cx + r * Math.cos(a0), cy - r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)]; return `<path d="M${p0} A${r},${r} 0 0,1 ${p1}" stroke="${col}" stroke-width="12" fill="none"/>`; };
    return `<svg width="120" height="78" viewBox="0 0 120 78">${arc(Math.PI, Math.PI * 0.62, '#C5221F')}${arc(Math.PI * 0.62, Math.PI * 0.38, '#BFC5D0')}${arc(Math.PI * 0.38, 0, '#0F9D58')}
      <line x1="${cx}" y1="${cy}" x2="${cx + (r - 6) * Math.cos(ang)}" y2="${cy - (r - 6) * Math.sin(ang)}" stroke="#E25D2B" stroke-width="3"/><circle cx="${cx}" cy="${cy}" r="5" fill="#1F3BB3"/>
      <text x="${cx}" y="76" text-anchor="middle" font-size="12" font-weight="800" fill="#16223D">${sc}/100</text></svg>`;
  }
}
})();
