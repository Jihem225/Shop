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
  var media = {
    isRef: function (v) { return /^media:/.test(v || ""); },
    isVideo: function (v) { return VIDEO_RE.test(v || ""); },
    id: function (v) { var m = /^media:([\w-]+)/.exec(v || ""); return m ? m[1] : ""; },
    ref: function (rec) { return "media:" + rec.id + "." + (rec.ext || "bin"); },
    url: function (v, base) { return (base || "") + "media/" + String(v).slice(6); },
    put: function (rec) { rec.created = rec.created || Date.now(); return mstore("readwrite", function (s) { return s.put(rec); }).then(function () { return media.ref(rec); }); },
    get: function (id) { return mstore("readonly", function (s) { return s.get(id); }); },
    all: function () { return mstore("readonly", function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.created - a.created; }); }); },
    remove: function (id) { return media.get(id).then(function (r) { return mstore("readwrite", function (s) { s.delete(id); if (r && r.poster) s.delete(media.id(r.poster)); return null; }); }); }
  };
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register(new URL("sw.js", (document.currentScript && document.currentScript.src) || location.href).href).catch(function () {}); } catch (e) {}
  }
  if (typeof document !== "undefined") {
    // an uploaded file that failed to load (service worker not active yet): read it straight from IndexedDB
    document.addEventListener("error", function (e) {
      var t = e.target, m;
      if (!t || !/^(IMG|VIDEO|SOURCE)$/.test(t.tagName) || t.__rxMedia) return;
      m = /\/media\/([\w-]+)\.\w+$/.exec((t.currentSrc || t.src || "").split(/[?#]/)[0]);
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
  function money(n) { return "CFA" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  /* ---------- seed ---------- */
  function seed() {
    var r = rng(20260930), now = Date.now(), today = new Date(); today.setHours(0, 0, 0, 0);
    var db = { version: VERSION, createdAt: now, demo: true };

    db.settings = {
      store: { name: "RELAXX", legalName: "RELAXX SARL", email: "hello@relaxx.example", phone: "+225 07 00 00 00 00", address: "Cocody Riviera 3, Abidjan", country: "CI",
        rccm: "", ncc: "", currency: "XOF", vat: 18, vatIncluded: true, lowStock: 5, instagram: "https://instagram.com/", facebook: "", tiktok: "" },
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
        announcement: { enabled: true, en: "Free delivery on orders over CFA100,000 — new collection online", fr: "Livraison offerte dès 100 000 FCFA d'achat — nouvelle collection en ligne", link: "shop.html" },
        maintenance: { enabled: false, en: "We are updating the store. Back very soon.", fr: "Nous mettons la boutique à jour. De retour très vite." }
      },
      notifications: { newOrder: true, lowStock: true, newReview: true, dailyReport: false },
      vitrine: defaultVitrine(),
      instagram: defaultInstagram()
    };

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

  /* ---------- load / save ---------- */
  var cache = null;
  function get() {
    if (cache) return cache;
    var db = null;
    if (hasLS) { try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; } }
    if (!db || db.version !== VERSION || !db.products) {
      db = seed();
      migrateLegacy(db);
      cache = db; persist();
    }
    if (!db.settings.vitrine) { db.settings.vitrine = defaultVitrine(); cache = db; persist(); }
    if (!db.settings.instagram) { migrateInstagram(db); cache = db; persist(); }
    if (db.products.some(function (p) { return p.colors === undefined; })) { migrateColors(db); cache = db; persist(); }
    cache = db;
    return db;
  }
  function persist() {
    if (!hasLS || !cache) return;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); }
    catch (e) { // storage full: drop the oldest activity entries and retry once
      if (cache.activity && cache.activity.length > 50) { cache.activity = cache.activity.slice(0, 50); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e2) {} }
    }
  }
  function update(fn) { var db = get(); fn(db); persist(); return db; }
  // back office: make an edited copy the current database (after merging newer records into it)
  function adopt(db) { if (db.products && db.products.some(function (p) { return p.colors === undefined; })) migrateColors(db); cache = db; persist(); return db; }
  function reload() { cache = null; return get(); }
  if (typeof window !== "undefined") window.addEventListener("storage", function (e) { if (e.key === KEY) cache = null; });

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

  /* ---------- storefront API ---------- */
  function totalStock(p) { return Object.keys(p.stock || {}).reduce(function (s, k) { return s + (+p.stock[k] || 0); }, 0); }
  function catalog(P) {
    var db = get(), hiddenCat = {};
    db.categories.forEach(function (c) { if (!c.visible) hiddenCat[c.key] = 1; });
    return db.products.map(function (p) {
      var out = totalStock(p) <= 0;
      return { id: p.id, cat: p.cat, name: p.name, price: p.price, compare: p.compare, tag: out ? "Sold Out" : p.tag, img: p.img, desc: p.desc, stock: p.stock,
        colors: hasColors(p) ? p.colors : [], vstock: hasColors(p) ? p.vstock : null,
        hidden: p.status !== "active" || !!hiddenCat[p.cat], soldOut: out, sku: p.sku };
    });
  }
  function categories(CATS) {
    var db = get();
    return db.categories.filter(function (c) { return c.visible; }).sort(function (a, b) { return a.order - b.order; }).map(function (c) { return { key: c.key, label: c.label }; });
  }
  function dict() {
    var db = get(), d = { "Sold Out": "Épuisé", "Unavailable": "Indisponible", "Mobile Money": "Mobile Money", "Cash on delivery": "Paiement à la livraison" };
    db.products.forEach(function (p) {
      if (p.nameFr) d[p.name] = p.nameFr; if (p.desc && p.descFr) d[p.desc] = p.descFr;
      (p.colors || []).forEach(function (c) { if (c.nameFr && !d[c.name]) d[c.name] = c.nameFr; });
    });
    db.categories.forEach(function (c) { if (c.labelFr) d[c.label] = c.labelFr; });
    return d;
  }
  function product(id) { return get().products[id] || null; }
  function shipping() { return get().settings.shipping; }
  function payments() { return get().settings.payments; }
  function countries(lang) { return get().settings.shipping.countries.filter(function (c) { return c.enabled; }).map(function (c) { return { code: c.code, name: lang === "fr" ? c.fr : c.en }; }); }

  function checkPromo(code, subtotal) {
    code = String(code || "").trim().toUpperCase();
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

  // order from the checkout: stored, stock and promo usage updated, customer created or updated
  function placeOrder(data) {
    var order;
    update(function (db) {
      var last = db.orders.reduce(function (m, o) { var n = +String(o.id).replace(/\D/g, ""); return n > m ? n : m; }, 10000);
      var email = String(data.customer.email || "").toLowerCase(), cust = db.customers.filter(function (c) { return c.email.toLowerCase() === email; })[0];
      if (!cust) {
        cust = { id: "C" + (1001 + db.customers.length), first: data.customer.first, last: data.customer.last, email: data.customer.email, phone: data.customer.phone,
          country: data.address.country, city: data.address.city, createdAt: Date.now(), tags: [], note: "", newsletter: false };
        db.customers.push(cust);
      } else { cust.phone = data.customer.phone || cust.phone; cust.city = data.address.city || cust.city; cust.country = data.address.country || cust.country; }
      var status = data.payment.method === "cod" ? "pending" : "paid";
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
  // reviews shown on the product page: published ones, plus the visitor's own reviews still waiting for moderation
  function reviewsFor(pid) {
    var mine = myReviews();
    return get().reviews.filter(function (r) { return r.pid === pid && (r.status === "published" || (r.status === "pending" && mine.indexOf(r.id) > -1)); })
      .map(function (r) { var x = {}; for (var k in r) x[k] = r[k]; x.mine = mine.indexOf(r.id) > -1; return x; });
  }
  function addReview(pid, rv) {
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

  function subscribe(email, lang, source) {
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
    update(function (db) {
      var k = dayKey(Date.now()), t = db.traffic[k] || (db.traffic[k] = { sessions: 0, views: 0 });
      t.views++; if (first) t.sessions++;
    });
  }

  /* ---------- storefront chrome: announcement bar + maintenance mode ---------- */
  function adminPreview() { try { return !!sessionStorage.getItem("relaxx-admin-session"); } catch (e) { return false; } }
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
  function applyVitrine() {
    var html = document.documentElement, lang = html.getAttribute("data-lang") === "fr" ? "fr" : "en", db = get(), V = db.settings.vitrine || defaultVitrine(), F = V.fields || {};
    var txt = function (f) { return f ? (f[lang] != null && f[lang] !== "" ? f[lang] : f.fr || f.en || "") : null; };
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms-section]"), function (el) { if (V.sections[el.getAttribute("data-cms-section")] === false) el.hidden = true, el.style.display = "none"; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms]"), function (el) {
      var f = F[el.getAttribute("data-cms")], type = el.getAttribute("data-cms-type") || "text";
      if (!f) return;
      if (type === "img") { if (f.v) { el.removeAttribute("srcset"); el.src = imgUrl(f.v, el.classList.contains("social-img") ? 700 : 1600); } return; }
      if (type === "media") { if (f.v) setMedia(el, f, 2000); return; }
      if (type === "href") { if (f.v) el.setAttribute("href", f.v); return; }
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
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms-href]"), function (el) { var f = F[el.getAttribute("data-cms-href")]; if (f && f.v) el.setAttribute("href", f.v); });
    var st = db.settings.store || {};
    Array.prototype.forEach.call(document.querySelectorAll("[data-cms-social]"), function (el) { var u = st[el.getAttribute("data-cms-social")]; if (u) { el.setAttribute("href", u); el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); } });
    // SEO per page
    var page = (location.pathname.split("/").pop() || "index.html").replace(".html", "") || "index", seo = (V.seo || {})[page];
    if (seo) {
      var ti = txt(seo.title), de = txt(seo.desc);
      if (ti) document.title = ti;
      if (de) { var md = document.querySelector("meta[name=description]"); if (md) md.setAttribute("content", de); }
    }
  }
  function vitrine() { return get().settings.vitrine || defaultVitrine(); }

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
      a.setAttribute("href", t.link); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
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
    try {
      applyInstagram();
      var ig = get().settings.instagram;
      if (ig && ig.mode === "api" && ig.token && document.querySelector(".insta-strip [data-insta]") && Date.now() - (ig.lastSync || 0) > (ig.interval || 60) * 60000)
        instaSync().then(applyInstagram, function () {});
    } catch (e) {}
    var html = document.documentElement;
    if (html.hasAttribute("data-admin")) return;
    var lang = html.getAttribute("data-lang") === "fr" ? "fr" : "en", db = get(), c = db.settings.content;
    var css = document.createElement("style");
    css.textContent =
      ".rx-ann{position:fixed;top:0;left:0;right:0;z-index:100001;display:flex;justify-content:center;align-items:center;height:32px;padding:0 44px;background:#0e0e0e;color:#e9e6e2;font:500 12px/1.2 Geist,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-align:center;transition:transform .45s cubic-bezier(.22,1,.36,1)}" +
      ".rx-ann a{color:inherit;text-decoration:none}.rx-ann a:hover{text-decoration:underline;text-underline-offset:3px}" +
      ".rx-ann-x{position:absolute;right:10px;top:50%;width:26px;height:26px;margin-top:-13px;border:0;background:none;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7}.rx-ann-x:hover{opacity:1}" +
      "html.has-ann .mn-bar{top:32px;transition:top .45s cubic-bezier(.22,1,.36,1),opacity .7s,background-color .4s,color .4s}" +
      "html.has-ann.ann-off .rx-ann,html.has-ann.mn-lock .rx-ann{transform:translateY(-100%)}html.has-ann.ann-off .mn-bar,html.has-ann.mn-lock .mn-bar{top:0}" +
      "@media (max-width:479px){.rx-ann{font-size:10px;letter-spacing:.05em;padding:0 36px}}" +
      ".rx-maint{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:22px;padding:24px;background:#0e0e0e;color:#e9e6e2;font-family:Geist,sans-serif;text-align:center}" +
      ".rx-maint b{font-size:clamp(48px,12vw,140px);font-weight:800;letter-spacing:-.05em;line-height:1}.rx-maint p{max-width:460px;margin:0;color:#bdb8b1;font-size:16px;line-height:1.6}" +
      ".rx-preview{position:fixed;left:12px;bottom:12px;z-index:2147483600;padding:8px 12px;background:#c89564;color:#000;font:600 12px Geist,sans-serif;letter-spacing:.04em}";
    document.head.appendChild(css);

    if (c.maintenance && c.maintenance.enabled) {
      if (adminPreview()) {
        var pv = document.createElement("div"); pv.className = "rx-preview"; pv.textContent = "Mode maintenance actif — aperçu administrateur";
        document.body.appendChild(pv);
      } else {
        var m = document.createElement("div"); m.className = "rx-maint"; m.setAttribute("role", "alert"); m.setAttribute("data-no-i18n", "");
        m.innerHTML = "<b>RELAXX</b><p></p>"; m.querySelector("p").textContent = c.maintenance[lang] || c.maintenance.fr;
        document.body.appendChild(m); html.style.overflow = "hidden";
        return;
      }
    }
    var a = c.announcement, closed = false;
    try { closed = sessionStorage.getItem("relaxx-ann-closed") === (a && a.fr); } catch (e) {}
    if (a && a.enabled && (a.fr || a.en) && !closed) {
      var bar = document.createElement("div"); bar.className = "rx-ann"; bar.setAttribute("data-no-i18n", ""); bar.setAttribute("role", "region"); bar.setAttribute("aria-label", lang === "fr" ? "Annonce" : "Announcement");
      var txt = a[lang] || a.fr || a.en;
      bar.innerHTML = (a.link ? '<a></a>' : '<span></span>') + '<button type="button" class="rx-ann-x" aria-label="' + (lang === "fr" ? "Fermer l'annonce" : "Close announcement") + '">×</button>';
      var t = bar.firstChild; t.textContent = txt; if (a.link) t.setAttribute("href", a.link);
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
    get: get, update: update, reload: reload, adopt: adopt, persist: persist, log: log, reset: function () { cache = seed(); migrateColors(cache); persist(); return cache; },
    seed: seed, timeline: timeline, money: money, dayKey: dayKey, sizesOf: sizesOf, totalStock: totalStock, uid: uid,
    defaultColors: defaultColors, colorSlug: colorSlug, hasColors: hasColors, syncStock: syncStock, colorOf: colorOf, adjustStock: adjustStock,
    catalog: catalog, categories: categories, dict: dict, product: product, shipping: shipping, payments: payments, countries: countries,
    vitrine: vitrine, defaultVitrine: defaultVitrine, imgUrl: imgUrl, media: media, setMedia: setMedia,
    defaultInstagram: defaultInstagram, instaConnect: instaConnect, instaSync: instaSync, instaDisconnect: instaDisconnect, instaTiles: instaTiles, instaProfile: instaProfile, applyInstagram: applyInstagram,
    checkPromo: checkPromo, discountFor: discountFor, placeOrder: placeOrder, reviewsFor: reviewsFor, addReview: addReview, subscribe: subscribe, track: track
  };

  if (typeof document !== "undefined" && !document.documentElement.hasAttribute("data-admin")) {
    try { track(); } catch (e) {}
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { try { storefront(); } catch (e) {} });
    else try { storefront(); } catch (e) {}
  }
})();
