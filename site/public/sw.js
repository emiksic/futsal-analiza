// Service worker za instaliranu aplikaciju (PWA). Namjerno jednostavan:
//  - stranica (index.html): uvijek prvo s mreže, a bez interneta zadnja spremljena verzija
//  - datoteke iz /assets/ (imaju hash u imenu, ne mijenjaju se): iz spremnika, inače s mreže pa spremi
//  - ostale vlastite datoteke (ikone, manifest): iz spremnika, a u pozadini se osvježe
//  - sve s drugih domena (Supabase, YouTube, fontovi) ide mimo service workera
// Ako ikad zatreba ugasiti: zamijeni sadržaj ove datoteke s self.registration.unregister() i objavi.
const CACHE = "hmnl-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const put = async (req, res) => { if (res && res.ok && res.type === "basic") (await caches.open(CACHE)).put(req, res.clone()); return res; };

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.endsWith("/sw.js")) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try { return await put(new Request(new URL("./", self.registration.scope)), await fetch(req)); }
      catch { return (await caches.match(new URL("./", self.registration.scope))) || Response.error(); }
    })());
    return;
  }
  if (url.pathname.includes("/assets/")) {
    e.respondWith((async () => (await caches.match(req)) || put(req, await fetch(req)))());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const net = fetch(req).then((r) => put(req, r)).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
