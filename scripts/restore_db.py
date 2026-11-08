"""Vraćanje podataka iz backupa (scripts/backup_db.py). Zadano samo pokaže što bi se promijenilo.

  python scripts/restore_db.py --popis                                   # backupi
  python scripts/restore_db.py --utakmica kadeti-2026-27-k4-pula-osijek   # usporedi jednu utakmicu s backupom
  python scripts/restore_db.py --utakmica <id> --upis                    # vrati je kakva je bila u backupu
  python scripts/restore_db.py --natjecanje kadeti-2026-27 --kolo 4      # cijelo kolo
  python scripts/restore_db.py --tablica players --upis                  # cijela tablica
  python scripts/restore_db.py --datoteka backups/hmnl-2026-11-08_2330.json.gz ...   # određeni backup (zadano: zadnji)

Vraća retke iz backupa preko postojećih (isti id). Redove koji su nastali nakon backupa NE briše,
pa se ništa novo ne gubi. Prije svakog vraćanja (--upis) sam napravi svježi backup trenutnog stanja.
"""
import argparse, gzip, json, sys, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backup_db import ROOT, backup_dir, load_env, make_backup, get_all  # noqa: E402

KEYS = {"admins": "email"}   # ostale tablice: id


def load(path):
    return json.loads(gzip.decompress(Path(path).read_bytes()))


def pick(args):
    if args.datoteka: return Path(args.datoteka)
    files = sorted(backup_dir().glob("hmnl-*.json.gz"))
    if not files: sys.exit("Nema backupa u mapi backups/. Prvo pokreni scripts/backup_db.py.")
    return files[-1]


def select(data, args):
    """Vraća {tablica: [redovi]} koje treba vratiti."""
    T = data["tables"]
    if args.tablica:
        if args.tablica not in T: sys.exit(f"Tablice '{args.tablica}' nema u backupu.")
        return {args.tablica: T[args.tablica]}
    ms = T.get("matches", [])
    if args.utakmica: ms = [m for m in ms if m["id"] in args.utakmica]
    elif args.natjecanje:
        ms = [m for m in ms if m["comp"] == args.natjecanje and (args.kolo is None or m["round"] == args.kolo)]
    else: sys.exit("Odaberi --utakmica, --natjecanje (i --kolo) ili --tablica.")
    if not ms: sys.exit("U backupu nema takvih utakmica.")
    # igrači iz zapisnika i događaja tih utakmica (da zapisnik pokazuje na postojeće igrače)
    pids = set()
    for m in ms:
        for side in ("home", "away"):
            pids |= set(((m.get("roster") or {}).get(side) or {}).get("players") or [])
        pids |= {e.get("player") for e in m.get("events") or [] if e.get("player")}
    pl = [p for p in T.get("players", []) if p["id"] in pids]
    return {"players": pl, "matches": ms}


def summarize(table, old, cur):
    """Kratki opis razlike jednog retka (backup -> trenutno)."""
    if cur is None: return "nema ga više u bazi -> vraća se"
    if old == cur: return None
    if table == "matches":
        def goals(m): return sum(1 for e in m.get("events") or [] if e.get("type") in ("goal", "owngoal"))
        bits = []
        if old.get("status") != cur.get("status"): bits.append(f"status {cur.get('status')} -> {old.get('status')}")
        if goals(old) != goals(cur): bits.append(f"golovi {goals(cur)} -> {goals(old)}")
        if len(old.get("events") or []) != len(cur.get("events") or []): bits.append(f"događaja {len(cur.get('events') or [])} -> {len(old.get('events') or [])}")
        if old.get("roster") != cur.get("roster"): bits.append("zapisnik")
        if old.get("date") != cur.get("date"): bits.append("termin")
        return ", ".join(bits) or "sitne razlike"
    ch = [k for k in set(old) | set(cur) if old.get(k) != cur.get(k)]
    return "promijenjeno: " + ", ".join(sorted(ch))


def upsert(url, key, table, rows):
    for i in range(0, len(rows), 200):
        req = urllib.request.Request(f"{url}/rest/v1/{table}", method="POST", data=json.dumps(rows[i:i + 200]).encode(), headers={
            "apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal"})
        try: urllib.request.urlopen(req, timeout=120).read()
        except urllib.error.HTTPError as e: sys.exit(f"{table}: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:300]}")


def main():
    for st in (sys.stdout, sys.stderr):           # Windows: ispis u log (cmd >>) inače puca na č, ć, ž
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datoteka", help="backup (zadano: zadnji u backups/)")
    ap.add_argument("--utakmica", action="append", help="id utakmice (može više puta)")
    ap.add_argument("--natjecanje", help="npr. kadeti-2026-27")
    ap.add_argument("--kolo", type=int)
    ap.add_argument("--tablica", help="cijela tablica, npr. players")
    ap.add_argument("--upis", action="store_true", help="stvarno vrati (bez toga samo usporedba)")
    ap.add_argument("--popis", action="store_true")
    a = ap.parse_args()
    if a.popis:
        for p in sorted(backup_dir().glob("hmnl-*.json.gz")): print(p.name)
        return
    path = pick(a); data = load(path)
    print(f"Backup: {path.name} (napravljen {data['at']})")
    sel = select(data, a)
    url, key = load_env()
    todo = {}
    for table, rows in sel.items():
        if not rows: continue
        cur = {r[KEYS.get(table, "id")]: r for r in (get_all(url, key, table) or [])}
        changed = []
        for r in rows:
            k = r[KEYS.get(table, "id")]
            note = summarize(table, r, cur.get(k))
            if note: changed.append(r); print(f"  {table} {k}: {note}")
        todo[table] = changed
    n = sum(len(v) for v in todo.values())
    if not n: print("Baza je ista kao u backupu, nema ništa za vratiti."); return
    if not a.upis: print(f"{n} redaka bi se vratilo. Za stvarno vraćanje dodaj --upis."); return
    make_backup(url, key)                                         # svježi backup prije vraćanja
    for table in ("players", "matches") + tuple(t for t in todo if t not in ("players", "matches")):
        if todo.get(table): upsert(url, key, table, todo[table])
    print(f"Vraćeno {n} redaka.")


if __name__ == "__main__":
    main()
