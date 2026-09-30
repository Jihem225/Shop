/* ==========================================================================
   RELAXX — media service worker
   Serves the files uploaded in the back office (IndexedDB "relaxx-media")
   at media/<id>.<ext>, with byte ranges so videos can play and seek.
   Every other request goes to the network untouched.
   On a live site these files would be uploaded to the server or a CDN.
   ========================================================================== */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

function getFile(id) {
  return new Promise(function (res) {
    var r = indexedDB.open("relaxx-media", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("files", { keyPath: "id" }); };
    r.onerror = function () { res(null); };
    r.onsuccess = function () {
      try {
        var q = r.result.transaction("files").objectStore("files").get(id);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { res(null); };
      } catch (e) { res(null); }
    };
  });
}

self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (u.origin !== self.location.origin || e.request.method !== "GET") return;
  var m = /\/media\/([\w-]+)\.\w+$/.exec(u.pathname);
  if (!m) return;
  e.respondWith(getFile(m[1]).then(function (f) {
    if (!f || !f.blob) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    var blob = f.blob, type = f.type || blob.type || "application/octet-stream", size = blob.size;
    var h = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
    var range = /bytes=(\d*)-(\d*)/.exec(e.request.headers.get("range") || "");
    if (range && (range[1] || range[2])) {
      var start, end;
      if (range[1]) { start = +range[1]; end = range[2] ? Math.min(+range[2], size - 1) : size - 1; }
      else { start = Math.max(0, size - +range[2]); end = size - 1; }
      if (start >= size || start > end) return new Response("", { status: 416, headers: { "Content-Range": "bytes */" + size } });
      h["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
      h["Content-Length"] = String(end - start + 1);
      return new Response(blob.slice(start, end + 1, type), { status: 206, headers: h });
    }
    h["Content-Length"] = String(size);
    return new Response(blob, { status: 200, headers: h });
  }));
});
