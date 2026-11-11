/* Core: helpers, state, shell, router, overlays. All figures are sample data for review, not real customers. */
const S = { screen: "home", tabs: {}, scenario: "live", view: "normal", insp: null, dialog: null, menu: null, filt: {}, toast: null, rid: "r1", booked: false };
const $ = (s, r = document) => r.querySelector(s);
const ICONS = window.__ICONS__;
const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true" viewBox="0 0 256 256"><use href="#i-${n}"/></svg>`;
const badge = (t, tone = "", i = "") => `<span class="badge ${tone}">${i ? ic(i) : ""}${t}</span>`;
const svc = (k) => `<span class="svc ${k}">${{ site: "Website", social: "Social & Ads", search: "Local SEO + AEO" }[k]}</span>`;
const dl = (t, v) => `<span class="delta ${v}">${t}</span>`;
const inr = (n) => "₹" + n.toLocaleString("en-IN");
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");

const strip = (items) => `<div class="strip">${items.map((m) => `<div><div class="lb">${m.l}</div><div class="vl"><span class="t-metric">${m.v}</span>${m.d ? dl(m.d, m.t || "flat") : ""}</div>${m.cx ? `<div class="cx">${m.cx}</div>` : ""}</div>`).join("")}</div>`;
const BT = { ex: "Exists", staff: "Staff only today", new: "New build" };
const panel = (title, body, o = {}) => `<section class="panel ${o.cls || ""}">${title || o.acts ? `<div class="hd"><h2 class="t-section">${title || ""}</h2>${o.src ? `<span class="btag ${o.src}">${BT[o.src]}</span>` : ""}${o.acts || ""}</div>` : ""}<div class="bd ${o.flush ? "flush" : ""}">${body}</div>${o.foot ? `<div class="ft">${o.foot}</div>` : ""}</section>`;
const pageHead = (title, meta, acts = "") => `<div class="ph"><div class="tx"><h1 class="t-title">${title}</h1>${meta ? `<p class="t-meta">${meta}</p>` : ""}</div><div class="acts">${acts}</div></div>`;
const tabsBar = (id, list) => { const cur = S.tabs[id] || list[0][0]; return `<div class="tabs" role="tablist">${list.map(([k, l, n]) => `<button role="tab" aria-selected="${cur === k}" data-tab="${id}:${k}">${l}${n ? `<span class="n">${n}</span>` : ""}</button>`).join("")}</div>`; };
const curTab = (id, def) => S.tabs[id] || def;
const table = (head, rows, o = {}) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th class="${h.c || ""}">${h.t}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>${o.foot ? `<div class="tbl-foot">${o.foot}</div>` : ""}`;
const field = (id, label, o = {}) => `<div class="field ${o.cls || ""}"><label for="${id}">${label}</label>${o.type === "select" ? `<select class="sel" id="${id}">${o.opts.map((x) => `<option ${x === o.v ? "selected" : ""}>${x}</option>`).join("")}</select>` : o.type === "area" ? `<textarea class="txa" id="${id}" placeholder="${o.ph || ""}">${o.v || ""}</textarea>` : `<input class="inp ${o.bad ? "bad" : ""}" id="${id}" value="${o.v ?? ""}" placeholder="${o.ph || ""}" ${o.bad ? 'aria-invalid="true"' : ""}>`}${o.hint ? `<span class="hint">${o.hint}</span>` : ""}${o.bad ? `<span class="err">${ic("WarningCircle", "s")}${o.bad}</span>` : ""}</div>`;
const toggle = (id, on = false) => `<label class="tog"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><i></i><span class="sr">Toggle</span></label>`;
const empty = (icon, title, text, act = "") => `<div class="empty"><span class="ico">${ic(icon)}</span><h3 class="t-sub">${title}</h3><p>${text}</p>${act}</div>`;

/* Line chart: one scale places marks, ticks and labels. series: [{name,color,data,dash}] */
function lineChart(series, labels, o = {}) {
  const W = 640, H = o.h || 220, L = 44, R = 12, T = 12, B = 28;
  const all = series.flatMap((s) => s.data); let max = Math.max(...all), min = o.zero === false ? Math.min(...all) : 0;
  const step = o.step || niceStep((max - min) / 4); max = Math.ceil(max / step) * step; min = Math.floor(min / step) * step;
  const x = (i, n) => L + (i * (W - L - R)) / (n - 1), y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const ticks = []; for (let v = min; v <= max + 1e-9; v += step) ticks.push(v);
  const fmt = o.fmt || ((v) => v.toLocaleString("en-IN"));
  const lx = labels.map((l, i) => (i % Math.ceil(labels.length / 6) === 0 ? `<text x="${x(i, labels.length)}" y="${H - 8}" text-anchor="middle">${l}</text>` : "")).join("");
  const a0 = series[0].data, area = `<polygon fill="${series[0].color}" fill-opacity=".07" points="${x(0, a0.length).toFixed(1)},${y(min)} ${a0.map((v, i) => `${x(i, a0.length).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} ${x(a0.length - 1, a0.length).toFixed(1)},${y(min)}"/>`;
  const lines = series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="1.75" ${s.dash ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round" points="${s.data.map((v, i) => `${x(i, s.data.length).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}"/>`).join("");
  const last = series[0]; const ex = x(last.data.length - 1, last.data.length), ey = y(last.data[last.data.length - 1]);
  const tips = o.tip ? series[0].data.map((v, i) => `<circle cx="${x(i, series[0].data.length).toFixed(1)}" cy="${y(v).toFixed(1)}" r="9" fill="transparent"><title>${o.tip(i, v)}</title></circle>`).join("") : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${o.label || "Chart"}">${ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join("")}${lx}${area}${lines}<circle cx="${ex}" cy="${ey}" r="4" fill="${last.color}" stroke="#fff" stroke-width="2"/>${tips}</svg>`;
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
const spark = (d, c = "var(--c1)") => { const mx = Math.max(...d), mn = Math.min(...d); return `<svg class="spark" viewBox="0 0 72 24" aria-hidden="true"><polyline fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${d.map((v, i) => `${(i * 72 / (d.length - 1)).toFixed(1)},${(22 - ((v - mn) / (mx - mn || 1)) * 20).toFixed(1)}`).join(" ")}"/></svg>`; };
const legend = (items) => `<div class="legend">${items.map(([n, c]) => `<span><i style="--c:${c}"></i>${n}</span>`).join("")}</div>`;
const barlist = (items, color) => `<div class="barlist">${items.map(([l, v, p]) => `<div class="b"><span>${l}</span><div class="tr"><i style="width:${p}%;--bar:${color || "var(--c1)"}"></i></div><span class="v">${v}</span></div>`).join("")}</div>`;

/* ---------- Navigation model ---------- */
function navModel() {
  const w = S.scenario === "welcome";
  const g = (label, items) => ({ label, items });
  const top = [["home", "Home", "House"], ...(w ? [] : [["enquiries", "Enquiries", "Tray", 4]]), ["requests", "Requests", "ChatsCircle", w ? 0 : 2]];
  const svcs = w ? [] : [["website", "Website", "Globe", 0, "site"], ["social", "Social & Ads", "Megaphone", 0, "social"], ["search", "Local SEO + AEO", "MapPinArea", 0, "search"]];
  const biz = w ? [["business", "Business profile", "Storefront"]] : [["reports", "Reports", "ChartLineUp"], ["business", "Business profile", "Storefront"]];
  return [g(null, top), ...(svcs.length ? [g("Services", svcs)] : []), g("Business", biz)];
}
const FOOT = [["plan", "Plan & billing", "CreditCard"], ["settings", "Settings", "GearSix"], ["help", "Help & calls", "Question"]];
const TITLES = { home: "Home", enquiries: "Enquiries", requests: "Requests", request: "Requests", website: "Website", social: "Social & Ads", search: "Local SEO + AEO", reports: "Reports", report: "Reports", business: "Business profile", plan: "Plan & billing", settings: "Settings", help: "Help & calls", system: "Design system", auth: "Sign in" };
const navItem = ([k, l, i, n, m]) => `<button class="nav-i" data-go="${k}" ${S.screen === k || (k === "requests" && S.screen === "request") || (k === "reports" && S.screen === "report") ? 'aria-current="page"' : ""}>${ic(i)}<span>${l}</span>${n ? `<span class="cnt">${n}</span>` : m ? `<i class="mk" style="background:var(--svc-${m})"></i>` : ""}</button>`;

function shell(body) {
  if (S.screen === "auth") return body;
  const nav = navModel();
  const side = `<aside class="side" aria-label="Main"><div class="brand">${window.__LOGO__}</div>
    <button class="biz" data-menu="biz"><span class="av acc">AD</span><span><b>Apex Diagnostics</b><span>${S.scenario === "welcome" ? "Plan active" : "3 services"}</span></span>${ic("CaretDown", "s")}</button>
    <button class="search-btn" data-dlg="search">${ic("MagnifyingGlass", "s")}Search<kbd>⌘K</kbd></button>
    ${nav.map((g) => `<div class="nav-group">${g.label ? `<div class="nav-label">${g.label}</div>` : ""}${g.items.map(navItem).join("")}</div>`).join("")}
    <div class="side-foot">${FOOT.map(navItem).join("")}<button class="me" data-menu="me"><span class="av">AV</span><span><b>Anand Verma</b><span>Owner</span></span>${ic("DotsThree", "s")}</button></div></aside>`;
  const crumb = `<div class="crumbs"><span class="c1">Apex Diagnostics</span>${ic("CaretRight")}<b>${TITLES[S.screen]}</b></div>`;
  const top = `<header class="top"><button class="ibtn phone-only" data-menu="biz" aria-label="Business">${ic("Storefront")}</button>${crumb}<span class="grow"></span><button class="search-btn" data-dlg="search">${ic("MagnifyingGlass", "s")}Search pages and enquiries<kbd>⌘K</kbd></button><button class="ibtn" data-menu="bell" aria-label="Notifications">${ic("Bell")}</button><button class="ibtn phone-only" data-menu="me" aria-label="Account">${ic("UserCircle")}</button></header>`;
  const w = S.scenario === "welcome";
  const tabs = w ? [["home", "Home", "House"], ["requests", "Requests", "ChatsCircle"], ["business", "Business", "Storefront"], ["plan", "Billing", "CreditCard"], ["more", "More", "List"]] : [["home", "Home", "House"], ["enquiries", "Enquiries", "Tray", 4], ["svcs", "Services", "Globe"], ["requests", "Requests", "ChatsCircle", 2], ["more", "More", "List"]];
  const tb = `<nav class="tabbar" aria-label="Main">${tabs.map(([k, l, i, n]) => `<button data-go="${k === "more" || k === "svcs" ? "" : k}" ${k === "more" ? 'data-menu="more"' : k === "svcs" ? 'data-menu="svcs"' : ""} ${S.screen === k ? 'aria-current="page"' : ""}>${ic(i)}${l}${n ? `<span class="cnt">${n}</span>` : ""}</button>`).join("")}</nav>`;
  return `<a class="skip" href="#page">Skip to content</a><div class="app">${side}<div class="main">${top}<main class="page" id="page" tabindex="-1">${body}</main></div></div>${tb}`;
}

/* ---------- Render ---------- */
function reviewBar() {
  const jump = Object.entries({ home: "Home", enquiries: "Enquiries", requests: "Requests", request: "Request detail", website: "Website", social: "Social & Ads", search: "Local SEO + AEO", reports: "Reports", report: "Report detail", business: "Business profile", plan: "Plan & billing", settings: "Settings", help: "Help & calls", system: "Design system", auth: "Sign in" });
  return `<details class="review" ${S.rvopen ?? innerWidth > 860 ? "open" : ""}><summary>Review</summary><div class="rv-in" role="group" aria-label="Review controls"><label>Customer<select id="rv-sc"><option value="live" ${S.scenario === "live" ? "selected" : ""}>A month in</option><option value="preview" ${S.scenario === "preview" ? "selected" : ""}>Preview ready</option><option value="welcome" ${S.scenario === "welcome" ? "selected" : ""}>Just paid</option></select></label><label>View<select id="rv-vw">${[["normal", "Normal"], ["loading", "Loading"], ["empty", "Empty"], ["error", "Error"]].map(([k, l]) => `<option value="${k}" ${S.view === k ? "selected" : ""}>${l}</option>`).join("")}</select></label><label><input type="checkbox" id="rv-tg" ${S.tags ? "checked" : ""}>Build tags</label><label>Jump<select id="rv-go">${jump.map(([k, l]) => `<option value="${k}" ${S.screen === k ? "selected" : ""}>${l}</option>`).join("")}</select></label></div></details>`;
}
function overlays() {
  let o = "";
  if (S.insp) o += `<div class="scrim" data-close></div>${renderInspector()}`;
  if (S.dialog) o += `<div class="scrim" data-close></div>${renderDialog()}`;
  if (S.menu) o += renderMenu();
  return o;
}
function render() {
  document.documentElement.dataset.accent = S.accent;
  document.documentElement.dataset.tags = S.tags ? "on" : "off";
  const fn = SCREENS[S.screen] || SCREENS.home;
  const keep = $("#page") ? $("#page").scrollTop : 0;
  const ovKey = (S.insp ? "i" : "") + (S.dialog || "") + (S.menu ? S.menu.id : ""), enter = ovKey && ovKey !== S._ovKey; S._ovKey = ovKey;
  $("#root").innerHTML = shell(applyView(fn())) + `<div class="ov ${enter ? "enter" : ""}">${overlays()}</div>` + reviewBar();
  const c = document.querySelector(".crumbs b"), tb = document.querySelector(".tabs [aria-selected=\"true\"]");
  if (c && tb) c.textContent = TITLES[S.screen] + " · " + tb.childNodes[0].textContent;
  const ov = document.querySelector(".dialog, .insp"); if (ov) ov.focus();
}
function go(screen, tab) {
  S.screen = screen; S.insp = null; S.dialog = null; S.menu = null;
  if (tab) S.tabs[screen] = tab;
  render(); window.scrollTo(0, 0);
}
function toast(t) { document.querySelectorAll(".toast").forEach((n) => n.remove()); const n = document.createElement("div"); n.className = "toast"; n.setAttribute("role", "status"); n.innerHTML = ic("CheckCircle", "s") + t; document.body.appendChild(n); clearTimeout(toast.t); toast.t = setTimeout(() => n.remove(), 2400); }

document.addEventListener("click", (e) => {
  const pick = e.target.closest(".chip:not([data-flt]), .slot");
  if (pick) { pick.parentElement.querySelectorAll(pick.className.split(" ")[0] === "slot" ? ".slot" : ".chip").forEach((b) => b.setAttribute("aria-pressed", String(b === pick))); return; }
  const t =e.target.closest("[data-go],[data-tab],[data-open],[data-dlg],[data-close],[data-menu],[data-toast],[data-pick],[data-flt],[data-book],[data-vw]");
  if (!t) { if (S.menu) { S.menu = null; render(); } return; }
  if (t.dataset.menu) { S.menu = { id: t.dataset.menu, r: t.getBoundingClientRect() }; render(); e.stopPropagation(); return; }
  if (t.dataset.go !== undefined) { const [s, tb] = t.dataset.go.split(":"); if (s) go(s, tb); return; }
  if (t.dataset.tab) { const [id, k] = t.dataset.tab.split(":"); S.tabs[id] = k; S.insp = null; render(); return; }
  if (t.dataset.open) { S.insp = t.dataset.open; S.menu = null; render(); return; }
  if (t.dataset.dlg) { S.dialog = t.dataset.dlg; S.insp = null; S.menu = null; render(); return; }
  if (t.dataset.close !== undefined) { S.insp = null; S.dialog = null; S.menu = null; render(); return; }
  if (t.dataset.toast) { S.insp = null; S.dialog = null; S.menu = null; toast(t.dataset.toast); return; }
  if (t.dataset.flt) { const [k, v] = t.dataset.flt.split(":"); S.filt[k] = v; render(); return; }
  if (t.dataset.pick) { const [k, v] = t.dataset.pick.split(":"); S.filt[k] = v; render(); return; }
  if (t.dataset.vw) { S.view = t.dataset.vw; render(); return; }
  if (t.dataset.book) { S.booked = true; S.dialog = null; toast("Call booked. The video link is in your email."); return; }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "rv-sc") { S.scenario = e.target.value; S.screen = S.screen === "auth" ? "home" : S.screen; render(); }
  if (e.target.id === "rv-vw") { S.view = e.target.value; render(); }
  if (e.target.id === "rv-go") { go(e.target.value); }
  if (e.target.id === "rv-tg") { S.tags = e.target.checked; render(); }
});
document.addEventListener("toggle", (e) => { if (e.target.classList && e.target.classList.contains("review")) S.rvopen = e.target.open; }, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (S.insp || S.dialog || S.menu)) { S.insp = S.dialog = S.menu = null; render(); }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); S.dialog = "search"; render(); }
});

function renderMenu() {
  const m = S.menu, r = m.r; const pos = (w) => `top:${Math.min(r.bottom + 6, innerHeight - 260)}px;left:${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  if (m.id === "me") return `<div class="menu" style="${pos(240)}"><div style="padding:8px 10px"><b>Anand Verma</b><div class="t-meta">anand@apexdiagnostics.in</div></div><hr><button data-go="settings">${ic("UserCircle", "s")}Your profile</button><button data-go="settings:security">${ic("Lock", "s")}Sign-in and security</button><button data-go="help">${ic("Question", "s")}Help and calls</button><hr><button data-go="auth">${ic("SignOut", "s")}Sign out</button></div>`;
  if (m.id === "biz") return `<div class="menu" style="${pos(260)}"><div style="padding:8px 10px" class="t-meta">Your business</div><button data-toast="You are already on Apex Diagnostics"><span class="av acc" style="width:24px;height:24px;font-size:11px">AD</span>Apex Diagnostics${ic("Check", "s")}</button><hr><button data-toast="Adding another business is a request to our team">${ic("Plus", "s")}Add another business</button></div>`;
  if (m.id === "bell") return `<div class="menu" style="${pos(340)};right:8px;left:auto;width:340px"><div style="padding:8px 10px"><b>Notifications</b></div>${[["Tray", "New enquiry from Rohan Mehta", "12 min ago", "enquiries"], ["ChatCircleDots", "Anita replied on your Google profile request", "2 h ago", "requests"], ["Receipt", "Invoice for 26 Oct is ready", "3 days ago", "plan:invoices"]].map(([i, t, a, g]) => `<button data-go="${g}" style="height:auto;padding:8px 10px;align-items:flex-start">${ic(i, "s")}<span><span style="display:block">${t}</span><span class="t-meta">${a}</span></span></button>`).join("")}</div>`;
  if (m.id === "svcs") return `<div class="menu" style="left:8px;right:auto;bottom:72px;top:auto;width:260px">${[["website", "Website", "Globe"], ["social", "Social & Ads", "Megaphone"], ["search", "Local SEO + AEO", "MapPinArea"]].map(([k, l, i]) => `<button data-go="${k}">${ic(i, "s")}${l}</button>`).join("")}</div>`;
  if (m.id === "svc") return `<div class="menu" style="${pos(260)}"><button data-dlg="newreq">${ic("ChatText", "s")}Ask about this service</button><button data-dlg="cancel">${ic("Trash", "s")}Remove from next billing date</button></div>`;
  if (m.id === "more") return `<div class="menu" style="left:auto;right:8px;bottom:72px;top:auto;width:260px">${[["reports", "Reports", "ChartLineUp"], ["business", "Business profile", "Storefront"], ["plan", "Plan & billing", "CreditCard"], ["settings", "Settings", "GearSix"], ["help", "Help & calls", "Question"], ...(S.scenario === "welcome" ? [] : [["social", "Social & Ads", "Megaphone"], ["search", "Local SEO + AEO", "MapPinArea"]])].map(([k, l, i]) => `<button data-go="${k}">${ic(i, "s")}${l}</button>`).join("")}</div>`;
  return "";
}

/* Loading, empty and error views: every data screen keeps its header and tabs and swaps the body. */
const EMPTY = {
  home: ["CheckCircle", "Nothing needs you right now", "When we need an approval, a photo or a decision, it shows here and in your email."],
  enquiries: ["Tray", "No enquiries yet", "When someone calls, chats, fills a form or answers an ad, they show up here with a way to reply in one tap."],
  requests: ["ChatsCircle", "No requests yet", "Ask for a change, send us something or ask a question. You can follow it here from the first reply to done."],
  request: ["ChatsCircle", "This request has no messages yet", "We reply within one working day."],
  website: ["Globe", "Nothing to show yet", "Visits and enquiries appear here once your website has been live for a day."],
  social: ["Megaphone", "Your first posts are being planned", "After your kickoff call we plan the first month. You approve every post before it goes out."],
  search: ["MapPinArea", "Your first rankings arrive next week", "We check your searches every week. The first results appear here."],
  reports: ["ChartLineUp", "Your first report arrives early next month", "It covers what we did and what it brought you."],
  report: ["ChartLineUp", "This report is not ready", "We send it once the month closes."],
  business: ["Storefront", "Add your business details", "We use them on your website, Google profile and listings."],
  plan: ["Receipt", "No invoices yet", "Your first invoice appears after your first payment."],
  settings: ["GearSix", "Nothing here yet", "Settings appear once your account is set up."],
  help: ["CalendarBlank", "No calls booked", "Book a 30 minute video call with our team any time."],
};
function applyView(html) {
  if (S.view === "normal" || ["auth", "system"].includes(S.screen)) return html;
  const t = document.createElement("div"); t.innerHTML = html;
  const keep = [...t.children].filter((c) => c.classList.contains("ph") || c.classList.contains("tabs") || (c.classList.contains("row") && c.querySelector(".btn.ghost"))).map((c) => c.outerHTML).join("");
  const sk = (w) => `<div class="skel" style="width:${w}"></div>`;
  let body = "";
  if (S.view === "loading") body = `<div class="stack" aria-busy="true" aria-label="Loading"><div class="strip">${[1, 2, 3, 4].map(() => `<div>${sk("50%")}<div style="height:10px"></div><div class="skel" style="width:35%;height:28px"></div></div>`).join("")}</div>${panel("", [1, 2, 3, 4, 5].map(() => `<div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle);display:flex;gap:16px">${sk("22%")}${sk("30%")}${sk("12%")}</div>`).join(""), { flush: 1 })}</div>`;
  else if (S.view === "error") body = `<div class="banner neg" role="alert">${ic("WarningCircle")}<div class="tx"><b>We could not load this page.</b> Your data is safe. Check your connection and try again. If it keeps happening, tell us and quote this time: ${"24 Nov, 11:42"}.</div><button class="btn sm" data-vw="normal">Try again</button></div>`;
  else { const [i, a, b] = EMPTY[S.screen] || EMPTY.home; body = panel("", empty(i, a, b, S.screen === "enquiries" ? `<button class="btn" data-toast="Link copied">Copy your website link</button>` : "")); }
  return keep + body;
}
