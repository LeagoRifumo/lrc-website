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
  const top = (name, word, score, tally, up, dn, eq, wu, wd, we) => `<div class="mc-top"><div class="mc-t1"><b>${esc(name)}</b><span class="mc-w" style="color:${score >= 55 ? '#5ED39A' : score <= 45 ? '#F08A7E' : '#E9E3D4'}">${esc(word)}</span><span class="mc-tl">score ${esc(tally)}</span></div>
    <div class="mc-meter"><i style="left:${Math.max(0, Math.min(100, score))}%"></i></div><div class="mc-t2"><span class="up">▲ ${up} ${wu}</span><span class="dn">▼ ${dn} ${wd}</span><span>= ${eq} ${we}</span></div></div>`;
  const gauge = (score, label, sub) => {
    const s = Math.max(0, Math.min(100, score)), a = Math.PI * (1 - s / 100), x = 60 + 46 * Math.cos(a), y = 62 - 46 * Math.sin(a);
    const seg = (f, t, c) => { const a1 = Math.PI * (1 - f / 100), a2 = Math.PI * (1 - t / 100); return `<path d="M${60 + 50 * Math.cos(a1)} ${62 - 50 * Math.sin(a1)} A50 50 0 0 1 ${60 + 50 * Math.cos(a2)} ${62 - 50 * Math.sin(a2)}" stroke="${c}" stroke-width="10" fill="none"/>`; };
    return `<div class="mc-g"><svg viewBox="0 0 120 72" aria-hidden="true">${seg(0, 35, '#B3261E')}${seg(35, 45, '#D9653B')}${seg(45, 55, '#9AA1B2')}${seg(55, 65, '#2FBF71')}${seg(65, 100, '#1E8E5A')}<line x1="60" y1="62" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="62" r="5" fill="#fff"/></svg><b>${esc(label)}</b><span>${esc(sub)}</span></div>`;
  };

  /* ---------- 0. economic data scorecard (data/macro.json, kept current by the LRC Macro Desk) ---------- */
  get('macro.json').then(M => {
    const num = (v, u) => !ok(v) ? '—' : u === '%' ? Number(v).toFixed(Math.abs(v * 10 - Math.round(v * 10)) > 1e-6 ? 2 : 1) + '%' : u === 'k' ? Math.round(v).toLocaleString('en-ZA') + 'k' : u === 'm' ? Number(v).toFixed(2) + 'm' : u === 'R bn' ? 'R' + Number(v).toFixed(1) + 'bn' : Number(v).toFixed(1);
    const day = d => { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }); } catch (e) { return d; } };
    const score = it => {
      if (!ok(it.actual)) return null;
      const base = ok(it.forecast) ? it.forecast : ok(it.previous) ? it.previous : null; if (base === null) return null;
      const diff = it.actual - base, s = Math.abs(diff) < it.threshold ? 0 : Math.sign(diff) * (it.better === 'lower' ? -1 : 1);
      return { diff, s, vs: ok(it.forecast) ? 'forecast' : 'previous', label: s > 0 ? 'Bullish' : s < 0 ? 'Bearish' : 'Neutral' };
    };
    const card = (c) => {
      const C = M.countries[c], its = C.items.map(it => ({ it, k: score(it) })), done = its.filter(x => x.k);
      const sum = done.reduce((a, x) => a + x.k.s, 0), sc = done.length ? 50 + 50 * sum / done.length : 50;
      const w = sc >= 65 ? 'Strong data' : sc >= 55 ? 'Better than expected' : sc > 45 ? 'In line / mixed' : sc > 35 ? 'Softer than expected' : 'Weak data';
      return `<div class="mc-card compact">${top(C.name, done.length ? w : 'Waiting for data', sc, `${sum >= 0 ? '+' : ''}${sum} of ${done.length}`, done.filter(x => x.k.s > 0).length, done.filter(x => x.k.s < 0).length, done.filter(x => x.k.s === 0).length, 'better', 'worse', 'in line')}
        <div class="tbl-wrap"><table class="mc-tbl eco"><thead><tr><th>Indicator</th><th class="n">Actual</th><th class="n">Fcst</th><th class="n">Prev</th><th class="n">Surprise</th><th>Shares</th></tr></thead><tbody>
        ${its.map(({ it, k }) => `<tr title="${esc((it.better === 'lower' ? 'Lower' : 'Higher') + ' is better for shares. Surprise counts when it is at least ' + it.threshold + (it.unit === '%' ? ' percentage points' : ' ' + it.unit) + '.')}"><td class="nm" title="${esc(it.name + (it.period ? ' — ' + it.period : '') + (it.release_date ? ' · released ' + day(it.release_date) : '') + (it.next_release ? ' · next release ' + day(it.next_release) : ''))}">${it.url ? `<a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.name)}</a>` : esc(it.name)} <small>${esc(it.period || '')}</small></td>
          <td class="n"><b>${num(it.actual, it.unit)}</b></td><td class="n">${num(it.forecast, it.unit)}</td><td class="n">${num(it.previous, it.unit)}</td>
          <td class="n">${k ? `<span class="${k.s > 0 ? 'up' : k.s < 0 ? 'dn' : ''}" title="vs ${k.vs}">${k.diff >= 0 ? '+' : '−'}${num(Math.abs(k.diff), it.unit === '%' ? 'pt' : it.unit)}${it.unit === '%' ? 'pt' : ''}${k.vs === 'previous' ? '*' : ''}</span>` : '—'}</td>
          <td>${k ? `<span class="mc-i ${k.s > 0 ? 'bull' : k.s < 0 ? 'bear' : 'neu'}">${k.label}</span>` : '<span class="mc-i neu">—</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
    };
    $('secEco').innerHTML = `<div class="mc-grid">${card('SA')}${card('US')}</div>
      <p class="src-note">${M.generated ? 'Updated ' + new Date(M.generated).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' SAST · ' : ''}${esc(M.note || '')} Figures from Stats SA, SARB, BLS, BEA, ISM and other official releases (tap an indicator for its source); forecasts are the market consensus before the release. * = compared with the previous figure (no forecast published). ${esc(M.method || '')} Educational, not a forecast.</p>`;
  }).catch(() => { $('secEco').innerHTML = '<p class="muted-load">Economic data could not be loaded right now.</p>'; });

  Promise.all([get('dashboards/live.json').catch(() => null), get('scan/etfs.json').catch(() => null), get('scan/sectors.json').catch(() => null)]).then(([L, E, S]) => {
    /* ---------- 1. country macro scores ---------- */
    const rows = L ? L.groups.flatMap(g => g.rows) : [];
    const scored = rows.map(r => ({ r, i: impact(r) })).filter(x => x.i);
    const country = c => { const xs = scored.filter(x => x.i.c.includes(c)); const sum = xs.reduce((a, x) => a + x.i.s, 0); return { xs, sum, n: xs.length, score: xs.length ? 50 + 50 * sum / xs.length : 50, bull: xs.filter(x => x.i.s > 0).length, bear: xs.filter(x => x.i.s < 0).length }; };
    const word = sc => sc >= 65 ? 'Supportive' : sc >= 55 ? 'Leaning positive' : sc > 45 ? 'Mixed' : sc > 35 ? 'Leaning negative' : 'Headwind';
    const card = (c, name, flag) => { const k = country(c); return `<div class="mc-card compact">${top(name, word(k.score), k.score, `${k.sum >= 0 ? '+' : ''}${k.sum} of ${k.n}`, k.bull, k.bear, k.n - k.bull - k.bear, 'bullish', 'bearish', 'neutral')}
      <table class="mc-tbl eco"><thead><tr><th>Indicator</th><th class="n">Latest</th><th class="n">Week ago</th><th class="n">Change</th><th>Shares</th></tr></thead><tbody>
      ${k.xs.map(({ r, i }) => `<tr title="${esc(i.why)}"><td class="nm">${esc(r.name)} <small>${esc(r.as_of || '')}</small></td><td class="n"><b>${fmtLvl(r.latest, r.unit)}</b></td><td class="n">${fmtLvl(r.week_ago, r.unit)}</td><td class="n">${i.chTxt}</td><td><span class="mc-i ${i.s > 0 ? 'bull' : i.s < 0 ? 'bear' : 'neu'}">${i.label}</span></td></tr>`).join('')}</tbody></table></div>`; };
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
        <div class="etf-grid">${list.map(r => `<div class="etf-c clk" data-etf="${esc(r.t)}" role="button" tabindex="0" title="Open the LRC analyst view"><div class="etf-h"><div><b>${esc(r.n)}</b><small>${esc(r.t.replace('.JO', ''))} · ${esc(r.full || '')}</small></div><span class="pill ${gcls(r.v)}">${esc(grade(r.v))}</span></div>
          <div class="etf-s"><i><i style="width:${r.score ?? 0}%;background:${gcol(r.score)}"></i></i><b>${r.score ?? '—'}</b></div>
          <div class="etf-p">${[['1 month', r.p1m], ['3 months', r.p3m], ['This year', r.ytd], ['1 year', r.p1y]].map(([k, v]) => `<span>${k}<b class="${(v ?? 0) >= 0 ? 'up' : 'dn'}">${pc(v)}</b></span>`).join('')}</div>
          <p class="etf-n">Trend: <b>${TR[(r.tp || {}).trend] || '—'}</b> · ${r.setup ? 'Chart: <b>' + esc(r.setup) + '</b> · ' : ''}RSI ${ok(r.rsi) ? Math.round(r.rsi) : '—'}</p><span class="etf-more">${r.hold && r.hold.length ? 'Top holdings · ' : ''}Analyst view ›</span></div>`).join('') || '<p class="muted-load">No ETFs in this group for this market.</p>'}</div>
        <p class="src-note">Scored 0–100 on price trend, momentum against the market, chart setup and stretch — the same technical rules as the LRC Stock Scanner. <b>Tap any ETF</b> for its top holdings and the LRC analyst view: why it has this grade, the outlook and what we would do. ETFs let you trade a whole index, sector or commodity in one share. Educational, not personal advice.</p>`;
      $('secEtf').querySelectorAll('#etfM button').forEach(b => b.onclick = () => { mkt = b.dataset.v; store.set('lrc_mkt', mkt); grp = 'Broad market'; etf(); sec(); });
      $('secEtf').querySelectorAll('#etfG button').forEach(b => b.onclick = () => { grp = b.dataset.g; etf(); });
      $('secEtf').querySelectorAll('[data-etf]').forEach(c => { const go = () => openEtf(E.rows.find(x => x.t === c.dataset.etf), E); c.onclick = go; c.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } }; });
    };


    /* ---------- 2b. ETF analyst view (click a card): top holdings, why the grade, outlook, LRC view ---------- */
    const SAFE = window.LRC_SAFE === true;
    const CUR = c => c === 'ZAR' ? 'R' : '$';
    const px = (v, c) => ok(v) ? CUR(c) + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    const dist = (a, b) => ok(a) && ok(b) && b ? pc(a / b - 1) : '—';
    const SW = { technology: 'Technology', financial_services: 'Financials', healthcare: 'Health care', consumer_cyclical: 'Consumer discretionary', consumer_defensive: 'Consumer staples', communication_services: 'Communication', industrials: 'Industrials', energy: 'Energy', basic_materials: 'Materials', realestate: 'Real estate', utilities: 'Utilities' };
    const analyse = r => {
      const tp = r.tp || {}, c = r.cur, p = r.px, rsi = ok(r.rsi) ? Math.round(r.rsi) : null;
      const why = [];
      const T = { 2: [1, `<b>Strong uptrend.</b> Price ${px(p, c)} is above its 50-day (${px(r.sma50, c)}) and 200-day (${px(r.sma200, c)}) averages, and the 200-day is rising.`],
        1: [1, `<b>Long-term trend up.</b> Price is above its 200-day average (${px(r.sma200, c)}), but the short-term trend is not fully lined up.`],
        '-1': [-1, `<b>Long-term trend down.</b> Price is below its 200-day average (${px(r.sma200, c)}).`],
        '-2': [-1, `<b>Strong downtrend.</b> Price is below both averages (50-day ${px(r.sma50, c)}, 200-day ${px(r.sma200, c)}) and the 200-day is falling.`] };
      if (T[tp.trend]) why.push(T[tp.trend]);
      const M = { 2: [1, `<b>Beating the market</b> by a wide margin over 6 months (${pc(r.rs)} relative).`], 1: [1, `<b>Slightly ahead of the market</b> over 6 months (${pc(r.rs)}).`],
        '-1': [-1, `<b>Lagging the market</b> over 6 months (${pc(r.rs)}).`], '-2': [-1, `<b>Lagging the market badly</b> over 6 months (${pc(r.rs)}).`] };
      if (M[tp.momentum]) why.push(M[tp.momentum]);
      const S = { Breakout: [1, `<b>Breakout:</b> price has just cleared resistance${ok(r.lvl) ? ' at ' + px(r.lvl, c) : ''}.`], Retest: [1, `<b>Retest:</b> pulling back to support${ok(r.lvl) ? ' near ' + px(r.lvl, c) : ''} and holding, a classic entry area.`],
        'Near breakout': [1, `<b>Near a breakout:</b> pressing against resistance${ok(r.lvl) ? ' at ' + px(r.lvl, c) : ''}.`], Breakdown: [-1, `<b>Breakdown:</b> price has fallen through support${ok(r.lvl) ? ' at ' + px(r.lvl, c) : ''}.`],
        'Failed retest': [-1, `<b>Failed retest:</b> bounced into old support (now resistance)${ok(r.lvl) ? ' near ' + px(r.lvl, c) : ''} and was rejected.`] };
      why.push(S[r.setup] || [0, '<b>No clear chart setup</b> right now: no breakout or retest to act on.']);
      why.push(tp.extension < 0 ? [-1, `<b>Stretched:</b> RSI ${rsi ?? '—'} and well above its short-term average. Due a pause or pullback.`] : tp.extension > 0 ? [1, `<b>Oversold:</b> RSI ${rsi ?? '—'}. Room for a bounce.`] : [0, `<b>Not stretched:</b> RSI ${rsi ?? '—'}.`]);
      if (tp.volume) why.push(tp.volume > 0 ? [1, '<b>Buyers in control:</b> more volume on up days than down days.'] : [-1, '<b>Sellers in control:</b> more volume on down days than up days.']);
      const up = (tp.trend ?? 0) >= 1 && r.score >= 55, dn = (tp.trend ?? 0) <= -1 && r.score < 45;
      const lvlUp = [r.res, r.hi52].filter(ok), lvlDn = [r.sup, r.lo52].filter(ok);
      const outlook = up ? { k: 'Upside', cls: 'up', txt: `The trend and momentum point higher. Next resistance ${px(r.res ?? r.hi52, c)} (${dist(r.res ?? r.hi52, p)}), 52-week high ${px(r.hi52, c)} (${dist(r.hi52, p)}).` }
        : dn ? { k: 'Downside', cls: 'dn', txt: `The trend points lower. Next support ${px(r.sup ?? r.lo52, c)} (${dist(r.sup ?? r.lo52, p)}), 52-week low ${px(r.lo52, c)} (${dist(r.lo52, p)}).` }
        : { k: 'Range-bound', cls: 'mid', txt: `No clear direction. Expect trading between support ${px(r.sup ?? r.lo52, c)} and resistance ${px(r.res ?? r.hi52, c)} until one breaks.` };
      // what we would do
      const v = r.v, ext = tp.extension < 0;
      let rec, act;
      if (v === 'STRONG BUY' || v === 'BUY') {
        if (ext) { rec = SAFE ? 'Positive, but wait for a dip' : 'BUY ON A PULLBACK'; act = `The trend is strong but the price is stretched. Better to wait for a pullback toward the 20-day (${px(r.sma20, c)}) or 50-day average (${px(r.sma50, c)}) than to chase it.`; }
        else if (v === 'STRONG BUY') { rec = SAFE ? 'Positive: top scoring' : 'BUY'; act = `Trend, momentum and setup all line up. ${r.setup === 'Retest' ? 'The retest gives a sensible entry area near support.' : r.setup === 'Breakout' ? 'Breakouts are best bought on a small pullback that holds the breakout level.' : 'Add on dips toward the 50-day average.'}`; }
        else { rec = SAFE ? 'Positive' : 'ACCUMULATE'; act = 'The picture is positive but not perfect. Build a position gradually rather than all at once.'; }
      } else if (v === 'HOLD') {
        if ((tp.trend ?? 0) >= 1) { rec = SAFE ? 'Neutral: wait for a breakout' : 'HOLD'; act = `Long-term trend still up, but no edge right now. If you own it, keep it; for new money wait for a break above ${px(r.res ?? r.hi52, c)}.`; }
        else { rec = SAFE ? 'Neutral to cautious' : 'HOLD (no new money)'; act = `Below its 200-day average. Wait until it reclaims ${px(r.sma200, c)} before adding.`; }
      } else { rec = SAFE ? 'Negative: weak trend' : 'AVOID / REDUCE'; act = `Downtrend and weak momentum. Avoid new positions; holders should consider reducing. Revisit only if it climbs back above the 200-day (${px(r.sma200, c)}).`; }
      const change = up ? `A close below the 200-day average (${px(r.sma200, c)}) would break the uptrend and change our view.` : dn ? `A close back above the 200-day average (${px(r.sma200, c)}) would end the downtrend.` : `A break above ${px(r.res ?? r.hi52, c)} turns us positive; a break below ${px(r.sup ?? r.lo52, c)} turns us negative.`;
      // look-through: what the companies inside say
      let lt = null;
      if (ok(r.lt)) {
        const w = r.lt >= 60 ? 'strong' : r.lt >= 45 ? 'average' : 'weak';
        const agree = r.score >= 60 && r.lt >= 60 ? 'The chart and the companies inside agree: a well-supported rating.'
          : r.score >= 60 && r.lt < 50 ? 'The chart is ahead of the companies inside: the rally may be fragile.'
          : r.score < 40 && r.lt >= 60 ? 'Good companies in a weak chart: watch for the trend to turn.'
          : r.score < 40 && r.lt < 45 ? 'Weak chart and weak companies: no reason to step in yet.' : 'The companies inside are a mixed picture.';
        lt = `Its top ${r.lt_n} holdings we cover average an LRC company score of <b>${r.lt}</b> (${w})${ok(r.lt_strong) ? `; ${Math.round(r.lt_strong * 100)}% of that weight is in companies graded ${grade('BUY')} or better` : ''}${ok(r.lt_weak) && r.lt_weak > 0 ? `, ${Math.round(r.lt_weak * 100)}% in ${grade('SELL')} or worse` : ''}. ${agree}`;
      }
      return { why, outlook, rec, act, change, lt };
    };
    let ewrap = null;
    const closeEtf = () => { if (ewrap) { ewrap.classList.remove('open'); document.documentElement.classList.remove('sn-lock'); } };
    const openEtf = (r) => {
      if (!r) return;
      if (!ewrap) {
        ewrap = document.createElement('div'); ewrap.className = 'sn-wrap etf-wrap';
        ewrap.innerHTML = '<div class="sn-back"></div><aside class="sn" role="dialog" aria-modal="true" aria-label="ETF analyst view"><div class="sn-in" id="etfIn"></div></aside>';
        document.body.appendChild(ewrap);
        ewrap.querySelector('.sn-back').onclick = closeEtf;
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEtf(); });
      }
      const A = analyse(r), c = r.cur, nt = r.note || {}, pl = r.plan;
      const pos = A.why.filter(x => x[0] > 0), neg = A.why.filter(x => x[0] < 0), neu = A.why.filter(x => x[0] === 0);
      const holdTbl = r.hold && r.hold.length ? `<div class="tbl-wrap"><table class="mc-tbl ev-h"><thead><tr><th>Company</th>${r.hold.some(h => ok(h.w)) ? '<th class="n">Weight</th>' : ''}<th>LRC grade</th><th class="n">Score</th></tr></thead><tbody>
        ${r.hold.map(h => `<tr><td>${h.in ? `<a href="stock.html?t=${encodeURIComponent(h.s)}" data-snap="${esc(h.s)}">${esc(h.n || h.s)}</a>` : esc(h.n || h.s)} <small>${esc(String(h.s || '').replace('.JO', ''))}</small></td>${r.hold.some(x => ok(x.w)) ? `<td class="n">${ok(h.w) ? (h.w * 100).toFixed(1) + '%' : '—'}</td>` : ''}
          <td>${h.v ? `<span class="pill ${gcls(h.v)}">${esc(grade(h.v))}</span>` : '<span class="muted">not covered</span>'}</td><td class="n">${ok(h.sc) ? `<b style="color:${gcol(h.sc)}">${h.sc}</b>` : '—'}</td></tr>`).join('')}</tbody></table></div>
        <p class="src-note">${r.hsrc === 'proxy' ? `${esc(r.hlabel || '')}: an LRC estimate from our scanner, ranked by market value, not the ETF's official list. Check the issuer factsheet for exact holdings and weights.` : String(r.hsrc || '').startsWith('mirror:') ? `This ETF tracks the same index as ${esc(r.hsrc.slice(7))}; holdings and weights shown are that index's.` : 'Top holdings and weights from the fund issuer (via Yahoo Finance).'} Tap a company for its snapshot.</p>
        ${r.sw && r.sw.length ? `<p class="ev-sw">Biggest sectors: ${r.sw.map(x => `<span>${esc(SW[x.k] || x.k)} <b>${(x.w * 100).toFixed(0)}%</b></span>`).join('')}</p>` : ''}`
        : r.kind === 'commodity' || r.kind === 'bond' ? `<p class="ev-p">${r.kind === 'bond' ? 'A bond ETF: it holds government or corporate bonds, not company shares.' : 'A commodity ETF: it holds the metal or futures contracts, not company shares.'} ${esc(nt.what || '')}</p>`
        : '<p class="ev-p muted">Holdings are not available for this ETF yet. Check the issuer factsheet.</p>';
      const planBox = !SAFE && pl ? `<div class="ev-plan"><span>Trade plan (${esc(pl.side)})</span><b>Entry ${px(pl.entry, c)}</b><b>Stop ${px(pl.stop, c)}</b><b>Target range ${px(pl.t1, c)}–${px(pl.t2, c)}</b><small>Risk ${pc(pl.risk_pct)} to the stop · size so this risk is at most 1% of your account</small></div>` : '';
      $('etfIn').innerHTML = `<div class="sn-top"><div><span class="sn-tk">${esc(r.t.replace('.JO', ''))}</span><span class="sn-mk">${r.m === 'JSE' ? 'JSE' : 'New York'} · ${esc(r.g === 'Broad market' ? 'Market index' : r.g)}</span>
          <h2>${esc(r.n)}</h2><small>${esc(r.full || '')}</small></div>
          <div class="sn-px"><b>${px(r.px, c)}</b><span class="${(r.chg ?? 0) >= 0 ? 'up' : 'dn'}">${pc(r.chg)} today</span><small>1 month ${pc(r.p1m)} · this year ${pc(r.ytd)}</small></div><button class="sn-x" aria-label="Close">×</button></div>
        <div class="ev-head"><div class="ev-score"><span class="pill ${gcls(r.v)}">${esc(grade(r.v))}</span><b style="color:${gcol(r.score)}">${r.score}</b><small>LRC ETF score / 100</small></div>
          <div class="ev-rec ${A.outlook.cls}"><span>LRC VIEW</span><b>${esc(A.rec)}</b><p>${A.act}</p></div>
          <div class="ev-out ${A.outlook.cls}"><span>OUTLOOK</span><b>${A.outlook.k}</b><p>${A.outlook.txt}</p></div></div>
        ${planBox}
        <h3 class="ev-h3">What it is</h3><p class="ev-p">${esc(nt.what || r.full || '')}${nt.drivers ? ` <b>What moves it:</b> ${esc(nt.drivers)}` : ''}</p>
        <h3 class="ev-h3">Why this grade</h3>
        <div class="ev-why">${pos.length ? `<div><h4 class="up">▲ Supporting the grade</h4><ul>${pos.map(x => `<li>${x[1]}</li>`).join('')}</ul></div>` : ''}${neg.length ? `<div><h4 class="dn">▼ Holding it back</h4><ul>${neg.map(x => `<li>${x[1]}</li>`).join('')}</ul></div>` : ''}${neu.length ? `<div><h4>= Neutral</h4><ul>${neu.map(x => `<li>${x[1]}</li>`).join('')}</ul></div>` : ''}</div>
        ${A.lt ? `<p class="ev-p ev-lt"><b>Look-through:</b> ${A.lt}</p>` : ''}
        <h3 class="ev-h3">${r.kind === 'equity' ? 'Major companies in this ETF' : 'What it holds'}</h3>${holdTbl}
        <h3 class="ev-h3">Risks and what would change our view</h3><ul class="ev-ul">${nt.risk ? `<li><b>Key risk:</b> ${esc(nt.risk)}</li>` : ''}<li>${A.change}</li></ul>
        <p class="src-note">LRC analyst view, built from the ETF's price trend, momentum against the market, chart setup and stretch (the LRC Scanner rules) and the LRC scores of its top holdings. Updated twice a day with the scanner. ${SAFE ? 'Shown as grades, without entry, stop or target prices. ' : ''}Educational research, not personal financial advice. ETFs can fall in value; never risk money you cannot afford to lose.</p>`;
      $('etfIn').querySelector('.sn-x').onclick = closeEtf;
      ewrap.querySelector('.sn').scrollTop = 0;
      document.documentElement.classList.add('sn-lock'); requestAnimationFrame(() => ewrap.classList.add('open'));
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
