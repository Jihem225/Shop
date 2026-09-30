/* ==========================================================================
   RELAXX back office — Marketing: promo codes, newsletter, site content
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$, DAY = 864e5;

  /* ======================================================================
     PROMO CODES
     ====================================================================== */
  function promoState(p) {
    var now = Date.now();
    if (!p.active) return ["muted", "En pause"];
    if (p.ends && p.ends < now) return ["bad", "Expiré"];
    if (p.starts && p.starts > now) return ["info", "Programmé"];
    if (p.limit && p.used >= p.limit) return ["warn", "Épuisé"];
    return ["ok", "Actif"];
  }
  function promoValue(p) { return p.type === "percent" ? "−" + p.value + " %" : p.type === "fixed" ? "−" + RX.money(p.value) : "Livraison offerte"; }
  function dIn(t) { if (!t) return ""; var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  RX.route("/promos", "promos", function (el) {
    var db = RX.db(), w = RX.canWrite("promos");
    function draw() {
      var stats = {}; db.orders.forEach(function (o) { if (!o.promo || !RX.isSale(o)) return; var s = stats[o.promo] || (stats[o.promo] = { n: 0, rev: 0, disc: 0 }); s.n++; s.rev += o.total; s.disc += o.discount; });
      var active = db.promos.filter(function (p) { return promoState(p)[1] === "Actif"; }).length, tot = Object.keys(stats).reduce(function (a, k) { a.rev += stats[k].rev; a.disc += stats[k].disc; a.n += stats[k].n; return a; }, { rev: 0, disc: 0, n: 0 });
      el.innerHTML =
        '<div class="ph"><div><h1>Codes promo</h1><p>Codes saisis par les clients au moment du paiement. Ils sont vérifiés en direct sur la boutique.</p></div><div class="ph-actions">' + (w ? '<button type="button" class="btn is-primary" data-new>' + I.plus + "Nouveau code</button>" : "") + "</div></div>" +
        '<div class="grid g-4" style="margin-bottom:18px">' + RX.kpiS("Codes actifs", active, db.promos.length + " codes au total") + RX.kpiS("Commandes avec code", RX.num(tot.n), "depuis le lancement") +
          RX.kpiS("Chiffre d'affaires généré", RX.money(tot.rev), "commandes utilisant un code") + RX.kpiS("Remises accordées", RX.money(tot.disc), "coût des promotions") + "</div>" +
        '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Code</th><th>Avantage</th><th>Conditions</th><th>Validité</th><th>Utilisations</th><th class="r">CA généré</th><th>Statut</th><th class="r">Actions</th></tr></thead><tbody>' +
        (db.promos.length ? db.promos.map(function (p, i) {
          var st = promoState(p), s = stats[p.code] || { n: 0, rev: 0 };
          return "<tr><td><b class=\"mono\" style=\"font-size:14px\">" + esc(p.code) + '</b><br><small class="muted">' + esc(p.note || "") + "</small></td><td><b>" + promoValue(p) + "</b></td>" +
            "<td>" + (p.minOrder ? "Dès " + RX.money(p.minOrder) : '<span class="muted">Aucune</span>') + "</td>" +
            "<td><small>" + (p.starts ? "du " + RX.date(p.starts) : "") + (p.ends ? "<br>au " + RX.date(p.ends) : p.starts ? "<br>sans fin" : "Permanent") + "</small></td>" +
            '<td style="min-width:140px"><div class="num">' + p.used + (p.limit ? " / " + p.limit : "") + "</div>" + (p.limit ? '<div class="progress" style="margin-top:6px"><i style="width:' + Math.min(100, p.used / p.limit * 100) + '%"></i></div>' : "") + "</td>" +
            '<td class="r num">' + RX.money(s.rev) + "</td><td>" + RX.badge(st[0], st[1]) + "</td>" +
            '<td class="r w0">' + (w ? '<button type="button" class="btn is-sm" data-toggle="' + i + '">' + (p.active ? "Mettre en pause" : "Activer") + '</button> <button type="button" class="btn is-sm" data-edit="' + i + '" aria-label="Modifier">' + I.edit + '</button> <button type="button" class="btn is-sm is-ghost-danger" data-del="' + i + '" aria-label="Supprimer">' + I.trash + "</button>" : "") + "</td></tr>";
        }).join("") : '<tr><td colspan="8">' + RX.empty("Aucun code promo", "Créez votre premier code.", I.percent) + "</td></tr>") + "</tbody></table></div></div>";
    }
    draw();
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-new]")) { form(null); return; }
      var ed = t.closest("[data-edit]"); if (ed) { form(db.promos[+ed.dataset.edit]); return; }
      var tg = t.closest("[data-toggle]"); if (tg) { var p = db.promos[+tg.dataset.toggle]; p.active = !p.active; RX.save(p.active ? "a activé le code promo" : "a mis en pause le code promo", p.code); draw(); RX.toast(p.code + (p.active ? " activé" : " en pause")); return; }
      var dl = t.closest("[data-del]"); if (dl) { var pd = db.promos[+dl.dataset.del]; RX.confirm({ title: "Supprimer le code", text: "Supprimer « " + pd.code + " » ? Les commandes passées gardent la trace du code.", ok: "Supprimer", danger: true }).then(function (ok) { if (!ok) return; db.promos.splice(db.promos.indexOf(pd), 1); RX.save("a supprimé le code promo", pd.code); draw(); }); }
    });
    function form(p) {
      var isNew = !p; p = p || { code: "", type: "percent", value: 10, minOrder: 0, starts: Date.now(), ends: 0, limit: 0, used: 0, active: true, note: "" };
      var m = RX.modal({ title: isNew ? "Nouveau code promo" : "Modifier " + p.code, size: "lg",
        body: '<form class="form-grid" onsubmit="return false">' +
          '<label class="field"><span>Code *</span><div class="row"><input class="input mono" name="code" value="' + esc(p.code) + '" placeholder="ex. SOLDES25" style="text-transform:uppercase"' + (isNew ? "" : " disabled") + ">" + (isNew ? '<button type="button" class="btn" data-gen>Générer</button>' : "") + "</div></label>" +
          '<label class="field"><span>Note interne</span><input class="input" name="note" value="' + esc(p.note) + '" placeholder="ex. Campagne Instagram"></label>' +
          '<label class="field"><span>Type de remise</span><select class="select" name="type"><option value="percent"' + (p.type === "percent" ? " selected" : "") + '>Pourcentage</option><option value="fixed"' + (p.type === "fixed" ? " selected" : "") + '>Montant fixe (FCFA)</option><option value="shipping"' + (p.type === "shipping" ? " selected" : "") + ">Livraison offerte</option></select></label>" +
          '<label class="field" data-valwrap><span>Valeur</span><div class="input-suffix"><input class="input num" type="number" min="0" name="value" value="' + p.value + '"><span data-unit>' + (p.type === "percent" ? "%" : "FCFA") + "</span></div></label>" +
          '<label class="field"><span>Montant minimum de commande</span><div class="input-suffix"><input class="input num" type="number" min="0" step="1000" name="minOrder" value="' + (p.minOrder || "") + '" placeholder="0"><span>FCFA</span></div></label>' +
          '<label class="field"><span>Nombre d\'utilisations maximum</span><input class="input num" type="number" min="0" name="limit" value="' + (p.limit || "") + '" placeholder="Illimité"></label>' +
          '<label class="field"><span>Début</span><input class="input" type="date" name="starts" value="' + dIn(p.starts) + '"></label>' +
          '<label class="field"><span>Fin (facultatif)</span><input class="input" type="date" name="ends" value="' + dIn(p.ends) + '"></label>' +
          '<label class="switch full"><input type="checkbox" name="active"' + (p.active ? " checked" : "") + "><i></i><b>Code actif</b></label>" +
          '<p class="err full" data-err></p></form>',
        actions: [{ label: "Annuler", close: true }, { label: isNew ? "Créer le code" : "Enregistrer", tone: "primary", onClick: function (mm) {
          var f = $("form", mm.el), g = function (n) { return f.elements[n].value; }, err = $("[data-err]", mm.el);
          var code = (isNew ? g("code") : p.code).trim().toUpperCase().replace(/\s+/g, "");
          if (!/^[A-Z0-9_-]{3,24}$/.test(code)) { err.textContent = "Le code doit contenir 3 à 24 lettres, chiffres, tirets ou underscores."; return; }
          if (isNew && db.promos.some(function (x) { return x.code === code; })) { err.textContent = "Ce code existe déjà."; return; }
          var type = g("type"), value = +g("value") || 0;
          if (type === "percent" && (value <= 0 || value > 90)) { err.textContent = "Le pourcentage doit être compris entre 1 et 90."; return; }
          if (type === "fixed" && value <= 0) { err.textContent = "Indiquez un montant de remise."; return; }
          var starts = g("starts") ? new Date(g("starts") + "T00:00:00").getTime() : 0, ends = g("ends") ? new Date(g("ends") + "T23:59:59").getTime() : 0;
          if (starts && ends && ends < starts) { err.textContent = "La date de fin doit être après la date de début."; return; }
          var rec = isNew ? { code: code, used: 0 } : p;
          rec.type = type; rec.value = type === "shipping" ? 0 : value; rec.minOrder = +g("minOrder") || 0; rec.limit = +g("limit") || 0; rec.starts = starts; rec.ends = ends; rec.active = f.elements.active.checked; rec.note = g("note").trim();
          if (isNew) db.promos.unshift(rec);
          RX.save(isNew ? "a créé le code promo" : "a modifié le code promo", code); mm.close(); draw(); RX.toast(isNew ? "Code " + code + " créé — il fonctionne déjà sur la boutique" : "Code enregistré");
        } }] });
      var f = $("form", m.el);
      function sync() { var t = f.elements.type.value; $("[data-valwrap]", m.el).style.visibility = t === "shipping" ? "hidden" : ""; $("[data-unit]", m.el).textContent = t === "percent" ? "%" : "FCFA"; }
      f.elements.type.addEventListener("change", sync); sync();
      var gen = $("[data-gen]", m.el); if (gen) gen.addEventListener("click", function () { var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "RLX"; for (var i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)]; f.elements.code.value = s; });
    }
  });

  /* ======================================================================
     NEWSLETTER
     ====================================================================== */
  var NS = { q: "", status: "subscribed", page: 1 };
  RX.route("/newsletter", "newsletter", function (el) {
    var db = RX.db(), w = RX.canWrite("newsletter");
    var subs = db.subscribers.filter(function (s) { return s.status === "subscribed"; }), r30 = RX.range(30), p30 = RX.range(30, 1);
    var n30 = db.subscribers.filter(function (s) { return RX.inRange(s.date, r30); }).length, n30p = db.subscribers.filter(function (s) { return RX.inRange(s.date, p30); }).length;
    var fr = subs.filter(function (s) { return s.lang === "fr"; }).length;
    // weekly sign-ups over 16 weeks
    var weeks = [], now = new Date(); now.setHours(0, 0, 0, 0);
    for (var i = 15; i >= 0; i--) { var to = now.getTime() + DAY - i * 7 * DAY, from = to - 7 * DAY; weeks.push({ from: from, n: db.subscribers.filter(function (s) { return s.date >= from && s.date < to; }).length }); }
    var src = {}; subs.forEach(function (s) { src[s.source] = (src[s.source] || 0) + 1; });
    var SRC = { home: "Page d'accueil", footer: "Pied de page", checkout: "Commande", backoffice: "Ajout manuel" };
    el.innerHTML =
      '<div class="ph"><div><h1>Newsletter</h1><p>Inscriptions reçues depuis le site (bannière de la page d\'accueil) et ajouts manuels.</p></div><div class="ph-actions">' + RX.readOnly("newsletter") +
      '<button type="button" class="btn" data-export>' + I.down + "Exporter les abonnés</button>" + (w ? '<button type="button" class="btn is-primary" data-add>' + I.plus + "Ajouter un abonné</button>" : "") + "</div></div>" +
      '<div class="grid g-4" style="margin-bottom:18px">' + RX.kpiS("Abonnés actifs", RX.num(subs.length), db.subscribers.length - subs.length + " désinscrits") + '<div class="kpi" style="min-height:0"><div class="kpi-l">Nouveaux (30 j)</div><div class="kpi-v num">' + n30 + '</div><div class="kpi-d">' + RX.delta(n30, n30p) + " vs 30 j précédents</div></div>" +
        RX.kpiS("Langue", RX.num1(subs.length ? fr / subs.length * 100 : 0) + " % FR", RX.num(subs.length - fr) + " en anglais") + RX.kpiS("Clients abonnés", db.customers.filter(function (c) { return c.newsletter; }).length, "ont aussi commandé") + "</div>" +
      '<div class="grid g-main" style="margin-bottom:18px"><div class="card"><div class="card-h"><h2>Inscriptions par semaine</h2><p>16 dernières semaines</p></div><div class="card-b"><div class="chart" id="c-nl"></div></div></div>' +
      '<div class="card"><div class="card-h"><h2>Sources</h2></div><div class="card-b">' + RX.hbars(Object.keys(src).map(function (k) { return { label: SRC[k] || k, value: src[k], color: "#c89564" }; }).sort(function (a, b) { return b.value - a.value; })) +
      '<div class="notice" style="margin-top:16px">' + I.info + "<div>Pour envoyer des campagnes, exportez la liste (CSV) vers votre outil d'e-mailing (Brevo, Mailchimp…) ou connectez-le à la boutique.</div></div></div></div></div>" +
      '<div class="card"><div class="tabs">' + [["subscribed", "Abonnés"], ["unsubscribed", "Désinscrits"], ["all", "Tous"]].map(function (s) { return '<button type="button" data-st="' + s[0] + '" aria-selected="' + (NS.status === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="Rechercher un e-mail…" data-q value="' + esc(NS.q) + '"></div></div><div data-body></div></div>';
    RX.chart.bars($("#c-nl", el), { labels: weeks.map(function (x) { return RX.dateShort(x.from); }), tipLabels: weeks.map(function (x) { return "Semaine du " + RX.date(x.from); }), values: weeks.map(function (x) { return x.n; }), color: "#c89564", name: "Inscriptions", aria: "Inscriptions par semaine" });
    function list() {
      var q = NS.q.trim().toLowerCase();
      return db.subscribers.filter(function (s) { return (NS.status === "all" || s.status === NS.status) && (!q || s.email.indexOf(q) > -1); }).sort(function (a, b) { return b.date - a.date; });
    }
    function draw() {
      var l = list(), per = 25, page = l.slice((NS.page - 1) * per, NS.page * per);
      $("[data-body]", el).innerHTML = l.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>E-mail</th><th>Inscription</th><th>Langue</th><th>Source</th><th>Statut</th><th class="r">Actions</th></tr></thead><tbody>' +
        page.map(function (s) {
          var cust = db.customers.filter(function (c) { return c.email.toLowerCase() === s.email; })[0];
          return "<tr><td><b>" + esc(s.email) + "</b>" + (cust ? ' <a class="muted" href="#/customers/' + cust.id + '" style="font-size:12px">client</a>' : "") + "</td><td>" + RX.date(s.date) + "</td><td>" + (s.lang === "en" ? "Anglais" : "Français") + "</td><td>" + esc(SRC[s.source] || s.source) + "</td><td>" + (s.status === "subscribed" ? RX.badge("ok", "Abonné") : RX.badge("muted", "Désinscrit")) + "</td>" +
            '<td class="r w0">' + (w ? '<button type="button" class="btn is-sm" data-toggle="' + esc(s.email) + '">' + (s.status === "subscribed" ? "Désinscrire" : "Réabonner") + '</button> <button type="button" class="btn is-sm is-ghost-danger" data-del="' + esc(s.email) + '" aria-label="Supprimer">' + I.trash + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" + RX.pager(l.length, NS.page, per) : RX.empty("Aucun abonné", "", I.mail);
    }
    draw();
    $("[data-q]", el).addEventListener("input", RX.debounce(function (e) { NS.q = e.target.value; NS.page = 1; draw(); }, 160));
    el.addEventListener("click", function (e) {
      var t = e.target, st = t.closest("[data-st]"); if (st) { NS.status = st.dataset.st; NS.page = 1; $$("[data-st]", el).forEach(function (b) { b.setAttribute("aria-selected", b === st ? "true" : "false"); }); draw(); return; }
      var pg = t.closest("[data-page]"); if (pg && !pg.disabled) { NS.page = +pg.dataset.page; draw(); return; }
      var tg = t.closest("[data-toggle]"); if (tg) { var s = find(tg.dataset.toggle); s.status = s.status === "subscribed" ? "unsubscribed" : "subscribed"; RX.save(s.status === "subscribed" ? "a réabonné" : "a désinscrit", s.email); draw(); return; }
      var dl = t.closest("[data-del]"); if (dl) { RX.confirm({ title: "Supprimer l'abonné", text: "Supprimer définitivement " + dl.dataset.del + " de la liste ?", ok: "Supprimer", danger: true }).then(function (ok) { if (!ok) return; db.subscribers.splice(db.subscribers.indexOf(find(dl.dataset.del)), 1); RX.save("a supprimé l'abonné", dl.dataset.del); draw(); }); return; }
      if (t.closest("[data-export]")) { RX.download("newsletter-relaxx-" + DB.dayKey(Date.now()) + ".csv", RX.csv([["E-mail", "Date d'inscription", "Langue", "Source", "Statut"]].concat(list().map(function (s) { return [s.email, RX.date(s.date), s.lang, SRC[s.source] || s.source, s.status === "subscribed" ? "abonné" : "désinscrit"]; })))); return; }
      if (t.closest("[data-add]")) {
        RX.modal({ title: "Ajouter un abonné", body: '<div class="stack"><label class="field"><span>E-mail</span><input class="input" type="email" name="email" placeholder="nom@exemple.com"></label><label class="field"><span>Langue</span><select class="select" name="lang"><option value="fr">Français</option><option value="en">Anglais</option></select></label><p class="muted" style="font-size:12.5px">N\'ajoutez que des personnes ayant donné leur accord pour recevoir la newsletter.</p><p class="err" data-err></p></div>',
          actions: [{ label: "Annuler", close: true }, { label: "Ajouter", tone: "primary", onClick: function (m) {
            var em = $("[name=email]", m.el).value.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { $("[data-err]", m.el).textContent = "Adresse e-mail invalide."; return; }
            if (find(em)) { $("[data-err]", m.el).textContent = "Cette adresse est déjà dans la liste."; return; }
            db.subscribers.push({ email: em, date: Date.now(), lang: $("[name=lang]", m.el).value, source: "backoffice", status: "subscribed" });
            RX.save("a ajouté l'abonné", em); m.close(); RX.rerender(); RX.toast("Abonné ajouté");
          } }] });
      }
    });
    function find(email) { return db.subscribers.filter(function (s) { return s.email === email; })[0]; }
  });

  /* ======================================================================
     SITE CONTENT: announcement bar + maintenance mode
     ====================================================================== */
  RX.route("/content", "content", function (el) {
    var db = RX.db(), w = RX.canWrite("content"), c = db.settings.content, a = c.announcement, m = c.maintenance, dis = w ? "" : " disabled";
    el.innerHTML =
      '<div class="ph"><div><h1>Annonce & maintenance</h1><p>Messages affichés sur toutes les pages de la boutique. Écrivez en français : la version anglaise est traduite automatiquement. Les textes et images des pages se gèrent dans <a href="#/vitrine">Vitrine du site</a>.</p></div><div class="ph-actions">' + RX.readOnly("content") + '<a class="btn" href="../index.html" target="_blank" rel="noopener">' + I.ext + "Voir le résultat</a></div></div>" +
      '<form data-form class="stack">' +
      '<div class="card"><div class="card-h"><div><h2>Barre d\'annonce</h2><p>Bandeau noir en haut du site (livraison offerte, soldes, nouvelle collection…). Les visiteurs peuvent la fermer.</p></div><label class="switch"><input type="checkbox" name="annOn"' + (a.enabled ? " checked" : "") + dis + "><i></i><b>Affichée</b></label></div>" +
        '<div class="card-b"><div class="form-grid"><label class="field full"><span>Texte</span><input class="input" name="annFr" maxlength="110" value="' + esc(a.fr) + '"' + dis + ">" + RX.enNote(a.en && a.en !== a.fr ? a.en : "") + "</label>" +
        '<label class="field full"><span>Lien (facultatif)</span><select class="select" name="annLink"' + dis + ">" + [["", "Aucun lien"], ["shop.html", "Boutique"], ["histoire.html", "Notre histoire"], ["shop.html#accessories", "Accessoires"], ["cgv.html", "Conditions générales de vente"]].map(function (l) { return '<option value="' + l[0] + '"' + (a.link === l[0] ? " selected" : "") + ">" + l[1] + "</option>"; }).join("") + "</select></label>" +
        '<div class="field full"><span>Aperçu</span><div class="ann-preview" data-prev></div></div></div></div></div>' +
      '<div class="card"><div class="card-h"><div><h2>Mode maintenance</h2><p>Remplace toute la boutique par un écran d\'attente. Les membres de l\'équipe connectés voient toujours le site.</p></div><label class="switch"><input type="checkbox" name="mOn"' + (m.enabled ? " checked" : "") + dis + "><i></i><b>Activé</b></label></div>" +
        '<div class="card-b"><div class="notice is-warn" style="margin-bottom:16px">' + I.alert + "<div>Pendant la maintenance, les clients ne peuvent ni consulter ni commander. À utiliser pendant une mise à jour importante.</div></div>" +
        '<label class="field"><span>Message</span><textarea class="textarea" name="mFr" maxlength="240"' + dis + ">" + esc(m.fr) + "</textarea>" + RX.enNote(m.en && m.en !== m.fr ? m.en : "") + "</label></div></div>" +
      (w ? '<div class="sticky-save" hidden><span>Modifications non enregistrées</span><div class="row"><button type="button" class="btn" data-reset>Annuler</button><button type="submit" class="btn is-primary">Publier sur le site</button></div></div>' : "") + "</form>";
    var f = $("[data-form]", el), bar = $(".sticky-save", el);
    function prev() { $("[data-prev]", el).textContent = f.annFr.value || "Votre message"; $("[data-prev]", el).style.opacity = f.annOn.checked ? "1" : ".35"; }
    prev();
    f.addEventListener("input", function () { RX.dirty = true; if (bar) bar.hidden = false; prev(); });
    f.addEventListener("change", function () { RX.dirty = true; if (bar) bar.hidden = false; prev(); });
    el.addEventListener("click", function (e) { if (e.target.closest("[data-reset]")) { RX.dirty = false; RX.rerender(); } });
    f.addEventListener("submit", function (e) {
      e.preventDefault(); if (!w) return;
      var go = function () {
        var annFr = f.annFr.value.trim(), mFr = f.mFr.value.trim();
        // English only for the texts changed in French (the others keep their translation)
        var todo = [], needA = annFr && (annFr !== a.fr || !a.en || a.en === a.fr), needM = mFr && (mFr !== m.fr || !m.en || m.en === m.fr);
        if (needA) todo.push(annFr); if (needM) todo.push(mFr);
        var btn = $('[type="submit"]', f); if (btn) { btn.disabled = true; btn.textContent = "Traduction en anglais…"; }
        (todo.length ? RX.translate(todo) : Promise.resolve([])).then(function (r) { publish(r, true); }, function () { publish([], false); });
        function publish(r, ok) {
        if (!ok) RX.translateFailed();
        var k = 0;
        a.enabled = f.annOn.checked; a.en = !annFr ? "" : needA ? r[k++] || annFr : a.en; a.fr = annFr; a.link = f.annLink.value;
        var wasM = m.enabled; m.enabled = f.mOn.checked; m.en = !mFr ? "" : needM ? r[k++] || mFr : m.en; m.fr = mFr;
        RX.dirty = false; RX.save(m.enabled !== wasM ? (m.enabled ? "a activé le mode maintenance" : "a désactivé le mode maintenance") : "a mis à jour les contenus du site", "Contenus");
        RX.toast("Contenus publiés sur la boutique"); RX.rerender();
        }
      };
      if (f.mOn.checked && !m.enabled) RX.confirm({ title: "Activer la maintenance", text: "La boutique sera inaccessible aux clients jusqu'à la désactivation. Continuer ?", ok: "Activer", danger: true }).then(function (ok) { if (ok) go(); });
      else go();
    });
  });
})();
