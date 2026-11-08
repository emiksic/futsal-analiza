"""Testovi za scripts/semafor_sync.py (bez mreže): python -m pytest scripts/tests/test_semafor_sync.py -q
Imena igrača u fiksturama su izmišljena (mlađe kategorije: stvarna imena ne idu u repo).
Fiksture u tests/semafor/ složene su po oznakama stvarnih stranica Semafora."""
import copy, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import semafor_sync as S  # noqa: E402

FIX = HERE / "semafor"
MATCH_URL = "https://semafor.hns.family/utakmice/116552153/amnk-universitas-split-mnk-crnica-4-6/"


def html(name): return (FIX / name).read_text(encoding="utf-8")


def test_competition():
    rows = S.parse_competition(html("natjecanje-juniori.html"))
    assert [(r["round"], r["home"], r["away"], r["score"]) for r in rows] == [
        (4, "AMNK Universitas Split", "MNK Crnica", (4, 6)), (4, "MNK Novo vrijeme", "MNK Uspinjača Gimka", (1, 5)),
        (5, "MNK Osijek", "MNK Futsal Dinamo", None), (5, "HMNK Rijeka", "AMNK Universitas Split", None)]
    assert rows[0]["url"] == MATCH_URL and rows[0]["time"] == "14:30"
    assert rows[2]["time"] is None and rows[2]["url"] is None and rows[2]["hall"] == "ŠD Zrinjevac, Osijek"


def test_cup_rounds_and_shootout_score():
    r = S.parse_competition(html("natjecanje-kup.html"), cup=True)[0]
    assert r["round"] == 1 and r["score"] == (3, 3) and r["pen"] == (3, 4)


def test_match():
    d = S.parse_match(html("utakmica-universitas-crnica.html"))
    assert d["score"] == (4, 6) and not d["unknown"]
    assert len(d["goals"]) == 10
    og = [g for g in d["goals"] if g["own"]][0]
    assert og == {"benef": "away", "own": True, "name": "Domaći Golman", "t": 27 * 60 + 36, "exact": True}
    pen = [g for g in d["goals"] if g.get("pen")]
    assert len(pen) == 1 and pen[0]["name"] == "Gostujući Tri" and pen[0]["pen"] == 10
    H, A = d["teams"]["home"], d["teams"]["away"]
    assert len([r for r in H if not r["staff"]]) == 13 and len([r for r in A if not r["staff"]]) == 14
    assert [r["num"] for r in H if r["start"]] == ["2", "7", "9", "13", "14"]
    assert [r["name"] for r in H if r["cap"]] == ["Domaći Kapetan"] and [r["name"] for r in A if r["gk"]] == ["Gostujući Golman", "Gostujući Rezerva"]
    mar = next(r for r in H if r["name"] == "Domaći Tri")
    assert [c["card"] for c in mar["events"]] == ["yellow", "red2"]
    coach = next(r for r in A if r["staff"])
    assert coach["name"] == "Gostujući Trener" and coach["events"][0]["card"] == "yellow"


def test_time():
    assert S.tparse("4'54\"") == (294, True) and S.tparse("39'") == (38 * 60 + 30, False)
    assert S.to_ev_time(294, True) == {"period": 1, "sec": 294, "exact": True}
    assert S.to_ev_time(1200, True)["period"] == 1 and S.to_ev_time(1201, True) == {"period": 2, "sec": 1, "exact": True}
    assert S.ev_minute({"period": 2, "sec": 456}) == 28


def test_club_key():
    assert S.club_key("AMNK Universitas Split") == "universitas split"
    assert S.club_key("HMNK Rijeka") == "rijeka" and S.club_key("MNK Uspinjača Gimka") == "uspinjaca gimka"


# ---------------------------------------------------------------- usklađivanje s lažnom bazom
CLUBS = [{"id": "universitas", "name": "Universitas Split", "full_name": "AMNK Universitas Split", "short": "UNI"},
         {"id": "crnica", "name": "Crnica", "full_name": "MNK Crnica", "short": "CRN"},
         {"id": "gimka", "name": "Uspinjača Gimka", "full_name": None, "short": "GIM"},
         {"id": "novo-vrijeme", "name": "Novo Vrijeme", "full_name": None, "short": "NVR"},
         {"id": "osijek", "name": "Osijek", "full_name": None, "short": "OSI"},
         {"id": "futsal-dinamo", "name": "Futsal Dinamo", "full_name": None, "short": "DIN"},
         {"id": "rijeka", "name": "Rijeka", "full_name": None, "short": "RIJ"}]
U_NAMES = ["Domaći Golman", "Domaći Dva", "Domaći Tri", "Domaći Četiri", "Domaći Pet", "Domaći Rezerva", "Domaći Šest",
           "Domaći Šućur Sedam", "Domaći Osam", "Domaći Kapetan", "Domaći Devet", "Domaći Deset", "Domaći Jedanaest"]
C_NAMES = ["Gostujući Golman", "Gostujući Dva", "Gostujući Tri", "Gostujući Četiri", "Gostujući Pet", "Gostujući Rezerva", "Gostujući Šest", "Gostujući Sedam",
           "Gostujući Osam", "Gostujući Devet", "Gostujući Kapetan", "Gostujući Deset", "Gostujući Jedanaest"]   # Gostujući Novi fali -> novi igrač


class FakeDB:
    def __init__(self, match, extra_players=()):
        self.match = match; self.patches = []; self.inserted = []; self.logs = []
        self.players = [{"id": f"universitas-p{i}", "club": "universitas", "cat": "U-19", "season": "2026-27", "num": "", "name": n, "gk": False}
                        for i, n in enumerate(U_NAMES)] + \
                       [{"id": f"crnica-p{i}", "club": "crnica", "cat": "U-19", "season": "2026-27", "num": "", "name": n, "gk": False}
                        for i, n in enumerate(C_NAMES)] + list(extra_players)

    def get(self, path):
        if path.startswith("clubs"): return CLUBS
        if path.startswith("players"):
            club = path.split("club=eq.")[1]; return [p for p in self.players if p["club"] == club]
        if path.startswith("matches"): return [self.match]
        raise AssertionError(path)

    def patch_match(self, mid, body): self.patches.append((mid, body))
    def insert_player(self, row): self.inserted.append(row)
    def log(self, row): self.logs.append(row)


BASE = {"id": "juniori-2026-27-k4-universitas-crnica", "comp": "juniori-2026-27", "round": 4, "date": "2026-11-08T14:30:00+01:00",
        "home": "universitas", "away": "crnica", "status": "scheduled", "result": None, "time_tbd": False, "events": [], "roster": {}, "source": None}


def run(match, write=True, fetch_map=None, extra_players=()):
    db = FakeDB(copy.deepcopy(match), extra_players)
    pages = {S.COMPS["juniori-2026-27"]["url"]: html("natjecanje-juniori.html"), MATCH_URL: html("utakmica-universitas-crnica.html")}
    pages.update(fetch_map or {})
    orig = S.fetch
    S.fetch = lambda url, tries=3: pages[url] if url in pages else (_ for _ in ()).throw(S.SemaforError("nema " + url))
    try:
        s = S.Sync(db, write=write)
        s.run_comp("juniori-2026-27", S.COMPS["juniori-2026-27"], only_round=4)
    finally:
        S.fetch = orig
    s.diffs = [d for d in s.diffs if "Novo vrijeme" not in d]     # lažna baza ima samo jednu utakmicu
    return s, db


def test_fresh_entry():
    s, db = run(BASE)
    assert not s.errors and not s.diffs, (s.errors, s.diffs)
    assert len(db.patches) == 1
    mid, body = db.patches[0]
    assert body["status"] == "finished" and body["source"] == "HNS Semafor"
    ev = body["events"]
    goals = [e for e in ev if e["type"] == "goal"]; og = [e for e in ev if e["type"] == "owngoal"]
    assert len(goals) == 9 and len(og) == 1 and og[0]["side"] == "home"           # autogol: strana igrača (Universitas)
    assert next(e for e in goals if e.get("pen"))["dist"] == 10
    red = [e for e in ev if e["type"] == "red"]
    assert len(red) == 1 and red[0]["secondYellow"] and red[0]["period"] == 2 and red[0]["sec"] == 34 * 60 + 12 - 1200
    assert any(e.get("staff") for e in ev)
    R = body["roster"]["away"]
    assert len(R["players"]) == 14 and R["num"][R["start"][0]] == "1" and R["cap"] == "crnica-p10"
    assert [p["name"] for p in db.inserted] == ["Gostujući Novi"]
    assert body["roster"]["home"]["cap"] == "universitas-p9"


def test_dry_run_writes_nothing():
    s, db = run(BASE, write=False)
    assert s.done and not db.patches and not db.inserted


def test_existing_matching_fills_seconds_and_captain():
    s1, db1 = run(BASE)
    body = db1.patches[0][1]
    # "ručni" upis: isti golovi, ali na punu minutu bez sekundi i bez kapetana
    ev = []
    for e in body["events"]:
        e = dict(e)
        if e["type"] in ("goal", "owngoal"):
            t = (e["period"] - 1) * 1200 + e["sec"]; t = (-(-t // 60)) * 60
            e.update(period=1 if t <= 1200 else 2, sec=t - (0 if t <= 1200 else 1200)); e.pop("exact", None); e.pop("pen", None); e.pop("dist", None)
        ev.append(e)
    roster = copy.deepcopy(body["roster"]); roster["home"].pop("cap"); roster["away"].pop("cap")
    m = dict(BASE, status="finished", events=ev, roster=roster)
    s, db = run(m, extra_players=db1.inserted)
    assert not s.diffs, s.diffs
    assert len(db.patches) == 1 and "nadopunjeno" in s.done[0]
    out = db.patches[0][1]
    assert all(e.get("exact") for e in out["events"] if e["type"] in ("goal", "owngoal"))
    assert out["roster"]["home"]["cap"] == "universitas-p9" and out["roster"]["away"]["cap"] == "crnica-p10"


def test_existing_different_reports_only():
    s1, db1 = run(BASE)
    body = db1.patches[0][1]
    ev = [e for e in body["events"] if not (e["type"] == "goal" and e["side"] == "home")][:]   # u bazi fale golovi domaćina
    m = dict(BASE, status="finished", events=ev, roster=body["roster"])
    s, db = run(m)
    assert not db.patches and s.diffs and "nije u bazi" in s.diffs[0]


def test_schedule_time_update():
    comp = html("natjecanje-juniori.html")
    m = dict(BASE, id="juniori-2026-27-k5-rijeka-universitas", round=5, home="rijeka", away="universitas", date="2026-11-14T20:00:00+01:00", time_tbd=True)
    db = FakeDB(m)
    orig = S.fetch; S.fetch = lambda url, tries=3: comp
    try:
        s = S.Sync(db, write=True); s.run_comp("juniori-2026-27", S.COMPS["juniori-2026-27"], only_round=5)
    finally: S.fetch = orig
    assert db.patches == [("juniori-2026-27-k5-rijeka-universitas", {"date": "2026-11-15T12:00:00+01:00", "time_tbd": False})]


def test_broken_page_writes_nothing():
    s, db = run(BASE, fetch_map={MATCH_URL: "<html><main>nešto drugo</main></html>"})
    assert s.errors and not db.patches
