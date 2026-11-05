/* LRC Results panel — opens when you click a company on the earnings calendar.
   Reported: the numbers (EPS and revenue vs estimate, change on a year ago, share-price move), what the results show, the forward
   guidance, what management said on the call, what to watch, and links to the filing.
   Upcoming: what analysts expect (EPS and revenue, ranges) and what the company guided last time.
   Data: the calendar row + data/results/<T>.json (automatic 8-K reader + LRC Research written summary). Facts only, no ratings. */
(() => {
  const D = window.LRC_DATA || 'data/';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ok = x => x !== null && x !== undefined && x !== '' && isFinite(x);
  const SYM = { USD: '$', ZAR: 'R', GBP: '£', EUR: '€' };
  const cs = c => SYM[c || 'USD'] ?? (c ? c + ' ' : '$');
  const big = (x, c) => { if (!ok(x)) return '—'; const a = Math.abs(x), s = x < 0 ? '−' : ''; return s + cs(c) + (a >= 1e12 ? (a / 1e12).toFixed(2) + ' trillion' : a >= 1e9 ? (a / 1e9).toFixed(a >= 1e11 ? 1 : 2) + 'bn' : a >= 1e6 ? (a / 1e6).toFixed(0) + 'm' : a.toLocaleString('en-ZA')); };
  const pc = (x, d = 1) => ok(x) ? (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d) + '%' : '—';
  const epsF = (x, m, u) => !ok(x) ? '—' : m === 'JSE' ? Number(x).toLocaleString('en-ZA', { maximumFractionDigits: 1 }) + (u && u !== 'c' ? ' ' + u : 'c') : (x < 0 ? '−$' : '$') + Math.abs(x).toFixed(2);
  const dfmt = (iso, o = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('en-ZA', o) : '';
  const get = f => fetch(D + f + '?v=' + Math.floor(Date.now() / 6e5)).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  const GS = { raised: ['Guidance raised', 'up'], lowered: ['Guidance cut', 'dn'], narrowed: ['Guidance narrowed', 'mid'], reaffirmed: ['Guidance kept', 'mid'],
    initiated: ['Guidance started', 'mid'], given: ['Outlook given', 'mid'], withdrawn: ['Guidance withdrawn', 'dn'], none: ['No guidance', 'nil'], 'not found': ['No outlook in the release', 'nil'] };
  const gchip = s => s && GS[s] ? `<span class="rs-g ${GS[s][1]}">${GS[s][0]}</span>` : '';
  const vs = (a, e) => ok(a) && ok(e) && e !== 0 ? (a - e) / Math.abs(e) : null;
  const tone = x => !ok(x) ? '' : x > 0.005 ? 'up' : x < -0.005 ? 'dn' : 'mid';
  const verdict = x => !ok(x) ? '' : x > 0.01 ? 'Beat' : x < -0.01 ? 'Missed' : 'In line';
  window.LRCResultsChip = gchip;

  let box, lastFocus;
  const ensure = () => {
    if (box) return;
    box = document.createElement('div'); box.className = 'sn-wrap rs-wrap';
    box.innerHTML = '<div class="sn-back"></div><aside class="sn rs" role="dialog" aria-modal="true" aria-label="Results and guidance"><div class="sn-in" id="rsIn"></div></aside>';
    document.body.appendChild(box);
    box.querySelector('.sn-back').onclick = close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) close(); });
  };
  const close = () => { if (!box) return; box.classList.remove('open'); document.documentElement.classList.remove('sn-lock'); const u = new URL(location.href); u.searchParams.delete('r'); history.replaceState(null, '', u); if (lastFocus) lastFocus.focus(); };

  const sec = (title, body, cls = '') => body ? `<section class="rs-sec ${cls}"><h3>${title}</h3>${body}</section>` : '';
  const ul = a => (a || []).length ? `<ul class="rs-ul">${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const kv = rows => `<div class="rs-kv">${rows.filter(Boolean).map(([k, v, s, t]) => `<div><span>${k}</span><b class="${t || ''}">${v}</b>${s ? `<small>${s}</small>` : ''}</div>`).join('')}</div>`;

  const numbers = (x, rep, m) => {
    const dk = (rep && rep.desk) || {}, n = dk.numbers || {};
    const cur = n.currency || x.rcur || (m === 'JSE' ? 'ZAR' : 'USD');
    if (m === 'JSE') {
      const ch = vs(n.heps ?? x.heps, n.heps_prior ?? x.heps_prior);
      return kv([
        ok(n.heps ?? x.heps) && ['Headline EPS (HEPS)', epsF(n.heps ?? x.heps, 'JSE', n.unit || x.unit), `vs ${epsF(n.heps_prior ?? x.heps_prior, 'JSE', n.unit || x.unit)} a year ago · ${pc(ch)}`, tone(ch)],
        ok(n.revenue) && ['Revenue', big(n.revenue, cur), ok(n.revenue_prior) ? `vs ${big(n.revenue_prior, cur)} · ${pc(vs(n.revenue, n.revenue_prior))}` : '', tone(vs(n.revenue, n.revenue_prior))],
        ok(n.dps ?? x.dps) && ['Dividend per share', epsF(n.dps ?? x.dps, 'JSE'), 'declared with the results'],
        x.px_move && ['Share price', pc(x.px_move.move), `${dfmt(x.px_move.from, { day: 'numeric', month: 'short' })} → ${dfmt(x.px_move.to, { day: 'numeric', month: 'short' })}`, tone(x.px_move.move)]
      ]);
    }
    const eA = n.eps ?? x.eps_actual, eE = n.eps_est ?? x.eps_est, rA = n.revenue ?? x.rev_actual, rE = n.revenue_est ?? x.rev_est, rP = n.revenue_prior ?? x.rev_prior ?? x.rev_yago;
    const es = x.surprise ?? vs(eA, eE), rs = vs(rA, rE), ry = vs(rA, rP);
    return kv([
      ['EPS', epsF(eA, m), ok(eE) ? `${verdict(es)} · estimate ${epsF(eE, m)} (${pc(es)})${n.eps_basis ? ' · ' + esc(n.eps_basis) : ''}` : 'no estimate on record', tone(es)],
      ['Revenue', big(rA, cur), ok(rA) ? (ok(rE) ? `${verdict(rs)} · estimate ${big(rE, cur)} (${pc(rs)})` : 'no estimate on record') : 'appears once the filing is read', tone(rs)],
      ok(ry) && ['Revenue vs a year ago', pc(ry), `${big(rP, cur)} in the same quarter last year`, tone(ry)],
      x.px_move && ['Share price reaction', pc(x.px_move.move), `${dfmt(x.px_move.from, { day: 'numeric', month: 'short' })} close → ${dfmt(x.px_move.to, { day: 'numeric', month: 'short' })} close`, tone(x.px_move.move)],
      ...((n.other || []).slice(0, 4).map(o => [esc(o.label), esc(o.value), esc(o.change || '')]))
    ]);
  };

  const guidance = (rep, upcoming) => {
    if (!rep) return '';
    const g = (rep.desk || {}).guidance, a = ((rep.auto || {}).guidance) || {};
    if (g) {
      const items = (g.items || []).length ? `<div class="rs-tw"><table class="rs-t"><thead><tr><th>What</th><th>Period</th><th>New</th><th>Before</th><th>Analysts</th></tr></thead><tbody>${g.items.map(i => `<tr><td>${esc(i.metric)}</td><td>${esc(i.period)}</td><td><b>${esc(i.new)}</b></td><td>${esc(i.prior || '—')}</td><td>${esc(i.consensus || '—')}${i.vs_consensus && i.vs_consensus !== 'n/a' ? ` <span class="rs-vs ${i.vs_consensus === 'above' ? 'up' : i.vs_consensus === 'below' ? 'dn' : 'mid'}">${esc(i.vs_consensus)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
      return `<div class="rs-gh">${gchip(g.status)}${upcoming ? `<small>given ${dfmt(rep.date, { day: 'numeric', month: 'short', year: 'numeric' })}</small>` : ''}</div>${g.summary ? `<p>${esc(g.summary)}</p>` : ''}${items}`;
    }
    const txt = (a.section || []).length ? a.section : a.lines || [];
    if (!txt.length) return rep.filing ? `<div class="rs-gh">${gchip(a.status || 'not found')}</div><p class="rs-muted">The results release has no outlook section. Some companies give guidance only on the call; the written summary will say so.</p>` : '';
    return `<div class="rs-gh">${gchip(a.status)}<small>in the company's own words${a.heading ? ' · “' + esc(a.heading) + '”' : ''}</small></div><div class="rs-quote">${txt.slice(0, 8).map(p => p.includes(' | ') ? `<pre>${esc(p)}</pre>` : `<p>${esc(p)}</p>`).join('')}</div><p class="rs-muted">Automatic extract from the results release. The written summary, with guidance against analysts' expectations, follows after LRC Research reads the filing.</p>`;
  };

  const sources = (rep, x) => {
    const L = [];
    const f = rep && rep.filing;
    if (f) { (f.docs || []).forEach(d => L.push([`${d.type === 'EX-99.1' ? 'Results press release' : d.desc || d.type} (${d.type})`, d.url])); L.push([`${f.form} filing at the SEC (filed ${dfmt(f.filed, { day: 'numeric', month: 'short' })})`, f.index]); }
    ((rep && rep.desk && rep.desk.sources) || []).forEach(s => { if (s.url && !L.some(l => l[1] === s.url)) L.push([s.title || s.url, s.url]); });
    const sens = x && x.source && (String(x.source).match(/https?:\S+/) || [])[0];
    if (sens && !L.some(l => l[1] === sens)) L.push(['SENS results announcement', sens]);
    return L.length ? `<ul class="rs-src">${L.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a></li>`).join('')}</ul>` : '';
  };

  const open = async (x, mkt) => {
    ensure(); lastFocus = document.activeElement;
    const m = mkt === 'jse' || /\.JO$/.test(x.t || '') ? 'JSE' : 'US', t = x.t || x.ticker, rep_ = !!x.reported;
    const IN = document.getElementById('rsIn');
    const top = `<div class="sn-top"><div><small>${rep_ ? 'Results' : 'Results due'} · ${esc(dfmt(x.date))}${x.when && x.when !== 'Not stated' ? ' · ' + esc(x.when.toLowerCase()) : ''}</small><h2>${esc(x.name || t)} <span class="rs-tk">${esc(x.ticker)}</span></h2><small>${esc(x.period || (x.quarter ? 'Quarter ending ' + x.quarter : ''))}</small></div><button class="sn-x" aria-label="Close">×</button></div>`;
    IN.innerHTML = top + '<p class="muted-load">Loading the results…</p>';
    IN.querySelector('.sn-x').onclick = close;
    box.classList.add('open'); document.documentElement.classList.add('sn-lock');
    const u = new URL(location.href); u.searchParams.set('r', t + '|' + x.date); history.replaceState(null, '', u);
    let R = null; try { R = await get('results/' + t.replace('^', '_') + '.json'); } catch (e) { }
    const reps = (R && R.reports || []).filter(r => r.filing || r.desk);
    const near = r => Math.abs((Date.parse(r.date) - Date.parse(x.date)) / 864e5) <= 4;
    const rep = rep_ ? reps.find(near) : null;
    const last = rep_ ? null : reps.filter(r => r.date < x.date).slice(-1)[0];
    const dk = (rep && rep.desk) || {};
    let h = top;
    if (rep_) {
      h += dk.headline ? `<p class="rs-head">${esc(dk.headline)}</p>` : rep && rep.title ? `<p class="rs-head rs-auto">${esc(rep.title)}</p>` : '';
      h += sec('The numbers', numbers(x, rep, m));
      h += sec('What the results show', ul(dk.results) || (rep ? '<p class="rs-muted">The written summary follows after LRC Research reads the filing (usually within a few hours of the results).</p>' : `<p class="rs-muted">${m === 'US' ? 'We have not read this company\'s results filing yet — it is picked up within a day of the results.' : 'The written summary follows once LRC Research reads the SENS results announcement.'}</p>`));
      h += sec('Forward guidance', guidance(rep) || (m === 'JSE' ? '<p class="rs-muted">JSE companies describe their prospects in the results announcement; the written summary covers it.</p>' : ''));
      h += sec('On the results call', dk.call ? (ul(dk.call.points) || '<p class="rs-muted">No reliable call coverage found.</p>') + `<p class="rs-muted">${dk.call.tone ? 'Tone: <b>' + esc(dk.call.tone) + '</b> · ' : ''}${esc(dk.call.source || '')}</p>` : '');
      h += sec('What to watch next', ul(dk.watch));
    } else {
      const cur = x.rcur || (m === 'JSE' ? 'ZAR' : 'USD');
      const eE = ok(x.eps_est_q) ? x.eps_est_q : parseFloat(String(x.eps_forecast || '').replace(/[$,]/g, '').replace(/^\((.*)\)$/, '-$1'));
      h += sec("What analysts expect", kv([
        ['EPS estimate', ok(eE) ? epsF(eE, m) : '—', ok(x.eps_yago) ? `${epsF(x.eps_yago, m)} a year ago · ${pc(vs(eE, x.eps_yago))}` : x.eps_last_year ? `${esc(x.eps_last_year)} a year ago` : ''],
        ['Revenue estimate', big(x.rev_est, cur), ok(x.rev_est_low) ? `range ${big(x.rev_est_low, cur)} – ${big(x.rev_est_high, cur)}${x.n_est ? ' · ' + x.n_est + ' analysts' : ''}` : ''],
        ok(x.rev_yago) && ['Revenue a year ago', big(x.rev_yago, cur), ok(x.rev_est) ? `expected change ${pc(vs(x.rev_est, x.rev_yago))}` : ''],
        (x.track || []).length && ['Last 4 quarters', x.track.map(v => v === 'beat' ? 'Beat' : v === 'miss' ? 'Missed' : 'In line').join(' · '), 'EPS vs estimate, oldest first'],
        x.ts && ['Trading statement', `HEPS ${pc(x.ts.low)} to ${pc(x.ts.high)}`, esc(dfmt(x.ts.date, { day: 'numeric', month: 'short' }))]
      ]));
      if (last) {
        h += sec('What the company guided last time', guidance(last, true) || '<p class="rs-muted">No guidance in the last results.</p>');
        if ((last.desk || {}).watch) h += sec('What we said to watch', ul(last.desk.watch));
      }
    }
    if (reps.length > (rep ? 1 : 0)) {
      const older = reps.filter(r => r !== rep).slice(-4).reverse();
      h += sec('Earlier results', `<ul class="rs-hist">${older.map(r => `<li><b>${esc(dfmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</b> ${gchip(((r.desk || {}).guidance || {}).status || ((r.auto || {}).guidance || {}).status)} <span>${esc((r.desk || {}).headline || r.title || '')}</span></li>`).join('')}</ul>`);
    }
    h += sec('Sources', sources(rep || last, x));
    h += `<div class="rs-btns"><a class="btn btn-gold" href="stock.html?t=${encodeURIComponent(t)}">One-page summary →</a><a class="btn btn-ghost" href="analyzer.html?t=${encodeURIComponent(t)}">Stock Analyzer</a></div>`;
    h += `<p class="rs-foot">${dk.by ? 'Summary by ' + esc(dk.by) + (dk.written ? ' · ' + esc(dfmt(dk.written.slice(0, 10), { day: 'numeric', month: 'short' })) : '') + '. ' : ''}Figures from the company's results filing and the analysts' consensus on record before the results. Facts only — not advice.</p>`;
    IN.innerHTML = h; IN.querySelector('.sn-x').onclick = close; IN.querySelector('.sn-x').focus();
    IN.parentElement.scrollTop = 0;
  };
  window.LRCResults = { open };
})();
