"""Testovi za backup_db.py i restore_db.py bez mreže: python -m pytest scripts/tests -q"""
import gzip, io, json, sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import backup_db as B  # noqa: E402
import restore_db as R  # noqa: E402


class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): pass


def fake_db(tables):
    def urlopen(req, timeout=0):
        table = req.full_url.split("/rest/v1/")[1].split("?")[0]
        a, b = map(int, req.headers["Range"].split("-"))
        return Resp(json.dumps(tables.get(table, [])[a:b + 1]).encode())
    return urlopen


def test_backup_paginates_and_writes(tmp_path, monkeypatch):
    players = [{"id": f"p{i}", "name": f"Igrač {i}"} for i in range(2350)]
    monkeypatch.setattr(B.urllib.request, "urlopen", fake_db({"players": players, "matches": [{"id": "m1"}]}))
    path = B.make_backup("https://x.supabase.co", "k", out_dir=tmp_path, quiet=True)
    data = json.loads(gzip.decompress(path.read_bytes()))
    assert len(data["tables"]["players"]) == 2350 and data["tables"]["matches"] == [{"id": "m1"}]


def test_restore_selects_round_with_players():
    data = {"tables": {"matches": [
        {"id": "a", "comp": "kadeti-2026-27", "round": 4, "roster": {"home": {"players": ["p1"]}}, "events": [{"type": "goal", "player": "p2"}]},
        {"id": "b", "comp": "kadeti-2026-27", "round": 3, "roster": {}, "events": []}],
        "players": [{"id": "p1"}, {"id": "p2"}, {"id": "p3"}]}}
    sel = R.select(data, SimpleNamespace(tablica=None, utakmica=None, natjecanje="kadeti-2026-27", kolo=4))
    assert [m["id"] for m in sel["matches"]] == ["a"] and {p["id"] for p in sel["players"]} == {"p1", "p2"}


def test_summarize():
    old = {"id": "a", "status": "finished", "events": [{"type": "goal"}] * 3, "roster": {}, "date": "x"}
    cur = dict(old, events=[{"type": "goal"}])
    assert R.summarize("matches", old, cur) == "golovi 1 -> 3, događaja 1 -> 3"
    assert R.summarize("matches", old, dict(old)) is None and "vraća se" in R.summarize("matches", old, None)
