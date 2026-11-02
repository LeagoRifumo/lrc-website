/* LRC Sectors & Macro — country macro scores (South Africa vs United States), index & ETF scores for retail traders,
   strongest / weakest sectors per market, and the economic calendar. Reads the live dashboard (data/dashboards/live.json),
   the scanner's ETF and sector files (data/scan/etfs.json, data/scan/sectors.json). No new data is invented here:
   the macro "impact" is a fixed rule per indicator, shown on the page. */
(() => {
  if (!document.getElementById('secMacro')) return;
  const D = window.LRC_DATA || 'data/';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = x => x !== null && x !== undefined && x !== '' && isFinite(x);
  const pc = (x, d = 1) => ok(x) && Math.abs(x) <= 3 ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%' : '—';
  const get = f => fetch(D + f + '?v=' + Math.floor(Date.now() / 3e5)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const GR = { 'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring' };
  const grade = v => !v ? '—' : window.LRC_SAFE === true ? (GR[v] || v) : v;
  const gcls = v => 'g-' + ({ 'STRONG BUY': 'top', 'BUY': 'strong', 'HOLD': 'avg', 'SELL': 'weak', 'STRONG SELL': 'low' }[v] || 'avg');
  const gcol = s => !ok(s) ? '#5C6478' : s >= 75 ? '#1E8E5A' : s >= 60 ? '#2FBF71' : s >= 40 ? '#C9A227' : s >= 25 ? '#D9653B' : '#B3261E';
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  /* Macro rules: which direction is good for shares, the smallest move that counts, and which country it matters for.
     kind 'pct' = % change; 'pts' = change in percentage points (rates, inflation). */
  const RULES = {
    'JSE All Share (J203)': { good: +1, min: 0.005, kind: 'pct', c: ['SA'], why: 'Share prices rising (market momentum)' },
    'JSE Top 40 (J200)': { good: +1, min: 0.005, kind: 'pct', c: ['SA'], why: 'Large caps rising' },
    'USD / ZAR': { good: -1, min: 0.005, kind: 'pct', c: ['SA'], why: 'A stronger rand (fewer rand per dollar) cools inflation and draws foreign buyers' },
    'EUR / ZAR': { good: -1, min: 0.005, kind: 'pct', c: ['SA'], why: 'A stronger rand against the euro' },
    'GBP / ZAR': { good: -1, min: 0.005, kind: 'pct', c: ['SA'], why: 'A stronger rand against the pound' },
    'SA repo rate': { good: -1, min: 0.0001, kind: 'pts', c: ['SA'], why: 'Lower interest rates help borrowers, spending and share valuations' },
    'SA 10-year government bond': { good: -1, min: 0.05, kind: 'pts', c: ['SA'], why: 'Lower bond yields make shares worth more' },
    'SA CPI inflation (y/y)': { good: -1, min: 0.05, kind: 'pts', c: ['SA'], why: 'Falling inflation makes rate cuts more likely' },
    'S&P 500': { good: +1, min: 0.005, kind: 'pct', c: ['US'], why: 'Share prices rising (market momentum)' },
    'Nasdaq Composite': { good: +1, min: 0.005, kind: 'pct', c: ['US'], why: 'Tech shares rising' },
    'MSCI Emerging Markets': { good: +1, min: 0.005, kind: 'pct', c: ['SA'], why: 'Investors buying emerging markets, which includes South Africa' },
    'US Fed funds rate (upper)': { good: -1, min: 0.0001, kind: 'pts', c: ['US'], why: 'Lower interest rates support share valuations' },
    'US 10-year Treasury': { good: -1, min: 0.05, kind: 'pts', c: ['US', 'SA'], why: 'Lower US yields help shares everywhere, including emerging markets' },
    'US CPI inflation (y/y)': { good: -1, min: 0.05, kind: 'pts', c: ['US'], why: 'Falling inflation makes rate cuts more likely' },
    'Gold': { good: +1, min: 0.01, kind: 'pct', c: ['SA'], why: 'A higher gold price lifts JSE gold miners' },
    'Platinum': { good: +1, min: 0.01, kind: 'pct', c: ['SA'], why: 'A higher platinum price lifts JSE PGM miners' },
    'Brent crude': { good: -1, min: 0.02, kind: 'pct', c: ['SA', 'US'], why: 'Cheaper oil cuts fuel costs and inflation (South Africa imports its oil)' },
    'Copper': { good: +1, min: 0.01, kind: 'pct', c: ['SA', 'US'], why: 'Rising copper usually signals stronger global growth' },
    'Iron ore': { good: +1, min: 0.02, kind: 'pct', c: ['SA'], why: 'A higher iron ore price lifts Kumba and the big miners' }
  };
  const fmtLvl = (v, unit) => !ok(v) ? '—' : unit === '%' ? Number(v).toFixed(2) + '%' : unit === 'index' ? Math.round(v).toLocaleString('en-ZA') : Number(v).toLocaleString('en-ZA', { maximumFractionDigits: v < 50 ? 4 : 2 });
  const impact = row => {
    const R = RULES[row.name]; if (!R || !ok(row.latest) || !ok(row.week_ago)) return null;
    const ch = R.kind === 'pct' ? row.latest / row.week_ago - 1 : row.latest - row.week_ago;
    const s = Math.abs(ch) < R.min ? 0 : Math.sign(ch) * R.good;
    return { ...R, ch, s, label: s > 0 ? 'Bullish' : s < 0 ? 'Bearish' : 'Neutral', chTxt: R.kind === 'pct' ? pc(ch) : (ch >= 0 ? '+' : '−') + Math.abs(ch * 100).toFixed(0) + 'bp' };
  };
  const gauge = (score, label, sub) => {
    const s = Math.max(0, Math.min(100, score)), a = Math.PI * (1 - s / 100), x = 60 + 46 * Math.cos(a), y = 62 - 46 * Math.sin(a);
    const seg = (f, t, c) => { const a1 = Math.PI * (1 - f / 100), a2 = Math.PI * (1 - t / 100); return `<path d="M${60 + 50 * Math.cos(a1)} ${62 - 50 * Math.sin(a1)} A50 50 0 0 1 ${60 + 50 * Math.cos(a2)} ${62 - 50 * Math.sin(a2)}" stroke="${c}" stroke-width="10" fill="none"/>`; };
    return `<div class="mc-g"><svg viewBox="0 0 120 72" aria-hidden="true">${seg(0, 35, '#B3261E')}${seg(35, 45, '#D9653B')}${seg(45, 55, '#9AA1B2')}${seg(55, 65, '#2FBF71')}${seg(65, 100, '#1E8E5A')}<line x1="60" y1="62" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="#fff"/></svg><b>${esc(label)}</b><span>${esc(sub)}</span></div>`;
  };

  Promise.all([get('dashboards/live.json').catch(() => null), get('scan/etfs.json').catch(() => null), get('scan/sectors.json').catch(() => null)]).then(([L, E, S]) => {
    /* ---------- 1. country macro scores ---------- */
    const rows = L ? L.groups.flatMap(g => g.rows) : [];
    const scored = rows.map(r => ({ r, i: impact(r) })).filter(x => x.i);
    const country = c => { const xs = scored.filter(x => x.i.c.includes(c)); const sum = xs.reduce((a, x) => a + x.i.s, 0); return { xs, sum, n: xs.length, score: xs.length ? 50 + 50 * sum / xs.length : 50, bull: xs.filter(x => x.i.s > 0).length, bear: xs.filter(x => x.i.s < 0).length }; };
    const word = sc => sc >= 65 ? 'Supportive' : sc >= 55 ? 'Leaning positive' : sc > 45 ? 'Mixed' : sc > 35 ? 'Leaning negative' : 'Headwind';
    const card = (c, name, flag) => { const k = country(c); return `<div class="mc-card"><div class="mc-head">${gauge(k.score, word(k.score), `${flag} ${name} · macro score ${k.sum >= 0 ? '+' : ''}${k.sum} of ${k.n}`)}
        <p class="mc-sum"><b class="up">${k.bull} bullish</b> · <b class="dn">${k.bear} bearish</b> · ${k.n - k.bull - k.bear} neutral this week</p></div>
      <table class="mc-tbl"><thead><tr><th>Indicator</th><th class="n">Latest</th><th class="n">Week ago</th><th class="n">Change</th><th>For shares</th></tr></thead><tbody>
      ${k.xs.map(({ r, i }) => `<tr title="${esc(i.why)}"><td>${esc(r.name)}<small>${esc(r.as_of || '')}</small></td><td class="n"><b>${fmtLvl(r.latest, r.unit)}</b></td><td class="n">${fmtLvl(r.week_ago, r.unit)}</td><td class="n">${i.chTxt}</td><td><span class="mc-i ${i.s > 0 ? 'bull' : i.s < 0 ? 'bear' : 'neu'}">${i.label}</span></td></tr>`).join('')}</tbody></table></div>`; };
    $('secMacro').innerHTML = L ? `<div class="mc-grid">${card('SA', 'South Africa', '🇿🇦')}${card('US', 'United States', '🇺🇸')}</div>
      <p class="src-note">Week-on-week moves from the LRC Market Dashboard (updated ${new Date(L.generated).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}). Each indicator scores +1 (bullish for shares), 0 or −1 by a fixed rule — hover a row for the reason. Rates and inflation only change when a new figure is released. Educational, not a forecast.</p>`
      : '<p class="muted-load">The macro data could not be loaded right now.</p>';

    /* ---------- 2. index & ETF scores ---------- */
    let mkt = store.get('lrc_mkt', 'JSE') === 'US' ? 'US' : 'JSE', grp = 'Broad market';
    const GROUPS = ['Broad market', 'Sectors', 'International', 'Commodities & bonds', 'Themes'];
    const etf = () => {
      if (!E) { $('secEtf').innerHTML = '<p class="muted-load">ETF scores could not be loaded right now.</p>'; return; }
      const list = E.rows.filter(r => r.m === mkt && r.g === grp).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const TR = { 2: 'Strong up', 1: 'Up', 0: 'Flat', '-1': 'Down', '-2': 'Strong down' };
      $('secEtf').innerHTML = `<div class="sec-sw"><div class="seg" id="etfM"><button data-v="JSE" class="${mkt === 'JSE' ? 'on' : ''}">JSE ETFs</button><button data-v="US" class="${mkt === 'US' ? 'on' : ''}">New York ETFs</button></div>
        <div class="filters" id="etfG" style="margin:0">${GROUPS.filter(g => E.rows.some(r => r.m === mkt && r.g === g)).map(g => `<button class="chip-btn ${g === grp ? 'on' : ''}" data-g="${esc(g)}">${esc(g === 'Broad market' ? 'Market indices' : g)}</button>`).join('')}</div></div>
        <div class="etf-grid">${list.map(r => `<div class="etf-c"><div class="etf-h"><div><b>${esc(r.n)}</b><small>${esc(r.t.replace('.JO', ''))} · ${esc(r.full || '')}</small></div><span class="pill ${gcls(r.v)}">${esc(grade(r.v))}</span></div>
          <div class="etf-s"><i><i style="width:${r.score ?? 0}%;background:${gcol(r.score)}"></i></i><b>${r.score ?? '—'}</b></div>
          <div class="etf-p">${[['1 month', r.p1m], ['3 months', r.p3m], ['This year', r.ytd], ['1 year', r.p1y]].map(([k, v]) => `<span>${k}<b class="${(v ?? 0) >= 0 ? 'up' : 'dn'}">${pc(v)}</b></span>`).join('')}</div>
          <p class="etf-n">Trend: <b>${TR[(r.tp || {}).trend] || '—'}</b> · ${r.setup ? 'Chart: <b>' + esc(r.setup) + '</b> · ' : ''}RSI ${ok(r.rsi) ? Math.round(r.rsi) : '—'}</p></div>`).join('') || '<p class="muted-load">No ETFs in this group for this market.</p>'}</div>
        <p class="src-note">Scored 0–100 on price trend, momentum against the market, chart setup and stretch — the same technical rules as the LRC Stock Scanner. ETFs let you trade a whole index, sector or commodity in one share. Not a recommendation.</p>`;
      $('secEtf').querySelectorAll('#etfM button').forEach(b => b.onclick = () => { mkt = b.dataset.v; store.set('lrc_mkt', mkt); grp = 'Broad market'; etf(); sec(); });
      $('secEtf').querySelectorAll('#etfG button').forEach(b => b.onclick = () => { grp = b.dataset.g; etf(); });
    };

    /* ---------- 3. strongest and weakest sectors ---------- */
    const sec = () => {
      if (!S) { $('secSec').innerHTML = '<p class="muted-load">Sector scores could not be loaded right now.</p>'; return; }
      const list = S.rows.filter(r => r.m === mkt).sort((a, b) => b.score - a.score);
      const half = Math.ceil(list.length / 2), strong = list.slice(0, half), weak = list.slice(half).reverse();
      const tbl = (rs, cls, title) => `<div class="sec-col ${cls}"><h3>${title}</h3><table class="mc-tbl"><thead><tr><th>Sector</th><th class="n">Score</th><th class="n">Above 50-day</th><th>Strongest · weakest names</th></tr></thead><tbody>
        ${rs.map(r => `<tr><td><b>${esc(r.sec)}</b><small>${r.n} companies${r.etf_name ? ' · ETF ' + esc(r.etf_name) + ' ' + pc(r.etf_p1m) + ' 1m' : ''}</small></td><td class="n"><span class="sec-sc" style="background:${gcol(r.score)}">${r.score}</span></td><td class="n">${ok(r.above50) ? Math.round(r.above50 * 100) + '%' : '—'}</td>
          <td class="sec-names">${(r.top || []).map(t => `<a href="stock.html?t=${encodeURIComponent(t)}" data-snap="${esc(t)}" class="up">${esc(t.replace('.JO', ''))}</a>`).join('')}${(r.bottom || []).filter(t => !(r.top || []).includes(t)).length ? ' · ' : ''}${(r.bottom || []).filter(t => !(r.top || []).includes(t)).map(t => `<a href="stock.html?t=${encodeURIComponent(t)}" data-snap="${esc(t)}" class="dn">${esc(t.replace('.JO', ''))}</a>`).join('')}</td></tr>`).join('')}</tbody></table></div>`;
      $('secSec').innerHTML = `<p class="lead" style="margin-top:0;font-size:16px">${mkt === 'JSE' ? 'JSE' : 'New York'} sectors ranked by the average LRC Stock Scanner score of their companies. "Above 50-day" = share of the sector's companies trading above their 50-day average (breadth). Tap a company for its snapshot.</p>
        <div class="sec-two">${tbl(strong, 'strong', '▲ Strongest sectors')}${tbl(weak, 'weak', '▼ Weakest sectors')}</div>`;
    };
    etf(); sec();
    window.addEventListener('lrcmarket', e => { mkt = e.detail === 'US' ? 'US' : 'JSE'; etf(); sec(); });
  });
})();
