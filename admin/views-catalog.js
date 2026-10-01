/* ==========================================================================
   RELAXX back office — Catalogue: products, product editor, inventory,
   categories, reviews moderation
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$, DAY = 864e5;
  // every size used by the products: the standard scale first, then the sizes typed freely, then the single size
  function allSizes(db) {
    var seen = {}, out = [];
    RX.products(db).forEach(function (p) { DB.sizesFor(p).forEach(function (z) { seen[z] = 1; }); });
    DB.SIZES.forEach(function (z) { if (seen[z]) { out.push(z); delete seen[z]; } });
    Object.keys(seen).forEach(function (z) { if (z !== "One size") out.push(z); });
    return out.concat(["One size"]);
  }
  function stdSizes(db) { return allSizes(db).filter(function (z) { return z !== "One size"; }); }
  function catLabel(db, key) { var c = db.categories.filter(function (x) { return x.key === key; })[0]; return c ? (c.labelFr || c.label) : key; }
  function sold30(db) {
    var r = RX.range(30), m = {};
    db.orders.forEach(function (o) { if (RX.isSale(o) && RX.inRange(o.date, r)) o.items.forEach(function (i) { m[i.pid] = (m[i.pid] || 0) + i.q; }); });
    return m;
  }
  function storeUrl(p) { return "../product.html?id=" + p.id; }

  /* ======================================================================
     PRODUCTS
     ====================================================================== */
  var PS = { q: "", cat: "", status: "", stock: "", sort: { key: "id", dir: 1 }, sel: {} };
  RX.route("/products", "products", function (el) {
    var db = RX.db(), w = RX.canWrite("products"), s30 = sold30(db);
    var n = { active: 0, draft: 0, archived: 0 }; RX.products(db).forEach(function (p) { n[p.status]++; });
    el.innerHTML =
      '<div class="ph"><div><h1>Produits</h1><p>' + RX.products(db).length + " produits · " + n.active + " en ligne · " + n.draft + " brouillon" + (n.draft > 1 ? "s" : "") + " · " + n.archived + " archivé" + (n.archived > 1 ? "s" : "") + "</p></div>" +
      '<div class="ph-actions">' + RX.readOnly("products") + '<button type="button" class="btn" data-export>' + I.down + "Exporter</button>" + (w ? '<a class="btn is-primary" href="#/products/new">' + I.plus + "Nouveau produit</a>" : "") + "</div></div>" +
      '<div class="card"><div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="Nom, référence (SKU)…" data-q value="' + esc(PS.q) + '" aria-label="Rechercher"></div>' +
      '<select class="select" data-f="cat" aria-label="Catégorie"><option value="">Toutes les catégories</option>' + db.categories.map(function (c) { return '<option value="' + c.key + '"' + (PS.cat === c.key ? " selected" : "") + ">" + esc(c.labelFr || c.label) + "</option>"; }).join("") + "</select>" +
      '<select class="select" data-f="status" aria-label="Statut"><option value="">Tous les statuts</option>' + Object.keys(RX.PSTATUS).map(function (k) { return '<option value="' + k + '"' + (PS.status === k ? " selected" : "") + ">" + RX.PSTATUS[k].label + "</option>"; }).join("") + "</select>" +
      '<select class="select" data-f="stock" aria-label="Stock"><option value="">Tout le stock</option><option value="ok"' + (PS.stock === "ok" ? " selected" : "") + '>En stock</option><option value="low"' + (PS.stock === "low" ? " selected" : "") + '>Stock faible</option><option value="out"' + (PS.stock === "out" ? " selected" : "") + ">Rupture</option></select></div>" +
      '<div class="bulk" hidden><b></b>' + (w ? '<button type="button" class="btn is-sm" data-bulk="active">Mettre en ligne</button><button type="button" class="btn is-sm" data-bulk="draft">Passer en brouillon</button><button type="button" class="btn is-sm" data-bulk="archived">Archiver</button><button type="button" class="btn is-sm" data-bulk-sale>Appliquer une remise…</button><button type="button" class="btn is-sm" data-bulk-unsale>Retirer la remise</button>' : "") +
      '<button type="button" class="link" data-bulk-clear style="margin-left:auto">Désélectionner</button></div><div data-body></div></div>';

    function list() {
      var db = RX.db(), q = PS.q.trim().toLowerCase();
      var l = RX.products(db).filter(function (p) {
        if (PS.cat && p.cat !== PS.cat) return false;
        if (PS.status && p.status !== PS.status) return false;
        if (PS.stock && RX.lowStock(p) !== PS.stock) return false;
        if (q && (p.name + " " + p.nameFr + " " + p.sku).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      var k = PS.sort.key, d = PS.sort.dir;
      l.sort(function (a, b) {
        var va = k === "stock" ? RX.stock(a) : k === "sold" ? (s30[a.id] || 0) : k === "name" ? (a.nameFr || a.name) : a[k];
        var vb = k === "stock" ? RX.stock(b) : k === "sold" ? (s30[b.id] || 0) : k === "name" ? (b.nameFr || b.name) : b[k];
        return (va > vb ? 1 : va < vb ? -1 : 0) * d;
      });
      return l;
    }
    function draw() {
      var db = RX.db(), l = list();
      $("[data-body]", el).innerHTML = l.length ? '<div class="table-wrap"><table class="t"><thead><tr>' + (w ? '<th class="w0"><input type="checkbox" data-all aria-label="Tout sélectionner"></th>' : "") +
        RX.th("Produit", "name", PS.sort) + "<th>Catégorie</th>" + RX.th("Prix", "price", PS.sort, "r") + RX.th("Stock", "stock", PS.sort, "r") + RX.th("Vendus 30 j", "sold", PS.sort, "r") + "<th>Statut</th><th class=\"r\">Actions</th></tr></thead><tbody>" +
        l.map(function (p) {
          var on = PS.sel[p.id], tag = p.tag ? ' <span class="badge is-plain t-muted" style="height:18px;font-size:10.5px">' + esc(RX.TAGS[p.tag] || p.tag) + "</span>" : "";
          return '<tr class="is-link' + (on ? " is-sel" : "") + '" data-href="#/products/' + p.id + '">' + (w ? '<td class="w0"><input type="checkbox" data-sel="' + p.id + '"' + (on ? " checked" : "") + ' aria-label="Sélectionner"></td>' : "") +
            '<td><div class="cell"><img class="thumb" alt="" loading="lazy" src="' + RX.img(p.img, 120) + '"><div class="cell-txt"><b>' + esc(p.nameFr || p.name) + tag + '</b><small class="mono">' + esc(p.sku) + " · " + esc(p.name) + "</small></div></div></td>" +
            "<td>" + esc(catLabel(db, p.cat)) + '</td><td class="r num"><b>' + RX.money(p.price) + "</b>" + (p.compare ? '<br><s class="muted" style="font-size:12px">' + RX.money(p.compare) + "</s>" : "") + "</td>" +
            '<td class="r">' + RX.stockPill(p) + '</td><td class="r num">' + (s30[p.id] || 0) + "</td><td>" + RX.badge(RX.PSTATUS[p.status].tone, RX.PSTATUS[p.status].label) + "</td>" +
            '<td class="r w0"><a class="btn is-sm" href="' + storeUrl(p) + '" target="_blank" rel="noopener" title="Voir sur la boutique" data-stop>' + I.ext + "</a>" + (w ? ' <button type="button" class="btn is-sm" data-dup="' + p.id + '" title="Dupliquer">' + I.copy + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" : RX.empty("Aucun produit", "Aucun produit ne correspond à ces critères.", I.tag);
      var nsel = Object.keys(PS.sel).length, bulk = $(".bulk", el); bulk.hidden = !nsel; $("b", bulk).textContent = nsel + " produit" + (nsel > 1 ? "s" : "") + " sélectionné" + (nsel > 1 ? "s" : "");
      el._l = l;
    }
    draw();
    $("[data-q]", el).addEventListener("input", RX.debounce(function (e) { PS.q = e.target.value; draw(); }, 160));
    $$("[data-f]", el).forEach(function (s) { s.addEventListener("change", function () { PS[s.dataset.f] = s.value; draw(); }); });
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-stop]")) return;
      var sh = t.closest("th[data-sort]"); if (sh) { var key = sh.dataset.sort; PS.sort = { key: key, dir: PS.sort.key === key ? -PS.sort.dir : 1 }; draw(); return; }
      if (t.matches("[data-all]")) { el._l.forEach(function (p) { if (t.checked) PS.sel[p.id] = 1; else delete PS.sel[p.id]; }); draw(); return; }
      if (t.matches("[data-sel]")) { if (t.checked) PS.sel[t.dataset.sel] = 1; else delete PS.sel[t.dataset.sel]; draw(); return; }
      if (t.closest("td.w0 input")) return;
      if (t.closest("[data-bulk-clear]")) { PS.sel = {}; draw(); return; }
      var db = RX.db(), ids = Object.keys(PS.sel).map(Number);
      var bk = t.closest("[data-bulk]");
      if (bk) { ids.forEach(function (id) { db.products[id].status = bk.dataset.bulk; }); RX.save("a changé le statut de " + ids.length + " produit(s) en", RX.PSTATUS[bk.dataset.bulk].label); PS.sel = {}; draw(); RX.toast(ids.length + " produit(s) mis à jour"); return; }
      if (t.closest("[data-bulk-sale]")) {
        RX.modal({ title: "Appliquer une remise", body: '<p class="muted" style="margin-bottom:16px">Le prix actuel devient le prix barré et l\'étiquette « Promo » est ajoutée. Les prix sont arrondis à 500 FCFA.</p><label class="field"><span>Remise</span><div class="input-suffix"><input class="input num" type="number" name="pct" min="5" max="90" value="20"><span>%</span></div></label>',
          actions: [{ label: "Annuler", close: true }, { label: "Appliquer à " + ids.length + " produit(s)", tone: "primary", onClick: function (m) {
            var pct = Math.min(90, Math.max(1, +$("[name=pct]", m.el).value || 0));
            ids.forEach(function (id) { var p = db.products[id], base = p.compare || p.price; p.compare = base; p.price = Math.round(base * (1 - pct / 100) / 500) * 500; p.tag = "On Sale"; });
            RX.save("a appliqué une remise de " + pct + " % à " + ids.length + " produit(s)"); PS.sel = {}; m.close(); draw(); RX.toast("Remise appliquée");
          } }] });
        return;
      }
      if (t.closest("[data-bulk-unsale]")) {
        ids.forEach(function (id) { var p = db.products[id]; if (p.compare) { p.price = p.compare; p.compare = 0; } if (p.tag === "On Sale") p.tag = ""; });
        RX.save("a retiré la remise de " + ids.length + " produit(s)"); PS.sel = {}; draw(); RX.toast("Prix d'origine rétablis"); return;
      }
      var dup = t.closest("[data-dup]");
      if (dup) {
        var src = db.products[+dup.dataset.dup], copy = JSON.parse(JSON.stringify(src));
        copy.id = db.products.length; copy.name += " (copy)"; copy.nameFr += " (copie)"; copy.status = "draft"; copy.createdAt = Date.now();
        copy.sku = src.sku.replace(/-\d+$/, "") + "-" + ("00" + (copy.id + 1)).slice(-3); Object.keys(copy.stock).forEach(function (k) { copy.stock[k] = 0; }); Object.keys(copy.vstock || {}).forEach(function (c) { Object.keys(copy.vstock[c]).forEach(function (k) { copy.vstock[c][k] = 0; }); });
        db.products.push(copy); RX.save("a dupliqué le produit", src.nameFr || src.name); location.hash = "#/products/" + copy.id; return;
      }
      if (t.closest("[data-export]")) {
        var rows = [["ID", "SKU", "Nom (EN)", "Nom (FR)", "Catégorie", "Prix", "Prix barré", "Coût", "Étiquette", "Statut", "Stock total"].concat(stdSizes(db)).concat(["Taille unique"])];
        el._l.forEach(function (p) { rows.push([p.id, p.sku, p.name, p.nameFr, catLabel(db, p.cat), p.price, p.compare || "", p.cost || "", RX.TAGS[p.tag] || p.tag, RX.PSTATUS[p.status].label, RX.stock(p)].concat(stdSizes(db).map(function (s) { return p.stock[s] == null ? "" : p.stock[s]; })).concat([p.stock["One size"] == null ? "" : p.stock["One size"]])); });
        RX.download("produits-relaxx-" + DB.dayKey(Date.now()) + ".csv", RX.csv(rows)); return;
      }
      var tr = t.closest("tr[data-href]"); if (tr) location.hash = tr.dataset.href;
    });
  });

  /* ---------- product editor ---------- */
  function editor(el, params) {
    var db = RX.db(), isNew = params.id === undefined, w = RX.canWrite("products");
    var src = isNew ? null : db.products[+params.id];
    if (!isNew && (!src || src.status === "deleted")) { el.innerHTML = '<div class="card">' + RX.empty("Produit introuvable", "", I.tag) + "</div>"; return; }
    var p = isNew ? { id: db.products.length, sku: "", name: "", nameFr: "", cat: db.categories[0].key, price: 0, compare: 0, cost: 0, tag: "", img: "", status: "draft", stock: {}, desc: "", descFr: "", colors: [{ id: "noir", name: "Black", nameFr: "Noir", hex: "#141414", img: "" }], vstock: { noir: {} } } : JSON.parse(JSON.stringify(src));
    var variants = DB.hasColors(p) || isNew;
    if (!p.colors) p.colors = []; if (!p.vstock) p.vstock = {};
    // sizes of this product (the manager adds and removes them); a new product starts with the usual sizes of its category
    p.sizes = (isNew ? DB.sizesOf(p.cat) : DB.sizesFor(p)).slice();
    var sizesTouched = !isNew, szLbl = function (s) { return s === "One size" ? "Taille unique" : s; };
    var imgs = []; RX.products(db).forEach(function (x) { if (x.img && imgs.indexOf(x.img) < 0) imgs.push(x.img); });
    var ordered = db.orders.some(function (o) { return (o.items || []).some(function (i) { return i.pid === p.id; }); });
    var sold = 0, rev = 0; db.orders.forEach(function (o) { if (RX.isSale(o)) o.items.forEach(function (i) { if (i.pid === p.id) { sold += i.q; rev += i.price * i.q; } }); });
    var dis = w ? "" : " disabled";

    el.innerHTML =
      '<div class="crumb"><a href="#/products">Produits</a> / <span>' + (isNew ? "Nouveau produit" : esc(p.nameFr || p.name)) + "</span></div>" +
      '<div class="ph"><div><h1>' + (isNew ? "Nouveau produit" : esc(p.nameFr || p.name)) + "</h1><p>" + (isNew ? "Renseignez les informations puis enregistrez. Le produit reste en brouillon tant qu'il n'est pas mis en ligne." : '<span class="mono">' + esc(p.sku) + "</span> · " + sold + " vendus · " + RX.money(rev) + " de chiffre d'affaires") + "</p></div>" +
      '<div class="ph-actions">' + RX.readOnly("products") + (!isNew ? '<a class="btn" href="' + storeUrl(p) + '" target="_blank" rel="noopener">' + I.ext + "Voir sur la boutique</a>" : "") + "</div></div>" +
      '<form data-form novalidate><div class="grid g-main-wide"><div class="stack">' +
        '<div class="card"><div class="card-h"><h2>Informations</h2><p>Écrivez en français : la version anglaise du site est traduite automatiquement à l\'enregistrement.</p></div><div class="card-b"><div class="form-grid">' +
          '<label class="field full"><span>Nom du produit *</span><input class="input" name="nameFr" value="' + esc(p.nameFr) + '" required' + dis + ">" + (isNew ? "" : RX.enNote(p.name)) + "</label>" +
          '<label class="field full"><span>Description</span><textarea class="textarea" name="descFr" placeholder="Laisser vide pour utiliser la description type de la catégorie."' + dis + ">" + esc(p.descFr) + "</textarea>" + (p.descFr ? RX.enNote(p.desc) : "") + "</label>" +
        "</div></div></div>" +
        '<div class="card"><div class="card-h"><h2>Photo</h2><p>Importez une photo (ordinateur, téléphone, glisser-déposer), reprenez-en une de la médiathèque ou collez un lien.</p></div><div class="card-b"><div class="img-drop" data-img-drop><img class="img-prev" alt="Aperçu" src="' + RX.img(p.img, 400) + '">' +
          '<div class="stack" style="gap:12px">' + (w ? '<div class="row" style="flex-wrap:wrap"><button type="button" class="btn is-primary" data-img-upload>' + I.upload + "Importer ou choisir une photo</button><small class=\"muted\">ou glissez-déposez un fichier sur l'aperçu</small></div>" : "") +
          '<label class="field"><span>Adresse de l\'image</span><input class="input mono" name="img" value="' + esc(p.img) + '" placeholder="photo-1632149877166-f75d49000351 ou https://…"' + dis + "></label>" +
          '<div class="field"><span>Ou choisir une photo existante</span><div class="img-picks">' + imgs.map(function (id) { return '<button type="button" data-pick="' + esc(id) + '" aria-pressed="' + (id === p.img) + '" aria-label="Choisir cette photo"' + dis + '><img alt="" loading="lazy" src="' + RX.img(id, 110) + '"></button>'; }).join("") + "</div></div></div></div></div></div>" +
        '<div class="card"><div class="card-h"><div><h2>Photos supplémentaires</h2><p>Vignettes affichées à côté de la grande photo sur la fiche produit (autres vues, détails, porté). Jusqu\'à 8 photos ; le client en voit trois et fait défiler les autres.</p></div></div><div class="card-b" data-extras></div></div>' +
        '<div class="card"><div class="card-h"><h2>Prix</h2><p>En francs CFA, TVA ' + (db.settings.store.vatIncluded ? "incluse" : "non incluse") + " (" + db.settings.store.vat + " %).</p></div><div class=\"card-b\"><div class=\"form-grid is-3\">" +
          num("Prix de vente *", "price", p.price) + num("Prix barré (avant remise)", "compare", p.compare || "") + num("Coût d'achat", "cost", p.cost || "") +
          '</div><div class="margin-box" style="margin-top:16px" data-margin></div></div></div>' +
        '<div class="card" id="variants"><div class="card-h"><div><h2>Couleurs et stock</h2><p>Chaque couleur a son propre stock par taille. Sur la fiche produit, le client choisit la couleur ; une couleur épuisée apparaît barrée.</p></div>' +
          '<label class="switch" title="Ce produit existe en plusieurs couleurs"><input type="checkbox" data-variants' + (variants ? " checked" : "") + dis + '><i></i><b data-variants-lbl>' + (variants ? "Plusieurs couleurs" : "Couleur unique") + "</b></label></div>" +
          '<div class="card-b stack" style="gap:18px"><div data-colors></div><div data-sizes></div>' +
          '<small class="muted">Seuil d\'alerte : ' + db.settings.store.lowStock + " unités par taille (réglable dans Stock).</small></div></div>" +
      "</div><div class=\"stack\">" +
        '<div class="card"><div class="card-h"><h2>Publication</h2></div><div class="card-b stack" style="gap:14px">' +
          '<label class="field"><span>Statut</span><select class="select" name="status"' + dis + ">" + Object.keys(RX.PSTATUS).map(function (k) { return '<option value="' + k + '"' + (p.status === k ? " selected" : "") + ">" + RX.PSTATUS[k].label + "</option>"; }).join("") + "</select><small>Seuls les produits « Actif » sont visibles sur la boutique.</small></label>" +
          '<label class="field"><span>Catégorie</span><select class="select" name="cat"' + dis + ">" + db.categories.map(function (c) { return '<option value="' + c.key + '"' + (p.cat === c.key ? " selected" : "") + ">" + esc(c.labelFr || c.label) + "</option>"; }).join("") + "</select></label>" +
          '<label class="field"><span>Étiquette</span><select class="select" name="tag"' + dis + ">" + Object.keys(RX.TAGS).map(function (k) { return '<option value="' + esc(k) + '"' + (p.tag === k ? " selected" : "") + ">" + RX.TAGS[k] + "</option>"; }).join("") + "</select><small>« Épuisé » s'affiche automatiquement quand le stock est à zéro.</small></label>" +
          '<label class="field"><span>Référence (SKU)</span><input class="input mono" name="sku" value="' + esc(p.sku) + '" placeholder="Générée automatiquement"' + dis + "></label>" +
        "</div></div>" +
        '<div class="card"><div class="card-h"><h2>Aperçu boutique</h2></div><div class="card-b"><div class="preview-card" style="position:relative" data-preview></div></div></div>' +
        (!isNew && w ? '<div class="card"><div class="card-h"><h2>Zone sensible</h2></div><div class="card-b"><p class="muted" style="font-size:13px;margin-bottom:12px">Un produit déjà commandé ne peut pas être supprimé : archivez-le pour le retirer de la boutique en gardant l\'historique.</p><button type="button" class="btn is-ghost-danger is-block" data-archive>' + (p.status === "archived" ? "Restaurer en brouillon" : "Archiver le produit") + "</button>" +
          '<p class="muted" style="font-size:13px;margin:16px 0 12px">' + (ordered ? "Ce produit figure dans au moins une commande : il ne peut qu'être archivé." : "Produit ajouté par erreur ? Il n'a jamais été commandé : vous pouvez le supprimer définitivement.") + '</p><button type="button" class="btn is-ghost-danger is-block" data-delete' + (ordered ? " disabled" : "") + ">" + I.trash + "Supprimer définitivement</button></div></div>" : "") +
      "</div></div>" +
      (w ? '<div class="sticky-save"><span class="muted" data-state>' + (isNew ? "Nouveau produit" : "Aucune modification") + '</span><div class="row"><a class="btn" href="#/products">Annuler</a><button type="submit" class="btn is-primary">' + (isNew ? "Créer le produit" : "Enregistrer") + "</button></div></div>" : "") + "</form>";

    function num(label, name, v) { return '<label class="field"><span>' + label + '</span><div class="input-suffix"><input class="input num" type="number" min="0" step="500" name="' + name + '" value="' + esc(v) + '"' + dis + "><span>FCFA</span></div></label>"; }
    var form = $("[data-form]", el);
    /* ---------- colours & stock ---------- */
    var PALETTE = [["Noir", "Black", "#141414"], ["Blanc", "White", "#f4f2ec"], ["Écru", "Ecru", "#efe8da"], ["Beige", "Beige", "#d9c8a9"], ["Camel", "Camel", "#b8905e"], ["Marron", "Brown", "#5a3d2b"],
      ["Chocolat", "Chocolate", "#4a3326"], ["Gris", "Grey", "#9a9a9a"], ["Anthracite", "Charcoal", "#3c3c3c"], ["Marine", "Navy", "#1f2a44"], ["Bleu ciel", "Sky blue", "#bcd0e0"], ["Kaki", "Khaki", "#7d7a5a"],
      ["Sauge", "Sage", "#9aa58c"], ["Bordeaux", "Burgundy", "#6d1f2b"], ["Rouge", "Red", "#b3261e"], ["Rose poudré", "Dusty pink", "#e3b7b0"], ["Moutarde", "Mustard", "#c9a227"], ["Terracotta", "Terracotta", "#b5563a"]];
    function newId(name) {
      var base = DB.colorSlug(name), id = base, n = 2;
      while (p.colors.some(function (c) { return c.id === id; })) id = base + "-" + n++;
      return id;
    }
    function addColor(fr, en, hex) {
      if (p.colors.length >= 12) { RX.toast("12 couleurs au maximum par produit", "bad"); return; }
      if (fr && p.colors.some(function (c) { return (c.nameFr || "").toLowerCase() === fr.toLowerCase(); })) { RX.toast("« " + fr + " » est déjà dans la liste", "bad"); return; }
      var c = { id: newId(en || fr || "couleur"), name: en || "", nameFr: fr || "", hex: hex || "#cccccc", img: "" };
      p.colors.push(c); p.vstock[c.id] = {};
      changed(); colors(); sizes();
      if (!fr) setTimeout(function () { var i = $('[data-cfield="nameFr"][data-cid="' + c.id + '"]', el); if (i) i.focus(); }, 30);
    }
    function colors() {
      var box = $("[data-colors]", el);
      if (!variants) { box.innerHTML = ""; return; }
      box.innerHTML = '<div class="var-list">' + p.colors.map(function (c, i) {
        return '<div class="var-row" data-crow="' + c.id + '">' +
          '<label class="var-swatch" style="--c:' + esc(c.hex) + '" title="Choisir la teinte"><input type="color" data-cfield="hex" data-cid="' + c.id + '" value="' + esc(/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#cccccc") + '"' + dis + "></label>" +
          '<label class="field"><span>Nom de la couleur</span><input class="input" data-cfield="nameFr" data-cid="' + c.id + '" value="' + esc(c.nameFr) + '" placeholder="ex. Bordeaux"' + dis + ">" + (c.name ? RX.enNote(c.name) : "") + "</label>" +
          '<div class="field"><span>Photo de la couleur</span><div class="row" style="gap:8px">' +
            (c.img ? '<img class="thumb" alt="" src="' + esc(RX.img(c.img, 100)) + '">' : '<span class="var-nophoto">Photo principale</span>') +
            (w ? '<button type="button" class="btn is-sm" data-cphoto="' + c.id + '">' + (c.img ? "Changer" : I.upload + "Ajouter") + "</button>" + (c.img ? '<button type="button" class="icon-btn" style="width:32px;height:32px" data-cphoto-del="' + c.id + '" aria-label="Retirer la photo">' + I.x + "</button>" : "") : "") +
          "</div></div>" +
          (w ? '<div class="var-actions"><button type="button" class="btn is-sm" data-cmove="' + c.id + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Monter">↑</button><button type="button" class="btn is-sm" data-cmove="' + c.id + '" data-dir="1"' + (i === p.colors.length - 1 ? " disabled" : "") + ' aria-label="Descendre">↓</button>' +
            '<button type="button" class="btn is-sm is-ghost-danger" data-cdel="' + c.id + '" aria-label="Supprimer la couleur"' + (p.colors.length < 2 ? ' disabled title="Il faut au moins une couleur"' : "") + ">" + I.trash + "</button></div>" : "") +
          "</div>" +
          '<div style="padding:2px 0 16px;border-bottom:1px solid var(--line);margin-bottom:14px"><div style="font-size:12.5px;font-weight:600;margin-bottom:8px">Photos supplémentaires de « ' + esc(c.nameFr || "cette couleur") + ' »</div>' + strip(c.id, "sans photo propre, cette couleur montre les photos supplémentaires du produit") + "</div>";
      }).join("") + "</div>" +
      (w ? '<div class="var-add"><button type="button" class="btn" data-cadd>' + I.plus + "Ajouter une couleur</button></div>" : "");
    }
    // the sizes of the product: removed with the cross, added from the standard scale or typed freely (5XL, 42, 38/40…)
    function sizeBar() {
      if (!w) return "";
      var std = DB.SIZES.concat(["One size"]).filter(function (x) { return p.sizes.indexOf(x) < 0; });
      return '<div class="field" style="margin-bottom:16px"><span>Tailles du produit</span><div class="row" style="flex-wrap:wrap;gap:6px">' +
        p.sizes.map(function (x) { return '<span class="row" style="gap:2px;padding:4px 4px 4px 12px;border:1px solid var(--line);font-size:13px;font-weight:600">' + esc(szLbl(x)) + '<button type="button" class="icon-btn" style="width:24px;height:24px" data-szdel="' + esc(x) + '" aria-label="Retirer la taille ' + esc(szLbl(x)) + '"' + (p.sizes.length < 2 ? ' disabled title="Il faut au moins une taille"' : "") + ">" + I.x + "</button></span>"; }).join("") + "</div>" +
        '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:10px"><input class="input" data-sznew aria-label="Nouvelle taille" placeholder="Autre taille : 5XL, 42, 38/40…" maxlength="10" style="width:230px"><button type="button" class="btn" data-szadd>' + I.plus + "Ajouter la taille</button>" +
        std.map(function (x) { return '<button type="button" class="btn is-sm" data-szquick="' + esc(x) + '">+ ' + esc(szLbl(x)) + "</button>"; }).join("") + "</div>" +
        "<small class=\"muted\">Indiquez le stock de chaque taille ci-dessous. Une taille dont le stock est à 0 reste affichée sur la fiche produit, grisée et barrée (épuisée) ; retirez-la pour qu'elle ne soit plus proposée.</small></div>";
    }
    function addSize(v) {
      v = String(v || "").replace(/[:|"<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 10);
      if (!v) return;
      if (/^taille unique$/i.test(v)) v = "One size";
      if (p.sizes.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) { RX.toast("Cette taille existe déjà", "bad"); return; }
      if (p.sizes.length >= 16) { RX.toast("16 tailles au plus par produit", "bad"); return; }
      p.sizes.push(v);
      // standard sizes keep their usual order (XS … 4XL); the others stay where they were added
      var rank = function (x, i) { var k = DB.SIZES.indexOf(x); return k > -1 ? k : 100 + i; };
      p.sizes = p.sizes.map(function (x, i) { return [x, rank(x, i)]; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; });
      sizesTouched = true; changed(); sizes();
    }
    function delSize(v) {
      if (p.sizes.length < 2) return;
      var units = variants ? p.colors.reduce(function (t, c) { return t + (+(p.vstock[c.id] || {})[v] || 0); }, 0) : +p.stock[v] || 0;
      var go = function () { p.sizes = p.sizes.filter(function (x) { return x !== v; }); delete p.stock[v]; Object.keys(p.vstock).forEach(function (k) { delete p.vstock[k][v]; }); sizesTouched = true; changed(); sizes(); };
      if (!units) go(); else RX.confirm({ title: "Retirer la taille « " + szLbl(v) + " » ?", text: "Cette taille a encore " + units + " unité" + (units > 1 ? "s" : "") + " en stock, qui seront retirées du stock.", ok: "Retirer", danger: true }).then(function (ok) { if (ok) go(); });
    }
    function cls(v) { return v === 0 ? " is-zero" : v <= db.settings.store.lowStock ? " is-low" : ""; }
    function sizes() {
      var list = p.sizes, lbl = function (s) { return s === "One size" ? "Taille unique" : s; };
      if (!variants) {
        $("[data-sizes]", el).innerHTML = sizeBar() + '<div class="sizes">' + list.map(function (s) { var v = p.stock[s] || 0; return '<label class="size-in"><span>' + lbl(s) + '</span><input class="inv-in' + cls(v) + '" style="width:100%" type="number" min="0" data-size="' + s + '" value="' + v + '"' + dis + "></label>"; }).join("") +
          '<div class="size-in"><span>Total</span><b class="num" style="height:34px;display:flex;align-items:center;font-size:16px" data-total></b></div></div>';
        total(); return;
      }
      $("[data-sizes]", el).innerHTML = sizeBar() + '<div class="table-wrap"><table class="t var-stock"><thead><tr><th>Stock</th>' + list.map(function (s) { return '<th class="c">' + lbl(s) + "</th>"; }).join("") + '<th class="r">Total</th></tr></thead><tbody>' +
        p.colors.map(function (c) {
          var row = p.vstock[c.id] = p.vstock[c.id] || {};
          return '<tr><td><span class="row" style="gap:8px;white-space:nowrap"><i class="var-dot" style="--c:' + esc(c.hex) + '"></i>' + esc(c.nameFr || c.name || "Sans nom") + "</span></td>" +
            list.map(function (s) { var v = +row[s] || 0; return '<td class="c"><input class="inv-in' + (v === 0 ? " is-zero" : "") + '" type="number" min="0" data-vs="' + c.id + ":" + s + '" value="' + v + '" aria-label="Stock ' + esc(c.nameFr) + " " + lbl(s) + '"' + dis + "></td>"; }).join("") +
            '<td class="r num"><b data-vt="' + c.id + '"></b></td></tr>';
        }).join("") + '</tbody><tfoot><tr><th>Total</th>' + list.map(function (s) { return '<th class="c num" data-st="' + s + '"></th>'; }).join("") + '<th class="r num" data-total></th></tr></tfoot></table></div>';
      total();
    }
    function total() {
      if (!variants) { $("[data-total]", el).textContent = $$("[data-size]", el).reduce(function (n, i) { return n + (+i.value || 0); }, 0); return; }
      var list = p.sizes, all = 0;
      p.colors.forEach(function (c) { var t = list.reduce(function (n, s) { return n + (+(p.vstock[c.id] || {})[s] || 0); }, 0); all += t; var b = $('[data-vt="' + c.id + '"]', el); if (b) b.textContent = t; });
      list.forEach(function (s) { var b = $('[data-st="' + s + '"]', el); if (b) b.textContent = p.colors.reduce(function (n, c) { return n + (+(p.vstock[c.id] || {})[s] || 0); }, 0); });
      $("[data-total]", el).textContent = all;
    }
    function changed() { RX.dirty = true; var st = $("[data-state]", el); if (st) st.textContent = "Modifications non enregistrées"; preview(); }
    function preview() {
      var price = +form.price.value || 0, comp = +form.compare.value || 0, cost = +form.cost.value || 0;
      var vat = db.settings.store.vat || 0, ht = price / (1 + vat / 100), margin = ht - cost;
      $("[data-margin]", el).innerHTML = "<div><span class=\"muted\">Prix HT</span><b class=\"num\">" + RX.money(ht) + "</b></div><div><span class=\"muted\">Marge unitaire</span><b class=\"num\">" + (cost ? RX.money(margin) : "—") + "</b></div><div><span class=\"muted\">Taux de marge</span><b class=\"num\">" + (cost && ht ? RX.num1(margin / ht * 100) + " %" : "—") + "</b></div>" + (comp && comp > price ? "<div><span class=\"muted\">Remise affichée</span><b class=\"num\">−" + Math.round((1 - price / comp) * 100) + " %</b></div>" : "");
      var tag = form.tag.value;
      $("[data-preview]", el).innerHTML = (tag ? '<span class="pc-tag">' + esc(RX.TAGS[tag]) + "</span>" : "") + '<img alt="" src="' + RX.img(form.img.value, 500) + '"><div class="pc-info"><div class="pc-name">' + esc(form.nameFr.value || "Nom du produit") + '</div><div class="pc-price">' + DB.money(price) + (comp ? " <s>" + DB.money(comp) + "</s>" : "") + "</div>" +
        (variants && p.colors.length ? '<div class="pc-dots">' + p.colors.map(function (c) { return '<i title="' + esc(c.nameFr || c.name) + '" style="--c:' + esc(c.hex) + '"></i>'; }).join("") + "</div>" : "") + "</div>";
      $(".img-prev", el).src = RX.img(form.img.value, 400);
    }
    // extra photos (thumbnails of the product page), for the product and for each colour: added from the media library,
    // removed or reordered here. key: "" for the product, the id of the colour otherwise.
    var MAX_EXTRA = 8;
    if (!p.imgs) p.imgs = [];
    function listOf(key) { if (!key) return p.imgs; var c = p.colors.filter(function (x) { return x.id === key; })[0]; return c ? c.imgs || (c.imgs = []) : []; }
    function strip(key, empty) {
      var list = listOf(key), bs = ' style="width:26px;height:26px;padding:0;justify-content:center"';
      return '<div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">' + list.map(function (v, i) {
        return '<div class="row" style="gap:4px;padding:4px;border:1px solid var(--line)"><img class="thumb" alt="Photo supplémentaire ' + (i + 1) + '" src="' + esc(RX.img(v, 100)) + '">' +
          (w ? '<button type="button" class="btn is-sm"' + bs + ' data-xmove="' + esc(key) + "|" + i + '" data-dir="-1"' + (i === 0 ? " disabled" : "") + ' aria-label="Avancer la photo">←</button><button type="button" class="btn is-sm"' + bs + ' data-xmove="' + esc(key) + "|" + i + '" data-dir="1"' + (i === list.length - 1 ? " disabled" : "") + ' aria-label="Reculer la photo">→</button><button type="button" class="btn is-sm is-ghost-danger"' + bs + ' data-xdel="' + esc(key) + "|" + i + '" aria-label="Retirer la photo">' + I.x + "</button>" : "") + "</div>";
      }).join("") +
        (w ? '<button type="button" class="btn is-sm" data-xadd="' + esc(key) + '"' + (list.length >= MAX_EXTRA ? " disabled" : "") + ">" + I.plus + 'Ajouter une photo</button><small class="muted">' + list.length + " / " + MAX_EXTRA + (list.length ? "" : " — " + empty) + "</small>" : "") + "</div>";
    }
    function extras() { var box = $("[data-extras]", el); if (box) box.innerHTML = strip("", variants ? "photos montrées pour les couleurs qui n'ont pas les leurs" : "sans photo supplémentaire, la fiche n'affiche que la grande photo"); }
    colors(); sizes(); extras(); preview();
    el.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.matches && e.target.matches("[data-sznew]")) { e.preventDefault(); addSize(e.target.value); } });
    form.addEventListener("input", function (e) {
      if (e.target.matches("[data-sznew]")) return;
      RX.dirty = true; var st = $("[data-state]", el); if (st) st.textContent = "Modifications non enregistrées";
      var t = e.target;
      if (t.matches("[data-size]")) { p.stock[t.dataset.size] = Math.max(0, +t.value || 0); t.className = "inv-in" + cls(+t.value || 0); total(); }
      if (t.matches("[data-vs]")) { var vp = t.dataset.vs.split(":"); (p.vstock[vp[0]] = p.vstock[vp[0]] || {})[vp[1]] = Math.max(0, parseInt(t.value, 10) || 0); t.className = "inv-in" + (+t.value ? "" : " is-zero"); total(); }
      if (t.matches("[data-cfield]")) {
        var c = p.colors.filter(function (x) { return x.id === t.dataset.cid; })[0]; if (!c) return;
        c[t.dataset.cfield] = t.value.trim();
        if (t.dataset.cfield === "nameFr") { c.name = ""; var note = t.parentNode.querySelector(".en-note"); if (note) note.remove(); }
        if (t.dataset.cfield === "hex") t.parentNode.style.setProperty("--c", t.value);
        // keep the stock table's dots and names in step
        $$(".var-stock tbody tr", el).forEach(function (tr, i) { var cc = p.colors[i]; if (!cc) return; tr.querySelector(".var-dot").style.setProperty("--c", cc.hex); tr.querySelector("td span").lastChild.textContent = cc.nameFr || cc.name || "Sans nom"; });
      }
      preview();
    });
    form.cat.addEventListener("change", function () { if (!sizesTouched) { p.sizes = DB.sizesOf(form.cat.value).slice(); if (!variants) p.stock = {}; } sizes(); });
    el.addEventListener("change", function (e) {
      if (!e.target.matches("[data-variants]")) return;
      var on = e.target.checked;
      if (on) {
        // one colour holding the current stock; rename it and add the others
        p.colors = [{ id: "noir", name: "Black", nameFr: "Noir", hex: "#141414", img: "" }]; p.vstock = { noir: JSON.parse(JSON.stringify(p.stock || {})) };
        variants = true; $("[data-variants-lbl]", el).textContent = "Plusieurs couleurs"; changed(); colors(); sizes(); return;
      }
      var n = p.colors.length;
      RX.confirm({ title: "Passer en couleur unique ?", text: "Les " + n + " couleur" + (n > 1 ? "s" : "") + " seront supprimées ; le stock de chaque taille devient la somme des couleurs.", ok: "Passer en couleur unique", danger: true }).then(function (ok) {
        if (!ok) { e.target.checked = true; return; }
        var list = p.sizes, st = {};
        list.forEach(function (s) { st[s] = p.colors.reduce(function (t, c) { return t + (+(p.vstock[c.id] || {})[s] || 0); }, 0); });
        p.stock = st; p.colors = []; p.vstock = {}; variants = false; $("[data-variants-lbl]", el).textContent = "Couleur unique"; changed(); colors(); sizes();
      });
    });
    function setImg(v) {
      form.img.value = v; $$("[data-pick]", el).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.pick === v ? "true" : "false"); });
      RX.dirty = true; var st = $("[data-state]", el); if (st) st.textContent = "Modifications non enregistrées"; preview();
    }
    var drop = $("[data-img-drop]", el);
    if (w && drop) {
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("is-over"); });
      drop.addEventListener("dragleave", function (e) { if (!drop.contains(e.relatedTarget)) drop.classList.remove("is-over"); });
      drop.addEventListener("drop", function (e) {
        e.preventDefault(); drop.classList.remove("is-over");
        var f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return;
        RX.toast("Import de « " + f.name + " »…");
        RX.uploadMedia(f, "image").then(function (r) { setImg(r.ref); RX.toast("Photo importée"); }, function (err) { RX.toast(err.message, "bad"); });
      });
    }
    el.addEventListener("click", function (e) {
      var pk = e.target.closest("[data-pick]");
      if (pk) { setImg(pk.dataset.pick); return; }
      var b;
      if (e.target.closest("[data-cadd]")) { addColor("", "", "#cccccc"); return; }
      if ((b = e.target.closest("[data-cpal]"))) { var pc = b.dataset.cpal.split("|"); addColor(pc[0], pc[1], pc[2]); return; }
      if ((b = e.target.closest("[data-cmove]"))) {
        var ix = p.colors.findIndex(function (c) { return c.id === b.dataset.cmove; }), to = ix + (+b.dataset.dir);
        if (to < 0 || to >= p.colors.length) return;
        var mv = p.colors.splice(ix, 1)[0]; p.colors.splice(to, 0, mv); changed(); colors(); sizes(); return;
      }
      if ((b = e.target.closest("[data-cdel]"))) {
        var dc = p.colors.filter(function (c) { return c.id === b.dataset.cdel; })[0], units = p.sizes.reduce(function (t, s) { return t + (+(p.vstock[dc.id] || {})[s] || 0); }, 0);
        var go = function () { p.colors = p.colors.filter(function (c) { return c !== dc; }); delete p.vstock[dc.id]; changed(); colors(); sizes(); };
        if (!units) go(); else RX.confirm({ title: "Supprimer « " + (dc.nameFr || dc.name) + " » ?", text: "Cette couleur a encore " + units + " unité" + (units > 1 ? "s" : "") + " en stock, qui seront retirées du stock.", ok: "Supprimer", danger: true }).then(function (ok) { if (ok) go(); });
        return;
      }
      if ((b = e.target.closest("[data-cphoto]"))) {
        var pcol = p.colors.filter(function (c) { return c.id === b.dataset.cphoto; })[0];
        RX.pickMedia({ title: "Photo « " + (pcol.nameFr || pcol.name || "couleur") + " »", current: pcol.img, siteLabel: "Photos du catalogue", groups: [{ label: "Photos du catalogue", items: imgs }], onPick: function (v) { pcol.img = v; changed(); colors(); } });
        return;
      }
      if ((b = e.target.closest("[data-cphoto-del]"))) { p.colors.forEach(function (c) { if (c.id === b.dataset.cphotoDel) c.img = ""; }); changed(); colors(); return; }
      if ((b = e.target.closest("[data-szdel]"))) { delSize(b.dataset.szdel); return; }
      if (e.target.closest("[data-szadd]")) { addSize($("[data-sznew]", el).value); return; }
      if ((b = e.target.closest("[data-szquick]"))) { addSize(b.dataset.szquick); return; }
      if ((b = e.target.closest("[data-xadd]"))) {
        var xk = b.dataset.xadd, xl = listOf(xk);
        if (xl.length >= MAX_EXTRA) return;
        RX.pickMedia({ title: "Photo supplémentaire", current: "", siteLabel: "Photos du catalogue", groups: [{ label: "Photos du catalogue", items: imgs }], onPick: function (v) { if (v && xl.length < MAX_EXTRA) { xl.push(v); changed(); if (xk) colors(); else extras(); } } });
        return;
      }
      if ((b = e.target.closest("[data-xdel], [data-xmove]"))) {
        var xs = b.dataset.xdel !== undefined ? b.dataset.xdel : b.dataset.xmove, cut = xs.lastIndexOf("|"), key2 = xs.slice(0, cut), xi = +xs.slice(cut + 1), l2 = listOf(key2);
        if (b.dataset.xdel !== undefined) l2.splice(xi, 1);
        else { var xt = xi + (+b.dataset.dir); if (xt < 0 || xt >= l2.length) return; var xv = l2.splice(xi, 1)[0]; l2.splice(xt, 0, xv); }
        changed(); if (key2) colors(); else extras(); return;
      }
      if (e.target.closest("[data-img-upload]")) {
        RX.pickMedia({ title: "Photo du produit", current: form.img.value, siteLabel: "Photos du catalogue", groups: [{ label: "Photos du catalogue", items: imgs }], onPick: function (v) { setImg(v); } });
        return;
      }
      if (e.target.closest("[data-delete]")) {
        if (ordered) return;
        var dname = src.nameFr || src.name || "ce produit";
        RX.confirm({ title: "Supprimer définitivement", text: "« " + dname + " » sera supprimé de la boutique et du back-office, avec ses photos, ses couleurs et son stock. Cette action est irréversible.", ok: "Supprimer définitivement", danger: true }).then(function (ok) {
          if (!ok) return;
          // the place of the product is kept empty (the pages and the orders find a product by its number)
          db.products[src.id] = { id: src.id, status: "deleted", cat: src.cat, sku: "", name: "", nameFr: "", price: 0, compare: 0, cost: 0, tag: "", img: "", imgs: [], desc: "", descFr: "", colors: [], stock: {} };
          RX.dirty = false; RX.save("a supprimé le produit", dname); RX.toast("Produit supprimé"); location.hash = "#/products";
        });
        return;
      }
      if (e.target.closest("[data-archive]")) {
        var toArch = src.status !== "archived";
        RX.confirm({ title: toArch ? "Archiver le produit" : "Restaurer le produit", text: toArch ? "Le produit sera retiré de la boutique. Vous pourrez le restaurer à tout moment." : "Le produit repassera en brouillon.", ok: toArch ? "Archiver" : "Restaurer", danger: toArch }).then(function (ok) {
          if (!ok) return; src.status = toArch ? "archived" : "draft"; RX.dirty = false; RX.save(toArch ? "a archivé le produit" : "a restauré le produit", src.nameFr || src.name); RX.rerender(); RX.toast(toArch ? "Produit archivé" : "Produit restauré en brouillon");
        });
      }
    });
    var saving = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (!w || saving) return;
      var errs = [];
      if (!form.nameFr.value.trim()) errs.push(form.nameFr);
      if (!(+form.price.value > 0)) errs.push(form.price);
      $$("[aria-invalid]", form).forEach(function (i) { i.removeAttribute("aria-invalid"); });
      if (errs.length) { errs.forEach(function (i) { i.setAttribute("aria-invalid", "true"); }); errs[0].focus(); RX.toast("Complétez les champs obligatoires (nom et prix)", "bad"); return; }
      var comp = +form.compare.value || 0, price = +form.price.value;
      if (comp && comp <= price) { form.compare.setAttribute("aria-invalid", "true"); RX.toast("Le prix barré doit être supérieur au prix de vente", "bad"); return; }
      var nameFr = form.nameFr.value.trim(), descFr = form.descFr.value.trim();
      var names = RX.products(db).filter(function (x) { return x.id !== p.id && (x.nameFr || "").trim().toLowerCase() === nameFr.toLowerCase(); });
      if (names.length) { form.nameFr.setAttribute("aria-invalid", "true"); RX.toast("Un autre produit porte déjà ce nom", "bad"); return; }
      if (variants) {
        var bad = p.colors.filter(function (c) { return !c.nameFr; });
        if (bad.length) { var bi = $('[data-cfield="nameFr"][data-cid="' + bad[0].id + '"]', el); if (bi) { bi.setAttribute("aria-invalid", "true"); bi.focus(); } RX.toast("Donnez un nom à chaque couleur", "bad"); return; }
        var seen = {}, dupe = p.colors.filter(function (c) { var k = c.nameFr.toLowerCase(); if (seen[k]) return true; seen[k] = 1; return false; })[0];
        if (dupe) { RX.toast("Deux couleurs portent le nom « " + dupe.nameFr + " »", "bad"); return; }
      }

      // English for the storefront: only what is new or was changed in French
      var needName = isNew || !src.name || nameFr !== src.nameFr, needDesc = !!descFr && (isNew || descFr !== src.descFr || !src.desc);
      var cols = variants ? p.colors.filter(function (c) { return !c.name; }) : [];
      var titles = (needName ? [nameFr] : []).concat(cols.map(function (c) { return c.nameFr; }));
      var btn = $('.sticky-save [type="submit"]', el), label = btn ? btn.textContent : "";
      saving = true; if (btn) { btn.disabled = true; btn.textContent = "Traduction en anglais…"; }
      Promise.all([titles.length ? RX.translate(titles, { title: true }) : [], needDesc ? RX.translate([descFr]) : []]).then(function (r) { commit(r[0], r[1][0], true); }, function () { commit([], "", false); });

      function commit(tt, enDesc, ok) {
        saving = false; if (btn) { btn.disabled = false; btn.textContent = label; }
        if (!ok) RX.translateFailed();
        var k = 0, enName = needName ? tt[k++] || nameFr : src.name;
        cols.forEach(function (c) { c.name = tt[k++] || c.nameFr; });
        var target = isNew ? { id: db.products.length, createdAt: Date.now() } : src;
        target.nameFr = nameFr; target.name = enName; target.descFr = descFr; target.desc = !descFr ? "" : needDesc ? enDesc || descFr : src.desc;
        target.img = form.img.value.trim() || "photo-1632149877166-f75d49000351"; target.imgs = (p.imgs || []).filter(Boolean).slice(0, MAX_EXTRA); target.price = price; target.compare = comp; target.cost = +form.cost.value || 0;
        target.status = form.status.value; target.cat = form.cat.value; target.tag = form.tag.value;
        target.sku = form.sku.value.trim() || "RX-" + target.cat.slice(0, 3).toUpperCase() + "-" + ("00" + (target.id + 1)).slice(-3);
        if (variants) {
          var sz = p.sizes;
          target.colors = p.colors.map(function (c) { return { id: c.id, name: c.name || c.nameFr, nameFr: c.nameFr, hex: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#cccccc", img: c.img || "", imgs: (c.imgs || []).filter(Boolean).slice(0, MAX_EXTRA) }; });
          target.vstock = {}; target.colors.forEach(function (c) { target.vstock[c.id] = {}; sz.forEach(function (s) { target.vstock[c.id][s] = Math.max(0, +((p.vstock[c.id] || {})[s]) || 0); }); });
        } else { target.colors = []; delete target.vstock; }
        target.sizes = p.sizes.slice();
        var st = {}; p.sizes.forEach(function (s) { st[s] = Math.max(0, +(p.stock[s] || 0)); }); target.stock = st;
        DB.syncStock(target);
        if (isNew) db.products.push(target);
        RX.dirty = false;
        RX.save(isNew ? "a créé le produit" : "a modifié le produit", target.nameFr);
        RX.toast(isNew ? "Produit créé" : "Produit enregistré" + (ok && (needName || needDesc || cols.length) ? " — version anglaise traduite" : ""));
        if (isNew) location.hash = "#/products/" + target.id; else RX.rerender();
      }
    });
  }
  RX.route("/products/new", "products", function (el) { if (!RX.canWrite("products")) { location.hash = "#/products"; return; } editor(el, {}); });
  RX.route("/products/:id", "products", function (el, params) { editor(el, params); });

  /* ======================================================================
     INVENTORY
     ====================================================================== */
  var IS = { q: "", filter: "", cat: "" };
  RX.route("/inventory", "inventory", function (el, params, q) {
    var db = RX.db(), w = RX.canWrite("inventory"), th = db.settings.store.lowStock, changes = {};
    if (q.filter) IS.filter = q.filter;
    var units = 0, value = 0, out = 0, low = 0;
    RX.products(db).forEach(function (p) { var n = RX.stock(p); units += n; value += n * (p.cost || p.price * 0.4); var s = RX.lowStock(p); if (p.status === "active") { if (s === "out") out++; if (s === "low") low++; } });
    el.innerHTML =
      '<div class="ph"><div><h1>Stock</h1><p>Quantités par couleur et par taille. Modifiez les cellules puis enregistrez.</p></div><div class="ph-actions">' + RX.readOnly("inventory") + '<button type="button" class="btn" data-export>' + I.down + "Exporter</button>" +
      (w ? '<button type="button" class="btn" data-threshold>Seuil d\'alerte : ' + th + "</button>" : "") + "</div></div>" +
      '<div class="grid g-4" style="margin-bottom:18px">' + RX.kpiS("Unités en stock", RX.num(units), RX.products(db).length + " produits") + RX.kpiS("Valeur du stock", RX.money(value), "au coût d'achat") +
        RX.kpiS("Ruptures", out, "produits actifs sans stock") + RX.kpiS("Stock faible", low, "une taille à zéro ou total ≤ " + th * 2) + "</div>" +
      '<div class="card"><div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="Produit ou SKU…" data-q value="' + esc(IS.q) + '" aria-label="Rechercher"></div>' +
      '<div class="seg" aria-label="Filtre">' + [["", "Tous"], ["low", "Stock faible"], ["out", "Ruptures"]].map(function (f) { return '<button type="button" data-filter="' + f[0] + '" aria-pressed="' + (IS.filter === f[0]) + '">' + f[1] + "</button>"; }).join("") + "</div>" +
      '<select class="select" data-cat aria-label="Catégorie"><option value="">Toutes les catégories</option>' + db.categories.map(function (c) { return '<option value="' + c.key + '"' + (IS.cat === c.key ? " selected" : "") + ">" + esc(c.labelFr || c.label) + "</option>"; }).join("") + "</select></div>" +
      '<div data-body></div></div>' +
      (w ? '<div class="sticky-save" hidden><span data-state></span><div class="row"><button type="button" class="btn" data-cancel>Annuler</button><button type="button" class="btn is-primary" data-save>Enregistrer le stock</button></div></div>' : "");

    function draw() {
      var qq = IS.q.trim().toLowerCase();
      var l = RX.products(db).filter(function (p) {
        if (IS.cat && p.cat !== IS.cat) return false;
        if (IS.filter && RX.lowStock(p) !== IS.filter) return false;
        if (qq && (p.name + " " + p.nameFr + " " + p.sku).toLowerCase().indexOf(qq) < 0) return false;
        return true;
      });
      var cols = allSizes(db);
      $("[data-body]", el).innerHTML = l.length ? '<div class="table-wrap"><table class="t"><thead><tr><th>Produit</th>' + cols.map(function (s) { return '<th class="c">' + (s === "One size" ? "Unique" : s) + "</th>"; }).join("") + '<th class="r">Total</th><th>État</th></tr></thead><tbody>' +
        l.map(function (p) {
          var st = RX.lowStock(p);
          return "<tr><td><div class=\"cell\"><img class=\"thumb is-sm\" alt=\"\" loading=\"lazy\" src=\"" + RX.img(p.img, 100) + '"><div class="cell-txt"><b><a href="#/products/' + p.id + '" style="text-decoration:none">' + esc(p.nameFr || p.name) + '</a></b><small class="mono">' + esc(p.sku) + (p.status !== "active" ? " · " + RX.PSTATUS[p.status].label : "") + "</small></div></div></td>" +
            cols.map(function (s) {
              if (p.stock[s] === undefined) return '<td class="inv-na">—</td>';
              if (DB.hasColors(p)) return '<td class="c num"><b>' + p.stock[s] + "</b></td>"; // total of the colours, edited below
              return cell(p.id + ":" + s, p.stock[s], esc(p.nameFr) + " " + s);
            }).join("") +
            '<td class="r num"><b>' + RX.stock(p) + "</b></td><td>" + (st === "out" ? RX.badge("bad", "Rupture") : st === "low" ? RX.badge("warn", "Faible") : RX.badge("ok", "OK")) + "</td></tr>" +
            (DB.hasColors(p) ? p.colors.map(function (c) {
              var row = p.vstock[c.id] || {}, tot = Object.keys(row).reduce(function (n, k) { return n + (+row[k] || 0); }, 0);
              return '<tr class="inv-var"><td><span class="row" style="gap:8px;padding-left:44px"><i class="var-dot" style="--c:' + esc(c.hex) + '"></i>' + esc(c.nameFr || c.name) + "</span></td>" +
                cols.map(function (s) { return p.stock[s] === undefined ? '<td class="inv-na"></td>' : cell(p.id + ":" + c.id + ":" + s, +row[s] || 0, esc(p.nameFr) + " " + esc(c.nameFr) + " " + s); }).join("") +
                '<td class="r num muted">' + tot + "</td><td></td></tr>";
            }).join("") : "");
        }).join("") + "</tbody></table></div>" : RX.empty("Rien à afficher", "Aucun produit ne correspond à ce filtre.", I.box);
    }
    // colour rows only flag empty cells: the low-stock alert applies to each size's total
    function cell(k, stored, label) {
      var v = changes[k] != null ? changes[k] : stored, variant = k.split(":").length === 3;
      return '<td class="c"><input class="inv-in' + (v === 0 ? " is-zero" : v <= th && !variant ? " is-low" : "") + (changes[k] != null ? " is-dirty" : "") + '" type="number" min="0" data-k="' + k + '" value="' + v + '" aria-label="Stock ' + label + '"' + (w ? "" : " disabled") + "></td>";
    }
    function stored(k) { var parts = k.split(":"), p = db.products[+parts[0]]; return parts.length === 3 ? +((p.vstock[parts[1]] || {})[parts[2]]) || 0 : p.stock[parts[1]]; }
    function state() {
      var n = Object.keys(changes).length, bar = $(".sticky-save", el); if (!bar) return;
      bar.hidden = !n; $("[data-state]", el).textContent = n + " quantité" + (n > 1 ? "s" : "") + " modifiée" + (n > 1 ? "s" : ""); RX.dirty = !!n;
    }
    draw();
    $("[data-q]", el).addEventListener("input", RX.debounce(function (e) { IS.q = e.target.value; draw(); }, 160));
    $("[data-cat]", el).addEventListener("change", function (e) { IS.cat = e.target.value; draw(); });
    el.addEventListener("input", function (e) {
      var i = e.target.closest("[data-k]"); if (!i) return;
      var v = Math.max(0, parseInt(i.value, 10) || 0);
      if (v === stored(i.dataset.k)) delete changes[i.dataset.k]; else changes[i.dataset.k] = v;
      i.classList.toggle("is-dirty", changes[i.dataset.k] != null); state();
    });
    el.addEventListener("click", function (e) {
      var f = e.target.closest("[data-filter]"); if (f) { IS.filter = f.dataset.filter; $$("[data-filter]", el).forEach(function (b) { b.setAttribute("aria-pressed", b === f ? "true" : "false"); }); draw(); return; }
      if (e.target.closest("[data-cancel]")) { changes = {}; state(); draw(); return; }
      if (e.target.closest("[data-save]")) {
        var n = Object.keys(changes).length;
        Object.keys(changes).forEach(function (k) {
          var parts = k.split(":"), p = db.products[+parts[0]];
          if (parts.length === 3) { (p.vstock[parts[1]] = p.vstock[parts[1]] || {})[parts[2]] = changes[k]; DB.syncStock(p); } else p.stock[parts[1]] = changes[k];
        });
        changes = {}; RX.dirty = false; RX.save("a mis à jour le stock (" + n + " quantité" + (n > 1 ? "s" : "") + ")"); state(); draw(); RX.toast("Stock enregistré"); return;
      }
      if (e.target.closest("[data-threshold]")) {
        RX.modal({ title: "Seuil d'alerte de stock", body: '<label class="field"><span>Alerte quand une taille descend à</span><div class="input-suffix"><input class="input num" type="number" min="0" name="th" value="' + th + '"><span>unités</span></div><small>Un produit est aussi « faible » si son stock total est inférieur au double de ce seuil.</small></label>',
          actions: [{ label: "Annuler", close: true }, { label: "Enregistrer", tone: "primary", onClick: function (m) { db.settings.store.lowStock = Math.max(0, +$("[name=th]", m.el).value || 0); RX.save("a changé le seuil d'alerte de stock", db.settings.store.lowStock); m.close(); RX.rerender(); } }] });
        return;
      }
      if (e.target.closest("[data-export]")) {
        var rows = [["SKU", "Produit", "Couleur", "Catégorie"].concat(stdSizes(db)).concat(["Taille unique", "Total", "État"])];
        var line = function (p, sku, color, st) {
          var tot = Object.keys(st).reduce(function (n, k) { return n + (+st[k] || 0); }, 0), s = RX.lowStock(p);
          rows.push([sku, p.nameFr, color, catLabel(db, p.cat)].concat(stdSizes(db).map(function (z) { return st[z] == null ? "" : st[z]; })).concat([st["One size"] == null ? "" : st["One size"], tot, color ? "" : s === "out" ? "Rupture" : s === "low" ? "Faible" : "OK"]));
        };
        RX.products(db).forEach(function (p) {
          line(p, p.sku, "", p.stock);
          if (DB.hasColors(p)) p.colors.forEach(function (c) { line(p, p.sku + "-" + c.id.toUpperCase(), c.nameFr || c.name, p.vstock[c.id] || {}); });
        });
        RX.download("stock-relaxx-" + DB.dayKey(Date.now()) + ".csv", RX.csv(rows));
      }
    });
  });

  /* ======================================================================
     CATEGORIES
     ====================================================================== */
  RX.route("/categories", "categories", function (el) {
    var db = RX.db(), w = RX.canWrite("categories");
    // names being typed, kept until "Enregistrer": the page does not refresh by itself meanwhile (RX.dirty) and a redraw keeps them
    var names = {};
    function pending() { return Object.keys(names).filter(function (k) { var c = byKey(k); return c && names[k].trim() && names[k].trim() !== c.labelFr; }); }
    function mark() { var n = pending().length, b = $("[data-save-cats]", el); RX.dirty = n > 0; if (b) b.disabled = !n; }
    function draw() {
      var cats = db.categories.slice().sort(function (a, b) { return a.order - b.order; });
      el.innerHTML =
        '<div class="ph"><div><h1>Catégories</h1><p>Onglets de la boutique et de la page d\'accueil. L\'ordre ci-dessous est celui des onglets. Modifiez les noms puis cliquez sur « Enregistrer ».</p></div><div class="ph-actions">' + (w ? '<button type="button" class="btn" data-add>' + I.plus + 'Nouvelle catégorie</button><button type="button" class="btn is-primary" data-save-cats disabled>Enregistrer</button>' : "") + "</div></div>" +
        '<div class="card"><div class="table-wrap"><table class="t"><thead><tr><th class="w0">Ordre</th><th>Nom</th><th>Version anglaise (automatique)</th><th>Identifiant</th><th class="r">Produits</th><th>Visible</th><th class="r">Actions</th></tr></thead><tbody>' +
        cats.map(function (c, i) {
          var n = RX.products(db).filter(function (p) { return p.cat === c.key; }).length, act = RX.products(db).filter(function (p) { return p.cat === c.key && p.status === "active"; }).length;
          return '<tr><td class="w0"><div class="row" style="gap:4px"><button type="button" class="btn is-sm" data-move="' + c.key + '" data-dir="-1"' + (!w || i === 0 ? " disabled" : "") + ' aria-label="Monter">↑</button><button type="button" class="btn is-sm" data-move="' + c.key + '" data-dir="1"' + (!w || i === cats.length - 1 ? " disabled" : "") + ' aria-label="Descendre">↓</button></div></td>' +
            '<td><input class="input" data-lbl="labelFr" data-key="' + c.key + '" value="' + esc(names[c.key] !== undefined ? names[c.key] : c.labelFr) + '"' + (w ? "" : " disabled") + '></td><td class="muted" data-en="' + c.key + '">' + esc(c.label) + "</td>" +
            '<td class="mono muted">' + esc(c.key) + '</td><td class="r num">' + act + ' <span class="muted">/ ' + n + "</span></td>" +
            '<td><label class="switch"><input type="checkbox" data-vis="' + c.key + '"' + (c.visible ? " checked" : "") + (w ? "" : " disabled") + '><i></i></label></td>' +
            '<td class="r w0">' + (w ? '<a class="btn is-sm" href="../shop.html#' + c.key + '" target="_blank" rel="noopener">' + I.ext + '</a> <button type="button" class="btn is-sm is-ghost-danger" data-del="' + c.key + '"' + (n ? ' disabled title="Contient des produits"' : "") + ">" + I.trash + "</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div></div>" +
        '<div class="notice" style="margin-top:18px">' + I.info + "<div>Masquer une catégorie retire ses produits de la boutique (onglets, recherche, recommandations) sans les supprimer. Le menu et le pied de page du site suivent cette liste : ordre, noms et visibilité.</div></div>";
      mark();
    }
    draw();
    el.addEventListener("input", function (e) { if (e.target.matches("[data-lbl]")) { names[e.target.dataset.key] = e.target.value; mark(); } });
    // "Enregistrer": every changed name is translated, then all of them are saved at once
    function saveNames(btn) {
      var keys = pending();
      if (!keys.length) return;
      var fr = keys.map(function (k) { return names[k].trim(); });
      btn.disabled = true; btn.textContent = "Enregistrement…";
      RX.translate(fr, { title: true }).then(function (r) { finish(r, true); }, function () { finish([], false); });
      function finish(r, ok) {
        if (!ok) RX.translateFailed();
        keys.forEach(function (k, i) { var c = byKey(k); if (!c) return; c.labelFr = fr[i]; c.label = r[i] || fr[i]; });
        names = {}; RX.dirty = false;
        RX.save(keys.length > 1 ? "a renommé " + keys.length + " catégories" : "a renommé la catégorie", fr.join(", "));
        draw();
        RX.toast(keys.length > 1 ? "Modifications enregistrées : " + keys.length + " catégories renommées" : "Modification enregistrée : catégorie renommée");
      }
    }
    el.addEventListener("change", function (e) {
      var i = e.target;
      if (i.matches("[data-vis]")) { var c2 = byKey(i.dataset.vis); c2.visible = i.checked; RX.save(i.checked ? "a affiché la catégorie" : "a masqué la catégorie", c2.labelFr); RX.toast(i.checked ? "Catégorie visible sur la boutique" : "Catégorie masquée"); }
    });
    el.addEventListener("click", function (e) {
      var sv = e.target.closest("[data-save-cats]");
      if (sv) { saveNames(sv); return; }
      var mv = e.target.closest("[data-move]");
      if (mv) { var cats = db.categories.slice().sort(function (a, b) { return a.order - b.order; }), i = cats.indexOf(byKey(mv.dataset.move)), j = i + +mv.dataset.dir; var t = cats[i]; cats[i] = cats[j]; cats[j] = t; cats.forEach(function (c, k) { c.order = k; }); RX.save("a réordonné les catégories"); draw(); return; }
      var del = e.target.closest("[data-del]");
      if (del) { var c = byKey(del.dataset.del); RX.confirm({ title: "Supprimer la catégorie", text: "Supprimer « " + c.labelFr + " » ?", ok: "Supprimer", danger: true }).then(function (ok) { if (!ok) return; db.categories.splice(db.categories.indexOf(c), 1); RX.save("a supprimé la catégorie", c.labelFr); draw(); }); return; }
      if (e.target.closest("[data-add]")) {
        RX.modal({ title: "Nouvelle catégorie", body: '<div class="stack"><label class="field"><span>Nom de la catégorie</span><input class="input" name="fr" placeholder="ex. Chaussures"><small class="muted">La version anglaise est traduite automatiquement.</small></label><p class="err" data-err></p></div>',
          actions: [{ label: "Annuler", close: true }, { label: "Créer", tone: "primary", onClick: function (m, b) {
            var fr = $("[name=fr]", m.el).value.trim(), err = $("[data-err]", m.el);
            if (!fr) { err.textContent = "Indiquez le nom de la catégorie."; return; }
            if (db.categories.some(function (c) { return (c.labelFr || "").toLowerCase() === fr.toLowerCase(); })) { err.textContent = "Cette catégorie existe déjà."; return; }
            b.disabled = true; b.textContent = "Traduction…";
            RX.translate([fr], { title: true }).then(function (r) { create(r[0] || fr, true); }, function () { create(fr, false); });
            function create(en, ok) {
              var base = DB.colorSlug(en), key = base, n = 2;
              while (byKey(key)) key = base + "-" + n++;
              if (!ok) RX.translateFailed();
              db.categories.push({ key: key, label: en, labelFr: fr, visible: true, order: db.categories.length });
              RX.save("a créé la catégorie", fr); m.close(); draw(); RX.toast("Catégorie créée — anglais : " + en);
            }
          } }] });
      }
    });
    function byKey(k) { return db.categories.filter(function (c) { return c.key === k; })[0]; }
  });

  /* ======================================================================
     REVIEWS
     ====================================================================== */
  var RS = { status: "pending", stars: "", q: "" };
  RX.route("/reviews", "reviews", function (el, params, q) {
    var db = RX.db(), w = RX.canWrite("reviews");
    if (q.status) RS.status = q.status;
    function draw() {
      var c = { all: db.reviews.length, pending: 0, published: 0, hidden: 0 }; db.reviews.forEach(function (r) { c[r.status]++; });
      var pub = db.reviews.filter(function (r) { return r.status === "published"; }), avg = pub.length ? pub.reduce(function (s, r) { return s + r.stars; }, 0) / pub.length : 0;
      var qq = RS.q.trim().toLowerCase();
      var list = db.reviews.filter(function (r) {
        if (RS.status !== "all" && r.status !== RS.status) return false;
        if (RS.stars && r.stars !== +RS.stars) return false;
        if (qq && (r.title + " " + r.text + " " + r.name + " " + ((db.products[r.pid] || {}).nameFr || "")).toLowerCase().indexOf(qq) < 0) return false;
        return true;
      }).sort(function (a, b) { return b.date - a.date; });
      el.innerHTML =
        '<div class="ph"><div><h1>Avis clients</h1><p>Avis déposés sur les fiches produits. Les avis publiés et vos réponses apparaissent sur la boutique.</p></div><div class="ph-actions">' + RX.readOnly("reviews") +
        (w ? '<label class="switch"><input type="checkbox" data-moderation' + (db.settings.reviews.moderation ? " checked" : "") + '><i></i><b>Modérer avant publication</b></label>' : "") + "</div></div>" +
        '<div class="grid g-4" style="margin-bottom:18px">' + RX.kpiS("Note moyenne publiée", RX.num1(avg) + " / 5", pub.length + " avis publiés") + RX.kpiS("En attente", c.pending, "à valider ou refuser") +
          RX.kpiS("Avec réponse", db.reviews.filter(function (r) { return r.reply; }).length, "réponses de la marque") + RX.kpiS("Masqués", c.hidden, "non visibles sur le site") + "</div>" +
        '<div class="card"><div class="tabs">' + [["pending", "En attente"], ["published", "Publiés"], ["hidden", "Masqués"], ["all", "Tous"]].map(function (s) { return '<button type="button" data-st="' + s[0] + '" aria-selected="' + (RS.status === s[0]) + '">' + s[1] + ' <span class="n">' + c[s[0]] + "</span></button>"; }).join("") + "</div>" +
        '<div class="toolbar"><div class="input-wrap">' + I.search + '<input class="input" type="search" placeholder="Rechercher dans les avis…" data-q value="' + esc(RS.q) + '"></div><select class="select" data-stars aria-label="Note"><option value="">Toutes les notes</option>' + [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '"' + (RS.stars === String(n) ? " selected" : "") + ">" + n + " étoile" + (n > 1 ? "s" : "") + "</option>"; }).join("") + "</select>" +
        '<span class="muted" style="margin-left:auto;font-size:12.5px">Les avis d\'exemple générés sur chaque fiche produit ne sont pas modérables ici.</span></div>' +
        (list.length ? list.map(function (r) {
          var p = db.products[r.pid] || {}, st = { pending: ["warn", "En attente"], published: ["ok", "Publié"], hidden: ["muted", "Masqué"] }[r.status];
          return '<div class="rev" data-id="' + r.id + '"><img class="thumb is-lg" alt="" loading="lazy" src="' + RX.img(p.img, 140) + '"><div style="min-width:0"><div class="row is-wrap" style="gap:10px">' + RX.stars(r.stars) + RX.badge(st[0], st[1]) + (r.source === "web" ? '<span class="badge is-plain t-ok" style="height:20px;font-size:10.5px">SITE</span>' : "") +
            '<a class="muted" href="#/products/' + r.pid + '" style="font-size:12.5px">' + esc(p.nameFr || p.name || "Produit") + "</a></div>" +
            "<h3>" + esc(r.title) + '</h3><div class="rev-text">' + esc(r.text) + '</div><div class="rev-meta"><b style="color:var(--text)">' + esc(r.name) + "</b>" + (r.city ? " · " + esc(r.city) : "") + " · " + RX.dateTime(r.date) + (r.size ? " · taille " + esc(r.size) : "") + "</div>" +
            (r.reply ? '<div class="rev-reply"><b>Réponse de RELAXX · ' + RX.date(r.replyDate || r.date) + "</b>" + esc(r.reply) + "</div>" : "") + "</div>" +
            '<div class="rev-actions">' + (w ? (r.status !== "published" ? '<button type="button" class="btn is-sm is-primary" data-act="publish">' + I.check + "Publier</button>" : "") +
              (r.status !== "hidden" ? '<button type="button" class="btn is-sm" data-act="hide">' + I.eyeOff + "Masquer</button>" : "") +
              '<button type="button" class="btn is-sm" data-act="reply">' + I.edit + (r.reply ? "Modifier la réponse" : "Répondre") + '</button><button type="button" class="btn is-sm is-ghost-danger" data-act="delete">' + I.trash + "Supprimer</button>" : "") +
              '<a class="btn is-sm" href="../product.html?id=' + r.pid + '#reviews" target="_blank" rel="noopener">' + I.ext + "Sur le site</a></div></div>";
        }).join("") : RX.empty("Aucun avis", RS.status === "pending" ? "Tous les avis ont été traités." : "Aucun avis ne correspond à ces critères.", I.star)) + "</div>";
    }
    draw();
    el.addEventListener("input", RX.debounce(function (e) { if (e.target.matches("[data-q]")) { RS.q = e.target.value; draw(); var i = $("[data-q]", el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250));
    el.addEventListener("change", function (e) {
      if (e.target.matches("[data-stars]")) { RS.stars = e.target.value; draw(); }
      if (e.target.matches("[data-moderation]")) { db.settings.reviews.moderation = e.target.checked; RX.save(e.target.checked ? "a activé la modération des avis" : "a désactivé la modération des avis"); RX.toast(e.target.checked ? "Les nouveaux avis attendront votre validation" : "Les nouveaux avis seront publiés immédiatement"); }
    });
    el.addEventListener("click", function (e) {
      var st = e.target.closest("[data-st]"); if (st) { RS.status = st.dataset.st; history.replaceState(null, "", "#/reviews?status=" + RS.status); draw(); return; }
      var a = e.target.closest("[data-act]"); if (!a) return;
      var r = db.reviews.filter(function (x) { return x.id === a.closest("[data-id]").dataset.id; })[0], pn = (db.products[r.pid] || {}).nameFr || "";
      if (a.dataset.act === "publish") { r.status = "published"; RX.save("a publié un avis sur", pn); draw(); RX.toast("Avis publié sur la boutique"); }
      if (a.dataset.act === "hide") { r.status = "hidden"; RX.save("a masqué un avis sur", pn); draw(); RX.toast("Avis masqué"); }
      if (a.dataset.act === "delete") RX.confirm({ title: "Supprimer l'avis", text: "Supprimer définitivement l'avis de " + r.name + " ?", ok: "Supprimer", danger: true }).then(function (ok) { if (!ok) return; db.reviews.splice(db.reviews.indexOf(r), 1); RX.save("a supprimé un avis sur", pn); draw(); });
      if (a.dataset.act === "reply") {
        RX.modal({ title: "Réponse publique à " + r.name, body: '<div class="stack"><div class="notice">' + I.info + "<div><b>« " + esc(r.title) + " »</b><br>" + esc(r.text) + '</div></div><label class="field"><span>Votre réponse (affichée sous l\'avis sur la boutique)</span><textarea class="textarea" name="reply" maxlength="600" placeholder="Merci pour votre avis…">' + esc(r.reply || "") + "</textarea></label></div>",
          actions: [{ label: "Annuler", close: true }].concat(r.reply ? [{ label: "Supprimer la réponse", onClick: function (m) { r.reply = ""; r.replyDate = 0; RX.save("a supprimé la réponse à un avis sur", pn); m.close(); draw(); } }] : []).concat([{ label: "Publier la réponse", tone: "primary", onClick: function (m) {
            var v = $("[name=reply]", m.el).value.trim(); if (!v) return;
            r.reply = v; r.replyDate = Date.now(); if (r.status === "pending") r.status = "published";
            RX.save("a répondu à un avis sur", pn); m.close(); draw(); RX.toast("Réponse publiée");
          } }]) });
      }
    });
  });

  /* ======================================================================
     SIZE GUIDE — shown on the product pages (size guide link) and on the help page
     ====================================================================== */
  RX.route("/size-guide", "products", function (el) {
    var db = RX.db(), w = RX.canWrite("products"), dis = w ? "" : " disabled";
    var g = JSON.parse(JSON.stringify(DB.sizeGuide()));
    // remember the French saved with each text: only new or changed texts are translated again
    function mark(o) { o._fr0 = o.fr; return o; }
    [g.clothes.note, g.accessories.note].concat(g.clothes.cols, g.accessories.rows).forEach(mark);
    var C = g.clothes, A = g.accessories, MAXC = 6, MAXR = 8;

    function draw() {
      el.innerHTML =
        '<div class="ph"><div><h1>Guide des tailles</h1><p>Affiché sur chaque fiche produit (lien « Guide des tailles ») et sur la page Aide du site. Écrivez en français : la version anglaise est traduite à l\'enregistrement.</p></div>' +
        '<div class="ph-actions">' + RX.readOnly("products") + '<a class="btn" href="../aide.html#tailles" target="_blank" rel="noopener">' + I.ext + "Voir sur le site</a>" +
        (w ? '<button type="button" class="btn" data-default>' + I.refresh + "Rétablir le guide d'origine</button>" : "") + "</div></div>" +
        '<form data-form class="stack" novalidate>' +
        '<div class="card"><div class="card-h"><div><h2>Vêtements</h2><p>Mesures par taille, affichées pour toutes les catégories sauf les accessoires.</p></div></div><div class="card-b stack" style="gap:16px">' +
          '<label class="field"><span>Texte d\'introduction</span><textarea class="textarea sg-note" rows="2" data-note="clothes"' + dis + ">" + esc(C.note.fr) + "</textarea>" + RX.enNote(C.note._fr0 === C.note.fr ? C.note.en : "") + "</label>" +
          '<div class="table-wrap"><table class="t sg-t"><thead><tr><th>Taille</th>' + C.cols.map(function (c, i) {
            return '<th><div class="sg-col"><input class="input" data-col="' + i + '" value="' + esc(c.fr) + '" placeholder="ex. Tour de taille" aria-label="Nom de la mesure ' + (i + 1) + '"' + dis + ">" +
              (w && C.cols.length > 1 ? '<button type="button" class="icon-btn" data-col-del="' + i + '" aria-label="Supprimer la mesure ' + esc(c.fr) + '">' + I.trash + "</button>" : "") + "</div></th>";
          }).join("") + "</tr></thead><tbody>" +
          DB.SIZES.map(function (sz) {
            var row = C.rows[sz] = C.rows[sz] || [];
            return "<tr><th>" + sz + "</th>" + C.cols.map(function (c, i) { return '<td><input class="input num" data-cell="' + sz + "|" + i + '" value="' + esc(row[i] || "") + '" placeholder="ex. 70–74" aria-label="' + sz + " — " + esc(c.fr) + '"' + dis + "></td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table></div>" +
          (w ? '<div class="row is-between is-wrap"><button type="button" class="btn" data-col-add' + (C.cols.length >= MAXC ? " disabled" : "") + ">" + I.plus + "Ajouter une mesure</button>" +
            '<small class="muted">En centimètres, par exemple « 70–74 ». ' + MAXC + " mesures au maximum.</small></div>" : "") +
        "</div></div>" +
        '<div class="card"><div class="card-h"><div><h2>Accessoires (taille unique)</h2><p>Dimensions affichées sur les fiches des accessoires.</p></div></div><div class="card-b stack" style="gap:16px">' +
          '<label class="field"><span>Texte d\'introduction</span><textarea class="textarea sg-note" rows="2" data-note="accessories"' + dis + ">" + esc(A.note.fr) + "</textarea>" + RX.enNote(A.note._fr0 === A.note.fr ? A.note.en : "") + "</label>" +
          '<div class="sg-rows">' + A.rows.map(function (r, i) {
            return '<div class="sg-row"><label class="field"><span>Mesure</span><input class="input" data-arow="' + i + '" data-f="fr" value="' + esc(r.fr) + '" placeholder="ex. Hauteur"' + dis + ">" + RX.enNote(r._fr0 === r.fr ? r.en : "") + "</label>" +
              '<label class="field"><span>Valeur</span><input class="input num" data-arow="' + i + '" data-f="v" value="' + esc(r.v) + '" placeholder="ex. 30 cm"' + dis + "></label>" +
              (w ? '<button type="button" class="icon-btn" data-arow-del="' + i + '" aria-label="Supprimer la ligne ' + esc(r.fr) + '"' + (A.rows.length < 2 ? " disabled" : "") + ">" + I.trash + "</button>" : "") + "</div>";
          }).join("") + "</div>" +
          (w ? '<div><button type="button" class="btn" data-arow-add' + (A.rows.length >= MAXR ? " disabled" : "") + ">" + I.plus + "Ajouter une ligne</button></div>" : "") +
        "</div></div>" +
        (w ? '<div class="sticky-save"' + (RX.dirty ? "" : " hidden") + '><span>Modifications non enregistrées</span><div class="row"><button type="button" class="btn" data-cancel>Annuler</button><button type="submit" class="btn is-primary">Enregistrer</button></div></div>' : "") +
        "</form>";
    }
    draw();
    function changed() { RX.dirty = true; var b = $(".sticky-save", el); if (b) b.hidden = false; }

    el.addEventListener("input", function (e) {
      var t = e.target;
      if (t.matches("[data-note]")) (t.dataset.note === "clothes" ? C : A).note.fr = t.value;
      else if (t.matches("[data-col]")) C.cols[+t.dataset.col].fr = t.value;
      else if (t.matches("[data-cell]")) { var p = t.dataset.cell.split("|"); C.rows[p[0]][+p[1]] = t.value.trim(); }
      else if (t.matches("[data-arow]")) A.rows[+t.dataset.arow][t.dataset.f] = t.dataset.f === "v" ? t.value : t.value;
      else return;
      changed();
    });
    el.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("[data-col-add]")) { C.cols.push({ fr: "", en: "" }); changed(); draw(); var ins = $$("[data-col]", el); ins[ins.length - 1].focus(); return; }
      var cd = t.closest("[data-col-del]");
      if (cd) { var ci = +cd.dataset.colDel; C.cols.splice(ci, 1); DB.SIZES.forEach(function (sz) { (C.rows[sz] || []).splice(ci, 1); }); changed(); draw(); return; }
      if (t.closest("[data-arow-add]")) { A.rows.push({ fr: "", en: "", v: "" }); changed(); draw(); var ar = $$('[data-arow][data-f="fr"]', el); ar[ar.length - 1].focus(); return; }
      var rd = t.closest("[data-arow-del]");
      if (rd) { A.rows.splice(+rd.dataset.arowDel, 1); changed(); draw(); return; }
      if (t.closest("[data-cancel]")) { RX.dirty = false; RX.rerender(); return; }
      if (t.closest("[data-default]")) {
        RX.confirm({ title: "Rétablir le guide d'origine", text: "Remplacer le guide actuel par le guide fourni avec la boutique ? Vous pourrez encore annuler avant d'enregistrer.", ok: "Rétablir" }).then(function (ok) {
          if (!ok) return;
          g = DB.defaultSizeGuide(); C = g.clothes; A = g.accessories;
          [C.note, A.note].concat(C.cols, A.rows).forEach(function (o) { o._fr0 = o.fr; });
          changed(); draw();
        });
      }
    });
    el.addEventListener("submit", function (e) {
      e.preventDefault();
      var texts = [C.note, A.note].concat(C.cols, A.rows);
      texts.forEach(function (o) { o.fr = String(o.fr || "").trim(); });
      if (C.cols.some(function (c) { return !c.fr; })) { RX.toast("Donnez un nom à chaque mesure", "bad"); return; }
      if (A.rows.some(function (r) { return !r.fr || !String(r.v || "").trim(); })) { RX.toast("Chaque ligne des accessoires doit avoir une mesure et une valeur", "bad"); return; }
      var todo = texts.filter(function (o) { return o.fr !== o._fr0 || !o.en; });
      var btn = $('.sticky-save [type="submit"]', el); if (btn) { btn.disabled = true; btn.textContent = "Traduction…"; }
      (todo.length ? RX.translate(todo.map(function (o) { return o.fr; })) : Promise.resolve([])).then(function (r) {
        todo.forEach(function (o, i) { o.en = r[i] || o.fr; }); done(true);
      }, function () { todo.forEach(function (o) { o.en = ""; }); done(false); });
      function done(ok) {
        if (!ok) RX.translateFailed();
        texts.forEach(function (o) { o._fr0 = o.fr; });
        var clean = JSON.parse(JSON.stringify(g, function (k, v) { return k === "_fr0" ? undefined : v; }));
        clean.accessories.rows.forEach(function (r) { r.v = String(r.v).trim(); });
        db.settings.sizeGuide = clean;
        RX.dirty = false; RX.save("a modifié le guide des tailles", "Guide des tailles"); RX.toast("Guide des tailles publié sur le site"); draw();
      }
    });
  });
})();
