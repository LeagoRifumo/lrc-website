/* LRC Trading Desk — private staff page (desk.html). Not linked from the public menus; noindex.
   Data and rules live in the members database (Supabase): see supabase/desk.sql. Every change goes through a database
   function that checks the signed-in desk, so the technical desk can't act before a handover and a "no trade" can't be overridden.
   Sign-in uses four desk accounts (one per desk); their passwords are set in Supabase → Authentication → Users,
   changed on the page (Change desk password) or reset with "Forgot password?" (link emailed to info@). */
(() => {
"use strict";
const CFG = window.LRC_AUTH || {
  url: 'https://wpoknxskdrjurjdpxqav.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indwb2tueHNrZHJqdXJqZHB4cWF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NTAyNDYsImV4cCI6MjEwOTIyNjI0Nn0.z8uzgQp7YmJ1NQNAENAV5F9euQERYVGKzenumOaV6Ec'
};
/* Desk accounts use "plus" addresses of info@, so password-reset links land in the info@leagorifumocapital.co.za inbox. */
const DESK_EMAIL = {
  fx_fund: 'info+forex-fundamental@leagorifumocapital.co.za', fx_tech: 'info+forex-technical@leagorifumocapital.co.za',
  eq_fund: 'info+equity-fundamental@leagorifumocapital.co.za', eq_tech: 'info+equity-technical@leagorifumocapital.co.za'
};
const RESET_INBOX = 'info@leagorifumocapital.co.za';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pad = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const addDays = (ymd, n) => { const [y,m,d] = ymd.split("-").map(Number); const x = new Date(y, m-1, d+n); return `${x.getFullYear()}-${pad(x.getMonth()+1)}-${pad(x.getDate())}`; };
const daysUntil = ymd => { const [y,m,d] = ymd.split("-").map(Number); const t = new Date(); return Math.round((new Date(y,m-1,d) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000); };
const fmtDate = s => { if (!s) return "—"; const d = s.length === 10 ? new Date(s + "T12:00:00") : new Date(s); return d.toLocaleDateString("en-ZA", {day:"numeric", month:"short", year:"numeric"}); };
const fmtDT = s => s ? new Date(s).toLocaleString("en-ZA", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"}) : "—";
const fmtP = n => (n == null || n === "" || isNaN(n)) ? "—" : String(+Number(n).toFixed(5));
const fmtR = r => (r == null || isNaN(r)) ? "—" : (r > 0 ? "+" : "") + Number(r).toFixed(2) + "R";
const num = v => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : null; };

const DESKS = { fx: { name: "Forex desk", short: "Forex" }, eq: { name: "Equity desk", short: "Equity" } };
const ROLE_NAME = { fund: "Fundamental", tech: "Technical" };
const STATUS = {
  draft: { label: "Draft", tone: "" }, watchlist: { label: "Watchlist · Low", tone: "" },
  handed_over: { label: "Awaiting technical", tone: "accent" }, waiting: { label: "Waiting for setup", tone: "warn" },
  approved: { label: "Approved", tone: "buy" }, executed: { label: "Live", tone: "live" }, closed: { label: "Closed", tone: "" },
  no_trade: { label: "No trade", tone: "sell" }, withdrawn: { label: "Withdrawn", tone: "" }, cancelled: { label: "Not filled", tone: "" },
  expired: { label: "Expired", tone: "" }
};
const SETUPS = ["Supply zone", "Demand zone", "Break and retest", "No setup yet – wait"];
const WAIT = "No setup yet – wait";
const FX_DRIVERS = ["Interest rate differential", "Central bank policy", "Inflation", "Growth / PMI", "Risk sentiment", "Commodity link", "Positioning (COT)", "Politics / fiscal"];
const EQ_DRIVERS = ["Earnings growth", "Margins", "Balance sheet", "Dividend / buybacks", "Management", "Sector tailwind", "Macro / rates", "Corporate action"];
const REASON_LABEL = { direction: "Desks disagree on direction", setup_conflict: "Setup conflicts with bias", tech_low: "Low technical confidence", fund_low: "Low fundamental confidence", rr_low: "Risk-to-reward below minimum", levels: "Invalid levels" };

/* ---------- state ---------- */
const S = { sb: null, me: null, ideas: [], settings: { min_rr: 1.5, fx_expiry: 7, eq_expiry: 14 }, loaded: false,
  tab: "fx", filter: { fx: "active", eq: "active" }, logDesk: "all", pending: false, err: null };
const HASH = { fx: "forex", eq: "equity", log: "log" };
const fromHash = () => { const h = location.hash.slice(1); const k = Object.keys(HASH).find(k => HASH[k] === h); if (k) S.tab = k; };
fromHash();
window.addEventListener("hashchange", () => { fromHash(); render(true); });
const myName = () => { try { return localStorage.getItem("lrc-desk-name") || ""; } catch (e) { return ""; } };
const setName = n => { try { localStorage.setItem("lrc-desk-name", n); } catch (e) {} };
const minRR = () => Number(S.settings.min_rr) || 1.5;
function toast(msg) { const t = $("#toast"); t.textContent = msg; clearTimeout(toast.t); toast.t = setTimeout(() => t.textContent = "", 4500); }
const errText = e => (e && e.message && !/fetch|network/i.test(e.message)) ? e.message : "That didn't save because the connection dropped. Try again in a moment.";

/* ---------- trade logic (preview only — the database makes the final decision with the same rules) ---------- */
function rrOf(bias, entry, stop, target) {
  if ([entry, stop, target].some(v => v == null || v <= 0)) return null;
  if (bias === "Buy" && stop < entry && target > entry) return (target - entry) / (entry - stop);
  if (bias === "Sell" && stop > entry && target < entry) return (entry - target) / (stop - entry);
  return null;
}
function verdictOf(f, t) {
  if (t.setup === WAIT) return { status: "waiting", reasons: ["The technical desk sees no valid setup yet. The idea stays open until its expiry date."] };
  const reasons = [];
  if (t.bias !== f.bias) reasons.push(`The desks disagree on direction: fundamental says ${f.bias}, technical says ${t.bias}.`);
  if (t.setup === "Supply zone" && f.bias === "Buy") reasons.push("A supply zone is a sell setup, but the fundamental bias is Buy.");
  if (t.setup === "Demand zone" && f.bias === "Sell") reasons.push("A demand zone is a buy setup, but the fundamental bias is Sell.");
  if (f.conf === "Low") reasons.push("Fundamental confidence is Low.");
  if (t.conf === "Low") reasons.push("Technical confidence is Low.");
  const rr = rrOf(f.bias, t.entry, t.stop, t.target);
  if (rr == null) reasons.push(`Entry, stop and target don't fit a ${f.bias} trade (${f.bias === "Buy" ? "stop below entry, target above" : "stop above entry, target below"}).`);
  else if (rr < minRR() - 1e-9) reasons.push(`Risk-to-reward of 1 : ${rr.toFixed(2)} is below the 1 : ${minRR()} minimum.`);
  if (reasons.length) return { status: "no_trade", reasons };
  const full = f.conf === "High" && t.conf === "High" && t.trend === "Pro-trend";
  const why = full ? ["Both desks rate it High and the setup is pro-trend."] :
    [t.trend === "Counter-trend" ? "Counter-trend setup, so size is reduced." : null,
     (f.conf !== "High" || t.conf !== "High") ? `Confidence is ${f.conf} fundamental / ${t.conf} technical, so size is reduced.` : null].filter(Boolean);
  return { status: "approved", size: full ? "Full size" : "Reduced size", reasons: why };
}
function rMultiple(i, exit) {
  const f = i.fund || {}, t = i.tech || {}; const e = num(i.exec && i.exec.fill) ?? num(t.entry), s = num(t.stop);
  if (e == null || s == null || exit == null) return null;
  const risk = f.bias === "Buy" ? e - s : s - e;
  if (!(risk > 0)) return null;
  return (f.bias === "Buy" ? exit - e : e - exit) / risk;
}
const lockedR = i => (i.exec && i.exec.stop != null) ? rMultiple(i, num(i.exec.stop)) : null;
const isOpen = s => ["draft", "watchlist", "handed_over", "waiting"].includes(s);
const effStatus = i => (["handed_over", "waiting"].includes(i.status) && i.expiry && daysUntil(i.expiry) < 0) ? "expired" : i.status;

/* ---------- data ---------- */
async function boot() {
  if (!window.supabase || !CFG.url || !CFG.anon) { S.err = "The desk can't reach the members database. Reload the page; if it keeps happening, check the site's Supabase settings."; render(true); return; }
  const recovering = /type=recovery/.test(location.hash);
  S.sb = window.supabase.createClient(CFG.url, CFG.anon, { auth: { storageKey: "lrc-desk-auth", persistSession: true, autoRefreshToken: true } });
  S.sb.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY" && !S.recoveryShown) setTimeout(recoveryForm, 0); });
  if (/error_description=/.test(location.hash)) {
    const msg = decodeURIComponent((location.hash.match(/error_description=([^&]*)/) || [])[1] || "").replace(/\+/g, " ");
    S.err = /expired|invalid/i.test(msg) ? "That reset link has expired or was already used. Ask for a new one with \"Forgot password?\"." : msg;
    history.replaceState(null, "", location.pathname);
  }
  await whoAmI();
  if (recovering && S.me && !S.recoveryShown) setTimeout(recoveryForm, 0);
  if (S.me) await load();
  render(true);
  setInterval(() => { if (S.me && document.visibilityState === "visible" && !$("#modal").innerHTML) load().then(() => render()); }, 30000);
  document.addEventListener("visibilitychange", () => { if (S.me && document.visibilityState === "visible") load().then(() => render()); });
}
async function whoAmI() {
  const { data: sess } = await S.sb.auth.getSession();
  if (!sess || !sess.session) { S.me = null; return; }
  const { data, error } = await S.sb.rpc("desk_me");
  S.me = (!error && data && data[0]) ? data[0] : null;
  if (!S.me) await S.sb.auth.signOut();
}
async function load() {
  const [ideas, settings] = await Promise.all([
    S.sb.from("desk_ideas").select("*").order("updated_at", { ascending: false }).limit(1000),
    S.sb.from("desk_settings").select("*").eq("id", 1).maybeSingle()
  ]);
  if (ideas.error) { S.err = "The board couldn't be loaded. It retries every 30 seconds."; }
  else { S.ideas = ideas.data || []; S.err = null; S.loaded = true; }
  if (settings.data) S.settings = settings.data;
}
async function rpc(fn, args, okMsg) {
  const { data, error } = await S.sb.rpc(fn, args);
  if (error) { if (/JWT|session/i.test(error.message)) { await whoAmI(); render(true); return { error: "Your desk session ended. Sign in again." }; } return { error: errText(error) }; }
  await load(); render(true); if (okMsg) toast(okMsg);
  return { data };
}

/* ---------- rendering ---------- */
function render(force) {
  const a = document.activeElement;
  if (!force && a && $("#app").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { S.pending = true; return; }
  S.pending = false;
  $("#who").innerHTML = S.me
    ? `<span class="pill accent">${DESKS[S.me.desk].short} · ${ROLE_NAME[S.me.role]} desk</span><span>${esc(myName() || "No name set")}</span>
       <button class="btn ghost sm" data-act="pw">Change desk password</button><button class="btn ghost sm" data-act="signout">Sign out</button>`
    : `<a href="index.html">Back to the website</a>`;
  const tabs = [["fx", "Forex desk"], ["eq", "Equity desk"], ["log", "Trade log & review"]];
  $("#tabs").innerHTML = tabs.map(([k, l]) => {
    const n = (k === "fx" || k === "eq") ? S.ideas.filter(i => i.desk === k && effStatus(i) === "handed_over").length : 0;
    return `<button class="tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${l}${n ? `<span class="count" title="Awaiting technical review">${n}</span>` : ""}</button>`;
  }).join("");
  let html = S.err ? `<div class="note warn">${esc(S.err)}</div>` : "";
  if (!S.sb) html += "";
  else if (!S.me) html += signInView(S.tab === "eq" ? "eq" : "fx");
  else if (S.tab === "log") html += renderLog();
  else html += renderDesk(S.tab);
  html += `<p class="foot">Internal to Leago Rifumo Capital staff. Each desk signs in with its own password, every action is recorded with the analyst's name, and the database enforces the handover rules.</p>`;
  $("#app").innerHTML = html;
}
document.addEventListener("focusout", () => setTimeout(() => { if (S.pending && !$("#modal").innerHTML) render(); }, 0));

function signInView(desk) {
  return `<div class="panel signin">
    <span class="eyebrow subtle" style="letter-spacing:.2em;text-transform:uppercase;color:var(--gold)">Staff only</span>
    <h2 style="margin-top:6px">Sign in to the desk</h2>
    <p class="subtle">Pick your desk and enter that desk's password. The technical desk can only act on ideas the fundamental desk has handed over.</p>
    <form data-form="signin">
      <div class="field"><span class="lbl" id="l-sdesk">Desk</span><div class="seg" role="radiogroup" aria-labelledby="l-sdesk">
        <label><input type="radio" name="desk" value="fx" ${desk === "fx" ? "checked" : ""}><span>Forex</span></label><label><input type="radio" name="desk" value="eq" ${desk === "eq" ? "checked" : ""}><span>Equity</span></label></div></div>
      <div class="field"><span class="lbl" id="l-srole">Role</span><div class="seg" role="radiogroup" aria-labelledby="l-srole">
        <label><input type="radio" name="role" value="fund" checked><span>Fundamental</span></label><label><input type="radio" name="role" value="tech"><span>Technical</span></label></div></div>
      <div class="field"><label for="s-name">Your name</label><input type="text" id="s-name" name="name" required maxlength="60" autocomplete="name" value="${esc(myName())}"><p class="hint">Recorded next to every action you take.</p></div>
      <div class="field"><label for="s-pw">Desk password</label><input type="password" id="s-pw" name="pw" required autocomplete="current-password"></div>
      <p class="note bad form-error" id="signin-err"></p>
      <p class="note form-error" id="signin-ok"></p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary" type="submit">Sign in</button>
        <button class="btn ghost sm" type="button" data-act="forgot">Forgot password?</button></div>
    </form></div>`;
}

function renderDesk(desk) {
  const mine = S.me.desk === desk, role = mine ? S.me.role : null;
  const ideas = S.ideas.filter(i => i.desk === desk);
  const cnt = s => ideas.filter(i => effStatus(i) === s).length;
  const stages = [["handed_over", "Awaiting technical", "accent"], ["waiting", "Waiting for setup", "warn"], ["approved", "Approved", "buy"],
    ["executed", "Live", "live"], ["closed", "Closed", ""], ["no_trade", "No trade", "sell"]];
  const f = S.filter[desk];
  const order = { active: ["handed_over", "waiting", "approved", "executed", "draft", "watchlist"], closed: ["closed"],
    dead: ["no_trade", "expired", "withdrawn", "cancelled"],
    all: ["handed_over", "waiting", "approved", "executed", "draft", "watchlist", "closed", "no_trade", "expired", "withdrawn", "cancelled"] }[f];
  let list = "";
  order.forEach(s => {
    const items = ideas.filter(i => effStatus(i) === s);
    if (items.length) list += `<h3 class="group-h">${STATUS[s].label} · ${items.length}</h3>` + items.map(i => card(i, role)).join("");
  });
  if (!list) list = `<div class="empty">${!S.loaded ? "Loading handovers…" : f === "active"
    ? (role === "fund" ? "No open ideas. Start one with <b>New handover</b>." : "Nothing has been handed over yet. The technical desk opens once the fundamental desk hands an idea over.")
    : "Nothing here yet."}</div>`;
  return `
  <div class="deskbar"><div><h2>${DESKS[desk].name}</h2>
    <p class="subtle" style="margin:4px 0 0">${mine ? `You're working as the ${ROLE_NAME[role].toLowerCase()} desk.` : `Read-only. You're signed in to the ${DESKS[S.me.desk].short} desk. <button class="btn ghost sm" data-act="signout">Switch desk</button>`}</p></div>
    ${role === "fund" ? `<button class="btn primary" data-act="new" data-desk="${desk}">New handover</button>` : ""}</div>
  <div class="pipeline">${stages.map(([s, l, t]) => `<div class="stage ${t}"><b>${cnt(s)}</b><span>${l}</span></div>`).join("")}</div>
  <div class="filters" role="group" aria-label="Filter ideas">${[["active", "Open"], ["closed", "Closed trades"], ["dead", "No trade & expired"], ["all", "All"]]
    .map(([k, l]) => `<button class="chip" aria-pressed="${f === k}" data-act="filter" data-desk="${desk}" data-f="${k}">${l}</button>`).join("")}</div>
  <div class="stack">${list}</div>`;
}

const kv = pairs => `<dl class="kv">${pairs.filter(p => p[1] != null && p[1] !== "").map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
const biasPill = b => b ? `<span class="pill ${b === "Buy" ? "buy" : b === "Sell" ? "sell" : ""}">${esc(b)}</span>` : "";
const confPill = (c, who) => c ? `<span class="pill outline">${who} ${esc(c)}</span>` : "";
function verdictBox(v) {
  if (!v) return "";
  const cls = v.status === "approved" ? "ok" : v.status === "waiting" ? "wait" : "no";
  const head = v.status === "approved" ? `Approved · ${esc(v.size)}` : v.status === "waiting" ? "Waiting for a setup" : "No trade";
  return `<div class="verdict ${cls}"><strong>${head}</strong>${v.reasons && v.reasons.length ? `<ul>${v.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}</div>`;
}

function card(i, role) {
  const st = effStatus(i), meta = STATUS[st], f = i.fund || {}, t = i.tech, desk = i.desk;
  let expTxt = "";
  if (i.expiry && isOpen(i.status)) { const d = daysUntil(i.expiry); expTxt = d < 0 ? `Bias expired ${fmtDate(i.expiry)}` : d === 0 ? "Bias expires today" : `Bias expires in ${d} day${d === 1 ? "" : "s"}`; }
  const fundExtra = desk === "fx"
    ? kv([["Horizon", esc(f.horizon)], ["Event risk", f.eventRisk ? esc(f.eventRisk) + (f.eventDate ? ` · ${fmtDate(f.eventDate)}` : "") : ""]])
    : kv([["Company", esc([f.company, f.exchange].filter(Boolean).join(" · "))], ["Valuation", esc(f.valuation)],
        ["Fair value vs price", f.fairValue && f.price ? `<span class="mono">${fmtP(f.fairValue)} / ${fmtP(f.price)}</span> (${((f.fairValue / f.price - 1) * 100).toFixed(1)}%)` : ""],
        ["Catalyst", f.catalyst ? esc(f.catalyst) + (f.catalystDate ? ` · ${fmtDate(f.catalystDate)}` : "") : ""], ["Horizon", esc(f.horizon)]]);
  const drivers = (f.drivers || []).length ? `<div class="checks">${f.drivers.map(d => `<span class="pill outline">${esc(d)}</span>`).join("")}</div>` : "";
  const fundHalf = `<div class="half"><h3>Fundamental handover</h3><p class="thesis">${esc(f.thesis)}</p>${drivers}${fundExtra}
    ${f.invalidation ? `<div><div class="subtle">Bias changes if</div><p class="thesis">${esc(f.invalidation)}</p></div>` : ""}</div>`;
  let techHalf;
  if (!t) {
    const msg = { draft: "Locked. The technical desk opens once this idea is handed over.", watchlist: "Locked. Low-confidence ideas stay on the watchlist and can't be handed over.",
      handed_over: "Handed over. Waiting for the technical desk to review the setup.", expired: "The bias expired before a technical review. The fundamental desk can renew it or withdraw it.",
      withdrawn: "Withdrawn before a technical review." }[st] || "No technical review.";
    techHalf = `<div class="half"><h3>Technical execution</h3><div class="locked">${msg}</div></div>`;
  } else if (t.setup === WAIT) {
    techHalf = `<div class="half"><h3>Technical execution</h3>${verdictBox(i.verdict)}${kv([["Reviewed", fmtDT(t.at)], ["By", esc(t.by)]])}${t.thesis ? `<p class="thesis">${esc(t.thesis)}</p>` : ""}</div>`;
  } else {
    techHalf = `<div class="half"><h3>Technical execution</h3>
      ${kv([["Technical bias", biasPill(t.bias)], ["Setup", esc(t.setup)], ["Timeframe", esc(t.timeframe)], ["Trend", esc(t.trend)], ["Confidence", esc(t.conf)],
            [desk === "fx" ? "Session" : "Volume confirms", esc(desk === "fx" ? t.session : t.volume)]])}
      <div class="levels"><div><span>Entry</span><b>${fmtP(t.entry)}</b></div><div><span>${i.exec && i.exec.stop != null ? "Stop (trailed)" : "Stop"}</span><b>${i.exec && i.exec.stop != null ? fmtP(i.exec.stop) : fmtP(t.stop)}</b></div>
        <div><span>Target</span><b>${fmtP(t.target)}</b></div><div><span>R:R</span><b>${t.rr ? "1 : " + Number(t.rr).toFixed(2) : "—"}</b></div></div>
      ${t.invalidation ? `<div><div class="subtle">Setup invalid if</div><p class="thesis">${esc(t.invalidation)}</p></div>` : ""}
      ${t.thesis ? `<div><div class="subtle">Execution thesis</div><p class="thesis">${esc(t.thesis)}</p></div>` : ""}
      ${verdictBox(i.verdict)}</div>`;
  }
  let outcome = "";
  if (i.exec) outcome += `<span>Filled at <b class="mono">${fmtP(i.exec.fill)}</b> on ${fmtDate(i.exec.date)}</span>`;
  if (i.exec && (i.exec.trail || []).length) outcome += `<span>Stop trailed ${i.exec.trail.length}× · original <b class="mono">${fmtP(t.stop)}</b> → now <b class="mono">${fmtP(i.exec.stop)}</b>${st === "executed" && lockedR(i) != null ? ` · locks in <b class="mono ${lockedR(i) > 0 ? "pos" : lockedR(i) < 0 ? "neg" : ""}">${fmtR(lockedR(i))}</b>` : ""}</span>`;
  if (i.close) outcome += `<span>Closed at <b class="mono">${fmtP(i.close.exit)}</b> on ${fmtDate(i.close.date)}</span><span class="mono ${i.close.r > 0 ? "pos" : i.close.r < 0 ? "neg" : ""}">${fmtR(i.close.r)} · ${esc(i.close.result)}</span>${i.close.notes ? `<span>${esc(i.close.notes)}</span>` : ""}`;
  if (i.cancel_note) outcome += `<span>${esc(i.cancel_note)}</span>`;
  const acts = [];
  const B = (act, label, cls = "") => acts.push(`<button class="btn sm ${cls}" data-act="${act}" data-id="${i.id}">${label}</button>`);
  if (role === "fund") {
    if (st === "draft" || st === "watchlist") { B("edit", "Edit"); if (st === "draft") B("handover", "Hand over to technical", "primary"); B("delete", "Delete", "danger"); }
    if (st === "handed_over" || st === "waiting" || st === "expired") { B("extend", st === "expired" ? "Renew bias" : "Change expiry"); B("withdraw", "Withdraw", "danger"); }
  } else if (role === "tech") {
    if (st === "handed_over" || st === "waiting") B("review", st === "waiting" ? "Review setup again" : "Review setup", "primary");
    if (st === "approved") { B("exec", "Mark as filled", "primary"); B("cancel", "Not filled"); }
    if (st === "executed") { B("trail", "Trail stop"); B("close", "Close trade", "primary"); }
  }
  const hist = (i.history || []).slice().reverse().map(h => `<li>${fmtDT(h.at)} · ${esc(h.action)} · ${esc(h.by)}${h.role ? ` (${esc(h.role)})` : ""}</li>`).join("");
  const showSize = i.verdict && i.verdict.size && ["approved", "executed", "closed", "cancelled"].includes(st);
  return `<article class="idea t-${meta.tone || "none"}">
    <div class="idea-h"><span class="asset">${esc(f.asset || "—")}</span>${biasPill(f.bias)}<span class="pill ${meta.tone}">${meta.label}</span>
      ${showSize ? `<span class="pill ${i.verdict.size === "Full size" ? "buy" : "warn"}">${esc(i.verdict.size)}</span>` : ""}
      ${confPill(f.conf, "Fund.")}${t && t.conf && t.setup !== WAIT ? confPill(t.conf, "Tech.") : ""}</div>
    <div class="idea-meta"><span>Opened ${fmtDate(i.created_at)}${i.created_by ? ` by ${esc(i.created_by)}` : ""}</span>${i.handed_over_at ? `<span>Handed over ${fmtDT(i.handed_over_at)}</span>` : ""}${expTxt ? `<span>${expTxt}</span>` : ""}</div>
    <div class="halves">${fundHalf}${techHalf}</div>
    ${outcome ? `<div class="outcome">${outcome}</div>` : ""}
    <div class="idea-f"><details class="hist"><summary>Audit trail (${(i.history || []).length})</summary><ol>${hist}</ol></details><div class="acts">${acts.join("")}</div></div>
  </article>`;
}

/* ---------- log & review ---------- */
function renderLog() {
  const d = S.logDesk, ideas = S.ideas.filter(i => d === "all" || i.desk === d);
  const reviewed = ideas.filter(i => i.verdict && i.verdict.status !== "waiting");
  const approved = reviewed.filter(i => i.verdict.status === "approved");
  const closed = ideas.filter(i => i.status === "closed" && i.close && i.close.r != null);
  const R = i => Number(i.close.r);
  const wins = closed.filter(i => R(i) > 0.05), totalR = closed.reduce((s, i) => s + R(i), 0);
  const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
  const tiles = [["Ideas logged", ideas.length], ["Handed over", ideas.filter(i => i.handed_over_at).length],
    ["Approved of reviewed", pct(approved.length, reviewed.length)], ["No trade of reviewed", pct(reviewed.length - approved.length, reviewed.length)],
    ["Closed trades", closed.length], ["Win rate", pct(wins.length, closed.length)], ["Average R", closed.length ? fmtR(totalR / closed.length) : "—"], ["Total R", closed.length ? fmtR(totalR) : "—"]];
  const breakdown = (title, keyFn, order) => {
    const m = {};
    closed.forEach(i => { const k = keyFn(i) || "—"; m[k] = m[k] || { n: 0, w: 0, r: 0 }; m[k].n++; if (R(i) > 0.05) m[k].w++; m[k].r += R(i); });
    const keys = (order || Object.keys(m)).filter(k => m[k]);
    return `<div class="tblwrap"><div class="tbl-title">${title}</div><table><thead><tr><th></th><th class="num">Trades</th><th class="num">Win rate</th><th class="num">Avg R</th><th class="num">Total R</th></tr></thead><tbody>
      ${keys.length ? keys.map(k => `<tr><td>${esc(k)}</td><td class="num">${m[k].n}</td><td class="num">${pct(m[k].w, m[k].n)}</td><td class="num">${fmtR(m[k].r / m[k].n)}</td><td class="num">${fmtR(m[k].r)}</td></tr>`).join("")
      : `<tr><td colspan="5" class="subtle">No closed trades yet.</td></tr>`}</tbody></table></div>`;
  };
  const rc = {};
  reviewed.filter(i => i.verdict.status === "no_trade").forEach(i => (i.verdict.codes || []).forEach(c => rc[c] = (rc[c] || 0) + 1));
  const reasonRows = Object.keys(rc).sort((a, b) => rc[b] - rc[a]);
  const rows = ideas.slice().sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return `
  <div class="deskbar"><h2>Trade log & review</h2>
    <div class="filters">${[["all", "Both desks"], ["fx", "Forex"], ["eq", "Equity"]].map(([k, l]) => `<button class="chip" aria-pressed="${d === k}" data-act="logdesk" data-f="${k}">${l}</button>`).join("")}</div></div>
  <div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><span>${l}</span><b>${v}</b></div>`).join("")}</div>
  <p class="subtle" style="margin:0">These tables show whether confidence ratings and setups actually pay. Treat a row as a guide only once it has about 20 closed trades.</p>
  <div class="grid2">
    ${breakdown("By fundamental confidence", i => i.fund.conf, ["High", "Medium", "Low"])}
    ${breakdown("By technical confidence", i => i.tech && i.tech.conf, ["High", "Medium", "Low"])}
    ${breakdown("By trend alignment", i => i.tech && i.tech.trend, ["Pro-trend", "Counter-trend"])}
    ${breakdown("By setup type", i => i.tech && i.tech.setup, SETUPS)}
    ${breakdown("By position size", i => i.verdict && i.verdict.size, ["Full size", "Reduced size"])}
    <div class="tblwrap"><div class="tbl-title">Why ideas became no trade</div><table><thead><tr><th>Reason</th><th class="num">Ideas</th></tr></thead><tbody>
      ${reasonRows.length ? reasonRows.map(k => `<tr><td>${esc(REASON_LABEL[k] || k)}</td><td class="num">${rc[k]}</td></tr>`).join("") : `<tr><td colspan="2" class="subtle">No rejected ideas yet.</td></tr>`}</tbody></table></div>
  </div>
  <div class="deskbar"><h2 style="font-size:24px">Full log</h2><button class="btn" data-act="csv">Download CSV</button></div>
  <div class="tblwrap"><table><thead><tr><th>Opened</th><th>Desk</th><th>Asset</th><th>Bias</th><th>Fund.</th><th>Setup</th><th>Trend</th><th>Tech.</th><th>Status</th><th>Size</th><th class="num">R:R</th><th class="num">Result</th></tr></thead><tbody>
    ${rows.length ? rows.map(i => { const t = i.tech || {}, st = effStatus(i); return `<tr><td>${fmtDate(i.created_at)}</td><td>${DESKS[i.desk].short}</td><td class="mono">${esc(i.fund.asset)}</td><td>${biasPill(i.fund.bias)}</td><td>${esc(i.fund.conf)}</td><td>${esc(t.setup || "—")}</td><td>${esc(t.trend || "—")}</td><td>${esc(t.conf || "—")}</td><td><span class="pill ${STATUS[st].tone}">${STATUS[st].label}</span></td><td>${esc((i.verdict && i.verdict.size) || "—")}</td><td class="num">${t.rr ? Number(t.rr).toFixed(2) : "—"}</td><td class="num ${i.close ? (i.close.r > 0 ? "pos" : i.close.r < 0 ? "neg" : "") : ""}">${i.close ? fmtR(i.close.r) : "—"}</td></tr>`; }).join("")
      : `<tr><td colspan="12" class="subtle">No ideas logged yet.</td></tr>`}</tbody></table></div>
  <p class="subtle" style="margin:0">Rules in force: minimum risk-to-reward 1 : ${minRR()}, Forex bias valid ${S.settings.fx_expiry} days, Equity ${S.settings.eq_expiry} days by default.</p>`;
}
function downloadCSV() {
  const cols = ["opened", "desk", "asset", "fund_bias", "fund_confidence", "status", "tech_bias", "setup", "timeframe", "trend", "tech_confidence", "entry", "stop", "target", "rr", "size", "fill", "exit", "r_multiple", "result", "no_trade_reasons", "fundamental_by", "history"];
  const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = S.ideas.filter(i => S.logDesk === "all" || i.desk === S.logDesk).map(i => { const t = i.tech || {}, v = i.verdict || {};
    return [(i.created_at || "").slice(0, 10), DESKS[i.desk].short, i.fund.asset, i.fund.bias, i.fund.conf, STATUS[effStatus(i)].label, t.bias, t.setup, t.timeframe, t.trend, t.conf,
      t.entry, t.stop, t.target, t.rr && Number(t.rr).toFixed(2), v.size, i.exec && i.exec.fill, i.close && i.close.exit, i.close && i.close.r, i.close && i.close.result,
      (v.codes || []).map(c => REASON_LABEL[c]).join("; "), i.created_by, (i.history || []).map(h => `${(h.at || "").slice(0, 16)} ${h.action} (${h.by})`).join(" | ")].map(q).join(","); });
  const blob = new Blob(["﻿" + [cols.join(",")].concat(rows).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `LRC_desk_log_${today()}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- modal ---------- */
function openModal({ title, body, buttons, onSubmit, onInput, wide }) {
  $("#modal").innerHTML = `<div class="scrim" data-close></div><div class="dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="mtitle">
    <form id="mform"><header><h2 id="mtitle">${title}</h2><button type="button" class="btn ghost sm" data-close>Close</button></header>
    <div class="body">${body}<p class="note bad form-error" id="merr"></p></div>
    <footer><button type="button" class="btn" data-close>Cancel</button>${buttons}</footer></form></div>`;
  const form = $("#mform");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const btns = form.querySelectorAll("footer button"); btns.forEach(b => b.disabled = true); $("#merr").textContent = "";
    const res = await onSubmit(form, e.submitter ? e.submitter.value : "");
    if (res) { $("#merr").textContent = res; btns.forEach(b => b.disabled = false); if (onInput) onInput(form); } else closeModal();
  });
  if (onInput) { form.addEventListener("input", () => onInput(form)); form.addEventListener("change", () => onInput(form)); onInput(form); }
  const first = form.querySelector(".body input, .body select, .body textarea"); if (first) first.focus();
}
function closeModal() { $("#modal").innerHTML = ""; if (S.pending) render(true); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#modal").innerHTML) closeModal(); });

const fld = (id, label, control, hint) => `<div class="field"><label for="${id}">${label}</label>${control}${hint ? `<p class="hint">${hint}</p>` : ""}</div>`;
const sel = (id, opts, val) => `<select id="${id}" name="${id}" required><option value="">Select…</option>${opts.map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
const seg = (name, label, opts, val) => `<div class="field"><span class="lbl" id="l-${name}">${label}</span><div class="seg" role="radiogroup" aria-labelledby="l-${name}">${opts.map((o, k) =>
  `<label><input type="radio" name="${name}" value="${o}" ${o === val ? "checked" : ""} ${k === 0 ? "required" : ""}><span>${o}</span></label>`).join("")}</div></div>`;
const inp = (id, val, attrs = "") => `<input type="text" id="${id}" name="${id}" value="${esc(val ?? "")}" ${attrs}>`;
const area = (id, val, attrs = "") => `<textarea id="${id}" name="${id}" ${attrs}>${esc(val ?? "")}</textarea>`;
const checks = (name, opts, vals = []) => `<div class="checks">${opts.map(o => `<label><input type="checkbox" name="${name}" value="${esc(o)}" ${vals.includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}</div>`;
const dateIn = (id, val, attrs = "") => `<input type="date" id="${id}" name="${id}" value="${esc(val || "")}" ${attrs}>`;
const numIn = (id, val, attrs = "") => `<input type="number" step="any" min="0" id="${id}" name="${id}" value="${esc(val ?? "")}" class="mono" ${attrs}>`;

function fundForm(desk, idea) {
  const f = idea ? idea.fund : {}, fx = desk === "fx";
  const exp = (idea && idea.expiry) || addDays(today(), fx ? S.settings.fx_expiry : S.settings.eq_expiry);
  const body = (fx
    ? fld("asset", "Currency pair", inp("asset", f.asset, `list="pairs" required autocomplete="off" placeholder="e.g. USD/ZAR"`))
    : `<div class="row3">${fld("asset", "Ticker", inp("asset", f.asset, `required autocomplete="off" placeholder="e.g. NPN"`))}${fld("company", "Company", inp("company", f.company, `required placeholder="e.g. Naspers"`))}${fld("exchange", "Exchange", sel("exchange", ["JSE", "NYSE", "NASDAQ", "LSE", "Other"], f.exchange))}</div>`)
    + `<div class="row2">${seg("bias", "Fundamental bias", ["Buy", "Sell"], f.bias)}${fld("conf", "Confidence", sel("conf", ["High", "Medium", "Low"], f.conf))}</div><div id="lowhint"></div>`
    + (fx
      ? `<div class="row3">${fld("horizon", "Horizon", sel("horizon", ["Intraday", "Swing (days)", "Position (weeks)"], f.horizon))}${fld("eventRisk", "Key event risk", inp("eventRisk", f.eventRisk, `placeholder="e.g. FOMC, SARB MPC, US CPI"`))}${fld("eventDate", "Event date", dateIn("eventDate", f.eventDate))}</div>`
      : `<div class="row3">${fld("valuation", "Valuation view", sel("valuation", ["Undervalued", "Fair value", "Overvalued"], f.valuation))}${fld("fairValue", "Fair value estimate", numIn("fairValue", f.fairValue))}${fld("price", "Current price", numIn("price", f.price), `<span id="upside"></span>`)}</div>
         <div class="row3">${fld("catalyst", "Catalyst", inp("catalyst", f.catalyst, `placeholder="e.g. FY results, unbundling"`))}${fld("catalystDate", "Catalyst date", dateIn("catalystDate", f.catalystDate))}${fld("horizon", "Horizon", sel("horizon", ["Swing (weeks)", "Position (months)", "Long-term (1 year+)"], f.horizon))}</div>`)
    + `<div class="field"><span class="lbl">Main drivers</span>${checks("drivers", fx ? FX_DRIVERS : EQ_DRIVERS, f.drivers)}</div>`
    + fld("thesis", "Fundamental mini thesis", area("thesis", f.thesis, `required maxlength="1500" placeholder="Why this direction, in a few sentences."`))
    + fld("invalidation", "What would change the bias", area("invalidation", f.invalidation, `required maxlength="600" style="min-height:60px" placeholder="e.g. SARB cuts by 50bp; earnings miss on margins."`))
    + fld("expiry", "Bias valid until", dateIn("expiry", exp, `min="${today()}" required`), "After this date the technical desk can't act on it unless you renew it.");
  openModal({
    title: `${idea ? "Edit" : "New"} ${DESKS[desk].short.toLowerCase()} handover`, wide: true, body,
    buttons: `<button class="btn" type="submit" value="draft" id="b-draft">Save draft</button><button class="btn primary" type="submit" value="handover" id="b-hand">Hand over to technical</button>`,
    onInput: form => {
      const low = form.conf.value === "Low";
      $("#b-hand").disabled = low; $("#b-draft").textContent = low ? "Save to watchlist" : "Save draft";
      $("#lowhint").innerHTML = low ? `<div class="note warn">Low-confidence ideas can't be handed over. They're saved to the watchlist until the case is stronger.</div>` : "";
      if (!fx) { const fv = num(form.fairValue.value), p = num(form.price.value); $("#upside").textContent = fv && p ? `Upside to fair value: ${((fv / p - 1) * 100).toFixed(1)}%` : ""; }
    },
    onSubmit: async (form, action) => {
      const g = n => form[n] ? form[n].value.trim() : "";
      const fund = { asset: g("asset").toUpperCase(), bias: form.bias.value, conf: g("conf"), horizon: g("horizon"),
        drivers: [...form.querySelectorAll("input[name=drivers]:checked")].map(x => x.value), thesis: g("thesis"), invalidation: g("invalidation") };
      if (fx) Object.assign(fund, { eventRisk: g("eventRisk"), eventDate: g("eventDate") });
      else Object.assign(fund, { company: g("company"), exchange: g("exchange"), valuation: g("valuation"), fairValue: num(g("fairValue")), price: num(g("price")), catalyst: g("catalyst"), catalystDate: g("catalystDate") });
      const hand = action === "handover" && fund.conf !== "Low";
      const r = await rpc("desk_save_fund", { p_id: idea ? idea.id : null, p_desk: desk, p_fund: fund, p_expiry: g("expiry"), p_handover: hand, p_name: myName() },
        hand ? `${fund.asset} handed over to the technical desk.` : "Saved.");
      return r.error;
    }
  });
}

function techForm(i) {
  const f = i.fund, fx = i.desk === "fx", t = i.tech || {};
  const body = `<div class="handover-sum"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b class="mono" style="font-size:17px">${esc(f.asset)}</b>${biasPill(f.bias)}<span class="pill outline">Fund. ${esc(f.conf)}</span><span class="subtle">Valid until ${fmtDate(i.expiry)}</span></div>
      <p class="thesis">${esc(f.thesis)}</p><div class="subtle">Bias changes if: ${esc(f.invalidation)}</div></div>`
    + `<div class="row2">${seg("bias", "Technical bias", ["Buy", "Sell", "Neutral"], t.bias)}${fld("setup", "Setup", sel("setup", SETUPS, t.setup))}</div>`
    + `<div id="techmain" class="stack"><div class="row3">${fld("timeframe", "Timeframe", sel("timeframe", fx ? ["Weekly", "Daily", "4H", "1H", "15m"] : ["Weekly", "Daily", "4H"], t.timeframe))}${fld("trend", "Trend alignment", sel("trend", ["Pro-trend", "Counter-trend"], t.trend))}${fld("tconf", "Confidence", sel("tconf", ["High", "Medium", "Low"], t.conf))}</div>
      <div class="row3">${fx ? fld("session", "Execution session", sel("session", ["London", "New York", "London–NY overlap", "Asia", "Any"], t.session)) : fld("volume", "Volume confirms the setup", sel("volume", ["Yes", "No", "Unclear"], t.volume))}</div>
      <div class="row3">${fld("entry", "Entry", numIn("entry", t.entry))}${fld("stop", "Stop loss", numIn("stop", t.stop))}${fld("target", "Target", numIn("target", t.target))}</div>
      ${fld("tinv", "Setup is invalid if", inp("tinv", t.invalidation, `maxlength="300" placeholder="e.g. Daily close below 18.20"`))}</div>`
    + fld("tthesis", "Execution mini thesis", area("tthesis", t.thesis, `maxlength="1500" placeholder="Where and why you get in, and how you manage it."`))
    + `<div id="vbox"></div>`;
  const collect = form => {
    const o = { bias: form.bias.value, setup: form.setup.value, timeframe: form.timeframe.value, trend: form.trend.value, conf: form.tconf.value,
      entry: num(form.entry.value), stop: num(form.stop.value), target: num(form.target.value), invalidation: form.tinv.value.trim(), thesis: form.tthesis.value.trim() };
    if (fx) o.session = form.session.value; else o.volume = form.volume.value;
    return o;
  };
  openModal({
    title: "Technical review", wide: true, body,
    buttons: `<button class="btn primary" type="submit" id="b-sub">Submit review</button>`,
    onInput: form => {
      const wait = form.setup.value === WAIT;
      $("#techmain").style.display = wait ? "none" : "";
      $("#techmain").querySelectorAll("select,input").forEach(el => { if (el.name !== "tinv") el.required = !wait; });
      form.querySelectorAll("input[name=bias]")[0].required = !wait;
      form.tthesis.required = !wait;
      const t2 = collect(form);
      const ready = t2.setup && (wait || (t2.bias && t2.conf && t2.trend && t2.entry != null && t2.stop != null && t2.target != null));
      if (!ready) { $("#vbox").innerHTML = `<div class="note">The decision appears here once the setup, bias, confidence, trend and levels are filled in.</div>`; $("#b-sub").textContent = "Submit review"; return; }
      const v = verdictOf(f, t2);
      $("#vbox").innerHTML = `<div class="lbl" style="font-size:13px;font-weight:600;margin-bottom:5px">Decision under LRC rules</div>` + verdictBox(v);
      $("#b-sub").textContent = v.status === "approved" ? "Approve trade" : v.status === "waiting" ? "Mark as waiting" : "Record as no trade";
    },
    onSubmit: async form => {
      const t2 = collect(form);
      const r = await rpc("desk_review", { p_id: i.id, p_tech: t2, p_name: myName() });
      if (r.error) return r.error;
      const st = r.data && r.data.status;
      toast(st === "approved" ? `${f.asset} approved · ${r.data.size}.` : st === "waiting" ? `${f.asset} marked as waiting for a setup.` : `${f.asset} recorded as no trade.`);
    }
  });
}
function execForm(i) {
  openModal({ title: `Mark ${esc(i.fund.asset)} as filled`,
    body: `<div class="row2">${fld("fill", "Fill price", numIn("fill", i.tech.entry, "required"))}${fld("fdate", "Fill date", dateIn("fdate", today(), "required"))}</div>`,
    buttons: `<button class="btn primary" type="submit">Mark as filled</button>`,
    onSubmit: async form => (await rpc("desk_fill", { p_id: i.id, p_fill: num(form.fill.value), p_date: form.fdate.value, p_name: myName() }, "Trade marked as live.")).error });
}
function closeForm(i) {
  openModal({ title: `Close ${esc(i.fund.asset)} trade`,
    body: `<div class="row2">${fld("exit", "Exit price", numIn("exit", "", "required"))}${fld("xdate", "Exit date", dateIn("xdate", today(), "required"))}</div>
      <div id="rprev" class="note">Enter the exit price to see the result in R.</div>
      ${fld("cnotes", "Review notes", area("cnotes", "", `maxlength="800" style="min-height:60px" placeholder="What worked, what didn't, what to repeat."`))}`,
    buttons: `<button class="btn primary" type="submit">Close trade</button>`,
    onInput: form => { const r = rMultiple(i, num(form.exit.value)); $("#rprev").textContent = r == null ? "Enter the exit price to see the result in R." : `Result: ${fmtR(r)} (${r > 0.05 ? "Win" : r < -0.05 ? "Loss" : "Breakeven"})`; },
    onSubmit: async form => {
      const r = await rpc("desk_close", { p_id: i.id, p_exit: num(form.exit.value), p_date: form.xdate.value, p_notes: form.cnotes.value.trim(), p_name: myName() });
      if (r.error) return r.error; toast(`Trade closed: ${fmtR(r.data)}.`);
    } });
}
function trailForm(i) {
  const buy = i.fund.bias === "Buy", cur = num(i.exec && i.exec.stop) ?? num(i.tech.stop);
  openModal({ title: `Trail the stop on ${esc(i.fund.asset)}`,
    body: `<div class="handover-sum"><div>${biasPill(i.fund.bias)} Filled at <b class="mono">${fmtP(i.exec.fill)}</b> · original stop <b class="mono">${fmtP(i.tech.stop)}</b> · current stop <b class="mono">${fmtP(cur)}</b></div></div>
      ${fld("nstop", "New stop", numIn("nstop", "", "required"), `Must be ${buy ? "higher" : "lower"} than ${fmtP(cur)}. A trailing stop only moves in your favour.`)}
      <div id="lockprev" class="note">Enter the new stop to see what it locks in.</div>
      <p class="subtle" style="margin:0">The final result is still measured in R against the original stop of ${fmtP(i.tech.stop)}.</p>`,
    buttons: `<button class="btn primary" type="submit">Move stop</button>`,
    onInput: form => { const n = num(form.nstop.value); const el = $("#lockprev");
      if (n == null) { el.className = "note"; el.textContent = "Enter the new stop to see what it locks in."; return; }
      if (buy ? n <= cur : n >= cur) { el.className = "note bad"; el.textContent = `That would widen the stop. Enter a price ${buy ? "above" : "below"} ${fmtP(cur)}.`; return; }
      const r = rMultiple(i, n); el.className = "note"; el.textContent = r == null ? "" : r >= 0 ? `If stopped out here: ${fmtR(r)}${r > 0.05 ? " locked in" : " (breakeven)"}.` : `If stopped out here: ${fmtR(r)} (risk reduced from -1.00R).`; },
    onSubmit: async form => (await rpc("desk_trail", { p_id: i.id, p_stop: num(form.nstop.value), p_name: myName() }, "Stop moved.")).error });
}
function extendForm(i) {
  const def = addDays(today(), i.desk === "fx" ? S.settings.fx_expiry : S.settings.eq_expiry);
  openModal({ title: effStatus(i) === "expired" ? "Renew fundamental bias" : "Change bias expiry",
    body: `<p class="subtle" style="margin:0">Only renew if the fundamental case still stands today. The thesis stays as written.</p>${fld("nexp", "Bias valid until", dateIn("nexp", def, `min="${today()}" required`))}`,
    buttons: `<button class="btn primary" type="submit">Save expiry</button>`,
    onSubmit: async form => (await rpc("desk_extend", { p_id: i.id, p_expiry: form.nexp.value, p_name: myName() }, "Expiry updated.")).error });
}
function confirmForm(i, kind) {
  const c = { withdraw: ["Withdraw this handover?", "The technical desk will no longer be able to act on it. Say why for the record.", "Withdraw"],
    cancel: ["Mark as not filled?", "Use this when the entry was never reached or the order was cancelled.", "Mark as not filled"],
    delete: ["Delete this draft?", "Drafts and watchlist ideas can be deleted. This can't be undone.", "Delete"] }[kind];
  openModal({ title: c[0], body: `<p style="margin:0">${c[1]}</p>${kind !== "delete" ? fld("why", "Reason", inp("why", "", `required maxlength="300"`)) : ""}`,
    buttons: `<button class="btn primary" type="submit">${c[2]}</button>`,
    onSubmit: async form => {
      if (kind === "delete") return (await rpc("desk_delete", { p_id: i.id }, "Draft deleted.")).error;
      const why = form.why.value.trim();
      if (kind === "withdraw") return (await rpc("desk_withdraw", { p_id: i.id, p_reason: why, p_name: myName() }, "Handover withdrawn.")).error;
      return (await rpc("desk_not_filled", { p_id: i.id, p_reason: why, p_name: myName() }, "Marked as not filled.")).error;
    } });
}
async function sendReset() {
  const f = $("form[data-form=signin]"), err = $("#signin-err"), ok = $("#signin-ok");
  err.textContent = ""; ok.textContent = "";
  const desk = f.desk.value, role = f.role.value;
  const btn = f.querySelector("[data-act=forgot]"); btn.disabled = true;
  const { error } = await S.sb.auth.resetPasswordForEmail(DESK_EMAIL[desk + "_" + role], { redirectTo: location.origin + location.pathname });
  btn.disabled = false;
  if (error) { err.textContent = /rate|seconds|too many/i.test(error.message) ? "A reset link was sent a moment ago. Wait a minute before asking again." : errText(error); return; }
  ok.textContent = `A reset link for the ${DESKS[desk].short} ${ROLE_NAME[role].toLowerCase()} desk was sent to ${RESET_INBOX}. Whoever manages that inbox opens it and sets the new password. It works once and expires after an hour.`;
}
function recoveryForm() {
  S.recoveryShown = true;
  history.replaceState(null, "", location.pathname + (S.me ? "#" + HASH[S.me.desk] : ""));
  if (!S.me) { S.err = "This reset link isn't for a desk account."; render(true); return; }
  openModal({ title: `Set a new password: ${DESKS[S.me.desk].short} ${ROLE_NAME[S.me.role].toLowerCase()} desk`,
    body: `<p class="subtle" style="margin:0">This replaces the desk's password for everyone on it. Share the new one with the desk in person.</p>
      ${fld("np1", "New password", `<input type="password" id="np1" name="np1" minlength="10" required autocomplete="new-password">`, "At least 10 characters. Don't reuse a password from email or banking.")}
      ${fld("np2", "Confirm new password", `<input type="password" id="np2" name="np2" required autocomplete="new-password">`)}
      ${fld("rname", "Your name", inp("rname", myName(), `required maxlength="60" autocomplete="name"`))}`,
    buttons: `<button class="btn primary" type="submit">Save new password</button>`,
    onSubmit: async form => {
      if (form.np1.value !== form.np2.value) return "The two passwords don't match.";
      const { error } = await S.sb.auth.updateUser({ password: form.np1.value });
      if (error) return /same|different/i.test(error.message) ? "Choose a password different from the old one." : error.message;
      setName(form.rname.value.trim()); S.tab = S.me.desk; await load(); render(true);
      toast("New desk password saved. You're signed in.");
    } });
}
function passwordForm() {
  openModal({ title: `Change the ${DESKS[S.me.desk].short} ${ROLE_NAME[S.me.role].toLowerCase()} desk password`,
    body: `<p class="subtle" style="margin:0">This changes the password for everyone on this desk. Tell them the new one in person, not by email or WhatsApp group.</p>
      ${fld("np1", "New password", `<input type="password" id="np1" name="np1" minlength="10" required autocomplete="new-password">`, "At least 10 characters. Don't reuse a password from email or banking.")}
      ${fld("np2", "Confirm new password", `<input type="password" id="np2" name="np2" required autocomplete="new-password">`)}`,
    buttons: `<button class="btn primary" type="submit">Change password</button>`,
    onSubmit: async form => {
      if (form.np1.value !== form.np2.value) return "The two passwords don't match.";
      const { error } = await S.sb.auth.updateUser({ password: form.np1.value });
      if (error) return /reauth|nonce|recent/i.test(error.message) ? "For security, sign out, sign in again with the current password, then change it straight away." : error.message;
      toast("Desk password changed.");
    } });
}

/* ---------- events ---------- */
document.addEventListener("click", async e => {
  if (e.target.closest("[data-close]")) { closeModal(); return; }
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const act = b.dataset.act, i = b.dataset.id ? S.ideas.find(x => x.id === b.dataset.id) : null;
  if (act === "tab") { S.tab = b.dataset.tab; history.replaceState(null, "", "#" + HASH[S.tab]); render(true); return; }
  if (act === "filter") { S.filter[b.dataset.desk] = b.dataset.f; render(true); return; }
  if (act === "logdesk") { S.logDesk = b.dataset.f; render(true); return; }
  if (act === "signout") { await S.sb.auth.signOut(); S.me = null; S.ideas = []; S.loaded = false; render(true); return; }
  if (act === "pw") { passwordForm(); return; }
  if (act === "forgot") { sendReset(); return; }
  if (act === "new") { fundForm(b.dataset.desk); return; }
  if (act === "csv") { downloadCSV(); return; }
  if (!i) return;
  if (act === "edit") fundForm(i.desk, i);
  else if (act === "handover") { b.disabled = true; const r = await rpc("desk_handover", { p_id: i.id, p_name: myName() }, `${i.fund.asset} handed over to the technical desk.`); if (r.error) { toast(r.error); b.disabled = false; } }
  else if (act === "review") techForm(i);
  else if (act === "exec") execForm(i);
  else if (act === "close") closeForm(i);
  else if (act === "trail") trailForm(i);
  else if (act === "extend") extendForm(i);
  else if (act === "withdraw") confirmForm(i, "withdraw");
  else if (act === "cancel") confirmForm(i, "cancel");
  else if (act === "delete") confirmForm(i, "delete");
});
document.addEventListener("submit", async e => {
  const f = e.target; if (!f.dataset || f.dataset.form !== "signin") return;
  e.preventDefault();
  const err = $("#signin-err"), btn = f.querySelector("button[type=submit]"); err.textContent = ""; $("#signin-ok").textContent = ""; btn.disabled = true;
  const desk = f.desk.value, role = f.role.value, name = f.name.value.trim();
  setName(name);
  const { error } = await S.sb.auth.signInWithPassword({ email: DESK_EMAIL[desk + "_" + role], password: f.pw.value });
  if (error) {
    err.textContent = /invalid/i.test(error.message) ? "That password doesn't match this desk. Check you picked the right desk and role." : errText(error);
    btn.disabled = false; f.pw.value = ""; f.pw.focus(); return;
  }
  await whoAmI();
  if (!S.me) { err.textContent = "This desk account isn't linked to a desk yet. Run supabase/desk.sql in Supabase."; btn.disabled = false; return; }
  S.tab = S.me.desk; history.replaceState(null, "", "#" + HASH[S.tab]);
  await load(); render(true);
});
boot();
})();
