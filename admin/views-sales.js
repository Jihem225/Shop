/* ==========================================================================
   RELAXX back office — Pilotage & Ventes: dashboard, reports, orders, customers
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$, DAY = 864e5;

  /* ---------- shared maths ---------- */
  function daysOf(r) { var out = [], d = new Date(r.from); d.setHours(0, 0, 0, 0); while (d.getTime() <= r.to) { out.push(d.getTime()); d = new Date(d.getTime() + DAY + 3600e3); d.setHours(0, 0, 0, 0); } return out; }
  function sales(db, r) { return db.orders.filter(function (o) { return RX.isSale(o) && RX.inRange(o.date, r); }); }
  function sum(arr, f) { return arr.reduce(function (s, x) { return s + f(x); }, 0); }
  function sessions(db, r) { return daysOf(r).reduce(function (s, t) { var k = DB.dayKey(t), x = db.traffic[k]; return s + (x ? x.sessions : 0); }, 0); }
  function productThumb(db, pid, cls) { var p = db.products[pid]; return p ? '<img class="thumb' + (cls ? " " + cls : "") + '" alt="" loading="lazy" src="' + RX.img(p.img, 120) + '">' : '<span class="thumb' + (cls ? " " + cls : "") + '"></span>'; }
  function colorName(db, it) { var c = DB.colorOf(db.products[it.pid], it.color); return c ? c.nameFr || c.name : it.color; }
  function pname(db, pid, fallback) { var p = db.products[pid]; return p ? (p.nameFr || p.name) : fallback || "Produit supprimé"; }
  function customerStats(db) {
    var m = {};
    db.orders.forEach(function (o) {
      var s = m[o.customerId] || (m[o.customerId] = { count: 0, spent: 0, last: 0, first: Infinity });
      if (!RX.isSale(o)) return;
      s.count++; s.spent += o.total; s.last = Math.max(s.last, o.date); s.first = Math.min(s.first, o.date);
    });
    return m;
  }
  RX.customerStats = customerStats;
  function segmentOf(c, s) {
    s = s || { count: 0, spent: 0, last: 0 };
    if (s.spent >= 300000 || s.count >= 4) return "vip";
    if (s.count && Date.now() - s.last > 90 * DAY) return "inactive";
    if (s.count >= 2) return "repeat";
    if (s.count === 1) return "new";
    return "lead";
  }
  var SEG = { vip: ["VIP", "accent"], repeat: ["Fidèle", "ok"], new: ["Nouveau", "info"], inactive: ["Inactif", "muted"], lead: ["Prospect", "violet"] };
  RX.segmentOf = segmentOf; RX.SEG = SEG;

  /* ---------- order actions (shared with other views) ---------- */
  RX.setOrderStatus = function (o, status, opts) {
    opts = opts || {};
    var db = RX.db(), prev = o.status;
    if (prev === status) return;
    if ((status === "cancelled" || status === "refunded") && opts.restock) {
      o.items.forEach(function (it) {
        DB.adjustStock(db.products[it.pid], it.color, it.size, it.q);
      });
    }
    if (status === "shipped" && !o.tracking) o.tracking = "RLX" + Math.floor(100000000 + Math.random() * 899999999);
    o.status = status;
    o.history.push({ t: Date.now(), status: status, by: RX.user.name });
    RX.log("a passé la commande " + o.id + " en « " + RX.STATUS[status].label + " »", o.id);
    DB.persist();
  };

  /* ======================================================================
     DASHBOARD
     ====================================================================== */
  RX.route("/", "dashboard", function (el, params, q) {
    var db = RX.db(), per = RX.period(q, "today"), cur = per.range, prv = per.prev;
    var S = sales(db, cur), SP = sales(db, prv);
    var rev = sum(S, function (o) { return o.total; }), revP = sum(SP, function (o) { return o.total; });
    var units = sum(S, function (o) { return sum(o.items, function (i) { return i.q; }); });
    var ses = sessions(db, cur), sesP = sessions(db, prv);
    var conv = ses ? S.length / ses * 100 : 0, convP = sesP ? SP.length / sesP * 100 : 0;
    var aov = S.length ? rev / S.length : 0, aovP = SP.length ? revP / SP.length : 0;
    var nc = db.customers.filter(function (c) { return RX.inRange(c.createdAt, cur); }).length, ncP = db.customers.filter(function (c) { return RX.inRange(c.createdAt, prv); }).length;
    var hour = new Date().getHours(), hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

    // sales chart: per day, or per hour when a single day is shown
    var chart;
    if (per.single) {
      var rh = [], oh = [];
      for (var h = 0; h < 24; h++) { rh.push(0); oh.push(0); }
      S.forEach(function (o) { var k = new Date(o.date).getHours(); rh[k] += o.total; oh[k]++; });
      chart = { labels: rh.map(function (v, k) { return k + " h"; }), tips: rh.map(function (v, k) { return k + " h – " + (k + 1) + " h"; }), rev: rh, other: oh, otherName: "Commandes", otherFmt: RX.num };
    } else {
      var dl = daysOf(cur), byDay = {}, sesDay = [];
      S.forEach(function (o) { var k = DB.dayKey(o.date); byDay[k] = (byDay[k] || 0) + o.total; });
      dl.forEach(function (t) { var x = db.traffic[DB.dayKey(t)]; sesDay.push(x ? x.sessions : 0); });
      chart = { labels: dl.map(RX.dateShort), tips: dl.map(function (t) { return RX.date(t); }), rev: dl.map(function (t) { return byDay[DB.dayKey(t)] || 0; }), other: sesDay, otherName: "Visites", otherFmt: RX.num, days: dl };
    }
    // KPI sparklines: the days of the period, or the 14 days up to the day shown
    var sp = daily(db, per.single ? { from: RX.dayStart(per.day - 13 * DAY), to: cur.to } : cur);

    // month goal
    var ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0);
    var monthRev = sum(db.orders.filter(function (o) { return RX.isSale(o) && o.date >= ms.getTime(); }), function (o) { return o.total; });
    var goal = db.settings.store.monthlyGoal || 12000000, dim = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate(), dayN = new Date().getDate();

    // to-do
    var toPrep = db.orders.filter(function (o) { return o.status === "paid"; }).length, toPay = db.orders.filter(function (o) { return o.status === "pending"; }).length;
    var toShip = db.orders.filter(function (o) { return o.status === "processing"; }).length, toMod = db.reviews.filter(function (r) { return r.status === "pending"; }).length;
    var out = RX.products(db).filter(function (p) { return p.status === "active" && RX.lowStock(p) === "out"; }).length, low = RX.products(db).filter(function (p) { return p.status === "active" && RX.lowStock(p) === "low"; }).length;

    // top products / categories / payments / cities
    var prod = {}, cat = {}, pay = {}, city = {};
    S.forEach(function (o) {
      o.items.forEach(function (it) {
        var x = prod[it.pid] || (prod[it.pid] = { q: 0, rev: 0 }); x.q += it.q; x.rev += it.price * it.q;
        var c = (db.products[it.pid] || {}).cat || "autre"; cat[c] = (cat[c] || 0) + it.price * it.q;
      });
      var pk = o.payment.method === "mobilemoney" ? (RX.OPS[o.payment.operator] || "Mobile Money") : RX.PAY[o.payment.method]; pay[pk] = (pay[pk] || 0) + 1;
      city[o.address.city] = (city[o.address.city] || 0) + o.total;
    });
    var top = Object.keys(prod).map(function (k) { return { pid: +k, q: prod[k].q, rev: prod[k].rev }; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 7);
    var catLabel = {}; db.categories.forEach(function (c) { catLabel[c.key] = c.labelFr || c.label; });
    var catItems = Object.keys(cat).sort(function (a, b) { return cat[b] - cat[a]; }).map(function (k, i) { return { label: catLabel[k] || k, value: cat[k], color: RX.COLORS[i % RX.COLORS.length] }; });
    var inPeriod = db.orders.filter(function (o) { return RX.inRange(o.date, cur); }).sort(function (a, b) { return b.date - a.date; });
    var ordersList = per.single ? inPeriod : inPeriod.slice(0, 8);

    // sales summary under the chart
    var stats;
    if (per.single) {
      var peak = chart.rev.indexOf(Math.max.apply(null, chart.rev));
      stats = [["Heure de pointe", rev ? peak + " h – " + (peak + 1) + " h" : "—", rev ? RX.money(chart.rev[peak]) : "aucune vente"],
        ["Commandes", RX.num(S.length), inPeriod.length - S.length ? (inPeriod.length - S.length) + " annulée(s) ou remboursée(s)" : "toutes encaissables"],
        ["Articles vendus", RX.num(units), S.length ? RX.num1(units / S.length) + " par commande" : "—"],
        ["Visites", RX.num(ses), ses ? RX.num1(conv) + " % de conversion" : "—"]];
    } else {
      var best = chart.rev.indexOf(Math.max.apply(null, chart.rev)), withSales = chart.rev.filter(function (v) { return v > 0; }).length;
      stats = [["Meilleur jour", rev ? RX.date(chart.days[best]) : "—", rev ? RX.money(chart.rev[best]) : "aucune vente"],
        ["Moyenne par jour", RX.money(rev / per.days), withSales + "/" + per.days + " jours avec ventes"],
        ["Articles vendus", RX.num(units), S.length ? RX.num1(units / S.length) + " par commande" : "—"],
        ["Visites", RX.num(ses), RX.num1(ses / per.days) + " par jour"]];
    }

    el.innerHTML =
      '<div class="ph"><div><h1>' + hello + ", " + esc(RX.user.name.split(" ")[0]) + "</h1><p>Voici l'activité de la boutique " + esc(per.label) + (per.key === "d" ? "" : " · " + RX.date(Date.now())) + "</p></div>" +
      '<div class="ph-actions">' + RX.periodPicker(per) + (RX.can("reports") ? '<a class="btn" href="#/reports?' + per.q + '">' + I.chart + "Rapports détaillés</a>" : "") + "</div></div>" +

      '<div class="grid g-4 kpis">' +
        kpi("Chiffre d'affaires", I.wallet, money(rev), RX.delta(rev, revP), S.length + " commande" + (S.length > 1 ? "s" : "") + " encaissable" + (S.length > 1 ? "s" : ""), sp.rev, "#c89564", true) +
        kpi("Commandes", I.bag, RX.num(S.length), RX.delta(S.length, SP.length), RX.num(units) + " article" + (units > 1 ? "s" : "") + " vendu" + (units > 1 ? "s" : ""), sp.ord, "var(--text)") +
        kpi("Panier moyen", I.tag, money(aov), RX.delta(aov, aovP), S.length ? RX.num1(units / S.length) + " article" + (units / S.length >= 2 ? "s" : "") + " par commande" : "aucune commande", sp.aov, "var(--accent-ink)") +
        kpi("Taux de conversion", I.trendUp, RX.num1(conv) + "<small>%</small>", RX.delta(conv, convP), RX.num(ses) + " visite" + (ses > 1 ? "s" : "") + " · " + RX.num(S.length) + " commande" + (S.length > 1 ? "s" : ""), sp.conv, "var(--info)") +
      "</div>" +

      '<div class="grid g-main" style="margin-top:18px">' +
        '<div class="card is-flex"><div class="card-h"><div><h2>Ventes</h2><p>' + (per.single ? "Chiffre d'affaires par heure, " + esc(per.label) : "Chiffre d'affaires par jour") + " · hors commandes annulées ou remboursées</p></div>" +
          '<div class="legend"><span><i style="background:#c89564"></i>CA</span><span><i style="background:var(--muted)"></i>' + chart.otherName + "</span></div></div>" +
          '<div class="card-b is-grow"><div class="chart is-fill" id="c-rev"></div></div>' +
          '<div class="stat-strip">' + stats.map(function (s) { return '<div><span>' + s[0] + '</span><b class="num">' + s[1] + "</b><small>" + s[2] + "</small></div>"; }).join("") + "</div></div>" +
        '<div class="stack">' +
          '<div class="card"><div class="card-h"><h2>À traiter</h2><span class="muted" style="font-size:12px">en ce moment</span></div><div>' +
            todo("#/orders?status=paid", toPrep, "Commandes à préparer", "Payées, en attente de préparation", "t-info") +
            todo("#/orders?status=pending", toPay, "Paiements en attente", "Paiement à la livraison ou non confirmé", "t-warn") +
            todo("#/orders?status=processing", toShip, "Colis à expédier", "Préparés, en attente du transporteur", "t-accent") +
            todo("#/reviews?status=pending", toMod, "Avis à modérer", "Publiés après validation", "t-violet") +
            todo("#/inventory?filter=low", out + low, "Alertes de stock", out + " en rupture · " + low + " stock faible", out ? "t-bad" : "t-muted") +
          "</div></div>" +
          '<div class="card"><div class="card-h"><div><h2>Objectif du mois</h2><p>' + esc(new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })) + "</p></div>" + (RX.canWrite("settings") ? '<button type="button" class="btn is-sm" data-goal>Modifier</button>' : "") + '</div><div class="card-b">' +
            '<div class="goal-v"><b class="num">' + money(monthRev) + '</b><span class="muted">sur ' + RX.money(goal) + "</span></div>" +
            '<div class="progress" style="margin:12px 0 8px;height:8px"><i style="width:' + Math.min(100, monthRev / goal * 100).toFixed(1) + '%;background:var(--accent)"></i></div>' +
            '<p class="muted" style="font-size:12.5px">' + RX.num1(monthRev / goal * 100) + " % atteint · jour " + dayN + "/" + dim + " · projection " + RX.money(monthRev / dayN * dim) + "</p></div></div>" +
        "</div>" +
      "</div>" +

      '<div class="grid g-3" style="margin-top:18px">' +
        '<div class="card span-2"><div class="card-h"><div><h2>Meilleures ventes</h2><p>' + esc(cap(per.label)) + "</p></div>" + (RX.can("reports") ? '<a class="link" href="#/reports?' + per.q + '">Tout voir</a>' : "") + '</div><div class="table-wrap"><table class="t"><thead><tr><th>Produit</th><th class="r">Vendus</th><th class="r">CA</th><th class="r">Stock</th></tr></thead><tbody>' +
          (top.length ? top.map(function (t) { var p = db.products[t.pid] || {}; return '<tr class="is-link" data-href="#/products/' + t.pid + '"><td><div class="cell">' + productThumb(db, t.pid, "is-sm") + '<div class="cell-txt"><b>' + esc(pname(db, t.pid)) + "</b><small>" + esc(p.sku || "") + '</small></div></div></td><td class="r num">' + t.q + '</td><td class="r num">' + RX.money(t.rev) + '</td><td class="r">' + stockPill(p) + "</td></tr>"; }).join("") : '<tr><td colspan="4">' + RX.empty("Aucune vente", per.single ? cap(per.label) : "Sur cette période") + "</td></tr>") +
        "</tbody></table></div></div>" +
        '<div class="card"><div class="card-h"><div><h2>Ventes par catégorie</h2><p>Chiffre d\'affaires des articles</p></div></div><div class="card-b" id="c-cat"></div></div>' +
      "</div>" +

      '<div class="grid g-3" style="margin-top:18px">' +
        '<div class="card"><div class="card-h"><h2>Moyens de paiement</h2><p>' + S.length + " commande" + (S.length > 1 ? "s" : "") + '</p></div><div class="card-b">' + (S.length ? RX.hbars(Object.keys(pay).map(function (k) { return { label: k, value: pay[k] }; }).sort(function (a, b) { return b.value - a.value; })) : RX.empty("Aucune commande", "")) + "</div></div>" +
        '<div class="card"><div class="card-h"><h2>Villes</h2><p>Chiffre d\'affaires</p></div><div class="card-b">' + (S.length ? RX.hbars(Object.keys(city).map(function (k) { return { label: k, value: city[k], color: "#c89564" }; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6), RX.compact) : RX.empty("Aucune vente", "")) + "</div></div>" +
        '<div class="card"><div class="card-h"><h2>Clients</h2><p>' + esc(per.short) + '</p></div><div class="card-b"><div class="grid g-2" style="gap:14px">' +
          mini("Nouveaux clients", RX.num(nc), RX.delta(nc, ncP)) + mini("Visites", RX.compact(ses), RX.delta(ses, sesP)) +
          mini("Abonnés newsletter", RX.num(db.subscribers.filter(function (s) { return s.status === "subscribed"; }).length), '<span class="delta is-flat">au total</span>') +
          mini("Note moyenne", RX.num1(avgRating(db)) + " / 5", '<span class="delta is-flat">avis publiés</span>') +
        "</div></div></div>" +
      "</div>" +

      '<div class="card" style="margin-top:18px"><div class="card-h"><div><h2>' + (per.single ? "Commandes " + (per.key === "today" ? "du jour" : per.key === "yesterday" ? "d'hier" : "du " + esc(per.short)) : "Dernières commandes") + "</h2><p>" +
        (per.single ? inPeriod.length + " commande" + (inPeriod.length > 1 ? "s" : "") + ", tous statuts confondus" : "Les 8 plus récentes de la période") + "</p></div>" + (RX.can("orders") ? '<a class="link" href="#/orders">Toutes les commandes</a>' : "") + "</div>" + ordersTable(db, ordersList, null, false) + "</div>" +

      "";

    RX.chart.area($("#c-rev", el), { labels: chart.labels, tipLabels: chart.tips, aria: "Chiffre d'affaires", fill: true,
      series: [{ name: "Chiffre d'affaires", values: chart.rev, color: "#c89564", format: RX.money },
        { name: chart.otherName, values: chart.other.map(function (v) { return v * (Math.max.apply(null, chart.rev.concat([1])) / Math.max.apply(null, chart.other.concat([1]))) * 0.6; }), raw: chart.other, color: "var(--muted)", dash: true, format: chart.otherFmt }] });
    if (catItems.length) RX.chart.donut($("#c-cat", el), { stack: true, aria: "Ventes par catégorie", format: RX.compact, center: RX.compact(sum(catItems, function (c) { return c.value; })), centerLabel: "FCFA", items: catItems });
    else $("#c-cat", el).innerHTML = RX.empty("Aucune vente", per.single ? cap(per.label) : "Sur cette période");

    RX.bindPeriod(el, per, function (qs) { RX.go("#/?" + qs); }, orderMarks(db));
    el.addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-href]"); if (tr) { location.hash = tr.dataset.href; return; }
      if (e.target.closest("[data-goal]")) {
        RX.modal({ title: "Objectif de chiffre d'affaires mensuel", body: '<label class="field"><span>Objectif (FCFA)</span><div class="input-suffix"><input class="input num" type="number" min="0" step="50000" name="goal" value="' + goal + '"><span>FCFA</span></div></label>',
          actions: [{ label: "Annuler", close: true }, { label: "Enregistrer", tone: "primary", onClick: function (m) { var v = +$("[name=goal]", m.el).value; if (v > 0) { db.settings.store.monthlyGoal = v; RX.save("a défini l'objectif mensuel", RX.money(v)); m.close(); RX.rerender(); } } }] });
      }
    });

    function money(n) { return RX.num(n) + "<small>FCFA</small>"; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function kpi(label, icon, value, delta, foot, spark, color, ink) {
      return '<div class="kpi' + (ink ? " is-ink" : "") + '"><div class="kpi-l">' + icon + label + '</div><div class="kpi-v num">' + value + "</div>" +
        '<div class="kpi-d">' + delta + "<span>" + per.vs + '</span></div><div class="kpi-f">' + foot + "</div>" + RX.spark(spark, color) + "</div>";
    }
    function todo(href, n, title, sub, tone) { return '<a class="todo" href="' + href + '"><span class="todo-n ' + tone + '">' + n + "</span><span><b>" + title + "</b><small>" + sub + '</small></span><span class="arrow">' + I.arrowR.replace("<svg", '<svg width="16" height="16"') + "</span></a>"; }
    function mini(label, v, d) { return '<div class="mini"><div class="muted">' + label + '</div><div class="num mini-v">' + v + "</div>" + d + "</div>"; }
  });

  // per-day figures over a range: revenue, orders, average basket, conversion (KPI sparklines)
  function daily(db, r) {
    var ds = daysOf(r), rev = {}, ord = {};
    sales(db, r).forEach(function (o) { var k = DB.dayKey(o.date); rev[k] = (rev[k] || 0) + o.total; ord[k] = (ord[k] || 0) + 1; });
    var out = { rev: [], ord: [], aov: [], conv: [] };
    ds.forEach(function (t) {
      var k = DB.dayKey(t), x = db.traffic[k], s = x ? x.sessions : 0, n = ord[k] || 0;
      out.rev.push(rev[k] || 0); out.ord.push(n); out.aov.push(n ? rev[k] / n : 0); out.conv.push(s ? n / s * 100 : 0);
    });
    return out;
  }
  // number of orders per day, shown as a dot under the days of the calendar
  function orderMarks(db) {
    var m = {}; db.orders.forEach(function (o) { var k = DB.dayKey(o.date); m[k] = (m[k] || 0) + 1; });
    return function (k) { return m[k] || 0; };
  }
  RX.orderMarks = orderMarks;

  /* ---------- what happened during a day: orders, status changes, reviews, sign-ups, team actions ---------- */
  function dayHistory(db, r) {
    var ev = [], inR = function (t) { return RX.inRange(t, r); };
    db.orders.forEach(function (o) {
      if (inR(o.date)) ev.push({ t: o.date, icon: "bag", tone: "t-ok", href: "#/orders/" + o.id, title: "Nouvelle commande " + o.id + " — " + RX.money(o.total),
        sub: RX.custName(o) + " · " + o.address.city + " · " + RX.payLabel(o.payment) + (o.source === "web" ? " · passée sur le site" : "") });
      (o.history || []).forEach(function (h, i) {
        if (!i || !inR(h.t)) return;
        ev.push({ t: h.t, icon: "refresh", tone: "t-" + (RX.STATUS[h.status] || { tone: "muted" }).tone, href: "#/orders/" + o.id, title: "Commande " + o.id + " : " + (RX.STATUS[h.status] || { label: h.status }).label, sub: "par " + (h.by || "l'équipe") });
      });
    });
    db.reviews.forEach(function (rv) {
      if (inR(rv.date)) ev.push({ t: rv.date, icon: "star", tone: "t-violet", href: "#/reviews?status=" + rv.status, title: "Avis " + rv.stars + "★ sur " + pname(db, rv.pid), sub: rv.name + (rv.city ? " · " + rv.city : "") + " · « " + rv.title + " »" });
      if (rv.reply && rv.replyDate && inR(rv.replyDate)) ev.push({ t: rv.replyDate, icon: "edit", tone: "t-muted", href: "#/reviews?status=" + rv.status, title: "Réponse publiée à l'avis de " + rv.name, sub: pname(db, rv.pid) });
    });
    db.subscribers.forEach(function (s) { if (inR(s.date)) ev.push({ t: s.date, icon: "mail", tone: "t-info", href: "#/newsletter", title: s.status === "subscribed" ? "Inscription à la newsletter" : "Désinscription de la newsletter", sub: s.email }); });
    db.customers.forEach(function (c) { if (inR(c.createdAt)) ev.push({ t: c.createdAt, icon: "user", tone: "t-accent", href: "#/customers/" + c.id, title: "Nouveau client", sub: c.first + " " + c.last + " · " + c.city }); });
    // team actions (orders and reviews from the site are already listed above)
    db.activity.forEach(function (a) { if (inR(a.t) && a.user !== "Boutique en ligne") ev.push({ t: a.t, icon: "shield", tone: "t-muted", title: a.user + " " + a.action + (a.target ? " " + a.target : ""), sub: "Journal d'activité" }); });
    return ev.sort(function (a, b) { return b.t - a.t; });
  }
  // the history of a day is shown in the activity log (Journal d'activité), not on the dashboard
  RX.dayHistory = function (db, range) { return timeline(dayHistory(db, range)); };
  function timeline(ev) {
    if (!ev.length) return RX.empty("Rien à signaler", "Aucune activité enregistrée ce jour-là.", I.history);
    return '<ol class="dayh">' + ev.map(function (e) {
      var inner = '<span class="dh-t num">' + RX.time(e.t) + '</span><span class="dh-ic ' + e.tone + '">' + I[e.icon] + '</span><span class="dh-x"><b>' + esc(e.title) + "</b><small>" + esc(e.sub) + "</small></span>";
      return "<li>" + (e.href ? '<a href="' + e.href + '">' + inner + "</a>" : "<div>" + inner + "</div>") + "</li>";
    }).join("") + "</ol>";
  }
  function avgRating(db) { var pub = db.reviews.filter(function (r) { return r.status === "published"; }); return pub.length ? sum(pub, function (r) { return r.stars; }) / pub.length : 0; }
  function stockPill(p) {
    if (!p || !p.stock) return "";
    var s = RX.lowStock(p), n = RX.stock(p);
    return '<span class="stock-pill ' + (s === "out" ? "t-bad" : s === "low" ? "t-warn" : "t-ok") + '">' + n + "</span>";
  }
  RX.stockPill = stockPill;

  /* ---------- orders table (dashboard, orders, customer) ---------- */
  function ordersTable(db, list, sel, selectable, sort) {
    if (!list.length) return RX.empty("Aucune commande", "Aucune commande ne correspond à ces critères.", I.bag);
    var head = (selectable ? '<th class="w0"><input type="checkbox" class="check" data-all aria-label="Tout sélectionner"></th>' : "") +
      (sort ? RX.th("N°", "id", sort) + RX.th("Date", "date", sort) + RX.th("Client", "customer", sort) + "<th>Articles</th>" + RX.th("Total", "total", sort, "r") : "<th>N°</th><th>Date</th><th>Client</th><th>Articles</th><th class=\"r\">Total</th>") +
      "<th>Paiement</th><th>Statut</th><th>Livraison</th>";
    return '<div class="table-wrap"><table class="t"><thead><tr>' + head + "</tr></thead><tbody>" + list.map(function (o) {
      var n = sum(o.items, function (i) { return i.q; }), on = sel && sel[o.id];
      return '<tr class="is-link' + (on ? " is-sel" : "") + '" data-href="#/orders/' + o.id + '">' +
        (selectable ? '<td class="w0"><input type="checkbox" data-sel="' + o.id + '"' + (on ? " checked" : "") + ' aria-label="Sélectionner ' + o.id + '"></td>' : "") +
        '<td class="w0"><b class="mono">' + o.id + "</b>" + (o.source === "web" ? ' <span class="badge is-plain t-ok" style="height:18px;font-size:10px">SITE</span>' : "") + '</td><td class="w0"><div>' + RX.dateShort(o.date) + '</div><small class="muted">' + RX.time(o.date) + "</small></td>" +
        '<td><div class="cell"><span class="avatar" style="width:28px;height:28px;font-size:10.5px">' + RX.initials(RX.custName(o)) + '</span><div class="cell-txt"><b>' + esc(RX.custName(o)) + "</b><small>" + esc(o.address.city) + " · " + esc(RX.countryName(o.address.country)) + "</small></div></div></td>" +
        '<td><div class="row" style="gap:4px">' + o.items.slice(0, 3).map(function (it) { return productThumb(db, it.pid, "is-sm"); }).join("") + '<span class="muted" style="margin-left:4px">' + n + " art.</span></div></td>" +
        '<td class="r num"><b>' + RX.money(o.total) + "</b></td><td><small>" + esc(RX.payLabel(o.payment)) + "</small></td><td>" + RX.statusBadge(o.status) + "</td><td><small>" + RX.SHIP[o.shipping.method] + "</small></td></tr>";
    }).join("") + "</tbody></table></div>";
  }
  RX.ordersTable = ordersTable;

  /* ======================================================================
     ORDERS
     ====================================================================== */
  var OS = { status: "all", q: "", pay: "", period: "", day: null, sort: { key: "date", dir: -1 }, page: 1, sel: {} };
  RX.route("/orders", "orders", function (el, params, q) {
    var db = RX.db(), w = RX.canWrite("orders");
    var st = q.status && (q.status === "all" || RX.STATUS[q.status]) ? q.status : "all";
    if (st !== OS.status) { OS.status = st; OS.page = 1; OS.sel = {}; }
    el.innerHTML =
      '<div class="ph"><div><h1>Commandes</h1><p>Suivez, préparez et expédiez les commandes de la boutique.</p></div><div class="ph-actions">' + RX.readOnly("orders") +
      '<button type="button" class="btn" data-export>' + I.down + "Exporter (CSV)</button></div></div>" +
      '<div class="card"><div class="tabs" role="tablist"></div>' +
      '<div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="N° de commande, client, e-mail, ville…" data-q value="' + esc(OS.q) + '" aria-label="Rechercher"></div>' +
      '<select class="select" data-pay aria-label="Moyen de paiement"><option value="">Tous les paiements</option>' + Object.keys(RX.PAY).map(function (k) { return '<option value="' + k + '"' + (OS.pay === k ? " selected" : "") + ">" + RX.PAY[k] + "</option>"; }).join("") + "</select>" +
      '<select class="select" data-period aria-label="Période"><option value="">Toutes les dates</option>' + [["1", "Aujourd'hui"], ["y", "Hier"], ["7", "7 derniers jours"], ["30", "30 derniers jours"], ["90", "90 derniers jours"]].map(function (x) { return '<option value="' + x[0] + '"' + (OS.period === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") +
        (OS.day ? '<option value="d" selected>Le ' + RX.date(OS.day) + "</option>" : "") + "</select>" +
      '<button type="button" class="btn is-cal' + (OS.day ? " is-on" : "") + '" data-ord-cal aria-label="Choisir une date dans le calendrier">' + I.calendar + "<span>" + (OS.day ? RX.dateShort(OS.day) : "Date") + "</span></button></div>" +
      '<div class="bulk" hidden><b></b>' + (w ? '<button type="button" class="btn is-sm" data-bulk="processing">Passer en préparation</button><button type="button" class="btn is-sm" data-bulk="shipped">Marquer expédiées</button><button type="button" class="btn is-sm" data-bulk="delivered">Marquer livrées</button>' : "") +
      '<button type="button" class="btn is-sm" data-bulk-export>Exporter la sélection</button><button type="button" class="link" data-bulk-clear style="margin-left:auto">Désélectionner</button></div>' +
      '<div data-body></div></div>';

    function filtered() {
      var db = RX.db(), qq = OS.q.trim().toLowerCase(), r = OS.day ? RX.dayRange(OS.day) : OS.period === "y" ? RX.dayRange(RX.dayStart(Date.now()) - DAY / 2) : OS.period ? RX.range(+OS.period) : null;
      return db.orders.filter(function (o) {
        if (OS.status !== "all" && o.status !== OS.status) return false;
        if (OS.pay && o.payment.method !== OS.pay) return false;
        if (r && !RX.inRange(o.date, r)) return false;
        if (qq && (o.id + " " + RX.custName(o) + " " + o.customer.email + " " + o.address.city + " " + (o.tracking || "")).toLowerCase().indexOf(qq) < 0) return false;
        return true;
      });
    }
    function tabsHtml() {
      var db = RX.db(), c = { all: db.orders.length }; db.orders.forEach(function (o) { c[o.status] = (c[o.status] || 0) + 1; });
      return ["all"].concat(RX.STATUS_ORDER).map(function (s) { return '<button type="button" role="tab" data-tab="' + s + '" aria-selected="' + (OS.status === s) + '">' + (s === "all" ? "Toutes" : RX.STATUS[s].label) + ' <span class="n">' + (c[s] || 0) + "</span></button>"; }).join("");
    }
    function draw() {
      var list = filtered(), k = OS.sort.key, d = OS.sort.dir;
      list.sort(function (a, b) {
        var va = k === "customer" ? RX.custName(a) : a[k], vb = k === "customer" ? RX.custName(b) : b[k];
        return (va > vb ? 1 : va < vb ? -1 : 0) * d;
      });
      var per = 20, pages = Math.max(1, Math.ceil(list.length / per)); OS.page = Math.min(OS.page, pages);
      var page = list.slice((OS.page - 1) * per, OS.page * per);
      $(".tabs", el).innerHTML = tabsHtml();
      $("[data-body]", el).innerHTML = ordersTable(RX.db(), page, OS.sel, true, OS.sort) + (list.length ? RX.pager(list.length, OS.page, per) : "");
      var n = Object.keys(OS.sel).length, bulk = $(".bulk", el);
      bulk.hidden = !n; $("b", bulk).textContent = n + " commande" + (n > 1 ? "s" : "") + " sélectionnée" + (n > 1 ? "s" : "");
      var all = $("[data-all]", el); if (all) all.checked = page.length && page.every(function (o) { return OS.sel[o.id]; });
      el._list = list; el._page = page;
    }
    draw();
    $("[data-q]", el).addEventListener("input", RX.debounce(function (e) { OS.q = e.target.value; OS.page = 1; draw(); }, 180));
    $("[data-pay]", el).addEventListener("change", function (e) { OS.pay = e.target.value; OS.page = 1; draw(); });
    $("[data-period]", el).addEventListener("change", function (e) { if (e.target.value === "d") return; OS.period = e.target.value; OS.day = null; OS.page = 1; RX.rerender(); });
    // one precise day, picked in the calendar
    $("[data-ord-cal]", el).addEventListener("click", function (e) {
      RX.calendar(e.currentTarget, { value: OS.day, marks: RX.orderMarks(RX.db()), onPick: function (t) { OS.day = t; OS.period = ""; OS.page = 1; setTimeout(RX.rerender, 0); } });
    });
    el.addEventListener("click", function (e) {
      var t = e.target;
      var tab = t.closest("[data-tab]"); if (tab) { OS.status = tab.dataset.tab; OS.page = 1; OS.sel = {}; history.replaceState(null, "", "#/orders" + (OS.status !== "all" ? "?status=" + OS.status : "")); draw(); return; }
      var sh = t.closest("th[data-sort]"); if (sh) { var key = sh.dataset.sort; OS.sort = { key: key, dir: OS.sort.key === key ? -OS.sort.dir : -1 }; draw(); return; }
      var pg = t.closest("[data-page]"); if (pg && !pg.disabled) { OS.page = +pg.dataset.page; draw(); return; }
      if (t.matches("[data-all]")) { el._page.forEach(function (o) { if (t.checked) OS.sel[o.id] = 1; else delete OS.sel[o.id]; }); draw(); return; }
      if (t.matches("[data-sel]")) { if (t.checked) OS.sel[t.dataset.sel] = 1; else delete OS.sel[t.dataset.sel]; draw(); return; }
      if (t.closest("td.w0 input")) return;
      if (t.closest("[data-bulk-clear]")) { OS.sel = {}; draw(); return; }
      var bk = t.closest("[data-bulk]");
      if (bk) {
        var st = bk.dataset.bulk, ids = Object.keys(OS.sel);
        RX.confirm({ title: "Modifier " + ids.length + " commande(s)", text: "Passer les commandes sélectionnées en « " + RX.STATUS[st].label + " » ?", ok: "Confirmer" }).then(function (ok) {
          if (!ok) return;
          var db = RX.db(); ids.forEach(function (id) { var o = db.orders.filter(function (x) { return x.id === id; })[0]; if (o) RX.setOrderStatus(o, st); });
          OS.sel = {}; RX.save(); draw(); RX.toast(ids.length + " commande(s) mise(s) à jour");
        });
        return;
      }
      if (t.closest("[data-bulk-export]")) { exportOrders(RX.db().orders.filter(function (o) { return OS.sel[o.id]; })); return; }
      if (t.closest("[data-export]")) { exportOrders(filtered()); return; }
      var tr = t.closest("tr[data-href]"); if (tr) location.hash = tr.dataset.href;
    });
  });
  function exportOrders(list) {
    var rows = [["N°", "Date", "Statut", "Client", "E-mail", "Téléphone", "Pays", "Ville", "Adresse", "Articles", "Sous-total", "Remise", "Code promo", "Livraison", "Frais de port", "Total", "Paiement", "Suivi"]];
    list.forEach(function (o) {
      rows.push([o.id, new Date(o.date).toLocaleString("fr-FR"), RX.STATUS[o.status].label, RX.custName(o), o.customer.email, o.customer.phone, RX.countryName(o.address.country), o.address.city, o.address.line,
        o.items.map(function (i) { return i.q + "× " + i.name + (i.size ? " (" + i.size + ")" : ""); }).join(" | "), o.subtotal, o.discount, o.promo || "", RX.SHIP[o.shipping.method], o.shipping.price, o.total, RX.payLabel(o.payment), o.tracking]);
    });
    RX.download("commandes-relaxx-" + DB.dayKey(Date.now()) + ".csv", RX.csv(rows));
  }

  /* ---------- order detail ---------- */
  RX.route("/orders/:id", "orders", function (el, params) {
    var db = RX.db(), o = db.orders.filter(function (x) { return x.id === params.id; })[0], w = RX.canWrite("orders");
    if (!o) { el.innerHTML = '<div class="card">' + RX.empty("Commande introuvable", "La commande " + params.id + " n'existe pas.", I.bag) + "</div>"; return; }
    var idx = db.orders.indexOf(o), prevO = db.orders[idx - 1], nextO = db.orders[idx + 1];
    var cust = db.customers.filter(function (c) { return c.id === o.customerId; })[0], cs = customerStats(db)[o.customerId] || { count: 0, spent: 0 };
    var vatRate = db.settings.store.vat || 0, vat = Math.round(o.total - o.total / (1 + vatRate / 100));
    var events = o.history.map(function (h) { return { t: h.t, html: "<b>" + RX.STATUS[h.status].label + "</b><small>" + RX.dateTime(h.t) + " · " + esc(h.by) + "</small>", cls: "is-on" }; })
      .concat((o.notes || []).map(function (n) { return { t: n.t, html: "<b>Note interne</b><small>" + RX.dateTime(n.t) + " · " + esc(n.by) + "</small><p>" + esc(n.text) + "</p>", cls: "is-note" }; }))
      .sort(function (a, b) { return b.t - a.t; });
    var paid = o.status !== "pending" && o.status !== "cancelled";

    el.innerHTML =
      '<div class="crumb"><a href="#/orders">Commandes</a> / <span>' + o.id + "</span></div>" +
      '<div class="ph"><div><h1 class="row" style="gap:12px">Commande ' + o.id + " " + RX.statusBadge(o.status) + "</h1><p>Passée le " + RX.dateTime(o.date) + " · " + (o.source === "web" ? "sur le site" : "données de démonstration") + " · langue " + (o.lang === "en" ? "anglais" : "français") + "</p></div>" +
      '<div class="ph-actions">' + (prevO ? '<a class="btn is-sm" href="#/orders/' + prevO.id + '" aria-label="Commande précédente">←</a>' : "") + (nextO ? '<a class="btn is-sm" href="#/orders/' + nextO.id + '" aria-label="Commande suivante">→</a>' : "") +
      '<a class="btn" href="mailto:' + esc(o.customer.email) + "?subject=" + encodeURIComponent("Votre commande RELAXX " + o.id) + '">' + I.mail + "Écrire au client</a>" +
      '<button type="button" class="btn" data-invoice>' + I.print + "Facture</button></div></div>" +

      '<div class="grid g-main-wide">' +
        '<div class="stack">' +
          '<div class="card"><div class="card-h"><h2>Articles (' + sum(o.items, function (i) { return i.q; }) + ')</h2></div><div class="table-wrap"><table class="t"><thead><tr><th>Produit</th><th>Taille</th><th class="r">Prix</th><th class="r">Qté</th><th class="r">Total</th></tr></thead><tbody>' +
            o.items.map(function (it) {
              return '<tr' + (RX.can("products") && db.products[it.pid] ? ' class="is-link" data-href="#/products/' + it.pid + '"' : "") + '><td><div class="cell">' + productThumb(db, it.pid) + '<div class="cell-txt"><b>' + esc(pname(db, it.pid, it.name)) + "</b><small>" + esc((db.products[it.pid] || {}).sku || "") + (it.color ? " · " + esc(colorName(db, it)) : "") + "</small></div></div></td>" +
                "<td>" + esc(it.size || "—") + '</td><td class="r num">' + RX.money(it.price) + '</td><td class="r num">' + it.q + '</td><td class="r num"><b>' + RX.money(it.price * it.q) + "</b></td></tr>";
            }).join("") + "</tbody></table></div>" +
            '<div class="card-b" style="border-top:1px solid var(--line)"><dl class="kv" style="grid-template-columns:1fr auto;max-width:380px;margin-left:auto">' +
              "<dt>Sous-total</dt><dd class=\"num r\">" + RX.money(o.subtotal) + "</dd>" +
              "<dt>Remise" + (o.promo ? ' <span class="chip mono" style="height:20px">' + esc(o.promo) + "</span>" : "") + '</dt><dd class="num">' + (o.discount ? "− " + RX.money(o.discount) : RX.money(0)) + "</dd>" +
              "<dt>Livraison " + RX.SHIP[o.shipping.method].toLowerCase() + '</dt><dd class="num">' + (o.shipping.price ? RX.money(o.shipping.price) : "Offerte") + "</dd>" +
              '<dt class="muted">dont TVA (' + vatRate + ' %)</dt><dd class="num muted">' + RX.money(vat) + "</dd>" +
              '<dt style="font-weight:700;color:var(--text);font-size:15px">Total</dt><dd class="num" style="font-weight:700;font-size:15px">' + RX.money(o.total) + "</dd></dl></div></div>" +

          '<div class="card"><div class="card-h"><h2>Historique</h2></div><div class="card-b">' +
            (w ? '<form class="row" data-note style="align-items:flex-start;margin-bottom:22px"><textarea class="textarea" name="note" placeholder="Ajouter une note interne (visible par l\'équipe uniquement)…" style="min-height:44px;height:44px"></textarea><button type="submit" class="btn is-primary">Ajouter</button></form>' : "") +
            '<ul class="dayh">' + events.map(function (ev) { return '<li class="' + ev.cls + '">' + ev.html + "</li>"; }).join("") + "</ul></div></div>" +
        "</div>" +

        '<div class="stack">' +
          '<div class="card"><div class="card-h"><h2>Statut</h2>' + RX.statusBadge(o.status) + '</div><div class="card-b">' +
            (w ? '<label class="field"><span>Changer le statut</span><select class="select" data-status>' + RX.STATUS_ORDER.map(function (s) { return '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + RX.STATUS[s].label + "</option>"; }).join("") + "</select></label>" +
              '<label class="check" data-restock hidden style="margin-top:12px"><input type="checkbox" checked> Remettre les articles en stock</label>' +
              '<button type="button" class="btn is-primary is-block" data-apply style="margin-top:14px">Mettre à jour</button>' +
              '<div class="row" style="margin-top:10px;gap:8px">' + nextStepBtn(o) + "</div>" : '<p class="muted">Lecture seule.</p>') + "</div></div>" +

          '<div class="card"><div class="card-h"><h2>Client</h2>' + (cust && RX.can("customers") ? '<a class="link" href="#/customers/' + cust.id + '">Voir la fiche</a>' : "") + '</div><div class="card-b">' +
            '<div class="row" style="gap:12px;margin-bottom:14px"><span class="avatar is-lg">' + RX.initials(RX.custName(o)) + '</span><div><b style="font-size:15px">' + esc(RX.custName(o)) + '</b><div class="muted" style="font-size:12.5px">' + cs.count + " commande" + (cs.count > 1 ? "s" : "") + " · " + RX.money(cs.spent) + (cust ? " · " + RX.SEG[segmentOf(cust, cs)][0] : "") + "</div></div></div>" +
            '<dl class="kv" style="grid-template-columns:80px 1fr"><dt>E-mail</dt><dd><a href="mailto:' + esc(o.customer.email) + '">' + esc(o.customer.email) + "</a></dd><dt>Téléphone</dt><dd><a href=\"tel:" + esc(String(o.customer.phone).replace(/\s/g, "")) + '">' + esc(o.customer.phone) + "</a></dd></dl></div></div>" +

          '<div class="card"><div class="card-h"><h2>Livraison</h2><span class="chip">' + RX.SHIP[o.shipping.method] + "</span></div><div class=\"card-b\">" +
            '<address style="font-style:normal;line-height:1.6">' + esc(RX.custName(o)) + "<br>" + esc(o.address.line) + "<br>" + esc((o.address.zip ? o.address.zip + " " : "") + o.address.city) + "<br>" + esc(RX.countryName(o.address.country)) + "</address>" +
            '<button type="button" class="link" data-copy-addr style="margin-top:8px;font-size:12.5px">Copier l\'adresse</button>' +
            '<div class="hr"></div><label class="field"><span>N° de suivi</span><div class="row"><input class="input mono" data-tracking value="' + esc(o.tracking || "") + '" placeholder="ex. RLX123456789"' + (w ? "" : " disabled") + ">" + (w ? '<button type="button" class="btn" data-save-tracking>OK</button>' : "") + "</div></label></div></div>" +

          '<div class="card"><div class="card-h"><h2>Paiement</h2>' + RX.badge(o.status === "refunded" ? "bad" : paid ? "ok" : "warn", o.status === "refunded" ? "Remboursé" : paid ? "Encaissé" : "En attente") + '</div><div class="card-b"><dl class="kv" style="grid-template-columns:90px 1fr">' +
            "<dt>Moyen</dt><dd>" + esc(RX.PAY[o.payment.method] || o.payment.method) + "</dd>" + (o.payment.operator ? "<dt>Opérateur</dt><dd>" + esc(RX.OPS[o.payment.operator] || o.payment.operator) + "</dd>" : "") +
            '<dt>Montant</dt><dd class="num"><b>' + RX.money(o.total) + "</b></dd></dl>" +
            (o.payment.method === "cod" && o.status === "pending" ? '<p class="muted" style="margin-top:10px;font-size:12.5px">À encaisser par le livreur à la remise du colis.</p>' : "") + "</div></div>" +
        "</div>" +
      "</div>";

    var sel = $("[data-status]", el), rs = $("[data-restock]", el);
    if (sel) sel.addEventListener("change", function () { rs.hidden = ["cancelled", "refunded"].indexOf(sel.value) < 0 || ["cancelled", "refunded"].indexOf(o.status) > -1; });
    el.addEventListener("click", function (e) {
      var t = e.target;
      var tr = t.closest("tr[data-href]"); if (tr) { location.hash = tr.dataset.href; return; }
      if (t.closest("[data-apply]")) { apply(sel.value); return; }
      var nx = t.closest("[data-next]"); if (nx) { apply(nx.dataset.next); return; }
      if (t.closest("[data-save-tracking]")) { o.tracking = $("[data-tracking]", el).value.trim(); RX.save("a mis à jour le suivi de", o.id); RX.toast("Numéro de suivi enregistré"); return; }
      if (t.closest("[data-copy-addr]")) {
        var txt = RX.custName(o) + "\n" + o.address.line + "\n" + o.address.city + "\n" + RX.countryName(o.address.country) + "\n" + o.customer.phone;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { RX.toast("Adresse copiée"); }, function () { RX.toast("Copie impossible dans ce navigateur", "bad"); });
        return;
      }
      if (t.closest("[data-invoice]")) invoice(o);
    });
    var nf = $("[data-note]", el);
    if (nf) nf.addEventListener("submit", function (e) {
      e.preventDefault(); var v = nf.note.value.trim(); if (!v) return;
      o.notes = o.notes || []; o.notes.push({ t: Date.now(), text: v, by: RX.user.name });
      RX.save("a ajouté une note à", o.id); RX.rerender(); RX.toast("Note ajoutée");
    });
    function apply(st) {
      if (st === o.status) return;
      var restock = st === "cancelled" || st === "refunded" ? ($("input", rs) || {}).checked : false;
      var go = function () { RX.setOrderStatus(o, st, { restock: restock }); RX.save(); RX.rerender(); RX.toast("Commande " + o.id + " : " + RX.STATUS[st].label); };
      if (st === "cancelled" || st === "refunded") RX.confirm({ title: st === "cancelled" ? "Annuler la commande" : "Rembourser la commande", text: (st === "cancelled" ? "La commande sera annulée." : "La commande sera marquée comme remboursée (" + RX.money(o.total) + ").") + (restock ? " Les articles seront remis en stock." : ""), ok: "Confirmer", danger: true }).then(function (ok) { if (ok) go(); });
      else go();
    }
  });
  function nextStepBtn(o) {
    var next = { pending: ["paid", "Marquer payée"], paid: ["processing", "Lancer la préparation"], processing: ["shipped", "Marquer expédiée"], shipped: ["delivered", "Marquer livrée"] }[o.status];
    return next ? '<button type="button" class="btn is-accent is-block" data-next="' + next[0] + '">' + next[1] + " →</button>" : "";
  }
  function invoice(o) {
    var db = RX.db(), s = db.settings.store, vatRate = s.vat || 0, vat = Math.round(o.total - o.total / (1 + vatRate / 100));
    var html = '<div class="invoice"><div class="invoice-h"><div><b class="brand">RELAXX</b><div style="margin-top:8px;line-height:1.5">' + esc(s.legalName) + "<br>" + esc(s.address) + "<br>" + esc(s.email) + " · " + esc(s.phone) + (s.rccm ? "<br>RCCM " + esc(s.rccm) : "") + (s.ncc ? " · NCC " + esc(s.ncc) : "") + "</div></div>" +
      '<div style="text-align:right"><b style="font-size:18px">Facture</b><div style="margin-top:8px;line-height:1.5">N° F-' + o.id.replace("RX-", "") + "<br>Commande " + o.id + "<br>Date : " + RX.date(o.date) + "</div></div></div>" +
      '<div style="display:flex;justify-content:space-between;gap:20px;margin-top:18px"><div><b>Facturé à</b><div style="margin-top:6px;line-height:1.5">' + esc(RX.custName(o)) + "<br>" + esc(o.address.line) + "<br>" + esc(o.address.city) + ", " + esc(RX.countryName(o.address.country)) + "<br>" + esc(o.customer.email) + "</div></div>" +
      '<div style="text-align:right"><b>Paiement</b><div style="margin-top:6px">' + esc(RX.payLabel(o.payment)) + "</div></div></div>" +
      '<table><thead><tr><th>Désignation</th><th>Taille · couleur</th><th class="r">P.U.</th><th class="r">Qté</th><th class="r">Montant</th></tr></thead><tbody>' +
      o.items.map(function (it) { return "<tr><td>" + esc(pname(db, it.pid, it.name)) + "</td><td>" + esc([it.size, it.color].filter(Boolean).join(" · ") || "—") + '</td><td class="r">' + RX.money(it.price) + '</td><td class="r">' + it.q + '</td><td class="r">' + RX.money(it.price * it.q) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="invoice-tot"><div><span>Sous-total</span><span>' + RX.money(o.subtotal) + "</span></div>" + (o.discount ? "<div><span>Remise" + (o.promo ? " (" + esc(o.promo) + ")" : "") + "</span><span>− " + RX.money(o.discount) + "</span></div>" : "") +
      "<div><span>Livraison</span><span>" + (o.shipping.price ? RX.money(o.shipping.price) : "Offerte") + '</span></div><div class="big"><span>Total TTC</span><span>' + RX.money(o.total) + "</span></div><div><span>dont TVA " + vatRate + " %</span><span>" + RX.money(vat) + "</span></div></div>" +
      '<p style="margin-top:28px;color:#666;font-size:11.5px">Merci pour votre commande. Retours gratuits sous 30 jours — voir nos conditions générales de vente.</p></div>';
    RX.modal({ title: "Facture — " + o.id, size: "lg", body: html, actions: [{ label: "Fermer", close: true }, { label: "Imprimer / PDF", tone: "primary", onClick: function () {
      var root = document.createElement("div"); root.className = "print-root"; root.innerHTML = html; document.body.appendChild(root);
      document.body.classList.add("printing");
      var done = function () { document.body.classList.remove("printing"); root.remove(); removeEventListener("afterprint", done); };
      addEventListener("afterprint", done); window.print(); setTimeout(done, 1500);
    } }] });
  }

  /* ======================================================================
     CUSTOMERS
     ====================================================================== */
  var CS = { seg: "all", q: "", country: "", sort: { key: "spent", dir: -1 }, page: 1 };
  RX.route("/customers", "customers", function (el) {
    var db = RX.db(), st = customerStats(db), r30 = RX.range(30);
    var rows = db.customers.map(function (c) { var s = st[c.id] || { count: 0, spent: 0, last: 0 }; return { c: c, count: s.count, spent: s.spent, last: s.last, seg: segmentOf(c, s), name: c.first + " " + c.last }; });
    var buyers = rows.filter(function (r) { return r.count; }), repeat = buyers.filter(function (r) { return r.count >= 2; }).length;
    var countries = {}; db.customers.forEach(function (c) { countries[c.country] = 1; });
    el.innerHTML =
      '<div class="ph"><div><h1>Clients</h1><p>' + RX.num(db.customers.length) + " clients · profils, historique d'achat et segments.</p></div><div class=\"ph-actions\">" + RX.readOnly("customers") + '<button type="button" class="btn" data-export>' + I.down + "Exporter (CSV)</button></div></div>" +
      '<div class="grid g-4" style="margin-bottom:18px">' +
        kpiS("Clients", RX.num(db.customers.length), buyers.length + " ont déjà commandé") +
        kpiS("Nouveaux (30 j)", RX.num(db.customers.filter(function (c) { return RX.inRange(c.createdAt, r30); }).length), "inscrits ou premiers achats") +
        kpiS("Taux de réachat", RX.num1(buyers.length ? repeat / buyers.length * 100 : 0) + " %", repeat + " clients fidèles") +
        kpiS("Valeur client moyenne", RX.money(buyers.length ? sum(buyers, function (r) { return r.spent; }) / buyers.length : 0), "chiffre d'affaires par acheteur") +
      "</div>" +
      '<div class="card"><div class="tabs" role="tablist">' + [["all", "Tous"], ["vip", "VIP"], ["repeat", "Fidèles"], ["new", "Nouveaux"], ["inactive", "Inactifs"], ["lead", "Prospects"]].map(function (s) {
        return '<button type="button" role="tab" data-seg="' + s[0] + '" aria-selected="' + (CS.seg === s[0]) + '">' + s[1] + ' <span class="n">' + (s[0] === "all" ? rows.length : rows.filter(function (r) { return r.seg === s[0]; }).length) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="Nom, e-mail, téléphone, ville…" data-q value="' + esc(CS.q) + '" aria-label="Rechercher"></div>' +
      '<select class="select" data-country aria-label="Pays"><option value="">Tous les pays</option>' + Object.keys(countries).map(function (k) { return '<option value="' + k + '"' + (CS.country === k ? " selected" : "") + ">" + esc(RX.countryName(k)) + "</option>"; }).join("") + "</select>" +
      '<span class="muted" style="font-size:12.5px;margin-left:auto">VIP : 300 000 FCFA ou 4 commandes · Inactif : aucune commande depuis 90 jours</span></div><div data-body></div></div>';

    function draw() {
      var qq = CS.q.trim().toLowerCase();
      var list = rows.filter(function (r) {
        if (CS.seg !== "all" && r.seg !== CS.seg) return false;
        if (CS.country && r.c.country !== CS.country) return false;
        if (qq && (r.name + " " + r.c.email + " " + r.c.phone + " " + r.c.city).toLowerCase().indexOf(qq) < 0) return false;
        return true;
      });
      var k = CS.sort.key, d = CS.sort.dir;
      list.sort(function (a, b) { var va = a[k], vb = b[k]; return (va > vb ? 1 : va < vb ? -1 : 0) * d; });
      var per = 20, page = list.slice((CS.page - 1) * per, CS.page * per);
      $("[data-body]", el).innerHTML = list.length ? '<div class="table-wrap"><table class="t"><thead><tr>' + RX.th("Client", "name", CS.sort) + "<th>Contact</th><th>Ville</th>" + RX.th("Commandes", "count", CS.sort, "r") + RX.th("Total dépensé", "spent", CS.sort, "r") + RX.th("Dernier achat", "last", CS.sort) + "<th>Segment</th></tr></thead><tbody>" +
        page.map(function (r) {
          return '<tr class="is-link" data-href="#/customers/' + r.c.id + '"><td><div class="cell"><span class="avatar" style="width:32px;height:32px">' + RX.initials(r.name) + '</span><div class="cell-txt"><b>' + esc(r.name) + "</b><small>" + r.c.id + " · client depuis " + RX.dateShort(r.c.createdAt) + "</small></div></div></td>" +
            '<td><div style="font-size:13px">' + esc(r.c.email) + '</div><small class="muted">' + esc(r.c.phone) + "</small></td><td>" + esc(r.c.city) + '<br><small class="muted">' + esc(RX.countryName(r.c.country)) + "</small></td>" +
            '<td class="r num">' + r.count + '</td><td class="r num"><b>' + RX.money(r.spent) + "</b></td><td>" + (r.last ? RX.rel(r.last) : '<span class="faint">—</span>') + "</td><td>" + RX.badge(SEG[r.seg][1], SEG[r.seg][0]) + (r.c.newsletter ? ' <span title="Abonné à la newsletter">' + I.mail.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px;color:var(--muted)"') + "</span>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" + RX.pager(list.length, CS.page, per) : RX.empty("Aucun client", "Aucun client ne correspond à ces critères.", I.users);
      el._list = list;
    }
    draw();
    $("[data-q]", el).addEventListener("input", RX.debounce(function (e) { CS.q = e.target.value; CS.page = 1; draw(); }, 180));
    $("[data-country]", el).addEventListener("change", function (e) { CS.country = e.target.value; CS.page = 1; draw(); });
    el.addEventListener("click", function (e) {
      var t = e.target, sg = t.closest("[data-seg]");
      if (sg) { CS.seg = sg.dataset.seg; CS.page = 1; $$("[data-seg]", el).forEach(function (b) { b.setAttribute("aria-selected", b === sg ? "true" : "false"); }); draw(); return; }
      var sh = t.closest("th[data-sort]"); if (sh) { var key = sh.dataset.sort; CS.sort = { key: key, dir: CS.sort.key === key ? -CS.sort.dir : -1 }; draw(); return; }
      var pg = t.closest("[data-page]"); if (pg && !pg.disabled) { CS.page = +pg.dataset.page; draw(); return; }
      if (t.closest("[data-export]")) {
        var out = [["ID", "Prénom", "Nom", "E-mail", "Téléphone", "Ville", "Pays", "Client depuis", "Commandes", "Total dépensé", "Dernier achat", "Segment", "Newsletter"]];
        el._list.forEach(function (r) { out.push([r.c.id, r.c.first, r.c.last, r.c.email, r.c.phone, r.c.city, RX.countryName(r.c.country), RX.date(r.c.createdAt), r.count, r.spent, r.last ? RX.date(r.last) : "", SEG[r.seg][0], r.c.newsletter ? "oui" : "non"]); });
        RX.download("clients-relaxx-" + DB.dayKey(Date.now()) + ".csv", RX.csv(out)); return;
      }
      var tr = t.closest("tr[data-href]"); if (tr) location.hash = tr.dataset.href;
    });
  });
  function kpiS(label, v, sub) { return '<div class="kpi" style="min-height:0"><div class="kpi-l">' + label + '</div><div class="kpi-v num">' + v + '</div><div class="kpi-d">' + esc(sub) + "</div></div>"; }
  RX.kpiS = kpiS;

  RX.route("/customers/:id", "customers", function (el, params) {
    var db = RX.db(), c = db.customers.filter(function (x) { return x.id === params.id; })[0], w = RX.canWrite("customers");
    if (!c) { el.innerHTML = '<div class="card">' + RX.empty("Client introuvable", "", I.users) + "</div>"; return; }
    var orders = db.orders.filter(function (o) { return o.customerId === c.id; }).slice().reverse(), s = customerStats(db)[c.id] || { count: 0, spent: 0, last: 0, first: 0 }, seg = segmentOf(c, s);
    var fav = {}; orders.forEach(function (o) { if (RX.isSale(o)) o.items.forEach(function (it) { var cat = (db.products[it.pid] || {}).cat; if (cat) fav[cat] = (fav[cat] || 0) + it.q; }); });
    var favCat = Object.keys(fav).sort(function (a, b) { return fav[b] - fav[a]; })[0], catL = (db.categories.filter(function (x) { return x.key === favCat; })[0] || {}).labelFr;
    var sub = db.subscribers.filter(function (x) { return x.email.toLowerCase() === c.email.toLowerCase(); })[0];
    el.innerHTML =
      '<div class="crumb"><a href="#/customers">Clients</a> / <span>' + esc(c.first + " " + c.last) + "</span></div>" +
      '<div class="ph"><div class="row" style="gap:16px"><span class="avatar is-lg">' + RX.initials(c.first + " " + c.last) + '</span><div><h1 class="row" style="gap:10px">' + esc(c.first + " " + c.last) + " " + RX.badge(SEG[seg][1], SEG[seg][0]) + "</h1><p>" + c.id + " · client depuis le " + RX.date(c.createdAt) + " · " + esc(c.city) + ", " + esc(RX.countryName(c.country)) + "</p></div></div>" +
      '<div class="ph-actions"><a class="btn" href="mailto:' + esc(c.email) + '">' + I.mail + 'E-mail</a><a class="btn" href="tel:' + esc(String(c.phone).replace(/\s/g, "")) + '">Appeler</a>' +
      (w ? '<button type="button" class="btn is-ghost-danger" data-anon>' + I.trash + "Anonymiser</button>" : "") + "</div></div>" +
      '<div class="grid g-4" style="margin-bottom:18px">' + kpiS("Commandes", s.count, orders.length - s.count ? orders.length - s.count + " annulée(s)/remboursée(s)" : "toutes abouties") + kpiS("Total dépensé", RX.money(s.spent), "") +
        kpiS("Panier moyen", RX.money(s.count ? s.spent / s.count : 0), "") + kpiS("Dernier achat", s.last ? RX.rel(s.last) : "—", favCat ? "Catégorie préférée : " + (catL || favCat) : "") + "</div>" +
      '<div class="grid g-main-wide"><div class="card"><div class="card-h"><h2>Commandes</h2><span class="muted">' + orders.length + "</span></div>" + ordersTable(db, orders, null, false) + "</div>" +
      '<form class="card" data-form><div class="card-h"><h2>Profil</h2>' + RX.readOnly("customers") + '</div><div class="card-b"><div class="form-grid">' +
        f("Prénom", "first", c.first) + f("Nom", "last", c.last) + f("E-mail", "email", c.email, "full", "email") + f("Téléphone", "phone", c.phone, "full", "tel") + f("Ville", "city", c.city) +
        '<label class="field"><span>Pays</span><select class="select" name="country"' + (w ? "" : " disabled") + ">" + DB.COUNTRIES.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === c.country ? " selected" : "") + ">" + esc(k[2]) + "</option>"; }).join("") + "</select></label>" +
        f("Étiquettes (séparées par des virgules)", "tags", (c.tags || []).join(", "), "full") +
        '<label class="field full"><span>Note interne</span><textarea class="textarea" name="note" placeholder="Préférences, taille habituelle, remarques…"' + (w ? "" : " disabled") + ">" + esc(c.note || "") + "</textarea></label>" +
        '<label class="switch full"><input type="checkbox" name="newsletter"' + (sub && sub.status === "subscribed" || c.newsletter ? " checked" : "") + (w ? "" : " disabled") + '><i></i><b>Abonné(e) à la newsletter</b></label>' +
      "</div></div>" + (w ? '<div class="card-f"><button type="submit" class="btn is-primary">Enregistrer</button></div>' : "") + "</form></div>";
    function f(label, name, v, cls, type) { return '<label class="field' + (cls ? " " + cls : "") + '"><span>' + label + '</span><input class="input" name="' + name + '" type="' + (type || "text") + '" value="' + esc(v || "") + '"' + (w ? "" : " disabled") + "></label>"; }
    var form = $("[data-form]", el);
    form.addEventListener("input", function () { RX.dirty = true; });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (!w) return;
      var g = function (n) { return form.elements[n].value.trim(); };
      if (!g("first") || !g("email")) { RX.toast("Le prénom et l'e-mail sont obligatoires", "bad"); return; }
      c.first = g("first"); c.last = g("last"); c.email = g("email"); c.phone = g("phone"); c.city = g("city"); c.country = form.elements.country.value;
      c.tags = g("tags").split(",").map(function (t) { return t.trim(); }).filter(Boolean); c.note = form.elements.note.value.trim(); c.newsletter = form.elements.newsletter.checked;
      var s2 = db.subscribers.filter(function (x) { return x.email.toLowerCase() === c.email.toLowerCase(); })[0];
      if (c.newsletter && !s2) db.subscribers.push({ email: c.email, date: Date.now(), lang: "fr", source: "backoffice", status: "subscribed" });
      else if (s2) s2.status = c.newsletter ? "subscribed" : "unsubscribed";
      RX.dirty = false; RX.save("a modifié la fiche client", c.first + " " + c.last); RX.toast("Fiche client enregistrée"); RX.rerender();
    });
    el.addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-href]"); if (tr) { location.hash = tr.dataset.href; return; }
      if (e.target.closest("[data-anon]")) {
        RX.confirm({ title: "Anonymiser ce client", html: "Les données personnelles de <b>" + esc(c.first + " " + c.last) + "</b> seront effacées (droit à l'oubli). Les commandes sont conservées pour la comptabilité, sans nom ni coordonnées. Cette action est définitive.", ok: "Anonymiser", danger: true }).then(function (ok) {
          if (!ok) return;
          var old = c.first + " " + c.last;
          db.subscribers = db.subscribers.filter(function (x) { return x.email.toLowerCase() !== c.email.toLowerCase(); });
          c.first = "Client"; c.last = "anonymisé"; c.email = "anonyme-" + c.id.toLowerCase() + "@example.invalid"; c.phone = ""; c.note = ""; c.tags = []; c.newsletter = false;
          orders.forEach(function (o) { o.customer = { first: "Client", last: "anonymisé", email: c.email, phone: "" }; o.address.line = "—"; });
          RX.save("a anonymisé le client", old); RX.toast("Client anonymisé"); RX.rerender();
        });
      }
    });
  });

  /* ======================================================================
     REPORTS
     ====================================================================== */
  RX.route("/reports", "reports", function (el, params, q) {
    var db = RX.db(), per = RX.period(q, "30", [7, 30, 90, 120]), days = per.days;
    // one day: per hour; otherwise per day, week or month
    var gran = per.single ? "hour" : ["day", "week", "month"].indexOf(q.g) > -1 ? q.g : (days > 45 ? "week" : "day");
    var r = per.range, S = sales(db, r), all = db.orders.filter(function (o) { return RX.inRange(o.date, r); });
    var gross = sum(S, function (o) { return o.subtotal; }), disc = sum(S, function (o) { return o.discount; }), ship = sum(S, function (o) { return o.shipping.price; }), net = sum(S, function (o) { return o.total; });
    var units = sum(S, function (o) { return sum(o.items, function (i) { return i.q; }); });
    var cost = sum(S, function (o) { return sum(o.items, function (i) { return ((db.products[i.pid] || {}).cost || 0) * i.q; }); });
    var cancelled = all.filter(function (o) { return !RX.isSale(o); });

    // buckets
    function bucket(t) {
      var d = new Date(t);
      if (gran === "hour") { d.setMinutes(0, 0, 0); return d.getTime(); }
      d.setHours(0, 0, 0, 0);
      if (gran === "week") { var wd = (d.getDay() + 6) % 7; d = new Date(d.getTime() - wd * DAY); d.setHours(0, 0, 0, 0); }
      if (gran === "month") d.setDate(1);
      return d.getTime();
    }
    var slots = gran === "hour" ? Array.apply(null, Array(24)).map(function (x, h) { var d = new Date(r.from); d.setHours(h, 0, 0, 0); return d.getTime(); }) : daysOf(r);
    var B = {}; slots.forEach(function (t) { B[bucket(t)] = B[bucket(t)] || { t: bucket(t), n: 0, units: 0, gross: 0, disc: 0, ship: 0, net: 0 }; });
    S.forEach(function (o) { var b = B[bucket(o.date)]; if (!b) return; b.n++; b.units += sum(o.items, function (i) { return i.q; }); b.gross += o.subtotal; b.disc += o.discount; b.ship += o.shipping.price; b.net += o.total; });
    var rows = Object.keys(B).map(function (k) { return B[k]; }).sort(function (a, b) { return a.t - b.t; });
    var lab = function (t) { var d = new Date(t); return gran === "hour" ? d.getHours() + " h" : gran === "month" ? d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }) : gran === "week" ? "Sem. " + RX.dateShort(t) : RX.dateShort(t); };

    var prod = {}; S.forEach(function (o) { o.items.forEach(function (i) { var x = prod[i.pid] || (prod[i.pid] = { q: 0, rev: 0, cost: 0 }); x.q += i.q; x.rev += i.price * i.q; x.cost += ((db.products[i.pid] || {}).cost || 0) * i.q; }); });
    var prodRows = Object.keys(prod).map(function (k) { return { pid: +k, q: prod[k].q, rev: prod[k].rev, margin: prod[k].rev - prod[k].cost }; }).sort(function (a, b) { return b.rev - a.rev; });
    var cat = {}; prodRows.forEach(function (x) { var c = (db.products[x.pid] || {}).cat; cat[c] = (cat[c] || 0) + x.rev; });
    var geo = {}; S.forEach(function (o) { var k = RX.countryName(o.address.country) + " — " + o.address.city; var g = geo[k] || (geo[k] = { n: 0, rev: 0 }); g.n++; g.rev += o.total; });
    var pay = {}; S.forEach(function (o) { var k = RX.payLabel(o.payment); var g = pay[k] || (pay[k] = { n: 0, rev: 0 }); g.n++; g.rev += o.total; });
    var promo = {}; S.forEach(function (o) { if (!o.promo) return; var g = promo[o.promo] || (promo[o.promo] = { n: 0, rev: 0, disc: 0 }); g.n++; g.rev += o.total; g.disc += o.discount; });
    var catL = {}; db.categories.forEach(function (c) { catL[c.key] = c.labelFr || c.label; });

    el.innerHTML =
      '<div class="ph"><div><h1>Rapports</h1><p>' + (per.single ? cap(per.label) + " (" + RX.date(r.from) + ")" : "Du " + RX.date(r.from) + " au " + RX.date(r.to)) + " · commandes annulées et remboursées exclues du chiffre d'affaires.</p></div>" +
      '<div class="ph-actions">' + RX.periodPicker(per, [7, 30, 90, 120]) +
      (per.single ? "" : '<div class="seg" aria-label="Regroupement">' + [["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]].map(function (g) { return '<button type="button" data-g="' + g[0] + '" aria-pressed="' + (g[0] === gran) + '">' + g[1] + "</button>"; }).join("") + "</div>") + "</div></div>" +
      '<div class="grid g-4">' + kpiS("Chiffre d'affaires TTC", RX.money(net), S.length + " commandes · " + units + " articles") + kpiS("Ventes brutes (produits)", RX.money(gross), "avant remises") +
        kpiS("Remises accordées", RX.money(disc), RX.num1(gross ? disc / gross * 100 : 0) + " % des ventes") + kpiS("Marge brute estimée", RX.money(gross - disc - cost), RX.num1(gross ? (gross - disc - cost) / (gross - disc || 1) * 100 : 0) + " % · selon les coûts d'achat") + "</div>" +
      '<div class="grid g-4" style="margin-top:18px">' + kpiS("Frais de livraison encaissés", RX.money(ship), "") + kpiS("Panier moyen", RX.money(S.length ? net / S.length : 0), "") +
        kpiS("Articles par commande", RX.num1(S.length ? units / S.length : 0), "") + kpiS("Annulations / remboursements", cancelled.length, RX.money(sum(cancelled, function (o) { return o.total; })) + " non encaissés") + "</div>" +
      '<div class="card" style="margin-top:18px"><div class="card-h"><h2>Chiffre d\'affaires par ' + { hour: "heure", day: "jour", week: "semaine", month: "mois" }[gran] + '</h2><button type="button" class="btn is-sm" data-x="periods">' + I.down + 'CSV</button></div><div class="card-b"><div class="chart" id="c-rep"></div></div>' +
        '<div class="table-wrap" style="max-height:360px;overflow:auto;border-top:1px solid var(--line)"><table class="t"><thead><tr><th>Période</th><th class="r">Commandes</th><th class="r">Articles</th><th class="r">Ventes brutes</th><th class="r">Remises</th><th class="r">Livraison</th><th class="r">Total TTC</th></tr></thead><tbody>' +
        rows.slice().reverse().map(function (b) { return "<tr><td>" + lab(b.t) + '</td><td class="r num">' + b.n + '</td><td class="r num">' + b.units + '</td><td class="r num">' + RX.money(b.gross) + '</td><td class="r num">' + RX.money(b.disc) + '</td><td class="r num">' + RX.money(b.ship) + '</td><td class="r num"><b>' + RX.money(b.net) + "</b></td></tr>"; }).join("") + "</tbody></table></div></div>" +
      '<div class="grid g-main" style="margin-top:18px"><div class="card"><div class="card-h"><h2>Ventes par produit</h2><button type="button" class="btn is-sm" data-x="products">' + I.down + 'CSV</button></div><div class="table-wrap" style="max-height:520px;overflow:auto"><table class="t"><thead><tr><th>Produit</th><th class="r">Vendus</th><th class="r">CA</th><th class="r">Marge</th><th class="r">Part</th></tr></thead><tbody>' +
        prodRows.map(function (x) { return '<tr class="is-link" data-href="#/products/' + x.pid + '"><td><div class="cell">' + productThumb(db, x.pid, "is-sm") + '<div class="cell-txt"><b>' + esc(pname(db, x.pid)) + "</b><small>" + esc(catL[(db.products[x.pid] || {}).cat] || "") + '</small></div></div></td><td class="r num">' + x.q + '</td><td class="r num">' + RX.money(x.rev) + '</td><td class="r num">' + RX.money(x.margin) + '</td><td class="r num">' + RX.num1(gross ? x.rev / gross * 100 : 0) + " %</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="stack"><div class="card"><div class="card-h"><h2>Par catégorie</h2></div><div class="card-b">' + RX.hbars(Object.keys(cat).map(function (k) { return { label: catL[k] || k, value: cat[k], color: "#c89564" }; }).sort(function (a, b) { return b.value - a.value; }), RX.compact) + "</div></div>" +
        '<div class="card"><div class="card-h"><h2>Codes promo</h2></div>' + (Object.keys(promo).length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Code</th><th class="r">Util.</th><th class="r">Remise</th><th class="r">CA</th></tr></thead><tbody>' + Object.keys(promo).map(function (k) { return '<tr><td class="mono">' + esc(k) + '</td><td class="r num">' + promo[k].n + '</td><td class="r num">' + RX.compact(promo[k].disc) + '</td><td class="r num">' + RX.compact(promo[k].rev) + "</td></tr>"; }).join("") + "</tbody></table></div>" : RX.empty("Aucun code utilisé", "")) + "</div></div></div>" +
      '<div class="grid g-2" style="margin-top:18px"><div class="card"><div class="card-h"><h2>Par pays et ville</h2><button type="button" class="btn is-sm" data-x="geo">' + I.down + 'CSV</button></div><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="t"><thead><tr><th>Lieu</th><th class="r">Commandes</th><th class="r">CA</th></tr></thead><tbody>' +
        Object.keys(geo).sort(function (a, b) { return geo[b].rev - geo[a].rev; }).map(function (k) { return "<tr><td>" + esc(k) + '</td><td class="r num">' + geo[k].n + '</td><td class="r num">' + RX.money(geo[k].rev) + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="card"><div class="card-h"><h2>Par moyen de paiement</h2></div><div class="table-wrap"><table class="t"><thead><tr><th>Moyen</th><th class="r">Commandes</th><th class="r">CA</th><th class="r">Part</th></tr></thead><tbody>' +
        Object.keys(pay).sort(function (a, b) { return pay[b].rev - pay[a].rev; }).map(function (k) { return "<tr><td>" + esc(k) + '</td><td class="r num">' + pay[k].n + '</td><td class="r num">' + RX.money(pay[k].rev) + '</td><td class="r num">' + RX.num1(net ? pay[k].rev / net * 100 : 0) + " %</td></tr>"; }).join("") + "</tbody></table></div></div></div>";

    RX.bindPeriod(el, per, function (qs) { RX.go("#/reports?" + qs + (/^p=\d/.test(qs) && gran !== "hour" ? "&g=" + (+qs.slice(2) > 45 && gran === "day" ? "week" : gran) : "")); }, orderMarks(db));
    function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
    RX.chart.bars($("#c-rep", el), { labels: rows.map(function (b) { return lab(b.t); }), values: rows.map(function (b) { return b.net; }), color: "#c89564", name: "Total TTC", format: RX.money, aria: "Chiffre d'affaires par période" });
    el.addEventListener("click", function (e) {
      var t = e.target;
      var g = t.closest("[data-g]"); if (g) { RX.go("#/reports?" + per.q + "&g=" + g.dataset.g); return; }
      var tr = t.closest("tr[data-href]"); if (tr) { location.hash = tr.dataset.href; return; }
      var x = t.closest("[data-x]"); if (!x) return;
      var name = "rapport-" + x.dataset.x + "-" + (per.single ? DB.dayKey(per.day) : days + "j-" + DB.dayKey(Date.now())) + ".csv";
      if (x.dataset.x === "periods") RX.download(name, RX.csv([["Période", "Commandes", "Articles", "Ventes brutes", "Remises", "Livraison", "Total TTC"]].concat(rows.map(function (b) { return [lab(b.t), b.n, b.units, b.gross, b.disc, b.ship, b.net]; }))));
      if (x.dataset.x === "products") RX.download(name, RX.csv([["Produit", "SKU", "Catégorie", "Vendus", "CA", "Marge estimée"]].concat(prodRows.map(function (p) { var pr = db.products[p.pid] || {}; return [pname(db, p.pid), pr.sku, catL[pr.cat], p.q, p.rev, p.margin]; }))));
      if (x.dataset.x === "geo") RX.download(name, RX.csv([["Pays — ville", "Commandes", "CA"]].concat(Object.keys(geo).map(function (k) { return [k, geo[k].n, geo[k].rev]; }))));
    });
  });
})();
