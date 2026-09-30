/* ==========================================================================
   RELAXX back office — Vitrine › Instagram: the gallery before the footer.
   Either the shop's Instagram account is connected (latest posts, refreshed
   automatically) or each tile gets a photo and the link of its post by hand.
   Every tile opens its own post on Instagram.
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$;
  var TILES = 5, SECTION = "home.instagram";
  var POST_RE = /^https?:\/\/(www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/[\w-]+/i, PROFILE_RE = /^https?:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/i;
  var TYPES = { IMAGE: "Photo", VIDEO: "Vidéo", CAROUSEL_ALBUM: "Carrousel" };
  var INTERVALS = [[15, "toutes les 15 minutes"], [60, "toutes les heures"], [360, "toutes les 6 heures"], [1440, "une fois par jour"]];
  var IG_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor"/></svg>';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // keep only the address of the post (drop ?igsh=… share parameters)
  function cleanLink(v) { v = String(v || "").trim(); return POST_RE.test(v) ? v.replace(/[?#].*$/, "").replace(/\/?$/, "/") : v; }
  function linkState(v) {
    if (!v) return { tone: "muted", text: "Pas de lien : la photo ouvre votre profil Instagram." };
    if (POST_RE.test(v)) return { tone: "ok", text: "Lien de publication — la photo ouvre ce post sur Instagram." };
    if (PROFILE_RE.test(v)) return { tone: "warn", text: "C'est le lien d'un profil, pas d'une publication." };
    return { tone: "bad", text: "Ce n'est pas un lien Instagram (https://www.instagram.com/p/…)." };
  }

  RX.vitrineInstagram = function (el, body, w, dirty) {
    var dis = w ? "" : " disabled";
    var st, busy = false;
    load();

    function load() {
      var db = DB.get(), ig = db.settings.instagram || DB.defaultInstagram();
      st = { mode: ig.mode, manual: clone(ig.manual), hidden: (ig.hidden || []).slice(), interval: ig.interval || 60,
        profile: db.settings.store.instagram || "", shown: (db.settings.vitrine.sections || {})[SECTION] !== false };
    }
    function ig() { return DB.get().settings.instagram; }

    /* ---------- tiles as the site will show them (from the edited state) ---------- */
    function tiles() {
      var g = ig(), live = st.mode === "api" ? (g.posts || []).filter(function (p) { return st.hidden.indexOf(p.id) < 0; }) : [];
      var profile = st.mode === "api" && g.account && g.account.username ? "https://www.instagram.com/" + g.account.username + "/" : st.profile || "https://www.instagram.com/";
      var out = [];
      for (var i = 0; i < TILES; i++) {
        var p = live[i], m = st.manual[i];
        out.push(p ? { img: p.img, link: p.link, live: true, caption: p.caption } : { img: m.img, link: m.link || profile, live: false, caption: "" });
      }
      return out;
    }

    function render() {
      var g = ig();
      body.innerHTML =
        '<div class="card"><div class="card-h"><div><h2>Galerie Instagram</h2><p>Les cinq photos avant le pied de page de l\'accueil. Un clic sur une photo ouvre la même publication sur Instagram.</p></div>' +
          '<label class="switch"><input type="checkbox" data-ig-shown' + (st.shown ? " checked" : "") + dis + "><i></i><b>" + (st.shown ? "Affichée" : "Masquée") + "</b></label></div>" +
          '<div class="card-b stack" style="gap:16px">' +
            '<div class="field"><span>Source des photos</span><div class="seg" data-ig-mode>' +
              '<button type="button" data-mode="api" aria-pressed="' + (st.mode === "api") + '"' + dis + ">Compte Instagram connecté (automatique)</button>" +
              '<button type="button" data-mode="manual" aria-pressed="' + (st.mode === "manual") + '"' + dis + ">Sélection manuelle</button></div>" +
              '<small class="muted">' + (st.mode === "api" ? "Les cinq dernières publications du compte s'affichent sur le site : une nouvelle publication sur Instagram apparaît toute seule." : "Vous choisissez chaque photo et le lien de la publication correspondante.") + "</small></div>" +
            '<label class="field" style="max-width:560px"><span>Lien du profil Instagram de la boutique</span><input class="input mono" data-ig-profile value="' + esc(st.profile) + '" placeholder="https://www.instagram.com/relaxx/"' + dis + ">" +
              '<small class="muted">Utilisé pour les photos sans lien et pour l\'icône Instagram du site (aussi modifiable dans Réglages).</small></label>' +
          "</div></div>" +
        (st.mode === "api" ? accountCard(g) : "") +
        manualCard() +
        '<div class="card"><div class="card-h"><div><h2>Aperçu de la galerie</h2><p>Tel qu\'affiché sur le site après publication. Cliquez sur une photo pour vérifier son lien.</p></div></div><div class="card-b" data-ig-preview></div></div>';
      preview();
    }

    function accountCard(g) {
      if (!g.token || !g.account) {
        return '<div class="card"><div class="card-h"><div><h2>Connecter le compte Instagram</h2><p>Une seule fois : ensuite les publications arrivent automatiquement sur le site.</p></div>' + RX.badge("muted", "Non connecté") + "</div>" +
          '<div class="card-b stack" style="gap:16px">' +
            '<ol class="ig-steps">' +
              "<li><b>Compte professionnel.</b> Dans l'application Instagram de la boutique : Paramètres → Type de compte et outils → Passer à un compte professionnel (gratuit).</li>" +
              '<li><b>Application Meta.</b> Sur <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a>, créez une application (type « Entreprise »), ajoutez le produit « Instagram » puis ouvrez « Configuration de l\'API avec la connexion Instagram ».</li>' +
              "<li><b>Jeton d'accès.</b> Dans « Générer des jetons d'accès », ajoutez le compte de la boutique, cliquez sur « Générer le jeton », copiez-le et collez-le ci-dessous.</li>" +
            "</ol>" +
            (g.lastError ? '<div class="notice" style="border-color:var(--bad)">' + I.alert + "<div><b>Connexion impossible.</b> " + esc(g.lastError) + "</div></div>" : "") +
            '<div class="field"><span>Jeton d\'accès Instagram</span><div class="row" style="align-items:stretch"><input class="input mono" type="password" autocomplete="off" spellcheck="false" data-ig-token placeholder="IGAA…"' + dis + ">" +
              '<button type="button" class="btn is-primary" data-ig-connect' + dis + ">" + IG_ICON + "Connecter</button></div>" +
              '<small class="muted">Le jeton donne accès en lecture aux publications du compte : ne le communiquez à personne.</small><div class="err" data-ig-err hidden></div></div>' +
          "</div></div>";
      }
      var a = g.account, posts = g.posts || [], exp = g.tokenExp;
      var status = g.lastError ? RX.badge("bad", "Erreur de synchronisation") : RX.badge("ok", "Connecté");
      return '<div class="card"><div class="card-h"><div class="row" style="gap:14px">' +
          (a.avatar ? '<img alt="" src="' + esc(a.avatar) + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'">' : '<span class="avatar is-lg" style="border-radius:50%">' + IG_ICON + "</span>") +
          '<div><h2>@' + esc(a.username) + "</h2><p>" + (a.type === "BUSINESS" ? "Compte entreprise" : a.type === "MEDIA_CREATOR" ? "Compte créateur" : "Compte professionnel") + " · " + RX.num(a.count) + " publication" + (a.count > 1 ? "s" : "") + "</p></div></div>" + status + "</div>" +
        '<div class="card-b stack" style="gap:16px">' +
          (g.lastError ? '<div class="notice" style="border-color:var(--bad)">' + I.alert + "<div><b>La dernière synchronisation a échoué</b> (" + RX.rel(g.lastSync) + ") : " + esc(g.lastError) + ". Le site continue d'afficher les dernières publications récupérées. Si le jeton a expiré, déconnectez le compte et collez un nouveau jeton.</div></div>" : "") +
          '<div class="ig-meta">' +
            "<div><span>Dernière synchronisation</span><b>" + (g.lastSync ? RX.rel(g.lastSync) : "—") + "</b></div>" +
            "<div><span>Jeton d'accès</span><b>" + (exp ? "valide jusqu'au " + RX.date(exp) : "renouvelé automatiquement") + "</b></div>" +
            '<label><span>Actualisation automatique</span><select class="select" data-ig-interval' + dis + ">" + INTERVALS.map(function (x) { return '<option value="' + x[0] + '"' + (+st.interval === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>" +
          "</div>" +
          (w ? '<div class="row" style="flex-wrap:wrap"><button type="button" class="btn" data-ig-sync>' + I.refresh + "Synchroniser maintenant</button>" +
            '<a class="btn" href="https://www.instagram.com/' + esc(a.username) + '/" target="_blank" rel="noopener">' + I.ext + "Voir le profil</a>" +
            '<button type="button" class="btn is-ghost-danger" data-ig-disconnect style="margin-left:auto">Déconnecter</button></div>' : "") +
          '<div class="field"><div class="row is-between"><span>Publications récupérées (' + posts.length + ")</span><small class=\"muted\">Masquez une publication pour qu'elle ne s'affiche pas sur le site.</small></div>" +
            (posts.length ? '<div class="ig-posts">' + posts.map(postCard).join("") + "</div>" : RX.empty("Aucune publication", "Le compte ne contient pas encore de photo ou de vidéo.", I.info)) + "</div>" +
        "</div></div>";
    }

    function postCard(p) {
      var hid = st.hidden.indexOf(p.id) > -1, visible = (ig().posts || []).filter(function (x) { return st.hidden.indexOf(x.id) < 0; }), pos = visible.indexOf(p) + 1;
      return '<div class="ig-post' + (hid ? " is-hidden" : "") + '"><a href="' + esc(p.link) + '" target="_blank" rel="noopener" class="ig-post-img" title="Ouvrir sur Instagram"><img alt="" loading="lazy" src="' + esc(p.img) + '">' +
          (pos && pos <= TILES ? '<span class="ig-pos">' + pos + "</span>" : "") + "</a>" +
        '<div class="ig-post-b"><div class="row is-between"><small class="muted">' + (TYPES[p.type] || "Photo") + " · " + (p.date ? RX.dateShort(p.date) : "") + "</small>" +
          (w ? '<button type="button" class="link" data-ig-hide="' + esc(p.id) + '" style="font-size:12px">' + (hid ? "Afficher" : "Masquer") + "</button>" : "") + "</div>" +
          '<p class="ig-cap">' + esc((p.caption || "Sans légende").slice(0, 120)) + "</p></div></div>";
    }

    function manualCard() {
      var api = st.mode === "api";
      return '<div class="card"><div class="card-h"><div><h2>' + (api ? "Photos de secours" : "Les cinq photos") + "</h2><p>" +
        (api ? "Affichées si le compte a moins de cinq publications visibles ou tant qu'il n'est pas connecté." : "Pour chaque photo, collez le lien de la publication Instagram (Partager → Copier le lien).") + "</p></div></div>" +
        '<div class="card-b stack" style="gap:0">' + st.manual.map(function (m, i) {
          var ls = linkState(m.link);
          return '<div class="ig-slot" data-slot="' + i + '"><span class="mono muted">' + (i + 1) + '</span><img alt="" data-slot-thumb title="Glissez-déposez une photo ici" src="' + RX.img(m.img, 240) + '">' +
            '<div class="stack" style="gap:10px;min-width:0">' +
              '<div class="field"><span>Photo</span><div class="row"><input class="input mono" aria-label="Photo ' + (i + 1) + '" data-slot-img value="' + esc(m.img.indexOf("data:") === 0 ? "(photo importée)" : m.img) + '" placeholder="https://… ou photo-…"' + dis + ">" +
                (w ? '<button type="button" class="btn is-sm is-primary" data-slot-pick>' + I.upload + "Importer ou choisir</button>" : "") + "</div></div>" +
              '<label class="field"><span>Lien de la publication Instagram</span><input class="input mono" data-slot-link value="' + esc(m.link) + '" placeholder="https://www.instagram.com/p/…"' + dis + ">" +
                '<small class="ig-ls t-' + ls.tone + '" data-slot-ls>' + esc(ls.text) + "</small></label>" +
            "</div></div>";
        }).join("") + "</div></div>";
    }

    function preview() {
      var box = $("[data-ig-preview]", body); if (!box) return;
      box.innerHTML = (st.shown ? "" : '<div class="notice" style="margin-bottom:12px">' + I.eyeOff + "<div>La galerie est masquée : elle n'apparaît pas sur le site.</div></div>") +
        '<div class="ig-strip">' + tiles().map(function (t) {
          return '<a href="' + esc(t.link) + '" target="_blank" rel="noopener" title="' + esc(t.link) + '"><img alt="" src="' + esc(RX.img(t.img, 300)) + '"><span>' + (t.live ? "Publication" : POST_RE.test(t.link) ? "Publication" : "Profil") + "</span></a>";
        }).join("") + "</div>";
    }

    function refreshSlot(i) {
      var s = $('[data-slot="' + i + '"]', body); if (!s) return;
      var ls = linkState(st.manual[i].link), l = $("[data-slot-ls]", s);
      l.className = "ig-ls t-" + ls.tone; l.textContent = ls.text;
      $("[data-slot-thumb]", s).src = RX.img(st.manual[i].img, 240);
    }
    function setImg(i, v) { st.manual[i].img = v; var inp = $('[data-slot="' + i + '"] [data-slot-img]', body); if (inp) inp.value = v.indexOf("data:") === 0 ? "(photo importée)" : v; refreshSlot(i); preview(); dirty(); }

    /* ---------- events ---------- */
    body.addEventListener("input", function (e) {
      var t = e.target, s = t.closest("[data-slot]");
      if (t.matches("[data-ig-profile]")) { st.profile = t.value.trim(); preview(); dirty(); return; }
      if (!s) return;
      var i = +s.dataset.slot;
      if (t.matches("[data-slot-img]")) { if (t.value !== "(photo importée)") st.manual[i].img = t.value.trim(); }
      if (t.matches("[data-slot-link]")) st.manual[i].link = t.value.trim();
      refreshSlot(i); preview(); dirty();
    });
    body.addEventListener("change", function (e) {
      var t = e.target;
      if (t.matches("[data-ig-shown]")) { st.shown = t.checked; t.parentNode.querySelector("b").textContent = t.checked ? "Affichée" : "Masquée"; preview(); dirty(); }
      if (t.matches("[data-ig-interval]")) { st.interval = +t.value; dirty(); }
      if (t.matches("[data-slot-link]")) { var i = +t.closest("[data-slot]").dataset.slot, c = cleanLink(t.value); if (c !== t.value) { t.value = c; st.manual[i].link = c; refreshSlot(i); preview(); } }
    });
    body.addEventListener("click", function (e) {
      var t = e.target, b;
      if ((b = t.closest("[data-mode]")) && w) { if (st.mode !== b.dataset.mode) { st.mode = b.dataset.mode; dirty(); render(); } return; }
      if ((b = t.closest("[data-ig-hide]"))) {
        var id = b.dataset.igHide, k = st.hidden.indexOf(id);
        if (k > -1) st.hidden.splice(k, 1); else st.hidden.push(id);
        dirty(); var sy = scrollY; render(); scrollTo(0, sy); return;
      }
      if (t.closest("[data-slot-pick]")) { picker(+t.closest("[data-slot]").dataset.slot); return; }
      if (t.closest("[data-ig-connect]")) { connect(); return; }
      if (t.closest("[data-ig-sync]")) { sync(t.closest("[data-ig-sync]")); return; }
      if (t.closest("[data-ig-disconnect]")) {
        RX.confirm({ title: "Déconnecter Instagram ?", text: "Le jeton est effacé et le site affiche à nouveau vos photos manuelles. Vous pourrez reconnecter le compte à tout moment.", ok: "Déconnecter", danger: true }).then(function (ok) {
          if (!ok) return;
          DB.instaDisconnect(); st.mode = "manual"; RX.log("a déconnecté le compte Instagram", "Vitrine"); RX.toast("Compte Instagram déconnecté"); render();
        });
      }
    });
    body.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.matches("[data-ig-token]")) { e.preventDefault(); connect(); } });

    function connect() {
      var inp = $("[data-ig-token]", body), err = $("[data-ig-err]", body), btn = $("[data-ig-connect]", body);
      if (busy || !inp) return;
      if (!inp.value.trim()) { err.hidden = false; err.textContent = "Collez le jeton d'accès généré dans votre application Meta."; inp.focus(); return; }
      busy = true; btn.disabled = true; btn.innerHTML = I.refresh + "Connexion…"; err.hidden = true;
      DB.instaConnect(inp.value).then(function (r) {
        busy = false; st.mode = "api"; st.profile = DB.get().settings.store.instagram;
        RX.log("a connecté le compte Instagram", "@" + r.account.username);
        RX.toast("Instagram connecté : @" + r.account.username + " — " + r.posts.length + " publication" + (r.posts.length > 1 ? "s" : "") + " récupérée" + (r.posts.length > 1 ? "s" : ""));
        render();
      }, function (e) {
        busy = false; btn.disabled = false; btn.innerHTML = IG_ICON + "Connecter";
        err.hidden = false;
        err.textContent = e.code === 190 ? "Ce jeton n'est pas valide ou a expiré. Générez-en un nouveau dans votre application Meta." :
          /fetch|network|Failed/i.test(e.message) ? "Instagram est injoignable. Vérifiez la connexion Internet et réessayez." : "Instagram a refusé la connexion : " + e.message;
      });
    }
    function sync(btn) {
      if (busy) return; busy = true; btn.disabled = true; btn.innerHTML = I.refresh + "Synchronisation…";
      DB.instaSync().then(function (r) { busy = false; RX.toast("Synchronisé — " + r.posts.length + " publication" + (r.posts.length > 1 ? "s" : "")); render(); },
        function () { busy = false; RX.toast("La synchronisation a échoué", "bad"); render(); });
    }

    function picker(i) {
      var posts = (ig().posts || []).map(function (p) { return { src: p.img, meta: p }; }), site = [], add = function (v) { if (v && site.indexOf(v) < 0) site.push(v); };
      DB.defaultInstagram().manual.forEach(function (m) { add(m.img); });
      DB.get().products.forEach(function (p) { add(p.img); });
      RX.pickMedia({ title: "Photo " + (i + 1) + " de la galerie", current: st.manual[i].img,
        groups: (posts.length ? [{ label: "Vos publications Instagram (reprend aussi le lien)", items: posts }] : []).concat([{ label: "Images du site et du catalogue", items: site }]),
        onPick: function (v, info) {
          // picking one of the account's posts also takes its link
          if (info.meta && info.meta.link) { st.manual[i].link = info.meta.link; var li = $('[data-slot="' + i + '"] [data-slot-link]', body); if (li) li.value = info.meta.link; }
          setImg(i, v);
        } });
    }
    body.addEventListener("dragover", function (e) { var s = e.target.closest && e.target.closest("[data-slot]"); if (s && w) { e.preventDefault(); s.classList.add("is-drop"); } });
    body.addEventListener("dragleave", function (e) { var s = e.target.closest && e.target.closest("[data-slot]"); if (s && !s.contains(e.relatedTarget)) s.classList.remove("is-drop"); });
    body.addEventListener("drop", function (e) {
      var s = e.target.closest && e.target.closest("[data-slot]"); if (!s || !w) return;
      e.preventDefault(); s.classList.remove("is-drop");
      var f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return;
      RX.uploadMedia(f, "image").then(function (r) { setImg(+s.dataset.slot, r.ref); RX.toast("Photo importée"); }, function (err) { RX.toast(err.message, "bad"); });
    });

    function save() {
      if (!w) return;
      var bad = st.manual.map(function (m, i) { return linkState(m.link).tone === "bad" ? i + 1 : 0; }).filter(Boolean);
      if (bad.length) { RX.toast("Lien non valide pour la photo " + bad.join(", ") + " : collez le lien d'une publication Instagram.", "bad"); return false; }
      if (st.profile && !/^https?:\/\//.test(st.profile)) { RX.toast("Le lien du profil doit commencer par https://", "bad"); return false; }
      try {
        DB.update(function (db) {
          var g = db.settings.instagram;
          g.mode = st.mode; g.manual = clone(st.manual); g.hidden = st.hidden.slice(); g.interval = st.interval;
          if (!(st.mode === "api" && g.account && g.account.username)) db.settings.store.instagram = st.profile;
          var sec = db.settings.vitrine.sections; if (st.shown) delete sec[SECTION]; else sec[SECTION] = false;
        });
        // the data layer drops a write that does not fit in the browser storage: check it really landed
        var saved = JSON.parse(localStorage.getItem(DB.KEY)).settings.instagram;
        if (JSON.stringify(saved.manual) !== JSON.stringify(st.manual)) throw new Error("quota");
      } catch (e) { DB.reload(); RX.toast("Enregistrement impossible : l'espace de stockage du navigateur est plein. Utilisez des liens d'images plutôt que des photos importées.", "bad"); return false; }
      RX.log("a publié la galerie Instagram", "Vitrine");
      RX.toast("Galerie Instagram publiée sur le site");
      return true;
    }

    render();
    // opening the tab refreshes a connected account whose posts are older than the chosen interval
    var g0 = ig();
    if (g0.mode === "api" && g0.token && Date.now() - (g0.lastSync || 0) > (g0.interval || 60) * 60000) DB.instaSync().then(render, render);

    return { save: save };
  };
})();
