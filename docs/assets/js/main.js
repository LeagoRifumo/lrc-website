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
const LIBRARY = [
  { t: 'Paylocity (PCTY) — initiation of coverage', type: 'Company report', sector: 'Technology', date: '6 Oct 2026', region: 'US',
    s: 'Payroll and HR software for US mid-sized companies: how it makes money, how it grows, four years of financials and a three-way valuation.', tags: ['HCM software', 'Valuation', '10 pages'] },
  { t: 'Wabtec (WAB) — initiation of coverage', type: 'Company report', sector: 'Industrials', date: '6 Oct 2026', region: 'US',
    s: 'Locomotives, braking systems and rail digital: the backlog, margins, cash flow and what the share price already assumes.', tags: ['Rail', 'Backlog', '10 pages'] },
  { t: 'Weekly market dashboard — week to 9 Oct 2026', type: 'Market brief', sector: 'Macro & markets', date: '9 Oct 2026', region: 'SA & US',
    s: 'JSE flat on the week, the rand firmer at about R16.51/$, US shares higher and Brent above $100 — what it means for portfolios.', tags: ['JSE', 'Rand', 'S&P 500', 'Commodities'] },
  { t: 'Weekly market dashboard — week to 2 Oct 2026', type: 'Market brief', sector: 'Macro & markets', date: '2 Oct 2026', region: 'SA & US',
    s: 'A risk-off week for SA after the SARB raised the repo rate to 7.25%; US 10-year yields above 5% and the rand weaker.', tags: ['SARB', 'Yields', 'Rand'] },
  { t: 'Momentum vs valuation: why market leaders fail our test', type: 'Education', sector: 'Process', date: '14 Oct 2026', region: 'US',
    s: 'Our October screen found that the strongest-trending US shares were also the most expensive. Here is why a great chart is not a BUY.', tags: ['Screening', 'Discipline'] },
  { t: 'Stock analysis roadmap: investing and trading', type: 'Education', sector: 'Process', date: '7 Oct 2026', region: 'Global',
    s: 'The 13-page roadmap for students, interns and junior analysts — what to look at, and what it tells you, from first screen to exit.', tags: ['Academy', 'Roadmap', 'Beginner'] },
];
(() => {
  const lib = $('lib'); if (!lib) return;
  let type = 'all';
  const draw = () => {
    const q = ($('libSearch').value || '').toLowerCase(), sec = $('libSector').value;
    const items = LIBRARY.filter(d => (type === 'all' || d.type === type) && (sec === 'all' || d.sector === sec) &&
      (!q || (d.t + ' ' + d.s + ' ' + d.tags.join(' ') + ' ' + d.sector).toLowerCase().includes(q)));
    lib.innerHTML = items.map(d => `<article class="doc"><div class="meta"><span>${d.type.toUpperCase()}</span><span>${d.date}</span></div>
      <h3>${d.t}</h3><p>${d.s}</p><div class="tags"><span>${d.sector}</span><span>${d.region}</span>${d.tags.map(x => `<span>${x}</span>`).join('')}</div>
      <a class="btn btn-ghost" href="mailto:info@leagorifumocapital.co.za?subject=${encodeURIComponent('Research request: ' + d.t)}">Request this ${d.type === 'Market brief' ? 'brief' : 'report'} →</a></article>`).join('');
    $('libEmpty').style.display = items.length ? 'none' : 'block';
  };
  document.querySelectorAll('#libFilters .chip-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#libFilters .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); type = b.dataset.f; draw();
  }));
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

/* =================== AI News + Watchlist (read JSON written by the agents) =================== */
const DATA = window.LRC_DATA || 'data/';
const getJSON = f => fetch(DATA + f + '?v=' + Date.now()).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = iso => { try { return new Date(iso).toLocaleString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' SAST'; } catch (e) { return iso; } };
const pillR = r => `<span class="pill p-${String(r).toLowerCase()}">${esc(r)}</span>`;
const failMsg = (el, what) => { el.innerHTML = `<p class="muted-load">The ${what} could not be loaded right now. If you opened this page as a file on your computer, the browser blocks data files — it works once the site is online.</p>`; };

(() => { // full brief
  const el = $('brief'); if (!el) return;
  getJSON('news.json').then(n => {
    $('newsMeta').innerHTML = `<span class="ai">● AI-written by <b>${esc(n.agent)}</b></span><span>Edition: <b>${esc(n.edition)}</b></span><span>Updated: <b>${when(n.generated)}</b></span><span>Covers: <b>${esc(n.covers)}</b></span>`;
    el.innerHTML = `<div class="bh">${esc(n.headline)}</div><p class="bs">${esc(n.summary)}</p>` +
      n.sections.map(s => `<h3>${esc(s.name)}</h3>` + s.items.map(i => `<div class="item"><b>${(i.tickers || []).map(t => `<span class="tk">${esc(t)}</span>`).join('')}${esc(i.title)}</b><p>${esc(i.summary)}</p><a href="${esc(i.url)}" target="_blank" rel="noopener">Source: ${esc(i.source)} ↗</a></div>`).join('')).join('') +
      (n.watch_today ? `<h3>What to watch today</h3><ul class="watch">${n.watch_today.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '') +
      `<p class="edu-note" style="margin-top:40px"><b>HOW THIS IS MADE</b>An AI agent reads the sources linked above and writes this summary. It can make mistakes — always check the original source before acting. Educational only, not financial advice.</p>`;
  }).catch(() => failMsg(el, 'news brief'));
})();

(() => { // home teasers
  const n = $('hNews'), w = $('hWl');
  if (n) getJSON('news.json').then(d => {
    $('hNewsDate').textContent = when(d.generated);
    n.innerHTML = `<b style="font-family:var(--serif);font-size:26px;color:#fff;line-height:1.15;display:block">${esc(d.headline)}</b><p style="color:var(--muted);margin-top:10px;font-size:15.5px">${esc(d.summary)}</p><a class="btn btn-ghost" style="margin-top:16px" href="news.html">Read the full brief →</a>`;
  }).catch(() => failMsg(n, 'news brief'));
  if (w) getJSON('watchlist.json').then(d => {
    $('hWlDate').textContent = 'Week ending ' + d.week_ending;
    const top = [...d.swing].filter(x => x.grade === 'A').concat(d.swing.filter(x => x.grade !== 'A')).slice(0, 5);
    w.innerHTML = `<ul class="mini">${top.map(x => `<li><b style="color:#fff">${esc(x.ticker)} <span style="font-weight:400">${esc(x.name)}</span></b><span>${pillR(x.direction === 'Long' ? 'LONG' : 'SHORT')} ${pillR(x.grade)}</span></li>`).join('')}</ul><a class="btn btn-ghost" style="margin-top:16px" href="watchlist.html">See the full watchlist →</a>`;
  }).catch(() => failMsg(w, 'watchlist'));
})();

(() => { // watchlist page
  const T = $('wlSwing'); if (!T) return;
  getJSON('watchlist.json').then(d => {
    $('wlMeta').innerHTML = `<span class="ai">● Built by <b>${esc(d.agent)}</b></span><span>Week ending <b>${esc(d.week_ending)}</b></span><span>Prices as of <b>${esc(d.prices_as_of)}</b></span><span>Updated <b>${when(d.generated)}</b></span>`;
    let f = 'all';
    const draw = () => {
      const rows = d.swing.filter(x => f === 'all' || x.direction === f || x.grade === f);
      T.innerHTML = `<thead><tr><th>COMPANY</th><th>DIRECTION</th><th>SETUP</th><th>ENTRY</th><th>STOP</th><th>TARGET</th><th>R:R</th><th>SCORE</th><th>LRC RATING</th><th>STATUS</th></tr></thead><tbody>` +
        rows.map(x => `<tr><td><span class="tic">${esc(x.ticker)}</span><small>${esc(x.name)}</small></td><td>${pillR(x.direction === 'Long' ? 'LONG' : 'SHORT')}</td><td>${esc(x.setup)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</td>
          <td class="n">${fmt(x.entry)}</td><td class="n">${fmt(x.stop)}</td><td class="n">${fmt(x.target)}</td><td class="n">${x.rr}R</td><td class="n">${x.score}/18 ${pillR(x.grade)}</td>
          <td>${pillR(x.rating)}<small>6-m value ${fmt(x.rating_target)}</small></td><td>${esc(x.status)}<small>${esc(x.tech_clearance)}</small></td></tr>`).join('') + '</tbody>';
    };
    document.querySelectorAll('#wlFilters .chip-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#wlFilters .chip-btn').forEach(x => x.classList.remove('on')); b.classList.add('on'); f = b.dataset.f; draw(); }));
    draw();
    $('wlInv').innerHTML = `<thead><tr><th>COMPANY</th><th>STATUS</th><th>SCORE /24</th><th>LRC RATING</th><th>6-M VALUE</th><th>MARGIN OF SAFETY</th></tr></thead><tbody>` +
      d.investment.map(x => `<tr><td><span class="tic">${esc(x.ticker)}</span><small>${esc(x.name)}</small></td><td>${esc(x.status)}</td><td class="n">${x.score} ${pillR(x.grade)}</td><td>${pillR(x.rating)}</td><td class="n">${fmt(x.fair_value)}</td><td class="n" style="color:${x.margin_of_safety >= 0 ? '#5ED39A' : '#F08A7E'}">${pct(x.margin_of_safety)}</td></tr>`).join('') + '</tbody>';
    const r = d.rules;
    $('wlRules').innerHTML = [['Qualify', r.qualify], ['Stop', r.stop], ['Target', r.target + ' (three times the risk)'], ['Risk', r.risk + '; max ' + r.max_shorts + ' shorts open; ' + r.event_risk + ' = event risk']]
      .map(([h, t]) => `<div class="card"><h3>${h}</h3><p>${esc(t)}</p></div>`).join('');
  }).catch(() => failMsg(T, 'watchlist'));
})();
