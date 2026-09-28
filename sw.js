/* Pace & Power service worker: works offline, refreshes app + program when online */
const CACHE = "ppa-shell-v1";
const FONTS = "ppa-fonts-v1";
const SHELL = ["./", "./index.html", "./app.js", "./program.js", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function withTimeout(p, ms){ return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]); }

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;
  const u = new URL(req.url);
  if(u.hostname === "api.github.com") return; // sync traffic is never cached
  if(u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com"){
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req); if(hit) return hit;
      try{ const r = await fetch(req); c.put(req, r.clone()); return r; }catch(err){ return new Response("", {status:504}); }
    }));
    return;
  }
  if(u.origin !== location.origin) return;
  // Network first (so program changes arrive), cache fallback (so it works offline)
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try{
      const r = await withTimeout(fetch(req, {cache:"no-store"}), 4000);
      if(r && r.ok) c.put(req, r.clone());
      return r;
    }catch(err){
      const hit = await c.match(req, {ignoreSearch:true});
      if(hit) return hit;
      if(req.mode === "navigate") return c.match("./index.html");
      return new Response("Offline", {status:503});
    }
  })());
});
