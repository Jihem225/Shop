/* ==========================================================================
   RELAXX back office — Vitrine: showcase content of the storefront
   (home page, story page, footer, SEO). Default values are read from the
   pages themselves; only the values changed here are stored.
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$;

  /* ---------- schema ---------- */
  function T(k, l, t, extra) { var o = { k: k, l: l, t: t || "text" }; for (var x in extra || {}) o[x] = extra[x]; return o; }
  function rep(n, fn) { var out = []; for (var i = 1; i <= n; i++) out = out.concat(fn(i)); return out; }
  var PAGES = {
    home: { label: "Page d'accueil", file: "index.html", url: "../index.html", sections: [
      { id: "hero", title: "Bannière principale", desc: "Grand visuel plein écran à l'ouverture du site (après la page de chargement).", fields: [
        T("home.hero.title", "Titre (une ligne par retour à la ligne)", "lines", { keepWith: "home.hero.lines" }),
        T("home.hero.lines", "Nombre de lignes du titre", "choice", { options: [["", "Comme saisi dans le titre"], ["1", "1 ligne"], ["2", "2 lignes"], ["3", "3 lignes"]], hint: "Pour un titre long : le texte est réparti sur le nombre de lignes choisi." }),
        T("home.hero.size", "Taille du titre", "choice", { options: [["s", "Petit"], ["m", "Moyen"], ["", "Grand (taille d'origine)"], ["xl", "Très grand"]] }),
        T("home.hero.color", "Couleur du texte et du bouton", "color", { hint: "Blanc sur une photo sombre, noir ou une couleur foncée sur une photo claire." }),
        T("home.hero.cta", "Texte du bouton"), T("home.hero.link", "Lien du bouton", "link"),
        T("home.hero.image", "Image ou vidéo de fond (aussi montrée à la fin de la page de chargement et à l'ouverture du menu)", "media"), T("home.hero.foot", "Mention en bas à gauche")] },
      { id: "trending", section: "home.trending", title: "Catégories tendance", desc: "Trois grandes cartes avec le badge qui suit la souris.", fields: rep(3, function (i) {
        return [T(null, "Carte " + i, "sub"), T("home.trend." + i + ".name", "Nom"), T("home.trend." + i + ".tag", "Étiquette"), T("home.trend." + i + ".ring", "Texte du badge tournant"),
          T("home.trend." + i + ".link", "Lien", "link"), T("home.trend." + i + ".image", "Image", "img")]; }) },
      { id: "collection", section: "home.collection", title: "Collection « Choisis avec soin »", desc: "Grille de produits à onglets. L'onglet « Tout » montre votre sélection.", fields: [
        T("home.collection.title", "Titre"), T("home.collection.button", "Texte du bouton")], picks: { key: "collection", n: 6, label: "Produits de l'onglet « Tout » (6)" } },
      { id: "story", section: "home.story", title: "Notre histoire (accueil)", desc: "Section à défilement : deux panneaux de texte et deux images.", fields: [
        T("home.story.title", "Titre de la section")].concat(rep(2, function (i) {
          return [T(null, "Panneau " + i + (i === 1 ? " (noir)" : " (blanc)"), "sub"), T("home.story." + i + ".title", "Titre"), T("home.story." + i + ".text", "Texte", "long"), T("home.story." + i + ".image", "Image", "img")]; }))
        .concat([T("home.story.button", "Texte du bouton « Lire toute notre histoire »")]) },
      { id: "reviews", section: "home.reviews", title: "Avis mis en avant « Portés & aimés »", desc: "Carrousel de cinq avis, chacun lié à un produit du catalogue.", fields: [
        T("home.reviews.kicker", "Surtitre"), T("home.reviews.title", "Titre"), T("home.reviews.intro", "Introduction", "long")].concat(rep(5, function (i) {
          return [T(null, "Avis " + i, "sub"), T("home.reviews." + i + ".quote", "Citation", "long"), T("home.reviews." + i + ".name", "Nom"), T("home.reviews." + i + ".city", "Ville"),
            T("home.reviews." + i + ".product", "Produit porté", "product"), T("home.reviews." + i + ".image", "Photo", "img")]; })) },
      { id: "accessories", section: "home.accessories", title: "Nos accessoires", desc: "Trois produits mis en avant avec leur nom et leur prix.", fields: [
        T("home.accessories.title", "Titre"), T("home.accessories.button", "Texte du bouton")], picks: { key: "accessories", n: 3, label: "Produits affichés (3)" } },
      { id: "newsletter", section: "home.newsletter", title: "Bannière newsletter", fields: [
        T("home.newsletter.title", "Titre"), T("home.newsletter.text", "Texte", "long"), T("home.newsletter.placeholder", "Texte d'aide du champ e-mail"), T("home.newsletter.button", "Texte du bouton")] },
      { id: "instagram", section: "home.instagram", title: "Galerie Instagram", desc: "Cinq photos avant le pied de page, chacune liée à sa publication Instagram.", fields: [], goto: ["instagram", "Gérer les photos et le compte Instagram"] }
    ] },
    story: { label: "Notre histoire", file: "histoire.html", url: "../histoire.html", sections: [
      { id: "shero", title: "En-tête", fields: [T("story.hero.kicker", "Surtitre"), T("story.hero.title", "Titre"), T("story.hero.lead", "Introduction", "long"), T("story.hero.image", "Grande image", "img")] },
      { id: "intro", section: "story.intro", title: "Là où tout a commencé", fields: [T("story.intro.title", "Titre"), T("story.intro.p1", "Paragraphe 1", "long"), T("story.intro.p2", "Paragraphe 2", "long")] },
      { id: "chapters", section: "story.chapters", title: "Chapitres", desc: "Trois blocs texte + image en alternance.", fields: rep(3, function (i) { return [T(null, "Chapitre " + i, "sub"), T("story.ch." + i + ".title", "Titre"), T("story.ch." + i + ".text", "Texte", "long"), T("story.ch." + i + ".image", "Image", "img")]; }) },
      { id: "values", section: "story.values", title: "Nos valeurs", fields: [T("story.values.title", "Titre")].concat(rep(4, function (i) { return [T(null, "Valeur " + i, "sub"), T("story.values." + i + ".title", "Titre"), T("story.values." + i + ".text", "Texte", "long")]; })) },
      { id: "quote", section: "story.quote", title: "Citation", fields: [T("story.quote.text", "Citation", "long"), T("story.quote.author", "Signature")] },
      { id: "cta", section: "story.cta", title: "Appel à l'action final", fields: [T("story.cta.title", "Titre"), T("story.cta.primary", "Bouton principal"), T("story.cta.secondary", "Bouton secondaire")] }
    ] },
    footer: { label: "Pied de page", file: "index.html", url: "../index.html", note: "Le pied de page est le même sur toutes les pages du site.", sections: [
      { id: "shops", title: "Bloc boutiques", fields: [T("footer.shops.title", "Titre"), T("footer.shops.button", "Texte du bouton"), T("footer.shops.link", "Lien du bouton", "link")] },
      { id: "links", title: "Liens utiles", desc: "Colonnes « Entreprise » et « Aide ». Par défaut, ils mènent aux rubriques de la page Aide (aide.html). Les catégories du pied de page suivent la liste des catégories.", fields: [["shipping", "Livraison"], ["returns", "Retours"], ["sizeguide", "Guide des tailles"], ["care", "Entretien"], ["faq", "FAQ"]].reduce(function (a, x) {
        return a.concat([T(null, x[1], "sub"), T("footer.link." + x[0], "Libellé"), T("footer.link." + x[0] + ".href", "Lien", "link")]); }, []) },
      { id: "bottom", title: "Bas de page", fields: [T("footer.copyright", "Mention de copyright"), T("footer.tagline", "Signature"), T("footer.image", "Image de fond", "img")] }
    ] },
    instagram: { label: "Instagram", url: "../index.html", custom: "vitrineInstagram" },
    seo: { label: "Référencement", seo: [["index", "Page d'accueil", "index.html"], ["shop", "Boutique", "shop.html"], ["histoire", "Notre histoire", "histoire.html"]] }
  };
  var LINKS = ["index.html", "shop.html", "shop.html#outerwear", "shop.html#knitwear", "shop.html#dresses", "shop.html#shirts", "shop.html#trousers", "shop.html#accessories", "histoire.html", "aide.html", "aide.html#livraison", "aide.html#retours", "aide.html#tailles", "aide.html#entretien", "aide.html#faq", "aide.html#contact", "aide.html#boutique", "checkout.html", "cgv.html", "cgu.html", "confidentialite.html"];

  /* ---------- defaults read from the pages ---------- */
  var cache = {};
  function loadDefaults(file) {
    if (cache[file]) return Promise.resolve(cache[file]);
    return fetch("../" + file, { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (src) {
      var dict = {}; try { dict = JSON.parse(src.match(/var DICT = (\{.*?\});\n/s)[1]); } catch (e) {}
      var doc = new DOMParser().parseFromString(src, "text/html"), out = {};
      var tr = function (s) { var k = String(s).replace(/\s+/g, " ").trim(); return dict[k] != null ? dict[k] : k; };
      $$("[data-cms]", doc).forEach(function (el) {
        var k = el.getAttribute("data-cms"), t = el.getAttribute("data-cms-type") || "text";
        if (out[k]) return;
        if (t === "img" || t === "media") out[k] = { v: el.getAttribute("src") };
        else if (t === "rvproduct") { var m = /id=(\d+)/.exec(el.getAttribute("href") || ""); out[k] = { v: m ? +m[1] : 0 }; }
        else {
          var en = t === "lines" ? el.innerHTML.split(/<br\s*\/?>/i).map(function (x) { return x.replace(/<[^>]+>/g, "").trim(); }).join("\n")
            : t === "placeholder" ? el.getAttribute("placeholder") : t === "ring" ? el.getAttribute("data-label") : el.textContent.replace(/\s+/g, " ").trim();
          out[k] = { en: en, fr: t === "lines" ? en.split("\n").map(tr).join("\n") : tr(en) };
        }
      });
      $$("[data-cms-href]", doc).forEach(function (el) { var k = el.getAttribute("data-cms-href"); if (!out[k]) out[k] = { v: el.getAttribute("href") }; });
      var ti = doc.querySelector("title"), md = doc.querySelector('meta[name="description"]');
      out.__title = { en: ti ? ti.textContent : "", fr: ti ? tr(ti.textContent) : "" };
      out.__desc = { en: md ? md.getAttribute("content") : "", fr: md ? tr(md.getAttribute("content")) : "" };
      cache[file] = out; return out;
    });
  }

  /* ---------- view ---------- */
  var tab = "home";
  RX.route("/vitrine", "content", function (el, params, q) {
    if (q.tab && PAGES[q.tab]) tab = q.tab;
    var w = RX.canWrite("content"), dis = w ? "" : " disabled", db = RX.db(), V = db.settings.vitrine;
    var P = PAGES[tab];
    el.innerHTML =
      '<div class="ph"><div><h1>Vitrine du site</h1><p>Textes, images, liens, produits mis en avant et sections affichées sur la boutique. Écrivez en français : la version anglaise est traduite automatiquement à la publication.</p></div>' +
      '<div class="ph-actions">' + RX.readOnly("content") + (P.url ? '<button type="button" class="btn" data-preview>' + I.eye + 'Aperçu</button><a class="btn" href="' + P.url + '" target="_blank" rel="noopener">' + I.ext + "Ouvrir la page</a>" : "") + "</div></div>" +
      '<div class="card" style="margin-bottom:18px"><div class="tabs" role="tablist">' + Object.keys(PAGES).map(function (k) { return '<button type="button" role="tab" data-tab="' + k + '" aria-selected="' + (k === tab) + '">' + PAGES[k].label + "</button>"; }).join("") +
      '<a class="btn is-sm" href="#/content" style="margin:8px 4px 8px auto;align-self:center">' + I.megaphone + "Annonce & maintenance</a></div>" +
      (P.note ? '<div class="card-b" style="padding:12px 18px;font-size:13px;color:var(--muted)">' + esc(P.note) + "</div>" : "") + "</div>" +
      '<form data-form><div data-body class="stack"><div class="card">' + RX.empty("Chargement du contenu…", "", I.refresh) + "</div></div>" + (w ? '<div class="sticky-save" hidden><span>Modifications non publiées</span><div class="row"><button type="button" class="btn" data-cancel>Annuler</button><button type="submit" class="btn is-primary">Publier sur le site</button></div></div>' : "") + "</form>" +
      '<datalist id="rx-links">' + LINKS.map(function (l) { return '<option value="' + l + '">'; }).join("") + "</datalist>";

    var state = {}, defs = null, ctl = null, form = $("[data-form]", el), body = $("[data-body]", el);
    var imgs = []; RX.products(db).forEach(function (p) { if (imgs.indexOf(p.img) < 0) imgs.push(p.img); });

    if (P.custom) ctl = RX[P.custom](el, body, w, dirty);
    else if (tab === "seo") {
      Promise.all(P.seo.map(function (s) { return loadDefaults(s[2]); })).then(function (all) {
        defs = {};
        P.seo.forEach(function (s, i) {
          var cur = (V.seo || {})[s[0]] || {};
          defs["seo." + s[0] + ".title"] = all[i].__title; defs["seo." + s[0] + ".desc"] = all[i].__desc;
          state["seo." + s[0] + ".title"] = cur.title ? clone(cur.title) : clone(all[i].__title);
          state["seo." + s[0] + ".desc"] = cur.desc ? clone(cur.desc) : clone(all[i].__desc);
        });
        body.innerHTML = '<div class="notice">' + I.info + "<div>Titre de l'onglet du navigateur et description affichée par Google sous le lien de la page. Idéalement : titre de 50 à 60 caractères, description de 140 à 160 caractères.</div></div>" +
          P.seo.map(function (s) {
            return '<div class="card"><div class="card-h"><div><h2>' + s[1] + '</h2><p class="mono">' + s[2] + "</p></div></div><div class=\"card-b stack\" style=\"gap:16px\">" +
              textField({ k: "seo." + s[0] + ".title", l: "Titre de la page", t: "text", max: 70 }) + textField({ k: "seo." + s[0] + ".desc", l: "Description", t: "long", max: 170 }) +
              '<div class="field"><span>Aperçu Google</span><div data-serp="' + s[0] + '" style="padding:14px 16px;border:1px solid var(--line);background:var(--surface)"></div></div></div></div>';
          }).join("");
        serp();
      });
    } else {
      loadDefaults(P.file).then(function (d) {
        defs = d;
        P.sections.forEach(function (s) {
          s.fields.forEach(function (f) { if (!f.k) return; if (!d[f.k] && isVal(f.t)) d[f.k] = { v: "" }; state[f.k] = V.fields[f.k] ? clone(V.fields[f.k]) : clone(d[f.k] || (isVal(f.t) ? { v: "" } : { fr: "", en: "" })); });
          if (s.section) state["§" + s.section] = V.sections[s.section] !== false;
          if (s.picks) state["picks." + s.picks.key] = (V.picks[s.picks.key] || DB.defaultVitrine().picks[s.picks.key]).slice();
        });
        body.innerHTML = P.sections.map(sectionCard).join("");
      }).catch(function () { body.innerHTML = '<div class="card">' + RX.empty("Impossible de lire la page", "Ouvrez le back-office depuis le serveur du site (http://…), pas en fichier local.", I.alert) + "</div>"; });
    }

    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function isVal(t) { return t === "img" || t === "media" || t === "link" || t === "product" || t === "choice" || t === "color"; }
    function changed(k) { var d = defs[k], s = state[k]; if (!d) return false; return JSON.stringify(normalize(s)) !== JSON.stringify(normalize(d)); }
    function normalize(o) { return o.v !== undefined ? { v: String(o.v) } : { fr: (o.fr || "").trim(), en: (o.en || "").trim() }; }
    // no "Rétablir l'original" link next to the fields: a content is changed again and published, not reset
    function resetBtn() { return ""; }

    function sectionCard(s) {
      return '<div class="card" id="v-' + s.id + '"><div class="card-h"><div><h2>' + esc(s.title) + "</h2>" + (s.desc ? "<p>" + esc(s.desc) + "</p>" : "") + "</div>" +
        (s.section ? '<label class="switch"><input type="checkbox" data-section="' + s.section + '"' + (state["§" + s.section] ? " checked" : "") + dis + "><i></i><b>" + (state["§" + s.section] ? "Affichée" : "Masquée") + "</b></label>" : "") + "</div>" +
        // two columns (one on a phone): headings, long texts and product selections take the whole width
        '<div class="card-b form-grid" style="align-items:start">' + s.fields.map(field).join("") + (s.picks ? picksField(s.picks) : "") +
        (s.goto ? '<div class="full"><a class="btn" href="#/vitrine?tab=' + s.goto[0] + '">' + I.arrowR + esc(s.goto[1]) + "</a></div>" : "") + "</div></div>";
    }
    function field(f) {
      if (f.t === "sub") return '<div class="full" style="margin-top:6px;padding-top:14px;border-top:1px solid var(--line);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">' + esc(f.l) + "</div>";
      if (f.t === "img" || f.t === "media") return imgField(f);
      if (f.t === "link") return '<div class="field" data-f="' + f.k + '"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(f.l) + "</span>" + resetBtn(f.k) + '</div><input class="input mono" list="rx-links" data-k="' + f.k + '" data-v value="' + esc(state[f.k].v || "") + '" placeholder="shop.html, histoire.html, https://…"' + dis + "></div>";
      if (f.t === "product") return productField(f);
      if (f.t === "choice") return '<div class="field" data-f="' + f.k + '"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(f.l) + "</span>" + resetBtn(f.k) + '</div><select class="select" aria-label="' + esc(f.l) + '" data-k="' + f.k + '" data-v data-choice' + dis + ">" +
        f.options.map(function (o) { return '<option value="' + o[0] + '"' + (String(state[f.k].v || "") === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>" + (f.hint ? '<small class="muted">' + esc(f.hint) + "</small>" : "") + "</div>";
      if (f.t === "color") return colorField(f);
      return textField(f);
    }
    // colour: white (original), black, or any colour from the picker
    function colorField(f) {
      var v = /^#[0-9a-f]{6}$/i.test(state[f.k].v || "") ? state[f.k].v.toLowerCase() : "#ffffff";
      return '<div class="field" data-f="' + f.k + '"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(f.l) + "</span>" + resetBtn(f.k) + '</div><div class="row" style="gap:8px;flex-wrap:wrap">' +
        '<input type="color" aria-label="' + esc(f.l) + '" data-k="' + f.k + '" data-v value="' + v + '" style="width:46px;height:40px;padding:2px;border:1px solid var(--line);background:var(--surface);cursor:pointer"' + dis + ">" +
        [["#ffffff", "Blanc"], ["#000000", "Noir"]].map(function (c) { return '<button type="button" class="btn is-sm" data-color="' + f.k + '" data-val="' + c[0] + '" aria-pressed="' + (v === c[0]) + '"' + dis + ">" + c[1] + "</button>"; }).join("") +
        '<span class="mono muted" data-colorval="' + f.k + '">' + v + "</span></div>" + (f.hint ? '<small class="muted">' + esc(f.hint) + "</small>" : "") + "</div>";
    }
    // French only: the English shown under the field is produced automatically when publishing
    function textField(f) {
      var s = state[f.k], big = f.t === "long" || f.t === "lines", v = esc(s.fr || ""), mx = f.max ? ' maxlength="' + f.max + '"' : "";
      return '<div class="field' + (f.t === "long" ? " full" : "") + '" data-f="' + f.k + '"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(f.l) + "</span>" +
        '<span class="row" style="gap:12px">' + (f.max ? '<small class="muted" data-count="' + f.k + ':fr">' + (s.fr || "").length + " / " + f.max + "</small>" : "") + resetBtn(f.k) + "</span></div>" +
        (big ? '<textarea class="textarea" aria-label="' + esc(f.l) + '" rows="' + (f.t === "lines" ? 2 : 3) + '" style="min-height:' + (f.t === "lines" ? 64 : 88) + 'px" data-k="' + f.k + '" data-lang="fr"' + mx + dis + ">" + v + "</textarea>"
          : '<input class="input" aria-label="' + esc(f.l) + '" data-k="' + f.k + '" data-lang="fr" value="' + v + '"' + mx + dis + ">") +
        enNote(f.k) + "</div>";
    }
    function enNote(k) { var s = state[k]; return RX.enNote(s.fr && s.en && s.en !== s.fr ? s.en : "", ' data-ennote="' + k + '"'); }
    function refreshNote(k) { var n = $('[data-ennote="' + k + '"]', el); if (n) n.outerHTML = enNote(k); }
    function storedText(k) { if (k.indexOf("seo.") === 0) { var pp = k.split("."); return ((V.seo || {})[pp[1]] || {})[pp[2]]; } return V.fields[k]; }
    function thumb(k) {
      var s = state[k], vid = RX.isVideo(s.v);
      return '<div class="mf-thumb" data-thumb="' + k + '">' + (s.v ? RX.mediaThumb(s.v, s.poster, 300) + '<span class="mf-kind">' + (vid ? "Vidéo" : DB.media.isRef(s.v) ? "Importée" : "Image") + "</span>" : "") + "</div>";
    }
    function imgField(f) {
      var v = state[f.k].v || "", media = f.t === "media";
      return '<div class="field" data-f="' + f.k + '"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(f.l) + "</span>" + resetBtn(f.k) + "</div>" +
        '<div class="media-field" data-drop="' + f.k + '" data-accept="' + (media ? "media" : "image") + '">' + thumb(f.k) +
        '<div class="stack" style="gap:8px;min-width:0">' +
          (w ? '<div class="row" style="flex-wrap:wrap"><button type="button" class="btn is-sm is-primary" data-pick="' + f.k + '">' + I.upload + (media ? "Importer ou choisir une image / une vidéo" : "Importer ou choisir une image") + "</button></div>" : "") +
          '<input class="input mono" aria-label="' + esc(f.l) + '" data-k="' + f.k + '" data-v value="' + esc(v) + '" placeholder="… ou collez un lien https://"' + dis + ">" +
          (w ? '<small class="muted">Glissez-déposez aussi un fichier sur la vignette' + (media ? " — vidéo MP4 ou WebM : muette, en boucle, lancée automatiquement" : "") + ".</small>" : "") +
        "</div></div></div>";
    }
    function setVal(k, v, poster) {
      state[k].v = v; if (poster) state[k].poster = poster; else delete state[k].poster;
      var i = $('[data-k="' + k + '"]', el); if (i) i.value = v;
      var th = $('[data-thumb="' + k + '"]', el); if (th) th.outerHTML = thumb(k);
      refreshReset(k); dirty();
    }
    function productOptions(sel) {
      return RX.products(db).map(function (p) { return '<option value="' + p.id + '"' + (+sel === p.id ? " selected" : "") + ">" + esc((p.nameFr || p.name) + " — " + p.sku + (p.status !== "active" ? " (" + RX.PSTATUS[p.status].label.toLowerCase() + ")" : "")) + "</option>"; }).join("");
    }
    function productField(f) {
      var v = state[f.k].v, p = db.products[+v] || {};
      return '<div class="field" data-f="' + f.k + '"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(f.l) + "</span>" + resetBtn(f.k) + '</div><div class="row" style="gap:12px"><img alt="" data-pthumb="' + f.k + '" src="' + RX.img(p.img, 120) + '" class="thumb">' +
        '<select class="select" data-k="' + f.k + '" data-v data-num' + dis + ">" + productOptions(v) + "</select></div></div>";
    }
    function picksField(pk) {
      var list = state["picks." + pk.key];
      return '<div class="field full"><div class="row is-between"><span style="font-size:12.5px;font-weight:600">' + esc(pk.label) + "</span>" + (w ? '<button type="button" class="link" data-reset-picks="' + pk.key + '" style="font-size:12px">Sélection d\'origine</button>' : "") + '</div><div class="grid g-3" style="gap:10px">' +
        list.map(function (id, i) { var p = db.products[id] || {}; return '<div class="row" style="gap:10px;padding:8px;border:1px solid var(--line)"><span class="mono muted" style="width:18px">' + (i + 1) + '</span><img alt="" class="thumb is-sm" src="' + RX.img(p.img, 100) + '"><select class="select" data-pick-slot="' + pk.key + ":" + i + '"' + dis + ">" + productOptions(id) + "</select></div>"; }).join("") + "</div>" +
        '<small class="muted">Les produits masqués, en brouillon ou archivés ne s\'affichent pas sur le site.</small></div>';
    }
    function serp() {
      $$("[data-serp]", el).forEach(function (box) {
        var k = box.getAttribute("data-serp"), t = state["seo." + k + ".title"], d = state["seo." + k + ".desc"];
        box.innerHTML = '<div style="color:var(--muted);font-size:12px">relaxx.example › ' + (k === "index" ? "" : k) + '</div><div style="color:#1a0dab;font-size:18px;margin:3px 0">' + esc(t.fr || t.en) + '</div><div style="color:var(--muted);font-size:13px;line-height:1.5">' + esc(d.fr || d.en) + "</div>";
      });
    }
    function dirty() { RX.dirty = true; var b = $(".sticky-save", el); if (b) b.hidden = false; }
    function refreshReset(k) { var f = $('[data-f="' + k + '"] [data-reset]', el); if (f) f.style.visibility = changed(k) ? "" : "hidden"; }

    form.addEventListener("input", function (e) {
      var t = e.target, k = t.getAttribute("data-k"); if (!k) return;
      if (t.hasAttribute("data-lang")) {
        state[k].fr = t.value;
        // the English will be translated again at publication, unless the text goes back to what it was
        var d = defs[k] || {}, prev = storedText(k), fr = t.value.trim();
        state[k].en = fr === (d.fr || "").trim() ? d.en : prev && prev.fr === fr ? prev.en : "";
        refreshNote(k);
      }
      else { state[k].v = t.hasAttribute("data-num") ? +t.value : t.value.trim(); delete state[k].poster; }
      var cv = $('[data-colorval="' + k + '"]', el); if (cv) { cv.textContent = t.value; $$('[data-color="' + k + '"]', el).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.val === t.value ? "true" : "false"); }); }
      var th = $('[data-thumb="' + k + '"]', el); if (th) th.outerHTML = thumb(k);
      var c = $('[data-count="' + k + ":" + t.getAttribute("data-lang") + '"]', el); if (c) c.textContent = t.value.length + c.textContent.replace(/^\d+/, "");
      if (tab === "seo") serp();
      refreshReset(k); dirty();
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.matches("[data-section]")) { state["§" + t.dataset.section] = t.checked; t.nextElementSibling.nextElementSibling.textContent = t.checked ? "Affichée" : "Masquée"; dirty(); }
      if (t.matches("[data-pick-slot]")) { var p = t.dataset.pickSlot.split(":"); state["picks." + p[0]][+p[1]] = +t.value; t.previousElementSibling.src = RX.img((db.products[+t.value] || {}).img, 100); dirty(); }
      if (t.matches("select[data-choice]")) { var ck = t.getAttribute("data-k"); state[ck].v = t.value; refreshReset(ck); dirty(); return; }
      if (t.matches("select[data-k]")) { var k = t.getAttribute("data-k"); state[k].v = +t.value; var pt = $('[data-pthumb="' + k + '"]', el); if (pt) pt.src = RX.img((db.products[+t.value] || {}).img, 120); refreshReset(k); dirty(); }
    });
    el.addEventListener("click", function (e) {
      var t = e.target;
      var tb = t.closest("[data-tab]"); if (tb) { location.hash = "#/vitrine?tab=" + tb.dataset.tab; return; }
      if (t.closest("[data-cancel]")) { RX.dirty = false; RX.rerender(); return; }
      if (t.closest("[data-preview]")) { preview(); return; }
      var rs = t.closest("[data-reset]");
      if (rs) {
        var k = rs.dataset.reset; state[k] = clone(defs[k]);
        var wrap = $('[data-f="' + k + '"]', el), f = findField(k);
        if (wrap && f) { var tmp = document.createElement("div"); tmp.innerHTML = field(f); wrap.replaceWith(tmp.firstChild); }
        dirty(); return;
      }
      var rp = t.closest("[data-reset-picks]");
      if (rp) { var key = rp.dataset.resetPicks; state["picks." + key] = DB.defaultVitrine().picks[key].slice(); var sec = P.sections.filter(function (s) { return s.picks && s.picks.key === key; })[0]; $("#v-" + sec.id, el).outerHTML = sectionCard(sec); dirty(); return; }
      var cb = t.closest("[data-color]");
      if (cb) { var ckey = cb.dataset.color; state[ckey].v = cb.dataset.val; var cw = $('[data-f="' + ckey + '"]', el), cf = findField(ckey); if (cw && cf) { var ct = document.createElement("div"); ct.innerHTML = field(cf); cw.replaceWith(ct.firstChild); } dirty(); return; }
      var pk = t.closest("[data-pick]"); if (pk) picker(pk.dataset.pick);
    });
    function findField(k) { var out = null; (P.sections || []).forEach(function (s) { s.fields.forEach(function (f) { if (f.k === k) out = f; }); }); if (!out && /^seo\./.test(k)) out = { k: k, l: /title$/.test(k) ? "Titre de la page" : "Description", t: /title$/.test(k) ? "text" : "long", max: /title$/.test(k) ? 70 : 170 }; return out; }
    function picker(k) {
      var pageImgs = []; Object.keys(defs).forEach(function (x) { if (defs[x] && defs[x].v && /\/\/images\.unsplash\.com|^photo-/.test(defs[x].v) && pageImgs.indexOf(defs[x].v) < 0) pageImgs.push(defs[x].v); });
      var f = findField(k);
      RX.pickMedia({ accept: f && f.t === "media" ? "media" : "image", current: state[k].v, title: f ? f.l.replace(/\s*\(.*\)$/, "") : "",
        groups: [{ label: "Images de cette page", items: pageImgs }, { label: "Photos du catalogue", items: imgs.filter(function (i) { return pageImgs.indexOf(i) < 0; }) }],
        onPick: function (v, info) { setVal(k, v, info.poster); } });
    }
    // drag & drop a file straight onto an image field
    el.addEventListener("dragover", function (e) { var d = e.target.closest && e.target.closest("[data-drop]"); if (!d || !w) return; e.preventDefault(); d.classList.add("is-drop"); });
    el.addEventListener("dragleave", function (e) { var d = e.target.closest && e.target.closest("[data-drop]"); if (d && !d.contains(e.relatedTarget)) d.classList.remove("is-drop"); });
    el.addEventListener("drop", function (e) {
      var d = e.target.closest && e.target.closest("[data-drop]"); if (!d || !w) return;
      e.preventDefault(); d.classList.remove("is-drop");
      var file = e.dataTransfer && e.dataTransfer.files[0]; if (!file) return;
      RX.toast("Import de « " + file.name + " »…");
      RX.uploadMedia(file, d.dataset.accept).then(function (r) { setVal(d.dataset.drop, r.ref, r.poster); RX.toast("Fichier importé dans la médiathèque"); }, function (err) { RX.toast(err.message, "bad"); });
    });
    function preview() {
      var go = function () {
        var src = P.url || "../index.html";
        RX.modal({ title: "Aperçu — " + P.label, size: "lg", body: '<div class="row" style="margin-bottom:10px"><div class="seg" data-dev><button type="button" data-w="100%" aria-pressed="true">Ordinateur</button><button type="button" data-w="390px" aria-pressed="false">Mobile</button></div><a class="btn is-sm" href="' + src + '" target="_blank" rel="noopener" style="margin-left:auto">' + I.ext + "Nouvel onglet</a></div>" +
          '<div style="display:flex;justify-content:center;background:var(--grey-soft)"><iframe title="Aperçu" src="' + src + '" style="width:100%;height:66vh;border:0;background:#fff;transition:width .3s"></iframe></div>', actions: [{ label: "Fermer", close: true }] });
        var mm = $(".modal:last-of-type"); if (mm) mm.addEventListener("click", function (e) { var b = e.target.closest("[data-w]"); if (!b) return; $("iframe", mm).style.width = b.dataset.w; $$("[data-w]", mm).forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
      };
      if (RX.dirty && w) RX.confirm({ title: "Publier avant l'aperçu ?", text: "L'aperçu montre le site tel qu'il est publié. Publier vos modifications maintenant ?", ok: "Publier et voir l'aperçu" }).then(function (ok) { if (ok) save().then(go); });
      else go();
    }
    var publishing = false;
    function save() {
      if (ctl) { if (w && ctl.save() !== false) { RX.dirty = false; var sb = $(".sticky-save", el); if (sb) sb.hidden = true; } return Promise.resolve(); }
      if (!w || !defs || publishing) return Promise.resolve();
      // texts changed in French and not translated yet
      var todo = Object.keys(state).filter(function (k) {
        var f = findField(k), st = state[k];
        if (!f || isVal(f.t) || !st || st.fr === undefined) return false;
        return !!(st.fr || "").trim() && !st.en;
      });
      if (!todo.length) { commit(); return Promise.resolve(); }
      var btn = $('.sticky-save [type="submit"]', el), label = btn ? btn.textContent : "";
      publishing = true; if (btn) { btn.disabled = true; btn.textContent = "Traduction en anglais…"; }
      return RX.translate(todo.map(function (k) { return state[k].fr.trim(); })).then(function (r) {
        todo.forEach(function (k, i) { state[k].en = r[i]; });
        finish(true);
      }, function () { finish(false); });
      function finish(ok) {
        publishing = false; if (btn) { btn.disabled = false; btn.textContent = label; }
        if (!ok) RX.translateFailed();
        commit(); todo.forEach(refreshNote);
      }
    }
    function commit() {
      var n = 0;
      Object.keys(state).forEach(function (k) {
        if (k.charAt(0) === "§") { var sk = k.slice(1); if (state[k]) delete V.sections[sk]; else V.sections[sk] = false; return; }
        if (k.indexOf("picks.") === 0) { V.picks[k.slice(6)] = state[k].slice(); return; }
        if (k.indexOf("seo.") === 0) {
          var parts = k.split("."), pg = parts[1], fld = parts[2]; V.seo = V.seo || {}; V.seo[pg] = V.seo[pg] || {};
          if (changed(k)) { V.seo[pg][fld] = normalize(state[k]); n++; } else delete V.seo[pg][fld];
          return;
        }
        // a text is also stored, even unchanged, when the option that reshapes it is set (the site then needs the text itself)
        var kw = (findField(k) || {}).keepWith;
        if (changed(k) || (kw && state[kw] && state[kw].v && (state[k].fr || "").trim())) { V.fields[k] = normalize(state[k]); if (isVal((findField(k) || {}).t)) { V.fields[k] = { v: state[k].v }; if (state[k].poster) V.fields[k].poster = state[k].poster; } n++; } else delete V.fields[k];
      });
      RX.dirty = false;
      RX.save("a publié la vitrine", P.label);
      var b = $(".sticky-save", el); if (b) b.hidden = true;
      $$("[data-reset]", el).forEach(function (r) { r.style.visibility = changed(r.dataset.reset) ? "" : "hidden"; });
      RX.toast("Vitrine publiée — " + P.label + " (" + n + " contenu" + (n > 1 ? "s" : "") + " personnalisé" + (n > 1 ? "s" : "") + ")");
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); save(); });
  });
})();
