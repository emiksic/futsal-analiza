"""Upload podataka analize na stranicu (javni Supabase bucket "analysis") i upis u utakmicu.

  python scripts/upload_analysis.py run/web.json --match <match_id>
        [--yt-offset 754.2] [--team-map RIJ=home NVR=away] [--dry-run]

Što radi:
  1. gzipa JSON (izlaz export_web.py) -> analysis/<match_id>/data.json.gz (prepiše stari)
  2. u matches.analysis upiše status "done", javni URL, veličinu i vrijeme uploada;
     ostala polja analize (prava, bilješke, potvrđene boje...) ostaju kakva jesu
  3. ako boje ekipa još nisu povezane s domaćinom/gostom: prva ekipa u podacima = domaćin,
     druga = gost, uz oznaku "nepotvrđeno" (u adminu: Zamijeni / Potvrdi)

Ključ: datoteka .env u korijenu repoa (NIKAD u git, već je u .gitignore):
  SUPABASE_SECRET_KEY=sb_secret_...
URL baze se čita iz site/src/lib/config.js (ili SUPABASE_URL u .env).
Bez vanjskih paketa (samo standardna biblioteka).
"""
import argparse, gzip, json, os, re, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "analysis"


def load_env():
    env = dict(os.environ)
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    if "SUPABASE_URL" not in env:
        m = re.search(r'SUPABASE_URL\s*=\s*"([^"]+)"', (ROOT / "site/src/lib/config.js").read_text(encoding="utf-8"))
        if m: env["SUPABASE_URL"] = m.group(1)
    key = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key: sys.exit("Nema ključa: u .env upiši SUPABASE_SECRET_KEY=... (Supabase -> Settings -> API Keys -> secret).")
    if key.startswith("sb_publishable"): sys.exit("To je javni (publishable) ključ; treba secret ključ.")
    return env["SUPABASE_URL"].rstrip("/"), key


def call(method, url, key, body=None, headers=None):
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            raw = r.read()
            return json.loads(raw) if raw and r.headers.get_content_type() == "application/json" else None
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {url.split('?')[0]} -> HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data", help="JSON iz export_web.py")
    ap.add_argument("--match", required=True, help="id utakmice (kao u bazi / adminu)")
    ap.add_argument("--yt-offset", type=float, help="sekunda YouTube snimke koja odgovara t=0 u podacima")
    ap.add_argument("--team-map", nargs="*", help="npr. RIJ=home NVR=away (kratice iz podataka)")
    ap.add_argument("--dry-run", action="store_true", help="samo provjeri i ispiši, ništa ne šalji")
    a = ap.parse_args()

    if not re.fullmatch(r"[\w-]+", a.match): sys.exit("Neispravan id utakmice.")
    raw = Path(a.data).read_bytes()
    D = json.loads(raw)                                       # provjera da je ispravan JSON prije slanja
    teams = [t["name"] for t in D.get("teams", [])[:2]]
    gz = gzip.compress(json.dumps(D, separators=(",", ":")).encode("utf-8"), 9)
    nfr = len(D.get("frames", []))
    print(f"{a.data}: {nfr} frameova, ekipe {teams}, {len(raw) / 1e6:.1f} MB -> gzip {len(gz) / 1e6:.1f} MB")

    url, key = load_env()
    rows = call("GET", f"{url}/rest/v1/matches?id=eq.{a.match}&select=id,home,away,analysis", key)
    if not rows: sys.exit(f"Utakmica '{a.match}' ne postoji u bazi.")
    m = rows[0]; an = dict(m.get("analysis") or {})

    path = f"{a.match}/data.json.gz"
    public = f"{url}/storage/v1/object/public/{BUCKET}/{path}?v={int(time.time())}"   # ?v= da preglednik/CDN ne vrate staru verziju
    an.update({"status": "done", "data": public, "path": f"{BUCKET}/{path}", "bytes": len(gz), "frames": nfr,
               "uploaded": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    if a.yt_offset is not None: an["ytOffset"] = a.yt_offset
    if a.team_map:
        an["teamMap"] = dict(kv.split("=", 1) for kv in a.team_map); an["kitUnconfirmed"] = False
    elif not an.get("teamMap") or set(an["teamMap"]) != set(teams):
        an["teamMap"] = {teams[0]: "home", teams[1]: "away"} if len(teams) == 2 else {}
        an["kitUnconfirmed"] = True
        print("Boje ekipa: pretpostavka (prva = domaćin) -> provjeri u adminu i potvrdi.")

    if a.dry_run:
        print("dry-run, ne šaljem. analysis =", json.dumps(an, ensure_ascii=False)); return
    call("POST", f"{url}/storage/v1/object/{BUCKET}/{path}", key, gz,
         {"Content-Type": "application/gzip", "x-upsert": "true", "cache-control": "max-age=3600"})
    call("PATCH", f"{url}/rest/v1/matches?id=eq.{a.match}", key, json.dumps({"analysis": an}).encode("utf-8"),
         {"Content-Type": "application/json", "Prefer": "return=minimal"})
    print("Gotovo:", public.split("?")[0])


if __name__ == "__main__":
    main()
