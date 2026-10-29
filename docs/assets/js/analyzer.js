/* =====================================================================
   LRC Stock Analyzer (analyzer.html)
   - Quick screener on top (reads scan/index.json via window.LRCIndex)
   - Search any company by name or ticker
   - Two reading levels: Plain English (lay person) and Analyst
   - Two lenses: Investor (5-10 years) and Trader (3-12 months)
   - Uses the SAME data as the one-page summary: scan/t/<T>.json + fs/<T>.json
     (one set of numbers on the whole site; nothing is re-estimated here)
   - Follows SAFE MODE (main.js window.LRC_SAFE): grades instead of BUY/SELL,
     no entry / stop / trade targets; intrinsic values shown as model estimates.
   ===================================================================== */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('azApp')) return;
  const DATA = window.LRC_DATA || 'data/';
  const SAFE = window.LRC_SAFE === true;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ok = v => v !== null && v !== undefined && typeof v === 'number' && isFinite(v);
  const get = f => fetch(DATA + f + '?v=' + Math.floor(Date.now() / 3e5)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };

  /* ---------------- state ---------------- */
  let MODE = store('lrc_az_mode') === 'analyst' ? 'analyst' : 'plain';
  let LENS = store('lrc_az_lens') === 'trader' ? 'trader' : 'investor';
  let CUR = null;          // { t, d, fs }
  let FSV = { st: 'is', per: 'annual' };
  const P = () => MODE === 'plain';

  /* ---------------- formatting ---------------- */
  const NF = (v, d) => v.toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sym = c => c === 'ZAR' ? 'R' : c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : (c ? c + ' ' : '');
  const px = (v, c) => ok(v) ? sym(c) + NF(v, v >= 1000 ? 0 : 2) : '—';
  const big = (v, c) => { if (!ok(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '-' : ''; const u = a >= 1e12 ? [1e12, ' tn'] : a >= 1e9 ? [1e9, ' bn'] : a >= 1e6 ? [1e6, ' m'] : a >= 1e3 ? [1e3, ' k'] : [1, '']; return s + sym(c) + NF(a / u[0], a / u[0] >= 100 ? 0 : 1) + u[1]; };
  const pc = (v, d = 1) => ok(v) ? (v > 0 ? '+' : '') + NF(v * 100, d) + '%' : '—';
  const pp = (v, d = 1) => ok(v) ? NF(v * 100, d) + '%' : '—';
  const xx = v => ok(v) ? NF(v, v >= 100 ? 0 : 1) + 'x' : '—';
  const fmtR = (k, f, v) => {
    if (v === null || v === undefined) return '—';
    if (f === 's') return String(v);
    if (!ok(v)) return '—';
    if (f === 'x') return v <= 0 ? 'n/m' : xx(v);
    if (f === 'p') return k === 'momentum' ? pc(v, 1) : pp(v, 1);
    if (f === 'de') return NF(v / 100, 2) + 'x';
    if (f === 'r1') return NF(v, 1);
    if (f === 'r0') return NF(v, 0);
    if (f === 'i') return (v > 0 ? '+' : '') + v;
    if (f === 't') return ({ 2: 'Up (above 50 & 200-day)', 1: 'Mostly up', 0: 'Sideways', '-1': 'Mostly down', '-2': 'Down (below 50 & 200-day)' })[v] || String(v);
    return NF(v, 2);
  };
  const GRADE = { 'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring' };
  const grade = v => !v ? '—' : SAFE ? (GRADE[v] || v) : v;
  const sigCls = v => 'sig sig-' + String(v || 'hold').toLowerCase().replace(/\s+/g, '-');
  const VAL_PLAIN = { UNDERVALUED: 'Looks cheap', 'FAIR VALUE': 'Fairly priced', OVERVALUED: 'Looks expensive' };
  const valTxt = v => !v ? '—' : (P() ? VAL_PLAIN[v] || v : v) + ' · model est.';
  const valCls = v => 'az-val ' + (v === 'UNDERVALUED' ? 'good' : v === 'OVERVALUED' ? 'bad' : 'mid');
  const light = s => !ok(s) ? 'na' : s >= 60 ? 'good' : s >= 40 ? 'mid' : 'bad';
  const cut = (s, n) => s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s || '';
  const short = t => String(t || '').replace('.JO', '');
  const fdate = (s, noDay) => { if (!s || !/^\d{4}-\d{2}/.test(s)) return s || '—'; const d = new Date(s.slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-ZA', noDay ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }); };

  /* =====================================================================
     EXPLANATIONS — p = plain English, a = analyst. hi: true = higher is better,
     false = lower is better, null = depends.
     ===================================================================== */
  const RX = {
    fpe: { hi: false, p: "How many years of next year's expected profit you are paying for. If the share costs R100 and the company is expected to earn R10 a share next year, the P/E is 10. Lower usually means cheaper.", a: 'Price ÷ consensus forward EPS (next fiscal year). Compare within the sector; distorted at cyclical peaks/troughs and by one-offs. Read with PEG and EPS revisions.' },
    tpe: { hi: false, p: 'Same idea as the P/E above, but using the profit the company actually made over the last 12 months instead of a forecast.', a: 'Price ÷ trailing-twelve-month diluted EPS. Backward-looking; meaningless with negative or depressed EPS (shown n/m).' },
    peg: { hi: false, p: 'The P/E divided by how fast profits are growing. Around 1 means the price is fair for the growth on offer; above 2 means you are paying a lot for that growth.', a: 'Forward P/E ÷ expected EPS growth (in %). Lynch heuristic: < 1 cheap for growth. Unstable when growth is low or negative; not used in the LRC Analyst Target.' },
    ps: { hi: false, p: 'What you pay for every R1 (or $1) the company sells. Handy when a company makes little or no profit yet.', a: 'Market cap ÷ TTM revenue. Ignores margins: only compare with peers that have a similar margin structure.' },
    pb: { hi: false, p: "Price compared with the company's net worth on paper — what would be left for shareholders if it sold everything and paid all its debts.", a: 'Market cap ÷ book equity. Most useful for banks, insurers and asset-heavy firms (pair with ROE). Large buybacks shrink equity and inflate P/B.' },
    pfcf: { hi: false, p: 'What you pay for every R1 of spare cash the business produces after paying for its upkeep and investment. Cash is harder to dress up than profit.', a: 'Market cap ÷ (cash from operations − capex). Watch capex cycles and that share-based pay is not deducted from FCF.' },
    ev_ebitda: { hi: false, p: 'Prices the whole business, including its debt, against its operating profit. This lets you compare a company with lots of debt fairly against one with none.', a: '(Market cap + debt − cash) ÷ EBITDA. Capital-structure neutral; ignores capex intensity, leases and tax. LRC uses it vs the sector median as one target method.' },
    rev_growth: { hi: true, p: 'How much more the company sold in its latest quarter than in the same quarter a year ago.', a: 'Latest quarter revenue, year on year. Check currency effects, acquisitions and easy/hard comparison bases.' },
    eps_growth: { hi: true, p: 'How much the profit per share grew compared with the same quarter last year.', a: 'Latest quarter diluted EPS y/y. One-offs, tax changes and buybacks move it; compare with revenue growth for quality.' },
    eps_growth_fwd: { hi: true, p: 'How much professional analysts expect profit per share to grow this financial year.', a: 'Consensus current-FY EPS vs prior FY. The direction of revisions often matters more than the level.' },
    eps_growth_next: { hi: true, p: 'How much analysts expect profit per share to grow next financial year.', a: 'Consensus next-FY EPS vs current FY. Forecasts this far out are less reliable; low analyst coverage on many JSE names.' },
    rev_cagr3: { hi: true, p: 'The average yearly sales growth over three years. Smoother and more trustworthy than one quarter.', a: '3-year revenue CAGR from annual statements. Separate organic growth from acquisitions where possible.' },
    eps_cagr3: { hi: true, p: 'The average yearly growth in profit per share over three years.', a: '3-year EPS CAGR. Sensitive to the start and end years; check against cash-flow growth.' },
    gross_margin: { hi: true, p: 'Out of every R100 of sales, what is left after paying for the product or service itself. A high number usually means the company can charge good prices.', a: 'Gross profit ÷ revenue. Signals pricing power and cost position; not meaningful for banks and insurers.' },
    op_margin: { hi: true, p: 'Out of every R100 of sales, what is left after all running costs — staff, rent, marketing, research.', a: 'Operating income (EBIT) ÷ revenue. Shows cost discipline and operating leverage.' },
    profit_margin: { hi: true, p: 'Out of every R100 of sales, what finally belongs to shareholders after everything, including interest and tax.', a: 'Net income ÷ revenue. Affected by leverage, tax rate and one-off items.' },
    roe: { hi: true, p: "How much profit the company makes with the money shareholders have put in. Around 15% or more is strong. It's like the interest rate the business earns on its owners' money.", a: 'Net income ÷ equity. Inflated by debt and by buybacks that shrink equity — DuPont: net margin × asset turnover × leverage.' },
    roa: { hi: true, p: 'How much profit the company squeezes out of everything it owns. For banks, around 1% or more is good.', a: 'Net income ÷ total assets. Key for banks and asset-heavy businesses; less distorted by leverage than ROE.' },
    de: { hi: false, p: 'How much the company has borrowed compared with what shareholders own. 0.5x means R50 of debt for every R100 of shareholder money. Lower is safer.', a: 'Total debt ÷ equity. Feeds may include leases. Not meaningful for banks (deposits are funding); use capital ratios there.' },
    current_ratio: { hi: true, p: 'Can the company pay the bills due in the next year? Above 1 means its short-term assets cover its short-term debts.', a: 'Current assets ÷ current liabilities. Very high can mean idle cash; below 1 is normal for some retailers with negative working capital.' },
    quick_ratio: { hi: true, p: 'Like the current ratio, but ignoring stock on the shelves, which may be hard to sell quickly.', a: '(Current assets − inventory) ÷ current liabilities. A stricter liquidity test.' },
    fcf_margin: { hi: true, p: 'Out of every R100 of sales, how much ends up as spare cash after investing in the business.', a: 'FCF ÷ revenue. Cash conversion quality; compare with net margin.' },
    net_cash_pct: { hi: true, p: 'Cash minus debt, compared with the size of the company. Positive means it has more cash than debt.', a: '(Cash − total debt) ÷ market cap. Positive gives options: buybacks, deals and protection in a downturn.' },
    div_yield: { hi: true, p: 'The dividend you would receive each year as a percentage of the share price. 4% means about R4 a year for every R100 invested.', a: 'Dividend per share ÷ price. A very high yield can mean the market expects a cut — check payout and cash cover.' },
    payout: { hi: null, p: 'How much of its profit the company pays out as dividends. Above about 80% leaves little room if profits fall.', a: 'Dividends ÷ net income. Above 100% means paying from reserves or borrowing; REITs pay out most by design.' },
    rec_mean: { hi: false, p: 'The average view of professional analysts who follow the company, on a scale from 1 (very positive) to 5 (very negative).', a: 'Mean recommendation, 1 = strong buy … 5 = strong sell. Sell-side ratings skew positive; the change matters more than the level.' },
    tgt_up: { hi: true, p: "The gap between today's price and where professional analysts think the price will be in about a year.", a: 'Median sell-side 12-month target ÷ price − 1. Targets chase price; treat as sentiment, not valuation.' },
    net_upgrades: { hi: true, p: 'Have analysts become more positive (upgrades) or more negative (downgrades) over the last 45 days?', a: 'Upgrades minus downgrades, 45 days. Revision momentum is a known short-term return driver.' },
    short_float: { hi: false, p: 'The share of the available shares that investors have borrowed to bet on the price falling. High means many people expect a drop.', a: 'Short interest ÷ free float. High levels flag bearish conviction but also short-squeeze risk.' },
    insiders: { hi: null, p: 'How much of the company its directors and founders own — their own money on the line.', a: 'Insider ownership. Aligns management with shareholders; very high can limit liquidity and minority influence.' },
    inst: { hi: null, p: 'How much is owned by big funds such as pension funds and unit trusts.', a: 'Institutional ownership. High = well researched and liquid; crowded positions can unwind fast.' },
    trend: { hi: true, p: 'Is the price above its average of the last 50 days and the last 200 days? Above both is an uptrend; below both is a downtrend.', a: 'Price vs 50- and 200-day SMAs (−2 … +2). Many funds only buy above the 200-day.' },
    momentum: { hi: true, p: 'How the share did over the last 6 months compared with the whole market. Positive means it beat the market.', a: '6-month relative strength vs the benchmark (JSE All Share / S&P 500). Momentum persists over 3-12 months.' },
    setup: { hi: true, p: 'The chart pattern our scanner sees right now — for example a breakout above a price that held it back before.', a: 'LRC setup classifier on major support/resistance: Breakout, Retest, Near breakout, Breakdown, Failed retest.' },
    stretch: { hi: null, p: 'RSI measures how fast the price has moved. Above 70 means it has run up a lot and may need a rest; below 30 means it has fallen hard.', a: '14-day RSI. Overbought/oversold readings are context: strong trends stay above 70 for weeks.' },
    volume: { hi: true, p: 'Is more trading happening on days the price rises than on days it falls? Above 1 suggests buyers are more active.', a: 'Up-day volume ÷ down-day volume (recent window). Accumulation vs distribution.' },
    beta: { hi: false, p: 'How much the share swings compared with the market. 1 = moves with the market; 1.5 = swings about 50% more; 0.5 = about half as much.', a: '5-year monthly beta vs the benchmark. Feeds the cost of equity in the DCF (capped at ±2%).' }
  };
  const GROUPS = [
    ['valuation', 'Valuation', 'Is the price reasonable?', 'Compares the price with profits, sales, cash and assets — always against companies in the same sector.'],
    ['growth', 'Growth', 'Is it growing?', 'Are sales and profits getting bigger, and what do analysts expect next?'],
    ['profitability', 'Profitability', 'Is it a good business?', 'How much of every sale the company keeps, and how well it uses its money.'],
    ['health', 'Financial health', 'Is it financially strong?', 'Debt, ability to pay its bills, and spare cash.'],
    ['income', 'Income', 'Does it pay you to own it?', 'Dividends and how safe they look.'],
    ['sentiment', 'Sentiment', 'What do the professionals think?', 'Analyst views, revisions, short sellers and who owns the shares.'],
    ['technical', 'Technical', 'Is the price trend healthy?', 'What the share price chart is doing.']
  ];

  /* statement lines: plain / analyst */
  const LX = {
    rev: ['Everything the company sold in the period — the "top line".', 'Revenue / turnover. For banks the feed often reports total income.'],
    cogs: ['What it cost to make or buy the things it sold.', 'Cost of revenue (COGS).'],
    gp: ['Sales minus the direct cost of what was sold.', 'Revenue − COGS. Basis of gross margin.'],
    sga: ['Running costs: staff, offices, marketing, admin.', 'Selling, general & administrative expenses.'],
    rnd: ['Money spent inventing new products.', 'R&D expense — economically an investment, accounted as a cost.'],
    opex: ['All the costs of running the business.', 'Total operating expenses.'],
    nii: ['For banks: interest earned on loans minus interest paid on deposits.', 'Net interest income — the core earnings line for banks.'],
    op: ['Profit from the main business before interest and tax.', 'Operating income (≈ EBIT).'],
    intexp: ['Interest paid on the company\'s borrowings.', 'Interest expense. Compare with operating income (interest cover).'],
    pti: ['Profit before the tax bill.', 'Pre-tax income, after interest and one-offs.'],
    tax: ['Tax paid on profits.', 'Income tax expense; effective rate = tax ÷ pre-tax income.'],
    ni: ['The final profit that belongs to shareholders — the "bottom line".', 'Net income attributable to common shareholders.'],
    ebitda: ['Operating profit before depreciation and amortisation (accounting charges for wear and tear).', 'EBITDA — proxy for operating cash before capex; ignores capital intensity.'],
    eps: ['Profit for each share you own.', 'Diluted EPS (includes options and convertibles).'],
    eps_b: ['Profit per share, before counting share options.', 'Basic EPS.'],
    shares: ['How many shares exist, including options. Falling = the company is buying back shares.', 'Weighted diluted share count. Rising count = dilution.'],
    cash: ['Cash in the bank and very short-term investments.', 'Cash & short-term investments.'],
    recv: ['Money customers still owe the company.', 'Receivables. Rising faster than revenue can flag aggressive sales.'],
    inv: ['Stock on hand: goods and materials.', 'Inventory. Watch days of inventory vs sales growth.'],
    ca: ['Everything that can be turned into cash within a year.', 'Total current assets.'],
    ppe: ['Factories, buildings, machines, mines, stores.', 'Property, plant & equipment, net of depreciation.'],
    gw: ['The extra paid for companies bought, plus brands and patents.', 'Goodwill & intangibles. Large balances carry impairment risk.'],
    ta: ['Everything the company owns.', 'Total assets.'],
    ap: ['Money the company still owes its suppliers.', 'Accounts payable.'],
    cl: ['Bills and debts due within a year.', 'Total current liabilities.'],
    std: ['Debt that must be repaid within a year.', 'Short-term debt incl. current portion of long-term debt.'],
    ltd: ['Debt repayable after more than a year.', 'Long-term debt.'],
    debt: ['All the money the company has borrowed.', 'Total debt (may include leases).'],
    tl: ['Everything the company owes.', 'Total liabilities.'],
    eq: ['What belongs to shareholders: what it owns minus what it owes.', "Shareholders' equity (book value)."],
    netdebt: ['Debt minus cash. Negative means more cash than debt.', 'Net debt. Compare with EBITDA (net debt / EBITDA).'],
    wc: ['Short-term assets minus short-term bills.', 'Working capital = current assets − current liabilities.'],
    tbv: ['Net worth without goodwill and intangibles — only "hard" assets.', 'Tangible book value. Key for banks (P/TBV).'],
    so: ['Number of shares in issue.', 'Shares outstanding at period end.'],
    cfo: ['Cash actually coming in from day-to-day business.', 'Cash from operations. Should track or exceed net income over time.'],
    capex: ['Money spent on new equipment, buildings and upkeep.', 'Capital expenditure (shown negative).'],
    fcf: ['Cash left over after running and investing in the business — what can pay dividends, buy back shares or repay debt.', 'Free cash flow = CFO − capex.'],
    da: ['The yearly accounting charge for wear and tear.', 'Depreciation & amortisation (non-cash).'],
    sbc: ['Pay given to staff in shares instead of cash. It dilutes owners.', 'Share-based compensation — a real cost excluded from FCF.'],
    cfi: ['Cash spent on (or received from) investments and acquisitions.', 'Cash from investing activities.'],
    cff: ['Cash from borrowing, repaying debt, dividends and buybacks.', 'Cash from financing activities.'],
    div: ['Cash paid to shareholders as dividends.', 'Dividends paid.'],
    buyback: ['Cash used to buy back the company\'s own shares — each remaining share then owns more.', 'Share repurchases.'],
    debt_in: ['New money borrowed.', 'Debt issued.'],
    debt_out: ['Debt paid back.', 'Debt repaid.'],
    chg_cash: ['How much the cash balance went up or down.', 'Net change in cash.']
  };
  const KEY_LINES = { is: ['rev', 'nii', 'gp', 'op', 'ni', 'eps'], bs: ['cash', 'ta', 'debt', 'tl', 'eq', 'netdebt'], cf: ['cfo', 'capex', 'fcf', 'div', 'buyback'] };
  const ST_NAME = { is: ['Income statement', 'What the company earned and spent'], bs: ['Balance sheet', 'What it owns and what it owes'], cf: ['Cash flow', 'Where the cash actually came from and went'] };

  /* valuation methods */
  const MX = [
    ['dcf', 'Discounted cash flow (DCF)',
      'Adds up all the spare cash the business should produce in future and converts it into today\'s money (a rand next year is worth less than a rand today). That total, split per share, is what the business is "worth" on its cash.',
      'Two-stage FCF DCF: 5 years at the growth input fading to terminal growth, discounted at the cost of equity; equity value ÷ shares. Highly sensitive to the discount rate and terminal growth.'],
    ['residual_income', 'Residual income',
      'Used for banks and insurers. Starts with what shareholders own today and adds the extra profit the company should earn above what investors demand as a minimum return.',
      'Book value + PV of (ROE − cost of equity) × book value, two-stage. Suited to financials where FCF is not meaningful.'],
    ['ddm', 'Dividend & buyback model',
      'Values the share on the cash it hands back to owners — dividends plus share buybacks — grown into the future and converted to today\'s money.',
      'Shareholder-yield DDM: (dividends + buybacks) grown then discounted at the cost of equity. Used for real estate, utilities and financials.'],
    ['ev_ebitda', 'EV/EBITDA vs peers',
      'What the company would be worth if the market priced it like an average company in its sector, based on its operating profit.',
      'Sector-median EV/EBITDA × company EBITDA (5-year average EBITDA for mining and energy), less net debt, per share. A relative, not absolute, value.'],
    ['analyst_median', 'Analyst consensus',
      'The middle of the 12-month price targets published by professional analysts. Included only when at least 3 analysts cover the company.',
      'Median sell-side target (≥ 3 analysts). A sentiment anchor; equal-weighted with the models.']
  ];

  /* ---------------- shell: toggles ---------------- */
  const setMode = m => { MODE = m; store('lrc_az_mode', m); syncToggles(); if (CUR) render(); };
  const setLens = l => { LENS = l; store('lrc_az_lens', l); syncToggles(); if (CUR) render(); };
  function syncToggles() {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === MODE));
    document.querySelectorAll('[data-lens]').forEach(b => b.classList.toggle('on', b.dataset.lens === LENS));
    $('azApp').classList.toggle('az-plain', P());
    $('azModeNote').textContent = P() ? 'Plain English: every number is explained in everyday words.' : 'Analyst: full tables, formulas, sector & market medians and model inputs.';
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.querySelectorAll('[data-lens]').forEach(b => b.addEventListener('click', () => setLens(b.dataset.lens)));
  syncToggles();

  /* =====================================================================
     QUICK SCREENER + SEARCH
     ===================================================================== */
  let ROWS = [], SHOW = 15;
  const SC = { mkt: (() => { try { return JSON.parse(localStorage.getItem('lrc_mkt')) || 'JSE'; } catch (e) { return 'JSE'; } })(), sec: '', iv: '', tr: '', val: '', size: '', sort: 'score', thin: true, preset: '' };
  const RANK = { 'STRONG BUY': 5, 'BUY': 4, 'HOLD': 3, 'SELL': 2, 'STRONG SELL': 1 };
  const sizeOf = r => { const m = r.mcap || 0, z = r.m === 'JSE'; const L = z ? 50e9 : 10e9, M = z ? 5e9 : 2e9; return m >= L ? 'large' : m >= M ? 'mid' : 'small'; };
  const PRESETS = {
    quality: { l: 'Quality at a fair price', d: 'Strong long-term grade and not expensive on our models', f: r => RANK[r.iv_v] >= 4 && r.val !== 'OVERVALUED' },
    cheap: { l: 'Looks cheap (model)', d: 'At least 20% below the LRC model estimate, or cheap on ratios', f: r => r.val === 'UNDERVALUED' },
    trend: { l: 'Strong price trend', d: 'Strong or top trading grade', f: r => RANK[r.v] >= 4 },
    big: { l: 'Biggest companies', d: 'Large companies, sorted by size', f: r => sizeOf(r) === 'large', sort: 'mcap' },
    weak: { l: 'Warning signs', d: 'Weak or lowest long-term grade', f: r => RANK[r.iv_v] <= 2 }
  };

  function screen() {
    let a = ROWS.filter(r => r.m === SC.mkt);
    if (SC.thin) a = a.filter(r => r.liq !== 'thin');
    if (SC.sec) a = a.filter(r => r.sec === SC.sec);
    if (SC.iv) a = a.filter(r => (RANK[r.iv_v] || 0) >= +SC.iv);
    if (SC.tr) a = a.filter(r => (RANK[r.v] || 0) >= +SC.tr);
    if (SC.val) a = a.filter(r => r.val === SC.val);
    if (SC.size) a = a.filter(r => sizeOf(r) === SC.size);
    if (SC.preset && PRESETS[SC.preset]) a = a.filter(PRESETS[SC.preset].f);
    const k = SC.sort, by = { score: r => r.score ?? -1, mcap: r => r.mcap ?? 0, chg: r => r.chg ?? -9, p1m: r => r.p1m ?? -9, chgd: r => -(r.chg ?? 9), iv: r => (RANK[r.iv_v] || 0) * 1000 + (r.score || 0) }[k] || (r => r.score);
    return a.sort((x, y) => by(y) - by(x));
  }
  function drawScreen() {
    const a = screen(), el = $('azScrRes');
    $('azScrCount').textContent = `${a.length.toLocaleString('en-ZA')} ${a.length === 1 ? 'company' : 'companies'} match`;
    if (!a.length) { el.innerHTML = '<p class="az-empty">No company matches all of these filters. Loosen one of them, or clear the filters.</p>'; return; }
    el.innerHTML = `<div class="az-sr-head"><span>Company</span><span>Price</span><span>Today</span><span>Long-term grade</span><span>Trading grade</span><span>Valuation</span><span></span></div>` +
      a.slice(0, SHOW).map(r => `<button class="az-sr" data-t="${esc(r.t)}"><span class="az-sr-n"><b>${esc(short(r.t))}</b> ${esc(r.n)}<small>${esc(r.sec || '')} · ${big(r.mcap, r.cur)}</small></span>
        <span class="az-sr-px">${px(r.px, r.cur)}</span><span class="az-sr-ch ${(r.chg || 0) >= 0 ? 'up' : 'dn'}">${pc(r.chg, 1)}</span>
        <span><small class="az-ml">Long-term</small><i class="${sigCls(r.iv_v)}">${esc(grade(r.iv_v))}</i></span><span><small class="az-ml">Trading</small><i class="${sigCls(r.v)}">${esc(grade(r.v))}</i> <em>${r.score ?? '—'}</em></span>
        <span><i class="${valCls(r.val)}">${esc(r.val ? (VAL_PLAIN[r.val] || r.val) : '—')}</i></span><span class="az-sr-go">Analyse →</span></button>`).join('') +
      (a.length > SHOW ? `<button class="btn btn-ghost az-more" id="azMore">Show ${Math.min(15, a.length - SHOW)} more</button>` : '');
    el.querySelectorAll('.az-sr').forEach(b => b.addEventListener('click', () => open(b.dataset.t, true)));
    if ($('azMore')) $('azMore').onclick = () => { SHOW += 15; drawScreen(); };
  }
  function fillSectors() {
    const s = [...new Set(ROWS.filter(r => r.m === SC.mkt).map(r => r.sec).filter(Boolean))].sort();
    $('azSec').innerHTML = '<option value="">All sectors</option>' + s.map(x => `<option${x === SC.sec ? ' selected' : ''}>${esc(x)}</option>`).join('');
  }
  function bindScreen() {
    const gOpts = sel => sel.innerHTML = '<option value="">Any</option>' + [[5, SAFE ? 'Top scoring only' : 'STRONG BUY only'], [4, SAFE ? 'Strong or better' : 'BUY or better'], [3, SAFE ? 'Average or better' : 'HOLD or better']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    gOpts($('azIv')); gOpts($('azTr'));
    $('azMkt').value = SC.mkt;
    $('azPresets').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button class="az-chip" data-p="${k}" title="${esc(p.d)}">${esc(p.l)}</button>`).join('') + '<button class="az-chip az-clear" data-p="">Clear filters</button>';
    $('azPresets').querySelectorAll('.az-chip').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.p;
      if (!k) { Object.assign(SC, { sec: '', iv: '', tr: '', val: '', size: '', preset: '', sort: 'score' }); ['azSec', 'azIv', 'azTr', 'azVal', 'azSize'].forEach(i => $(i).value = ''); $('azSort').value = 'score'; }
      else { SC.preset = SC.preset === k ? '' : k; if (PRESETS[k].sort && SC.preset) { SC.sort = PRESETS[k].sort; $('azSort').value = SC.sort; } }
      $('azPresets').querySelectorAll('.az-chip').forEach(c => c.classList.toggle('on', !!SC.preset && c.dataset.p === SC.preset));
      SHOW = 15; drawScreen();
    }));
    const on = (id, k) => $(id).addEventListener('change', () => { SC[k] = $(id).type === 'checkbox' ? $(id).checked : $(id).value; if (k === 'mkt') { SC.sec = ''; fillSectors(); try { localStorage.setItem('lrc_mkt', JSON.stringify(SC.mkt)); } catch (e) { } window.dispatchEvent(new CustomEvent('lrcmarket', { detail: SC.mkt })); } SHOW = 15; drawScreen(); });
    on('azMkt', 'mkt'); on('azSec', 'sec'); on('azIv', 'iv'); on('azTr', 'tr'); on('azVal', 'val'); on('azSize', 'size'); on('azSort', 'sort'); on('azThin', 'thin');
    window.addEventListener('lrcmarket', e => { if (e.detail && e.detail !== SC.mkt) { SC.mkt = e.detail; $('azMkt').value = SC.mkt; SC.sec = ''; fillSectors(); drawScreen(); } });
  }

  /* search box */
  function bindSearch() {
    const q = $('azQ'), res = $('azQRes');
    let hits = [], k = 0;
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) { res.innerHTML = ''; res.hidden = true; return; }
      const sc = r => { const t = short(r.t).toLowerCase(), n = (r.n || '').toLowerCase(); return t === s ? 0 : t.startsWith(s) ? 1 : n.startsWith(s) ? 2 : n.includes(' ' + s) ? 3 : (t.includes(s) || n.includes(s)) ? 4 : 9; };
      hits = ROWS.map(r => [sc(r), r]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || (b[1].mcap || 0) - (a[1].mcap || 0)).slice(0, 8).map(x => x[1]);
      k = 0; res.hidden = false;
      res.innerHTML = hits.length ? hits.map((r, i) => `<button class="az-qr${i ? '' : ' on'}" data-t="${esc(r.t)}"><b>${esc(short(r.t))}</b><span>${esc(r.n)}<small>${r.m === 'JSE' ? 'JSE' : 'New York'} · ${esc(r.sec || '')}</small></span><em>${px(r.px, r.cur)}</em></button>`).join('') : '<p class="az-empty">No company found. Try the ticker (e.g. NPN, AAPL) or part of the name.</p>';
      res.querySelectorAll('.az-qr').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); pick(b.dataset.t); }));
    };
    const pick = t => { q.value = ''; res.hidden = true; open(t, true); };
    q.addEventListener('input', draw);
    q.addEventListener('keydown', e => {
      const b = res.querySelectorAll('.az-qr');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!b.length) return; k = (k + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length; b.forEach((x, i) => x.classList.toggle('on', i === k)); }
      else if (e.key === 'Enter') { e.preventDefault(); if (hits[k]) pick(hits[k].t); else if (q.value.trim()) pick(q.value.trim().toUpperCase()); }
      else if (e.key === 'Escape') { res.hidden = true; }
    });
    q.addEventListener('blur', () => setTimeout(() => res.hidden = true, 150));
    q.addEventListener('focus', () => { if (q.value.trim()) draw(); });
  }

  /* =====================================================================
     ANALYSIS
     ===================================================================== */
  function open(t, push) {
    const T = String(t).trim();
    if (!T) return;
    if (push) history.pushState({ t: T }, '', 'analyzer.html?t=' + encodeURIComponent(T));
    if ($('azScr')) $('azScr').open = false;
    $('azOut').innerHTML = `<div class="az-loading">Loading ${esc(short(T))}…</div>`;
    $('azOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const f = T.replace('^', '_');
    Promise.allSettled([get('scan/t/' + f + '.json'), get('fs/' + f + '.json')]).then(([a, b]) => {
      if (a.status !== 'fulfilled') {
        const m = ROWS.find(r => short(r.t).toLowerCase() === short(T).toLowerCase() || r.t.toLowerCase() === T.toLowerCase());
        if (m && m.t !== T) return open(m.t, true);
        $('azOut').innerHTML = `<div class="az-card"><h3>We couldn't find “${esc(T)}”</h3><p>It may not be in the LRC Stock Scanner yet (we cover about 2,500 New York and all liquid JSE companies). Search by name above or pick one from the screener.</p></div>`; return;
      }
      CUR = { t: T, d: a.value, fs: b.status === 'fulfilled' ? b.value : null };
      FSV = { st: 'is', per: 'annual' };
      render();
    });
  }
  window.addEventListener('popstate', () => { const t = new URLSearchParams(location.search).get('t'); if (t) open(t, false); else { CUR = null; $('azOut').innerHTML = ''; } });

  function render() {
    const { d } = CUR, r = d.row, nm = r.n || short(r.t);
    document.title = `${nm} (${short(r.t)}) — Stock Analyzer | Leago Rifumo Capital`;
    const S = {
      head: secHead(d), minute: secMinute(d), value: secValue(d), ratios: secRatios(d), fs: secStatements(), price: secPrice(d),
      pros: secPros(d), income: secIncome(d), check: secChecklist(d), next: secNext(d)
    };
    const order = LENS === 'trader' ? ['head', 'minute', 'price', 'pros', 'ratios', 'value', 'fs', 'income', 'check', 'next'] : ['head', 'minute', 'value', 'ratios', 'fs', 'income', 'check', 'pros', 'price', 'next'];
    const toc = [['minute', 'In one minute'], ['value', 'What is it worth?'], ['ratios', 'All ratios'], ['fs', 'Financial statements'], ['price', 'Price & chart'], ['pros', 'Professionals'], ['income', 'Dividends'], ['check', 'Checklist']];
    const tocO = order.filter(k => toc.find(x => x[0] === k)).map(k => toc.find(x => x[0] === k));
    $('azOut').innerHTML = S.head + `<nav class="az-toc">${tocO.map(([k, l]) => `<a href="#az-${k}">${l}</a>`).join('')}</nav>` + order.slice(1).map(k => S[k]).join('') +
      `<p class="az-foot">Data: ${esc(window.LRCBrand ? window.LRCBrand(d.source || '') : '')}${CUR.fs ? ' · ' + esc((CUR.fs.src || []).join(', ')) : ''}. Scored ${esc((d.generated || '').replace('T', ' '))} SAST. Educational research, not personal financial advice. Model estimates can be wrong — always check the source.</p>`;
    bindRender();
  }

  /* ---------- header ---------- */
  function secHead(d) {
    const r = d.row, t = d.tech || {}, c = r.cur, ctx = d.context || {}, prof = d.profile || {};
    const lensG = LENS === 'trader' ? ['Trading grade', '3–12 months', r.v, r.score] : ['Long-term grade', '5–10 years', r.iv_v, r.iv_score];
    const othG = LENS === 'trader' ? ['Long-term grade', '5–10 years', r.iv_v, r.iv_score] : ['Trading grade', '3–12 months', r.v, r.score];
    const rank = ctx.mkt_rank ? `${ordinal(ctx.mkt_rank)} largest of ${ctx.mkt_n.toLocaleString('en-ZA')} ${r.m === 'JSE' ? 'JSE' : 'New York'} companies we track${ctx.sec_rank ? ` · ${ordinal(ctx.sec_rank)} of ${ctx.sec_n} in ${esc(r.sec)}` : ''}` : '';
    return `<section class="az-head" id="az-head">
      <div class="az-h-l"><div class="az-tk">${esc(short(r.t))}<small>${r.m === 'JSE' ? 'JSE' : 'NYSE / Nasdaq'}</small></div>
        <div><h2>${esc(r.n)}</h2><p class="az-sub">${esc(r.sec || '')}${r.ind ? ' · ' + esc(r.ind) : ''}${rank ? '<br>' + rank : ''}</p></div></div>
      <div class="az-h-px"><b>${px(t.price ?? r.px, c)}</b><span class="${(r.chg || 0) >= 0 ? 'up' : 'dn'}">${pc(r.chg, 2)} today</span><small>Market value ${big(r.mcap, c)} · 52-week ${px(t.lo52, c)} – ${px(t.hi52, c)}</small></div>
      <div class="az-h-g">
        <div class="az-g main"><span>${lensG[0]} <small>${lensG[1]}</small></span><i class="${sigCls(lensG[2])}">${esc(grade(lensG[2]))}</i><em>${lensG[3] ?? '—'}/100</em></div>
        <div class="az-g"><span>${othG[0]} <small>${othG[1]}</small></span><i class="${sigCls(othG[2])}">${esc(grade(othG[2]))}</i><em>${othG[3] ?? '—'}/100</em></div>
        <div class="az-g"><span>Valuation</span><i class="${valCls(r.val)}">${esc(valTxt(r.val))}</i></div>
      </div>
      ${prof.summary ? `<details class="az-about"><summary><b>What does ${esc(r.n)} do?</b> ${esc(cut(prof.summary, 180))}</summary><p>${esc(prof.summary)}</p></details>` : ''}
      <div class="az-links"><a class="btn btn-ghost" href="stock.html?t=${encodeURIComponent(r.t)}">One-page summary (PDF)</a><a class="btn btn-ghost" href="shares/${slug(r.t)}.html">Company profile</a><a class="btn btn-ghost" href="scanner.html">Full scanner</a></div>
    </section>`;
  }
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  const slug = t => String(t).toLowerCase().replace(/\.jo$/, '-jse').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /* ---------- in one minute ---------- */
  function secMinute(d) {
    const r = d.row, g = r.grp || {}, f = d.f || {}, ms = (d.medians || {}).sector || {}, t = d.tech || {}, c = r.cur, nm = r.n;
    const line = {
      profitability: () => ok(f.op_margin) ? `Keeps ${pp(f.op_margin, 0)} of every sale as operating profit (sector typical: ${pp(ms.op_margin, 0)})${ok(f.roe) ? ` and earns ${pp(f.roe, 0)} a year on shareholders' money` : ''}.` : ok(f.roe) ? `Earns ${pp(f.roe, 0)} a year on shareholders' money (sector typical: ${pp(ms.roe, 0)}).` : '',
      growth: () => ok(f.rev_growth) ? `Sales ${f.rev_growth >= 0 ? 'grew' : 'fell'} ${pp(Math.abs(f.rev_growth), 0)} vs a year ago${ok(f.eps_growth_fwd) ? `; analysts expect profit per share to ${f.eps_growth_fwd >= 0 ? 'grow' : 'fall'} ${pp(Math.abs(f.eps_growth_fwd), 0)} this year` : ''}.` : '',
      health: () => ok(f.de) ? `Has ${NF(f.de / 100, 2)}x as much debt as shareholder money${ok(f.net_cash_pct) ? (f.net_cash_pct >= 0 ? ', and more cash than debt' : '') : ''}${ok(f.current_ratio) ? `; short-term assets cover short-term bills ${NF(f.current_ratio, 1)}x` : ''}.` : ok(f.current_ratio) ? `Short-term assets cover short-term bills ${NF(f.current_ratio, 1)}x.` : '',
      valuation: () => ok(f.fpe) && f.fpe > 0 ? `You pay ${xx(f.fpe)} next year's profit vs ${xx(ms.fpe)} for a typical ${esc(r.sec)} company.` : ok(f.ps) ? `You pay ${xx(f.ps)} its yearly sales (sector typical: ${xx(ms.ps)}).` : '',
      income: () => ok(f.div_yield) && f.div_yield > 0 ? `Pays a dividend of about ${pp(f.div_yield, 1)} a year${ok(f.payout) ? `, using ${pp(f.payout, 0)} of its profit` : ''}.` : 'Pays no regular dividend at the moment.',
      sentiment: () => f.n_analysts ? `${f.n_analysts} professional analyst${f.n_analysts > 1 ? 's' : ''} follow it${ok(f.target_median) ? `; their middle 12-month target is ${px(f.target_median, c)} (${pc(f.target_median / (t.price || r.px) - 1, 0)})` : ''}.` : 'Few or no professional analysts cover it — normal for smaller JSE companies.',
      technical: () => `Price is ${t.price > t.sma200 ? 'above' : 'below'} its 200-day average${ok(t.sma50) ? ` and ${t.price > t.sma50 ? 'above' : 'below'} its 50-day average` : ''}; ${pc(t.perf_6m, 0)} over 6 months.`
    };
    const q = GROUPS.map(([k, l, qq]) => { const s = g[k], cls = light(s), word = cls === 'good' ? 'Yes / good' : cls === 'mid' ? 'Mixed' : cls === 'bad' ? 'Weak' : 'No data';
      let txt = ''; try { txt = line[k] ? line[k]() : ''; } catch (e) { }
      return `<div class="az-q ${cls}"><div class="az-q-t"><span class="az-dot"></span><b>${P() ? qq : l}</b><em>${P() ? word : (ok(s) ? s + '/100' : '—')}</em></div>${txt ? `<p>${txt}</p>` : ''}</div>`; }).join('');
    const strong = GROUPS.filter(([k]) => g[k] >= 60).map(x => x[1].toLowerCase()), weak = GROUPS.filter(([k]) => ok(g[k]) && g[k] < 40).map(x => x[1].toLowerCase());
    const sum = `${esc(nm)} scores <b>${LENS === 'trader' ? r.score : r.iv_score}/100</b> for ${LENS === 'trader' ? 'traders (3–12 months)' : 'long-term investors (5–10 years)'}. ${strong.length ? `Strongest on <b>${strong.join(', ')}</b>. ` : ''}${weak.length ? `Weakest on <b>${weak.join(', ')}</b>. ` : ''}Our models say it ${r.val === 'UNDERVALUED' ? '<b>looks cheap</b>' : r.val === 'OVERVALUED' ? '<b>looks expensive</b>' : 'is <b>fairly priced</b>'} (model estimate).`;
    const notes = !P() ? [r.v_note && `Trading gate: ${esc(r.v_note)}`, r.iv_note && `Investment gate: ${esc(r.iv_note)}`].filter(Boolean) : [];
    return `<section class="az-card" id="az-minute"><div class="az-st"><h3>${P() ? 'In one minute' : 'Scorecard'}</h3><p>${P() ? 'Seven plain questions every investor should ask. Green = good, amber = mixed, red = weak — each judged against similar companies.' : 'Group scores 0–100 (50 + 50 × points ÷ possible), each reading scored +1/0/−1 against the sector median or fixed lines.'}</p></div>
      <p class="az-lead">${sum}</p><div class="az-qs">${q}</div>${notes.length ? `<p class="az-note">${notes.join('<br>')}</p>` : ''}
      ${P() ? `<details class="az-learn"><summary>How are the grades worked out?</summary><p>We score ${(d.readings_def || []).length || 37} readings against companies in the same sector. The <b>long-term grade</b> leans on value, profitability, financial strength and growth. The <b>trading grade</b> leans on the price trend, growth and what analysts are doing. ${SAFE ? 'Grades run from Lowest scoring to Top scoring.' : 'Ratings run from STRONG SELL to STRONG BUY.'} A grade describes the numbers today; it is not a promise about the future.</p></details>` :
        `<details class="az-learn"><summary>Weights</summary><p><b>Trading (3–12 m):</b> technical 35, growth 20, sentiment 20, valuation 10, profitability 10, health 5. <b>Investment (5–10 y):</b> valuation 25, profitability 25, health 20, growth 20, income 10. Bands: 75+ ${grade('STRONG BUY')}, 60–74 ${grade('BUY')}, 40–59 ${grade('HOLD')}, 25–39 ${grade('SELL')}, &lt;25 ${grade('STRONG SELL')}; then the senior-analyst gates (upside, 200-day trend, liquidity, results date, quality grade, FCF, D/E).</p></details>`}
    </section>`;
  }

  /* ---------- intrinsic value ---------- */
  function secValue(d) {
    const r = d.row, tg = d.targets || {}, c = r.cur, price = (d.tech || {}).price || r.px, inp = tg.inputs || {}, notes = tg.notes || {};
    const blend = tg.blend;
    const meth = MX.filter(([k]) => ok(tg[k]));
    const skipped = MX.filter(([k]) => !ok(tg[k]) && notes[k]);
    if (!ok(blend)) return `<section class="az-card" id="az-value"><div class="az-st"><h3>What is it worth?</h3></div><p>Not enough reliable data to estimate a value for ${esc(r.n)} yet (for example negative or unstable cash flow and no analyst coverage). We would rather show nothing than a made-up number.</p></section>`;
    const gap = blend / price - 1;
    const pos = Math.max(0, Math.min(100, 50 + (gap * -1) * 125)); // price vs value: left = cheap
    const lo = Math.min(tg.low ?? blend, price), hi = Math.max(tg.high ?? blend, price), span = (hi - lo) || 1;
    const X = v => ((v - lo) / span * 100).toFixed(1);
    const verdict = gap >= 0.2 ? ['cheap', `looks <b>cheap</b>: our model estimate is ${pc(gap, 0)} above today's price`] : gap <= -0.2 ? ['exp', `looks <b>expensive</b>: today's price is ${pc(-gap, 0).replace('+', '')} above our model estimate`] : ['fair', `looks <b>fairly priced</b>: today's price is within 20% of our model estimate (${pc(gap, 0)})`];
    const rows = meth.map(([k, l, pl, an]) => `<div class="az-m"><div class="az-m-top"><b>${l}</b><span>${px(tg[k], c)}</span><em class="${tg[k] >= price ? 'up' : 'dn'}">${pc(tg[k] / price - 1, 0)}</em></div><p>${P() ? pl : an}</p></div>`).join('');
    const rev = ok(tg.implied_growth) ? `<div class="az-m az-rev"><div class="az-m-top"><b>Reverse DCF — what today's price assumes</b><span>${pp(tg.implied_growth, 0)} a year</span></div><p>${P() ? `To be worth today's price, ${esc(r.n)} would need to grow its spare cash by about <b>${pp(tg.implied_growth, 0)} a year</b> for five years. ${ok(inp.rev_cagr) ? `Over the last five years its sales grew about ${pp(inp.rev_cagr, 0)} a year. ` : ''}If the needed growth is much higher than what it has achieved, the market is being optimistic.` : `Solves for the 5-year FCF growth that equates DCF value to price, at r = ${pp(inp.r, 1)} and g∞ = ${pp(inp.g_term, 1)}. Shown, not averaged.${ok(inp.rev_cagr) ? ` 5-yr revenue CAGR: ${pp(inp.rev_cagr, 1)}.` : ''}`}</p></div>` : '';
    const assum = ok(inp.r) ? (P() ? `<details class="az-learn"><summary>What goes into these models?</summary><ul>
        <li><b>Return investors want: ${pp(inp.r, 1)} a year.</b> The government bond rate plus extra for the risk of owning shares. A higher number makes future cash worth less today.</li>
        <li><b>Growth for the next 5 years: ${pp(inp.g1, 1)} a year.</b> The average of what analysts expect and what the company achieved before, kept between −5% and 20%.</li>
        <li><b>Growth after that, forever: ${pp(inp.g_term, 1)} a year.</b> Roughly long-run economic growth plus inflation.</li>
        <li>Methods that give silly answers (below a quarter or above four times the price) are dropped, and the final estimate is kept between half and double the price.</li></ul></details>` :
      `<div class="az-tw"><table class="az-tbl az-inp"><tr><td>Cost of equity (r)</td><td>${pp(inp.r, 2)}</td><td>10y bond + ERP (5.5% JSE / 5% US) ± beta adj. (max ±2%)</td></tr><tr><td>Growth yrs 1–5 (g₁)</td><td>${pp(inp.g1, 2)}</td><td>avg(analyst EPS growth, 5-yr revenue CAGR), capped −5%…20%</td></tr><tr><td>Terminal growth (g∞)</td><td>${pp(inp.g_term, 2)}</td><td>4.5% JSE / 2.5% US</td></tr>${ok(inp.rev_cagr) ? `<tr><td>5-yr revenue CAGR</td><td>${pp(inp.rev_cagr, 2)}</td><td>from annual statements</td></tr>` : ''}<tr><td>Filters</td><td colspan="2">methods outside 0.25x–4x price dropped; final within 0.5x–2x price; equal-weight average</td></tr></table></div>`) : '';
    return `<section class="az-card" id="az-value"><div class="az-st"><h3>${P() ? 'What is it worth?' : 'Intrinsic value'}</h3><p>${P() ? `The price is what you pay; the value is what you get. We estimate the value of ${esc(r.n)} in up to ${MX.length} different ways and average the ones that suit this kind of company.` : `LRC Analyst Target = equal-weight average of the methods that fit (${esc(tg.basis || '')}).`}</p></div>
      <div class="az-iv ${verdict[0]}"><div class="az-iv-n"><span>Today's price</span><b>${px(price, c)}</b></div><div class="az-iv-n"><span>${P() ? 'Our model estimate' : 'LRC Analyst Target <small>· model estimate</small>'}</span><b>${px(blend, c)}</b></div><div class="az-iv-n"><span>${P() ? 'Difference' : 'Margin of safety'}</span><b class="${gap >= 0 ? 'up' : 'dn'}">${pc(gap, 0)}</b></div></div>
      <p class="az-lead">${esc(r.n)} ${verdict[1]}.</p>
      <div class="az-meter"><div class="az-meter-bar"><span>Cheap</span><span>Fair</span><span>Expensive</span></div><i style="left:${pos}%"></i></div>
      ${ok(tg.low) && ok(tg.high) ? `<div class="az-range"><div class="az-range-bar"><b style="left:${X(tg.low)}%;width:${(X(tg.high) - X(tg.low))}%"></b><i class="p" style="left:${X(price)}%" title="Price"></i><i class="v" style="left:${X(blend)}%" title="Estimate"></i></div><div class="az-range-l"><span>Lowest method ${px(tg.low, c)}</span><span><i class="p"></i>Price <i class="v"></i>Estimate</span><span>Highest method ${px(tg.high, c)}</span></div></div>` : ''}
      <div class="az-ms">${rows}${rev}</div>
      ${skipped.length ? `<p class="az-note">${P() ? 'Not used for this company: ' : 'Excluded: '}${skipped.map(([k, l]) => `<b>${l}</b> (${esc(notes[k])})`).join('; ')}.</p>` : ''}
      ${assum}
      <p class="az-note">${SAFE ? 'Model estimates are educational and are not a price target or a recommendation. ' : ''}Valuation verdict rules: <b>cheap</b> = 20%+ below the estimate, or cheap on ratios with 10%+ room; <b>expensive</b> = 20%+ above it, or expensive on ratios with 5%+ downside; otherwise fair.</p>
    </section>`;
  }

  /* ---------- all ratios ---------- */
  function secRatios(d) {
    const r = d.row, rd = r.rd || {}, DEF = d.readings_def || [], MS = (d.medians || {}).sector || {}, MM = (d.medians || {}).market || {};
    const word = p => p > 0 ? 'Good sign' : p < 0 ? 'Warning' : 'Neutral';
    const chip = q => !q || q[1] === null || q[1] === undefined ? '<span class="az-chip0">—</span>' : `<span class="az-pt ${q[2] >= 2 ? 'p2' : q[1] > 0 ? 'p1' : q[2] <= -2 ? 'm2' : q[1] < 0 ? 'm1' : 'z'}">${P() ? word(q[1]) : (q[1] > 0 ? '+' + q[1] : q[1]) + ' ' + (q[1] > 0 ? 'Better' : q[1] < 0 ? 'Worse' : 'Neutral')}</span>`;
    const blocks = GROUPS.map(([gk, gl, gq, gd]) => {
      const items = DEF.filter(x => x.g === gk);
      if (!items.length) return '';
      const s = (r.grp || {})[gk];
      const body = items.map(x => {
        const q = rd[x.k], v = q ? q[0] : null, e = RX[x.k] || {}, nomed = ['trend', 'setup'].includes(x.k);
        const nm = naMetric(x.k, v, r); const cmp = !nomed && !nm && ok(v) && ok(MS[x.k]) ? compare(x, v, MS[x.k], r.sec, q ? q[1] : null) : '';
        const vt = nm ? 'n/m' : (P() && (v === null || v === undefined) ? 'No data' : fmtR(x.k, x.f, v)), ch = nm ? `<span class="az-chip0">${P() ? 'Not used for financial companies' : 'n/a'}</span>` : chip(q), ex = extra(x.k, v, r);
        return P() ? `<div class="az-r"><div class="az-r-top"><b>${esc(x.l)}</b><span class="az-r-v">${esc(vt)}</span>${ch}</div><p>${e.p || ''}${ex}</p>${cmp ? `<p class="az-r-cmp">${cmp}</p>` : ''}</div>`
          : `<tr><td><details><summary>${esc(x.l)}</summary><p>${e.a || ''}${e.hi === true ? ' <i>Higher is better.</i>' : e.hi === false ? ' <i>Lower is better.</i>' : ''}${ex}</p></details></td><td class="n"><b>${esc(vt)}</b></td><td class="n">${nomed ? '' : esc(fmtR(x.k, x.f, MS[x.k]))}</td><td class="n">${nomed ? '' : esc(fmtR(x.k, x.f, MM[x.k]))}</td><td>${ch}</td></tr>`;
      }).join('');
      return P() ? `<details class="az-grp" ${gk === 'valuation' || gk === (LENS === 'trader' ? 'technical' : 'profitability') ? 'open' : ''}><summary><span class="az-dot ${light(s)}"></span><b>${gq}</b><small>${gl} · ${items.length} readings</small><em>${ok(s) ? s + '/100' : '—'}</em></summary><p class="az-gd">${gd}</p>${body}</details>`
        : `<tbody><tr class="az-rg"><td colspan="5">${gl} <span>${ok(s) ? s : '—'}/100</span></td></tr>${body}</tbody>`;
    }).join('');
    return `<section class="az-card" id="az-ratios"><div class="az-st"><h3>${P() ? 'Every number, explained' : `All ${DEF.length} readings`}</h3><p>${P() ? `Tap a question to open it. Each reading is compared with other ${esc(r.sec || '')} companies, because what is "good" differs by industry.` : `Company vs ${esc(r.sec || '')} sector median and market median. Tap a reading for its definition. Point colours: bright = best/worst 10% of the sector.`}</p></div>
      ${P() ? blocks : `<div class="az-tw"><table class="az-tbl az-rt"><thead><tr><th>Reading</th><th>${esc(short(r.t))}</th><th>Sector</th><th>Market</th><th>Score</th></tr></thead>${blocks}</table></div>`}
    </section>`;
  }
  /* the sentence always agrees with the scanner's own point (+1 / 0 / -1) */
  function compare(x, v, m, sec, pt) {
    const fv = fmtR(x.k, x.f, v), fm = fmtR(x.k, x.f, m);
    if (x.f === 'x' && v <= 0) return `<b>n/m</b> means not meaningful: the company made a loss (or negative cash or operating profit), so this ratio can't be worked out. A typical ${esc(sec)} company: ${fm}.`;
    if (pt === null || pt === undefined) return `A typical ${esc(sec)} company: ${fm}.`;
    if (pt === 0) return `Within the normal range for ${esc(sec)} companies (typical: ${fm}).`;
    const how = x.f === 'x' && m > 0 && v > 0 ? ` (${NF(v / m, 1)}x the typical level)` : '';
    return `${pt > 0 ? 'Better' : 'Worse'} than most ${esc(sec)} companies: ${fv} vs a typical ${fm}${how}.`;
  }
  /* readings that do not apply to this kind of company */
  const FIN = r => /Financial/.test(r.sec || '');
  const naMetric = (k, v, r) => FIN(r) && ['gross_margin', 'current_ratio', 'quick_ratio', 'de', 'ev_ebitda', 'pfcf', 'fcf_margin'].includes(k) && (!ok(v) || v === 0 || k === 'gross_margin');
  const extra = (k, v, r) => k === 'roe' && ok(v) && v > 0.6 ? (P() ? ' <b>Careful:</b> a number this high usually means years of share buybacks (or past losses) have shrunk the equity figure, which flatters the ratio. Compare return on assets.' : ' Inflated by a small equity base (buybacks / accumulated losses).') : ['fpe', 'tpe'].includes(k) && ok(v) && v > 0 && v < 3 ? (P() ? ' <b>Careful:</b> a P/E this low is rarely a bargain — it usually means a one-off gain inflated profit, profits are expected to collapse, or the data is off. Check the latest results.' : ' P/E < 3x: likely one-off gain, peak-cycle earnings or data error.') : k === 'div_yield' && ok(v) && v > 0.09 ? (P() ? ' <b>Careful:</b> very high yields often come before a dividend cut.' : ' Yield > 9%: check cover — cut risk.') : '';

  /* ---------- financial statements ---------- */
  function secStatements() {
    const fs = CUR.fs, r = CUR.d.row;
    if (!fs || !fs.annual) return `<section class="az-card" id="az-fs"><div class="az-st"><h3>Financial statements</h3></div><p>Statements for ${esc(r.n)} are not loaded yet — they refresh weekly. Try again later.</p></section>`;
    const per = fs[FSV.per] && fs[FSV.per].dates && fs[FSV.per].dates.length ? FSV.per : 'annual';
    const blk = fs[per], dates = blk.dates, rows = blk.rows, c = fs.cur || r.cur, lines = (fs.lines || []).filter(l => l[2] === FSV.st);
    const has = k => (rows[k] || []).some(ok);
    const show = lines.filter(l => has(l[0]) && (l[0] !== 'nii' || FIN(r)) && (!P() || KEY_LINES[FSV.st].includes(l[0])));
    const yr = s => per === 'annual' ? s.slice(0, 4) : s.slice(0, 7);
    const n = dates.length, from = P() ? Math.max(0, n - 5) : 0;
    const dd = dates.slice(from);
    const yAgo = (() => { const t = new Date(dates[n - 1]) - 365 * 864e5; let j = -1, best = 50 * 864e5; dates.forEach((x, i) => { const g = Math.abs(new Date(x) - t); if (g < best) { best = g; j = i; } }); return j; })();
    const tbl = `<div class="az-tw"><table class="az-tbl az-fst"><thead><tr><th>${per === 'annual' ? 'Year ending' : 'Period ending'}</th>${dd.map(x => `<th>${yr(x)}</th>`).join('')}${!P() && n > 1 ? '<th title="Latest period vs the same period a year earlier">Y/Y</th>' : ''}</tr></thead><tbody>` +
      show.map(([k, l]) => { const v = rows[k].slice(from), last = rows[k][n - 1], prev = yAgo >= 0 ? rows[k][yAgo] : null;
        const ex = LX[k] ? LX[k][P() ? 0 : 1] : '';
        const fmt = x => !ok(x) ? '—' : /^eps/.test(k) ? px(x, c) : k === 'shares' || k === 'so' ? NF(x / 1e6, 0) + ' m' : big(x, c);
        return `<tr data-k="${k}"><td><details><summary>${esc(l)}</summary><p>${ex}</p></details></td>${v.map(x => `<td class="n${ok(x) && x < 0 ? ' neg' : ''}">${fmt(x)}</td>`).join('')}${!P() && n > 1 ? `<td class="n">${ok(last) && ok(prev) && prev !== 0 ? pc((last - prev) / Math.abs(prev), 0) : '—'}</td>` : ''}</tr>`; }).join('') + '</tbody></table></div>';
    const chartK = FSV.st === 'is' ? (has('rev') ? 'rev' : 'ni') : FSV.st === 'bs' ? 'eq' : 'fcf';
    const chart2 = FSV.st === 'is' ? 'ni' : FSV.st === 'bs' ? 'debt' : 'cfo';
    return `<section class="az-card" id="az-fs"><div class="az-st"><h3>Financial statements</h3><p>${P() ? 'The three reports every listed company must publish. We show the most important lines; switch to Analyst for every line and the ratio history.' : `Source: ${esc((fs.src || []).join(', '))}. Updated ${esc(fs.updated || '')}. Currency ${esc(c)}.`}</p></div>
      <div class="az-seg" id="azFsSt">${Object.entries(ST_NAME).map(([k, [l, s]]) => `<button data-st="${k}" class="${FSV.st === k ? 'on' : ''}">${l}<small>${s}</small></button>`).join('')}</div>
      <div class="az-seg az-seg-s" id="azFsPer"><button data-per="annual" class="${per === 'annual' ? 'on' : ''}">Yearly</button>${fs.quarterly && fs.quarterly.dates && fs.quarterly.dates.length ? `<button data-per="quarterly" class="${per === 'quarterly' ? 'on' : ''}">${r.m === 'JSE' ? 'Half-yearly' : 'Quarterly'}</button>` : ''}</div>
      <div class="az-story">${story(fs, FSV.st, c)}</div>
      ${bars(blk, chartK, chart2, (fs.lines || []).reduce((o, l) => (o[l[0]] = l[1], o), {}), c, per)}
      ${tbl}
      ${!P() && per === 'annual' ? ratioHistory(fs, c) : ''}
    </section>`;
  }
  function cagr(a, b, yrs) { return ok(a) && ok(b) && a > 0 && b > 0 && yrs > 0 ? Math.pow(b / a, 1 / yrs) - 1 : null; }
  function series(blk, k) { const v = blk.rows[k] || [], out = []; blk.dates.forEach((d, i) => { if (ok(v[i])) out.push([d, v[i]]); }); return out; }
  function story(fs, st, c) {
    const A = fs.annual, nm = CUR.d.row.n, out = [];
    const span = s => s.length > 1 ? (+s[s.length - 1][0].slice(0, 4)) - (+s[0][0].slice(0, 4)) : 0;
    if (st === 'is') {
      const rv = series(A, 'rev'), ni = series(A, 'ni');
      if (rv.length > 1) { const g = cagr(rv[0][1], rv[rv.length - 1][1], span(rv)); out.push(`Sales went from <b>${big(rv[0][1], c)}</b> in ${rv[0][0].slice(0, 4)} to <b>${big(rv[rv.length - 1][1], c)}</b> in ${rv[rv.length - 1][0].slice(0, 4)}${ok(g) ? ` — about <b>${pc(g, 1)} a year</b>` : ''}.`); }
      if (ni.length > 1) { const l = ni[ni.length - 1][1], neg = ni.filter(x => x[1] < 0).length; out.push(l >= 0 ? `Latest yearly profit: <b>${big(l, c)}</b>. ${neg ? `It made a loss in ${neg} of the last ${ni.length} years.` : `Profitable in every one of the last ${ni.length} years.`}` : `It made a <b>loss of ${big(-l, c)}</b> in the latest year.`); }
      if (rv.length && ni.length) { const m0 = ni[0][1] / (rv.find(x => x[0] === ni[0][0]) || [0, NaN])[1], m1 = ni[ni.length - 1][1] / (rv.find(x => x[0] === ni[ni.length - 1][0]) || [0, NaN])[1]; if (ok(m0) && ok(m1)) out.push(`Out of every R100 of sales it kept <b>R${NF(m1 * 100, 0)}</b> as profit, ${m1 > m0 + 0.01 ? 'up' : m1 < m0 - 0.01 ? 'down' : 'about the same'} from R${NF(m0 * 100, 0)}.`.replace(/R(?=\d)/g, sym(c))); }
    } else if (st === 'bs') {
      const ca = series(A, 'cash'), db = series(A, 'debt'), eq = series(A, 'eq'), L = s => s.length ? s[s.length - 1][1] : null;
      if (ok(L(ca)) || ok(L(db))) out.push(`It holds <b>${big(L(ca), c)}</b> in cash${ok(L(db)) ? ` and owes <b>${big(L(db), c)}</b> in debt` : ''}${ok(L(ca)) && ok(L(db)) ? ` — ${L(ca) >= L(db) ? 'more cash than debt, a comfortable position' : `net debt of ${big(L(db) - L(ca), c)}`}` : ''}.`);
      if (eq.length > 1) out.push(`Shareholders' net worth (equity) went from ${big(eq[0][1], c)} to <b>${big(L(eq), c)}</b>.${L(eq) < 0 ? ' Negative equity usually comes from large buybacks or past losses — check which.' : ''}`);
      const ebitda = L(series(A, 'ebitda')); if (ok(L(db)) && ok(L(ca)) && ok(ebitda) && ebitda > 0) out.push(`Net debt is <b>${NF((L(db) - L(ca)) / ebitda, 1)}x</b> a year's operating profit (EBITDA). Below 2x is usually comfortable; above 3–4x is heavy.`);
    } else {
      const f = series(A, 'fcf'), cfo = series(A, 'cfo'), ni = series(A, 'ni'), dv = series(A, 'div'), bb = series(A, 'buyback'), L = s => s.length ? s[s.length - 1][1] : null;
      if (f.length) { const pos = f.filter(x => x[1] > 0).length; out.push(`Free cash flow in the latest year: <b>${big(L(f), c)}</b>. Positive in ${pos} of the last ${f.length} years.`); }
      if (ok(L(cfo)) && ok(L(ni)) && L(ni) > 0) { const cc = L(cfo) / L(ni); out.push(`For every ${sym(c)}1 of profit, <b>${sym(c)}${NF(cc, 2)}</b> came in as cash from operations — ${cc >= 1 ? 'a sign the profits are real' : cc >= 0.8 ? 'reasonable' : 'low, so check why profit is not turning into cash'}.`); }
      const ret = Math.abs(L(dv) || 0) + Math.abs(L(bb) || 0);
      if (ret > 0) out.push(`It returned <b>${big(ret, c)}</b> to shareholders (dividends ${big(Math.abs(L(dv) || 0), c)}, buybacks ${big(Math.abs(L(bb) || 0), c)})${ok(L(f)) && L(f) > 0 ? ` — ${NF(ret / L(f) * 100, 0)}% of its free cash flow` : ''}.`);
    }
    return out.length ? `<p>${out.join(' ')}</p>` : '';
  }
  function bars(blk, k1, k2, names, c, per) {
    const s1 = blk.rows[k1] || [], s2 = blk.rows[k2] || [], D = blk.dates;
    const idx = D.map((_, i) => i).filter(i => ok(s1[i]) || ok(s2[i])).slice(-10);
    if (idx.length < 2) return '';
    const vals = idx.flatMap(i => [s1[i], s2[i]]).filter(ok), mx = Math.max(0, ...vals), mn = Math.min(0, ...vals), rng = (mx - mn) || 1;
    const W = 640, H = 200, pad = 26, bw = (W - pad) / idx.length, y0 = H - 22 - ((0 - mn) / rng) * (H - 40);
    const Y = v => H - 22 - ((v - mn) / rng) * (H - 40);
    const g = idx.map((i, j) => { const x = pad + j * bw; const b = (v, o, cls) => ok(v) ? `<rect class="${cls}" x="${(x + o).toFixed(1)}" y="${Math.min(Y(v), y0).toFixed(1)}" width="${(bw * 0.36).toFixed(1)}" height="${Math.max(1, Math.abs(Y(v) - y0)).toFixed(1)}"><title>${names[cls === 'b1' ? k1 : k2] || ''} ${D[i].slice(0, per === 'annual' ? 4 : 7)}: ${big(v, c)}</title></rect>` : '';
      return b(s1[i], bw * 0.1, 'b1') + b(s2[i], bw * 0.5, 'b2') + `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${per === 'annual' ? "'" + D[i].slice(2, 4) : D[i].slice(2, 7)}</text>`; }).join('');
    return `<div class="az-chart"><div class="az-leg"><span><i class="b1"></i>${esc(names[k1] || k1)}</span><span><i class="b2"></i>${esc(names[k2] || k2)}</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(names[k1])} and ${esc(names[k2])} by period"><line x1="${pad}" x2="${W}" y1="${y0}" y2="${y0}" class="ax"/>${g}<text x="2" y="14" class="lab">${big(mx, c)}</text></svg></div>`;
  }
  function ratioHistory(fs, c) {
    const A = fs.annual, R = A.rows, n = A.dates.length, from = Math.max(0, n - 8), D = A.dates.slice(from);
    const v = (k, i) => (R[k] || [])[i];
    const div = (a, b) => ok(a) && ok(b) && b !== 0 ? a / b : null;
    const RH = [
      ['Gross margin', i => div(v('gp', i), v('rev', i)), 'p', 'Gross profit ÷ revenue'],
      ['Operating margin', i => div(v('op', i), v('rev', i)), 'p', 'Operating income ÷ revenue'],
      ['Net margin', i => div(v('ni', i), v('rev', i)), 'p', 'Net income ÷ revenue'],
      ['Return on equity', i => v('eq', i) > 0 ? div(v('ni', i), v('eq', i)) : null, 'p', 'Net income ÷ year-end equity'],
      ['Return on assets', i => div(v('ni', i), v('ta', i)), 'p', 'Net income ÷ total assets'],
      ['Debt / equity', i => v('eq', i) > 0 ? div(v('debt', i), v('eq', i)) : null, 'x', 'Total debt ÷ equity'],
      ['Net debt / EBITDA', i => v('ebitda', i) > 0 && ok(v('debt', i)) && ok(v('cash', i)) ? (v('debt', i) - v('cash', i)) / v('ebitda', i) : null, 'x', '(Debt − cash) ÷ EBITDA; < 2x comfortable'],
      ['Interest cover', i => v('intexp', i) ? div(v('op', i), Math.abs(v('intexp', i))) : null, 'x', 'Operating income ÷ interest expense; < 3x tight'],
      ['Current ratio', i => div(v('ca', i), v('cl', i)), 'x', 'Current assets ÷ current liabilities'],
      ['Cash conversion', i => v('ni', i) > 0 ? div(v('cfo', i), v('ni', i)) : null, 'x', 'CFO ÷ net income; ≥ 1 = earnings backed by cash'],
      ['FCF margin', i => div(v('fcf', i), v('rev', i)), 'p', 'Free cash flow ÷ revenue'],
      ['Capex / revenue', i => ok(v('capex', i)) ? div(Math.abs(v('capex', i)), v('rev', i)) : null, 'p', 'Capital intensity'],
      ['Share-based pay / revenue', i => div(v('sbc', i), v('rev', i)), 'p', 'Dilution cost hidden from FCF'],
      ['Payout (cash)', i => v('ni', i) > 0 && ok(v('div', i)) ? Math.abs(v('div', i)) / v('ni', i) : null, 'p', 'Dividends paid ÷ net income'],
      ['Share count change', i => i > 0 && ok(v('shares', i)) && ok(v('shares', i - 1)) && v('shares', i - 1) ? v('shares', i) / v('shares', i - 1) - 1 : null, 'c', 'Y/Y change in diluted shares; negative = buybacks']
    ];
    const f = (x, t) => !ok(x) ? '—' : t === 'p' ? pp(x, 1) : t === 'c' ? pc(x, 1) : NF(x, 2) + 'x';
    const body = RH.map(([l, fn, t, hlp]) => { const vals = D.map((_, j) => fn(from + j)); if (!vals.some(ok)) return ''; return `<tr><td><details><summary>${l}</summary><p>${hlp}</p></details></td>${vals.map(x => `<td class="n">${f(x, t)}</td>`).join('')}</tr>`; }).join('');
    return body ? `<h4 class="az-h4">Ratio history (computed from the statements)</h4><div class="az-tw"><table class="az-tbl az-fst"><thead><tr><th>Year</th>${D.map(x => `<th>${x.slice(0, 4)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><p class="az-note">Year-end balances (not averages); may differ slightly from the scanner's trailing-12-month ratios.</p>` : '';
  }

  /* ---------- price & chart ---------- */
  function secPrice(d) {
    const r = d.row, t = d.tech || {}, c = r.cur, h = d.history || {}, cl = (h.c || []).filter(ok);
    const sma = (n, i) => i + 1 < n ? null : cl.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n;
    let svg = '';
    if (cl.length > 30) {
      const W = 720, H = 240, lv = [...(t.supports || []), ...(t.resistances || [])].map(x => x.price).filter(ok);
      const all = cl.concat(lv.filter(v => v > Math.min(...cl) * 0.85 && v < Math.max(...cl) * 1.15)), mx = Math.max(...all) * 1.02, mn = Math.min(...all) * 0.98;
      const X = i => (i / (cl.length - 1) * W).toFixed(1), Y = v => (H - (v - mn) / (mx - mn) * H).toFixed(1);
      const path = arr => arr.map((v, i) => ok(v) ? `${X(i)},${Y(v)}` : null).filter(Boolean).join(' ');
      const s50 = cl.map((_, i) => sma(50, i)), s200 = cl.map((_, i) => sma(200, i));
      const lines = (t.supports || []).filter(x => x.price > mn && x.price < mx).map(x => `<line class="sup" x1="0" x2="${W}" y1="${Y(x.price)}" y2="${Y(x.price)}"><title>Support ${px(x.price, c)} (${x.touches} touches)</title></line>`).join('') +
        (t.resistances || []).filter(x => x.price > mn && x.price < mx).map(x => `<line class="res" x1="0" x2="${W}" y1="${Y(x.price)}" y2="${Y(x.price)}"><title>Resistance ${px(x.price, c)} (${x.touches} touches)</title></line>`).join('');
      svg = `<div class="az-chart az-pxc"><div class="az-leg"><span><i class="pl"></i>Price</span><span><i class="s50"></i>50-day avg</span><span><i class="s200"></i>200-day avg</span><span><i class="sup"></i>Support</span><span><i class="res"></i>Resistance</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Share price, about two years">${lines}<polyline class="s200" points="${path(s200)}"/><polyline class="s50" points="${path(s50)}"/><polyline class="pl" points="${path(cl)}"/></svg>
        <div class="az-ax"><span>${esc(fdate(h.d0))}</span><span>${px(mn, c)} – ${px(mx, c)}</span><span>${esc(fdate(t.date))}</span></div></div>`;
    }
    const rng = ok(t.hi52) && ok(t.lo52) && t.hi52 > t.lo52 ? (t.price - t.lo52) / (t.hi52 - t.lo52) : null;
    const up = t.price > t.sma200, up50 = t.price > t.sma50;
    const facts = [
      ['Trend', up && up50 ? 'Uptrend' : !up && !up50 ? 'Downtrend' : 'Mixed', P() ? `The price is ${up ? 'above' : 'below'} its 200-day average (${px(t.sma200, c)}) and ${up50 ? 'above' : 'below'} its 50-day average (${px(t.sma50, c)}). ${up && up50 ? 'Buyers are in control.' : !up && !up50 ? 'Sellers are in control — many professionals wait for this to change before buying.' : 'The picture is mixed.'}` : `Px vs SMA50 ${pc(t.price / t.sma50 - 1, 1)}, vs SMA200 ${pc(t.price / t.sma200 - 1, 1)}; 200-day ${t.sma200_rising ? 'rising' : 'falling'}.`],
      ['RSI (14 days)', ok(t.rsi) ? NF(t.rsi, 0) : '—', P() ? (t.rsi >= 70 ? 'Above 70: the price has run up fast and may need a rest.' : t.rsi <= 30 ? 'Below 30: the price has fallen hard; it may bounce, but falling prices can keep falling.' : 'Between 30 and 70: neither stretched up nor down.') : 'Overbought > 70, oversold < 30; regime-dependent.'],
      ['52-week position', ok(rng) ? NF(rng * 100, 0) + '%' : '—', P() ? `0% = the lowest price of the past year (${px(t.lo52, c)}), 100% = the highest (${px(t.hi52, c)}).` : `Low ${px(t.lo52, c)} · high ${px(t.hi52, c)}.`],
      ['Daily swing', ok(r.atrp) ? pp(r.atrp, 1) : '—', P() ? 'How much the price typically moves in a day. Bigger = more nerve needed.' : `ATR(14) ${px(t.atr, c)} = ${pp(r.atrp, 2)} of price.`],
      ['Trading activity', ok(t.rel_vol) ? NF(t.rel_vol, 2) + 'x normal' : '—', P() ? `Value traded on an average day: ${big(t.value_traded, c)}.${r.liq === 'thin' ? ' <b>Thinly traded</b> — it can be hard to buy or sell without moving the price.' : ''}` : `Avg value traded ${big(t.value_traded, c)}/day; up/down volume ${ok(t.updown_vol) ? NF(t.updown_vol, 2) : '—'}.`],
      ['vs market (6 months)', pc(t.rs_6m, 1), P() ? `${(t.rs_6m || 0) >= 0 ? 'Beat' : 'Lagged'} the ${esc((d.benchmarks || {})[r.m === 'JSE' ? 'JSE' : 'US']?.name || 'market')} by this much.` : '6-month relative strength vs benchmark.']
    ];
    const perf = [['1 day', t.chg_1d], ['1 week', t.perf_1w], ['1 month', t.perf_1m], ['3 months', t.perf_3m], ['6 months', t.perf_6m], ['Year to date', t.perf_ytd], ['1 year', t.perf_1y]];
    const lv = [...(t.supports || []).map(x => ['Support', x]), ...(t.resistances || []).map(x => ['Resistance', x])];
    const plan = !SAFE && !P() && d.plan && d.plan.entry ? `<h4 class="az-h4">Trade plan (LRC rules)</h4><div class="az-tw"><table class="az-tbl"><tr><td>Setup</td><td>${esc(r.setup || '—')}</td><td>${esc(d.plan.how || '')}</td></tr><tr><td>Entry / stop</td><td>${px(d.plan.entry, c)} / ${px(d.plan.stop, c)}</td><td>risk ${pp(d.plan.risk_pct, 1)} a share</td></tr><tr><td>Targets</td><td>${px(d.plan.t1, c)} · ${px(d.plan.t2, c)}</td><td>${esc(d.plan.event_risk || '')}</td></tr></table></div>` : '';
    return `<section class="az-card" id="az-price"><div class="az-st"><h3>Price &amp; chart</h3><p>${P() ? 'What traders look at: the direction of the price, how stretched it is, and the levels where it has turned before.' : 'About two years of daily closes; SMAs computed from the closes; major support/resistance from the LRC level finder.'}</p></div>
      ${svg}
      <div class="az-perf">${perf.map(([l, v]) => `<div><span>${l}</span><b class="${(v || 0) >= 0 ? 'up' : 'dn'}">${pc(v, 1)}</b></div>`).join('')}</div>
      <div class="az-facts">${facts.map(([l, v, e]) => `<div class="az-f"><span>${l}</span><b>${v}</b><p>${e}</p></div>`).join('')}</div>
      ${lv.length ? `<p class="az-lv">${P() ? '<b>Key price levels.</b> Support = a price where buyers stepped in before; resistance = where sellers did. ' : ''}${lv.map(([k, x]) => `<span class="${k === 'Support' ? 'az-lsup' : 'az-lres'}">${k} ${px(x.price, c)} <small>${x.touches}×</small></span>`).join('')}${r.setup && r.setup !== 'None' ? ` <span class="az-setup">Chart setup: <b>${esc(r.setup)}</b></span>` : ''}</p>` : ''}
      ${plan}
      ${SAFE ? '<p class="az-note">Entry prices, stop-losses and trade targets are not shown while LRC completes its FSCA licensing.</p>' : ''}
    </section>`;
  }

  /* ---------- professionals ---------- */
  function secPros(d) {
    const r = d.row, f = d.f || {}, c = r.cur, price = (d.tech || {}).price || r.px, rt = f.rec_trend || {};
    const tot = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].reduce((a, k) => a + (rt[k] || 0), 0);
    const bar = tot ? `<div class="az-rec">${[['strongBuy', 'Strong buy', 'p2'], ['buy', 'Buy', 'p1'], ['hold', 'Hold', 'z'], ['sell', 'Sell', 'm1'], ['strongSell', 'Strong sell', 'm2']].filter(([k]) => rt[k]).map(([k, l, cl]) => `<i class="${cl}" style="flex:${rt[k]}" title="${l}: ${rt[k]}">${rt[k]}</i>`).join('')}</div><div class="az-rec-l"><span>Strong buy</span><span>Hold</span><span>Strong sell</span></div>` : '';
    const eh = (f.eps_hist || []).filter(x => ok(x.act));
    const beats = eh.map(x => `<div class="az-eh ${!ok(x.est) ? 'z' : x.act > x.est * 1.01 ? 'up' : x.act < x.est * 0.99 ? 'dn' : 'z'}"><span>${esc(fdate(x.q, true))}</span><b>${px(x.act, c)}</b><small>${ok(x.est) ? 'est. ' + px(x.est, c) : 'no estimate'}</small></div>`).join('');
    const tgt = ok(f.target_median) ? `<div class="az-range"><div class="az-range-bar">${ok(f.target_low) && ok(f.target_high) ? (() => { const lo = Math.min(f.target_low, price), hi = Math.max(f.target_high, price), X = v => ((v - lo) / ((hi - lo) || 1) * 100).toFixed(1); return `<b style="left:${X(f.target_low)}%;width:${X(f.target_high) - X(f.target_low)}%"></b><i class="p" style="left:${X(price)}%"></i><i class="v" style="left:${X(f.target_median)}%"></i>`; })() : ''}</div><div class="az-range-l"><span>Lowest ${px(f.target_low, c)}</span><span><i class="p"></i>Price <i class="v"></i>Median ${px(f.target_median, c)}</span><span>Highest ${px(f.target_high, c)}</span></div></div>` : '';
    return `<section class="az-card" id="az-pros"><div class="az-st"><h3>${P() ? 'What the professionals think' : 'Street view & earnings'}</h3><p>${P() ? 'Banks and brokers employ analysts who publish views and 12-month price targets. Useful context — but they are often too optimistic, so we treat them as one input, not the answer.' : 'Sell-side consensus, 12-month targets and the last reported quarters vs estimates.'}</p></div>
      ${f.n_analysts ? `<p class="az-lead"><b>${f.n_analysts}</b> analysts · average view <b>${ok(f.rec_mean) ? NF(f.rec_mean, 1) : '—'}</b> on a 1 (very positive) to 5 (very negative) scale${ok(f.target_median) ? ` · middle target ${px(f.target_median, c)} (${pc(f.target_median / price - 1, 0)})` : ''}.</p>${bar}${tgt}` : '<p>No professional analyst coverage in our data feed — common for smaller JSE companies. Lean more on the statements and our own models.</p>'}
      ${beats ? `<h4 class="az-h4">${P() ? 'Did it deliver? Last results vs expectations' : 'EPS: actual vs estimate'}</h4><div class="az-ehs">${beats}</div>${P() ? '<p class="az-note">Green = profit per share beat what analysts expected; red = missed. Companies that keep beating tend to be well run (or conservative with guidance).</p>' : ''}` : ''}
      ${f.next_earnings ? `<p class="az-lv"><span>Next results: <b>${esc(fdate(f.next_earnings))}</b></span> ${P() ? 'Prices often jump or drop sharply on results day.' : ''} <a href="earnings.html">Earnings calendar →</a></p>` : ''}
    </section>`;
  }

  /* ---------- dividends ---------- */
  function secIncome(d) {
    const r = d.row, f = d.f || {}, c = r.cur, dv = (d.dividends || []).filter(x => ok(x.amount));
    const k = r.m === 'JSE' ? 0.01 : 1; // JSE dividends are stored in cents
    if (!dv.length && !(f.div_yield > 0)) return `<section class="az-card" id="az-income"><div class="az-st"><h3>Dividends</h3></div><p>${esc(r.n)} does not pay a regular dividend. ${P() ? 'That is not bad in itself: many growing companies reinvest all their cash, or return it through share buybacks instead.' : 'Check buybacks in the cash-flow statement for shareholder returns.'}</p></section>`;
    const pay = dv.slice(-8), mx = Math.max(...pay.map(x => x.amount * k)), first = pay[0], last = pay[pay.length - 1];
    const same = dv.length > 1 ? dv.filter(x => x.date.slice(5, 7) === last.date.slice(5, 7) && x.date < last.date).pop() : null;
    return `<section class="az-card" id="az-income"><div class="az-st"><h3>Dividends</h3><p>${P() ? 'Cash the company pays you just for owning the share.' : 'Dividends per share by ex-date (feed data; JSE converted from cents).'}</p></div>
      <div class="az-facts">
        <div class="az-f"><span>Yield</span><b>${pp(f.div_yield, 2)}</b><p>${P() ? `About ${sym(c)}${NF((f.div_yield || 0) * 1000, 0)} a year for every ${sym(c)}1,000 invested at today's price.` : 'Indicated yield.'}</p></div>
        <div class="az-f"><span>Payout ratio</span><b>${pp(f.payout, 0)}</b><p>${P() ? (f.payout > 0.9 ? 'Pays out almost all its profit — little cushion if profits fall.' : f.payout > 0.6 ? 'Pays out a large part of profit.' : 'Keeps most profit to reinvest — the dividend has room to grow.') : 'DPS ÷ EPS.'}</p></div>
        <div class="az-f"><span>Last ex-dividend date</span><b>${esc(fdate(f.ex_div))}</b><p>${P() ? 'You must own the share before this date to get that dividend.' : (f.div_pay ? `Paid ${esc(fdate(f.div_pay))}.` : 'Payment date not in the feed.')}</p></div>
      </div>
      ${pay.length ? `<div class="az-divs">${pay.map(x => `<div><i style="height:${(x.amount * k / mx * 100).toFixed(0)}%"></i><b>${sym(c)}${NF(x.amount * k, 2)}</b><span>${fdate(x.date, true)}</span></div>`).join('')}</div>` : ''}
      <p class="az-note">${pay.length ? `Each bar is one dividend per share, by ex-dividend date.${same ? ` Latest payment ${sym(c)}${NF(last.amount * k, 2)} vs ${sym(c)}${NF(same.amount * k, 2)} a year earlier (${pc(last.amount / same.amount - 1, 0)}).` : ''}` : ''} <a href="dividends.html">Dividend calendar →</a></p>
    </section>`;
  }

  /* ---------- investment checklist ---------- */
  function secChecklist(d) {
    const iv = d.investment || {}, ch = iv.checks || [], c = d.row.cur;
    if (!ch.length) return '';
    const fv = x => /Market cap/.test(x.k) ? big(x.v, c) : /Debt/.test(x.k) ? NF(x.v / 100, 2) + 'x' : /P\/E|Price|ratio/i.test(x.k) ? NF(x.v, 1) + (/ratio/i.test(x.k) ? '' : 'x') : pp(x.v, 1);
    const expl = { 'Market cap': 'Big, established companies tend to be more stable.', 'Return on equity': 'Earns a good return on shareholders\' money.', 'Return on assets': 'Uses everything it owns productively.', 'Operating margin': 'Keeps a healthy share of each sale.', 'Debt / equity': 'Not overloaded with debt.', 'Current ratio': 'Can pay its short-term bills.', 'Forward P/E': 'Not too expensive vs expected profit.', 'Price / FCF': 'Not too expensive vs the cash it produces.', 'EPS growth (multi-year)': 'Profit per share has grown steadily.', 'Revenue growth (multi-year)': 'Sales have grown steadily.' };
    return `<section class="az-card" id="az-check"><div class="az-st"><h3>${P() ? 'Long-term investor checklist' : 'Quality checklist'}</h3><p>${P() ? 'Ten simple tests that long-term investors use. Passing most of them points to a sturdy business at a sensible price.' : `Quality grade ${esc(iv.grade || '—')}: ${iv.passed}/${iv.known} checks passed (feeds the investment gates: BUY needs grade A/B).`}</p></div>
      <p class="az-lead">Passes <b>${iv.passed} of ${iv.known}</b> tests · quality grade <b>${esc(iv.grade || '—')}</b></p>
      <div class="az-cl">${ch.map(x => `<div class="${x.ok ? 'y' : x.ok === false ? 'n' : 'z'}"><span>${x.ok ? '✓' : x.ok === false ? '✗' : '–'}</span><b>${esc(x.k)}</b><em>${ok(x.v) ? fv(x) : '—'} <small>needs ${esc(x.rule)}</small></em>${P() && expl[x.k] ? `<p>${expl[x.k]}</p>` : ''}</div>`).join('')}</div>
    </section>`;
  }

  /* ---------- what to do next ---------- */
  function secNext(d) {
    const r = d.row, ctx = d.context || {}, riv = (ctx.rivals || []).filter(x => x.t);
    return `<section class="az-card az-next" id="az-next"><div class="az-st"><h3>Keep going</h3></div>
      ${riv.length ? `<p><b>Compare with rivals:</b> ${riv.map(x => `<a href="analyzer.html?t=${encodeURIComponent(x.t)}" data-t="${esc(x.t)}" class="az-riv">${esc(x.n || x.t)}</a>`).join(' · ')}</p>` : ''}
      ${ctx.sector && ctx.sector.n ? `<p><b>Sector backdrop:</b> ${esc(r.sec)} scores ${ctx.sector.score}/100 across ${ctx.sector.n} companies; ${pp(ctx.sector.above50, 0)} trade above their 50-day average.</p>` : ''}
      <p>${P() ? 'Before you buy anything: read the latest results, understand how the company makes money, and only invest money you can leave for years. Never put everything in one share.' : 'Next: read the latest filings / SENS, stress the DCF inputs, check peer multiples, and size positions by risk.'}</p>
      <div class="az-links"><a class="btn btn-gold" href="stock.html?t=${encodeURIComponent(r.t)}">Free one-page summary (PDF)</a><a class="btn btn-ghost" href="academy.html">Learn in the Academy</a><a class="btn btn-ghost" href="#azTop">Analyse another share ↑</a></div>
    </section>`;
  }

  function bindRender() {
    const out = $('azOut');
    out.querySelectorAll('#azFsSt button').forEach(b => b.addEventListener('click', () => { FSV.st = b.dataset.st; reFs(); }));
    out.querySelectorAll('#azFsPer button').forEach(b => b.addEventListener('click', () => { FSV.per = b.dataset.per; reFs(); }));
    out.querySelectorAll('.az-riv').forEach(a => a.addEventListener('click', e => { e.preventDefault(); open(a.dataset.t, true); }));
  }
  function reFs() { const el = $('az-fs'); if (!el) return; const tmp = document.createElement('div'); tmp.innerHTML = secStatements(); el.replaceWith(tmp.firstElementChild); bindRender(); }

  /* ---------------- boot ---------------- */
  bindSearch(); bindScreen();
  document.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => open(b.dataset.ex, true)));
  const boot = window.LRCIndex ? window.LRCIndex() : get('scan/index.json').then(ix => ({ rows: ix.rows.map(a => Object.fromEntries(ix.cols.map((k, i) => [k, a[i]]))) }));
  boot.then(ix => {
    ROWS = ix.rows || [];
    $('azScrNote').textContent = `${ROWS.length.toLocaleString('en-ZA')} companies · prices ${ix.live ? 'live (about 15 min delay)' : 'from the last scan'}`;
    fillSectors(); drawScreen();
  }).catch(() => { $('azScrRes').innerHTML = '<p class="az-empty">The company list could not be loaded. Refresh the page.</p>'; });
  const t0 = new URLSearchParams(location.search).get('t');
  if (t0) open(t0, false);
})();
