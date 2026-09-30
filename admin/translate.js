/* ==========================================================================
   RELAXX back office — automatic English
   The team writes in French only. When something is saved, the English
   version used by the storefront (EN switch) is produced here, once, and
   stored next to the French. Texts that did not change keep their English.
   Service: Google Translate (public endpoint), MyMemory as a fallback.
   On a live site this call belongs on the server (DeepL / Google Cloud
   Translation API with the shop's key).
   ========================================================================== */
(function () {
  "use strict";
  var RX = window.RX, KEY = "relaxx-tr-cache", cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { cache = {}; }
  function keep() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }

  function timeout(p, ms) { return Promise.race([p, new Promise(function (res, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); })]); }
  function google(t) {
    return timeout(fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=" + encodeURIComponent(t)), 8000)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { return j[0].map(function (x) { return x[0]; }).join(""); });
  }
  function mymemory(t) {
    return timeout(fetch("https://api.mymemory.translated.net/get?langpair=fr|en&q=" + encodeURIComponent(t)), 8000)
      .then(function (r) { return r.json(); })
      .then(function (j) { if (+j.responseStatus !== 200) throw new Error(j.responseDetails || "MyMemory"); return j.responseData.translatedText; });
  }
  function one(t) {
    t = String(t == null ? "" : t);
    if (!t.trim()) return Promise.resolve(t.trim());
    if (cache[t]) return Promise.resolve(cache[t]);
    if (t.indexOf("\n") > -1) {
      var lines = t.split("\n");
      // a title broken over short lines ("Pensé pour / durer") is one sentence: translate it whole,
      // then break the English over the same number of lines. Paragraphs are translated one by one.
      if (lines.every(function (l) { return l.trim().length <= 40 && !/[.!?:;]$/.test(l.trim()); }))
        return one(lines.map(function (l) { return l.trim(); }).join(" ")).then(function (r) { return rebreak(r, lines); });
      return Promise.all(lines.map(one)).then(function (a) { return a.join("\n"); });
    }
    return google(t).catch(function () { return mymemory(t); }).then(function (r) {
      r = String(r || "").replace(/\s+([,.;:!?])/g, "$1").trim();
      if (!r) throw new Error("empty");
      cache[t] = r; keep(); return r;
    });
  }
  // spread the words over as many lines as the French had, in the same proportions
  function rebreak(text, frLines) {
    var words = text.split(/\s+/).filter(Boolean), n = Math.min(frLines.length, words.length);
    if (n < 2) return text;
    var frLen = frLines.map(function (l) { return l.trim().length || 1; }), frTot = frLen.reduce(function (a, b) { return a + b; }, 0);
    var total = words.join(" ").length, out = [], wi = 0, done = 0;
    for (var li = 0; li < n; li++) {
      var line = [], left = n - li - 1;
      if (li === n - 1) line = words.slice(wi);
      else {
        var goal = (done + frLen[li]) / frTot * total;
        do { line.push(words[wi++]); } while (wi < words.length - left && (out.join(" ").length + line.join(" ").length + words[wi].length / 2) < goal);
      }
      done += frLen[li]; out.push(line.join(" "));
    }
    return out.join("\n");
  }

  // product, colour and category names read like titles: "Camel wrap coat" -> "Camel Wrap Coat"
  var SMALL = /^(a|an|the|and|or|of|in|on|at|to|for|with|by|from|en|de)$/i;
  RX.titleCase = function (s) { return String(s).split(" ").map(function (w, i) { return i && SMALL.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1); }).join(" "); };

  /* RX.translate(["texte", …], { title: true }) -> Promise<["text", …]>
     Rejects when no service answers (offline): callers keep the French and retry at the next save. */
  RX.translate = function (texts, opts) {
    var list = [].concat(texts), out = new Array(list.length), i = 0;
    function worker() {
      if (i >= list.length) return Promise.resolve();
      var k = i++;
      return one(list[k]).then(function (r) { out[k] = opts && opts.title ? RX.titleCase(r) : r; return worker(); });
    }
    var n = Math.min(4, list.length), ws = [];
    for (var w = 0; w < n; w++) ws.push(worker());
    return Promise.all(ws).then(function () { return out; });
  };
  RX.translateFailed = function () { RX.toast("Traduction anglaise momentanément indisponible : la version anglaise du site affichera le texte français. Elle sera traduite au prochain enregistrement.", "bad"); };

  // small line under a French field showing the English the site uses
  RX.enNote = function (en, attrs) {
    return '<small class="en-note"' + (attrs || "") + ">" + (en ? '<span class="chip mono">EN</span><span class="en-txt">' + RX.esc(en) + "</span>" : '<span class="chip mono">EN</span><span class="en-txt muted">traduit automatiquement à l\'enregistrement</span>') + "</small>";
  };
})();
