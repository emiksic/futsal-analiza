"""Backup baze stranice hmnl.hr (sve tablice) u jednu .json.gz datoteku na računalu.

  python scripts/backup_db.py                         # backup u backups/ (u repou, nije na GitHubu)
  python scripts/backup_db.py --kopija "C:\\Users\\Erik\\OneDrive\\hmnl-backup"   # i kopija izvan računala
  python scripts/backup_db.py --popis                 # postojeći backupi

Datoteka: backups/hmnl-2026-11-08_2330.json.gz  ->  {"at": ..., "tables": {"matches": [...], "players": [...], ...}}
Zadržava zadnjih --zadrzi (zadano 40) backupa; stariji se brišu samo iz mape backups/, nikad iz baze.
Backup sadrži puna imena igrača (i mlađih kategorija): drži ga samo na svom računalu / svom OneDriveu.
Datoteke analize videa (Storage) nisu u backupu: mogu se ponovno napraviti iz videa.

Vraćanje: scripts/restore_db.py.
Ključ: SUPABASE_SECRET_KEY u .env.

Windows Task Scheduler (svaki ponedjeljak u 7:00, nakon vikenda kad se igra kolo):
  schtasks /Create /TN "HMNL backup" /SC WEEKLY /D MON /ST 07:00 ^
    /TR "cmd /c cd /d D:\\futsal-analiza && python scripts\\backup_db.py >> run\\backup.log 2>&1"
"""
import argparse, gzip, json, os, re, shutil, sys, time, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLES = ["seasons", "halls", "leagues", "clubs", "comps", "players", "matches", "site", "admins", "semafor_log"]
PAGE = 1000


def load_env():
    env = dict(os.environ)
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1); env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    if "SUPABASE_URL" not in env:
        m = re.search(r'SUPABASE_URL\s*=\s*"([^"]+)"', (ROOT / "site/src/lib/config.js").read_text(encoding="utf-8"))
        if m: env["SUPABASE_URL"] = m.group(1)
    key = env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key: sys.exit("Nema ključa: u .env upiši SUPABASE_SECRET_KEY=...")
    return env["SUPABASE_URL"].rstrip("/"), key


def get_all(url, key, table):
    """Svi redovi tablice, po 1000 (ograničenje Supabasea po zahtjevu)."""
    rows, start = [], 0
    while True:
        req = urllib.request.Request(f"{url}/rest/v1/{table}?select=*", headers={
            "apikey": key, "Authorization": f"Bearer {key}", "Range-Unit": "items", "Range": f"{start}-{start + PAGE - 1}"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r: part = json.loads(r.read() or b"[]")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None                     # tablica ne postoji (npr. starija baza)
            raise RuntimeError(f"{table}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:200]}")
        rows += part
        if len(part) < PAGE: return rows
        start += PAGE


def backup_dir():
    d = Path(os.environ.get("HMNL_BACKUP_DIR") or ROOT / "backups"); d.mkdir(parents=True, exist_ok=True); return d


def make_backup(url, key, out_dir=None, copy_to=None, keep=40, quiet=False):
    out_dir = Path(out_dir) if out_dir else backup_dir()
    data = {"at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "source": url, "tables": {}}
    for t in TABLES:
        rows = get_all(url, key, t)
        if rows is not None: data["tables"][t] = rows
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    name = time.strftime("hmnl-%Y-%m-%d_%H%M.json.gz")
    path = out_dir / name
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(gzip.compress(raw, 9)); tmp.replace(path)     # cijela datoteka ili ništa
    # provjera: datoteka se mora moći pročitati i imati sve tablice
    check = json.loads(gzip.decompress(path.read_bytes()))
    assert set(check["tables"]) == set(data["tables"])
    counts = ", ".join(f"{t} {len(v)}" for t, v in data["tables"].items())
    if not quiet: print(f"Backup: {path} ({path.stat().st_size / 1024:.0f} kB) · {counts}")
    if copy_to:
        dst = Path(copy_to); dst.mkdir(parents=True, exist_ok=True); shutil.copy2(path, dst / name)
        if not quiet: print(f"Kopija: {dst / name}")
    old = sorted(out_dir.glob("hmnl-*.json.gz"))[:-keep] if keep > 0 else []
    for p in old: p.unlink()
    return path


def last_backup_age_hours():
    files = sorted(backup_dir().glob("hmnl-*.json.gz"))
    return (time.time() - files[-1].stat().st_mtime) / 3600 if files else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kopija", help="mapa za dodatnu kopiju (npr. OneDrive)")
    ap.add_argument("--zadrzi", type=int, default=40, help="koliko zadnjih backupa zadržati (zadano 40)")
    ap.add_argument("--popis", action="store_true", help="ispiši postojeće backupe")
    a = ap.parse_args()
    if a.popis:
        for p in sorted(backup_dir().glob("hmnl-*.json.gz")):
            print(f"{p.name}  {p.stat().st_size / 1024:.0f} kB")
        return
    url, key = load_env()
    make_backup(url, key, copy_to=a.kopija or os.environ.get("HMNL_BACKUP_COPY"), keep=a.zadrzi)


if __name__ == "__main__":
    main()
