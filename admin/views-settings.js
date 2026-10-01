/* ==========================================================================
   RELAXX back office — Configuration: shipping, payments, store settings,
   team & roles, activity log
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$, DAY = 864e5;
  function saveBar() { return '<div class="sticky-save" hidden><span>Modifications non enregistrées</span><div class="row"><button type="button" class="btn" data-reset>Annuler</button><button type="submit" class="btn is-primary">Enregistrer</button></div></div>'; }
  function watch(el, form) {
    var bar = $(".sticky-save", el);
    ["input", "change"].forEach(function (ev) { form.addEventListener(ev, function () { RX.dirty = true; if (bar) bar.hidden = false; }); });
    el.addEventListener("click", function (e) { if (e.target.closest("[data-reset]")) { RX.dirty = false; RX.rerender(); } });
  }
  function money(label, name, v, dis, hint) { return '<label class="field"><span>' + label + '</span><div class="input-suffix"><input class="input num" type="number" min="0" step="500" name="' + name + '" value="' + v + '"' + dis + "><span>FCFA</span></div>" + (hint ? "<small>" + hint + "</small>" : "") + "</label>"; }

  /* ======================================================================
     SHIPPING
     ====================================================================== */
  RX.route("/shipping", "shipping", function (el) {
    var db = RX.db(), s = db.settings.shipping, w = RX.canWrite("shipping"), dis = w ? "" : " disabled";
    var r30 = RX.range(30), used = { standard: 0, express: 0 }, fees = 0;
    db.orders.forEach(function (o) { if (RX.isSale(o) && RX.inRange(o.date, r30)) { used[o.shipping.method]++; fees += o.shipping.price; } });
    el.innerHTML =
      '<div class="ph"><div><h1>Livraison</h1><p>Tarifs et délais proposés au checkout, livraison offerte et pays desservis.</p></div><div class="ph-actions">' + RX.readOnly("shipping") + "</div></div>" +
      '<div class="grid g-4" style="margin-bottom:18px">' + RX.kpiS("Livraisons standard (30 j)", used.standard, "") + RX.kpiS("Livraisons express (30 j)", used.express, RX.num1(used.standard + used.express ? used.express / (used.standard + used.express) * 100 : 0) + " % des commandes") +
        RX.kpiS("Frais encaissés (30 j)", RX.money(fees), "") + RX.kpiS("Pays desservis", s.countries.filter(function (c) { return c.enabled; }).length, "sur " + s.countries.length) + "</div>" +
      '<form data-form class="stack"><div class="grid g-2">' +
        '<div class="card"><div class="card-h"><div><h2>Livraison standard</h2><p>Proposée par défaut</p></div><label class="switch"><input type="checkbox" name="stdOn"' + (s.standard.enabled ? " checked" : "") + dis + '><i></i></label></div><div class="card-b"><div class="form-grid">' +
          money("Tarif", "stdPrice", s.standard.price, dis) + '<label class="field"><span>Délai (jours ouvrés)</span><input class="input" name="stdDays" value="' + esc(s.standard.days) + '"' + dis + "></label></div></div></div>" +
        '<div class="card"><div class="card-h"><div><h2>Livraison express</h2><p>Option payante</p></div><label class="switch"><input type="checkbox" name="expOn"' + (s.express.enabled ? " checked" : "") + dis + '><i></i></label></div><div class="card-b"><div class="form-grid">' +
          money("Tarif", "expPrice", s.express.price, dis) + '<label class="field"><span>Délai (jours ouvrés)</span><input class="input" name="expDays" value="' + esc(s.express.days) + '"' + dis + "></label></div></div></div>" +
      "</div>" +
      '<div class="card"><div class="card-h"><div><h2>Livraison standard offerte</h2><p>La livraison standard devient gratuite au-delà de ce montant (après remise).</p></div></div><div class="card-b"><div class="form-grid">' +
        money("À partir de", "freeOver", s.freeOver, dis, "Mettre 0 pour ne jamais l'offrir automatiquement.") + '<div class="field"><span>Simulation</span><div class="notice" data-sim></div></div></div></div></div>' +
      '<div class="card"><div class="card-h"><div><h2>Pays desservis</h2><p>Seuls les pays cochés apparaissent dans le formulaire de commande.</p></div>' + (w ? '<div class="row"><button type="button" class="btn is-sm" data-all="1">Tout cocher</button><button type="button" class="btn is-sm" data-all="0">Tout décocher</button></div>' : "") + '</div><div class="card-b"><div class="grid g-4" style="gap:10px">' +
        s.countries.map(function (c, i) { return '<label class="check" style="padding:10px 12px;border:1px solid var(--line)"><input type="checkbox" name="c' + i + '"' + (c.enabled ? " checked" : "") + dis + "> " + esc(c.fr) + ' <span class="muted mono" style="margin-left:auto;font-size:11px">' + c.code + "</span></label>"; }).join("") + "</div></div></div>" +
      (w ? saveBar() : "") + "</form>";
    var f = $("[data-form]", el);
    function sim() {
      var th = +f.freeOver.value || 0, ex = [45000, 85000, 120000].map(function (amt) { var std = th && amt >= th ? 0 : +f.stdPrice.value || 0; return "Panier de " + RX.money(amt) + " → standard " + (std ? RX.money(std) : "offerte") + ", express " + RX.money(+f.expPrice.value || 0); });
      $("[data-sim]", el).innerHTML = I.info + "<div>" + ex.join("<br>") + "</div>";
    }
    sim(); f.addEventListener("input", sim);
    if (w) watch(el, f);
    el.addEventListener("click", function (e) { var a = e.target.closest("[data-all]"); if (a) { $$("input[name^=c]", f).forEach(function (i) { i.checked = a.dataset.all === "1"; }); f.dispatchEvent(new Event("change")); } });
    f.addEventListener("submit", function (e) {
      e.preventDefault(); if (!w) return;
      if (!f.stdOn.checked && !f.expOn.checked) { RX.toast("Au moins un mode de livraison doit rester actif", "bad"); return; }
      if (!s.countries.some(function (c, i) { return f.elements["c" + i].checked; })) { RX.toast("Cochez au moins un pays", "bad"); return; }
      s.standard = { enabled: f.stdOn.checked, price: Math.max(0, +f.stdPrice.value || 0), days: f.stdDays.value.trim() || "2–4" };
      s.express = { enabled: f.expOn.checked, price: Math.max(0, +f.expPrice.value || 0), days: f.expDays.value.trim() || "1–2" };
      s.freeOver = Math.max(0, +f.freeOver.value || 0);
      s.countries.forEach(function (c, i) { c.enabled = f.elements["c" + i].checked; });
      RX.dirty = false; RX.save("a mis à jour les réglages de livraison", "Livraison"); RX.toast("Réglages de livraison enregistrés — appliqués au checkout"); RX.rerender();
    });
  });

  /* ======================================================================
     PAYMENTS
     ====================================================================== */
  RX.route("/payments", "payments", function (el) {
    var db = RX.db(), p = db.settings.payments, w = RX.canWrite("payments"), dis = w ? "" : " disabled";
    var r30 = RX.range(30), st = {}, tot = 0;
    db.orders.forEach(function (o) { if (RX.isSale(o) && RX.inRange(o.date, r30)) { st[o.payment.method] = (st[o.payment.method] || 0) + o.total; tot += o.total; } });
    function method(key, code, title, desc, extra) {
      return '<div class="method"><span class="method-ic">' + code + "</span><div><h3>" + title + "</h3><p>" + desc + "</p>" + (extra || "") +
        '<p style="margin-top:10px;font-size:12.5px">30 derniers jours : <b class="num">' + RX.money(st[key] || 0) + "</b> · " + RX.num1(tot ? (st[key] || 0) / tot * 100 : 0) + " % du CA</p></div>" +
        '<label class="switch"><input type="checkbox" name="' + key + '"' + (p[key].enabled ? " checked" : "") + dis + "><i></i><b>" + (p[key].enabled ? "Actif" : "Inactif") + "</b></label></div>";
    }
    el.innerHTML =
      '<div class="ph"><div><h1>Paiements</h1><p>Moyens de paiement proposés au checkout.</p></div><div class="ph-actions">' + RX.readOnly("payments") + "</div></div>" +
      '<div class="notice" style="margin-bottom:18px">' + I.shield + "<div><b>Aucun paiement réel n'est encaissé dans cette démo.</b> Pour la mise en ligne, chaque moyen doit être relié à un prestataire agréé (par exemple CinetPay, PayDunya ou Stripe pour les cartes, les API Wave et Orange Money pour le mobile money). Les numéros de carte ne sont jamais enregistrés.</div></div>" +
      '<form data-form><div class="card">' +
        method("mobilemoney", "MM", "Mobile Money", "Paiement depuis le téléphone du client, confirmé par une notification.",
          '<div class="sub">' + [["wave", "Wave"], ["orange", "Orange Money"], ["mtn", "MTN MoMo"], ["moov", "Moov Money"]].map(function (o) { return '<label class="check"><input type="checkbox" name="op-' + o[0] + '"' + (p.mobilemoney[o[0]] ? " checked" : "") + dis + "> " + o[1] + "</label>"; }).join("") + "</div>") +
        method("card", "CB", "Carte bancaire", "Visa et Mastercard, avec authentification 3-D Secure.") +
        method("cod", "COD", "Paiement à la livraison", "Le client paie en espèces au livreur. La commande reste « en attente » jusqu'à l'encaissement.",
          '<div class="sub"><label class="field" style="width:260px"><span>Montant maximum</span><div class="input-suffix"><input class="input num" type="number" min="0" step="5000" name="codMax" value="' + (p.cod.max || 0) + '"' + dis + "><span>FCFA</span></div><small>0 = sans plafond</small></label></div>") +
        method("paypal", "PP", "PayPal", "Redirection vers PayPal pour les clients à l'international.") +
        method("applepay", "AP", "Apple Pay", "Paiement en un geste sur iPhone et Mac (Safari).") +
      "</div>" + (w ? saveBar() : "") + "</form>";
    var f = $("[data-form]", el);
    if (w) watch(el, f);
    f.addEventListener("submit", function (e) {
      e.preventDefault(); if (!w) return;
      var keys = ["mobilemoney", "card", "cod", "paypal", "applepay"];
      if (!keys.some(function (k) { return f.elements[k].checked; })) { RX.toast("Au moins un moyen de paiement doit rester actif", "bad"); return; }
      keys.forEach(function (k) { p[k].enabled = f.elements[k].checked; });
      ["wave", "orange", "mtn", "moov"].forEach(function (o) { p.mobilemoney[o] = f.elements["op-" + o].checked; });
      if (p.mobilemoney.enabled && !["wave", "orange", "mtn", "moov"].some(function (o) { return p.mobilemoney[o]; })) { RX.toast("Choisissez au moins un opérateur Mobile Money", "bad"); return; }
      p.cod.max = Math.max(0, +f.codMax.value || 0);
      RX.dirty = false; RX.save("a mis à jour les moyens de paiement", "Paiements"); RX.toast("Moyens de paiement enregistrés — appliqués au checkout"); RX.rerender();
    });
  });

  /* ======================================================================
     STORE SETTINGS
     ====================================================================== */
  RX.route("/settings", "settings", function (el) {
    var db = RX.db(), s = db.settings.store, n = db.settings.notifications;
    function f(label, name, v, cls, type, hint) { return '<label class="field' + (cls ? " " + cls : "") + '"><span>' + label + '</span><input class="input" type="' + (type || "text") + '" name="' + name + '" value="' + esc(v == null ? "" : v) + '">' + (hint ? "<small>" + hint + "</small>" : "") + "</label>"; }
    var size = Math.round(JSON.stringify(db).length / 1024);
    el.innerHTML =
      '<div class="ph"><div><h1>Réglages</h1><p>Informations de la boutique, fiscalité, notifications et données.</p></div></div>' +
      '<div class="grid set-grid"><nav class="set-nav" aria-label="Sections"><a href="#s-store" class="is-on">Boutique</a><a href="#s-legal">Mentions légales & fiscalité</a><a href="#s-notif">Notifications</a><a href="#s-data">Données & sauvegarde</a></nav>' +
      '<div class="stack"><form data-form class="stack">' +
        '<div class="card" id="s-store"><div class="card-h"><h2>Boutique</h2></div><div class="card-b"><div class="form-grid">' +
          f("Nom de la boutique", "name", s.name) + f("E-mail de contact", "email", s.email, "", "email") + f("Téléphone", "phone", s.phone, "", "tel") +
          '<label class="field"><span>Pays du siège</span><select class="select" name="country">' + DB.COUNTRIES.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === s.country ? " selected" : "") + ">" + esc(c[2]) + "</option>"; }).join("") + "</select></label>" +
          f("Adresse", "address", s.address, "full", "text", "Affichée sur la page Aide (boutique, itinéraire) et dans les pages légales.") +
          f("Horaires du service client", "hours", s.hours, "full", "text", "Ex. « du lundi au samedi, de 9 h à 18 h » — affichés sur les pages Aide et CGV.") +
          f("Instagram", "instagram", s.instagram, "", "url") + f("Facebook", "facebook", s.facebook, "", "url") + f("TikTok", "tiktok", s.tiktok, "", "url") + f("YouTube", "youtube", s.youtube, "", "url") +
          '<p class="muted full" style="font-size:12.5px;margin:0">Un réseau social laissé vide n\'apparaît pas sur le site.</p>' +
          '<label class="field"><span>Devise</span><input class="input" value="Franc CFA (XOF / FCFA)" disabled><small>Prix saisis et affichés en francs CFA.</small></label>' +
        "</div></div></div>" +
        '<div class="card" id="s-legal"><div class="card-h"><div><h2>Mentions légales & fiscalité</h2><p>Reprises sur les factures et, automatiquement, dans les pages CGV, CGU et confidentialité du site. Un champ vide y reste signalé « à compléter ».</p></div></div><div class="card-b"><div class="form-grid">' +
          f("Raison sociale", "legalName", s.legalName) + f("Forme juridique", "legalForm", s.legalForm, "", "text", "Ex. SARL, SA, SAS, entreprise individuelle") +
          f("Capital social", "capital", s.capital, "", "text", "En FCFA, ex. 1 000 000") + f("N° RCCM", "rccm", s.rccm, "", "text", "Registre du commerce et du crédit mobilier") + f("N° de compte contribuable (NCC)", "ncc", s.ncc) +
          f("Directeur de la publication", "director", s.director, "", "text", "Nom et fonction") + f("Hébergeur du site", "host", s.host, "full", "text", "Nom, adresse et téléphone de l'hébergeur") +
          '<label class="field"><span>Taux de TVA</span><div class="input-suffix"><input class="input num" type="number" min="0" max="30" step="0.5" name="vat" value="' + s.vat + '"><span>%</span></div></label>' +
          '<label class="switch full"><input type="checkbox" name="vatIncluded"' + (s.vatIncluded ? " checked" : "") + "><i></i><b>Prix affichés TTC (TVA incluse)</b></label>" +
        "</div></div></div>" +
        '<div class="card" id="s-notif"><div class="card-h"><div><h2>Notifications de l\'équipe</h2><p>Alertes affichées dans le back-office (cloche) et, une fois un serveur d\'e-mails branché, envoyées à ' + esc(s.email) + ".</p></div></div><div class=\"card-b stack\" style=\"gap:14px\">" +
          [["newOrder", "Nouvelle commande"], ["lowStock", "Stock faible ou rupture"], ["newReview", "Nouvel avis à modérer"], ["dailyReport", "Rapport quotidien des ventes"]].map(function (x) { return '<label class="switch"><input type="checkbox" name="n-' + x[0] + '"' + (n[x[0]] ? " checked" : "") + "><i></i><b>" + x[1] + "</b></label>"; }).join("") +
        "</div></div>" + saveBar() + "</form>" +
      '<div class="card" id="s-data"><div class="card-h"><div><h2>Données & sauvegarde</h2><p>Base de la boutique : ' + size + (DB.remote ? " Ko enregistrés dans Supabase · " : " Ko enregistrés dans ce navigateur · ") + db.orders.length + " commandes · " + RX.products(db).length + " produits · " + db.customers.length + " clients.</p></div></div>" +
        '<div class="card-b stack" style="gap:14px"><div class="row is-wrap"><button type="button" class="btn" data-backup>' + I.down + 'Télécharger une sauvegarde (JSON)</button><label class="btn">' + I.upload + 'Restaurer une sauvegarde<input type="file" accept="application/json,.json" data-restore hidden></label></div>' +
        '<div class="hr"></div><div class="row is-wrap"><button type="button" class="btn is-ghost-danger" data-clear-demo>' + I.trash + 'Supprimer les données de démonstration</button><button type="button" class="btn is-ghost-danger" data-reset-all>' + I.refresh + "Réinitialiser toute la boutique</button></div>" +
        '<p class="muted" style="font-size:12.5px">« Supprimer les données de démonstration » retire les commandes, clients, avis, abonnés et visites d\'exemple, et garde vos produits, réglages et commandes passées sur le site.</p></div></div></div></div>';
    var form = $("[data-form]", el);
    watch(el, form);
    $$(".set-nav a", el).forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); var t = document.querySelector(a.getAttribute("href")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); $$(".set-nav a", el).forEach(function (x) { x.classList.toggle("is-on", x === a); }); }); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var g = function (k) { return form.elements[k].value.trim(); };
      if (!g("name") || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(g("email"))) { RX.toast("Nom de boutique et e-mail valides obligatoires", "bad"); return; }
      var badUrl = ["instagram", "facebook", "tiktok", "youtube"].filter(function (k) { return g(k) && !/^https?:\/\//.test(g(k)); })[0];
      if (badUrl) { RX.toast("Le lien " + badUrl + " doit commencer par https://", "bad"); return; }
      ["name", "email", "phone", "address", "hours", "instagram", "facebook", "tiktok", "youtube", "legalName", "legalForm", "capital", "rccm", "ncc", "director", "host"].forEach(function (k) { s[k] = g(k); });
      s.country = form.elements.country.value; s.vat = Math.max(0, +form.elements.vat.value || 0); s.vatIncluded = form.elements.vatIncluded.checked;
      Object.keys(n).forEach(function (k) { n[k] = form.elements["n-" + k].checked; });
      RX.dirty = false; RX.save("a mis à jour les réglages de la boutique", "Réglages"); RX.toast("Réglages enregistrés"); RX.rerender();
    });
    el.addEventListener("click", function (e) {
      if (e.target.closest("[data-backup]")) { RX.download("sauvegarde-relaxx-" + DB.dayKey(Date.now()) + ".json", JSON.stringify(RX.db(), null, 1), "application/json"); RX.log("a téléchargé une sauvegarde"); return; }
      if (e.target.closest("[data-clear-demo]")) {
        RX.confirm({ title: "Supprimer les données de démonstration", html: "Les <b>commandes, clients, avis, abonnés et statistiques de visite d'exemple</b> seront supprimés. Vos produits, réglages, codes promo et les commandes passées sur le site sont conservés.", ok: "Supprimer les données de démo", danger: true }).then(function (ok) {
          if (!ok) return;
          var d = RX.db(), keepCust = {};
          d.orders = d.orders.filter(function (o) { return o.source !== "demo"; });
          d.orders.forEach(function (o) { keepCust[o.customerId] = 1; });
          d.customers = d.customers.filter(function (c) { return keepCust[c.id]; });
          d.reviews = d.reviews.filter(function (r) { return r.source !== "demo"; });
          d.subscribers = d.subscribers.filter(function (s) { return s.source === "home" && s.date > d.createdAt || s.source === "backoffice"; });
          d.traffic = {}; d.promos.forEach(function (p) { p.used = d.orders.filter(function (o) { return o.promo === p.code; }).length; });
          d.demo = false;
          RX.save("a supprimé les données de démonstration"); RX.toast("Données de démonstration supprimées"); RX.rerender();
        });
      }
      if (e.target.closest("[data-reset-all]")) {
        RX.confirm({ title: "Réinitialiser la boutique", html: "Toutes les données (produits, commandes, réglages, équipe…) reviennent à l'état de démonstration d'origine. <b>Téléchargez une sauvegarde avant.</b>", ok: "Tout réinitialiser", danger: true }).then(function (ok) {
          if (!ok) return; DB.reset();
          if (DB.remote) { RX.toast("Réinitialisation en cours…"); DB.flush().then(function () { location.hash = "#/"; location.reload(); }); return; }
          RX.toast("Boutique réinitialisée"); sessionStorage.removeItem("relaxx-admin-session"); location.hash = "#/"; location.reload();
        });
      }
    });
    $("[data-restore]", el).addEventListener("change", function (e) {
      var file = e.target.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        var data; try { data = JSON.parse(rd.result); } catch (err) { RX.toast("Fichier illisible", "bad"); return; }
        if (!data || !data.products || !data.orders || !data.settings) { RX.toast("Ce fichier n'est pas une sauvegarde RELAXX", "bad"); return; }
        RX.confirm({ title: "Restaurer la sauvegarde", text: "Remplacer toutes les données actuelles par la sauvegarde du " + RX.date(data.createdAt || Date.now()) + " (" + data.orders.length + " commandes, " + data.products.length + " produits) ?", ok: "Restaurer", danger: true }).then(function (ok) {
          if (!ok) return;
          if (DB.remote) {
            data.users = RX.db().users; // the team stays as it is in Supabase
            DB.adopt(data); RX.log("a restauré une sauvegarde"); RX.toast("Restauration envoyée à Supabase");
            DB.flush().then(function () { RX.rerender(); }); return;
          }
          localStorage.setItem(DB.KEY, JSON.stringify(data)); DB.reload(); RX.log("a restauré une sauvegarde"); RX.toast("Sauvegarde restaurée"); RX.rerender();
        });
      };
      rd.readAsText(file); e.target.value = "";
    });
  });

  /* ======================================================================
     TEAM & ROLES
     ====================================================================== */
  RX.route("/users", "users", function (el) {
    var db = RX.db();
    function draw() {
      el.innerHTML =
        '<div class="ph"><div><h1>Équipe & rôles</h1><p>Comptes ayant accès au back-office et leurs permissions.</p></div><div class="ph-actions"><button type="button" class="btn is-primary" data-add>' + I.plus + "Ajouter un membre</button></div></div>" +
        '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th>Membre</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th class="r">Actions</th></tr></thead><tbody>' +
        db.users.map(function (u) {
          var me = u.id === RX.user.id;
          return '<tr><td><div class="cell"><span class="avatar">' + RX.initials(u.name) + '</span><div class="cell-txt"><b>' + esc(u.name) + (me ? ' <span class="chip" style="height:20px">vous</span>' : "") + "</b><small>" + esc(u.email) + "</small></div></div></td>" +
            '<td><select class="select" data-role="' + u.id + '" style="width:auto"' + (me ? " disabled" : "") + ">" + Object.keys(RX.ROLES).map(function (r) { return '<option value="' + r + '"' + (u.role === r ? " selected" : "") + ">" + RX.ROLES[r].label + "</option>"; }).join("") + "</select></td>" +
            "<td>" + (!u.active ? RX.badge("muted", "Désactivé") : DB.remote ? (u.lastLogin ? RX.badge("ok", "Actif") : RX.badge("warn", "Jamais connecté")) : !u.passHash ? RX.badge("warn", "Invitation en attente") : RX.badge("ok", "Actif")) + "</td><td>" + (u.lastLogin ? RX.rel(u.lastLogin) : '<span class="faint">Jamais</span>') + "</td>" +
            '<td class="r w0">' + (me ? "" : (DB.remote ? "" : '<button type="button" class="btn is-sm" data-pass="' + u.id + '">' + I.key + (u.passHash ? "Nouveau mot de passe" : "Définir le mot de passe") + "</button> ") + '<button type="button" class="btn is-sm" data-active="' + u.id + '">' + (u.active ? "Désactiver" : "Réactiver") + '</button> <button type="button" class="btn is-sm is-ghost-danger" data-del="' + u.id + '" aria-label="Supprimer">' + I.trash + "</button>") + "</td></tr>";
        }).join("") + "</tbody></table></div></div>" +
        (DB.remote ? '<div class="notice" style="margin-top:18px">' + I.info + "<div>" + loginHelp() + "</div></div>" : "") +
        '<div class="card" style="margin-top:18px"><div class="card-h"><div><h2>Permissions par rôle</h2><p>M = modification · L = lecture seule · — = pas d\'accès</p></div></div><div class="table-wrap"><table class="t perm-t"><thead><tr><th>Section</th>' + Object.keys(RX.ROLES).map(function (r) { return "<th>" + RX.ROLES[r].label + "</th>"; }).join("") + "</tr></thead><tbody>" +
        Object.keys(RX.PERMS).map(function (k) { return "<tr><td>" + RX.SECTION_LABELS[k] + "</td>" + Object.keys(RX.ROLES).map(function (r) { var v = RX.PERMS[k][r]; return "<td>" + (v === "w" ? '<span class="yes">M</span>' : v === "r" ? '<span class="part">L</span>' : '<span class="no">—</span>') + "</td>"; }).join("") + "</tr>"; }).join("") +
        '</tbody></table></div><div class="card-b" style="border-top:1px solid var(--line)"><div class="grid g-4" style="gap:12px">' + Object.keys(RX.ROLES).map(function (r) { return '<div><b>' + RX.ROLES[r].label + '</b><p class="muted" style="font-size:12.5px;margin-top:4px">' + RX.ROLES[r].desc + "</p></div>"; }).join("") + "</div></div></div>";
    }
    draw();
    function byId(id) { return db.users.filter(function (u) { return u.id === id; })[0]; }
    // Supabase: e-mail + password of each member are created in Authentication, with the same address as here
    function loginHelp(email) {
      return '<div class="stack" style="gap:8px;line-height:1.6"><p><b>Connexion des membres.</b> Le rôle se règle ici ; l\'identifiant et le mot de passe se créent dans Supabase : <b>Authentication → Users → Add user → Create new user</b>, avec ' +
        (email ? "l'adresse <b>" + esc(email) + "</b>" : "la même adresse e-mail") + ", un mot de passe et la case « Auto Confirm User » cochée. Communiquez ensuite le mot de passe au membre par un canal sûr ; il pourra le changer depuis son profil.</p>" +
        '<p class="muted" style="font-size:12.5px">Désactiver ou supprimer un membre ici lui retire aussitôt l\'accès aux données, même s\'il garde son identifiant.</p></div>';
    }
    function passModal(u, title) {
      RX.modal({ title: title, body: '<div class="stack"><p class="muted">Communiquez ce mot de passe à ' + esc(u.name) + " par un canal sûr ; il pourra le changer depuis son profil.</p>" +
        '<label class="field"><span>Mot de passe</span><div class="row"><input class="input mono" name="p" autocomplete="new-password"><button type="button" class="btn" data-genp>Générer</button></div><small>10 caractères minimum, avec au moins un chiffre.</small></label><p class="err" data-err></p></div>',
        actions: [{ label: "Annuler", close: true }, { label: "Enregistrer", tone: "primary", onClick: function (m) {
          var v = $("[name=p]", m.el).value;
          if (v.length < 10 || !/\d/.test(v)) { $("[data-err]", m.el).textContent = "10 caractères minimum, dont au moins un chiffre."; return; }
          RX.hashPass(v).then(function (h) { u.passHash = h; RX.save("a défini le mot de passe de", u.name); m.close(); draw(); RX.toast("Mot de passe enregistré"); });
        } }] });
      setTimeout(function () {
        var b = $("[data-genp]"); if (b) b.addEventListener("click", function () { var a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = ""; var r = new Uint32Array(14); crypto.getRandomValues(r); for (var i = 0; i < 14; i++) s += a[r[i] % a.length]; $("[name=p]").value = s + (/\d/.test(s) ? "" : "7"); });
      }, 80);
    }
    el.addEventListener("change", function (e) {
      var s = e.target.closest("[data-role]"); if (!s) return;
      var u = byId(s.dataset.role); u.role = s.value; RX.save("a donné le rôle « " + RX.ROLES[u.role].label + " » à", u.name); RX.toast(u.name + " : " + RX.ROLES[u.role].label);
    });
    el.addEventListener("click", function (e) {
      var t = e.target;
      var ps = t.closest("[data-pass]"); if (ps) { passModal(byId(ps.dataset.pass), "Mot de passe de " + byId(ps.dataset.pass).name); return; }
      var ac = t.closest("[data-active]"); if (ac) { var u = byId(ac.dataset.active); u.active = !u.active; RX.save(u.active ? "a réactivé le compte de" : "a désactivé le compte de", u.name); draw(); return; }
      var dl = t.closest("[data-del]"); if (dl) { var ud = byId(dl.dataset.del); RX.confirm({ title: "Supprimer le compte", text: "Supprimer l'accès de " + ud.name + " au back-office ?", ok: "Supprimer", danger: true }).then(function (ok) { if (!ok) return; db.users.splice(db.users.indexOf(ud), 1); RX.save("a supprimé le compte de", ud.name); draw(); }); return; }
      if (t.closest("[data-add]")) {
        RX.modal({ title: "Ajouter un membre", body: '<div class="stack"><label class="field"><span>Nom complet</span><input class="input" name="name"></label><label class="field"><span>E-mail professionnel</span><input class="input" type="email" name="email"></label>' +
          '<label class="field"><span>Rôle</span><select class="select" name="role">' + Object.keys(RX.ROLES).map(function (r) { return '<option value="' + r + '"' + (r === "support" ? " selected" : "") + ">" + RX.ROLES[r].label + " — " + RX.ROLES[r].desc + "</option>"; }).join("") + '</select></label><p class="err" data-err></p></div>',
          actions: [{ label: "Annuler", close: true }, { label: "Ajouter", tone: "primary", onClick: function (m) {
            var name = $("[name=name]", m.el).value.trim(), email = $("[name=email]", m.el).value.trim().toLowerCase();
            if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $("[data-err]", m.el).textContent = "Nom et e-mail valides obligatoires."; return; }
            if (db.users.some(function (u) { return u.email === email; })) { $("[data-err]", m.el).textContent = "Ce membre existe déjà."; return; }
            var u = { id: DB.uid("u"), name: name, email: email, role: $("[name=role]", m.el).value, passHash: "", active: true, createdAt: Date.now(), lastLogin: 0 };
            db.users.push(u); RX.save("a ajouté le membre", name); m.close(); draw();
            if (DB.remote) { RX.modal({ title: "Créer l'accès de " + name, body: loginHelp(email) }); return; }
            passModal(u, "Mot de passe de " + name);
          } }] });
      }
    });
  });

  /* ======================================================================
     ACTIVITY LOG
     ====================================================================== */
  var AS = { q: "", user: "" };
  RX.route("/activity", "activity", function (el) {
    var db = RX.db(), users = {};
    db.activity.forEach(function (a) { users[a.user] = 1; });
    el.innerHTML =
      '<div class="ph"><div><h1>Journal d\'activité</h1><p>Actions de l\'équipe et événements de la boutique (400 dernières entrées).</p></div><div class="ph-actions"><button type="button" class="btn" data-export>' + I.down + "Exporter</button></div></div>" +
      (RX.dayHistory ? '<div class="card" style="margin-bottom:18px"><div class="card-h"><div><h2>Historique de la journée</h2><p>Commandes, changements de statut, avis, inscriptions et actions de l\'équipe.</p></div><input class="input" type="date" data-hday aria-label="Jour affiché" style="width:auto" value="' + DB.dayKey(Date.now()) + '" max="' + DB.dayKey(Date.now()) + '"></div><div data-hbody></div></div>' : "") +
      '<div class="card"><div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="Rechercher une action, un produit, une commande…" data-q value="' + esc(AS.q) + '"></div>' +
      '<select class="select" data-user aria-label="Auteur"><option value="">Tous les auteurs</option>' + Object.keys(users).map(function (u) { return '<option' + (AS.user === u ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("") + "</select></div><div data-body></div></div>";
    function list() { var q = AS.q.trim().toLowerCase(); return db.activity.filter(function (a) { return (!AS.user || a.user === AS.user) && (!q || (a.user + " " + a.action + " " + a.target).toLowerCase().indexOf(q) > -1); }); }
    function draw() {
      var l = list(), day = "";
      $("[data-body]", el).innerHTML = l.length ? '<ul class="list">' + l.map(function (a) {
        var d = RX.date(a.t), head = d !== day ? '<li style="background:var(--surface-2);padding:8px 18px;font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">' + d + "</li>" : ""; day = d;
        var link = /RX-\d+/.exec(a.target || "");
        return head + '<li><span class="avatar" style="width:30px;height:30px;font-size:11px;' + (a.user === "Boutique en ligne" ? "background:var(--ink);color:var(--ink-text)" : "") + '">' + (a.user === "Boutique en ligne" ? "RX" : RX.initials(a.user)) + '</span><div class="grow"><b>' + esc(a.user) + "</b> " + esc(a.action) + (a.target ? " <b>" + (link ? '<a href="#/orders/' + link[0] + '">' + esc(a.target) + "</a>" : esc(a.target)) + "</b>" : "") + '</div><span class="muted mono" style="font-size:12px">' + RX.time(a.t) + "</span></li>";
      }).join("") + "</ul>" : RX.empty("Aucune activité", "", I.list);
    }
    draw();
    // history of the chosen day (today when the page opens)
    function history() { var hb = $("[data-hbody]", el), hd = $("[data-hday]", el); if (hb) hb.innerHTML = RX.dayHistory(db, RX.period({ d: hd.value }, "today").range); }
    history();
    if ($("[data-hday]", el)) $("[data-hday]", el).addEventListener("change", history);
    $("[data-q]", el).addEventListener("input", RX.debounce(function (e) { AS.q = e.target.value; draw(); }, 160));
    $("[data-user]", el).addEventListener("change", function (e) { AS.user = e.target.value; draw(); });
    // errors met in the browser by the visitors and the team (Supabase only), loaded on demand
    if (DB.remote) {
      var ec = document.createElement("div"); ec.className = "card"; ec.style.marginTop = "18px";
      ec.innerHTML = '<div class="card-h"><div><h2>Erreurs du site</h2><p>Erreurs rencontrées dans le navigateur par les visiteurs et l\'équipe (30 derniers jours, 200 dernières).</p></div><button type="button" class="btn is-sm" data-errs>Afficher</button></div><div data-errs-body></div>';
      el.appendChild(ec);
      $("[data-errs]", ec).addEventListener("click", function (e) {
        var btn = e.currentTarget, body = $("[data-errs-body]", ec); btn.disabled = true;
        DB.rpc("rx_error_list").then(function (rows) {
          btn.disabled = false; btn.textContent = "Actualiser"; rows = rows || [];
          body.innerHTML = rows.length ? '<ul class="list">' + rows.map(function (r) {
            return '<li><div class="grow"><b>' + esc(r.msg) + '</b><br><small class="muted">' + esc(RX.date(r.t) + " · " + RX.time(r.t) + " · " + (r.page || "") + (r.src ? " · " + String(r.src).split("/").pop() + (r.line ? ":" + r.line : "") : "")) + '</small><br><small class="muted">' + esc(r.ua || "") + "</small></div></li>";
          }).join("") + "</ul>" : RX.empty("Aucune erreur enregistrée", "", I.list);
        }, function () { btn.disabled = false; body.innerHTML = RX.empty("Lecture impossible", "Vérifiez que supabase/schema.sql a été exécuté.", I.alert); });
      });
    }
    el.addEventListener("click", function (e) { if (e.target.closest("[data-export]")) RX.download("journal-relaxx-" + DB.dayKey(Date.now()) + ".csv", RX.csv([["Date", "Heure", "Auteur", "Action", "Objet"]].concat(list().map(function (a) { return [RX.date(a.t), RX.time(a.t), a.user, a.action, a.target]; })))); });
  });
})();
