/* ==========================================================================
   RELAXX — shared data layer (storefront + back office)

   Everything the back office manages lives in one JSON document in
   localStorage ("relaxx-db"): catalogue, stock, categories, orders,
   customers, reviews, promo codes, shipping, payments, content, team,
   activity log and visit statistics. The storefront reads it (prices,
   stock, promo codes, delivery rates, payment methods, announcement bar,
   maintenance mode) and writes to it (orders, reviews, newsletter sign-ups,
   page views).

   This is a front-end demo store: on a live site these calls map one-to-one
   to a server API (the storage is per browser and anyone can edit it).
   ========================================================================== */
(function () {
  "use strict";
  var KEY = "relaxx-db", VERSION = 1, DAY = 864e5;
  var hasLS = (function () { try { localStorage.setItem("__rx", "1"); localStorage.removeItem("__rx"); return true; } catch (e) { return false; } })();
  // cart, wishlist and language used to be stored under "woven-*": move them to "relaxx-*" once
  if (hasLS) ["lang", "cart", "wish"].forEach(function (k) {
    try { var old = localStorage.getItem("woven-" + k); if (old !== null) { if (localStorage.getItem("relaxx-" + k) === null) localStorage.setItem("relaxx-" + k, old); localStorage.removeItem("woven-" + k); } } catch (e) {}
  });

  /* ---------- media library (images and videos uploaded in the back office) ----------
     Files live in IndexedDB ("relaxx-media"); the data refers to them as "media:<id>.<ext>".
     sw.js serves them at media/<id>.<ext>, so they behave like any other image or video address.
     Until the service worker controls the page (very first visit), elements read the file directly. */
  var MDB = "relaxx-media", VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)([?#]|$)/i;
  function idb() {
    return new Promise(function (res, rej) {
      if (typeof indexedDB === "undefined") return rej(new Error("IndexedDB indisponible"));
      var r = indexedDB.open(MDB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("files", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function mstore(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction("files", mode), q = fn(t.objectStore("files"));
        t.oncomplete = function () { res(q ? q.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error || new Error("IndexedDB")); };
      });
    });
  }
  // this browser only (no Supabase): files in IndexedDB, referenced as "media:<id>.<ext>" and served by sw.js
  var mediaLocal = {
    put: function (rec) { rec.created = rec.created || Date.now(); return mstore("readwrite", function (s) { return s.put(rec); }).then(function () { return media.ref(rec); }); },
    get: function (id) { return mstore("readonly", function (s) { return s.get(id); }); },
    all: function () { return mstore("readonly", function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.created - a.created; }); }); },
    remove: function (id) { return media.get(id).then(function (r) { return mstore("readwrite", function (s) { s.delete(id); if (r && r.poster) s.delete(media.id(r.poster)); return null; }); }); }
  };
  // Supabase: files in the public bucket "media", their details (name, size, poster…) in documents of the "media" collection
  function storagePath(rec) { return rec.id + "." + (rec.ext || "bin"); }
  function storageUrl(path) { return SUPA.url + "/storage/v1/object/public/media/" + path; }
  var mediaRemote = {
    put: function (rec) {
      var path = storagePath(rec), meta = {};
      for (var k in rec) if (k !== "blob") meta[k] = rec[k];
      meta.created = meta.created || Date.now(); meta.url = storageUrl(path); meta.path = path;
      return auth.token().then(function (tok) {
        return fetch(SUPA.url + "/storage/v1/object/media/" + path, { method: "POST", body: rec.blob,
          headers: { apikey: SUPA.key, Authorization: "Bearer " + tok, "Content-Type": rec.type || "application/octet-stream", "x-upsert": "true", "cache-control": "31536000" } });
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { var j = {}; try { j = JSON.parse(t); } catch (e) {} throw new Error("Envoi du fichier impossible : " + (j.message || j.error || "HTTP " + r.status)); });
        return api("/rest/v1/rx_docs?on_conflict=coll,key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: [{ coll: "media", key: rec.id, data: meta }] });
      }).then(function () { return meta.url; });
    },
    get: function (id) { return api("/rest/v1/rx_docs?select=data&coll=eq.media&key=eq." + encodeURIComponent(id)).then(function (r) { return r.data && r.data[0] ? r.data[0].data : null; }); },
    all: function () { return fetchAll("/rest/v1/rx_docs?select=data&coll=eq.media").then(function (rows) { return rows.map(function (r) { return r.data; }).sort(function (a, b) { return b.created - a.created; }); }); },
    remove: function (id) {
      return mediaRemote.get(id).then(function (r) {
        var ids = [id], paths = r ? [r.path || storagePath(r)] : [];
        if (r && r.poster) { ids.push(media.id(r.poster)); paths.push(String(r.poster).split("/media/").pop()); }
        return api("/storage/v1/object/media", { method: "DELETE", body: { prefixes: paths } }).catch(function () {})
          .then(function () { return api("/rest/v1/rx_docs?coll=eq.media&key=in.(" + encodeURIComponent(ids.map(quoteKey).join(",")) + ")", { method: "DELETE", headers: { Prefer: "return=minimal" } }); });
      });
    }
  };
  var media = {
    isRef: function (v) { return /^media:/.test(v || ""); },
    isVideo: function (v) { return VIDEO_RE.test(v || ""); },
    // id of a file: "media:<id>.<ext>" (this browser) or …/media/<id>.<ext> (Supabase)
    id: function (v) { var m = /^media:([\w-]+)/.exec(v || "") || /\/media\/([\w-]+)\.\w+(?:[?#]|$)/.exec(v || ""); return m ? m[1] : ""; },
    ref: function (rec) { return rec.url || "media:" + rec.id + "." + (rec.ext || "bin"); },
    url: function (v, base) { return (base || "") + "media/" + String(v).slice(6); },
    put: function (rec) { return (REMOTE ? mediaRemote : mediaLocal).put(rec); },
    get: function (id) { return (REMOTE ? mediaRemote : mediaLocal).get(id); },
    all: function () { return (REMOTE ? mediaRemote : mediaLocal).all(); },
    remove: function (id) { return (REMOTE ? mediaRemote : mediaLocal).remove(id); }
  };
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register(new URL("sw.js", (document.currentScript && document.currentScript.src) || location.href).href).catch(function () {}); } catch (e) {}
  }
  if (typeof document !== "undefined") {
    // an uploaded file that failed to load (service worker not active yet): read it straight from IndexedDB
    document.addEventListener("error", function (e) {
      var t = e.target, m;
      if (!t || !/^(IMG|VIDEO|SOURCE)$/.test(t.tagName) || t.__rxMedia) return;
      var u = (t.currentSrc || t.src || "").split(/[?#]/)[0];
      if (u.indexOf(location.origin + "/") !== 0) return; // only files of this site (not Supabase addresses)
      m = /\/media\/([\w-]+)\.\w+$/.exec(u);
      if (!m) return;
      t.__rxMedia = 1;
      media.get(m[1]).then(function (r) { if (r && r.blob) { t.src = URL.createObjectURL(r.blob); if (t.tagName === "VIDEO" && t.autoplay) { var p = t.play(); if (p && p.catch) p.catch(function () {}); } } }, function () {});
    }, true);
  }

  /* ---------- base catalogue (id = position; prices in CFA francs) ---------- */
  var CATALOG = [
    ["outerwear","Camel Wrap Coat",115000,0,"Best Selling","photo-1632149877166-f75d49000351","Manteau portefeuille camel"],
    ["outerwear","Double-Breasted Coat",130000,0,"Best Selling","photo-1589278042662-e60081fcb3d8","Manteau croisé"],
    ["outerwear","Belted Trench",100000,0,"","photo-1607624333627-98090c0992c6","Trench ceinturé"],
    ["outerwear","Wool Overcoat",120000,150000,"On Sale","photo-1601762319935-963f5b1869ad","Pardessus en laine"],
    ["outerwear","Cropped Jacket",75000,0,"","photo-1715951630125-a79ad3c5de19","Veste courte"],
    ["outerwear","Longline Coat",135000,0,"New Collection","photo-1699877902199-49e09649e458","Manteau long"],
    ["knitwear","Cable Knit Sweater",60000,0,"","photo-1580331451062-99ff652288d7","Pull torsadé"],
    ["knitwear","Merino Crewneck",55000,70000,"On Sale","photo-1589359425603-dfe010cf3ffa","Pull col rond en mérinos"],
    ["knitwear","Ribbed Turtleneck",45000,0,"","photo-1634499913011-86108564b787","Col roulé côtelé"],
    ["knitwear","Chunky Cardigan",70000,0,"","photo-1515511624704-b8916dcc30ea","Gilet en grosse maille"],
    ["knitwear","Mohair Pullover",75000,0,"New Collection","photo-1608975321561-176c1b187d24","Pull en mohair"],
    ["knitwear","Cashmere V-Neck",90000,0,"","photo-1765915481891-28d11ac65740","Pull col V en cachemire"],
    ["dresses","Silk Slip Dress",85000,0,"Best Selling","photo-1704627363852-484e95695411","Robe nuisette en soie"],
    ["dresses","Wrap Midi Dress",70000,0,"","photo-1702017634883-8392c239ea2c","Robe portefeuille midi"],
    ["dresses","Pleated Maxi Dress",95000,115000,"On Sale","photo-1785436859380-f22f139cc212","Robe longue plissée"],
    ["dresses","Satin Evening Dress",105000,0,"","photo-1783013953094-249d033e3cf9","Robe de soirée en satin"],
    ["dresses","Linen Shirt Dress",65000,0,"New Collection","photo-1771620955230-6a730e187158","Robe chemise en lin"],
    ["dresses","Knit Column Dress",75000,0,"","photo-1768818590457-94bc4479bdbb","Robe colonne en maille"],
    ["shirts","Oversized Linen Shirt",45000,0,"Best Selling","photo-1713881842156-3d9ef36418cc","Chemise oversize en lin"],
    ["shirts","Poplin Button-Down",40000,55000,"On Sale","photo-1713881676551-b16f22ce4719","Chemise en popeline"],
    ["shirts","Relaxed Oxford Shirt",45000,0,"","photo-1629299342971-6ee572a039b5","Chemise Oxford décontractée"],
    ["trousers","Wide-Leg Trousers",60000,0,"New Collection","photo-1687825515654-23620796760c","Pantalon large"],
    ["trousers","Pleated Wool Trousers",70000,0,"","photo-1762343291713-0d7f83e6c2e9","Pantalon à pinces en laine"],
    ["trousers","Tailored Straight Pants",55000,75000,"On Sale","photo-1750857739910-81dda820b067","Pantalon droit tailleur"],
    ["accessories","Leather Tote",90000,0,"Best Selling","photo-1594223274512-ad4803739b7c","Cabas en cuir"],
    ["accessories","Mini Shoulder Bag",60000,0,"","photo-1560891958-68bb1fe7fb78","Mini sac porté épaule"],
    ["accessories","Structured Top-Handle",75000,0,"","photo-1571254165288-99dd71f0e352","Sac structuré à anse"]
  ];
  var CATEGORIES = [
    { key: "outerwear", label: "Outerwear", labelFr: "Manteaux" },
    { key: "knitwear", label: "Knitwear", labelFr: "Maille" },
    { key: "dresses", label: "Dresses", labelFr: "Robes" },
    { key: "shirts", label: "Shirts", labelFr: "Chemises" },
    { key: "trousers", label: "Trousers", labelFr: "Pantalons" },
    { key: "accessories", label: "Accessories", labelFr: "Accessoires" }
  ];
  var SIZES = ["XS", "S", "M", "L", "XL"];
  var COUNTRIES = [
    ["CI", "Côte d'Ivoire", "Côte d'Ivoire"], ["SN", "Senegal", "Sénégal"], ["ML", "Mali", "Mali"], ["BF", "Burkina Faso", "Burkina Faso"],
    ["BJ", "Benin", "Bénin"], ["TG", "Togo", "Togo"], ["NE", "Niger", "Niger"], ["GW", "Guinea-Bissau", "Guinée-Bissau"],
    ["CM", "Cameroon", "Cameroun"], ["GA", "Gabon", "Gabon"], ["CG", "Congo", "Congo"], ["TD", "Chad", "Tchad"],
    ["CF", "Central African Republic", "République centrafricaine"], ["GQ", "Equatorial Guinea", "Guinée équatoriale"],
    ["FR", "France", "France"], ["BE", "Belgium", "Belgique"]
  ];
  // demo back-office account (see admin/README.md); SHA-256 of "relaxx:" + password
  var DEMO_ADMIN = { email: "admin@relaxx.example", hash: "2ce4d375760f85fc4155c3de7b0726693903edeb61f6710363efffda5f0542f0" };

  /* ---------- helpers ---------- */
  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function weighted(r, pairs) { var t = 0, i; for (i = 0; i < pairs.length; i++) t += pairs[i][1]; var x = r() * t; for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; } return pairs[0][0]; }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function sizesOf(cat) { return cat === "accessories" ? ["One size"] : SIZES; }

  /* ---------- colour variants ----------
     p.colors = [{ id, name (EN), nameFr, hex, img }] (img: optional photo of that colour)
     p.vstock = { colourId: { size: qty } }; p.stock (per size) is kept as the total over the colours,
     so everything that reads stock per size keeps working. A product without colours only has p.stock. */
  // palette each category used before colours were set per product (also the starting point of a new product)
  var CAT_COLORS = {
    outerwear: [["Camel", "Camel", "#b8905e"], ["Charcoal", "Anthracite", "#3c3c3c"], ["Ink", "Encre", "#1f2633"], ["Stone", "Pierre", "#d9cfbf"]],
    knitwear: [["Oat", "Avoine", "#d8ccb6"], ["Ecru", "Écru", "#efe8da"], ["Sage", "Sauge", "#9aa58c"], ["Black", "Noir", "#141414"]],
    dresses: [["Ink", "Encre", "#5f5436"], ["Taupe", "Taupe", "#9c8a73"], ["Black", "Noir", "#000000"], ["Sand", "Sable", "#d9ccb4"]],
    shirts: [["White", "Blanc", "#f4f2ec"], ["Sky", "Ciel", "#bcd0e0"], ["Sand", "Sable", "#d9ccb4"], ["Olive", "Olive", "#7d7a5a"]],
    trousers: [["Charcoal", "Anthracite", "#3c3c3c"], ["Camel", "Camel", "#b8905e"], ["Olive", "Olive", "#6d6a4a"], ["Black", "Noir", "#141414"]],
    accessories: [["Cognac", "Cognac", "#8a4f2a"], ["Black", "Noir", "#141414"], ["Chocolate", "Chocolat", "#4a3326"], ["Bone", "Ivoire", "#e7dfd0"]]
  };
  function colorSlug(name) { return String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "couleur"; }
  function defaultColors(cat) { return (CAT_COLORS[cat] || CAT_COLORS.outerwear).map(function (c) { return { id: colorSlug(c[0]), name: c[0], nameFr: c[1], hex: c[2], img: "" }; }); }
  function hasColors(p) { return !!(p && p.colors && p.colors.length && p.vstock); }
  // p.stock = sum of the colours, per size
  function syncStock(p) {
    if (!hasColors(p)) return p;
    var st = {};
    sizesOf(p.cat).forEach(function (s) { st[s] = p.colors.reduce(function (n, c) { return n + Math.max(0, +((p.vstock[c.id] || {})[s]) || 0); }, 0); });
    p.stock = st;
    return p;
  }
  function colorOf(p, v) {
    if (!p || !p.colors || v == null || v === "") return null;
    var k = String(v).toLowerCase();
    return p.colors.filter(function (c) { return c.id === v || c.name.toLowerCase() === k || String(c.nameFr || "").toLowerCase() === k; })[0] || null;
  }
  // stock in / out for an order line (colour may be missing on old orders: take the colour with the most units)
  function adjustStock(p, color, size, delta) {
    if (!p || !p.stock) return;
    var s = size && p.stock[size] !== undefined ? size : Object.keys(p.stock).sort(function (a, b) { return p.stock[b] - p.stock[a]; })[0];
    if (s === undefined) return;
    if (!hasColors(p)) { p.stock[s] = Math.max(0, (p.stock[s] || 0) + delta); return; }
    var c = colorOf(p, color) || p.colors.slice().sort(function (a, b) { return ((p.vstock[b.id] || {})[s] || 0) - ((p.vstock[a.id] || {})[s] || 0); })[0];
    var row = p.vstock[c.id] = p.vstock[c.id] || {};
    row[s] = Math.max(0, (row[s] || 0) + delta);
    syncStock(p);
  }
  // existing products: the category palette, each size's stock shared between the colours (totals unchanged)
  function migrateColors(db) {
    db.products.forEach(function (p) {
      if (p.colors !== undefined) return;
      p.colors = defaultColors(p.cat); p.vstock = {};
      p.colors.forEach(function (c) { p.vstock[c.id] = {}; });
      Object.keys(p.stock || {}).forEach(function (s) {
        var q = +p.stock[s] || 0, n = p.colors.length, base = Math.floor(q / n), rest = q - base * n;
        p.colors.forEach(function (c, i) { p.vstock[c.id][s] = base + (i < rest ? 1 : 0); });
      });
      syncStock(p);
    });
  }
  function slug(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "."); }
  function uid(p) { return (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  // CFA francs have no decimals: "115 000 FCFA" in French, "CFA 115,000" in English (same rule as the back office)
  function pageLang() { return typeof document !== "undefined" && document.documentElement.getAttribute("data-lang") === "en" ? "en" : "fr"; }
  function money(n, lang) {
    var v = Math.round(Number(n) || 0);
    return (lang || pageLang()) === "en" ? "CFA " + v.toLocaleString("en-US") : v.toLocaleString("fr-FR").replace(/\s/g, " ") + " FCFA";
  }
  // links set in the back office: web pages, anchors, e-mail and phone only (never javascript: or data:)
  function safeHref(v) { v = String(v || "").trim(); return /^(https?:|mailto:|tel:|#|\.{0,2}\/|[\w-]+\.html)/i.test(v) ? v : ""; }

  // shop settings of a new shop (also used when a section is missing in the database)
  function defaultSettings() {
    return {
      store: defaultStore(),
      shipping: {
        standard: { enabled: true, price: 3000, days: "2–4" },
        express: { enabled: true, price: 10000, days: "1–2" },
        freeOver: 100000,
        countries: COUNTRIES.map(function (c) { return { code: c[0], en: c[1], fr: c[2], enabled: ["CI", "SN", "ML", "BF", "BJ", "TG", "CM", "GA", "FR"].indexOf(c[0]) > -1 }; })
      },
      payments: {
        card: { enabled: true }, mobilemoney: { enabled: true, wave: true, orange: true, mtn: true, moov: false },
        paypal: { enabled: true }, applepay: { enabled: false }, cod: { enabled: true, max: 300000 }
      },
      reviews: { moderation: true },
      content: {
        announcement: { enabled: true, en: "Free delivery on orders over CFA 100,000 — new collection online", fr: "Livraison offerte dès 100 000 FCFA d'achat — nouvelle collection en ligne", link: "shop.html" },
        maintenance: { enabled: false, en: "We are updating the store. Back very soon.", fr: "Nous mettons la boutique à jour. De retour très vite." }
      },
      notifications: { newOrder: true, lowStock: true, newReview: true, dailyReport: false },
      vitrine: defaultVitrine(),
      instagram: defaultInstagram(),
      sizeGuide: defaultSizeGuide()
    };
  }

  /* ---------- seed ---------- */
  function seed() {
    var r = rng(20260930), now = Date.now(), today = new Date(); today.setHours(0, 0, 0, 0);
    var db = { version: VERSION, createdAt: now, demo: true };

    db.settings = defaultSettings();

    db.categories = CATEGORIES.map(function (c, i) { return { key: c.key, label: c.label, labelFr: c.labelFr, visible: true, order: i }; });

    db.products = CATALOG.map(function (row, id) {
      var cat = row[0], stock = {};
      sizesOf(cat).forEach(function (s, k) {
        var q = Math.floor(r() * 24) + 2;
        if (cat !== "accessories" && id % 3 === 0 && s === SIZES[id % 5]) q = 0;   // one sold-out size on some items
        if ((id === 8 || id === 20) && k > 2) q = Math.floor(r() * 3);             // a couple of low-stock items
        stock[s] = q;
      });
      return { id: id, sku: "RX-" + cat.slice(0, 3).toUpperCase() + "-" + ("00" + (id + 1)).slice(-3), name: row[1], nameFr: row[6], cat: cat,
        price: row[2], compare: row[3], tag: row[4], img: row[5], status: "active", stock: stock, desc: "", descFr: "", cost: Math.round(row[2] * (0.34 + r() * 0.08) / 500) * 500,
        createdAt: now - (140 - id * 2) * DAY };
    });

    /* customers */
    var FIRST = ["Aïcha", "Moussa", "Fatou", "Jean-Marc", "Awa", "Koffi", "Mariam", "Yao", "Salif", "Nadia", "Ibrahim", "Clarisse", "Olivier", "Ramatou", "Serge", "Aminata",
      "Kadiatou", "Didier", "Grâce", "Arnaud", "Nafissatou", "Christelle", "Hervé", "Fanta", "Rokia", "Marius", "Estelle", "Ousmane", "Linda", "Patrice", "Adjoa", "Sophie"];
    var LAST = ["Koné", "Diallo", "Traoré", "Kouassi", "Ndiaye", "Bamba", "Ouattara", "Sow", "Mensah", "Diabaté", "Yao", "Coulibaly", "Fofana", "Kaboré", "Sanogo", "Agbo", "Ba", "Camara", "Touré", "Adjovi"];
    var PLACES = [["CI", ["Abidjan", "Abidjan", "Abidjan", "Bouaké", "Yamoussoukro", "San-Pédro", "Grand-Bassam"], 46], ["SN", ["Dakar", "Dakar", "Thiès", "Saint-Louis"], 16],
      ["ML", ["Bamako"], 5], ["BF", ["Ouagadougou", "Bobo-Dioulasso"], 6], ["BJ", ["Cotonou", "Porto-Novo"], 7], ["TG", ["Lomé"], 6], ["CM", ["Douala", "Yaoundé"], 6], ["GA", ["Libreville"], 3], ["FR", ["Paris", "Lyon"], 5]];
    var DIAL = { CI: "+225 07", SN: "+221 77", ML: "+223 76", BF: "+226 70", BJ: "+229 97", TG: "+228 90", CM: "+237 6", GA: "+241 07", FR: "+33 6" };
    db.customers = [];
    for (var c = 0; c < 72; c++) {
      var f = pick(r, FIRST), l = pick(r, LAST), place = weighted(r, PLACES.map(function (p) { return [p, p[2]]; }));
      db.customers.push({ id: "C" + (1001 + c), first: f, last: l, email: slug(f) + "." + slug(l) + (c % 5 === 0 ? c : "") + "@example.com",
        phone: DIAL[place[0]] + " " + (10 + Math.floor(r() * 89)) + " " + (10 + Math.floor(r() * 89)) + " " + (10 + Math.floor(r() * 89)),
        country: place[0], city: pick(r, place[1]), createdAt: now - Math.floor(r() * 150 + 1) * DAY, tags: [], note: "", newsletter: r() < 0.55 });
    }

    /* orders over the last 120 days (growing trend, busier weekends) */
    db.orders = [];
    var seq = 10001, promosUsed = { RELAXX10: 0, BIENVENUE5000: 0, LIVRAISONOFFERTE: 0 };
    for (var d = 119; d >= 0; d--) {
      var dayStart = today.getTime() - d * DAY, wd = new Date(dayStart).getDay();
      var lambda = (1.1 + (119 - d) / 119 * 1.9) * (wd === 0 || wd === 6 ? 1.35 : 1) * (d < 1 ? 0.6 : 1);
      var count = Math.max(0, Math.round(lambda + (r() - 0.5) * 2.2));
      for (var k = 0; k < count; k++) {
        var cust = pick(r, db.customers), t = dayStart + Math.floor((8 + r() * 14) * 3600e3);
        if (t > now) t = now - Math.floor(r() * 3600e3);
        var nLines = weighted(r, [[1, 60], [2, 30], [3, 10]]), items = [], used = {};
        for (var li = 0; li < nLines; li++) {
          var pid = weighted(r, db.products.map(function (p) { return [p.id, p.tag === "Best Selling" ? 3 : p.tag === "On Sale" ? 2 : 1]; }));
          if (used[pid]) continue; used[pid] = 1;
          var pr = db.products[pid], sz = sizesOf(pr.cat);
          items.push({ pid: pid, name: pr.name, price: pr.price, q: r() < 0.85 ? 1 : 2, size: pick(r, sz.length > 1 ? ["S", "M", "M", "L", "XS", "XL"] : sz), color: "" });
        }
        var sub = items.reduce(function (s, it) { return s + it.price * it.q; }, 0);
        var promo = null, disc = 0, method = r() < 0.72 ? "standard" : "express";
        var roll = r();
        if (roll < 0.1) { promo = "RELAXX10"; disc = Math.round(sub * 0.1); }
        else if (roll < 0.15 && sub >= 50000) { promo = "BIENVENUE5000"; disc = 5000; }
        else if (roll < 0.18 && sub >= 60000) { promo = "LIVRAISONOFFERTE"; }
        if (promo) promosUsed[promo]++;
        var ship = method === "express" ? 10000 : (sub >= 100000 ? 0 : 3000);
        if (promo === "LIVRAISONOFFERTE") ship = 0;
        var pay = weighted(r, [["mobilemoney", 45], ["card", 30], ["cod", 18], ["paypal", 7]]);
        var op = pay === "mobilemoney" ? weighted(r, [["wave", 50], ["orange", 35], ["mtn", 15]]) : "";
        var age = (now - t) / DAY, status;
        if (age > 10) status = weighted(r, [["delivered", 90], ["cancelled", 5], ["refunded", 3], ["shipped", 2]]);
        else if (age > 4) status = weighted(r, [["delivered", 55], ["shipped", 38], ["cancelled", 7]]);
        else if (age > 1.5) status = weighted(r, [["shipped", 45], ["processing", 45], ["paid", 10]]);
        else status = weighted(r, [["paid", 55], ["processing", 25], ["pending", 20]]);
        if (pay === "cod" && status === "paid") status = "pending";
        var o = {
          id: "RX-" + (seq++), date: t, status: status, customerId: cust.id,
          customer: { first: cust.first, last: cust.last, email: cust.email, phone: cust.phone },
          address: { country: cust.country, city: cust.city, line: pick(r, ["Rue des Jardins", "Boulevard Latrille", "Avenue Chardy", "Rue 12", "Cité des Arts", "Rue Pierre Loti", "Allée des Flamboyants"]) + " " + (1 + Math.floor(r() * 120)), zip: "" },
          items: items, subtotal: sub, discount: disc, promo: promo, shipping: { method: method, price: ship },
          total: sub - disc + ship, payment: { method: pay, operator: op }, tracking: "", notes: [], history: [], source: "demo", lang: r() < 0.8 ? "fr" : "en"
        };
        o.history = timeline(o, r);
        if (["shipped", "delivered"].indexOf(status) > -1) o.tracking = "RLX" + Math.floor(100000000 + r() * 899999999);
        db.orders.push(o);
      }
    }

    /* reviews submitted on the site (to moderate) */
    var RV = [
      [12, 5, "Sublime", "La robe tombe parfaitement, la soie est d'une grande qualité. Je la recommande.", "Aminata B.", "Dakar", "published", "Merci Aminata ! Ravis qu'elle vous plaise."],
      [0, 5, "Mon manteau préféré", "Coupe impeccable et très chaud pour la saison fraîche. Livraison rapide à Abidjan.", "Serge K.", "Abidjan", "published", ""],
      [6, 4, "Très doux", "Pull très agréable, il taille un peu grand. J'aurais dû prendre un S.", "Linda A.", "Lomé", "published", "Merci Linda, nous ajoutons cette précision au guide des tailles."],
      [24, 5, "Qualité du cuir top", "Le cabas est magnifique, finitions parfaites, il contient tout mon quotidien.", "Christelle M.", "Cotonou", "published", ""],
      [18, 4, "Belle chemise", "Le lin est léger et agréable. Un peu froissée à la réception mais rien de grave.", "Patrice D.", "Abidjan", "published", ""],
      [21, 5, "Parfait", "Le pantalon est superbe, la taille haute est très flatteuse.", "Fanta K.", "Bamako", "published", ""],
      [3, 5, "Excellent rapport qualité-prix", "Acheté pendant les promos, la laine est épaisse et bien finie.", "Hervé Y.", "Douala", "published", ""],
      [13, 3, "Jolie mais longue", "La robe est belle mais un peu longue pour moi (1,60 m). Retouche nécessaire.", "Grâce T.", "Libreville", "pending", ""],
      [9, 5, "Très beau gilet", "Gros coup de cœur, il est encore plus beau en vrai.", "Kadiatou S.", "Ouagadougou", "pending", ""],
      [25, 2, "Déçue par la couleur", "Le sac est plus foncé que sur la photo. Le service client a été réactif pour l'échange.", "Rokia C.", "Abidjan", "pending", ""],
      [15, 5, "Robe de rêve", "Portée pour un mariage, tout le monde m'a demandé d'où elle venait !", "Estelle N.", "Abidjan", "pending", ""],
      [1, 4, "Beau manteau", "Très élégant. Les manches sont un peu longues mais ça reste très beau.", "Didier O.", "Dakar", "pending", ""],
      [7, 1, "Promo !!! visitez mon site", "Gagnez de l'argent facilement en cliquant sur ce lien…", "Promo2026", "", "hidden", ""]
    ];
    db.reviews = RV.map(function (v, i) {
      var date = now - (i < 7 ? 20 - i * 2 : 6 - (i - 7)) * DAY - Math.floor(r() * 5e7);
      return { id: "r" + (100 + i), pid: v[0], stars: v[1], title: v[2], text: v[3], name: v[4], city: v[5], size: "", fit: "", date: date, status: v[6],
        reply: v[7], replyDate: v[7] ? date + DAY : 0, source: "demo", lang: "fr" };
    });

    /* newsletter */
    db.subscribers = [];
    db.customers.forEach(function (cu) { if (cu.newsletter) db.subscribers.push({ email: cu.email, date: cu.createdAt, lang: "fr", source: "checkout", status: "subscribed" }); });
    for (var s = 0; s < 58; s++) {
      var fn = pick(r, FIRST), ln = pick(r, LAST);
      db.subscribers.push({ email: slug(fn) + "." + slug(ln) + (s + 7) + "@example.com", date: now - Math.floor(r() * 120) * DAY - Math.floor(r() * DAY), lang: r() < 0.82 ? "fr" : "en",
        source: r() < 0.7 ? "home" : "footer", status: r() < 0.06 ? "unsubscribed" : "subscribed" });
    }

    db.promos = [
      { code: "RELAXX10", type: "percent", value: 10, minOrder: 0, starts: now - 150 * DAY, ends: 0, limit: 0, used: promosUsed.RELAXX10, active: true, note: "Code de bienvenue du site" },
      { code: "BIENVENUE5000", type: "fixed", value: 5000, minOrder: 50000, starts: now - 90 * DAY, ends: now + 60 * DAY, limit: 500, used: promosUsed.BIENVENUE5000, active: true, note: "Première commande" },
      { code: "LIVRAISONOFFERTE", type: "shipping", value: 0, minOrder: 60000, starts: now - 45 * DAY, ends: now + 20 * DAY, limit: 0, used: promosUsed.LIVRAISONOFFERTE, active: true, note: "Campagne Instagram" },
      { code: "TABASKI20", type: "percent", value: 20, minOrder: 40000, starts: now - 110 * DAY, ends: now - 95 * DAY, limit: 300, used: 87, active: true, note: "Opération Tabaski" },
      { code: "VIP15", type: "percent", value: 15, minOrder: 0, starts: now - 30 * DAY, ends: 0, limit: 50, used: 12, active: false, note: "Clientes fidèles (en pause)" }
    ];

    /* visits: sessions give a ~2% conversion rate */
    db.traffic = {};
    var perDay = {};
    db.orders.forEach(function (o) { var k = dayKey(o.date); perDay[k] = (perDay[k] || 0) + 1; });
    for (d = 119; d >= 0; d--) {
      var key = dayKey(today.getTime() - d * DAY), ord = perDay[key] || 0;
      var sessions = Math.round((ord + 0.6) / (0.017 + r() * 0.01)), views = Math.round(sessions * (2.8 + r() * 1.4));
      db.traffic[key] = { sessions: sessions, views: views };
    }

    db.users = [
      { id: "u1", name: "Administrateur RELAXX", email: DEMO_ADMIN.email, role: "admin", passHash: DEMO_ADMIN.hash, active: true, createdAt: now - 150 * DAY, lastLogin: 0 },
      { id: "u2", name: "Awa Koné", email: "awa.kone@relaxx.example", role: "manager", passHash: "", active: true, createdAt: now - 80 * DAY, lastLogin: now - 2 * DAY },
      { id: "u3", name: "Koffi Mensah", email: "koffi.mensah@relaxx.example", role: "support", passHash: "", active: true, createdAt: now - 40 * DAY, lastLogin: now - 5 * 3600e3 },
      { id: "u4", name: "Stagiaire marketing", email: "stage@relaxx.example", role: "viewer", passHash: "", active: false, createdAt: now - 12 * DAY, lastLogin: 0 }
    ];
    db.activity = [
      { t: now - 3 * 3600e3, user: "Koffi Mensah", action: "a répondu à un avis", target: "Robe nuisette en soie" },
      { t: now - 26 * 3600e3, user: "Awa Koné", action: "a modifié le prix de", target: "Pardessus en laine" },
      { t: now - 2 * DAY, user: "Awa Koné", action: "a créé le code promo", target: "LIVRAISONOFFERTE" },
      { t: now - 3 * DAY, user: "Administrateur RELAXX", action: "a activé la barre d'annonce", target: "Contenus" }
    ];
    return db;
  }

  // shop details: also shown on the site (contact links, legal pages, help page)
  function defaultStore() {
    return { name: "RELAXX", legalName: "RELAXX SARL", legalForm: "SARL", capital: "", email: "hello@relaxx.example", phone: "+225 07 00 00 00 00", address: "Cocody Riviera 3, Abidjan", country: "CI",
      hours: "du lundi au samedi, de 9 h à 18 h", director: "", host: "", rccm: "", ncc: "", currency: "XOF", vat: 18, vatIncluded: true, lowStock: 5,
      instagram: "https://instagram.com/", facebook: "", tiktok: "", youtube: "" };
  }

  // size guide (product page and help page), edited in the back office: clothes per size, accessories as a list
  function defaultSizeGuide() {
    return {
      clothes: {
        note: { fr: "Mesures du corps en centimètres. Entre deux tailles ? Prenez la plus grande pour un porté ample.", en: "Body measurements in centimetres. Between two sizes? Take the larger one for a relaxed fit." },
        cols: [{ fr: "Tour de poitrine", en: "Chest" }, { fr: "Tour de taille", en: "Waist" }, { fr: "Tour de hanches", en: "Hips" }],
        rows: { XS: ["80–84", "62–66", "86–90"], S: ["84–88", "66–70", "90–94"], M: ["88–92", "70–74", "94–98"], L: ["92–98", "74–80", "98–104"], XL: ["98–104", "80–86", "104–110"] }
      },
      accessories: {
        note: { fr: "Mesures du sac, prises à plat.", en: "Measurements of the bag, taken flat." },
        rows: [{ fr: "Dimensions", en: "Dimensions", v: "30 × 22 × 11 cm" }, { fr: "Bandoulière (réglable)", en: "Strap drop (adjustable)", v: "22–55 cm" }, { fr: "Poids", en: "Weight", v: "800 g" }]
      }
    };
  }
  function sizeGuide() { return get().settings.sizeGuide || defaultSizeGuide(); }
  // the guide as HTML for a page: { note, table }
  function sizeGuideHTML(kind, lang) {
    var g = sizeGuide()[kind === "accessories" ? "accessories" : "clothes"], fr = (lang || pageLang()) === "fr";
    var t = function (x) { return esc(fr ? x.fr : x.en || x.fr); };
    var table = kind === "accessories"
      ? "<table><tbody>" + g.rows.map(function (r) { return "<tr><th>" + t(r) + "</th><td>" + esc(r.v) + "</td></tr>"; }).join("") + "</tbody></table>"
      : "<table><thead><tr><th>" + (fr ? "Taille" : "Size") + "</th>" + g.cols.map(function (c) { return "<th>" + t(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        SIZES.map(function (sz) { var row = g.rows[sz] || []; return "<tr><th>" + sz + "</th>" + g.cols.map(function (c, i) { return "<td>" + esc(row[i] || "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>";
    return { note: fr ? g.note.fr : g.note.en || g.note.fr, table: table };
  }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // storefront showcase managed in the back office ("Vitrine"): only the values changed there are stored,
  // everything else keeps the text written in the pages
  function defaultVitrine() {
    return { sections: {}, fields: {}, seo: {}, picks: { collection: [0, 12, 6, 18, 21, 24], accessories: [24, 25, 26] } };
  }

  // Instagram gallery before the footer. "manual": each tile has a photo and the link of its post, set in
  // the back office. "api": the latest posts of the shop's professional account (Instagram API with
  // Instagram Login), refreshed automatically; each tile opens its own post.
  var INSTA_TILES = 5, IG = "https://graph.instagram.com";
  var INSTA_IMGS = ["photo-1664076458686-3449062080ac", "photo-1668952135120-7d997b1b3778", "photo-1601762603339-fd61e28b698a", "photo-1594472136675-eaafd91ab546", "photo-1586165127014-f730957751f2"];
  function defaultInstagram() {
    return { mode: "manual", manual: INSTA_IMGS.map(function (img, i) { return { id: "m" + (i + 1), img: img, link: "" }; }),
      token: "", tokenAt: 0, tokenExp: 0, tokenTry: 0, account: null, posts: [], hidden: [], lastSync: 0, lastError: "", interval: 60 };
  }
  // before this module the photos were plain Vitrine fields (home.insta.N.image, home.insta.link)
  function migrateInstagram(db) {
    var ig = db.settings.instagram = defaultInstagram(), F = (db.settings.vitrine || {}).fields || {}, st = db.settings.store;
    for (var i = 1; i <= INSTA_TILES; i++) { var f = F["home.insta." + i + ".image"]; if (f && f.v) ig.manual[i - 1].img = f.v; delete F["home.insta." + i + ".image"]; }
    var l = F["home.insta.link"]; if (l && l.v && /instagram\.com\/[^/?#]+/.test(l.v) && !/instagram\.com\/[^/?#]+/.test(st.instagram || "")) st.instagram = l.v;
    delete F["home.insta.link"];
  }

  function timeline(o, r) {
    var steps = { pending: ["pending"], paid: ["paid"], processing: ["paid", "processing"], shipped: ["paid", "processing", "shipped"],
      delivered: ["paid", "processing", "shipped", "delivered"], cancelled: ["pending", "cancelled"], refunded: ["paid", "processing", "refunded"] }[o.status];
    if (o.payment.method === "cod" && steps[0] === "paid") steps = ["pending"].concat(steps.slice(1));
    var t = o.date;
    return steps.map(function (s, i) { if (i) t += Math.floor((0.3 + (r ? r() : 0.5) * 1.6) * DAY); return { t: Math.min(t, Date.now()), status: s, by: i ? "Équipe RELAXX" : "Client" }; });
  }

  /* ---------- Supabase ----------
     The shop's data lives in Supabase (table rx_docs, see supabase/schema.sql): one JSON document per
     product, order, customer, review, subscriber, promo code, settings section, team member…
     The publishable key is made for the browser: row-level security decides what it can do. Visitors only
     reach the rx_* functions (public catalogue, order, review, newsletter, visits); the team signs in. */
  var SUPA = (typeof window !== "undefined" && window.RELAXX_SUPABASE) || { url: "https://cosbmkovkxhvbdijijkm.supabase.co", key: "sb_publishable_ivudRpsxqYICjORzvO2mwg_GdBWcL88" };
  var REMOTE = !!(SUPA && SUPA.url && SUPA.key) && !(typeof window !== "undefined" && window.RELAXX_LOCAL);
  var ADMIN = typeof document !== "undefined" && document.documentElement.hasAttribute("data-admin");

  function api(path, o) {
    o = o || {};
    // a call that gets no answer is given up after 15 seconds (files being sent are not timed): the pages then show their "connection" message
    var ctl = !o.raw && typeof AbortController !== "undefined" ? new AbortController() : null, timer = 0;
    var stop = function () { clearTimeout(timer); };
    // an expired team session never blocks a call: it goes out as a visitor
    var call = (o.anon ? Promise.resolve(null) : auth.token().catch(function () { return null; })).then(function (tok) {
      var h = { apikey: SUPA.key };
      if (o.body !== undefined && !o.raw) h["Content-Type"] = "application/json";
      if (tok) h.Authorization = "Bearer " + tok;
      for (var k in o.headers || {}) h[k] = o.headers[k];
      if (ctl) timer = setTimeout(function () { ctl.abort(); }, o.timeout || 15000);
      return fetch(SUPA.url + path, { method: o.method || "GET", headers: h, body: o.raw ? o.body : o.body !== undefined ? JSON.stringify(o.body) : undefined, signal: ctl ? ctl.signal : undefined });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
        if (!r.ok) {
          var e = new Error((j && (j.message || j.msg || j.error_description || j.error)) || "HTTP " + r.status);
          e.status = r.status; e.body = j; throw e;
        }
        return { data: j, headers: r.headers };
      });
    });
    call.then(stop, stop);
    return call;
  }
  function rpc(fn, args) { return api("/rest/v1/rpc/" + fn, { method: "POST", body: args || {} }).then(function (r) { return r.data; }); }

  /* ---------- team sign-in (Supabase Auth, e-mail + password) ---------- */
  var AKEY = "relaxx-auth", refreshing = null;
  var auth = {
    session: function () { try { return JSON.parse(localStorage.getItem(AKEY) || "null"); } catch (e) { return null; } },
    keep: function (j) {
      var s = j ? { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, email: String((j.user && j.user.email) || "").toLowerCase() } : null;
      try { if (s) localStorage.setItem(AKEY, JSON.stringify(s)); else localStorage.removeItem(AKEY); } catch (e) {}
      return s;
    },
    signIn: function (email, pass) {
      return api("/auth/v1/token?grant_type=password", { method: "POST", anon: true, body: { email: String(email || "").trim().toLowerCase(), password: pass } }).then(function (r) { return auth.keep(r.data); });
    },
    // a valid access token, renewed a minute before it expires (null when signed out)
    token: function () {
      var s = auth.session();
      if (!s) return Promise.resolve(null);
      if (s.expires_at - Date.now() > 60e3) return Promise.resolve(s.access_token);
      refreshing = refreshing || api("/auth/v1/token?grant_type=refresh_token", { method: "POST", anon: true, body: { refresh_token: s.refresh_token } })
        .then(function (r) { refreshing = null; return auth.keep(r.data).access_token; }, function (e) { refreshing = null; if (e.status === 400 || e.status === 401) auth.keep(null); throw e; });
      return refreshing;
    },
    signOut: function () { var p = api("/auth/v1/logout", { method: "POST", body: {} }).catch(function () {}); return p.then(function () { auth.keep(null); }); },
    // the current password is checked by signing in again before the change
    changePassword: function (current, next) {
      var s = auth.session(); if (!s) return Promise.reject(new Error("Session expirée"));
      return auth.signIn(s.email, current).then(function () { return api("/auth/v1/user", { method: "PUT", body: { password: next } }); });
    }
  };

  /* ---------- documents <-> the database object used by the pages and the back office ---------- */
  // collection -> [field of the database object, key of a record]
  var LISTS = {
    products: ["products", function (x) { return String(x.id); }], categories: ["categories", function (x) { return x.key; }],
    orders: ["orders", function (x) { return x.id; }], customers: ["customers", function (x) { return x.id; }], reviews: ["reviews", function (x) { return x.id; }],
    subscribers: ["subscribers", function (x) { return String(x.email).toLowerCase(); }], promos: ["promos", function (x) { return x.code; }],
    activity: ["activity", function (x) { return x.id || (x.id = uid("a")); }], staff: ["users", function (x) { return String(x.email).toLowerCase(); }]
  };
  var SEP = "\u0001";
  function emptyDb() { return { version: VERSION, createdAt: Date.now(), demo: false, settings: {}, categories: [], products: [], customers: [], orders: [], reviews: [], subscribers: [], promos: [], traffic: {}, users: [], activity: [] }; }
  function toDocs(db) {
    var out = {};
    Object.keys(LISTS).forEach(function (coll) {
      (db[LISTS[coll][0]] || []).forEach(function (x) { if (!x) return; var k = LISTS[coll][1](x); out[coll + SEP + k] = { coll: coll, key: k, data: x }; });
    });
    Object.keys(db.settings || {}).forEach(function (k) { out["settings" + SEP + k] = { coll: "settings", key: k, data: db.settings[k] }; });
    Object.keys(db.traffic || {}).forEach(function (k) { out["traffic" + SEP + k] = { coll: "traffic", key: k, data: db.traffic[k] }; });
    return out;
  }
  function applyDoc(db, coll, key, data, del) {
    if (coll === "settings" || coll === "traffic") { if (del) delete db[coll][key]; else db[coll][key] = data; return; }
    var L = LISTS[coll]; if (!L) return;
    var arr = db[L[0]];
    if (coll === "products") { if (del) delete arr[+key]; else arr[+key] = data; return; } // position = id
    for (var i = 0; i < arr.length; i++) if (L[1](arr[i]) === key) { if (del) arr.splice(i, 1); else arr[i] = data; return; }
    if (!del) arr.push(data);
  }
  function sortDb(db) {
    db.orders.sort(function (a, b) { return a.date - b.date; });
    db.reviews.sort(function (a, b) { return b.date - a.date; });
    db.activity.sort(function (a, b) { return b.t - a.t; });
    db.customers.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    db.subscribers.sort(function (a, b) { return a.date - b.date; });
    db.categories.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  // sections or fields added to the shop over time get their default value
  function normalize(db) {
    var ds = defaultSettings();
    Object.keys(ds).forEach(function (k) { if (!db.settings[k]) db.settings[k] = ds[k]; });
    var st = db.settings.store, dst = defaultStore();
    Object.keys(dst).forEach(function (k) { if (st[k] === undefined) st[k] = dst[k]; });
    if (db.products.some(function (p) { return p && p.colors === undefined; })) migrateColors(db);
    return db;
  }
  // the shop's own content without any demo record (a new shop, or the fallback when Supabase cannot be reached)
  function baseline() {
    var db = seed(); migrateColors(db);
    db.demo = false; db.orders = []; db.customers = []; db.reviews = []; db.subscribers = []; db.promos = []; db.traffic = {}; db.activity = []; db.users = [];
    return db;
  }

  /* ---------- back office: load everything, then send only what changed ---------- */
  var synced = {}, syncChain = Promise.resolve(), pending = 0, lastSync = "";
  function fetchAll(path) {
    var out = [], size = 1000;
    function page(from) {
      return api(path, { headers: { Range: from + "-" + (from + size - 1), "Range-Unit": "items" } }).then(function (r) {
        var rows = r.data || []; out = out.concat(rows);
        return rows.length === size ? page(from + size) : out;
      });
    }
    return page(0);
  }
  function loadAll() {
    return fetchAll("/rest/v1/rx_docs?select=coll,key,data,updated_at&order=coll,key").then(function (rows) {
      var db = emptyDb(); synced = {};
      rows.forEach(function (r) {
        // collections this object does not hold (media library) are not followed: a save would otherwise delete them
        if (r.coll !== "settings" && r.coll !== "traffic" && !LISTS[r.coll]) return;
        applyDoc(db, r.coll, r.key, r.data);
        synced[r.coll + SEP + r.key] = JSON.stringify(r.data);
        if (r.updated_at > lastSync) lastSync = r.updated_at;
      });
      // an empty shop starts with its catalogue, categories and settings (sent right away)
      var fresh = !db.products.length && !db.settings.shipping;
      if (fresh) { var b = baseline(); db.settings = b.settings; db.categories = b.categories; db.products = b.products; }
      normalize(db); sortDb(db);
      cache = db;
      if (fresh) pushChanges();
      return db;
    });
  }
  function emit(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) {} }
  function quoteKey(k) { return '"' + String(k).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
  function send(up, del) {
    var jobs = [];
    for (var i = 0; i < up.length; i += 200) {
      jobs.push(up.slice(i, i + 200));
    }
    var byColl = {}; del.forEach(function (d) { (byColl[d.coll] = byColl[d.coll] || []).push(d.key); });
    return jobs.reduce(function (p, rows) {
      return p.then(function () { return api("/rest/v1/rx_docs?on_conflict=coll,key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: rows }); });
    }, Promise.resolve()).then(function () {
      return Object.keys(byColl).reduce(function (p, coll) {
        return p.then(function () { return api("/rest/v1/rx_docs?coll=eq." + encodeURIComponent(coll) + "&key=in.(" + encodeURIComponent(byColl[coll].map(quoteKey).join(",")) + ")", { method: "DELETE", headers: { Prefer: "return=minimal" } }); });
      }, Promise.resolve());
    });
  }
  function pushChanges() {
    if (!cache) return syncChain;
    var docs = toDocs(cache), up = [], del = [];
    Object.keys(docs).forEach(function (k) {
      var s = JSON.stringify(docs[k].data);
      if (synced[k] !== s) { up.push({ coll: docs[k].coll, key: docs[k].key, data: docs[k].data }); synced[k] = s; }
    });
    Object.keys(synced).forEach(function (k) { if (!docs[k]) { var p = k.split(SEP); del.push({ coll: p[0], key: p.slice(1).join(SEP) }); delete synced[k]; } });
    if (!up.length && !del.length) return syncChain;
    pending++; emit("relaxx:sync", { state: "saving" });
    syncChain = syncChain.then(function () { return send(up, del); }).then(function () {
      pending--; emit("relaxx:sync", { state: pending ? "saving" : "saved" });
    }, function (e) {
      pending--;
      // not saved: compared again (and sent again) at the next save
      up.forEach(function (d) { delete synced[d.coll + SEP + d.key]; });
      del.forEach(function (d) { synced[d.coll + SEP + d.key] = "\u0000"; });
      emit("relaxx:sync", { state: "error", error: e });
    });
    return syncChain;
  }
  // changes made elsewhere (orders from the site, another member of the team) since the last load
  function poll() {
    if (!lastSync) return Promise.resolve([]);
    return api("/rest/v1/rx_docs?select=coll,key,data,updated_at&updated_at=gt." + encodeURIComponent(lastSync) + "&order=updated_at&limit=1000").then(function (r) {
      var rows = r.data || [], changed = [];
      rows.forEach(function (row) {
        if (row.updated_at > lastSync) lastSync = row.updated_at;
        if (row.coll !== "settings" && row.coll !== "traffic" && !LISTS[row.coll]) return;
        var k = row.coll + SEP + row.key, s = JSON.stringify(row.data);
        if (synced[k] === s) return;
        synced[k] = s; applyDoc(cache, row.coll, row.key, row.data); changed.push(row);
      });
      if (changed.length) { normalize(cache); sortDb(cache); emit("relaxx:remote", { rows: changed }); }
      return changed;
    });
  }

  /* ---------- storefront: public catalogue, kept a minute in the browser ----------
     A page opened less than a minute after the previous one uses the copy at once and refreshes it for the
     next page; otherwise it waits for Supabase (6 s at most, 16 s on the checkout, then the last copy or the base catalogue). */
  var PKEY = "relaxx-public", readyQ = [], isReady = false;
  var MAX_AGE = typeof window !== "undefined" && window.RELAXX_MAX_AGE != null ? window.RELAXX_MAX_AGE : 60000;
  function ready(fn) { if (isReady) fn(); else readyQ.push(fn); }
  function markReady() {
    if (isReady) return; isReady = true;
    readyQ.splice(0).forEach(function (fn) { try { fn(); } catch (e) { setTimeout(function () { throw e; }); } });
  }
  function readPublic() { try { return JSON.parse(localStorage.getItem(PKEY) || "null"); } catch (e) { return null; } }
  function fromPublic(pub) {
    var db = emptyDb();
    db.settings = pub.settings || {}; db.categories = pub.categories || [];
    (pub.products || []).forEach(function (p) { db.products[p.id] = p; });
    db.reviews = pub.reviews || [];
    normalize(db); sortDb(db);
    return db;
  }
  function refreshPublic() {
    return rpc("rx_public").then(function (pub) {
      try { localStorage.setItem(PKEY, JSON.stringify({ t: Date.now(), data: pub })); } catch (e) {}
      return pub;
    });
  }
  function loadPublic() {
    var copy = readPublic(), timer = 0;
    var fallback = function () { if (!isReady) { cache = copy ? fromPublic(copy.data) : baseline(); markReady(); } };
    // a member of the team signed in on this browser always gets the latest data: what was just saved in the back office shows at the first reload
    if (copy && Date.now() - copy.t < (auth.session() ? 0 : MAX_AGE)) { cache = fromPublic(copy.data); markReady(); }
    // a page that must have the latest data (checkout: stock, prices, colours) waits for the answer as long as the call itself
    // lasts (15 s) instead of falling back after 6 s on a copy that could wrongly refuse an article of the bag
    else timer = setTimeout(fallback, MAX_AGE === 0 ? 16000 : 6000);
    refreshPublic().then(function (pub) { if (!isReady) { clearTimeout(timer); cache = fromPublic(pub); markReady(); } }, function () { clearTimeout(timer); fallback(); });
  }

  /* ---------- load / save ---------- */
  var cache = null;
  function get() {
    if (cache) return cache;
    if (REMOTE) { cache = ADMIN ? normalize(emptyDb()) : baseline(); return cache; } // before the data arrives
    var db = null;
    if (hasLS) { try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; } }
    if (!db || db.version !== VERSION || !db.products) {
      db = seed();
      migrateLegacy(db);
      cache = db; persist();
    }
    if (!db.settings.vitrine) { db.settings.vitrine = defaultVitrine(); cache = db; persist(); }
    if (!db.settings.instagram) { migrateInstagram(db); cache = db; persist(); }
    if (!db.settings.sizeGuide) { db.settings.sizeGuide = defaultSizeGuide(); cache = db; persist(); }
    if (db.products.some(function (p) { return p.colors === undefined; })) { migrateColors(db); cache = db; persist(); }
    // shop details added later (legal form, capital, opening hours, YouTube…)
    var ds = defaultStore(), st = db.settings.store, added = false;
    Object.keys(ds).forEach(function (k) { if (st[k] === undefined) { st[k] = ds[k]; added = true; } });
    if (added) { cache = db; persist(); }
    cache = db;
    return db;
  }
  function persist() {
    if (REMOTE) { if (ADMIN) pushChanges(); return; } // the storefront writes through the rx_* functions only
    if (!hasLS || !cache) return;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { // storage full: drop the oldest activity entries and retry once
      if (cache.activity && cache.activity.length > 50) { cache.activity = cache.activity.slice(0, 50); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e2) {} }
    }
  }
  function update(fn) { var db = get(); fn(db); persist(); return db; }
  // back office: make an edited copy (or a restored backup) the current database
  function adopt(db) { if (REMOTE) normalize(db); else if (db.products && db.products.some(function (p) { return p.colors === undefined; })) migrateColors(db); cache = db; persist(); return db; }
  function reload() { if (REMOTE) return get(); cache = null; return get(); }
  // back office: back to the shop's base content; the team is kept so nobody is locked out
  function reset() {
    if (!REMOTE) { cache = seed(); migrateColors(cache); persist(); return cache; }
    var users = cache ? cache.users : [], b = baseline(); b.users = users; cache = b; persist(); return cache;
  }
  if (typeof window !== "undefined") window.addEventListener("storage", function (e) { if (e.key === KEY && !REMOTE) cache = null; });

  // reviews written before the back office existed (product page, key "relaxx-reviews")
  function migrateLegacy(db) {
    if (!hasLS) return;
    try {
      var old = JSON.parse(localStorage.getItem("relaxx-reviews") || "null");
      if (old && typeof old === "object") {
        Object.keys(old).forEach(function (pid) {
          (old[pid] || []).forEach(function (rv) { db.reviews.unshift({ id: rv.id, pid: +pid, stars: rv.stars, title: rv.title, text: rv.text, name: rv.name, city: rv.city || "", size: rv.size || "", fit: rv.fit || "", date: rv.date, status: "published", reply: "", replyDate: 0, source: "web", lang: "fr" }); });
        });
        var mine = old ? Object.keys(old).reduce(function (a, pid) { return a.concat((old[pid] || []).map(function (x) { return x.id; })); }, []) : [];
        localStorage.setItem("relaxx-my-reviews", JSON.stringify(mine));
        localStorage.removeItem("relaxx-reviews");
      }
    } catch (e) {}
  }

  function log(action, target, user) {
    update(function (db) {
      db.activity.unshift({ t: Date.now(), user: user || "Boutique en ligne", action: action, target: target || "" });
      if (db.activity.length > 400) db.activity.length = 400;
    });
  }

  /* ---------- anti-robot protection of the public forms (checked by Supabase: rx_guard_check) ----------
     A hidden field only robots fill in, the time the form was shown, and a proof of work: while the visitor
     types, the browser looks for a number whose SHA-256 of "rx1:<action>:<time>:<random>:<number>" starts with
     16 zero bits (65 000 tries on average, a fraction of a second, done in small slices so the page stays fluid). */
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var SHA_W = new Int32Array(64);
  // first 32 bits of the SHA-256 of an ASCII string
  function sha256Head(msg) {
    var l = msg.length, blocks = ((l + 8) >> 6) + 1, words = new Int32Array(blocks * 16), i, t;
    for (i = 0; i < l; i++) words[i >> 2] |= msg.charCodeAt(i) << (24 - (i & 3) * 8);
    words[l >> 2] |= 0x80 << (24 - (l & 3) * 8);
    words[blocks * 16 - 1] = l * 8;
    var h0 = 0x6a09e667, h1 = 0xbb67ae85 | 0, h2 = 0x3c6ef372, h3 = 0xa54ff53a | 0, h4 = 0x510e527f, h5 = 0x9b05688c | 0, h6 = 0x1f83d9ab, h7 = 0x5be0cd19, W = SHA_W;
    for (var bk = 0; bk < blocks; bk++) {
      for (t = 0; t < 64; t++) {
        if (t < 16) W[t] = words[bk * 16 + t];
        else {
          var x = W[t - 15], y = W[t - 2];
          W[t] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[t - 16] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + W[t - 7] | 0;
        }
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (t = 0; t < 64; t++) {
        var t1 = h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K256[t] + W[t] | 0;
        var t2 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c)) | 0;
        h = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
      }
      h0 = h0 + a | 0; h1 = h1 + b | 0; h2 = h2 + c | 0; h3 = h3 + d | 0; h4 = h4 + e | 0; h5 = h5 + f | 0; h6 = h6 + g | 0; h7 = h7 + h | 0;
    }
    return h0 >>> 0;
  }
  var POW_BITS = 16, GUARD_MIN_MS = { order: 4000, review: 3000, newsletter: 1500 }; // same values as rx_guard_check
  function solveProof(action, done) {
    var ts = Date.now(), rand = "", nonce = 0;
    for (var i = 0; i < 16; i++) rand += "0123456789abcdef"[Math.floor(Math.random() * 16)];
    var prefix = "rx1:" + action + ":" + ts + ":" + rand + ":";
    (function slice() {
      for (var end = nonce + 3000; nonce < end; nonce++) {
        if (sha256Head(prefix + nonce) >>> (32 - POW_BITS) === 0) { done({ ts: ts, rand: rand, nonce: String(nonce) }); return; }
      }
      setTimeout(slice, 0);
    })();
  }
  // protect(form, "order" | "review" | "newsletter"): adds the hidden field and prepares the proof;
  // .value() gives what the database checks (one proof per sending, the next one is prepared right after)
  function protect(form, action) {
    var t0 = Date.now(), hp = null, proof = null, solving = false, waiting = [];
    if (form && form.appendChild) {
      hp = document.createElement("input");
      hp.type = "text"; hp.name = "rx_hp"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.value = "";
      hp.setAttribute("aria-hidden", "true");
      hp.style.cssText = "position:absolute!important;left:-10000px!important;top:auto!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important";
      form.appendChild(hp);
    }
    function start() {
      if (!REMOTE || solving || proof) return;
      solving = true;
      solveProof(action, function (p) { solving = false; proof = p; waiting.splice(0).forEach(function (fn) { fn(); }); });
    }
    if (form && form.addEventListener) form.addEventListener("focusin", start);
    setTimeout(start, 1200);
    return {
      value: function () {
        if (!REMOTE) return Promise.resolve(null);
        if (proof && Date.now() - proof.ts > 20 * 60000) proof = null; // valid 30 minutes in the database
        // the database refuses a form sent sooner than this after the page was shown: a quick visitor just waits the rest
        var wait = Math.max(0, t0 + (GUARD_MIN_MS[action] || 1500) + 300 - Date.now());
        return new Promise(function (res) {
          var give = function () { var p = proof; proof = null; res({ t0: t0, hp: hp ? hp.value : "", pow: p }); setTimeout(start, 0); };
          setTimeout(function () { if (proof) give(); else { waiting.push(give); start(); } }, wait);
        });
      }
    };
  }
  function guardValue(guard) { return guard && guard.value ? guard.value() : Promise.resolve(null); }

  /* ---------- storefront API ---------- */
  // product and colour names go into HTML attributes on the pages: straight quotes and angle brackets become typographic ones
  function clean(v) { return String(v == null ? "" : v).replace(/"([^"]*)"/g, "“$1”").replace(/"/g, "”").replace(/</g, "‹").replace(/>/g, "›"); }
  function totalStock(p) { return Object.keys(p.stock || {}).reduce(function (s, k) { return s + (+p.stock[k] || 0); }, 0); }
  function catalog(P) {
    var db = get(), hiddenCat = {};
    db.categories.forEach(function (c) { if (!c.visible) hiddenCat[c.key] = 1; });
    return db.products.map(function (p) {
      var out = totalStock(p) <= 0;
      return { id: p.id, cat: p.cat, name: clean(p.name), nameFr: clean(p.nameFr), price: p.price, compare: p.compare, tag: out ? "Sold Out" : p.tag, img: p.img, imgs: p.imgs || [], desc: p.desc, stock: p.stock,
        colors: hasColors(p) ? p.colors : [], vstock: hasColors(p) ? p.vstock : null,
        hidden: p.status !== "active" || !!hiddenCat[p.cat], soldOut: out, sku: p.sku };
    });
  }
  function categories(CATS) {
    var db = get();
    return db.categories.filter(function (c) { return c.visible; }).sort(function (a, b) { return a.order - b.order; }).map(function (c) { return { key: c.key, label: clean(c.label) }; });
  }
  function dict() {
    var db = get(), d = { "Sold Out": "Épuisé", "Unavailable": "Indisponible", "Mobile Money": "Mobile Money", "Cash on delivery": "Paiement à la livraison" };
    db.products.forEach(function (p) {
      if (p.nameFr) d[clean(p.name)] = clean(p.nameFr); if (p.desc && p.descFr) d[p.desc] = p.descFr;
      (p.colors || []).forEach(function (c) { if (c.nameFr && !d[c.name]) d[c.name] = c.nameFr; });
    });
    db.categories.forEach(function (c) { if (c.labelFr) d[clean(c.label)] = clean(c.labelFr); });
    return d;
  }
  function product(id) { return get().products[id] || null; }
  function shipping() { return get().settings.shipping; }
  function payments() { return get().settings.payments; }
  function countries(lang) { return get().settings.shipping.countries.filter(function (c) { return c.enabled; }).map(function (c) { return { code: c.code, name: lang === "fr" ? c.fr : c.en }; }); }

  var promoRules = {};
  // Supabase: the rules of the code typed at checkout (the list of codes is never sent to the browser)
  function fetchPromo(code) {
    code = String(code || "").trim().toUpperCase();
    if (!REMOTE) return Promise.resolve(checkPromo(code, Infinity));
    return rpc("rx_check_promo", { p_code: code }).then(function (r) { promoRules[code] = r; return r; });
  }
  function checkPromo(code, subtotal) {
    code = String(code || "").trim().toUpperCase();
    if (REMOTE) {
      var rr = promoRules[code];
      if (!rr || !rr.ok) return rr || { ok: false, reason: "invalid" };
      if (rr.minOrder && subtotal < rr.minOrder) return { ok: false, reason: "min", min: rr.minOrder };
      return { ok: true, code: rr.code, type: rr.type, value: rr.value };
    }
    var p = get().promos.filter(function (x) { return x.code === code; })[0], now = Date.now();
    if (!p || !p.active) return { ok: false, reason: "invalid" };
    if (p.starts && p.starts > now) return { ok: false, reason: "invalid" };
    if (p.ends && p.ends < now) return { ok: false, reason: "expired" };
    if (p.limit && p.used >= p.limit) return { ok: false, reason: "used" };
    if (p.minOrder && subtotal < p.minOrder) return { ok: false, reason: "min", min: p.minOrder };
    return { ok: true, code: p.code, type: p.type, value: p.value };
  }
  function discountFor(promo, subtotal) {
    if (!promo || !promo.ok) return 0;
    if (promo.type === "percent") return Math.round(subtotal * promo.value / 100);
    if (promo.type === "fixed") return Math.min(promo.value, subtotal);
    return 0;
  }

  /* ---------- cart ----------
     Cart lines (key "relaxx-cart") are { id, q, c: colour name, s: size }. Before showing or ordering them, each line
     is checked against the catalogue: product on sale, colour and size chosen, quantity within the stock left. */
  function needsChoice(p) {
    if (!p) return false;
    return sizesOf(p.cat).length > 1 || (hasColors(p) && p.colors.length > 1);
  }
  function checkLine(db, l) {
    var p = db.products[l.id], hiddenCat = db.categories.some(function (c) { return p && c.key === p.cat && !c.visible; });
    var out = { id: l.id, q: Math.max(1, Math.floor(+l.q || 1)), c: l.c || "", s: l.s || "", max: 0, problem: "" };
    if (!p || p.status !== "active" || hiddenCat) { out.problem = "unavailable"; return out; }
    var sizes = sizesOf(p.cat), size = out.s || (sizes.length === 1 ? sizes[0] : "");
    var col = hasColors(p) ? (colorOf(p, out.c) || (p.colors.length === 1 ? p.colors[0] : null)) : null;
    if (!size || sizes.indexOf(size) < 0 || (hasColors(p) && !col)) { out.problem = "options"; return out; }
    out.max = Math.max(0, col ? +((p.vstock[col.id] || {})[size]) || 0 : +(p.stock || {})[size] || 0);
    if (!out.max) out.problem = "soldout";
    else if (out.q > out.max) { out.q = out.max; out.problem = "reduced"; }
    return out;
  }
  function checkCart(lines) { var db = get(); return (lines || []).map(function (l) { return checkLine(db, l); }); }
  // units of a product still available for a colour and size (product page)
  function stockFor(id, color, size) { return checkLine(get(), { id: id, q: 1, c: color, s: size }).max; }

  // order from the checkout: stored, stock and promo usage updated, customer created or updated.
  // No payment is taken on the site: every order starts "pending" until the shop confirms the payment.
  // resolves with the order; rejects with Error("stock") (+ .lines) when the stock changed, or Error(<reason>)
  // one token per order as typed: sending the same order again (answer lost, connection cut) returns the order already recorded
  var orderSig = "", orderToken = "";
  function tokenFor(p) {
    var sig = JSON.stringify(p);
    if (sig !== orderSig || !orderToken) {
      var b = new Uint8Array(16); crypto.getRandomValues(b);
      orderToken = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); orderSig = sig;
    }
    return orderToken;
  }
  function placeOrder(data, guard) {
    if (REMOTE) {
      var p = { customer: data.customer, address: data.address, promo: data.promo || null, lang: data.lang || "fr",
        items: data.items.map(function (it) { return { pid: it.pid, q: it.q, size: it.size || "", color: it.color || "" }; }),
        shipping: { method: data.shipping.method }, payment: data.payment };
      try { p.token = tokenFor(p); } catch (e) {}
      return guardValue(guard).then(function (g) {
        p.guard = g;
        return rpc("rx_place_order", { p: p });
      }).then(function (r) {
          if (!r || r.error) { var e = new Error(r ? r.error : "order"); e.lines = r && r.lines; e.max = r && r.max; throw e; }
          orderToken = ""; // recorded: the next order is a new one
          refreshPublic().then(function (pub) { cache = fromPublic(pub); }, function () {}); // new stock for the next page
          return r;
        });
    }
    try { return Promise.resolve(placeOrderLocal(data)); } catch (e) { return Promise.reject(e); }
  }
  function placeOrderLocal(data) {
    var order;
    var bad = data.items.map(function (it) { return checkLine(get(), { id: it.pid, q: it.q, c: it.color, s: it.size }); })
      .filter(function (r, i) { return r.problem || r.q < data.items[i].q; });
    if (bad.length) { var err = new Error("stock"); err.lines = bad; throw err; }
    update(function (db) {
      var last = db.orders.reduce(function (m, o) { var n = +String(o.id).replace(/\D/g, ""); return n > m ? n : m; }, 10000);
      var email = String(data.customer.email || "").toLowerCase(), cust = db.customers.filter(function (c) { return c.email.toLowerCase() === email; })[0];
      if (!cust) {
        var lastC = db.customers.reduce(function (m, c) { var n = +String(c.id).replace(/\D/g, ""); return n > m ? n : m; }, 1000);
        cust = { id: "C" + (lastC + 1), first: data.customer.first, last: data.customer.last, email: data.customer.email, phone: data.customer.phone,
          country: data.address.country, city: data.address.city, createdAt: Date.now(), tags: [], note: "", newsletter: false };
        db.customers.push(cust);
      } else { cust.phone = data.customer.phone || cust.phone; cust.city = data.address.city || cust.city; cust.country = data.address.country || cust.country; }
      var status = "pending";
      order = { id: "RX-" + (last + 1), date: Date.now(), status: status, customerId: cust.id, customer: data.customer, address: data.address, items: data.items,
        subtotal: data.subtotal, discount: data.discount, promo: data.promo || null, shipping: data.shipping, total: data.total, payment: data.payment,
        tracking: "", notes: [], history: [{ t: Date.now(), status: status, by: "Client" }], source: "web", lang: data.lang || "fr" };
      db.orders.push(order);
      data.items.forEach(function (it) {
        adjustStock(db.products[it.pid], it.color, it.size, -it.q);
      });
      if (data.promo) db.promos.forEach(function (p) { if (p.code === data.promo) p.used++; });
      db.activity.unshift({ t: Date.now(), user: "Boutique en ligne", action: "nouvelle commande", target: order.id + " — " + money(order.total) });
    });
    return order;
  }

  function myReviews() { try { return JSON.parse(localStorage.getItem("relaxx-my-reviews") || "[]"); } catch (e) { return []; } }
  // Supabase: the visitor's own reviews are kept in the browser until they are published
  function myReviewRecs() { try { return JSON.parse(localStorage.getItem("relaxx-my-review-recs") || "[]"); } catch (e) { return []; } }
  // reviews shown on the product page: published ones, plus the visitor's own reviews still waiting for moderation.
  // The example reviews of the demo data stay in the back office: the site only shows reviews written by visitors.
  function reviewsFor(pid) {
    var mine = myReviews();
    if (REMOTE) {
      var pub = get().reviews.filter(function (r) { return r.pid === pid; }), ids = pub.map(function (r) { return r.id; });
      var own = myReviewRecs().filter(function (r) { return r.pid === pid && ids.indexOf(r.id) < 0 && r.status === "pending"; });
      return own.concat(pub).map(function (r) { var x = {}; for (var k in r) x[k] = r[k]; x.mine = mine.indexOf(r.id) > -1; return x; });
    }
    return get().reviews.filter(function (r) { return r.pid === pid && r.source !== "demo" && (r.status === "published" || (r.status === "pending" && mine.indexOf(r.id) > -1)); })
      .map(function (r) { var x = {}; for (var k in r) x[k] = r[k]; x.mine = mine.indexOf(r.id) > -1; return x; });
  }
  // resolves with the saved review (status "pending" when reviews are moderated)
  function addReview(pid, rv, guard) {
    if (REMOTE) {
      return guardValue(guard).then(function (g) {
        return rpc("rx_add_review", { p_pid: pid, p: { stars: rv.stars, title: rv.title, text: rv.text, name: rv.name, city: rv.city || "", size: rv.size || "", fit: rv.fit || "", lang: rv.lang || "fr", guard: g } });
      }).then(function (rec) {
          if (!rec || rec.error) throw new Error(rec ? rec.error : "review");
          try {
            var m = myReviews(); m.unshift(rec.id); localStorage.setItem("relaxx-my-reviews", JSON.stringify(m.slice(0, 200)));
            var recs = myReviewRecs(); recs.unshift(rec); localStorage.setItem("relaxx-my-review-recs", JSON.stringify(recs.slice(0, 50)));
          } catch (e) {}
          if (rec.status === "published") get().reviews.unshift(rec);
          return rec;
        });
    }
    return Promise.resolve(addReviewLocal(pid, rv));
  }
  function addReviewLocal(pid, rv) {
    var status = get().settings.reviews.moderation ? "pending" : "published";
    var rec = { id: rv.id || uid("r"), pid: pid, stars: rv.stars, title: rv.title, text: rv.text, name: rv.name, city: rv.city || "", size: rv.size || "", fit: rv.fit || "",
      date: Date.now(), status: status, reply: "", replyDate: 0, source: "web", lang: rv.lang || "fr" };
    update(function (db) {
      db.reviews.unshift(rec);
      db.activity.unshift({ t: Date.now(), user: "Boutique en ligne", action: "nouvel avis " + rec.stars + "★ sur", target: (db.products[pid] || {}).name || "" });
    });
    try { var m = myReviews(); m.unshift(rec.id); localStorage.setItem("relaxx-my-reviews", JSON.stringify(m.slice(0, 200))); } catch (e) {}
    return rec;
  }

  // resolves with "ok", "exists" (already subscribed), "invalid", "rate" (too many sign-ups) or "bot"
  function subscribe(email, lang, source, guard) {
    if (REMOTE) return guardValue(guard).then(function (g) { return rpc("rx_subscribe", { p_email: email, p_lang: lang || "fr", p_source: source || "home", p_guard: g }); });
    return Promise.resolve(subscribeLocal(email, lang, source));
  }
  function subscribeLocal(email, lang, source) {
    email = String(email || "").trim().toLowerCase();
    var res = "ok";
    update(function (db) {
      var s = db.subscribers.filter(function (x) { return x.email === email; })[0];
      if (s && s.status === "subscribed") { res = "exists"; return; }
      if (s) { s.status = "subscribed"; s.date = Date.now(); }
      else db.subscribers.push({ email: email, date: Date.now(), lang: lang || "fr", source: source || "home", status: "subscribed" });
    });
    return res;
  }

  // one page view per load, one session per browser tab
  function track() {
    if (!hasLS) return;
    var first = false;
    try { first = !sessionStorage.getItem("relaxx-session"); sessionStorage.setItem("relaxx-session", "1"); } catch (e) {}
    if (REMOTE) { rpc("rx_track", { p_first: first }).catch(function () {}); return; }
    update(function (db) {
      var k = dayKey(Date.now()), t = db.traffic[k] || (db.traffic[k] = { sessions: 0, views: 0 });
      t.views++; if (first) t.sessions++;
    });
  }

  /* ---------- storefront chrome: announcement bar + maintenance mode ---------- */
  // a member of the team signed in on this browser sees the shop even in maintenance mode
  function adminPreview() { try { return REMOTE ? !!auth.session() : !!sessionStorage.getItem("relaxx-admin-session"); } catch (e) { return false; } }
  /* ---------- showcase content (Vitrine) ----------
     Elements carry data-cms="key" (+ data-cms-type) and data-cms-href="key"; sections carry data-cms-section.
     Text values are stored per language ({ fr, en }); images, links and products as { v }. */
  function imgUrl(v, w) {
    if (media.isRef(v)) return media.url(v, document.documentElement.hasAttribute("data-admin") ? "../" : "");
    return /^(https?:|data:|blob:|\.\.?\/)/.test(v) ? v : "https://images.unsplash.com/" + v + "?w=" + (w || 1400) + "&q=80&auto=format&fit=crop";
  }
  // image or video slot (hero): a video value swaps the <img> for a muted looping <video> with the same attributes
  function setMedia(el, f, w) {
    if (!media.isVideo(f.v)) {
      if (el.tagName === "IMG") { el.removeAttribute("srcset"); el.src = imgUrl(f.v, w); }
      return el;
    }
    var v = el;
    if (el.tagName !== "VIDEO") {
      v = document.createElement("video");
      Array.prototype.forEach.call(el.attributes, function (a) { if (!/^(src|srcset|sizes|alt|loading|decoding)$/.test(a.name)) v.setAttribute(a.name, a.value); });
      el.parentNode.replaceChild(v, el);
    }
    v.muted = true; v.loop = true; v.playsInline = true;
    ["muted", "loop", "playsinline"].forEach(function (a) { v.setAttribute(a, ""); });
    v.setAttribute("preload", "auto"); v.setAttribute("aria-hidden", "true"); v.setAttribute("disablepictureinpicture", "");
    if (f.poster) v.setAttribute("poster", imgUrl(f.poster, w));
    v.src = imgUrl(f.v, w);
    // visitors who ask for reduced motion get the first frame only
    if (!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) { v.autoplay = true; keepPlaying(v); }
    return v;
  }
  // background videos: start once playable, resume when the tab comes back (a page opened in a background
  // tab never starts on its own) and pause while off screen
  var autoVideos = [], videoIO = null;
  function tryPlay(v) { if (!v.isConnected || document.hidden || v.__rxOff) return; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  function keepPlaying(v) {
    if (autoVideos.indexOf(v) > -1) return tryPlay(v);
    if (!autoVideos.length) document.addEventListener("visibilitychange", function () { autoVideos.forEach(tryPlay); });
    autoVideos.push(v);
    v.addEventListener("canplay", function () { tryPlay(v); });
    // data-pause-after="1.5": the element stays on screen (sticky) but is covered once the page has scrolled
    // 1.5 screen heights; otherwise pause when it leaves the viewport
    var after = parseFloat(v.getAttribute("data-pause-after"));
    if (after) {
      var ticking = false, check = function () {
        ticking = false; var off = (window.scrollY || 0) > after * innerHeight;
        if (off !== !!v.__rxOff) { v.__rxOff = off; if (off) v.pause(); else tryPlay(v); }
      };
      addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(check); } }, { passive: true });
      check();
    } else if ("IntersectionObserver" in window) {
      videoIO = videoIO || new IntersectionObserver(function (es) { es.forEach(function (e) { e.target.__rxOff = !e.isIntersecting; if (e.isIntersecting) tryPlay(e.target); else e.target.pause(); }); });
      videoIO.observe(v);
    }
    tryPlay(v);
  }
  // a text spread over n lines of about the same length (never more lines than words)
  function splitLines(text, n) {
    var words = String(text).replace(/\s+/g, " ").trim().split(" "), total = words.join(" ").length, out = [], line = [], cum = 0;
    n = Math.min(n, words.length);
    words.forEach(function (w, i) {
      line.push(w); cum += w.length + 1;
      var leftW = words.length - i - 1, leftL = n - out.length - 1;
      if (leftL > 0 && (leftW === leftL || (cum >= total * (out.length + 1) / n && leftW >= leftL))) { out.push(line.join(" ")); line = []; }
    });
    if (line.length) out.push(line.join(" "));
    return out;
  }
  function applyVitrine() {
    var html = document.documentElement, lang = html.getAttribute("data-lang") === "fr" ? "fr" : "en", db = get(), V = db.settings.vitrine || defaultVitrine(), F = V.fields || {};
    var txt = function (f) { return f ? (f[lang] != null && f[lang] !== "" ? f[lang] : f.fr || f.en || "") : null; };
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms-section]"), function (el) { if (V.sections[el.getAttribute("data-cms-section")] === false) el.hidden = true, el.style.display = "none"; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms]"), function (el) {
      var f = F[el.getAttribute("data-cms")], type = el.getAttribute("data-cms-type") || "text";
      // featured review cards keep the live name and price of their product
      if (!f && type === "rvproduct") { var m = /id=(\d+)/.exec(el.getAttribute("href") || ""); if (m) f = { v: +m[1] }; }
      if (!f) return;
      if (type === "img") { if (f.v) { el.removeAttribute("srcset"); el.src = imgUrl(f.v, el.classList.contains("social-img") ? 700 : 1600); } return; }
      if (type === "media") { if (f.v) setMedia(el, f, 2000); return; }
      if (type === "href") { if (safeHref(f.v)) el.setAttribute("href", safeHref(f.v)); return; }
      if (type === "rvproduct") {
        var p = db.products[+f.v]; if (!p) return;
        el.setAttribute("href", "product.html?id=" + p.id);
        var im = el.querySelector("img"), nm = el.querySelector(".rv-wear-txt > span"), pr = el.querySelector(".rv-wear-price");
        if (im) im.src = imgUrl(p.img, 200); if (nm) { nm.textContent = lang === "fr" ? (p.nameFr || p.name) : p.name; nm.setAttribute("data-no-i18n", ""); } if (pr) pr.textContent = money(p.price);
        return;
      }
      var t = txt(f); if (t === null) return;
      el.setAttribute("data-no-i18n", "");
      if (type === "placeholder") { el.setAttribute("placeholder", t); return; }
      if (type === "ring") { el.setAttribute("data-label", t); var tp = el.querySelector("textPath"); if (tp) tp.textContent = t; return; }
      if (type === "lines") { el.innerHTML = t.split(/\n/).map(function (l) { return l.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }).join("<br>"); return; }
      el.textContent = t;
    });
    // home banner: colour, size and number of lines of the title (back office › Vitrine › Bannière principale)
    var hero = document.querySelector(".hero-wrap"), hv = function (k) { return String((F["home.hero." + k] || {}).v || ""); };
    if (hero) {
      var col = hv("color"), scale = { s: 0.6, m: 0.8, xl: 1.25 }[hv("size")], nl = +hv("lines"), hd = hero.querySelector(".hero-heading");
      if (/^#[0-9a-f]{6}$/i.test(col)) {
        // the button takes the colour of the text, with its own text in black or white, whichever reads best
        var light = parseInt(col.substr(1, 2), 16) * 0.299 + parseInt(col.substr(3, 2), 16) * 0.587 + parseInt(col.substr(5, 2), 16) * 0.114 > 150;
        hero.style.setProperty("--hero-color", col); hero.style.setProperty("--hero-on", light ? "#000" : "#fff");
      }
      if (scale) hero.style.setProperty("--hero-scale", scale);
      if (hd && nl >= 1 && nl <= 3) {
        var ht = txt(F["home.hero.title"]);
        if (ht) hd.innerHTML = splitLines(ht, nl).map(function (l) { return l.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }).join("<br>");
        // title of the page itself (its translation follows its two lines): it can only be put on one line
        else if (nl === 1) Array.prototype.forEach.call(hd.querySelectorAll("br"), function (br) { br.parentNode.replaceChild(document.createTextNode(" "), br); });
        // the chosen number of lines is kept whatever the length: no line is cut, the title is reduced until the longest one fits
        hd.classList.add("is-fit");
        var fit = function () {
          hero.style.setProperty("--hero-fit", 1);
          var box = hd.closest(".hero") || hero, cs = getComputedStyle(box);
          // room: the width of the screen (the banner itself would stretch with a title that is too long) minus the side margins
          var room = document.documentElement.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0), wide = hd.getBoundingClientRect().width;
          if (room > 0 && wide > room) hero.style.setProperty("--hero-fit", Math.max(0.15, room / wide * 0.98).toFixed(3));
        };
        fit(); window.addEventListener("resize", fit);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
      }
    }
    // rotating badge of the three category cards: it names the card ("Chemises tendance à découvrir"), following the name set in
    // Vitrine or, failing that, the name of the category the card leads to; a badge text written in Vitrine is kept as it is
    ["outerwear", "knitwear", "dresses"].forEach(function (dk, n) {
      var i = n + 1, ring = document.querySelector('.trend-cursor[data-cms="home.trend.' + i + '.ring"]');
      if (!ring || F["home.trend." + i + ".ring"]) return;
      var name = txt(F["home.trend." + i + ".name"]);
      if (!name) {
        var lk = (F["home.trend." + i + ".link"] || {}).v, key = lk ? String(lk).split("#")[1] || "" : dk;
        var c = db.categories.filter(function (x) { return x.key === key; })[0], d0 = CATEGORIES.filter(function (x) { return x.key === key; })[0];
        if (!c || (d0 && c.label === d0.label && c.labelFr === d0.labelFr)) return; // category never renamed: the text of the page stays
        name = lang === "fr" ? c.labelFr || c.label : c.label;
      }
      var label = lang === "fr" ? name + " tendance à découvrir" : "Shop the trending " + name.toLowerCase() + " edit";
      ring.setAttribute("data-label", label); ring.setAttribute("data-no-i18n", "");
      var rtp = ring.querySelector("textPath"); if (rtp) rtp.textContent = label;
    });
    // the menu opens on the photo of the home banner (a video shows its poster frame)
    var hi = F["home.hero.image"], mi = document.querySelector(".mn-img-main img");
    if (mi && hi && hi.v) { var hsrc = media.isVideo(hi.v) ? hi.poster : hi.v; if (hsrc) { mi.removeAttribute("srcset"); mi.src = imgUrl(hsrc, 1600); } }
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms-href]"), function (el) { var f = F[el.getAttribute("data-cms-href")]; if (f && safeHref(f.v)) el.setAttribute("href", safeHref(f.v)); });
    var st = db.settings.store || {};
    // social links: the shop's accounts; an account that is not filled in is not shown
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms-social]"), function (el) {
      var u = st[el.getAttribute("data-cms-social")];
      if (u && /^https?:\/\//.test(u)) { el.setAttribute("href", u); el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); el.hidden = false; el.style.display = ""; }
      else { el.hidden = true; el.style.display = "none"; }
    });
    // SEO per page
    var page = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index", seo = (V.seo || {})[page];
    if (seo) {
      var ti = txt(seo.title), de = txt(seo.desc);
      if (ti) document.title = ti;
      if (de) { var md = document.querySelector("meta[name=description]"); if (md) md.setAttribute("content", de); }
    }
  }
  function vitrine() { return get().settings.vitrine || defaultVitrine(); }

  /* ---------- shop details on the pages ----------
     data-store="field": text from the shop settings (an empty setting keeps the placeholder written in the page);
     data-store-link="email|phone": mailto: / tel: link; data-shop="…": delivery and payment terms. */
  function listJoin(items, lang) {
    if (items.length < 2) return items.join("");
    return items.slice(0, -1).join(", ") + (lang === "fr" ? " et " : " and ") + items[items.length - 1];
  }
  function applyStore() {
    var db = get(), st = db.settings.store || {}, sh = db.settings.shipping, pm = db.settings.payments, lang = pageLang(), fr = lang === "fr";
    Array.prototype.forEach.call(document.querySelectorAll("[data-store]"), function (el) {
      var k = el.getAttribute("data-store"), v = k === "countryName" ? ((COUNTRIES.filter(function (c) { return c[0] === st.country; })[0] || [])[fr ? 2 : 1] || "") : st[k];
      if (v == null || String(v).trim() === "") return;
      el.textContent = String(v).trim(); el.classList.remove("ph"); el.setAttribute("data-no-i18n", "");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-store-link]"), function (el) {
      var k = el.getAttribute("data-store-link"), v = String(st[k === "map" ? "address" : k] || "").trim();
      if (!v) return;
      el.setAttribute("href", k === "email" ? "mailto:" + v : k === "map" ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v) : "tel:" + v.replace(/[^\d+]/g, ""));
    });
    var PAY = { mobilemoney: "Mobile Money", card: fr ? "carte bancaire" : "bank card", paypal: "PayPal", applepay: "Apple Pay", cod: fr ? "paiement à la livraison" : "cash on delivery" };
    var OPS = { wave: "Wave", orange: "Orange Money", mtn: "MTN MoMo", moov: "Moov Money" };
    var values = {
      freeOver: sh.freeOver ? money(sh.freeOver, lang) : "",
      stdPrice: money(sh.standard.price, lang), stdDays: sh.standard.days, expPrice: money(sh.express.price, lang), expDays: sh.express.days,
      countries: listJoin(sh.countries.filter(function (c) { return c.enabled; }).map(function (c) { return fr ? c.fr : c.en; }), lang),
      payments: listJoin(["mobilemoney", "card", "paypal", "applepay", "cod"].filter(function (k) { return pm[k] && pm[k].enabled; }).map(function (k) {
        if (k !== "mobilemoney") return PAY[k];
        var ops = Object.keys(OPS).filter(function (o) { return pm.mobilemoney[o]; }).map(function (o) { return OPS[o]; });
        return PAY[k] + (ops.length ? " (" + ops.join(", ") + ")" : "");
      }), lang),
      codMax: pm.cod && pm.cod.max ? money(pm.cod.max, lang) : ""
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-shop]"), function (el) {
      var k = el.getAttribute("data-shop"), v = values[k];
      if (k === "express" || k === "standard") { el.hidden = !(sh[k] && sh[k].enabled); return; }
      if (k === "freeOverBlock") { el.hidden = !sh.freeOver; return; }
      if (k === "codBlock") { el.hidden = !(pm.cod && pm.cod.enabled); return; }
      if (k === "codMaxBlock") { el.hidden = !(pm.cod && pm.cod.enabled && pm.cod.max); return; }
      if (v) { el.textContent = v; el.classList.remove("ph"); el.setAttribute("data-no-i18n", ""); }
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-size-guide]"), function (el) {
      var g = sizeGuideHTML(el.getAttribute("data-size-guide"), lang);
      el.innerHTML = "<p>" + esc(g.note) + "</p>" + g.table; el.setAttribute("data-no-i18n", "");
    });
    // © year: always the current one
    var year = String(new Date().getFullYear());
    Array.prototype.forEach.call(document.querySelectorAll('[data-cms="footer.copyright"],[data-cms="home.hero.foot"]'), function (el) {
      if (/©\s*\d{4}/.test(el.textContent)) el.textContent = el.textContent.replace(/(©\s*)\d{4}/, "$1" + year);
    });
  }

  /* ---------- categories in the menu and the footer ----------
     Same list, order and visibility as the shop tabs (back office › Catégories). Existing links are kept as they are
     (their photo and event handlers); a category added in the back office gets a new link with a photo of one of its products. */
  function applyCategories() {
    var db = get(), cats = db.categories.filter(function (c) { return c.visible; }).sort(function (a, b) { return a.order - b.order; });
    var photoOf = function (key) { var p = db.products.filter(function (x) { return x.cat === key && x.status === "active"; })[0]; return p ? imgUrl(p.img, 1400) : ""; };
    var closeMenu = function () { var b = document.querySelector(".mn-burger.is-open"); if (b) b.click(); };
    // a category shown as a card on the home page ("Catégories tendance", back office › Vitrine) has the same photo in the menu
    var F = (db.settings.vitrine || {}).fields || {}, trendImg = {};
    [["outerwear", "photo-1613915617430-8ab0fd7c6baf"], ["knitwear", "photo-1515511624704-b8916dcc30ea"], ["dresses", "photo-1635760057387-36eedcc8123f"]].forEach(function (d, n) {
      var link = (F["home.trend." + (n + 1) + ".link"] || {}).v, img = (F["home.trend." + (n + 1) + ".image"] || {}).v || d[1];
      var key = link ? (String(link).split("#")[1] || "") : d[0];
      if (key && !trendImg[key] && !media.isVideo(img)) trendImg[key] = imgUrl(img, 1400);
    });
    // the other categories take the photo of their product shown in the home collection (back office › Vitrine › products put forward),
    // or of their first product on sale
    var vp = (db.settings.vitrine || {}).picks || {}, dp = defaultVitrine().picks, picks = (vp.collection || dp.collection).concat(vp.accessories || dp.accessories);
    var pickImg = function (key) {
      for (var n = 0; n < picks.length; n++) { var pp = db.products[picks[n]]; if (pp && pp.cat === key && pp.status === "active" && pp.img) return imgUrl(pp.img, 1400); }
      return photoOf(key);
    };
    var menu = document.querySelector(".mn-links");
    if (menu) {
      var have = {};
      Array.prototype.forEach.call(menu.querySelectorAll(".mn-link"), function (a) { have[(a.getAttribute("href") || "").split("#")[1]] = a; a.parentNode.removeChild(a); });
      var tpl = have[Object.keys(have)[0]];
      cats.forEach(function (c, i) {
        var a = have[c.key];
        if (!a && tpl) {
          a = tpl.cloneNode(true); a.setAttribute("href", "shop.html#" + c.key);
          var im = a.querySelector(".mn-link-img img"); if (im) im.src = photoOf(c.key);
          a.addEventListener("mouseenter", function () { a.classList.add("is-hover"); });
          a.addEventListener("mouseleave", function () { a.classList.remove("is-hover"); });
          a.addEventListener("click", closeMenu);
        }
        if (!a) return;
        var ti = a.querySelector(".mn-link-img img"), tsrc = trendImg[c.key] || pickImg(c.key);
        if (ti && tsrc) { ti.removeAttribute("srcset"); ti.src = tsrc; }
        a.querySelector(".mn-num").textContent = ("0" + (i + 1)).slice(-2) + ".";
        a.querySelector(".mn-label").textContent = c.label;
        a.style.setProperty("--od", (300 + i * 100) + "ms"); a.style.setProperty("--cd", Math.max(0, (cats.length - 1 - i) * 100) + "ms");
        menu.appendChild(a);
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-cat-list]"), function (col) {
      var rows = {}, first = null;
      Array.prototype.forEach.call(col.querySelectorAll("a.mf-link"), function (a) { var row = a.parentNode; rows[(a.getAttribute("href") || "").split("#")[1]] = row; first = first || row; row.parentNode.removeChild(row); });
      cats.forEach(function (c) {
        var row = rows[c.key];
        if (!row && first) { row = first.cloneNode(true); row.classList.add("in"); row.querySelector("a").setAttribute("href", "shop.html#" + c.key); }
        if (!row) return;
        row.querySelector("a").textContent = c.label;
        col.appendChild(row);
      });
    });
  }

  /* ---------- Instagram ---------- */
  function igGet(path, token) {
    return fetch(IG + path + (path.indexOf("?") > -1 ? "&" : "?") + "access_token=" + encodeURIComponent(token)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || j.error) { var e = new Error((j.error && (j.error.error_user_msg || j.error.message)) || "HTTP " + r.status); e.code = j.error && j.error.code; throw e; }
        return j;
      });
    });
  }
  function igFetch(token) {
    return Promise.all([
      igGet("/me?fields=user_id,username,account_type,profile_picture_url,media_count", token),
      igGet("/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=24", token)
    ]).then(function (res) {
      var me = res[0];
      return {
        account: { id: me.user_id || me.id, username: me.username || "", type: me.account_type || "", avatar: me.profile_picture_url || "", count: me.media_count || 0 },
        posts: (res[1].data || []).map(function (m) {
          return { id: m.id, img: m.media_type === "VIDEO" ? m.thumbnail_url || "" : m.media_url || "", link: m.permalink || "", caption: m.caption || "", type: m.media_type || "IMAGE", date: Date.parse(m.timestamp) || 0 };
        }).filter(function (p) { return p.img && p.link; })
      };
    });
  }
  // long-lived tokens are valid 60 days; renew them (at most once a day) when the last renewal is a week old
  function igRefreshToken() {
    var ig = get().settings.instagram, now = Date.now();
    if (!ig.token || now - (ig.tokenTry || 0) < DAY || now - (ig.tokenAt || 0) < 7 * DAY) return Promise.resolve(false);
    update(function (db) { db.settings.instagram.tokenTry = now; });
    return igGet("/refresh_access_token?grant_type=ig_refresh_token", ig.token).then(function (j) {
      if (!j.access_token) return false;
      update(function (db) { var g = db.settings.instagram; g.token = j.access_token; g.tokenAt = Date.now(); g.tokenExp = j.expires_in ? Date.now() + j.expires_in * 1000 : 0; });
      return true;
    }, function () { return false; });
  }
  function instaConnect(token) {
    token = String(token || "").trim();
    if (!token) return Promise.reject(new Error("Jeton manquant"));
    return igFetch(token).then(function (r) {
      update(function (db) {
        var g = db.settings.instagram;
        g.mode = "api"; g.token = token; g.tokenAt = 0; g.tokenExp = 0; g.tokenTry = 0; g.account = r.account; g.posts = r.posts; g.lastSync = Date.now(); g.lastError = "";
        if (r.account.username) db.settings.store.instagram = "https://www.instagram.com/" + r.account.username + "/";
      });
      igRefreshToken(); // also tells us when the token expires
      return r;
    });
  }
  function instaSync() {
    var ig = get().settings.instagram;
    if (!ig || !ig.token) return Promise.reject(new Error("Aucun compte connecté"));
    return igFetch(ig.token).then(function (r) {
      update(function (db) { var g = db.settings.instagram; g.account = r.account; g.posts = r.posts; g.lastSync = Date.now(); g.lastError = ""; });
      igRefreshToken();
      return r;
    }, function (e) {
      // keep the last posts on the site; the back office shows the error
      update(function (db) { var g = db.settings.instagram; g.lastSync = Date.now(); g.lastError = e.message + (e.code === 190 ? " (jeton expiré ou révoqué)" : ""); });
      throw e;
    });
  }
  function instaDisconnect() {
    update(function (db) { var g = db.settings.instagram; g.mode = "manual"; g.token = ""; g.tokenAt = g.tokenExp = g.tokenTry = 0; g.account = null; g.posts = []; g.lastError = ""; });
  }
  function instaProfile() {
    var db = get(), ig = db.settings.instagram || defaultInstagram(), u = (db.settings.store || {}).instagram;
    if (ig.mode === "api" && ig.account && ig.account.username) return "https://www.instagram.com/" + ig.account.username + "/";
    return u && /^https?:\/\//.test(u) ? u : "https://www.instagram.com/";
  }
  // the tiles shown on the site: latest visible posts (connected account), completed by the manual tiles
  function instaTiles() {
    var ig = get().settings.instagram || defaultInstagram(), profile = instaProfile(), hidden = ig.hidden || [];
    var live = ig.mode === "api" ? (ig.posts || []).filter(function (p) { return hidden.indexOf(p.id) < 0; }) : [];
    var out = [];
    for (var i = 0; i < INSTA_TILES; i++) {
      var m = ig.manual[i] || { img: INSTA_IMGS[i], link: "" }, p = live[i];
      out.push(p ? { img: p.img, link: p.link, caption: p.caption, fallback: m.img, live: true } : { img: m.img, link: m.link || profile, caption: "", live: false });
    }
    return out;
  }
  function applyInstagram() {
    var tiles = document.querySelectorAll(".insta-strip [data-insta]");
    if (!tiles.length) return;
    var lang = document.documentElement.getAttribute("data-lang") === "fr" ? "fr" : "en", list = instaTiles();
    Array.prototype.forEach.call(tiles, function (a, i) {
      var t = list[i], im = a.querySelector("img"); if (!t) return;
      a.setAttribute("href", /^https?:\/\//.test(t.link || "") ? t.link : instaProfile()); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
      var cap = t.caption ? t.caption.replace(/\s+/g, " ").trim().slice(0, 90) : "";
      var post = /instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\//.test(t.link);
      a.setAttribute("aria-label", (post ? (lang === "fr" ? "Voir la publication sur Instagram" : "View the post on Instagram") : (lang === "fr" ? "Voir notre compte Instagram" : "View our Instagram account")) + (cap ? " — " + cap : ""));
      if (im) {
        im.removeAttribute("srcset"); im.alt = cap;
        // Instagram image addresses expire after a while: fall back to the manual photo until the next sync
        im.onerror = t.fallback ? function () { im.onerror = null; im.src = imgUrl(t.fallback, 700); } : null;
        var src = imgUrl(t.img, 700); if (im.getAttribute("src") !== src) im.src = src;
      }
    });
  }

  function storefront() {
    try { applyVitrine(); } catch (e) {}
    try { applyStore(); } catch (e) {}
    try { applyCategories(); } catch (e) {}
    try {
      applyInstagram();
      var ig = get().settings.instagram;
      if (ig && ig.mode === "api" && ig.token && document.querySelector(".insta-strip [data-insta]") && Date.now() - (ig.lastSync || 0) > (ig.interval || 60) * 60000)
        instaSync().then(applyInstagram, function () {});
    } catch (e) {}
    var html = document.documentElement;
    if (html.hasAttribute("data-admin")) return;
    if (html.hasAttribute("data-maintenance")) return; // maintenance.html shows the message and checks by itself when the shop reopens
    var lang = html.getAttribute("data-lang") === "fr" ? "fr" : "en", db = get(), c = db.settings.content;
    var css = document.createElement("style");
    css.textContent =
      ".rx-ann{position:fixed;top:0;left:0;right:0;z-index:100001;display:flex;justify-content:center;align-items:center;height:32px;padding:0 44px;background:#0e0e0e;color:#e9e6e2;font:500 12px/1.2 Geist,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-align:center;transition:transform .45s cubic-bezier(.22,1,.36,1)}" +
      ".rx-ann a{color:inherit;text-decoration:none}.rx-ann a:hover{text-decoration:underline;text-underline-offset:3px}" +
      ".rx-ann-x{position:absolute;right:10px;top:50%;width:26px;height:26px;margin-top:-13px;border:0;background:none;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7}.rx-ann-x:hover{opacity:1}" +
      "html.has-ann .mn-bar{top:32px;transition:top .45s cubic-bezier(.22,1,.36,1),opacity .7s,background-color .4s,color .4s}" +
      "html.has-ann.ann-off .rx-ann,html.has-ann.mn-lock .rx-ann{transform:translateY(-100%)}html.has-ann.ann-off .mn-bar,html.has-ann.mn-lock .mn-bar{top:0}" +
      "@media (max-width:479px){.rx-ann{font-size:10px;letter-spacing:.05em;padding:0 36px}}" +
      ".rx-preview{position:fixed;left:12px;bottom:12px;z-index:2147483600;padding:8px 12px;max-width:calc(100% - 24px);background:#c89564;color:#000;font:600 12px/1.4 Geist,sans-serif;letter-spacing:.04em;text-decoration:underline;text-underline-offset:3px}";
    document.head.appendChild(css);

    if (c.maintenance && c.maintenance.enabled) {
      if (adminPreview()) {
        // the team keeps seeing the shop: say so, with a link to what the visitors see
        var pv = document.createElement("a"); pv.className = "rx-preview"; pv.href = "maintenance.html?preview"; pv.setAttribute("data-no-i18n", "");
        pv.textContent = "Mode maintenance actif. Vous voyez la boutique parce que vous êtes connecté au back-office. Voir la page des visiteurs";
        document.body.appendChild(pv);
      } else {
        // visitors go to the maintenance page, which sends them back here when the shop reopens
        var here = (location.pathname.split("/").pop() || "index.html") + location.search + location.hash;
        html.style.visibility = "hidden";
        location.replace("maintenance.html?from=" + encodeURIComponent(here));
        return;
      }
    }
    var a = c.announcement, closed = false;
    try { closed = sessionStorage.getItem("relaxx-ann-closed") === (a && a.fr); } catch (e) {}
    if (a && a.enabled && (a.fr || a.en) && !closed) {
      var bar = document.createElement("div"); bar.className = "rx-ann"; bar.setAttribute("data-no-i18n", ""); bar.setAttribute("role", "region"); bar.setAttribute("aria-label", lang === "fr" ? "Annonce" : "Announcement");
      var txt = a[lang] || a.fr || a.en;
      bar.innerHTML = (a.link ? '<a></a>' : '<span></span>') + '<button type="button" class="rx-ann-x" aria-label="' + (lang === "fr" ? "Fermer l'annonce" : "Close announcement") + '">×</button>';
      var t = bar.firstChild; t.textContent = txt; if (a.link) t.setAttribute("href", safeHref(a.link) || "shop.html");
      document.body.insertBefore(bar, document.body.firstChild);
      html.classList.add("has-ann");
      var onScroll = function () { html.classList.toggle("ann-off", (window.scrollY || 0) > 60); };
      addEventListener("scroll", onScroll, { passive: true }); onScroll();
      bar.querySelector(".rx-ann-x").addEventListener("click", function () {
        html.classList.remove("has-ann"); bar.remove();
        try { sessionStorage.setItem("relaxx-ann-closed", a.fr); } catch (e) {}
      });
    }
  }

  window.RelaxxDB = {
    KEY: KEY, SIZES: SIZES, CATEGORIES: CATEGORIES, COUNTRIES: COUNTRIES,
    get: get, update: update, reload: reload, adopt: adopt, persist: persist, log: log, reset: reset,
    seed: seed, timeline: timeline, money: money, dayKey: dayKey, sizesOf: sizesOf, totalStock: totalStock, uid: uid,
    defaultColors: defaultColors, colorSlug: colorSlug, hasColors: hasColors, syncStock: syncStock, colorOf: colorOf, adjustStock: adjustStock,
    catalog: catalog, categories: categories, dict: dict, product: product, shipping: shipping, payments: payments, countries: countries,
    vitrine: vitrine, defaultVitrine: defaultVitrine, imgUrl: imgUrl, media: media, setMedia: setMedia,
    defaultInstagram: defaultInstagram, instaConnect: instaConnect, instaSync: instaSync, instaDisconnect: instaDisconnect, instaTiles: instaTiles, instaProfile: instaProfile, applyInstagram: applyInstagram,
    checkPromo: checkPromo, discountFor: discountFor, placeOrder: placeOrder, reviewsFor: reviewsFor, addReview: addReview, subscribe: subscribe, track: track,
    sizeGuide: sizeGuide, defaultSizeGuide: defaultSizeGuide, sizeGuideHTML: sizeGuideHTML,
    checkCart: checkCart, needsChoice: needsChoice, stockFor: stockFor, safeHref: safeHref, defaultStore: defaultStore,
    remote: REMOTE, ready: ready, auth: auth, loadAll: loadAll, poll: poll, flush: function () { return pushChanges(); }, pending: function () { return pending; },
    fetchPromo: fetchPromo, refreshPublic: refreshPublic, rpc: rpc, protect: protect
  };

  // errors met by the visitors (and the team) are recorded in the database, three per page at most: Journal d'activité → Erreurs du site
  var errSent = 0, errSeen = {};
  function reportError(msg, src, line) {
    msg = String(msg || "").slice(0, 300);
    if (!REMOTE || !msg || msg === "Script error." || errSent >= 3 || errSeen[msg]) return;
    errSeen[msg] = 1; errSent++;
    rpc("rx_log_error", { p: { msg: msg, src: String(src || "").slice(0, 200), line: String(line || ""), page: (location.pathname + location.search).slice(0, 200), ua: navigator.userAgent.slice(0, 200) } }).catch(function () {});
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("error", function (e) { if (e && e.message) reportError(e.message, e.filename, e.lineno); });
    window.addEventListener("unhandledrejection", function (e) { var r = e && e.reason; if (r && r.name !== "AbortError" && !r.status && r.stack) reportError("Promise: " + (r.message || r), "", ""); });
  }

  // storefront: the page scripts wait for the data (RelaxxDB.ready), then the shared parts of the pages are filled in
  function whenDom(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  if (typeof document !== "undefined" && !ADMIN) {
    try { track(); } catch (e) {}
    if (REMOTE) loadPublic(); else markReady();
    ready(function () { whenDom(function () { try { storefront(); } catch (e) {} }); });
  } else markReady();
})();
