// Leago Rifumo Capital — site script (no libraries; runs on any host)
const $ = id => document.getElementById(id);
const fmt = (x, d = 2) => (isFinite(x) ? x.toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pct = (x, d = 1) => (isFinite(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%' : '—');
const num = id => parseFloat(($(id) || {}).value);

/* ---------- menu, year, contact form ---------- */
(() => {
  const b = $('burger'), m = $('menu');
  if (b && m) {
    b.addEventListener('click', () => b.setAttribute('aria-expanded', m.classList.toggle('open')));
    m.querySelectorAll('a').forEach(a => a.addEventListener('click', () => m.classList.remove('open')));
  }
  if ($('yr')) $('yr').textContent = new Date().getFullYear();
  const f = $('contactForm');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const v = id => $(id).value.trim();
    location.href = 'mailto:info@leagorifumocapital.co.za?subject=' + encodeURIComponent(v('f-topic') + ' — ' + v('f-name')) +
      '&body=' + encodeURIComponent(v('f-msg') + '\n\n' + v('f-name') + '\n' + v('f-email'));
  });
})();

/* ---------- research library ---------- */
/* To SELL a report: add  price: 'R199', buy: 'https://paystack.shop/pay/your-link'  to its entry below. */
const LIBRARY = [
  { t: 'Paylocity (PCTY) — initiation of coverage', tk: 'PCTY', type: 'Company report', sector: 'Technology', date: '6 Oct 2026', region: 'US',
    s: 'Payroll and HR software for US mid-sized companies: how it makes money, how it grows, four years of financials and a three-way valuation.', tags: ['HCM software', 'Valuation', '10 pages'] },
  { t: 'Wabtec (WAB) — initiation of coverage', tk: 'WAB', type: 'Company report', sector: 'Industrials', date: '6 Oct 2026', region: 'US',
    s: 'Locomotives, braking systems and rail digital: the backlog, margins, cash flow and what the share price already assumes.', tags: ['Rail', 'Backlog', '10 pages'] },
  { t: 'Weekly market dashboard — week to 9 Oct 2026', type: 'Market brief', sector: 'Macro & markets', date: '9 Oct 2026', region: 'SA & US', link: 'dashboard.html#2026-10-09',
    s: 'JSE flat on the week, the rand firmer at about R16.51/$, US shares higher and Brent above $100 — what it means for portfolios.', tags: ['JSE', 'Rand', 'S&P 500', 'Commodities'] },
  { t: 'Weekly market dashboard — week to 2 Oct 2026', type: 'Market brief', sector: 'Macro & markets', date: '2 Oct 2026', region: 'SA & US', link: 'dashboard.html#2026-10-02',
    s: 'A risk-off week for SA after the SARB raised the repo rate to 7.25%; US 10-year yields above 5% and the rand weaker.', tags: ['SARB', 'Yields', 'Rand'] },
  { t: 'Momentum vs valuation: why market leaders fail our test', type: 'Education', sector: 'Process', date: '14 Oct 2026', region: 'US',
    s: 'Our October screen found that the strongest-trending US shares were also the most expensive. Here is why a great chart is not a BUY.', tags: ['Screening', 'Discipline'] },
  { t: 'Stock analysis roadmap: investing and trading', type: 'Education', sector: 'Process', date: '7 Oct 2026', region: 'Global',
    s: 'The 13-page roadmap for students, interns and junior analysts — what to look at, and what it tells you, from first screen to exit.', tags: ['Academy', 'Roadmap', 'Beginner'] },
];
/* ---------- visitor region: rand inside South Africa, US dollars everywhere else ---------- */
window.LRCRegion = (() => {
  const K = 'lrc_cur';
  try { const q = new URLSearchParams(location.search).get('cur'); if (q && /^(ZAR|USD)$/i.test(q)) localStorage.setItem(K, q.toUpperCase()); } catch (e) { }
  const auto = () => { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; return tz === 'Africa/Johannesburg' ? 'ZAR' : tz ? 'USD' : ((navigator.languages || [navigator.language || '']).some(l => /-ZA$/i.test(l)) ? 'ZAR' : 'USD'); } catch (e) { return 'ZAR'; } };
  const cur = () => { try { return localStorage.getItem(K) || auto(); } catch (e) { return auto(); } };
  const set = c => { try { localStorage.setItem(K, c); } catch (e) { } location.reload(); };
  const isSA = () => cur() === 'ZAR';
  const localize = st => { if (!st) return st; const o = { ...st }; if (!isSA()) { o.report_price = st.report_price_usd || st.report_price; o.report_pay_link = st.report_pay_link_usd || st.report_pay_link; } return o; };
  const note = () => isSA() ? `Prices in rand (South Africa). <a href="#" data-cur="USD">Show US dollars</a>` : `Prices in US dollars (outside South Africa). <a href="#" data-cur="ZAR">Show rand</a>`;
  document.addEventListener('click', e => { const a = e.target.closest('a[data-cur]'); if (a) { e.preventDefault(); set(a.dataset.cur); } });
  return { cur, isSA, localize, note, set };
})();
const STORE_LINK = d => (window.LRC_STORE && window.LRC_STORE.report_pay_link) || `mailto:${(window.LRC_STORE && window.LRC_STORE.order_email) || 'info@leagorifumocapital.co.za'}?subject=${encodeURIComponent('Order: ' + d.t + ' — ' + ((window.LRC_STORE && window.LRC_STORE.report_price) || 'R100'))}`;
(() => {
  const lib = $('lib'); if (!lib) return;
  fetch((window.LRC_DATA || 'data/') + 'store.json?v=' + Date.now()).then(r => r.json()).then(j => { window.LRC_STORE = window.LRCRegion.localize(j); if (typeof window.__libDraw === 'function') window.__libDraw(); }).catch(() => {});
  let type = 'all';
  const draw = () => {
    const q = ($('libSearch').value || '').toLowerCase(), sec = $('libSector').value;
    const items = LIBRARY.filter(d => (type === 'all' || d.type === type) && (sec === 'all' || d.sector === sec) &&
      (!q || (d.t + ' ' + d.s + ' ' + d.tags.join(' ') + ' ' + d.sector).toLowerCase().includes(q)));
    lib.innerHTML = items.map(d => `<article class="doc"><div class="meta"><span>${d.type.toUpperCase()}</span><span>${d.date}</span></div>
      <h3>${d.t}</h3><p>${d.s}</p><div class="tags"><span>${d.sector}</span><span>${d.region}</span>${d.tags.map(x => `<span>${x}</span>`).join('')}</div>
      ${d.type === 'Company report' ? `<div style="display:flex;flex-wrap:wrap;gap:8px">${d.tk ? `<a class="btn btn-ghost" href="stock.html?t=${d.tk}">Free 1-page summary</a>` : ''}<a class="btn btn-gold" href="${STORE_LINK(d)}"${window.LRC_STORE && window.LRC_STORE.report_pay_link ? ' target="_blank" rel="noopener"' : ''}>Buy full report · ${(window.LRC_STORE && window.LRC_STORE.report_price) || 'R100'}</a></div>` : d.link ? `<a class="btn btn-gold" href="${d.link}">Open the dashboard →</a>` : d.buy ? `<a class="btn btn-gold" href="${d.buy}" target="_blank" rel="noopener">Buy the full report${d.price ? ' · ' + d.price : ''} →</a>` : `<a class="btn btn-ghost" href="mailto:info@leagorifumocapital.co.za?subject=${encodeURIComponent('Research request: ' + d.t)}">Request this ${d.type === 'Market brief' ? 'brief' : 'report'} →</a>`}</article>`).join('');
    $('libEmpty').style.display = items.length ? 'none' : 'block';
  };
  document.querySelectorAll('#libFilters .chip-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#libFilters .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); type = b.dataset.f; draw();
  }));
  window.__libDraw = draw;
  $('libSearch').addEventListener('input', draw); $('libSector').addEventListener('change', draw); draw();
})();

/* ---------- tool 1: rating checker (LRC 6-month rules) ---------- */
(() => {
  if (!$('r-price')) return;
  const run = () => {
    const p = num('r-price'), t = num('r-target'), s = num('r-score'), crit = $('r-crit').checked;
    $('r-score-v').textContent = s.toFixed(2);
    const up = t / p - 1;
    let r = 'HOLD', why;
    if (!(p > 0) || !(t > 0)) { r = '—'; why = 'Enter a share price and a target price.'; }
    else if (up <= -0.05 || s < 2.5) { r = 'SELL'; why = up <= -0.05 ? `The target is ${pct(up)} from today's price — at or below our −5% SELL line.` : `A checklist score of ${s.toFixed(2)} is below 2.5: quality is too weak, whatever the price.`; }
    else if (up >= 0.075 && s >= 3.5 && !crit) { r = 'BUY'; why = `Upside of ${pct(up)} clears the 7.5% hurdle, the score of ${s.toFixed(2)} clears 3.5, and there is no critical red flag.`; }
    else {
      const miss = [];
      if (up < 0.075) miss.push(`upside of ${pct(up)} is below the 7.5% BUY hurdle`);
      if (s < 3.5) miss.push(`the score of ${s.toFixed(2)} is below 3.5`);
      if (crit) miss.push('a critical item is flagged — that blocks a BUY until it is resolved');
      why = 'HOLD because ' + miss.join('; ') + '.';
    }
    const b = $('r-badge'); b.textContent = r; b.style.background = r === 'BUY' ? 'var(--green)' : r === 'SELL' ? '#B03A2E' : r === 'HOLD' ? '#B8862B' : '#444';
    $('r-up').textContent = pct(up); $('r-sc').textContent = s.toFixed(2);
    $('r-buy').textContent = t > 0 ? fmt(t / 1.075) : '—'; $('r-sell').textContent = t > 0 ? fmt(t / 0.95) : '—';
    $('r-why').textContent = why;
  };
  ['r-price', 'r-target', 'r-score', 'r-crit'].forEach(id => $(id).addEventListener('input', run)); run();
})();

/* ---------- tool 2: three-way valuation ---------- */
(() => {
  if (!$('v-price')) return;
  const ids = ['v-price', 'v-shares', 'v-eps', 'v-pe', 'v-fcf', 'v-g', 'v-wacc', 'v-tg', 'v-ebitda', 'v-mult', 'v-nd', 'v-w1', 'v-w2', 'v-w3'];
  const run = () => {
    const P = num('v-price'), sh = num('v-shares'), nd = num('v-nd') || 0;
    const m1 = num('v-eps') * num('v-pe');
    const g = num('v-g') / 100, w = num('v-wacc') / 100, tg = num('v-tg') / 100;
    let pv = 0, f = num('v-fcf');
    for (let y = 1; y <= 5; y++) { f *= 1 + g; pv += f / Math.pow(1 + w, y); }
    const warn = $('v-warn'); warn.style.display = 'none';
    let m2 = NaN, tvShare = NaN;
    if (w > tg) {
      const tv = f * (1 + tg) / (w - tg), pvtv = tv / Math.pow(1 + w, 5);
      m2 = (pv + pvtv - nd) / sh; tvShare = pvtv / (pv + pvtv);
    } else { warn.style.display = 'block'; warn.textContent = 'The discount rate must be higher than terminal growth — otherwise the DCF has no answer.'; }
    const m3 = (num('v-ebitda') * num('v-mult') - nd) / sh;
    const ws = [num('v-w1'), num('v-w2'), num('v-w3')].map(x => (isFinite(x) && x > 0 ? x : 0));
    const vals = [m1, m2, m3];
    let tw = 0, acc = 0; vals.forEach((v, i) => { if (isFinite(v) && ws[i] > 0) { tw += ws[i]; acc += v * ws[i]; } });
    const tgt = tw ? acc / tw : NaN, up = tgt / P - 1;
    $('v-target').textContent = fmt(tgt); $('v-up').textContent = isFinite(up) ? pct(up) + ' vs today\'s price' : '—';
    $('v-up').style.color = up >= 0 ? '#5ED39A' : '#F08A7E';
    $('v-m1').textContent = fmt(m1); $('v-m2').textContent = fmt(m2); $('v-m3').textContent = fmt(m3);
    $('v-tv').textContent = isFinite(tvShare) ? (tvShare * 100).toFixed(0) + '%' : '—';
    const cols = ['#F2CE72', '#9C7426', '#D9A93E'];
    $('v-bar').innerHTML = vals.map((v, i) => (isFinite(v) && ws[i] > 0 ? `<i style="width:${(ws[i] / tw * 100).toFixed(1)}%;background:${cols[i]}" title="weight"></i>` : '')).join('');
    if (isFinite(tvShare) && tvShare > 0.75 && warn.style.display === 'none') { warn.style.display = 'block'; warn.textContent = `Terminal value is ${(tvShare * 100).toFixed(0)}% of the DCF — keep the DCF weight low.`; }
  };
  ids.forEach(id => $(id).addEventListener('input', run)); run();
})();

/* ---------- tool 3: position size & risk ---------- */
(() => {
  if (!$('p-acct')) return;
  let dir = 'long';
  document.querySelectorAll('#p-dir button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#p-dir button').forEach(x => x.classList.remove('on')); b.classList.add('on'); dir = b.dataset.d; run();
  }));
  const run = () => {
    const A = num('p-acct'), rk = num('p-risk') / 100, E = num('p-entry'), atr = num('p-atr'), k = num('p-k'), R = num('p-rr');
    const dist = k * atr, s = dir === 'long' ? -1 : 1;
    const stop = E + s * dist, tgt = E - s * R * dist;
    const riskMoney = A * rk, units = dist > 0 ? Math.floor((riskMoney / dist) * 100) / 100 : NaN;
    const val = units * E;
    $('p-size').textContent = isFinite(units) ? fmt(units, units < 10 ? 2 : 0) + ' units' : '—';
    $('p-stop').textContent = fmt(stop); $('p-tgt').textContent = fmt(tgt);
    $('p-riskv').textContent = fmt(units * dist); $('p-gain').textContent = fmt(units * dist * R);
    $('p-val').textContent = fmt(val); $('p-lev').textContent = isFinite(val / A) ? (val / A).toFixed(2) + 'x' : '—';
    const w = $('p-warn'), msgs = [];
    if (R < 2) msgs.push('Reward is under 2R — LRC skips trades like this.');
    if (val > A) msgs.push(`Position value is ${(val / A).toFixed(1)}x the account — that needs leverage. Check your margin before you trade.`);
    if (dir === 'long' && stop <= 0) msgs.push('The stop is at or below zero — the ATR is too large for this price.');
    w.style.display = msgs.length ? 'block' : 'none'; w.innerHTML = msgs.join('<br>');
  };
  ['p-acct', 'p-risk', 'p-entry', 'p-atr', 'p-k', 'p-rr'].forEach(id => $(id).addEventListener('input', run)); run();
})();

/* ---------- academy: interactive roadmap ---------- */
const SHARED_START = [
  { tag: 'START · STEP 1', title: 'Set your goal and time horizon', rows: [
    ['How long you will hold the share', 'Which track to follow: investing (years) or trading (days to months)'],
    ['How much you can afford to lose', 'Your position size and how tight your stop-loss must be'],
    ['Your mandate or rules (fund rules, account type, leverage allowed)', 'Which shares and strategies you are allowed to use']] },
  { tag: 'START · STEP 2', title: 'Check the market first', rows: [
    ['Index trend (S&P 500, Nasdaq, JSE All Share) vs its 200-day moving average', 'Whether the overall market is helping or fighting you'],
    ['Interest rates and bond yields (US and SA 10-year, Fed and SARB)', 'Higher yields usually push valuations down, especially for growth stocks'],
    ['Inflation, jobs and GDP data', 'Whether the economy is speeding up or slowing — which sectors benefit'],
    ['The rand vs the dollar, and commodity prices', 'Who wins or loses: exporters, miners, importers, retailers'],
    ['Sector performance', 'Where money is flowing in or out']] },
  { tag: 'START · STEP 3', title: 'Find ideas and screen them', rows: [
    ['Market value and average daily traded value', 'Whether the share is big and liquid enough to trade easily'],
    ['Price vs 52-week high and low', 'Whether it is a leader (near highs) or out of favour (near lows)'],
    ['P/E and EV/EBITDA vs peers', 'Whether it looks cheap or expensive at first glance'],
    ['Revenue growth, profit margin, debt vs earnings', 'Whether it is growing, profitable and safe in a downturn'],
    ['Next results date', 'When a big price move is likely']],
    tip: 'Keep a short note for each idea: why it is interesting and what could go wrong. Then choose your track.' }];
const TRACK_A = [
  { tag: 'TRACK A · A1', title: 'Understand the business', rows: [
    ['Products, services and customers', 'What the company actually sells and to whom'],
    ['Revenue by segment and region', 'Where the money comes from, and how concentrated it is'],
    ['Recurring vs one-off revenue', 'How predictable future sales are'],
    ['Key operating measures (customers, retention, backlog)', 'Whether the business engine is getting stronger'],
    ['How revenue grows: customers, prices, products, acquisitions', 'Which growth levers are working']],
    tip: 'Test: can you explain how it makes money in two sentences? If not, read the annual report again.' },
  { tag: 'TRACK A · A2', title: 'Industry and competition', rows: [
    ['Market size and growth', 'How much room the company has to grow'], ['The 4–6 main competitors and market share', 'Who it is fighting and whether it is winning'],
    ['Its moat: switching costs, brand, scale, network effects, licences', 'Whether profits can last or will be competed away'], ['Industry trends', 'Tailwinds and threats over the next few years']] },
  { tag: 'TRACK A · A3', title: 'Read the three financial statements', rows: [
    ['Income statement: growth, margins, EPS', 'Whether it grows and makes more profit on each sale'], ['Balance sheet: cash, debt, equity, goodwill', 'Whether it is financially strong or stretched'],
    ['Cash flow: operating cash, capex, free cash flow', 'Whether profit turns into real cash, and how it is used'], ['Do the three agree?', 'Rising profit with falling cash flow is a warning sign']] },
  { tag: 'TRACK A · A4', title: 'Ratios and quality', rows: [
    ['ROE and ROIC vs cost of capital (~8–10%)', 'Whether growth creates or destroys value'], ['FCF margin and cash conversion', 'How much real cash each rand of sales produces'],
    ['Net debt ÷ EBITDA, interest cover', 'How safe the balance sheet is (under 2x is comfortable)'], ['Adjusted vs reported profit, share-based pay', 'How much “adjusted” earnings flatter the picture']] },
  { tag: 'TRACK A · A5', title: 'Management and governance', rows: [
    ['Track record vs past guidance', 'Whether management does what it says'], ['Insider buying and selling', 'Whether insiders believe in the shares'],
    ['Board independence, share classes, auditor', 'Whether shareholders are protected'], ['Red flags: restatements, CFO changes, related-party deals', 'Whether you can trust the numbers']] },
  { tag: 'TRACK A · A6', title: 'Forecast', rows: [
    ['Guidance and analyst consensus', 'What the market already expects'], ['Your own drivers (customers × price, stores × sales)', 'Your independent view of revenue'],
    ['Margins and costs', 'Your view of profit and free cash flow for 1–5 years'], ['Where you differ from consensus, and why', 'Whether you have an edge']] },
  { tag: 'TRACK A · A7', title: 'Valuation', rows: [
    ['Forward P/E vs peers and history', "What investors pay for next year's earnings"], ['EV/EBITDA vs peers', 'What the whole business is worth, regardless of debt'],
    ['DCF with a sensible WACC and terminal growth', 'What all future cash is worth today'], ['Blend of methods vs today\'s price', 'Upside or downside, and your target price']],
    tip: 'Try it now: the valuation calculator on the Analyst Tools page uses exactly these three methods.' },
  { tag: 'TRACK A · A8', title: 'Risks and scenarios', rows: [
    ['Bear, base and bull cases with prices', 'The range of outcomes, not just one number'], ['Stress test on the key driver', 'How fragile the investment case is'],
    ['Margin of safety', 'How much room you have to be wrong'], ['What would change your mind, with a date', 'When to re-check the thesis']] }];
const TRACK_B = [
  { tag: 'TRACK B · B1', title: 'Trend', rows: [
    ['Price vs 200-day moving average', 'Above a rising 200-day = uptrend'], ['Price vs 50-day and 20-day', 'The medium and short-term trend'],
    ['50-day crossing the 200-day', 'The trend may be turning'], ['Higher highs and higher lows', 'Trend direction in its simplest form'], ['Weekly chart before daily', 'Trade with the bigger picture, not against it']] },
  { tag: 'TRACK B · B2', title: 'Momentum', rows: [
    ['RSI (14)', 'Above 70 overbought, below 30 oversold, 50–70 healthy uptrend'], ['MACD vs signal line', 'Momentum speeding up or slowing down'],
    ['Relative strength vs the index', 'Whether the share leads or lags the market'], ['Divergence (new price high, no new RSI high)', 'The move may be running out of steam']] },
  { tag: 'TRACK B · B3', title: 'Volume and liquidity', rows: [
    ['Volume on up days vs down days', 'Whether buyers or sellers are in control'], ['Relative volume (today ÷ average)', '1.5x+ on a breakout confirms it'],
    ['Average daily traded value', 'How big a position you can trade without moving the price'], ['Bid–ask spread', 'Your hidden cost of getting in and out']] },
  { tag: 'TRACK B · B4', title: 'Support, resistance and patterns', rows: [
    ['Support and resistance', 'Where price may bounce or stall — and where stops go'], ['52-week high and low', 'Key levels many traders watch'],
    ['Breakouts and pullbacks', 'Common entry points in a trend'], ['Patterns: flags, bases, double tops and bottoms', 'A possible next move, if volume confirms']] },
  { tag: 'TRACK B · B5', title: 'Volatility and events', rows: [
    ['ATR (14), the average daily range', 'Sets your stop distance — often 2 × ATR'], ['Results and economic data dates', 'When price can jump past your stop (avoid ~2 weeks before results)'],
    ['News and rating changes', 'Why the price is moving, and whether it can last'], ['Short interest', 'How crowded the bet against the share is']],
    tip: 'Try it now: the position-size planner turns your ATR into a stop, a target and a size.' },
  { tag: 'TRACK B · B6', title: 'A quick fundamental check', rows: [
    ['Valuation and earnings trend from Track A', 'A long on a strong business, or a short on an overvalued one, has better odds']] }];
const finish = track => [
  { tag: 'FINISH · STEP 4', title: 'Make the decision', rows: track === 'A' ? [
    ['Upside or downside to your target', 'BUY, HOLD or SELL (LRC: +7.5% / −5% over six months)'], ['Quality score and red flags', 'Whether a cheap share is cheap for a good reason'],
    ['Your 3-sentence thesis', 'What it is, why the price is wrong, what will prove it'], ['What would change your mind', 'The exit condition, agreed before you start']] : [
    ['Trend, momentum and key levels', 'Go long, go short, or wait'], ['Reward vs risk', 'Only trades with reward of at least 2× risk'],
    ['Your trigger level', 'No trigger, no trade'], ['What would change your mind', 'The exit condition, agreed before you start']] },
  { tag: 'FINISH · STEP 5', title: 'Plan the position', rows: track === 'A' ? [
    ['Entry', 'Buy in stages — a third now, the rest on dips or after results'], ['Exit', 'The thesis breaking, not the daily price'],
    ['Position size', 'A % of the portfolio (often 2–5% per share) and a sector limit'], ['Target', 'Your valuation target, reviewed every results release']] : [
    ['Entry', 'A trigger: break above resistance (long) or below support (short)'], ['Stop-loss', 'Entry − 2 × ATR, or just beyond support'],
    ['Position size', 'Account × 1% ÷ (entry − stop)'], ['Target', 'About 2–3 × your risk; skip trades under 2R']],
    tip: track === 'B' ? 'Worked example: entry 149.00, ATR 4.15 → stop 140.70, risk 8.30. On a 10,000 account, 1% = 100 → 12 shares. Target at 3R = 173.90.' : '' },
  { tag: 'FINISH · STEP 6', title: 'Monitor', rows: track === 'A' ? [
    ['Results vs your forecast', 'Is the thesis on track? Update the model within days'], ['Price vs target', 'If it passes the target, is there still upside?'],
    ['News, management changes, insider trades', 'Early signs the story is changing'], ['Market and sector trend', 'Whether the backdrop has changed']] : [
    ['Price vs stop and target', 'Trail the stop up as the trade works — never further away'], ['Results and gaps', 'A gap can hit your stop or target'],
    ['News', 'Reasons the move may stop or speed up'], ['Market and sector trend', 'Whether to tighten stops or reduce size']] },
  { tag: 'FINISH · STEP 7', title: 'Exit and review', rows: track === 'A' ? [
    ['The plan worked', 'Price reaches fair value with no new upside'], ['The plan failed', 'The thesis breaks: growth, margins, management, debt'], ['Something better appears', 'A clearly better use of the money']] : [
    ['The plan worked', 'The target is hit'], ['The plan failed', 'The stop is hit — no exceptions'], ['Something better appears', 'The trade stalls longer than planned']],
    tip: 'After every exit, write two lines: what went right, what went wrong, and what you will do differently.' }];
(() => {
  if (!$('stops')) return;
  let track = 'A', i = 0, list = [];
  const build = () => { list = [...SHARED_START, ...(track === 'A' ? TRACK_A : TRACK_B), ...finish(track)]; };
  const draw = () => {
    $('stops').innerHTML = list.map((s, k) => `<li class="${k === i ? 'on' : k < i ? 'done' : ''}" data-k="${k}"><small>${s.tag}</small>${s.title}</li>`).join('');
    $('stops').querySelectorAll('li').forEach(li => li.addEventListener('click', () => { i = +li.dataset.k; draw(); }));
    const s = list[i];
    $('stopTag').textContent = s.tag + `  ·  ${i + 1} of ${list.length}`; $('stopTitle').textContent = s.title;
    $('stopRows').innerHTML = s.rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    $('stopTip').style.display = s.tip ? 'block' : 'none'; $('stopTip').textContent = s.tip || '';
    $('stopProg').style.width = ((i + 1) / list.length * 100) + '%';
    $('prevStop').disabled = i === 0; $('nextStop').textContent = i === list.length - 1 ? 'Start again ↺' : 'Next stop →';
  };
  $('prevStop').addEventListener('click', () => { if (i > 0) { i--; draw(); } });
  $('nextStop').addEventListener('click', () => { i = i < list.length - 1 ? i + 1 : 0; draw(); });
  document.querySelectorAll('#trackTabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#trackTabs button').forEach(x => x.classList.remove('on')); b.classList.add('on'); track = b.dataset.t; i = 0; build(); draw();
  }));
  build(); draw();
})();

/* ---------- academy: Work-sheet explorer ---------- */
const WS = [
  ['Company Info', 'Basic details, share price and market data. The sheet checks your market cap against a published figure.', ['Name, ticker, exchange, sector', 'Price, 52-week range, beta', 'Consensus target and rating', 'Next results date'], 'A checked company profile', '15 minutes'],
  ['Financials', 'Copy three years plus the latest year from the annual reports into the yellow cells; about 20 ratios calculate themselves.', ['Revenue, gross and operating profit, net income, EPS', 'Cash, debt, equity, working capital', 'Operating cash flow, capex, buybacks, dividends', 'Sanity checks on EPS, gross profit and capex'], 'Growth, margin, cash-flow and balance-sheet ratios', '1–2 hours'],
  ['Checklist', '50 questions in 10 sections. For each: read why it matters and where to find it, find the evidence, write a note and score it 1–5.', ['Business, industry, growth, profitability', 'Cash flow, balance sheet, management', 'Valuation, catalysts, risks', 'Critical items: disruption, debt, leadership, accounting'], 'A quality score out of 5, by section', 'About a day'],
  ['Valuation', 'Pick peers, set your assumptions and get three valuations and a blended target price. Clear every FLAG in the sanity checks.', ['Forward P/E vs the peer median', 'DCF with WACC and terminal growth', 'EV/EBITDA vs peers', 'Bear and bull cases'], 'A 6-month target price', '2–3 hours'],
  ['Rating Summary', 'Your BUY / HOLD / SELL appears once 80% or more of the items are scored and a target is set. Write your thesis.', ['Upside vs the 7.5% / −5% lines', 'Checklist score vs 3.5 / 2.5', 'Critical-item check', 'Thesis, risks, what changes your mind'], 'The rating and conviction', '1 hour'],
  ['Fundamentals Scorecard', 'One printable page: about 30 key ratios, each flagged GREAT / OK / WEAK against editable limits, with an overall health score.', ['Growth and margins', 'Returns on capital', 'Cash conversion', 'Debt and liquidity'], 'A one-page health check', 'Automatic'],
  ['Technical Review', 'Chart data becomes green, amber and red timing signals, an automatic timing call and a tranche plan.', ['Trend vs 50- and 200-day averages', 'RSI and relative strength', 'Support, resistance and review level', 'Results inside 2 weeks'], 'Execution clearance: full, staged or wait', '30 minutes'],
  ['Investor Summary', 'One printable page that explains the thesis to an everyday investor in plain English. Numbers fill in automatically.', ['What the company does', 'Three reasons to like it, three risks', 'Bear, base and bull in plain words', 'Upcoming events'], 'A plain-English one-pager', '30 minutes'],
  ['Analyst Summary', 'The one-page tear sheet for your reviewer or investment committee: snapshot, thesis, valuation, financials, scores, risks and bottom line.', ['Rating, target, upside, conviction', 'Valuation by method and weight', 'Four years of key financials', 'Checklist scores by section'], 'The committee tear sheet', 'Automatic']];
(() => {
  if (!$('wsx')) return;
  let k = 0;
  $('wsx').innerHTML = WS.map((w, i) => `<button data-i="${i}"><b>${i + 1}</b><span>${w[0]}</span></button>`).join('');
  const draw = () => {
    $('wsx').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === k));
    const w = WS[k]; $('wsxTitle').textContent = `Step ${k + 1} · ${w[0]}`; $('wsxText').textContent = w[1];
    $('wsxList').innerHTML = w[2].map(x => `<li>${x}</li>`).join(''); $('wsxOut').textContent = w[3]; $('wsxTime').textContent = w[4];
  };
  $('wsx').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { k = +b.dataset.i; draw(); }));
  draw();
})();

/* =================== News Desk + Watchlist (read JSON data) =================== */
const DATA = window.LRC_DATA || 'data/';
const getJSON = f => fetch(DATA + f + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = iso => { try { return new Date(iso).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' SAST'; } catch (e) { return iso; } };
const brandName = s => String(s ?? '').replace(/\s*\([^)]*(GitHub|Claude|Action|automation|workbook)[^)]*\)/gi, '').replace(/\b(GitHub Actions?|Claude|Anthropic)\b/gi, 'LRC').replace(/\s+Agent\b/g, '');
window.LRCBrand = brandName;
const pillR = r => `<span class="pill p-${String(r).toLowerCase()}">${esc(r)}</span>`;
const failMsg = (el, what) => { el.innerHTML = `<p class="muted-load">The ${what} could not be loaded right now. If you opened this page as a file on your computer, the browser blocks data files — it works once the site is online.</p>`; };

(() => { // full brief
  const el = $('brief'); if (!el) return;
  getJSON('news.json').then(n => {
    $('newsMeta').innerHTML = `<span class="ai">● AI-written by <b>${esc(brandName(n.agent))}</b></span><span>Edition: <b>${esc(n.edition)}</b></span><span>Updated: <b>${when(n.generated)}</b></span><span>Covers: <b>${esc(n.covers)}</b></span>`;
    el.innerHTML = `<div class="bh">${esc(n.headline)}</div><p class="bs">${esc(n.summary)}</p>` +
      n.sections.map(s => `<h3>${esc(s.name)}</h3>` + s.items.map(i => `<div class="item"><b>${(i.tickers || []).map(t => `<span class="tk">${esc(t)}</span>`).join('')}${esc(i.title)}</b><p>${esc(i.summary)}</p><a href="${esc(i.url)}" target="_blank" rel="noopener">Source: ${esc(i.source)} ↗</a></div>`).join('')).join('') +
      (n.watch_today ? `<h3>What to watch today</h3><ul class="watch">${n.watch_today.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '') +
      `<p class="edu-note" style="margin-top:40px"><b>HOW THIS IS MADE</b>The LRC news desk reads the sources linked above and writes this summary automatically. It can make mistakes — always check the original source before acting. Educational only, not financial advice.</p>`;
  }).catch(() => failMsg(el, 'news brief'));
})();

(() => { // home teasers
  const n = $('hNews'), w = $('hWl');
  if (n) getJSON('news.json').then(d => {
    $('hNewsDate').textContent = when(d.generated);
    n.innerHTML = `<b style="font-family:var(--serif);font-size:26px;color:#fff;line-height:1.15;display:block">${esc(d.headline)}</b><p style="color:var(--muted);margin-top:10px;font-size:15.5px">${esc(d.summary)}</p><a class="btn btn-ghost" style="margin-top:16px" href="news.html">Read the full brief →</a>`;
  }).catch(() => failMsg(n, 'news brief'));
  if (w) getJSON('scan/lists.json').then(d => {
    const draw = () => {
      let m; try { m = JSON.parse(localStorage.getItem('lrc_mkt')) || 'JSE'; } catch (e) { m = 'JSE'; }
      const l = (d.lists || {})[m] || {};
      $('hWlDate').textContent = (m === 'JSE' ? 'JSE' : 'New York') + ' · prices ' + ((d.as_of || {})[m] || '');
      const row = (x, k) => `<li><a href="stock.html?t=${encodeURIComponent(x.t)}" style="color:#fff"><b>${esc(x.t.replace('.JO', ''))}</b> <span style="font-weight:400;color:var(--muted)">${esc(x.n)}</span></a><span>${pillR(k === 'b' ? 'BUY' : 'SELL')}</span></li>`;
      const tb = (l.trading_buy || []).slice(0, 3), ts = (l.trading_sell || []).slice(0, 2);
      w.innerHTML = `<small style="color:var(--muted);letter-spacing:.1em">TRADING · 3–12 MONTHS</small><ul class="mini">${tb.map(x => row(x, 'b')).join('')}${ts.map(x => row(x, 's')).join('')}</ul><a class="btn btn-ghost" style="margin-top:16px" href="watchlist.html">See the full watchlist →</a>`;
    };
    draw(); window.addEventListener('lrcmarket', draw);
  }).catch(() => failMsg(w, 'watchlist'));
})();

(() => { // watchlist page
  const T = $('wlSwing'); if (!T) return;
  getJSON('watchlist.json').then(d => {
    $('wlMeta').innerHTML = `<span class="ai">● Built by <b>${esc(brandName(d.agent))}</b></span><span>Prices as of <b>${esc(d.prices_as_of)}</b></span><span>Updated <b>${when(d.generated)}</b></span>`;
    let f = 'all';
    const draw = () => {
      const rows = d.swing.filter(x => f === 'all' || x.direction === f || x.grade === f);
      T.innerHTML = `<thead><tr><th>COMPANY</th><th>DIRECTION</th><th>SETUP</th><th>ENTRY</th><th>STOP · DOWNSIDE</th><th>TARGET · UPSIDE</th><th>SCORE</th><th>LRC RATING</th><th>STATUS</th></tr></thead><tbody>` +
        rows.map(x => `<tr><td><span class="tic">${esc(x.ticker)}</span><small>${esc(x.name)}</small></td><td>${pillR(x.direction === 'Long' ? 'LONG' : 'SHORT')}</td><td>${esc(x.setup)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</td>
          <td class="n">${fmt(x.entry)}</td><td class="n">${fmt(x.stop)}<small style="color:#F08A7E">${pct(x.stop / x.entry - 1)}</small></td><td class="n">${fmt(x.target)}<small style="color:#5ED39A">${pct(x.target / x.entry - 1)}</small></td><td class="n">${x.score}/18 ${pillR(x.grade)}</td>
          <td>${pillR(x.rating)}<small>6-m value ${fmt(x.rating_target)}</small></td><td>${esc(x.status)}<small>${esc(x.tech_clearance)}</small></td></tr>`).join('') + '</tbody>';
    };
    document.querySelectorAll('#wlFilters .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#wlFilters .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); f = b.dataset.f; draw(); }));
    draw();
    $('wlInv').innerHTML = `<thead><tr><th>COMPANY</th><th>STATUS</th><th>SCORE /24</th><th>LRC RATING</th><th>6-M VALUE</th><th>MARGIN OF SAFETY</th></tr></thead><tbody>` +
      d.investment.map(x => `<tr><td><span class="tic">${esc(x.ticker)}</span><small>${esc(x.name)}</small></td><td>${esc(x.status)}</td><td class="n">${x.score} ${pillR(x.grade)}</td><td>${pillR(x.rating)}</td><td class="n">${fmt(x.fair_value)}</td><td class="n" style="color:${x.margin_of_safety >= 0 ? '#5ED39A' : '#F08A7E'}">${pct(x.margin_of_safety)}</td></tr>`).join('') + '</tbody>';
    const r = d.rules;
    $('wlRules').innerHTML = [['Qualify', r.qualify], ['Stop', 'Below support (longs) / above resistance (shorts), shown as % from the entry'], ['Target', 'Shown as % upside (longs) or downside (shorts) from the entry'], ['Risk', r.risk + '; max ' + r.max_shorts + ' shorts open; ' + r.event_risk + ' = event risk']]
      .map(([h, t]) => `<div class="card"><h3>${h}</h3><p>${esc(t)}</p></div>`).join('');
  }).catch(() => failMsg(T, 'watchlist'));
})();

/* =================== v4: live wire, breaking bar, articles, writer =================== */
const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (!isFinite(m)) return ''; if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); return h < 24 ? h + ' h ago' : Math.round(h / 24) + ' d ago'; };
const REG = { SA: 'South Africa', US: 'US markets', FX: 'Forex & commodities', GL: 'Global' };
const wireItem = i => `<a class="wi${i.breaking ? ' brk' : ''}" href="${esc(i.url)}" target="_blank" rel="noopener">
  <span class="wt">${i.breaking ? '<b class="tagb">BREAKING</b>' : ''}${(i.tickers || []).map(t => `<span class="tk">${esc(t)}</span>`).join('')}${esc(i.title)}</span>
  <span class="wm"><b>${esc(i.source)}</b> · ${esc(REG[i.region] || i.region)} · ${ago(i.published)}</span></a>`;

(() => { // breaking bar on every page
  const bar = $('breaking'); if (!bar) return;
  let shut = false; try { shut = sessionStorage.getItem('lrcBrk') === '1'; } catch (e) {}
  if (shut) return;
  const load = () => getJSON('wire.json').then(w => {
    const hot = (w.items || []).filter(i => i.breaking && Date.now() - new Date(i.published) < 3 * 3600e3).slice(0, 4);
    if (!hot.length) { bar.hidden = true; return; }
    let k = 0;
    const show = () => { const i = hot[k % hot.length]; bar.innerHTML = `<div class="wrap"><b class="tagb">BREAKING</b><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="bs">${esc(i.source)} · ${ago(i.published)}</span><a class="more" href="${location.pathname.includes('/articles/') ? '../' : ''}news.html">All news →</a><button aria-label="Close" id="brkX">×</button></div>`;
      $('brkX').onclick = () => { bar.hidden = true; try { sessionStorage.setItem('lrcBrk', '1'); } catch (e) {} }; k++; };
    bar.hidden = false; show(); clearInterval(bar._t); if (hot.length > 1) bar._t = setInterval(show, 7000);
  }).catch(() => {});
  load(); setInterval(load, 5 * 60e3);
})();

(() => { // news page: tabs + live wire
  const tabs = $('newsTabs'); if (!tabs) return;
  const set = t => { tabs.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $('wirePane').style.display = t === 'wire' ? '' : 'none'; $('briefPane').style.display = t === 'brief' ? '' : 'none'; };
  tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { set(b.dataset.t); history.replaceState(null, '', '#' + b.dataset.t); }));
  if (location.hash === '#brief') set('brief');
  const W = $('wire'); let data = { items: [] }, f = 'all';
  const draw = () => {
    const q = ($('wireSearch').value || '').toLowerCase();
    const rows = data.items.filter(i => (f === 'all' || (f === 'breaking' ? i.breaking : f === 'cover' ? (i.tickers || []).length : i.region === f)) && (!q || (i.title + ' ' + i.source).toLowerCase().includes(q)));
    W.innerHTML = rows.length ? rows.map(wireItem).join('') : `<p class="muted-load">${esc(data.items.length ? 'Nothing in this filter right now.' : (data.note || 'The wire is quiet right now.'))}</p>`;
  };
  const load = () => getJSON('wire.json').then(w => { data = w;
    $('wireMeta').innerHTML = `<span class="ai">● Live wire · refreshed every 15 minutes</span><span>Last update <b>${when(w.generated)}</b> (${ago(w.generated)})</span><span><b>${w.items.length}</b> headlines from <b>${w.sources_ok}</b> newsrooms</span><span><b>${w.items.filter(i => i.breaking).length}</b> breaking</span>`;
    draw(); }).catch(() => failMsg(W, 'news wire'));
  document.querySelectorAll('#wireFilters .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#wireFilters .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); f = b.dataset.f; draw(); }));
  $('wireSearch').addEventListener('input', draw);
  load(); setInterval(load, 5 * 60e3);
})();

(() => { // home: wire + articles teasers
  const hw = $('hWire'); if (hw) getJSON('wire.json').then(w => { $('hWireDate').textContent = ago(w.generated);
    const top = w.items.filter(i => i.breaking).concat(w.items.filter(i => !i.breaking)).slice(0, 6);
    hw.innerHTML = `<div class="wire mini">${top.length ? top.map(wireItem).join('') : `<p class="muted-load">${esc(w.note || '')}</p>`}</div><a class="btn btn-ghost" style="margin-top:16px" href="news.html">Open the news desk →</a>`; }).catch(() => failMsg(hw, 'news wire'));
})();

const artCard = (a, pre = '') => `<a class="art" href="${pre}${esc(a.url)}">${a.image ? `<div class="ai"><img src="${pre}${esc(a.image)}" alt="" loading="lazy"></div>` : `<div class="ai ph"><span>${esc(a.category)}</span></div>`}
  <div class="ab"><span class="ac">${esc(a.category)}${a.premium ? ' · <b class="prem">PREMIUM</b>' : ''}</span><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p><small>${esc(a.date_long)} · ${a.read_min} min read</small></div></a>`;

(() => { // articles list + home teaser + "more" on article pages
  const A = $('arts'), H = $('hArt'), M = $('moreArts');
  if (!A && !H && !M) return;
  getJSON('articles.json').then(d => {
    const list = d.articles || [];
    if (H) H.innerHTML = list.length ? `<ul class="alist">${list.slice(0, 4).map(a => `<li><a href="${esc(a.url)}"><span class="ac">${esc(a.category)} · ${esc(a.date_long)}</span><b>${esc(a.title)}</b></a></li>`).join('')}</ul>` : '<p class="muted-load">The first article is on its way.</p>';
    if (M) { const pre = '../'; M.innerHTML = list.filter(a => a.slug !== M.dataset.skip).slice(0, 3).map(a => artCard(a, pre)).join(''); }
    if (!A) return;
    let f = 'all';
    const feat = list[0];
    if (feat) $('artFeature').innerHTML = `<a class="feat" href="${esc(feat.url)}"><div><span class="ac">LATEST · ${esc(feat.category)}</span><h2>${esc(feat.title)}</h2><p class="lead">${esc(feat.summary)}</p><small>${esc(feat.author)} · ${esc(feat.date_long)} · ${feat.read_min} min read</small></div>${feat.image ? `<img src="${esc(feat.image)}" alt="">` : ''}</a>`;
    const draw = () => { const q = ($('artSearch').value || '').toLowerCase();
      const rows = list.slice(1).filter(a => (f === 'all' || a.category === f) && (!q || (a.title + ' ' + a.summary + ' ' + (a.tickers || []).join(' ')).toLowerCase().includes(q)));
      A.innerHTML = rows.map(a => artCard(a)).join(''); $('artEmpty').style.display = rows.length || list.length <= 1 ? 'none' : 'block'; };
    document.querySelectorAll('#artFilters .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#artFilters .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); f = b.dataset.f; draw(); }));
    $('artSearch').addEventListener('input', draw); draw();
  }).catch(() => { [A, H, M].forEach(e => e && failMsg(e, 'articles list')); });
})();

(() => { // share buttons on article pages
  const s = $('share'); if (!s) return;
  const u = encodeURIComponent(location.href), t = encodeURIComponent(document.title);
  s.innerHTML = `<span>Share this article</span><a href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener">Facebook</a><a href="https://x.com/intent/post?url=${u}&text=${t}" target="_blank" rel="noopener">X</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${u}" target="_blank" rel="noopener">LinkedIn</a><button id="shareCopy">Copy link</button>`;
  $('shareCopy').onclick = () => navigator.clipboard.writeText(location.href).then(() => { $('shareCopy').textContent = 'Copied ✓'; });
})();

(() => { // article composer (write.html)
  const B = $('w-body'); if (!B) return;
  const F = ['w-title', 'w-cat', 'w-date', 'w-sum', 'w-tk', 'w-img', 'w-buy', 'w-body'];
  const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  try { const d = JSON.parse(localStorage.getItem('lrcDraft') || '{}'); F.forEach(k => { if (d[k] != null) $(k).value = d[k]; }); $('w-prem').checked = !!d.prem; } catch (e) {}
  if (!$('w-date').value) $('w-date').value = today;
  const slug = () => ($('w-title').value || 'untitled').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70);
  const q = v => '"' + String(v).replace(/"/g, "'") + '"';
  const md = () => `---\ntitle: ${q($('w-title').value)}\ndate: ${$('w-date').value}\ncategory: ${$('w-cat').value}\nauthor: "Prayer Nkuna, Analyst"\nsummary: ${q($('w-sum').value)}\ntickers: ${q($('w-tk').value)}\nimage: ${q($('w-img').value)}\npremium: ${$('w-prem').checked}\nbuy: ${q($('w-buy').value)}\n---\n\n${B.value.trim()}\n`;
  const fname = () => `${$('w-date').value}-${slug()}.md`;
  const prev = () => {
    const words = B.value.trim().split(/\s+/).filter(Boolean).length;
    $('w-count').textContent = `${words} words · about ${Math.max(1, Math.round(words / 220))} min read · file: ${fname()}`;
    const body = window.marked ? marked.parse(B.value) : '<pre>' + esc(B.value) + '</pre>';
    $('w-prev').innerHTML = `<span class="ac">${esc($('w-cat').value)}</span><h2 style="margin-top:8px">${esc($('w-title').value || 'Your headline')}</h2><p class="lead" style="font-size:17px">${esc($('w-sum').value)}</p><div class="prose">${body}</div>`;
    const d = { prem: $('w-prem').checked }; F.forEach(k => d[k] = $(k).value); try { localStorage.setItem('lrcDraft', JSON.stringify(d)); } catch (e) {}
  };
  F.concat('w-prem').forEach(k => $(k).addEventListener('input', prev)); prev();
  const wrap = (a, b = a, ph = 'text') => { const s0 = B.selectionStart, s1 = B.selectionEnd, sel = B.value.slice(s0, s1) || ph; B.setRangeText(a + sel + b, s0, s1, 'end'); B.focus(); prev(); };
  const line = t => { B.setRangeText((B.selectionStart && B.value[B.selectionStart - 1] !== '\n' ? '\n' : '') + t, B.selectionStart, B.selectionEnd, 'end'); B.focus(); prev(); };
  const TPL = `## The market in one line\n\n\n## South Africa\n- **JSE Top 40:** \n- **Rand:** \n\n## United States\n- **S&P 500 / Nasdaq:** \n\n## Commodities\n- **Gold / Brent:** \n\n## What I'm watching\n1. \n2. \n\n## The analyst's view\n\n\n> Educational only — not financial advice.\n`;
  const M = { h2: () => line('## Heading\n'), b: () => wrap('**'), i: () => wrap('*'), ul: () => line('- point one\n- point two\n'), q: () => line('> quote\n'),
    a: () => wrap('[', '](https://)', 'link text'), img: () => line('![Chart description](articles/img/your-image.png)\n'),
    tbl: () => line('| Item | Level | Change |\n|---|---|---|\n| JSE Top 40 |  |  |\n| USD/ZAR |  |  |\n'), tpl: () => { if (!B.value.trim() || confirm('Replace the text with the daily template?')) { B.value = TPL; prev(); } } };
  $('wTools').querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.preventDefault(); M[b.dataset.m](); }));
  const msg = t => { $('w-msg').textContent = t; };
  const ok = () => { if (!$('w-title').value.trim() || !B.value.trim()) { msg('Add a headline and the article text first.'); return false; } return true; };
  $('w-pub').onclick = () => { if (!ok()) return;
    const url = `https://github.com/${window.LRC_REPO}/new/main/docs/articles?filename=${encodeURIComponent(fname())}&value=${encodeURIComponent(md())}`;
    if (url.length > 7500) { navigator.clipboard.writeText(md()); window.open(`https://github.com/${window.LRC_REPO}/new/main/docs/articles?filename=${encodeURIComponent(fname())}`, '_blank'); msg('Long article: the text is copied — paste it into the GitHub box (Ctrl+V), then Commit changes.'); }
    else { window.open(url, '_blank'); msg('GitHub opened in a new tab — check the text and press the green "Commit changes" button. The article is live in about 2 minutes.'); } };
  $('w-copy').onclick = () => { if (ok()) navigator.clipboard.writeText(md()).then(() => msg('Copied. File name to use: ' + fname())); };
  $('w-dl').onclick = () => { if (!ok()) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md()], { type: 'text/markdown' })); a.download = fname(); a.click(); };
  $('w-clear').onclick = () => { if (confirm('Start a new article? The current draft will be cleared.')) { F.forEach(k => $(k).value = ''); $('w-prem').checked = false; $('w-date').value = today; prev(); } };
})();

(() => { // market dashboard: one table, colour-coded changes, plus top gainers / losers from the LRC Stock Scanner
  const T = $('dashTbl'); if (!T) return;
  const sel = $('dashWeek');
  const INV = /USD \/ ZAR|EUR \/ ZAR|GBP \/ ZAR|CPI|10-year|repo|Fed funds/i;   // a rise is bad for investors
  const num = (v, u) => v === '' || v == null ? '—' : (u === 'index' ? Number(v).toLocaleString('en-ZA', { maximumFractionDigits: 0 }) : Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const move = (a, b, u, name, big) => {
    if (a === '' || a == null || b === '' || b == null) return { txt: '—', cls: 'g0' };
    let v, txt, mag;
    if (u === '%') { v = (a - b) * 100; txt = (v > 0 ? '+' : '') + v.toFixed(0) + 'bp'; mag = Math.abs(v) >= (big ? 75 : 25) ? 2 : Math.abs(v) >= (big ? 20 : 5) ? 1 : 0; }
    else { v = a / b - 1; txt = pct(v); mag = Math.abs(v) >= (big ? 0.10 : 0.03) ? 2 : Math.abs(v) >= (big ? 0.02 : 0.005) ? 1 : 0; }
    const good = INV.test(name) ? v < 0 : v > 0;
    return { txt, cls: mag === 0 ? 'g0' : (good ? 'g' : 'r') + mag };
  };
  const show = f => getJSON('dashboards/' + f + '.json').then(d => {
    $('dashMeta').innerHTML = `<span class="ai">● ${esc(d.live ? 'Live — updates every 4 hours on weekdays' : 'Weekly edition')}</span><span>${esc(d.title)}</span><span>Updated <b>${when(d.generated)}</b></span>`;
    const view = d.market_view || d.auto_view;
    $('dashView').innerHTML = view ? `<div class="lbl">${d.market_view ? "THE ANALYST'S VIEW" : 'AUTOMATIC SUMMARY'}</div><p>${esc(view)}</p>` : '';
    T.innerHTML = '<thead><tr><th>INDICATOR</th><th>LATEST</th><th>A WEEK AGO</th><th>WEEK</th><th>A YEAR AGO</th><th>1 YEAR</th><th>AS OF</th><th>WHAT IT TELLS US</th></tr></thead><tbody>' +
      d.groups.map(g => `<tr class="grp"><td colspan="8">${esc(g.name)}</td></tr>` + g.rows.map(r => { const w = move(r.latest, r.week_ago, r.unit, r.name), y = move(r.latest, r.year_ago, r.unit, r.name, true);
        return `<tr title="Source: ${esc(r.source)}"><td><b>${esc(r.name)}</b><small>${esc(r.unit)}</small></td><td class="n lv">${num(r.latest, r.unit)}${r.unit === '%' ? '%' : ''}</td><td class="n">${num(r.week_ago, r.unit)}</td><td class="n"><span class="ch ${w.cls}">${w.txt}</span></td><td class="n">${num(r.year_ago, r.unit)}</td><td class="n"><span class="ch ${y.cls}">${y.txt}</span></td><td class="n dt">${esc(r.as_of)}</td><td><span class="note">${esc(r.note || '')}</span></td></tr>`; }).join('')).join('') + '</tbody>';
    $('dashSrc').textContent = d.updated_by || '';
  }).catch(() => failMsg(T, 'dashboard'));
  Promise.all([getJSON('dashboards/index.json'), getJSON('dashboards/live.json').catch(() => null)]).then(([idx, live]) => {
    const opts = (live ? [`<option value="live">● This week so far (live)</option>`] : []).concat(idx.weeks.map(w => `<option value="${esc(w.week_ending)}">${esc(w.title.replace('Weekly market dashboard — ', 'Edition: '))}</option>`));
    sel.innerHTML = opts.join('');
    const want = location.hash.slice(1); sel.value = [...sel.options].some(o => o.value === want) ? want : (live ? 'live' : (idx.latest || sel.options[0].value));
    sel.onchange = () => { history.replaceState(null, '', '#' + sel.value); show(sel.value); };
    show(sel.value);
  }).catch(() => failMsg(T, 'dashboard'));

  // ---- top movers (automatic: every LRC Stock Scanner run, twice a day on weekdays)
  const M = $('movers'); let rows = null;
  let mkt = (() => { try { return JSON.parse(localStorage.getItem('lrc_mkt')) || 'JSE'; } catch (e) { return 'JSE'; } })(), per = 'chg';
  const PER = { chg: 'today', p1w: 'this week (5 trading days)', p1m: 'this month (21 trading days)' };
  const seg = (id, v) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  const cls = x => x >= 0 ? (x >= 0.05 ? 'g2' : 'g1') : (x <= -0.05 ? 'r2' : 'r1');
  const px = r => (r.m === 'JSE' ? 'R' : '$') + Number(r.px).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const list = (title, sub, xs) => `<div class="mvc"><h3>${title}</h3><p class="mvs">${sub}</p>` + (xs.length ? xs.map((r, i) => `<a class="mvr" href="stock.html?t=${encodeURIComponent(r.t)}" title="${esc(r.n)} · ${esc(r.sec || '')}"><span class="rk">${i + 1}</span><span class="tk">${esc(r.t.replace('.JO', ''))}</span><span class="mn">${esc(r.n)}<small>${esc(r.sec || '')} · ${px(r)}</small></span><span class="rt rt-${(r.v || 'HOLD').replace(' ', '-').toLowerCase()}">${esc(r.v || '')}</span><span class="ch ${cls(r[per])}">${pct(r[per])}</span></a>`).join('') : '<p class="mvs">No data yet.</p>') + '</div>';
  const draw = () => {
    seg('mvMkt', mkt); seg('mvPer', per);
    if (!rows) return;
    // New York: companies worth $2bn+ so tiny stocks don't crowd the list
    const xs = rows.filter(r => r.m === mkt && isFinite(r[per]) && r[per] != null && (mkt === 'JSE' || (r.mcap || 0) >= 2e9));
    const up = xs.filter(r => r[per] > 0).sort((a, b) => b[per] - a[per]).slice(0, 10);
    const dn = xs.filter(r => r[per] < 0).sort((a, b) => a[per] - b[per]).slice(0, 10);
    const big = [...xs].sort((a, b) => Math.abs(b[per]) - Math.abs(a[per])).slice(0, 10);
    const adv = xs.filter(r => r[per] > 0).length, dec = xs.filter(r => r[per] < 0).length;
    const nm = mkt === 'JSE' ? 'JSE' : 'New York';
    M.innerHTML = list('▲ Top gainers', `${nm} · ${PER[per]}`, up) + list('▼ Top losers', `${nm} · ${PER[per]}`, dn) + list('◆ Biggest moves', `${nm} · up or down, ${PER[per]}`, big);
    $('movMeta').innerHTML = `<b class="up">${adv} up</b> · <b class="dn">${dec} down</b> of ${xs.length} ${nm} shares in the LRC Stock Scanner · prices as of ${esc((rows.as_of && rows.as_of[mkt]) || '')} · click a name for its one-page summary`;
  };
  $('mvMkt').onclick = e => { const b = e.target.closest('button'); if (!b) return; mkt = b.dataset.v; try { localStorage.setItem('lrc_mkt', JSON.stringify(mkt)); } catch (er) { } window.dispatchEvent(new CustomEvent('lrcmarket', { detail: mkt })); draw(); };
  $('mvPer').onclick = e => { const b = e.target.closest('button'); if (!b) return; per = b.dataset.v; draw(); };
  window.addEventListener('lrcmarket', e => { if (e.detail !== mkt) { mkt = e.detail; draw(); } });
  draw();
  getJSON('scan/stocks.json').then(s => { rows = s.rows; rows.as_of = s.as_of; draw(); }).catch(() => failMsg(M, 'top movers'));
})();

(() => { // earnings calendar
  const L = $('erList'); if (!L) return;
  const cache = {};
  const draw = () => {
    const m = $('erMkt').value, days = +$('erRange').value, cov = $('erCov').value, q = ($('erSearch').value || '').toLowerCase();
    const go = d => {
      const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10), end = new Date(Date.now() + (2 * 3600e3) + days * 864e5).toISOString().slice(0, 10);
      const rows = (d.items || []).filter(x => x.date >= today && x.date <= end && (cov === 'all' || (cov === 'cov' ? x.covered : !!x.v)) && (!q || (x.ticker + ' ' + x.name).toLowerCase().includes(q)));
      $('erMeta').innerHTML = `<span class="ai">● ${esc(d.market)}</span><span>Updated <b>${when(d.synced || d.generated)}</b></span><span><b>${rows.length}</b> companies in range</span><span><b>${rows.filter(x => x.covered).length}</b> ✓ on the LRC watchlist / coverage</span>`;
      $('erSrc').textContent = (d.coverage_note ? d.coverage_note + ' ' : '') + 'Source: ' + d.source + ' Dates can move — confirm on the company announcement (SENS for JSE companies).';
      if (!rows.length) { L.innerHTML = `<p class="muted-load">${esc(d.note || 'No results dates in this range yet.')}</p>`; return; }
      const by = {}; rows.forEach(x => (by[x.date] = by[x.date] || []).push(x));
      L.innerHTML = Object.keys(by).sort().map(k => { const dd = new Date(k + 'T12:00:00');
        return `<div class="eday"><div class="edate"><b>${dd.toLocaleDateString('en-ZA', { weekday: 'long' })}</b><span>${dd.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}</span></div><div class="erows">` +
          by[k].map(x => `<div class="erow${x.covered ? ' cov' : ''}"><span class="tic">${x.covered ? '<b class="tick">✓</b>' : ''}${x.v ? `<a href="stock.html?t=${encodeURIComponent(x.t || x.ticker)}">${esc(x.ticker)}</a>` : esc(x.ticker)}</span><span class="mn">${x.v ? `<a href="stock.html?t=${encodeURIComponent(x.t || x.ticker)}" style="color:inherit">${esc(x.name)}</a>` : esc(x.name)}${(x.lists || []).map(l => ` <span class="wtag ${/SELL/.test(l) ? 's' : 'b'}">${esc(l)}</span>`).join('')}${x.lrc_rating ? ` <span class="pill p-${String(x.lrc_rating).toLowerCase()}">LRC ${esc(x.lrc_rating)}</span>` : ''}${x.v ? `<small>LRC Stock Scanner: trading ${esc(x.v)} · investment ${esc(x.iv || '—')}</small>` : ''}${x.period ? `<small>${esc(x.period)}</small>` : ''}</span><span class="ew">${esc(x.when || '')}</span><span class="n">${x.eps_forecast ? 'EPS est. ' + esc(x.eps_forecast) : ''}</span><span class="n">${x.market_cap_bn ? (m === 'jse' ? 'R' : '$') + x.market_cap_bn + 'bn' : ''}</span></div>`).join('') + '</div></div>'; }).join('');
    };
    if (cache[m]) go(cache[m]); else getJSON('earnings_' + m + '.json').then(d => { cache[m] = d; go(d); }).catch(() => failMsg(L, 'earnings calendar'));
  };
  if (location.hash === '#jse') $('erMkt').value = 'jse';
  ['erMkt', 'erRange', 'erCov'].forEach(i => $(i).addEventListener('change', () => { if (i === 'erMkt') history.replaceState(null, '', '#' + $('erMkt').value); draw(); }));
  $('erSearch').addEventListener('input', draw);
  draw();
})();

/* ---------- v5: site-wide market switch (JSE / New York) ---------- */
(() => {
  const K = 'lrc_mkt';
  const getM = () => { try { return JSON.parse(localStorage.getItem(K)) || 'JSE'; } catch (e) { return 'JSE'; } };
  const setM = m => { try { localStorage.setItem(K, JSON.stringify(m)); } catch (e) { } window.dispatchEvent(new CustomEvent('lrcmarket', { detail: m })); };
  const cta = document.querySelector('.nav-cta');
  if (cta && !document.getElementById('hdrMkt')) {
    const w = document.createElement('span'); w.className = 'mkt-switch';
    w.innerHTML = '<select id="hdrMkt" aria-label="Market"><option value="JSE">JSE</option><option value="US">New York</option></select>';
    cta.insertBefore(w, cta.firstChild);
    const s = w.querySelector('select'); s.value = getM();
    s.addEventListener('change', () => setM(s.value));
    window.addEventListener('lrcmarket', e => { if (s.value !== e.detail) s.value = e.detail; });
  }
  const er = document.getElementById('erMkt'); // earnings calendar follows the switch
  if (er) {
    const sync = m => { const v = m === 'JSE' ? 'jse' : 'us'; if (er.value !== v) { er.value = v; er.dispatchEvent(new Event('change')); } };
    if (!location.hash) sync(getM());
    window.addEventListener('lrcmarket', e => sync(e.detail));
    er.addEventListener('change', () => { const m = er.value === 'jse' ? 'JSE' : 'US'; if (getM() !== m) setM(m); });
  }
})();

/* ---------- v8: phone layout helpers ---------- */
(() => {
  // label every cell of a .mcard table with its column heading, so phones can show each row as a card
  const label = t => {
    const hs = [...t.querySelectorAll('thead th')].map(th => (th.childNodes[0] && th.childNodes[0].textContent || th.textContent).replace(/[⇅▾▴]/g, '').trim());
    t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { if (hs[i] && hs[i] !== '#' && !td.hasAttribute('data-label')) td.setAttribute('data-label', hs[i]); }));
  };
  const all = () => document.querySelectorAll('table.mcard').forEach(label);
  all();
  new MutationObserver(all).observe(document.body, { childList: true, subtree: true });
  // short market names in the header on phones
  const fit = () => { const s = document.getElementById('hdrMkt'); if (!s) return; const o = s.querySelector('option[value="US"]'); if (o) o.textContent = window.innerWidth <= 700 ? 'NY' : 'New York'; };
  fit(); window.addEventListener('resize', fit);
})();
