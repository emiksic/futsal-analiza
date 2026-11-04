// Edge funkcija "objavi": objava slika (jedna ili karusel do 10) s opisom na Instagram i Facebook stranicu.
// Poziva je samo admin iz admin panela (Objave). Meta token je tajna funkcije, nikad u kodu stranice.
//
// Tajne (Supabase -> Edge Functions -> Secrets):
//   META_PAGE_TOKEN   dugotrajni Page access token (instagram_content_publish, pages_manage_posts, pages_read_engagement)
//   META_PAGE_ID      ID Facebook stranice
//   META_IG_USER_ID   ID Instagram Business računa povezanog sa stranicom
//   META_GRAPH        (neobavezno) verzija Graph API-ja, zadano v21.0
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Samo POST." }, 405);

  // samo admin (ista provjera kao u bazi: public.is_admin())
  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: isAdmin, error: aerr } = await sb.rpc("is_admin");
  if (aerr || !isAdmin) return json({ error: "Samo admin može objavljivati." }, 403);

  const TOKEN = Deno.env.get("META_PAGE_TOKEN"), PAGE = Deno.env.get("META_PAGE_ID"), IG = Deno.env.get("META_IG_USER_ID");
  const G = `https://graph.facebook.com/${Deno.env.get("META_GRAPH") || "v21.0"}`;
  if (!TOKEN || !PAGE || !IG) return json({ error: "Meta još nije spojena: u Supabaseu postavi tajne META_PAGE_TOKEN, META_PAGE_ID i META_IG_USER_ID." }, 503);

  let body: { images?: string[]; caption?: string; targets?: string[] };
  try { body = await req.json(); } catch { return json({ error: "Neispravan zahtjev." }, 400); }
  const images = (body.images || []).filter((u) => typeof u === "string");
  const caption = String(body.caption || "").slice(0, 2200);
  const targets = (body.targets || []).filter((t) => t === "ig" || t === "fb");
  // slike smiju biti samo iz našeg javnog bucketa "objave"
  const base = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/objave/`;
  if (!images.length || images.length > 10 || images.some((u) => !u.startsWith(base))) return json({ error: "Slike moraju biti 1–10, iz bucketa objave." }, 400);
  if (!targets.length) return json({ error: "Odaberi Instagram ili Facebook." }, 400);

  const call = async (path: string, params: Record<string, string>, method = "POST") => {
    const q = new URLSearchParams({ ...params, access_token: TOKEN });
    const r = await fetch(`${G}/${path}${method === "GET" ? "?" + q : ""}`, method === "GET" ? {} : { method, body: q });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(j.error?.message || `Meta greška ${r.status}`);
    return j;
  };
  // Instagram obradi sliku asinkrono: čekaj da kontejner bude spreman
  const ready = async (id: string) => {
    for (let i = 0; i < 20; i++) {
      const s = await call(id, { fields: "status_code" }, "GET");
      if (s.status_code === "FINISHED") return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram nije prihvatio sliku.");
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error("Instagram predugo obrađuje sliku.");
  };

  const results: Record<string, { ok: boolean; id?: string; error?: string }> = {};
  if (targets.includes("ig")) {
    try {
      let container: string;
      if (images.length === 1) {
        container = (await call(`${IG}/media`, { image_url: images[0], caption })).id;
      } else {
        const kids: string[] = [];
        for (const u of images) kids.push((await call(`${IG}/media`, { image_url: u, is_carousel_item: "true" })).id);
        for (const k of kids) await ready(k);
        container = (await call(`${IG}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption })).id;
      }
      await ready(container);
      results.ig = { ok: true, id: (await call(`${IG}/media_publish`, { creation_id: container })).id };
    } catch (e) { results.ig = { ok: false, error: (e as Error).message }; }
  }
  if (targets.includes("fb")) {
    try {
      if (images.length === 1) {
        results.fb = { ok: true, id: (await call(`${PAGE}/photos`, { url: images[0], message: caption })).post_id };
      } else {
        const ids: string[] = [];
        for (const u of images) ids.push((await call(`${PAGE}/photos`, { url: u, published: "false" })).id);
        const p: Record<string, string> = { message: caption };
        ids.forEach((id, i) => { p[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
        results.fb = { ok: true, id: (await call(`${PAGE}/feed`, p)).id };
      }
    } catch (e) { results.fb = { ok: false, error: (e as Error).message }; }
  }
  const ok = Object.values(results).every((r) => r.ok);
  return json({ ok, results }, ok ? 200 : 502);
});
