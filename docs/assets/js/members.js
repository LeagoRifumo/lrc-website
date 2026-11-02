/* LRC Members — free accounts, Top Picks (members only) and My account.
   Loaded on every page by main.js. Login and the Top Picks data live in the members database (Supabase):
   the picks are never in the public website files, and the database only hands them to signed-in members.
   SETUP: paste the project URL and the public "anon" key below (Supabase → Project Settings → API). */
window.LRC_AUTH = window.LRC_AUTH || {
  url: 'https://wpoknxskdrjurjdpxqav.supabase.co',
  anon: 'sb_publishable_Y8o5JO6YzNeKfjd8yPUaMw_btEJAYJh'   // publishable key (safe to publish; the database rules protect the data)
};

/* Member news shown on the Top Picks page and in My account — newest first. Add a line when something changes. */
window.LRC_MEMBER_NEWS = [
  { date: '2026-11-02', title: 'LRC Top Picks launched for members', text: 'Five trading and five investment picks for the JSE and New York, chosen by fixed rules: enough daily trading volume, strong scores, a confirmed price trend for trading picks and quality at a sensible price for investment picks. Updated after every scanner run.' },
  { date: '2026-11-02', title: 'Free accounts are open', text: 'One account gives you the Top Picks, your saved preferences and (soon) email alerts when a pick is added or removed.' }
];

(() => {
  const CFG = window.LRC_AUTH;
  const me = document.querySelector('script[src*="assets/js/members.js"]');
  const BASE = me ? me.src.replace(/assets\/js\/members\.js.*$/, '') : '';
  const DATA = window.LRC_DATA || (BASE + 'data/');
  const PAGE = (location.pathname.split('/').pop() || 'index.html');
  const on = !!(CFG.url && CFG.anon);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ref = on ? (CFG.url.match(/https?:\/\/([^.]+)\./) || [])[1] : '';
  const hasSession = () => { try { return !!(ref && localStorage.getItem(`sb-${ref}-auth-token`)); } catch (e) { return false; } };

  /* ---------- header: "Top Picks" menu item + Sign in / My account button on every page ---------- */
  const menu = $('menu');
  if (menu && !menu.querySelector('.nav-picks')) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${BASE}top-picks.html" class="nav-picks${PAGE === 'top-picks.html' ? ' active' : ''}">Top Picks <span class="lock" aria-hidden="true">🔒</span></a>`;
    menu.insertBefore(li, menu.firstChild);
  }
  const cta = document.querySelector('.nav-cta');
  if (cta && !cta.querySelector('.btn-acct')) {
    const a = document.createElement('a');
    a.className = 'btn btn-acct';
    const signed = hasSession();
    a.href = BASE + (signed ? 'account.html' : 'top-picks.html#join');
    a.textContent = signed ? 'Account' : 'Sign in';
    cta.insertBefore(a, cta.firstChild);
  }

  if (PAGE !== 'top-picks.html' && PAGE !== 'account.html') return;

  /* ---------- shared helpers ---------- */
  let sbp = null;
  const client = () => sbp || (sbp = new Promise((res, rej) => {
    if (!on) return rej(new Error('not configured'));
    if (window.supabase) return res(window.supabase.createClient(CFG.url, CFG.anon));
    const s = document.createElement('script'); s.src = BASE + 'assets/vendor/supabase.js';
    s.onload = () => res(window.supabase.createClient(CFG.url, CFG.anon)); s.onerror = rej; document.head.appendChild(s);
  }));
  const GR = { 'STRONG BUY': 'Top scoring', 'BUY': 'Strong', 'HOLD': 'Average', 'SELL': 'Weak', 'STRONG SELL': 'Lowest scoring' };
  const grade = v => !v ? '—' : window.LRC_SAFE ? (GR[v] || v) : v;
  const gcls = v => ({ 'STRONG BUY': 'g-top', 'BUY': 'g-strong', 'HOLD': 'g-avg', 'SELL': 'g-weak', 'STRONG SELL': 'g-low' }[v] || 'g-avg');
  const money = (v, cur) => v === null || v === undefined ? '—' : (cur === 'ZAR' ? 'R' : '$') + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const big = (v, cur) => { if (!v) return '—'; const p = cur === 'ZAR' ? 'R' : '$'; return v >= 1e12 ? p + (v / 1e12).toFixed(2) + ' trillion' : v >= 1e9 ? p + (v / 1e9).toFixed(1) + 'bn' : p + (v / 1e6).toFixed(0) + 'm'; };
  const pct = v => v === null || v === undefined || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + '%';
  const day = d => { try { return new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } };
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return !isFinite(m) ? '' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const newsHTML = () => `<div class="mnews"><div class="lbl">MEMBER NEWS</div>${window.LRC_MEMBER_NEWS.map(n => `<div class="mn-i"><span>${day(n.date)}</span><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div>`).join('')}</div>`;

  /* ---------- sign up / sign in box ---------- */
  const authBox = (el, after) => {
    if (!on) {
      el.innerHTML = `<div class="auth"><h3>Members area opening soon</h3><p>Free accounts open shortly. Leave your email and we'll let you know the moment Top Picks go live.</p>
        <a class="btn btn-gold" href="mailto:info@leagorifumocapital.co.za?subject=${encodeURIComponent('Notify me: LRC Top Picks')}&body=${encodeURIComponent('Please let me know when LRC member accounts open.')}">Notify me →</a></div>`;
      return;
    }
    let mode = location.hash === '#signin' ? 'in' : 'up';
    const draw = msg => {
      el.innerHTML = `<div class="auth" id="join">
        <div class="seg auth-tabs"><button data-m="up" class="${mode === 'up' ? 'on' : ''}">Create free account</button><button data-m="in" class="${mode === 'in' ? 'on' : ''}">Sign in</button></div>
        <form id="authF" novalidate>
          ${mode === 'up' ? '<label for="a-name">Name</label><input id="a-name" autocomplete="name" required>' : ''}
          <label for="a-email">Email</label><input id="a-email" type="email" autocomplete="email" required>
          ${mode !== 'reset' ? `<label for="a-pass">Password ${mode === 'up' ? '<small>(at least 8 characters)</small>' : ''}</label><input id="a-pass" type="password" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}" minlength="8" required>` : ''}
          ${mode === 'up' ? `<label class="check"><input type="checkbox" id="a-terms" required> I have read the <a href="${BASE}privacy.html" target="_blank">privacy policy (POPIA)</a> and <a href="${BASE}disclaimer.html" target="_blank">disclaimer</a>. Top Picks are educational, not financial advice.</label>
            <label class="check"><input type="checkbox" id="a-news"> Email me when Top Picks change and when we publish research (you can stop any time)</label>` : ''}
          <button class="btn btn-gold" type="submit">${mode === 'up' ? 'Create my free account →' : mode === 'in' ? 'Sign in →' : 'Send reset link →'}</button>
          ${mode === 'in' ? '<a href="#" id="a-forgot" class="small-link">Forgot your password?</a>' : ''}
          <p class="amsg" id="a-msg">${msg ? esc(msg) : ''}</p>
        </form></div>`;
      el.querySelectorAll('.auth-tabs button').forEach(b => b.onclick = e => { e.preventDefault(); mode = b.dataset.m; draw(); });
      const fg = $('a-forgot'); if (fg) fg.onclick = e => { e.preventDefault(); mode = 'reset'; draw('Enter your email and we will send a link to choose a new password.'); };
      $('authF').onsubmit = async e => {
        e.preventDefault();
        const email = $('a-email').value.trim(), pass = $('a-pass') ? $('a-pass').value : '';
        const say = t => { $('a-msg').textContent = t; };
        if (!/^\S+@\S+\.\S+$/.test(email)) return say('Please enter a valid email address.');
        if (mode !== 'reset' && pass.length < 8) return say('Your password needs at least 8 characters.');
        if (mode === 'up' && !$('a-terms').checked) return say('Please tick the box to accept the privacy policy and disclaimer.');
        say('Please wait…');
        try {
          const sb = await client();
          if (mode === 'up') {
            const { data, error } = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: BASE + 'top-picks.html', data: { full_name: $('a-name').value.trim(), email_updates: $('a-news').checked } } });
            if (error) throw error;
            if (!data.session) return say('Account created. Check your email and click the link to confirm, then sign in.');
          } else if (mode === 'in') {
            const { error } = await sb.auth.signInWithPassword({ email, password: pass });
            if (error) throw error;
          } else {
            const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: BASE + 'account.html#reset' });
            if (error) throw error;
            return say('If that email has an account, a reset link is on its way.');
          }
          after();
        } catch (err) {
          const m = String(err.message || err);
          say(/Invalid login/i.test(m) ? 'Email or password is not right. Try again or reset your password.' : /already registered/i.test(m) ? 'That email already has an account — sign in instead.' : /confirm/i.test(m) ? 'Please confirm your email first (check your inbox), then sign in.' : 'Something went wrong: ' + m);
        }
      };
    };
    draw();
  };

  /* ---------- TOP PICKS page ---------- */
  const TP = $('tpRoot');
  if (TP) {
    const teaser = () => fetch(DATA + 'picks_public.json?v=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);
    const locked = async () => {
      const t = await teaser();
      const c = (t && t.counts) || {}, n = (m, k) => ((c[m] || {})[k]) || 0;
      TP.innerHTML = `<div class="tp-lock">
        <div class="tp-ghost">${['JSE · Trading', 'JSE · Investment', 'New York · Trading', 'New York · Investment'].map((h, i) => `<div class="tp-gcol"><div class="lbl">${h.toUpperCase()}</div>${Array.from({ length: [n('JSE', 'trading'), n('JSE', 'investment'), n('US', 'trading'), n('US', 'investment')][i] || 5 }, (_, k) => `<div class="tp-grow"><b>#${k + 1}</b><span class="blur">██████ ███</span><span class="blur">████</span></div>`).join('')}</div>`).join('')}</div>
        <div class="tp-gate"><div class="lock-ic">🔒</div><h2>Members only</h2><p>${t ? `${n('JSE', 'trading') + n('US', 'trading')} trading picks and ${n('JSE', 'investment') + n('US', 'investment')} investment picks are live${t.sectors && t.sectors.length ? ` across ${t.sectors.length} sectors` : ''} · updated ${ago(t.generated)}.` : 'The latest picks are ready.'} Create a free account to see them.</p><div id="tpAuth"></div></div>
      </div>${newsHTML()}`;
      authBox($('tpAuth'), () => { location.hash = ''; load(); });
    };
    const load = async () => {
      if (!on) return locked();
      let sb, session;
      try { sb = await client(); ({ data: { session } } = await sb.auth.getSession()); } catch (e) { return locked(); }
      if (!session) return locked();
      TP.innerHTML = '<p class="muted-load">Loading your Top Picks…</p>';
      const [{ data: rows, error }, { data: meta }, { data: prof }, quotes] = await Promise.all([
        sb.from('top_picks').select('*').order('rank'), sb.from('picks_meta').select('*').maybeSingle(),
        sb.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
        fetch(DATA + 'scan/quotes.json?v=' + Math.floor(Date.now() / 3e5)).then(r => r.ok ? r.json() : null).catch(() => null)]);
      if (error) { TP.innerHTML = `<p class="muted-load">The picks could not be loaded (${esc(error.message)}). Please refresh.</p>`; return; }
      const live = t => quotes && quotes.q && quotes.q[t] ? quotes.q[t][0] : null;
      let mkt = (() => { try { return JSON.parse(localStorage.getItem('lrc_mkt')) || 'JSE'; } catch (e) { return 'JSE'; } })(); if (mkt !== 'US') mkt = 'JSE';
      let kind = 'trading';
      const draw = () => {
        const list = (rows || []).filter(r => r.market === mkt && r.kind === kind).sort((a, b) => a.rank - b.rank);
        const R = (meta && meta.rules) || {};
        TP.innerHTML = `<div class="tp-bar"><span>Welcome${prof && prof.full_name ? ', <b>' + esc(prof.full_name.split(' ')[0]) + '</b>' : ''} 👋</span><span>Updated <b>${meta ? ago(meta.generated) : '—'}</b></span><a href="${BASE}account.html">My account</a></div>
          <div class="tp-sw"><div class="seg" id="tpM"><button data-v="JSE" class="${mkt === 'JSE' ? 'on' : ''}">JSE · Johannesburg</button><button data-v="US" class="${mkt === 'US' ? 'on' : ''}">New York</button></div>
          <div class="seg" id="tpK"><button data-v="trading" class="${kind === 'trading' ? 'on' : ''}">Trading · 3–12 months</button><button data-v="investment" class="${kind === 'investment' ? 'on' : ''}">Investment · 5–10 years</button></div></div>
          ${list.length ? `<div class="tp-list">${list.map(r => {
            const d = r.data, now = live(r.ticker) ?? d.price, since = r.added_price ? now / r.added_price - 1 : null;
            const dn = d.results_date ? Math.round((new Date(d.results_date + 'T12:00:00') - Date.now()) / 864e5) : null;
            return `<article class="tp-card">
              <div class="tp-h"><span class="tp-rank">#${r.rank}</span><div><a class="tp-t" href="${BASE}stock.html?t=${encodeURIComponent(r.ticker)}">${esc(r.ticker.replace('.JO', ''))}</a><div class="tp-n">${esc(d.name)}</div><small>${esc(d.sector)}${d.industry ? ' · ' + esc(d.industry) : ''}</small></div>
                <div class="tp-g"><span class="pill ${gcls(d.grade)}">${esc(grade(d.grade))}</span><b>${d.score}<small>/100</small></b><small>${kind === 'trading' ? 'Trading score' : 'Investment score'}</small></div></div>
              <div class="tp-facts">
                <div><span>Price</span><b>${money(now, d.currency)}</b></div>
                <div><span>Since added (${day(r.added_on)})</span><b class="${since > 0 ? 'up' : since < 0 ? 'dn' : ''}">${pct(since)}</b></div>
                <div><span>Traded a day</span><b>${big(d.value_traded, d.currency)}</b></div>
                <div><span>Market value</span><b>${big(d.market_cap, d.currency)}</b></div>
                <div><span>Valuation</span><b>${esc((d.valuation || '—').toLowerCase())}<small> · model est.</small></b></div>
                <div><span>${kind === 'trading' ? 'Long-term grade' : 'Trading grade'}</span><b>${esc(grade(kind === 'trading' ? d.investment_grade : d.trading_grade))}</b></div>
                <div><span>Dividend yield</span><b>${d.dividend_yield ? (d.dividend_yield * 100).toFixed(1) + '%' : '—'}</b></div>
                <div><span>Next results</span><b class="${dn !== null && dn <= 14 ? 'warn' : ''}">${d.results_date ? day(d.results_date) + (dn !== null && dn >= 0 ? ` · in ${dn} d` : '') : 'not announced'}</b></div>
              </div>
              <div class="tp-why"><div><div class="lbl">WHY IT'S ON THE LIST</div><ul>${(d.why || []).map(w => `<li><b>${esc(w.area)}</b> — ${esc(w.text)} <small>(${w.score})</small></li>`).join('') || '<li>Strong all-round score.</li>'}</ul></div>
                <div><div class="lbl">WHAT COULD GO WRONG</div><ul>${(d.risks || []).map(w => `<li><b>${esc(w.area)}</b> — ${esc(w.text)} <small>(${w.score})</small></li>`).join('') || '<li>No weak area in our readings — the market as a whole is the main risk.</li>'}${d.note ? `<li>${esc(d.note)}</li>` : ''}</ul></div></div>
              ${(d.news || []).length ? `<div class="tp-news"><div class="lbl">LATEST NEWS</div>${d.news.slice(0, 3).map(n => `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}<small>${esc(n.source || '')}${n.published ? ' · ' + ago(n.published) : ''}</small></a>`).join('')}</div>` : ''}
              <div class="tp-links"><a href="${BASE}stock.html?t=${encodeURIComponent(r.ticker)}">One-page summary →</a><a href="${BASE}analyzer.html?t=${encodeURIComponent(r.ticker)}">Analyse every number →</a><a href="${BASE}earnings.html">Earnings calendar →</a></div>
            </article>`; }).join('')}</div>` : `<p class="muted-load">No company passes every rule in this list right now — we would rather show fewer picks than weaker ones.</p>`}
          <details class="tp-rules"><summary>How Top Picks are chosen</summary>
            <ol><li><b>Enough volume to trade:</b> at least ${big(((R.markets || {}).JSE || {}).min_value_traded, 'ZAR')} a day on the JSE and ${big(((R.markets || {}).US || {}).min_value_traded, 'USD')} in New York, market value of at least R5bn / $5bn, not flagged thin, fresh data.</li>
            <li><b>Trading picks:</b> the strongest Trading scores (3–12 months) with the price above its averages, not stretched (RSI ${((R.trading || {}).rsi_range || [40, 75]).join('–')}), and no results in the next ${(R.trading || {}).no_results_within_days || 14} days.</li>
            <li><b>Investment picks:</b> the strongest Investment scores (5–10 years), quality grade A or B, not overvalued, a healthy balance sheet and at least ${Math.round(((R.investment || {}).min_margin_of_safety || .15) * 100)}% below our model value.</li>
            <li><b>Spread the risk:</b> best score first, at most ${R.max_per_sector || 2} per sector, ${R.per_market || 5} per market. Fewer when fewer qualify.</li>
            <li><b>Always up to date:</b> rebuilt after every LRC Stock Scanner run (twice a day on weekdays). "Since added" shows how each pick has moved since it joined the list.</li></ol></details>
          ${newsHTML()}
          <p class="edu-note" style="margin-top:26px"><b>EDUCATIONAL ONLY</b> Top Picks show how our rules rank companies. They are general information, not financial advice, and do not consider your circumstances. Prices move and picks change; do your own research.</p>`;
        TP.querySelectorAll('#tpM button').forEach(b => b.onclick = () => { mkt = b.dataset.v; try { localStorage.setItem('lrc_mkt', JSON.stringify(mkt)); } catch (e) {} draw(); });
        TP.querySelectorAll('#tpK button').forEach(b => b.onclick = () => { kind = b.dataset.v; draw(); });
      };
      draw();
    };
    load();
  }

  /* ---------- MY ACCOUNT page ---------- */
  const AC = $('acRoot');
  if (AC) {
    const show = async () => {
      if (!on) { AC.innerHTML = ''; authBox(AC, show); return; }
      const sb = await client();
      const { data: { session } } = await sb.auth.getSession();
      if (location.hash === '#reset' || (session && sessionStorage.getItem('lrc_recovery'))) {
        AC.innerHTML = `<div class="auth"><h3>Choose a new password</h3><form id="npF"><label for="np">New password <small>(at least 8 characters)</small></label><input id="np" type="password" minlength="8" autocomplete="new-password" required><button class="btn btn-gold" type="submit">Save new password →</button><p class="amsg" id="npMsg"></p></form></div>`;
        $('npF').onsubmit = async e => { e.preventDefault(); const p = $('np').value; if (p.length < 8) return $('npMsg').textContent = 'At least 8 characters, please.';
          const { error } = await sb.auth.updateUser({ password: p }); if (error) return $('npMsg').textContent = error.message;
          sessionStorage.removeItem('lrc_recovery'); location.hash = ''; $('npMsg').textContent = 'Saved. Taking you to your account…'; setTimeout(show, 800); };
        return;
      }
      if (!session) { AC.innerHTML = '<div id="acAuth"></div>'; authBox($('acAuth'), show); return; }
      const { data: p } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      const prof = p || { full_name: '', markets: ['JSE', 'US'], email_updates: false };
      AC.innerHTML = `<div class="acct">
        <div class="acct-card"><div class="lbl">YOUR ACCOUNT</div><h3>${esc(prof.full_name || 'Member')}</h3><p class="muted">${esc(session.user.email)} · member since ${day((prof.created_at || session.user.created_at || '').slice(0, 10))}</p>
          <div class="acct-links"><a class="btn btn-gold" href="${BASE}top-picks.html">Open Top Picks →</a><a class="btn btn-ghost" href="${BASE}watchlist.html">Watchlist</a><a class="btn btn-ghost" href="${BASE}scanner.html">Stock Scanner</a></div></div>
        <form class="acct-card" id="prF"><div class="lbl">PREFERENCES</div>
          <label for="pf-name">Name</label><input id="pf-name" value="${esc(prof.full_name || '')}" autocomplete="name">
          <label>Markets I follow</label><div class="chk-row"><label class="check"><input type="checkbox" id="pf-jse" ${(prof.markets || []).includes('JSE') ? 'checked' : ''}> JSE</label><label class="check"><input type="checkbox" id="pf-us" ${(prof.markets || []).includes('US') ? 'checked' : ''}> New York</label></div>
          <label class="check"><input type="checkbox" id="pf-news" ${prof.email_updates ? 'checked' : ''}> Email me when Top Picks change and when new research is published</label>
          <button class="btn btn-gold" type="submit">Save preferences</button><p class="amsg" id="prMsg"></p></form>
        <form class="acct-card" id="pwF"><div class="lbl">PASSWORD</div><label for="pw1">New password</label><input id="pw1" type="password" minlength="8" autocomplete="new-password"><button class="btn btn-ghost" type="submit">Change password</button><p class="amsg" id="pwMsg"></p></form>
        <div class="acct-card"><div class="lbl">PRIVACY</div><p class="muted">We keep your name, email and preferences only to run your account (POPIA). We never sell your data. <a href="${BASE}privacy.html">Privacy policy</a></p>
          <div class="acct-links"><button class="btn btn-ghost" id="soBtn">Sign out</button><button class="btn btn-danger" id="delBtn">Delete my account</button></div><p class="amsg" id="delMsg"></p></div>
      </div>${newsHTML()}`;
      $('prF').onsubmit = async e => { e.preventDefault(); const markets = [$('pf-jse').checked && 'JSE', $('pf-us').checked && 'US'].filter(Boolean);
        const { error } = await sb.from('profiles').upsert({ id: session.user.id, email: session.user.email, full_name: $('pf-name').value.trim(), markets, email_updates: $('pf-news').checked });
        $('prMsg').textContent = error ? error.message : 'Saved ✓'; };
      $('pwF').onsubmit = async e => { e.preventDefault(); const pw = $('pw1').value; if (pw.length < 8) return $('pwMsg').textContent = 'At least 8 characters, please.';
        const { error } = await sb.auth.updateUser({ password: pw }); $('pwMsg').textContent = error ? error.message : 'Password changed ✓'; $('pw1').value = ''; };
      $('soBtn').onclick = async () => { await sb.auth.signOut(); location.href = BASE + 'index.html'; };
      $('delBtn').onclick = async () => { if (!confirm('Delete your account and all your details? This cannot be undone.')) return;
        const { error } = await sb.rpc('delete_my_account'); if (error) return $('delMsg').textContent = error.message;
        await sb.auth.signOut(); location.href = BASE + 'index.html'; };
    };
    if (on) client().then(sb => sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { sessionStorage.setItem('lrc_recovery', '1'); show(); } })).catch(() => {});
    show();
  }
})();
