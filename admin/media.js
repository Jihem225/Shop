/* ==========================================================================
   RELAXX back office — media picker and library
   One picker for every image (and the hero video) of the back office:
   upload from the computer / phone (button, drag & drop, paste), the media
   library (files uploaded before), the site's images, or a link.
   Uploaded files are stored by RelaxxDB.media (IndexedDB) and referenced
   as "media:<id>.<ext>".
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, DB = window.RelaxxDB, M = DB.media, I = RX.I, esc = RX.esc, $ = RX.$, $$ = RX.$$;
  var MAX_IMG = 25e6, MAX_VIDEO = 200e6, MAX_SIDE = 2400;
  var EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v", "video/ogg": "ogv" };
  var PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';

  RX.isVideo = function (v) { return M.isVideo(v); };
  // thumbnail markup for an image or a video value
  RX.mediaThumb = function (v, poster, w, attrs) {
    attrs = attrs || "";
    if (M.isVideo(v)) return '<video ' + attrs + ' src="' + esc(RX.img(v)) + '"' + (poster ? ' poster="' + esc(RX.img(poster, w)) + '"' : "") + ' muted loop playsinline autoplay preload="metadata"></video>';
    return '<img ' + attrs + ' alt="" src="' + esc(RX.img(v, w)) + '">';
  };
  function size(n) { return n >= 1e6 ? RX.num1(n / 1e6) + " Mo" : Math.max(1, Math.round(n / 1e3)) + " Ko"; }
  function dur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }

  /* ---------- upload: images are resized (max 2400 px) and compressed, videos get a poster frame ---------- */
  function toBlob(c, type, q) { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, type, q); }); }
  function loadImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Image illisible par le navigateur (formats acceptés : JPG, PNG, WebP, GIF, AVIF, SVG).")); };
      img.src = url;
    });
  }
  function processImage(file) {
    return loadImage(file).then(function (img) {
      var W = img.naturalWidth || 1200, H = img.naturalHeight || 1200;
      var keep = /gif|svg/.test(file.type) || (Math.max(W, H) <= MAX_SIDE && file.size <= 1.5e6);
      if (keep) return { blob: file, type: file.type, w: W, h: H };
      var k = Math.min(1, MAX_SIDE / Math.max(W, H)), c = document.createElement("canvas");
      c.width = Math.round(W * k); c.height = Math.round(H * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      // PNG may be transparent: WebP keeps the alpha channel, everything else becomes JPEG
      return toBlob(c, file.type === "image/png" ? "image/webp" : "image/jpeg", 0.86).then(function (b) {
        if (!b) return { blob: file, type: file.type, w: W, h: H };
        return { blob: b.size < file.size ? b : file, type: b.size < file.size ? b.type : file.type, w: c.width, h: c.height };
      });
    });
  }
  function processVideo(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), v = document.createElement("video"), done = false;
      var finish = function (poster) {
        if (done) return; done = true; clearTimeout(to);
        res({ blob: file, type: file.type || "video/mp4", w: v.videoWidth, h: v.videoHeight, duration: v.duration || 0, posterBlob: poster });
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      };
      var to = setTimeout(function () { finish(null); }, 12000), tries = 0;
      var len = function () { return isFinite(v.duration) && v.duration > 0 ? v.duration : 2; };
      // poster frame: 0.5 s in; many videos open on black (fade-in), so a dark frame is retried further in
      var seek = function () { try { v.currentTime = tries === 0 ? Math.min(0.5, len() / 3) : Math.min(len() * (tries === 1 ? 0.25 : 0.5), 4 * tries); } catch (e) { finish(null); } };
      var grab = function () {
        try {
          var c = document.createElement("canvas"), k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight)), x = c.getContext("2d");
          c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
          x.drawImage(v, 0, 0, c.width, c.height);
          var s = document.createElement("canvas"); s.width = s.height = 16; s.getContext("2d").drawImage(c, 0, 0, 16, 16);
          var d = s.getContext("2d").getImageData(0, 0, 16, 16).data, lum = 0;
          for (var i = 0; i < d.length; i += 4) lum += (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (lum / 256 < 14 && tries < 2) { tries++; seek(); return; }
          toBlob(c, "image/jpeg", 0.84).then(finish, function () { finish(null); });
        } catch (e) { finish(null); }
      };
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.onloadedmetadata = seek;
      // wait until the frame at the new position is actually decoded before drawing it
      v.onseeked = function () { if (v.requestVideoFrameCallback) { var once = false; v.requestVideoFrameCallback(function () { if (!once) { once = true; grab(); } }); setTimeout(function () { if (!once) { once = true; grab(); } }, 400); } else setTimeout(grab, 150); };
      v.onerror = function () {
        if (done) return; done = true; clearTimeout(to); URL.revokeObjectURL(url);
        rej(new Error("Cette vidéo ne peut pas être lue par le navigateur. Utilisez un fichier MP4 (H.264) ou WebM."));
      };
      v.src = url;
    });
  }
  // stores a file in the library; resolves { ref, poster, rec }
  RX.uploadMedia = function (file, accept) {
    var video = /^video\//.test(file.type), image = /^image\//.test(file.type);
    if (!video && !image) return Promise.reject(new Error("« " + file.name + " » n'est ni une image ni une vidéo."));
    if (video && accept === "image") return Promise.reject(new Error("Ici, seule une image est acceptée."));
    if (image && file.size > MAX_IMG) return Promise.reject(new Error("Image trop lourde (" + size(file.size) + ", maximum 25 Mo)."));
    if (video && file.size > MAX_VIDEO) return Promise.reject(new Error("Vidéo trop lourde (" + size(file.size) + ", maximum 200 Mo). Compressez-la ou raccourcissez-la."));
    var id = DB.uid("m");
    return (video ? processVideo(file) : processImage(file)).then(function (r) {
      var rec = { id: id, name: file.name, type: r.type, ext: EXT[r.type] || (video ? "mp4" : "jpg"), size: r.blob.size, w: r.w, h: r.h, duration: r.duration || 0, blob: r.blob, kind: video ? "video" : "image" };
      var posterP = r.posterBlob ? M.put({ id: id + "-p", name: file.name + " (image)", type: "image/jpeg", ext: "jpg", size: r.posterBlob.size, w: r.w, h: r.h, blob: r.posterBlob, kind: "image", posterOf: id }) : Promise.resolve("");
      return posterP.then(function (poster) {
        rec.poster = poster || "";
        return M.put(rec).then(function (ref) { return { ref: ref, poster: rec.poster, rec: rec }; });
      });
    }).catch(function (e) {
      if (e && e.name === "QuotaExceededError") throw new Error("Espace de stockage plein : supprimez des fichiers de la médiathèque.");
      throw e;
    });
  };

  // a file dropped outside a drop zone would make the browser open it and leave the back office
  ["dragover", "drop"].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      var types = e.dataTransfer && e.dataTransfer.types;
      if (!e.defaultPrevented && types && Array.prototype.indexOf.call(types, "Files") > -1) { e.preventDefault(); if (ev === "dragover") e.dataTransfer.dropEffect = "none"; }
    });
  });

  /* ---------- the picker ----------
     o.accept: "image" (default) or "media" (image or video); o.current: current value;
     o.groups: [{ label, items: [src | { src, meta }] }] extra images (site, catalogue…);
     o.onPick(value, { poster, meta, name }) */
  RX.pickMedia = function (o) {
    var accept = o.accept || "image", urls = [], lib = [];
    // photos of the site removed from this window by the team (they stay where they are already used)
    var gone = (DB.get().settings.store || {}).hiddenPhotos || [];
    o.groups = (o.groups || []).map(function (g) { return { label: g.label, items: g.items.filter(function (it) { return gone.indexOf(typeof it === "string" ? it : it.src) < 0; }) }; });
    var canDel = RX.canWrite("products") || RX.canWrite("content");
    var tabs = [["upload", "Importer"], ["library", "Médiathèque"]].concat((o.groups || []).length ? [["site", o.siteLabel || "Images du site"]] : []).concat([["link", "Lien"]]);
    var m = RX.modal({
      title: o.title || (accept === "media" ? "Choisir une image ou une vidéo" : "Choisir une image"), size: "lg", cls: "mp-modal",
      body: '<div class="mp">' +
        '<div class="seg mp-tabs" role="tablist">' + tabs.map(function (t, i) { return '<button type="button" role="tab" data-mp-tab="' + t[0] + '" aria-pressed="' + (i === 0) + '">' + t[1] + (t[0] === "library" ? ' <small data-mp-count></small>' : "") + "</button>"; }).join("") + "</div>" +
        '<div data-mp-panel="upload"><label class="mp-drop" data-mp-drop>' + I.upload +
          "<b>Glissez-déposez " + (accept === "media" ? "une image ou une vidéo" : "une image") + " ici</b><span>ou</span><span class=\"btn is-primary\">Parcourir les fichiers</span>" +
          "<small>Depuis l'ordinateur, le téléphone (galerie ou appareil photo), une clé USB ou un dossier cloud (iCloud, Google Drive, Dropbox…). Vous pouvez aussi coller une image copiée (Ctrl+V / ⌘V).</small>" +
          '<small class="muted">' + (accept === "media" ? "Images JPG, PNG, WebP, GIF, AVIF · Vidéos MP4 ou WebM (200 Mo max, idéalement moins de 15 Mo pour un chargement rapide)" : "JPG, PNG, WebP, GIF, AVIF — les grandes photos sont redimensionnées automatiquement") + "</small>" +
          '<input type="file" data-mp-file accept="' + (accept === "media" ? "image/*,video/*" : "image/*") + '" multiple hidden></label>' +
          '<div class="mp-status" data-mp-status hidden></div></div>' +
        '<div data-mp-panel="library" hidden><div class="mp-grid" data-mp-lib></div></div>' +
        ((o.groups || []).length ? '<div data-mp-panel="site" hidden class="stack">' + o.groups.map(function (g, gi) {
          return '<div class="field"><span>' + esc(g.label) + '</span><div class="mp-grid is-small">' + g.items.map(function (it, ii) {
            var src = typeof it === "string" ? it : it.src;
            return '<div class="mp-lib-item"><button type="button" class="mp-item" data-mp-site="' + gi + ":" + ii + '" aria-pressed="' + (src === o.current) + '">' + RX.mediaThumb(src, "", 240, 'loading="lazy"') + "</button>" +
              (canDel ? '<button type="button" class="icon-btn mp-del" data-mp-hide="' + gi + ":" + ii + '" aria-label="Supprimer cette photo" title="Supprimer cette photo">' + I.trash + "</button>" : "") + "</div>";
          }).join("") + "</div></div>";
        }).join("") + "</div>" : "") +
        '<div data-mp-panel="link" hidden><div class="stack" style="gap:10px"><label class="field"><span>Adresse ' + (accept === "media" ? "d'une image ou d'un fichier vidéo" : "d'une image") + '</span><div class="row"><input class="input mono" data-mp-url placeholder="https://…' + (accept === "media" ? " (.jpg, .png, .mp4, .webm…)" : "") + '"><button type="button" class="btn is-primary" data-mp-use>Utiliser</button></div></label>' +
          '<small class="muted">' + (accept === "media" ? "Pour une vidéo, donnez le lien direct du fichier (se terminant par .mp4 ou .webm) : les pages YouTube ou Vimeo ne sont pas des fichiers vidéo." : "Lien direct vers le fichier image, ou identifiant Unsplash (photo-…).") + '</small><div class="err" data-mp-err hidden></div></div></div>' +
      "</div>",
      actions: [{ label: "Annuler", close: true }],
      onClose: function () { document.removeEventListener("paste", onPaste); urls.forEach(function (u) { URL.revokeObjectURL(u); }); }
    });
    var root = m.el, status = $("[data-mp-status]", root);

    function tab(name) {
      $$("[data-mp-tab]", root).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.mpTab === name ? "true" : "false"); });
      $$("[data-mp-panel]", root).forEach(function (p) { p.hidden = p.dataset.mpPanel !== name; });
      if (name === "link") setTimeout(function () { $("[data-mp-url]", root).focus(); }, 30);
    }
    function pick(v, info) { m.close(); o.onPick(v, info || {}); }
    function busy(text, tone) { status.hidden = !text; status.className = "mp-status" + (tone ? " is-" + tone : ""); status.innerHTML = text || ""; }

    function library() {
      return M.all().then(function (all) {
        lib = all.filter(function (r) { return !r.posterOf && (accept === "media" || r.kind !== "video"); });
        var byId = {}; all.forEach(function (r) { byId[r.id] = r; });
        $("[data-mp-count]", root).textContent = lib.length ? "(" + lib.length + ")" : "";
        var box = $("[data-mp-lib]", root);
        if (!lib.length) { box.outerHTML = '<div class="mp-grid" data-mp-lib>' + RX.empty("Médiathèque vide", "Les fichiers que vous importez sont gardés ici pour être réutilisés.", I.upload) + "</div>"; return; }
        box.innerHTML = lib.map(function (r) {
          var ref = M.ref(r), thumbRec = r.kind === "video" && r.poster ? byId[M.id(r.poster)] : r;
          // file kept in this browser (blob) or in Supabase Storage (address)
          var u = thumbRec && thumbRec.blob ? URL.createObjectURL(thumbRec.blob) : thumbRec && thumbRec.url ? thumbRec.url : "";
          if (u && thumbRec.blob) urls.push(u);
          return '<div class="mp-lib-item"><button type="button" class="mp-item" data-mp-lib-pick="' + esc(ref) + '" aria-pressed="' + (ref === o.current) + '" title="' + esc(r.name) + '">' +
              (u ? '<img alt="" src="' + u + '">' : '<span class="mp-noimg">' + PLAY + "</span>") + (r.kind === "video" ? '<span class="mp-badge">' + PLAY + dur(r.duration) + "</span>" : "") + "</button>" +
            '<div class="mp-meta"><span title="' + esc(r.name) + '">' + esc(r.name) + "</span><small>" + (r.w ? r.w + "×" + r.h + " · " : "") + size(r.size) + "</small></div>" +
            '<button type="button" class="icon-btn mp-del" data-mp-del="' + esc(r.id) + '" aria-label="Supprimer ' + esc(r.name) + '">' + I.trash + "</button></div>";
        }).join("");
      }, function () { $("[data-mp-lib]", root).innerHTML = RX.empty("Médiathèque indisponible", DB.remote ? "La médiathèque n'a pas pu être chargée depuis Supabase : vérifiez la connexion." : "Le navigateur bloque le stockage local (navigation privée ?).", I.alert); });
    }

    function upload(files) {
      files = Array.prototype.slice.call(files || []).filter(Boolean);
      if (!files.length) return;
      var n = 0, first = null, errors = [];
      busy('<span class="mp-spin"></span>Import de ' + (files.length > 1 ? files.length + " fichiers" : "« " + esc(files[0].name) + " »") + "…");
      files.reduce(function (p, f) {
        return p.then(function () {
          return RX.uploadMedia(f, accept).then(function (r) { n++; if (!first) first = r; }, function (e) { errors.push(e.message); });
        });
      }, Promise.resolve()).then(function () {
        if (files.length === 1 && first) { RX.toast("Fichier importé dans la médiathèque"); pick(first.ref, { poster: first.poster, name: first.rec.name }); return; }
        busy(errors.length ? esc(errors.join(" ")) + (n ? " — " + n + " fichier(s) importé(s)." : "") : n + " fichiers importés : choisissez celui à utiliser.", errors.length ? "bad" : "ok");
        library().then(function () { if (n) tab("library"); });
      });
    }

    function onPaste(e) {
      if (m.closed) return;
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length) { e.preventDefault(); tab("upload"); upload(items); }
    }
    document.addEventListener("paste", onPaste);

    var drop = $("[data-mp-drop]", root);
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); if (ev === "dragleave" && drop.contains(e.relatedTarget)) return; drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (e) { upload(e.dataTransfer && e.dataTransfer.files); });
    $("[data-mp-file]", root).addEventListener("change", function (e) { upload(e.target.files); e.target.value = ""; });

    function useLink() {
      var v = $("[data-mp-url]", root).value.trim(), err = $("[data-mp-err]", root);
      err.hidden = true;
      if (!v) { err.hidden = false; err.textContent = "Collez une adresse."; return; }
      if (/youtu\.?be|vimeo\.com/i.test(v)) { err.hidden = false; err.textContent = "Les liens YouTube / Vimeo ne sont pas des fichiers vidéo : importez le fichier ou donnez son lien direct (.mp4, .webm)."; return; }
      if (accept === "image" && M.isVideo(v)) { err.hidden = false; err.textContent = "Ici, seule une image est acceptée."; return; }
      if (!/^https?:\/\//.test(v) && !/^photo-[\w-]+$/.test(v)) { err.hidden = false; err.textContent = "L'adresse doit commencer par https://"; return; }
      pick(v, {});
    }
    root.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.matches("[data-mp-url]")) { e.preventDefault(); useLink(); } });
    root.addEventListener("click", function (e) {
      var t = e.target, b;
      if ((b = t.closest("[data-mp-tab]"))) { tab(b.dataset.mpTab); return; }
      if (t.closest("[data-mp-use]")) { useLink(); return; }
      if ((b = t.closest("[data-mp-site]"))) { var p = b.dataset.mpSite.split(":"), it = o.groups[+p[0]].items[+p[1]]; pick(typeof it === "string" ? it : it.src, { meta: typeof it === "string" ? null : it.meta }); return; }
      if ((b = t.closest("[data-mp-lib-pick]"))) { var r = lib.filter(function (x) { return M.ref(x) === b.dataset.mpLibPick; })[0]; pick(b.dataset.mpLibPick, { poster: r && r.poster, name: r && r.name }); return; }
      if ((b = t.closest("[data-mp-hide]"))) {
        var hp = b.dataset.mpHide.split(":"), hit = o.groups[+hp[0]].items[+hp[1]], hsrc = typeof hit === "string" ? hit : hit.src, tile = b.parentNode;
        var hused = JSON.stringify(DB.get()).indexOf(JSON.stringify(hsrc)) > -1;
        RX.confirm({ title: "Supprimer cette photo ?", danger: true, ok: "Supprimer",
          text: "Elle ne sera plus proposée dans cette fenêtre." + (hused ? " Elle reste affichée là où elle est déjà utilisée (produit, couleur ou page du site) tant que vous ne la remplacez pas." : "") }).then(function (ok) {
          if (!ok) return;
          var st = DB.get().settings.store; st.hiddenPhotos = (st.hiddenPhotos || []).filter(function (x) { return x !== hsrc; }).concat([hsrc]).slice(-400);
          var wasDirty = RX.dirty; RX.save("a supprimé une photo des médias", ""); RX.dirty = wasDirty;
          tile.hidden = true; RX.toast("Photo supprimée");
        });
        return;
      }
      if ((b = t.closest("[data-mp-del]"))) {
        var rec = lib.filter(function (x) { return x.id === b.dataset.mpDel; })[0]; if (!rec) return;
        var used = JSON.stringify(DB.get()).indexOf(M.ref(rec)) > -1;
        RX.confirm({ title: "Supprimer ce fichier ?", danger: true, ok: "Supprimer",
          text: "« " + rec.name + " » sera supprimé de la médiathèque." + (used ? " Attention : il est utilisé sur le site ou dans le catalogue, il ne s'affichera plus à cet endroit." : "") }).then(function (ok) {
          if (!ok) return;
          M.remove(rec.id).then(function () { RX.toast("Fichier supprimé"); library(); });
        });
      }
    });

    library().then(function () { if (o.tab) tab(o.tab); });
    return m;
  };
})();
