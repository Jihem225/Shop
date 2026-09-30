/* ==========================================================================
   RELAXX back office — core: helpers, auth & roles, router, shell, UI kit,
   charts, live sync with the storefront.
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX = { views: {}, routes: [], dirty: false };
  var DB = window.RelaxxDB;
  var DAY = 864e5;

  /* ---------- constants ---------- */
  RX.STATUS = {
    pending: { label: "En attente", tone: "warn" }, paid: { label: "Payée", tone: "info" }, processing: { label: "En préparation", tone: "accent" },
    shipped: { label: "Expédiée", tone: "violet" }, delivered: { label: "Livrée", tone: "ok" }, cancelled: { label: "Annulée", tone: "muted" }, refunded: { label: "Remboursée", tone: "bad" }
  };
  RX.STATUS_ORDER = ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"];
  RX.PAY = { mobilemoney: "Mobile Money", card: "Carte bancaire", cod: "À la livraison", paypal: "PayPal", applepay: "Apple Pay" };
  RX.OPS = { wave: "Wave", orange: "Orange Money", mtn: "MTN MoMo", moov: "Moov Money" };
  RX.SHIP = { standard: "Standard", express: "Express" };
  RX.TAGS = { "": "Aucune", "Best Selling": "Meilleure vente", "New Collection": "Nouvelle collection", "On Sale": "Promo" };
  RX.PSTATUS = { active: { label: "Actif", tone: "ok" }, draft: { label: "Brouillon", tone: "muted" }, archived: { label: "Archivé", tone: "bad" } };
  RX.ROLES = {
    admin: { label: "Administrateur", desc: "Accès complet, y compris les réglages et l'équipe." },
    manager: { label: "Gestionnaire", desc: "Ventes, catalogue et marketing. Pas de réglages ni d'équipe." },
    support: { label: "Support client", desc: "Commandes, clients et avis. Catalogue en lecture." },
    viewer: { label: "Lecture seule", desc: "Consulte les tableaux de bord et les listes, sans rien modifier." }
  };
  // section -> access per role ("w" write, "r" read, "" none)
  RX.PERMS = {
    dashboard: { admin: "w", manager: "w", support: "r", viewer: "r" },
    reports: { admin: "w", manager: "w", support: "", viewer: "r" },
    orders: { admin: "w", manager: "w", support: "w", viewer: "r" },
    customers: { admin: "w", manager: "w", support: "w", viewer: "r" },
    products: { admin: "w", manager: "w", support: "r", viewer: "r" },
    inventory: { admin: "w", manager: "w", support: "r", viewer: "r" },
    categories: { admin: "w", manager: "w", support: "", viewer: "" },
    reviews: { admin: "w", manager: "w", support: "w", viewer: "r" },
    promos: { admin: "w", manager: "w", support: "", viewer: "" },
    newsletter: { admin: "w", manager: "w", support: "", viewer: "" },
    content: { admin: "w", manager: "w", support: "", viewer: "" },
    shipping: { admin: "w", manager: "r", support: "", viewer: "" },
    payments: { admin: "w", manager: "r", support: "", viewer: "" },
    settings: { admin: "w", manager: "", support: "", viewer: "" },
    users: { admin: "w", manager: "", support: "", viewer: "" },
    activity: { admin: "w", manager: "r", support: "", viewer: "" }
  };
  RX.SECTION_LABELS = { dashboard: "Tableau de bord", reports: "Rapports", orders: "Commandes", customers: "Clients", products: "Produits", inventory: "Stock",
    categories: "Catégories", reviews: "Avis", promos: "Codes promo", newsletter: "Newsletter", content: "Vitrine & contenus", shipping: "Livraison", payments: "Paiements",
    settings: "Réglages", users: "Équipe", activity: "Journal" };

  /* ---------- icons (24px stroke) ---------- */
  var P = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; };
  RX.I = {
    home: P('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
    chart: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    bag: P('<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
    users: P('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
    user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    tag: P('<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    box: P('<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>'),
    layers: P('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    star: P('<path d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.8L12 3Z"/>'),
    percent: P('<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
    mail: P('<rect x="3" y="5" width="18" height="14"/><path d="m3 7 9 6 9-6"/>'),
    edit: P('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    truck: P('<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
    card: P('<rect x="2.5" y="5" width="19" height="14"/><path d="M2.5 10h19M6 15h4"/>'),
    gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    shield: P('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>'),
    list: P('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    bell: P('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    ext: P('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    x: P('<path d="M6 6l12 12M18 6 6 18"/>'),
    menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    down: P('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
    up: P('<path d="M12 20V8M6 14l6-6 6 6M4 4h16"/>'),
    moon: P('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    logout: P('<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>'),
    key: P('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
    eye: P('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: P('<path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    trash: P('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
    copy: P('<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>'),
    print: P('<path d="M7 9V3h10v6M7 18H4v-8h16v8h-3"/><path d="M7 14h10v7H7z"/>'),
    check: P('<path d="m5 12 5 5L20 7"/>'),
    alert: P('<path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18h.01"/>'),
    info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>'),
    globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    megaphone: P('<path d="M3 10v4h4l8 5V5L7 10H3Z"/><path d="M19 9a4 4 0 0 1 0 6"/>'),
    refresh: P('<path d="M20 11A8 8 0 0 0 5.3 7M4 13a8 8 0 0 0 14.7 4"/><path d="M5 3v4h4M19 21v-4h-4"/>'),
    upload: P('<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>'),
    arrowR: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    trendUp: P('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    wallet: P('<path d="M3 7h16v12H3z"/><path d="M3 7l12-4v4M16 13h2"/>'),
    layout: P('<rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M9 9v11"/>'),
    lock: P('<rect x="4" y="10" width="16" height="11"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    calendar: P('<rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    chevL: P('<path d="m15 6-6 6 6 6"/>'),
    chevR: P('<path d="m9 6 6 6-6 6"/>'),
    ruler: P('<path d="M3 16.5 16.5 3 21 7.5 7.5 21 3 16.5Z"/><path d="m7 12.5 2 2M10 9.5l2 2M13 6.5l2 2"/>'),
    history: P('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>')
  };

  /* ---------- formatting ---------- */
  var nf = new Intl.NumberFormat("fr-FR"), nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  RX.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  RX.money = function (n) { return nf.format(Math.round(n || 0)) + " FCFA"; };
  RX.num = function (n) { return nf.format(Math.round(n || 0)); };
  RX.num1 = function (n) { return nf1.format(n || 0); };
  RX.pct = function (n, d) { return nf1.format(n || 0) + " %"; };
  RX.compact = function (n) {
    var a = Math.abs(n);
    if (a >= 1e6) return nf1.format(n / 1e6) + " M";
    if (a >= 1e3) return nf1.format(n / 1e3) + " k";
    return nf.format(Math.round(n));
  };
  var MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  RX.date = function (t) { var d = new Date(t); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); };
  RX.dateShort = function (t) { var d = new Date(t); return d.getDate() + " " + MONTHS[d.getMonth()]; };
  RX.time = function (t) { var d = new Date(t); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); };
  RX.dateTime = function (t) { return RX.date(t) + " à " + RX.time(t); };
  RX.rel = function (t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "à l'instant";
    if (s < 3600) return "il y a " + Math.floor(s / 60) + " min";
    if (s < 86400) return "il y a " + Math.floor(s / 3600) + " h";
    if (s < 86400 * 7) { var d = Math.floor(s / 86400); return d === 1 ? "hier" : "il y a " + d + " j"; }
    return RX.date(t);
  };
  RX.initials = function (name) { return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); };
  RX.badge = function (tone, label) { return '<span class="badge t-' + tone + '">' + RX.esc(label) + "</span>"; };
  RX.statusBadge = function (s) { var x = RX.STATUS[s] || { label: s, tone: "muted" }; return RX.badge(x.tone, x.label); };
  RX.stars = function (n) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "<i>★</i>"; return '<span class="stars" aria-label="' + n + ' sur 5">' + s + "</span>"; };
  RX.img = function (id, w) { if (!id) return ""; if (DB.media.isRef(id)) return DB.media.url(id, "../"); return /^(https?:|data:|blob:|\.\.?\/)/.test(id) ? id : "https://images.unsplash.com/" + id + "?w=" + (w || 160) + "&q=70&auto=format&fit=crop"; };
  RX.debounce = function (fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 200); }; };
  RX.$ = function (s, r) { return (r || document).querySelector(s); };
  RX.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  RX.payLabel = function (p) { return (RX.PAY[p.method] || p.method) + (p.operator ? " · " + (RX.OPS[p.operator] || p.operator) : ""); };
  RX.custName = function (o) { return ((o.customer && (o.customer.first + " " + o.customer.last)) || "").trim() || "Client"; };
  RX.countryName = function (code) { var c = DB.COUNTRIES.filter(function (x) { return x[0] === code; })[0]; return c ? c[2] : code || "—"; };

  /* ---------- data helpers ---------- */
  RX.db = function () { return DB.get(); };
  /* The page being edited works on the database object it was rendered with. If another tab (a customer
     ordering, another admin) wrote in the meantime, that object is stale: merge the newer records into it so
     neither the edit nor the other tab's data is lost. The section being edited keeps its own version. */
  var OWN = { orders: ["orders"], customers: ["customers"], products: ["products"], inventory: ["products"], categories: ["categories"], reviews: ["reviews"],
    promos: ["promos"], newsletter: ["subscribers"], users: ["users"] };
  function byKey(list, key) { var m = {}; (list || []).forEach(function (x) { m[x[key]] = x; }); return m; }
  function mergeFresh(mine, fresh) {
    var own = OWN[RX.section] || [];
    [["orders", "id"], ["customers", "id"], ["reviews", "id"], ["products", "id"], ["promos", "code"], ["subscribers", "email"], ["users", "id"], ["categories", "key"]].forEach(function (c) {
      var name = c[0], key = c[1], mm = byKey(mine[name], key);
      if (own.indexOf(name) > -1) { (fresh[name] || []).forEach(function (x) { if (!mm[x[key]]) mine[name].push(x); }); return; } // keep my edits, add new records
      var fm = byKey(fresh[name], key), keep = (mine[name] || []).filter(function (x) { return fm[x[key]] === undefined && name !== "products"; });
      mine[name] = (fresh[name] || []).slice().concat(keep);
    });
    var seen = {}; mine.activity.forEach(function (a) { seen[a.t + a.action] = 1; });
    (fresh.activity || []).forEach(function (a) { if (!seen[a.t + a.action]) mine.activity.push(a); });
    mine.activity.sort(function (a, b) { return b.t - a.t; });
    mine.traffic = fresh.traffic || mine.traffic;
  }
  RX.save = function (action, target) {
    var cur = DB.get();
    if (RX._db && cur !== RX._db) { mergeFresh(RX._db, cur); DB.adopt(RX._db); }
    DB.persist();
    if (action) RX.log(action, target);
    RX.refreshChrome();
  };
  RX.log = function (action, target) {
    var db = DB.get();
    db.activity.unshift({ t: Date.now(), user: RX.user ? RX.user.name : "Système", action: action, target: target || "" });
    if (db.activity.length > 400) db.activity.length = 400;
    DB.persist();
  };
  RX.isSale = function (o) { return o.status !== "cancelled" && o.status !== "refunded"; };
  RX.range = function (days, offset) {
    var end = new Date(); end.setHours(23, 59, 59, 999);
    var to = end.getTime() - (offset || 0) * days * DAY;
    return { from: to - days * DAY + 1, to: to };
  };
  RX.inRange = function (t, r) { return t >= r.from && t <= r.to; };

  /* ---------- periods: today, yesterday, last N days or one day picked in the calendar ----------
     Read from the address: ?p=today|yesterday|7|30|90… or ?d=YYYY-MM-DD. */
  function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dayRange(t) { var a = dayStart(t), b = new Date(a); b.setDate(b.getDate() + 1); return { from: a, to: b.getTime() - 1 }; }
  RX.dayStart = dayStart; RX.dayRange = dayRange;
  RX.parseDay = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return null; var d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) || d.getTime() > Date.now() ? null : d.getTime(); };
  RX.period = function (q, def, allowed) {
    var today = dayStart(Date.now()), day = RX.parseDay(q.d), p = q.p || def;
    if (day !== null && day >= today) p = "today", day = null;
    if (day !== null) {
      return { key: "d", day: day, single: true, range: dayRange(day), prev: dayRange(day - DAY / 2), q: "d=" + DB.dayKey(day),
        label: "le " + RX.date(day), short: RX.date(day), vs: "vs veille", days: 1 };
    }
    if (p === "yesterday") { var y = dayStart(today - DAY / 2); return { key: "yesterday", day: y, single: true, range: dayRange(y), prev: dayRange(y - DAY / 2), q: "p=yesterday", label: "hier", short: "Hier", vs: "vs avant-hier", days: 1 }; }
    var n = +p;
    if (!(allowed || [7, 30, 90]).some(function (x) { return x === n; }) || p === "today") {
      if (p !== "today" && def !== "today") return RX.period({ p: def }, def, allowed);
      return { key: "today", day: today, single: true, range: dayRange(today), prev: dayRange(today - DAY / 2), q: "p=today", label: "aujourd'hui", short: "Aujourd'hui", vs: "vs hier", days: 1 };
    }
    return { key: String(n), single: false, range: RX.range(n), prev: RX.range(n, 1), q: "p=" + n, label: "les " + n + " derniers jours", short: n + " jours", vs: "vs " + n + " j précédents", days: n };
  };
  // segmented control + calendar button; clicks are handled by RX.bindPeriod
  RX.periodPicker = function (per, allowed) {
    var opts = [["today", "Aujourd'hui"], ["yesterday", "Hier"]].concat((allowed || [7, 30, 90]).map(function (n) { return [String(n), n + " j"]; }));
    return '<div class="period"><div class="seg" role="group" aria-label="Période">' + opts.map(function (o) { return '<button type="button" data-per="' + o[0] + '" aria-pressed="' + (per.key === o[0]) + '">' + o[1] + "</button>"; }).join("") + "</div>" +
      '<button type="button" class="btn is-cal' + (per.key === "d" ? " is-on" : "") + '" data-per-cal aria-haspopup="dialog" aria-label="Choisir une date dans le calendrier">' + RX.I.calendar + "<span>" + (per.key === "d" ? RX.esc(per.short) : "Choisir une date") + "</span></button></div>";
  };
  // go(queryString) is called with "p=…" or "d=…"; marks(dayKey) gives the number shown under a day (orders)
  RX.bindPeriod = function (el, per, go, marks) {
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-per]"); if (b) { go("p=" + b.dataset.per); return; }
      var c = e.target.closest("[data-per-cal]");
      if (c) RX.calendar(c, { value: per.single ? per.day : null, marks: marks, onPick: function (t) { go(t >= dayStart(Date.now()) ? "p=today" : "d=" + DB.dayKey(t)); } });
    });
  };

  /* ---------- calendar popover: one month, days after today disabled, a dot under the days with orders ---------- */
  var MONTHS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  RX.calendar = function (anchor, o) {
    var today = dayStart(Date.now()), sel = o.value, view = new Date(sel || today); view.setDate(1); view.setHours(0, 0, 0, 0);
    var m = RX.menu(anchor, "", "cal-pop");
    m.setAttribute("role", "dialog"); m.setAttribute("aria-label", "Choisir une date");
    function draw() {
      var y = view.getFullYear(), mo = view.getMonth(), first = (new Date(y, mo, 1).getDay() + 6) % 7, n = new Date(y, mo + 1, 0).getDate();
      var next = new Date(y, mo + 1, 1).getTime() > today, cells = "";
      for (var i = 0; i < first; i++) cells += "<span></span>";
      for (var d = 1; d <= n; d++) {
        var t = new Date(y, mo, d).getTime(), k = DB.dayKey(t), cnt = o.marks ? o.marks(k) : 0, fut = t > today;
        cells += '<button type="button" data-day="' + t + '"' + (fut ? " disabled" : "") + (t === sel ? ' aria-pressed="true"' : "") + (t === today ? ' class="is-today"' : "") +
          ' aria-label="' + d + " " + MONTHS_L[mo] + " " + y + (cnt ? " — " + cnt + " commande" + (cnt > 1 ? "s" : "") : "") + '">' + d + (cnt ? "<i></i>" : "") + "</button>";
      }
      m.innerHTML = '<div class="cal-h"><button type="button" class="icon-btn" data-mv="-1" aria-label="Mois précédent">' + RX.I.chevL + "</button><b>" + MONTHS_L[mo] + " " + y + "</b>" +
        '<button type="button" class="icon-btn" data-mv="1" aria-label="Mois suivant"' + (next ? " disabled" : "") + ">" + RX.I.chevR + "</button></div>" +
        '<div class="cal-g cal-w">' + ["L", "M", "M", "J", "V", "S", "D"].map(function (w) { return "<span>" + w + "</span>"; }).join("") + "</div>" +
        '<div class="cal-g">' + cells + "</div>" +
        '<div class="cal-f"><span class="muted"><i class="cal-dot"></i>jour avec des commandes</span><button type="button" class="btn is-sm" data-day="' + today + '">Aujourd\'hui</button></div>';
    }
    draw();
    // clicks inside must not close the popover (RX.menu closes on buttons), except on a day
    m.addEventListener("click", function (e) {
      var mv = e.target.closest("[data-mv]");
      if (mv) { e.stopPropagation(); view.setMonth(view.getMonth() + +mv.dataset.mv); draw(); return; }
      var d = e.target.closest("[data-day]");
      if (d && !d.disabled) { o.onPick(+d.dataset.day); return; }
      e.stopPropagation();
    }, true);
    m.addEventListener("keydown", function (e) { if (e.key === "Escape") { RX.closeMenu(); anchor.focus(); } });
    var r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8)) + "px";
    setTimeout(function () { var f = m.querySelector('[aria-pressed="true"],.is-today'); if (f) f.focus(); }, 0);
    return m;
  };
  RX.stock = function (p) { return DB.totalStock(p); };
  RX.lowStock = function (p) {
    var th = RX.db().settings.store.lowStock || 5, tot = RX.stock(p);
    return tot === 0 ? "out" : (tot <= th * 2 || Object.keys(p.stock).some(function (k) { return p.stock[k] === 0; })) ? "low" : "ok";
  };
  RX.delta = function (cur, prev) {
    if (!prev) return cur ? '<span class="delta is-up">nouveau</span>' : '<span class="delta is-flat">—</span>';
    var d = (cur - prev) / prev * 100, cls = Math.abs(d) < 0.5 ? "is-flat" : d > 0 ? "is-up" : "is-down";
    return '<span class="delta ' + cls + '">' + (d > 0 ? "▲ " : d < 0 ? "▼ " : "") + nf1.format(Math.abs(d)) + " %</span>";
  };
  RX.csv = function (rows) {
    return "﻿" + rows.map(function (r) { return r.map(function (v) { v = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v)) v = "'" + v; return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";"); }).join("\n");
  };
  RX.download = function (name, text, type) {
    var a = document.createElement("a"), url = URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    RX.toast("Fichier « " + name + " » généré");
  };

  /* ---------- auth ---------- */
  var SKEY = "relaxx-admin-session";
  RX.sha = function (s) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); });
  };
  RX.hashPass = function (p) { return RX.sha("relaxx:" + p); };
  function session() { try { return JSON.parse(sessionStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function currentUser() {
    if (DB.remote) {
      var a = DB.auth.session(); if (!a) return null;
      return RX.db().users.filter(function (x) { return String(x.email).toLowerCase() === a.email && x.active !== false; })[0] || null;
    }
    var s = session(); if (!s) return null;
    var u = RX.db().users.filter(function (x) { return x.id === s.uid && x.active; })[0];
    return u || null;
  }
  // Supabase: sign in, load the shop, check the account is a member of the team
  function loginRemote(email, pass) {
    return DB.auth.signIn(email, pass).then(function () { return DB.loadAll(); }).then(function () {
      var u = currentUser();
      if (!u) return DB.auth.signOut().then(function () { return { ok: false, msg: "Ce compte n'a pas accès au back-office. Un administrateur doit l'ajouter dans Équipe & rôles." }; });
      RX.user = u;
      return DB.rpc("rx_me").then(function (me) { if (me) { u.lastLogin = me.lastLogin; } }, function () {}).then(function () { RX.log("s'est connecté", ""); return { ok: true }; });
    }, function (e) {
      if (e && (e.status === 400 || e.status === 401)) return { ok: false, msg: /confirm/i.test(e.message) ? "Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail, ou confirmez l'utilisateur dans Supabase." : "Adresse e-mail ou mot de passe incorrect." };
      return { ok: false, msg: "Connexion à la base de données impossible (" + (e && e.message || "réseau") + "). Réessayez dans un instant." };
    });
  }
  RX.login = function (email, pass) {
    if (DB.remote) return loginRemote(email, pass);
    return RX.hashPass(pass).then(function (h) {
      var u = RX.db().users.filter(function (x) { return x.email.toLowerCase() === String(email).trim().toLowerCase(); })[0];
      if (!u || !u.passHash || u.passHash !== h) return { ok: false, msg: "Adresse e-mail ou mot de passe incorrect." };
      if (!u.active) return { ok: false, msg: "Ce compte est désactivé. Contactez un administrateur." };
      u.lastLogin = Date.now(); DB.persist();
      sessionStorage.setItem(SKEY, JSON.stringify({ uid: u.id, t: Date.now() }));
      RX.user = u; RX.log("s'est connecté", "");
      return { ok: true };
    });
  };
  RX.logout = function () {
    RX.log("s'est déconnecté", "");
    if (DB.remote) { DB.flush().then(function () { return DB.auth.signOut(); }).then(function () { location.hash = "#/"; location.reload(); }); return; }
    sessionStorage.removeItem(SKEY); RX.user = null; location.hash = "#/"; renderLogin();
  };
  RX.can = function (section) { if (!RX.user) return ""; var p = RX.PERMS[section]; return p ? p[RX.user.role] || "" : RX.user.role === "admin" ? "w" : ""; };
  RX.canWrite = function (section) { return RX.can(section) === "w"; };

  /* ---------- UI kit ---------- */
  RX.toast = function (msg, tone, link) {
    var box = document.getElementById("toasts"), t = document.createElement("div");
    t.className = "toast" + (tone ? " is-" + tone : "");
    t.innerHTML = "<i></i><span></span>" + (link ? '<a href="' + link.href + '">' + RX.esc(link.label) + "</a>" : "");
    t.querySelector("span").textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); setTimeout(function () { t.remove(); }, 260); }, link ? 6000 : 3200);
  };
  var openLayers = [];
  function lockScroll(v) { document.documentElement.style.overflow = v ? "hidden" : ""; }
  RX.modal = function (o) {
    var scrim = document.createElement("div"), m = document.createElement("div"), last = document.activeElement;
    scrim.className = "scrim"; m.className = "modal" + (o.size ? " is-" + o.size : "") + (o.cls ? " " + o.cls : "");
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", o.title || "Fenêtre");
    m.innerHTML = (o.title ? '<div class="modal-h"><h2></h2><button type="button" class="icon-btn" data-close aria-label="Fermer">' + RX.I.x + "</button></div>" : "") +
      '<div class="modal-b"></div>' + (o.foot !== false ? '<div class="modal-f"></div>' : "");
    if (o.title) m.querySelector("h2").textContent = o.title;
    var body = m.querySelector(".modal-b");
    if (typeof o.body === "string") body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    var foot = m.querySelector(".modal-f");
    (o.actions || [{ label: "Fermer", close: true }]).forEach(function (a) {
      if (!foot) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "btn" + (a.tone ? " is-" + a.tone : ""); b.textContent = a.label;
      b.addEventListener("click", function () { if (a.close) api.close(); else if (a.onClick) a.onClick(api, b); });
      foot.appendChild(b);
    });
    document.body.appendChild(scrim); document.body.appendChild(m); lockScroll(true);
    requestAnimationFrame(function () { scrim.classList.add("is-on"); m.classList.add("is-on"); });
    function onKey(e) { if (e.key === "Escape" && openLayers[openLayers.length - 1] === api) api.close(); }
    var api = {
      el: m, body: body,
      close: function (val) {
        if (api.closed) return; api.closed = true;
        document.removeEventListener("keydown", onKey);
        m.classList.remove("is-on"); scrim.classList.remove("is-on");
        openLayers.splice(openLayers.indexOf(api), 1);
        setTimeout(function () { m.remove(); scrim.remove(); if (!openLayers.length) lockScroll(false); if (last && last.focus) last.focus(); }, 220);
        if (o.onClose) o.onClose(val);
      }
    };
    openLayers.push(api);
    scrim.addEventListener("click", function () { if (!o.sticky) api.close(); });
    m.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) api.close(); });
    document.addEventListener("keydown", onKey);
    setTimeout(function () { var f = m.querySelector("[autofocus],input:not([type=hidden]),select,textarea,button:not([data-close])"); if (f) f.focus(); }, 60);
    return api;
  };
  RX.confirm = function (o) {
    return new Promise(function (res) {
      var done = false;
      RX.modal({
        title: o.title || "Confirmer", body: '<p style="line-height:1.6">' + (o.html || RX.esc(o.text || "")) + "</p>",
        actions: [{ label: o.cancel || "Annuler", close: true }, { label: o.ok || "Confirmer", tone: o.danger ? "danger" : "primary", onClick: function (m) { done = true; m.close(); } }],
        onClose: function () { res(done); }
      });
    });
  };
  RX.menu = function (anchor, html, cls) {
    RX.closeMenu();
    var m = document.createElement("div"); m.className = "menu" + (cls ? " " + cls : ""); m.innerHTML = html; m.setAttribute("role", "menu");
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), w = m.offsetWidth;
    m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + "px";
    m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
    setTimeout(function () { document.addEventListener("click", outside); }, 0);
    function outside(e) { if (!m.contains(e.target)) RX.closeMenu(); }
    RX._menu = { el: m, off: function () { document.removeEventListener("click", outside); } };
    m.addEventListener("click", function (e) { if (e.target.closest("a,button")) setTimeout(RX.closeMenu, 0); });
    return m;
  };
  RX.closeMenu = function () { if (RX._menu) { RX._menu.off(); RX._menu.el.remove(); RX._menu = null; } };
  RX.pager = function (total, page, per) {
    var pages = Math.max(1, Math.ceil(total / per)), a = total ? (page - 1) * per + 1 : 0, b = Math.min(total, page * per);
    return '<div class="pager"><span>' + a + "–" + b + " sur " + RX.num(total) + '</span><div class="pager-btns">' +
      '<button type="button" class="btn is-sm" data-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + '>Précédent</button>' +
      '<span class="btn is-sm" style="pointer-events:none">' + page + " / " + pages + "</span>" +
      '<button type="button" class="btn is-sm" data-page="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + ">Suivant</button></div></div>";
  };
  RX.th = function (label, key, sort, cls) {
    var on = sort && sort.key === key;
    return '<th class="is-sort' + (cls ? " " + cls : "") + '" data-sort="' + key + '" aria-sort="' + (on ? (sort.dir > 0 ? "ascending" : "descending") : "none") + '">' + label + (on ? '<span class="arr">' + (sort.dir > 0 ? "↑" : "↓") + "</span>" : "") + "</th>";
  };
  RX.empty = function (title, text, icon) { return '<div class="empty">' + (icon || RX.I.search) + "<b>" + RX.esc(title) + "</b>" + RX.esc(text || "") + "</div>"; };
  RX.readOnly = function (section) { return RX.canWrite(section) ? "" : '<span class="chip">' + RX.I.lock.replace("<svg", '<svg width="14" height="14"') + " Lecture seule</span>"; };

  /* ---------- charts (SVG) ---------- */
  RX.chart = {};
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  // redraw when the width changes (and the height, for a chart that fills its card)
  function observe(el, draw, fill) {
    draw();
    if ("ResizeObserver" in window) {
      var w = el.clientWidth, h = el.clientHeight;
      new ResizeObserver(function () {
        if (Math.abs(el.clientWidth - w) > 4 || (fill && Math.abs(el.clientHeight - h) > 4)) { w = el.clientWidth; h = el.clientHeight; draw(); }
      }).observe(el);
    }
  }
  RX.chart.area = function (el, o) {
    observe(el, function () {
      // fill: the chart takes the height left in its card (the svg is positioned over the box, see .chart.is-fill)
      var W = Math.max(300, el.clientWidth), H = o.fill ? Math.max(o.height || 200, el.clientHeight) : o.height || 260, L = 54, R = 12, T = 12, B = 28, n = o.labels.length;
      var max = niceMax(Math.max.apply(null, o.series[0].values.concat([1])) * 1.08);
      var x = function (i) { return L + (n <= 1 ? 0 : i * (W - L - R) / (n - 1)); }, y = function (v) { return T + (H - T - B) * (1 - v / max); };
      var s = '<svg viewBox="0 0 ' + W + " " + H + '" height="' + H + '" role="img" aria-label="' + RX.esc(o.aria || "Graphique") + '">';
      for (var g = 0; g <= 4; g++) { var gv = max * g / 4, gy = y(gv); s += '<line class="grid-l" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="axis" x="' + (L - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + RX.compact(gv) + "</text>"; }
      var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L) / 90))));
      for (var i = 0; i < n; i += step) s += '<text class="axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + RX.esc(o.labels[i]) + "</text>";
      o.series.forEach(function (se, k) {
        var pts = se.values.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); });
        if (k === 0) s += '<defs><linearGradient id="ga' + el.id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="' + se.color + '" stop-opacity=".22"/><stop offset="1" stop-color="' + se.color + '" stop-opacity="0"/></linearGradient></defs>' +
          '<path d="M' + x(0) + "," + y(0) + " L" + pts.join(" L") + " L" + x(n - 1) + "," + y(0) + ' Z" fill="url(#ga' + el.id + ')"/>';
        s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + se.color + '" stroke-width="' + (k ? 1.5 : 2) + '"' + (se.dash ? ' stroke-dasharray="4 4"' : "") + ' stroke-linejoin="round"/>';
      });
      s += '<line class="hover-l" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" style="display:none"/>' + o.series.map(function (se, k) { return '<circle class="hp" data-k="' + k + '" r="4" fill="' + se.color + '" stroke="var(--surface)" stroke-width="2" style="display:none"/>'; }).join("") +
        '<rect x="' + L + '" y="0" width="' + (W - L - R) + '" height="' + H + '" fill="transparent" class="hit"/></svg><div class="chart-tip"></div>';
      el.innerHTML = s;
      var svg = el.querySelector("svg"), tip = el.querySelector(".chart-tip"), line = el.querySelector(".hover-l"), dots = RX.$$(".hp", el);
      function at(e) {
        var r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width, i = Math.round((px - L) / ((W - L - R) / Math.max(1, n - 1)));
        i = Math.max(0, Math.min(n - 1, i));
        line.setAttribute("x1", x(i)); line.setAttribute("x2", x(i)); line.style.display = "";
        dots.forEach(function (d, k) { d.setAttribute("cx", x(i)); d.setAttribute("cy", y(o.series[k].values[i])); d.style.display = ""; });
        tip.innerHTML = "<b>" + RX.esc(o.tipLabels ? o.tipLabels[i] : o.labels[i]) + "</b>" + o.series.map(function (se) { return '<div><span><i style="display:inline-block;width:8px;height:8px;margin-right:6px;background:' + se.color + '"></i>' + RX.esc(se.name) + "</span><b>" + (se.format || RX.num)(se.raw ? se.raw[i] : se.values[i]) + "</b></div>"; }).join("");
        tip.style.left = (x(i) / W * 100) + "%"; tip.style.top = (y(o.series[0].values[i]) / H * 100) + "%"; tip.classList.add("is-on");
      }
      svg.addEventListener("mousemove", at);
      svg.addEventListener("mouseleave", function () { tip.classList.remove("is-on"); line.style.display = "none"; dots.forEach(function (d) { d.style.display = "none"; }); });
    }, o.fill);
  };
  RX.chart.bars = function (el, o) {
    observe(el, function () {
      var W = Math.max(260, el.clientWidth), H = o.height || 220, L = 44, R = 8, T = 10, B = 26, n = o.values.length;
      var max = niceMax(Math.max.apply(null, o.values.concat([1])) * 1.1), bw = (W - L - R) / n, y = function (v) { return T + (H - T - B) * (1 - v / max); };
      var s = '<svg viewBox="0 0 ' + W + " " + H + '" height="' + H + '" role="img" aria-label="' + RX.esc(o.aria || "Graphique") + '">';
      for (var g = 0; g <= 4; g++) { var gv = max * g / 4, gy = y(gv); s += '<line class="grid-l" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy + '" y2="' + gy + '"/><text class="axis" x="' + (L - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + RX.compact(gv) + "</text>"; }
      var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L) / 70))));
      o.values.forEach(function (v, i) {
        var h = (H - T - B) - (y(v) - T), bx = L + i * bw + bw * 0.18;
        s += '<rect class="bar" data-i="' + i + '" x="' + bx.toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '" fill="' + (o.color || "var(--text)") + '"/>';
        if (i % step === 0) s += '<text class="axis" x="' + (L + i * bw + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + RX.esc(o.labels[i]) + "</text>";
      });
      el.innerHTML = s + '</svg><div class="chart-tip"></div>';
      var tip = el.querySelector(".chart-tip");
      RX.$$(".bar", el).forEach(function (b) {
        b.addEventListener("mouseenter", function () {
          var i = +b.dataset.i; b.style.opacity = ".75";
          tip.innerHTML = "<b>" + RX.esc(o.tipLabels ? o.tipLabels[i] : o.labels[i]) + "</b><div><span>" + RX.esc(o.name || "Valeur") + "</span><b>" + (o.format || RX.num)(o.values[i]) + "</b></div>";
          tip.style.left = ((L + i * bw + bw / 2) / W * 100) + "%"; tip.style.top = (y(o.values[i]) / H * 100) + "%"; tip.classList.add("is-on");
        });
        b.addEventListener("mouseleave", function () { b.style.opacity = ""; tip.classList.remove("is-on"); });
      });
    });
  };
  RX.chart.donut = function (el, o) {
    var total = o.items.reduce(function (s, it) { return s + it.value; }, 0) || 1, r = 58, c = 2 * Math.PI * r, off = 0;
    var arcs = o.items.map(function (it) {
      var len = it.value / total * c, seg = '<circle r="' + r + '" cx="75" cy="75" fill="none" stroke="' + it.color + '" stroke-width="20" stroke-dasharray="' + Math.max(0, len - 1.5).toFixed(2) + " " + c.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 75 75)"><title>' + RX.esc(it.label) + " : " + (o.format || RX.num)(it.value) + "</title></circle>";
      off += len; return seg;
    }).join("");
    if (o.stack) {
      var max = Math.max.apply(null, o.items.map(function (it) { return it.value; }).concat([1]));
      el.innerHTML = '<div class="donut-stack"><svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="' + RX.esc(o.aria || "Répartition") + '"><circle r="' + r + '" cx="75" cy="75" fill="none" stroke="var(--grey-soft)" stroke-width="20"/>' + arcs +
        '<text class="donut-total" x="75" y="76">' + RX.esc(o.center || RX.compact(total)) + '</text><text class="donut-center" x="75" y="94">' + RX.esc(o.centerLabel || "total") + "</text></svg>" +
        '<ul class="donut-legend">' + o.items.map(function (it) {
          return '<li><span class="dl-l"><i style="background:' + it.color + '"></i>' + RX.esc(it.label) + '</span><b class="num">' + (o.format || RX.num)(it.value) + '</b><span class="dl-p num">' + nf1.format(it.value / total * 100) + ' %</span>' +
            '<span class="dl-bar"><i style="width:' + (it.value / max * 100).toFixed(1) + "%;background:" + it.color + '"></i></span></li>';
        }).join("") + "</ul></div>";
      return;
    }
    el.innerHTML = '<div class="donut-wrap"><svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="' + RX.esc(o.aria || "Répartition") + '"><circle r="' + r + '" cx="75" cy="75" fill="none" stroke="var(--grey-soft)" stroke-width="20"/>' + arcs +
      '<text class="donut-total" x="75" y="76">' + RX.esc(o.center || RX.compact(total)) + '</text><text class="donut-center" x="75" y="94">' + RX.esc(o.centerLabel || "total") + "</text></svg>" +
      '<div class="stack" style="gap:10px">' + o.items.map(function (it) {
        return '<div class="row is-between" style="font-size:13px"><span class="row" style="gap:9px"><i style="display:inline-block;width:10px;height:10px;background:' + it.color + '"></i>' + RX.esc(it.label) + '</span><span><b class="num">' + (o.format || RX.num)(it.value) + '</b> <span class="muted">' + nf1.format(it.value / total * 100) + " %</span></span></div>";
      }).join("") + "</div></div>";
  };
  RX.spark = function (vals, color) {
    var n = vals.length, max = Math.max.apply(null, vals.concat([1])), min = Math.min.apply(null, vals.concat([0]));
    var pts = vals.map(function (v, i) { return (i / Math.max(1, n - 1) * 100).toFixed(2) + "," + (48 - (v - min) / (max - min || 1) * 40).toFixed(2); });
    return '<svg class="kpi-spark" viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true"><path d="M0,52 L' + pts.join(" L") + ' L100,52 Z" fill="' + color + '" opacity=".1"/><polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  };
  RX.hbars = function (rows, format) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return rows.map(function (r) { return '<div class="bar-row"><span class="cell-txt" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + RX.esc(r.label) + '</span><span class="bar"><i style="width:' + (r.value / max * 100).toFixed(1) + '%;' + (r.color ? "background:" + r.color : "") + '"></i></span><span class="v num">' + (format || RX.num)(r.value) + "</span></div>"; }).join("");
  };
  RX.COLORS = ["#c89564", "#121212", "#7d8b6a", "#5b7fa6", "#b3261e", "#9a6a12", "#6c5ba0", "#a19b92"];

  /* ---------- navigation ---------- */
  var NAV = [
    { group: "Pilotage", items: [["dashboard", "#/", "Tableau de bord", "home"], ["reports", "#/reports", "Rapports", "chart"]] },
    { group: "Ventes", items: [["orders", "#/orders", "Commandes", "bag"], ["customers", "#/customers", "Clients", "users"], ["promos", "#/promos", "Codes promo", "percent"]] },
    { group: "Catalogue", items: [["products", "#/products", "Produits", "tag"], ["inventory", "#/inventory", "Stock", "box"], ["categories", "#/categories", "Catégories", "layers"], ["products", "#/size-guide", "Guide des tailles", "ruler"], ["reviews", "#/reviews", "Avis clients", "star"]] },
    { group: "Vitrine & marketing", items: [["content", "#/vitrine", "Vitrine du site", "layout"], ["content", "#/content", "Annonce & maintenance", "megaphone"], ["newsletter", "#/newsletter", "Newsletter", "mail"]] },
    { group: "Configuration", items: [["shipping", "#/shipping", "Livraison", "truck"], ["payments", "#/payments", "Paiements", "card"], ["settings", "#/settings", "Réglages", "gear"], ["users", "#/users", "Équipe & rôles", "shield"], ["activity", "#/activity", "Journal d'activité", "list"]] }
  ];
  RX.NAV = NAV;
  function counts() {
    var db = RX.db();
    return {
      orders: db.orders.filter(function (o) { return o.status === "paid" || o.status === "pending"; }).length,
      reviews: db.reviews.filter(function (r) { return r.status === "pending"; }).length,
      inventory: db.products.filter(function (p) { return p.status === "active" && RX.lowStock(p) === "out"; }).length
    };
  }
  function renderSide() {
    var c = counts(), cur = currentSection(), db = RX.db();
    return '<div class="side-brand"><b>RELAXX</b><span>Back-office</span></div><nav class="side-nav" aria-label="Navigation principale">' +
      NAV.map(function (g) {
        var items = g.items.filter(function (it) { return RX.can(it[0]); });
        if (!items.length) return "";
        return '<div class="side-group"><div class="side-label">' + g.group + "</div>" + items.map(function (it) {
          var n = c[it[0]];
          // two links can open the same section (Produits / Guide des tailles, Vitrine / Annonce): the address decides
          var shared = NAV.reduce(function (n, gg) { return n + gg.items.filter(function (x) { return x[0] === it[0]; }).length; }, 0) > 1;
          var on = cur === it[0] && (!shared || location.hash.indexOf(it[1]) === 0);
          return '<a class="side-link' + (on ? " is-active" : "") + '" href="' + it[1] + '"' + (on ? ' aria-current="page"' : "") + ">" + RX.I[it[3]] + "<span>" + it[2] + "</span>" + (n ? '<span class="side-count' + (it[0] === "inventory" ? " is-quiet" : "") + '">' + n + "</span>" : "") + "</a>";
        }).join("") + "</div>";
      }).join("") + "</nav>" +
      '<div class="side-foot"><div class="side-status"><span class="dot' + (db.settings.content.maintenance.enabled ? " is-warn" : "") + '"></span>' + (db.settings.content.maintenance.enabled ? "Boutique en maintenance" : "Boutique en ligne") + '</div><div style="margin-top:6px">RELAXX · v1.0</div></div>';
  }
  function notifItems() {
    var db = RX.db(), out = [], c = counts();
    if (c.orders) out.push({ href: "#/orders?status=paid", tone: "t-info", icon: "bag", title: c.orders + " commande" + (c.orders > 1 ? "s" : "") + " à traiter", sub: "Payées ou en attente de paiement" });
    if (c.reviews) out.push({ href: "#/reviews?status=pending", tone: "t-warn", icon: "star", title: c.reviews + " avis à modérer", sub: "En attente de publication" });
    var low = db.products.filter(function (p) { return p.status === "active" && RX.lowStock(p) !== "ok"; });
    if (low.length) out.push({ href: "#/inventory?filter=low", tone: "t-bad", icon: "box", title: low.length + " produit" + (low.length > 1 ? "s" : "") + " en stock faible ou rupture", sub: low.slice(0, 3).map(function (p) { return p.nameFr || p.name; }).join(", ") + (low.length > 3 ? "…" : "") });
    db.orders.filter(function (o) { return o.source === "web" && Date.now() - o.date < 3 * DAY; }).slice(-5).reverse().forEach(function (o) {
      out.push({ href: "#/orders/" + o.id, tone: "t-ok", icon: "check", title: "Nouvelle commande " + o.id, sub: RX.custName(o) + " · " + RX.money(o.total) + " · " + RX.rel(o.date) });
    });
    if (db.settings.content.maintenance.enabled) out.unshift({ href: "#/content", tone: "t-warn", icon: "alert", title: "Le mode maintenance est activé", sub: "Les visiteurs ne voient pas la boutique" });
    return out;
  }
  function renderTop() {
    var u = RX.user, n = notifItems().length;
    return '<button type="button" class="icon-btn top-burger" data-nav-toggle aria-label="Ouvrir le menu">' + RX.I.menu + "</button>" +
      '<button type="button" class="top-search" data-palette>' + RX.I.search + "<span>Rechercher une commande, un produit, un client…</span><kbd>⌘K</kbd></button>" +
      '<div class="top-r"><a class="btn is-sm" href="../index.html" target="_blank" rel="noopener">' + RX.I.ext + "<span>Voir la boutique</span></a>" +
      '<button type="button" class="icon-btn" data-notif aria-label="Notifications (' + n + ')">' + RX.I.bell + (n ? '<span class="badge-dot">' + n + "</span>" : "") + "</button>" +
      '<button type="button" class="me" data-me aria-haspopup="menu"><span class="avatar">' + RX.initials(u.name) + '</span><span class="me-txt"><b>' + RX.esc(u.name) + "</b><span>" + RX.ROLES[u.role].label + "</span></span></button></div>";
  }
  RX.refreshChrome = function () {
    var side = RX.$(".side"), top = RX.$(".top");
    if (side) side.innerHTML = renderSide();
    if (top) top.innerHTML = renderTop();
  };

  /* ---------- router ---------- */
  RX.route = function (pattern, section, render) {
    var keys = [], re = new RegExp("^" + pattern.replace(/:(\w+)/g, function (m, k) { keys.push(k); return "([^/]+)"; }) + "$");
    RX.routes.push({ re: re, keys: keys, section: section, render: render });
  };
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/", q = {}, i = h.indexOf("?");
    if (i > -1) { h.slice(i + 1).split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); }); h = h.slice(0, i); }
    return { path: h, query: q };
  }
  function match(path) {
    for (var i = 0; i < RX.routes.length; i++) {
      var m = RX.routes[i].re.exec(path);
      if (m) { var params = {}; RX.routes[i].keys.forEach(function (k, j) { params[k] = decodeURIComponent(m[j + 1]); }); return { route: RX.routes[i], params: params }; }
    }
    return null;
  }
  function currentSection() { var m = match(parseHash().path); return m ? m.route.section : ""; }
  var lastHash = location.hash, skipNext = false;
  RX.go = function (hash) { if (location.hash === hash) render(); else location.hash = hash; };
  function render() {
    var content = RX.$(".content");
    if (!content) return;
    var h = parseHash(), m = match(h.path);
    RX.closeMenu();
    RX.$(".shell").classList.remove("nav-open");
    if (!m) { content.innerHTML = RX.empty("Page introuvable", "Cette adresse ne correspond à aucune page du back-office.") ; return; }
    if (!RX.can(m.route.section)) {
      content.innerHTML = '<div class="card">' + RX.empty("Accès restreint", "Votre rôle (" + RX.ROLES[RX.user.role].label + ") ne permet pas d'ouvrir « " + RX.SECTION_LABELS[m.route.section] + " ».", RX.I.lock) + "</div>";
      RX.refreshChrome(); return;
    }
    RX.dirty = false;
    RX.section = m.route.section;
    RX._db = DB.get(); RX._warned = false;
    // each screen gets a fresh container: screens attach their listeners to it, and reusing the same node
    // stacked them up (one click opened as many pickers/modals as the number of times the page was shown)
    var fresh = content.cloneNode(false); content.parentNode.replaceChild(fresh, content); content = fresh;
    try { m.route.render(content, m.params, h.query); }
    catch (err) { console.error(err); content.innerHTML = '<div class="card">' + RX.empty("Une erreur est survenue", String(err && err.message || err), RX.I.alert) + "</div>"; }
    document.title = (RX.$("h1", content) ? RX.$("h1", content).textContent + " — " : "") + "Back-office RELAXX";
    RX.refreshChrome();
    window.scrollTo(0, 0);
  }
  RX.rerender = render;
  window.addEventListener("hashchange", function () {
    if (skipNext) { skipNext = false; return; }
    if (RX.dirty) {
      var target = location.hash; skipNext = true; location.hash = lastHash;
      RX.confirm({ title: "Modifications non enregistrées", text: "Quitter cette page sans enregistrer vos modifications ?", ok: "Quitter sans enregistrer", danger: true }).then(function (ok) {
        if (ok) { RX.dirty = false; location.hash = target; }
      });
      return;
    }
    lastHash = location.hash; render();
  });
  window.addEventListener("beforeunload", function (e) { if (RX.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- command palette ---------- */
  function palette() {
    var db = RX.db(), sel = 0, results = [];
    var m = RX.modal({ cls: "palette", foot: false, body: '<div class="palette-in">' + RX.I.search + '<input type="search" placeholder="Rechercher une commande, un produit, un client, une page…" aria-label="Recherche" autocomplete="off"><kbd>Échap</kbd></div><div class="palette-list" role="listbox"></div>' });
    m.body.style.padding = "0";
    var input = RX.$("input", m.el), list = RX.$(".palette-list", m.el);
    function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
    function run() {
      var q = norm(input.value.trim()), groups = [];
      var pages = []; NAV.forEach(function (g) { g.items.forEach(function (it) { if (RX.can(it[0]) && (!q || norm(it[2]).indexOf(q) > -1)) pages.push({ href: it[1], label: it[2], sub: g.group }); }); });
      if (pages.length) groups.push(["Pages", pages.slice(0, q ? 6 : 8)]);
      if (q) {
        if (RX.can("orders")) groups.push(["Commandes", db.orders.filter(function (o) { return norm(o.id + " " + RX.custName(o) + " " + o.customer.email).indexOf(q) > -1; }).slice(-6).reverse().map(function (o) { return { href: "#/orders/" + o.id, label: o.id + " — " + RX.custName(o), sub: RX.money(o.total) }; })]);
        if (RX.can("products")) groups.push(["Produits", db.products.filter(function (p) { return norm(p.name + " " + p.nameFr + " " + p.sku).indexOf(q) > -1; }).slice(0, 6).map(function (p) { return { href: "#/products/" + p.id, label: p.nameFr || p.name, sub: p.sku }; })]);
        if (RX.can("customers")) groups.push(["Clients", db.customers.filter(function (c) { return norm(c.first + " " + c.last + " " + c.email + " " + c.phone).indexOf(q) > -1; }).slice(0, 6).map(function (c) { return { href: "#/customers/" + c.id, label: c.first + " " + c.last, sub: c.email }; })]);
      }
      results = []; var html = "";
      groups.forEach(function (g) { if (!g[1].length) return; html += '<div class="palette-g">' + g[0] + "</div>"; g[1].forEach(function (r) { html += '<a href="' + r.href + '" role="option" data-i="' + results.length + '">' + RX.esc(r.label) + "<small>" + RX.esc(r.sub || "") + "</small></a>"; results.push(r); }); });
      list.innerHTML = html || '<div class="empty" style="padding:30px">Aucun résultat pour « ' + RX.esc(input.value) + " »</div>";
      sel = 0; paint();
    }
    function paint() { RX.$$("a", list).forEach(function (a, i) { a.setAttribute("aria-selected", i === sel ? "true" : "false"); if (i === sel) a.scrollIntoView({ block: "nearest" }); }); }
    input.addEventListener("input", run);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { sel = Math.min(results.length - 1, sel + 1); paint(); e.preventDefault(); }
      if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      if (e.key === "Enter" && results[sel]) { m.close(); location.hash = results[sel].href; }
    });
    list.addEventListener("click", function (e) { if (e.target.closest("a")) m.close(); });
    run();
  }

  /* ---------- shell ---------- */
  function renderShell() {
    var app = document.getElementById("app");
    app.innerHTML = '<div class="shell"><aside class="side"></aside><div class="main"><header class="top"></header><main class="content" id="main" tabindex="-1"></main></div></div>';
    RX.refreshChrome();
    app.addEventListener("click", function (e) {
      if (e.target.closest("[data-nav-toggle]")) { RX.$(".shell").classList.toggle("nav-open"); return; }
      if (e.target.closest(".shell.nav-open") && !e.target.closest(".side") && !e.target.closest(".top")) RX.$(".shell").classList.remove("nav-open");
      if (e.target.closest("[data-palette]")) { palette(); return; }
      var nb = e.target.closest("[data-notif]");
      if (nb) {
        var items = notifItems();
        RX.menu(nb, '<div class="notif-h"><b>Notifications</b><span class="muted" style="font-size:12px">' + items.length + "</span></div>" +
          (items.length ? items.map(function (it) { return '<a href="' + it.href + '"><span class="ic ' + it.tone + '">' + RX.I[it.icon] + "</span><span><b>" + RX.esc(it.title) + "</b><small>" + RX.esc(it.sub) + "</small></span></a>"; }).join("") : '<div class="empty" style="padding:30px">Tout est à jour.</div>'), "notif");
        return;
      }
      var me = e.target.closest("[data-me]");
      if (me) {
        var menu = RX.menu(me, '<div class="menu-h"><b>' + RX.esc(RX.user.name) + "</b><span>" + RX.esc(RX.user.email) + "</span></div>" +
          '<button type="button" data-act="profile">' + RX.I.user + "Mon profil</button>" +
          '<button type="button" data-act="password">' + RX.I.key + "Changer mon mot de passe</button>" +
          '<a href="../index.html" target="_blank" rel="noopener">' + RX.I.ext + "Ouvrir la boutique</a><hr>" +
          '<button type="button" data-act="logout">' + RX.I.logout + "Se déconnecter</button>");
        menu.addEventListener("click", function (ev) {
          var a = ev.target.closest("[data-act]"); if (!a) return;
          if (a.dataset.act === "logout") RX.logout();
          if (a.dataset.act === "password") changePassword();
          if (a.dataset.act === "profile") editProfile();
        });
      }
    });
  }
  function editProfile() {
    var u = RX.user;
    RX.modal({
      title: "Mon profil", body: '<div class="stack"><label class="field"><span>Nom affiché</span><input class="input" name="name" value="' + RX.esc(u.name) + '"></label><label class="field"><span>E-mail</span><input class="input" value="' + RX.esc(u.email) + '" disabled></label><div class="kv"><dt>Rôle</dt><dd>' + RX.ROLES[u.role].label + "</dd><dt>Membre depuis</dt><dd>" + RX.date(u.createdAt) + "</dd></div></div>",
      actions: [{ label: "Annuler", close: true }, { label: "Enregistrer", tone: "primary", onClick: function (m) {
        var v = RX.$("[name=name]", m.el).value.trim(); if (!v) return;
        if (DB.remote) { DB.rpc("rx_set_my_name", { p_name: v }).then(function () { u.name = v; DB.flush(); RX.log("a mis à jour son profil"); m.close(); RX.toast("Profil mis à jour"); RX.refreshChrome(); }, function (e) { RX.toast("Enregistrement impossible : " + e.message, "bad"); }); return; }
        u.name = v; RX.save("a mis à jour son profil"); m.close(); RX.toast("Profil mis à jour"); } }]
    });
  }
  function changePassword() {
    RX.modal({
      title: "Changer mon mot de passe",
      body: '<form class="stack" onsubmit="return false"><label class="field"><span>Mot de passe actuel</span><input class="input" type="password" name="cur" autocomplete="current-password"></label><label class="field"><span>Nouveau mot de passe</span><input class="input" type="password" name="n1" autocomplete="new-password"><small>10 caractères minimum, avec au moins un chiffre.</small></label><label class="field"><span>Confirmer</span><input class="input" type="password" name="n2" autocomplete="new-password"></label><p class="err" data-err></p></form>',
      actions: [{ label: "Annuler", close: true }, { label: "Mettre à jour", tone: "primary", onClick: function (m) {
        var f = function (n) { return RX.$("[name=" + n + "]", m.el).value; }, err = RX.$("[data-err]", m.el);
        if (f("n1").length < 10 || !/\d/.test(f("n1"))) { err.textContent = "Le nouveau mot de passe doit contenir au moins 10 caractères dont un chiffre."; return; }
        if (f("n1") !== f("n2")) { err.textContent = "Les deux mots de passe ne correspondent pas."; return; }
        if (DB.remote) {
          DB.auth.changePassword(f("cur"), f("n1")).then(function () { RX.log("a changé son mot de passe"); m.close(); RX.toast("Mot de passe mis à jour"); },
            function (e) { err.textContent = e && (e.status === 400 || e.status === 401) ? "Mot de passe actuel incorrect." : "Changement impossible : " + (e && e.message || "réseau"); });
          return;
        }
        RX.hashPass(f("cur")).then(function (h) {
          if (h !== RX.user.passHash) { err.textContent = "Mot de passe actuel incorrect."; return; }
          return RX.hashPass(f("n1")).then(function (nh) { RX.user.passHash = nh; RX.save("a changé son mot de passe"); m.close(); RX.toast("Mot de passe mis à jour"); });
        });
      } }]
    });
  }

  /* ---------- login ---------- */
  function renderLogin() {
    var app = document.getElementById("app");
    document.title = "Connexion — Back-office RELAXX";
    app.innerHTML = '<div class="login"><div class="login-art"><img alt="" src="https://images.unsplash.com/photo-1785927984870-79d4e5129e88?w=1600&q=80&auto=format&fit=crop"><div class="login-art-in"><div class="login-brand">RELAXX</div><p class="login-quote">Pilotez la boutique : ventes, catalogue, clients et contenus, au même endroit.<small>Back-office RELAXX</small></p></div></div>' +
      '<div class="login-panel"><h1>Connexion</h1><p>Accédez à l\'espace de gestion de la boutique.</p>' +
      '<form class="login-form" novalidate><label class="field"><span>Adresse e-mail</span><input class="input" type="email" name="email" autocomplete="username" required></label>' +
      '<label class="field"><span>Mot de passe</span><div class="input-wrap" style="display:block;position:relative"><input class="input" type="password" name="pass" autocomplete="current-password" required style="padding-right:44px"><button type="button" class="icon-btn" data-reveal-pass aria-label="Afficher le mot de passe" style="position:absolute;right:0;top:0">' + RX.I.eye + "</button></div></label>" +
      '<p class="err" role="alert" data-err></p><button type="submit" class="btn is-primary is-block" style="height:46px">Se connecter</button></form>' +
      (window.RELAXX_DEMO_LOGIN && !DB.remote ? '<div class="login-demo"><b>Compte de démonstration</b>Les identifiants de démonstration sont indiqués dans <span class="mono">admin/README.md</span>.<br><button type="button" class="btn is-sm" data-demo>Remplir avec le compte de démonstration</button></div>' : "") +
      '<p class="login-foot">' + (DB.remote ? "Connexion sécurisée : les comptes de l\'équipe sont gérés dans Supabase (Authentication)." : "Démo front-end : les données sont enregistrées dans ce navigateur.") + "</p></div></div>";
    var form = RX.$(".login-form", app), err = RX.$("[data-err]", app);
    RX.$("[data-reveal-pass]", app).addEventListener("click", function (e) {
      var i = form.pass, b = e.currentTarget; i.type = i.type === "password" ? "text" : "password";
      b.innerHTML = i.type === "password" ? RX.I.eye : RX.I.eyeOff; b.setAttribute("aria-label", i.type === "password" ? "Afficher le mot de passe" : "Masquer le mot de passe");
    });
    if (RX.$("[data-demo]", app)) RX.$("[data-demo]", app).addEventListener("click", function () { form.email.value = window.RELAXX_DEMO_LOGIN ? RELAXX_DEMO_LOGIN.email : ""; form.pass.value = window.RELAXX_DEMO_LOGIN ? RELAXX_DEMO_LOGIN.pass : ""; form.pass.focus(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); err.textContent = "";
      if (!form.email.value.trim() || !form.pass.value) { err.textContent = "Renseignez votre e-mail et votre mot de passe."; return; }
      var btn = RX.$("button[type=submit]", form); btn.disabled = true; btn.textContent = "Connexion…";
      RX.login(form.email.value, form.pass.value).then(function (r) {
        btn.disabled = false; btn.textContent = "Se connecter";
        if (!r.ok) { err.textContent = r.msg; form.pass.select(); return; }
        loaded = true; boot();
      });
    });
    setTimeout(function () { form.email.focus(); }, 50);
  }

  /* ---------- live sync with the storefront (other tabs) ---------- */
  var knownOrders = 0;
  window.addEventListener("storage", function (e) {
    if (DB.remote || e.key !== DB.KEY || !RX.user) return;
    var before = knownOrders, db = DB.reload();
    knownOrders = db.orders.length;
    if (db.orders.length > before) {
      var o = db.orders[db.orders.length - 1];
      RX.toast("Nouvelle commande " + o.id + " — " + RX.money(o.total), "info", { href: "#/orders/" + o.id, label: "Voir" });
    }
    RX.user = currentUser() || RX.user;
    if (!RX.dirty && !document.querySelector(".modal")) render();
    else { RX.refreshChrome(); if (RX.dirty && !RX._warned && (RX._warned = true)) RX.toast("Des données ont changé dans un autre onglet : vos modifications seront fusionnées à l'enregistrement.", "info"); }
  });

  if (DB.remote) {
    // every 20 s: changes made elsewhere, applied when nothing is being edited
    setInterval(function () {
      if (!RX.user || !loaded || document.hidden || RX.dirty || document.querySelector(".modal")) return;
      DB.poll().catch(function () {});
    }, 20000);
    window.addEventListener("relaxx:remote", function (e) {
      var fresh = e.detail.rows.filter(function (r) { return r.coll === "orders" && r.data.source === "web" && r.data.status === "pending" && Date.now() - r.data.date < 3600e3 && (r.data.history || []).length === 1; });
      fresh.forEach(function (r) { RX.toast("Nouvelle commande " + r.data.id + " — " + RX.money(r.data.total), "info", { href: "#/orders/" + r.data.id, label: "Voir" }); });
      RX.user = currentUser() || RX.user;
      if (!RX.dirty && !document.querySelector(".modal")) render(); else RX.refreshChrome();
    });
    window.addEventListener("relaxx:sync", function (e) {
      if (e.detail.state !== "error") return;
      var er = e.detail.error || {};
      RX.toast(er.status === 401 || er.status === 403 || /row-level security/i.test(er.message || "") ? "Enregistrement refusé : votre rôle ne permet pas cette modification." : "Enregistrement impossible (" + (er.message || "réseau") + "). La modification sera renvoyée au prochain enregistrement.", "bad");
    });
    window.addEventListener("beforeunload", function (e) { if (DB.pending()) { e.preventDefault(); e.returnValue = ""; } });
  }
  function boot() {
    if (DB.remote && !bootRemote()) return;
    RX.user = currentUser();
    if (!RX.user) { renderLogin(); return; }
    knownOrders = RX.db().orders.length;
    renderShell();
    render();
  }
  // Supabase: a saved session loads the shop first (returns false while loading)
  var loaded = false;
  function bootRemote() {
    if (loaded) return true;
    if (!DB.auth.session()) { renderLogin(); return false; }
    var app = document.getElementById("app");
    app.innerHTML = '<div class="boot"><b>RELAXX</b><span>Chargement de la boutique…</span></div>';
    DB.loadAll().then(function () { loaded = true; boot(); }, function (e) {
      if (e && (e.status === 401 || e.status === 403)) { DB.auth.signOut().then(renderLogin); return; }
      app.innerHTML = '<div class="boot"><b>RELAXX</b><span>Connexion à la base de données impossible (' + RX.esc(e && e.message || "réseau") + ').</span><button type="button" class="btn" onclick="location.reload()">Réessayer</button></div>';
    });
    return false;
  }
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && RX.user) { e.preventDefault(); palette(); }
  });
  RX.start = function () { boot(); };
})();
