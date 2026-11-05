"""Automatska objava kola na Instagram i Facebook (raspored kad izađe satnica, rezultati kad je kolo odigrano).

  python scripts/objava.py --comp 1-hmnl-2026-27 --round 5 --kind raspored            (objavi ako već nije)
  python scripts/objava.py --comp juniori-2026-27 --round 4 --kind raspored --dry-run (samo provjera i slike u run/objave/)
        [--targets ig,fb] [--theme dark|light] [--force] [--site https://hmnl.hr]

Kako radi:
  1. otvori https://hmnl.hr/#/izrada/<comp>/<round>/<kind>/<theme> u headless Chromiumu (Playwright),
     pričeka da stranica iz baze nacrta slike i opis (iste kao u #/objave),
  2. provjeri uvjete: raspored samo kad sve utakmice kola imaju objavljeno vrijeme,
     rezultati samo kad su sve odigrane; i da to kolo već nije objavljeno (public.objave_log),
  3. spremi slike u bucket "objave" i pozove funkciju "objavi" s tajnim ključem (x-objavi-key).

Treba: .env sa SUPABASE_SECRET_KEY (kao upload_analysis.py) i Playwright:
  pip install playwright  &&  python -m playwright install chromium
Izlazni kod: 0 objavljeno ili preskočeno (već objavljeno / uvjeti nisu ispunjeni), 1 greška.
"""
import argparse, base64, json, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from upload_analysis import load_env  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def req(url, key, method="GET", body=None, ctype="application/json", extra=None):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": ctype}
    h.update(extra or {})
    r = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=180) as f:
            t = f.read().decode()
            return f.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, {"error": t[:300]}


def render(site, comp, rnd, kind, theme):
    from playwright.sync_api import sync_playwright
    url = f"{site.rstrip('/')}/#/izrada/{comp}/{rnd}/{kind}/{theme}"
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 900})
        pg.goto(url, wait_until="networkidle", timeout=90000)
        pg.wait_for_function("window.__objava && window.__objava.ready", timeout=90000)
        o = pg.evaluate("window.__objava")
        b.close()
    if o.get("error"): raise RuntimeError(o["error"])
    return o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--comp", required=True); ap.add_argument("--round", type=int, required=True)
    ap.add_argument("--kind", choices=["raspored", "rezultati"], required=True)
    ap.add_argument("--targets", default="ig,fb"); ap.add_argument("--theme", default="dark", choices=["dark", "light"])
    ap.add_argument("--site", default="https://hmnl.hr")
    ap.add_argument("--force", action="store_true", help="objavi i ako je već objavljeno / uvjeti nisu ispunjeni")
    ap.add_argument("--dry-run", action="store_true", help="samo provjera i slike u run/objave/, bez objave")
    a = ap.parse_args()
    env = load_env(); base = env["SUPABASE_URL"].rstrip("/")
    key = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key: sys.exit("Nema SUPABASE_SECRET_KEY u .env")
    tag = f"{a.comp} {a.round}. kolo ({a.kind})"

    # već objavljeno?
    q = urllib.parse.urlencode({"select": "id,created_at", "comp": f"eq.{a.comp}", "round": f"eq.{a.round}", "kind": f"eq.{a.kind}", "ok": "eq.true"})
    st, rows = req(f"{base}/rest/v1/objave_log?{q}", key)
    if st != 200: print(f"Upozorenje: dnevnik objava nije dostupan ({st}): {rows}"); rows = []
    if rows and not a.force:
        print(f"PRESKOČENO: {tag} je već objavljeno ({rows[0]['created_at']})."); return 0

    o = render(a.site, a.comp, a.round, a.kind, a.theme)
    print(f"{tag}: {len(o['images'])} slika, utakmica {o['matches']}, s vremenom {o['timed']}, odigrano {o['finished']}")
    if not a.force:
        if not o["matches"]: print("PRESKOČENO: kolo nema utakmica u bazi."); return 0
        if a.kind == "raspored" and o["timed"] < o["matches"]:
            print(f"PRESKOČENO: satnica nije potpuna ({o['timed']}/{o['matches']})."); return 0
        if a.kind == "rezultati" and o["finished"] < o["matches"]:
            print(f"PRESKOČENO: nisu sve utakmice odigrane ({o['finished']}/{o['matches']})."); return 0
        if a.kind == "raspored" and o["finished"]:
            print("PRESKOČENO: dio kola je već odigran, raspored se više ne objavljuje."); return 0

    pngs = [base64.b64decode(u.split(",", 1)[1]) for u in o["images"]]
    out = ROOT / "run" / "objave" / f"{a.comp}-{a.round}-{a.kind}"
    out.mkdir(parents=True, exist_ok=True)
    for i, b in enumerate(pngs): (out / f"{i + 1}.png").write_bytes(b)
    (out / "opis.txt").write_text(o["caption"], encoding="utf-8")
    if a.dry_run: print(f"DRY RUN: slike i opis u {out}"); return 0

    urls, stamp = [], int(time.time())
    for i, b in enumerate(pngs):
        path = f"{a.comp}/{a.round}/auto-{stamp}-{i + 1}.png"
        st, r = req(f"{base}/storage/v1/object/objave/{path}", key, "POST", b, "image/png", {"x-upsert": "true"})
        if st not in (200, 201): print(f"GREŠKA upload slike {i + 1}: {st} {r}"); return 1
        urls.append(f"{base}/storage/v1/object/public/objave/{path}")
    body = {"images": urls, "caption": o["caption"], "targets": [t for t in a.targets.split(",") if t],
            "meta": {"comp": a.comp, "round": a.round, "kind": a.kind, "auto": True}}
    st, r = req(f"{base}/functions/v1/objavi", key, "POST", body, extra={"x-objavi-key": key})
    print(json.dumps(r, ensure_ascii=False))
    if st == 200 and r and r.get("ok"): print(f"OBJAVLJENO: {tag}"); return 0
    print(f"GREŠKA objave ({st})"); return 1


if __name__ == "__main__":
    sys.exit(main())
