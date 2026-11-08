"""Usklađivanje baze stranice hmnl.hr s HNS Semaforom (rezultati, zapisnici, događaji, satnice).

Pokretanje (s korijena repoa):
  python scripts/semafor_sync.py                 # samo provjera: ništa ne upisuje, ispiše izvještaj
  python scripts/semafor_sync.py --upis          # upisuje (pravila dolje)
  python scripts/semafor_sync.py --natjecanje kadeti-2026-27 --kolo 4
  python scripts/semafor_sync.py --sve           # sve odigrane utakmice, ne samo zadnjih 10 dana

Pravila (po utakmici, uparenoj po natjecanju, kolu, domaćinu i gostu):
  - utakmica na Semaforu završena, a u bazi nema golova  -> upiše zapisnik, golove, kartone, kaznene, status Kraj
  - u bazi je već upisana                                  -> dopiše sve što fali (golove, kartone, kaznene, igrače u zapisniku,
                                                            brojeve, petorku, golmane, kapetana, sekunde, oznake penala)
  - ono što je u bazi drukčije nego na Semaforu            -> NE prepisuje, samo javi razliku (tvoj upis ostaje)
    (ako u bazi postoji gol kojeg Semafor nema, golove uopće ne dira, da se ne udvostruče)
  - promijenjen termin (datum/sat) neodigrane utakmice     -> ispravi termin
Nikad ne briše utakmice, događaje ni igrače. Ne objavljuje ništa na mreže.
Ako se Semafor ne učita ili mu se promijeni izgled, javi grešku i ne upisuje ništa.

Izvještaj: ispis u konzolu, zapis u tablicu semafor_log (vidi se u adminu na stranici Utakmice)
i obavijest na mobitel preko ntfy (u .env: NTFY_TOPIC=nesto-tajno; aplikacija ntfy, pretplata na tu temu).
Obavijest stiže nakon svakog pokretanja: glasno kad je nešto upisano ili je greška, tiho kad nema ništa novo.

Ključ baze: SUPABASE_SECRET_KEY u .env (kao upload_analysis.py).
S --upis prvo napravi backup baze (scripts/backup_db.py) ako zadnji nije mlađi od 6 sati.

Windows Task Scheduler (subota i nedjelja svakih 30 min od 12 do 23 h; prilagodi putanje):
  schtasks /Create /TN "HMNL Semafor" /SC WEEKLY /D SAT,SUN /ST 12:00 /RI 30 /DU 11:00 ^
    /TR "cmd /c cd /d D:\\futsal-analiza && python scripts\\semafor_sync.py --upis >> run\\semafor_sync.log 2>&1"
"""
import argparse, hashlib, json, os, random, re, string, sys, time, unicodedata, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    ZG = ZoneInfo("Europe/Zagreb")
except Exception:            # Windows bez tzdata: približno (zimsko/ljetno računanje vremena)
    ZG = None

ROOT = Path(__file__).resolve().parent.parent
SEASON = "2026-27"
SEMAFOR = "https://semafor.hns.family"
# natjecanje u bazi -> stranica na Semaforu, kategorija igrača
COMPS = {
    "1-hmnl-2026-27": {"url": f"{SEMAFOR}/natjecanja/115835988/futsal-shmnl-2627/detaljno/", "cat": "Seniori"},
    "juniori-2026-27": {"url": f"{SEMAFOR}/natjecanja/116548239/futsal-prva-hmnl-juniori-2627/detaljno/", "cat": "U-19"},
    "kadeti-2026-27": {"url": f"{SEMAFOR}/natjecanja/116558032/futsal-prva-hmnl-kadeti-2627/detaljno/", "cat": "U-17"},
    "kup-2026-27": {"url": f"{SEMAFOR}/natjecanja/120095680/futsal-hmnk-2627/detaljno/", "cat": "Seniori", "cup": True},
}
CUP_ROUNDS = {"1/16 finala": 1, "1/8 finala": 2, "četvrtfinale": 3, "polufinale": 4, "finale": 5}
# nazivi na Semaforu koji se ne mogu sami upariti s klubom u bazi (Semafor -> id kluba)
CLUB_ALIASES = {}
UA = "hmnl-sync/1.0 (+https://hmnl.hr)"


class SemaforError(Exception):
    """Semafor se nije učitao ili mu se promijenio izgled: tada se ništa ne upisuje."""


# ---------------------------------------------------------------- HTML -> stablo
class Node:
    __slots__ = ("tag", "cls", "attrs", "kids", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []
        self.cls = set((self.attrs.get("class") or "").split())

    def text(self):
        return re.sub(r"\s+", " ", "".join(k if isinstance(k, str) else k.text() for k in self.kids)).strip()

    def own_text(self):     # samo tekst izravno u čvoru (bez djece)
        return re.sub(r"\s+", " ", "".join(k for k in self.kids if isinstance(k, str))).strip()

    def all(self, tag=None, cls=None):
        for k in self.kids:
            if isinstance(k, Node):
                if (tag is None or k.tag == tag) and (cls is None or cls in k.cls): yield k
                yield from k.all(tag, cls)

    def first(self, tag=None, cls=None):
        return next(self.all(tag, cls), None)

    def children(self, tag=None, cls=None):
        return [k for k in self.kids if isinstance(k, Node) and (tag is None or k.tag == tag) and (cls is None or cls in k.cls)]


class TreeBuilder(HTMLParser):
    VOID = {"br", "img", "input", "meta", "link", "hr", "source", "area", "base", "col", "embed", "param", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {}, None); self.cur = self.root; self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "svg", "noscript"): self.skip += 1; return
        if self.skip: return
        n = Node(tag, attrs, self.cur); self.cur.kids.append(n)
        if tag not in self.VOID: self.cur = n

    def handle_startendtag(self, tag, attrs):
        if not self.skip: self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg", "noscript"): self.skip = max(0, self.skip - 1); return
        if self.skip: return
        n = self.cur
        while n is not self.root and n.tag != tag: n = n.parent       # tolerira nezatvorene oznake
        if n is not self.root: self.cur = n.parent

    def handle_data(self, data):
        if not self.skip: self.cur.kids.append(data)


def parse_html(html):
    b = TreeBuilder(); b.feed(html); b.close(); return b.root


# ---------------------------------------------------------------- pomoćno
def norm(s):
    s = (s or "").replace("đ", "d").replace("Đ", "D")
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip()


def club_key(s):
    """'AMNK Universitas Split' -> 'universitas split' (bez oznaka vrste kluba)."""
    t = norm(s)
    t = re.sub(r"\b(a|h|hm|u)?mnk\b|\bfc\b|\bmnk\b|\bnk\b|\bklub malog nogometa\b", " ", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def tparse(t):
    """4'54" -> 294 (ukupno sekundi, točno); 39' -> (38*60+30, netočno). Vraća (sekunde, točno)."""
    m = re.search(r"(\d+)'(?:\s*(\d+)\")?", t or "")
    if not m: return None, False
    mins, s = int(m.group(1)), m.group(2)
    return (mins * 60 + int(s), True) if s is not None else (max(0, (mins - 1) * 60 + 30), False)


def to_ev_time(tot, exact):
    """Ukupne sekunde -> poluvrijeme i sekunda u njemu (kao admin: do 20:00 prvo, do 40:00 drugo, dalje produžeci)."""
    per = 1 if tot <= 1200 else 2 if tot <= 2400 else 3
    e = {"period": per, "sec": tot - (per - 1) * 1200}
    if exact: e["exact"] = True
    return e


def ev_total(e):
    return (e["period"] - 1) * 1200 + e["sec"]


def ev_minute(e):
    t = ev_total(e); return max(1, -(-t // 60))


CACHE_HOURS = 24
CACHE_FILE = ROOT / "run" / "semafor_cache.json"


def match_sig(m):
    """Potpis utakmice u bazi: promijeni se čim netko izmijeni događaje, zapisnik ili status."""
    return hashlib.sha1(json.dumps([m.get("status"), m.get("events"), m.get("roster"), m.get("result")], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


def load_cache():
    try: return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception: return {}


def save_cache(c):
    CACHE_FILE.parent.mkdir(exist_ok=True)
    tmp = CACHE_FILE.with_suffix(".tmp"); tmp.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8"); tmp.replace(CACHE_FILE)


def rid(prefix="e", n=7):
    return prefix + "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def zg_iso(d, hm):
    """'08.11.2026', '14:30' -> ISO s vremenskom zonom Europe/Zagreb."""
    dt = datetime.strptime(f"{d} {hm}", "%d.%m.%Y %H:%M")
    if ZG: return dt.replace(tzinfo=ZG).isoformat()
    m, dd = dt.month, dt.day                                   # zadnja nedjelja u ožujku / listopadu, približno
    summer = 3 < m < 10 or (m == 3 and dd >= 25) or (m == 10 and dd < 25)
    return dt.replace(tzinfo=timezone(timedelta(hours=2 if summer else 1))).isoformat()


# ---------------------------------------------------------------- Semafor: dohvat i čitanje
def fetch(url, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "hr"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:                                   # mreža ili Semafor trenutno ne radi
            last = e; time.sleep(2 * (i + 1))
    raise SemaforError(f"Semafor se ne učitava ({url}): {last}")


def parse_competition(html, cup=False):
    """Vraća popis utakmica: round, date, time (ili None), home, away, score (h, a) ili None, pen (h, a) ili None, url, hall."""
    root = parse_html(html)
    lists = [ul for div in root.all("div", "matchlist") for ul in div.children("ul")]
    if not lists: raise SemaforError("stranica natjecanja nema popis utakmica (promijenjen izgled?)")
    out, rnd = [], None
    for ul in lists:
        for li in ul.children("li"):
            if "header" in li.cls:
                lbl = li.text()
                m = re.match(r"(\d+)\.\s*kolo", lbl)
                rnd = int(m.group(1)) if m else CUP_ROUNDS.get(lbl.strip().lower())
                if rnd is None: raise SemaforError(f"nepoznato kolo '{lbl}'")
                continue
            if "row" not in li.cls or rnd is None: continue
            g = lambda c: li.first("div", c)
            date = (g("date").text() if g("date") else "")
            dm = re.match(r"(\d{2}\.\d{2}\.\d{4})\.?\s*(\d{1,2}:\d{2})?", date)
            if not dm: continue
            res = g("result")
            r1, r2 = (res.first(cls="res1"), res.first(cls="res2")) if res else (None, None)
            score = None
            if r1 and r2 and r1.text().isdigit() and r2.text().isdigit(): score = (int(r1.text()), int(r2.text()))
            pen = None
            rp = res.first(cls="resPen") if res else None
            if rp:
                pm = re.search(r"(\d+)\s*:\s*(\d+)", rp.text())
                if pm: pen = (int(pm.group(1)), int(pm.group(2)))
            link = res.first("a") if res else None
            url = link.attrs.get("href") if link else None
            if url and url.startswith("/"): url = SEMAFOR + url
            c1, c2 = g("club1"), g("club2")
            if not (c1 and c2): continue
            out.append({"round": rnd, "date": dm.group(1), "time": dm.group(2), "home": c1.text(), "away": c2.text(),
                        "score": score, "pen": pen, "url": url, "hall": g("facility").text() if g("facility") else ""})
    if not out: raise SemaforError("na stranici natjecanja nije pronađena nijedna utakmica")
    return out


EVENT_GOALS = {"goal": None, "ten_meters": 10, "six_meters": 6, "penalty": 0}       # 0 = kazneni, udaljenost nepoznata
EVENT_CARDS = {"yellow": "yellow", "second_yellow": "red2", "red": "red"}


def parse_match(html):
    """Stranica utakmice -> rezultat, golovi (s vremenom), kaznene, postave s događajima igrača."""
    root = parse_html(html)
    hdr = root.first("div", "matchHeader")
    if not hdr: raise SemaforError("stranica utakmice nema zaglavlje (promijenjen izgled?)")
    r1, r2 = hdr.first(cls="res1"), hdr.first(cls="res2")
    score = (int(r1.text()), int(r2.text())) if r1 and r2 and r1.text().isdigit() and r2.text().isdigit() else None
    st = hdr.first("div", "status")
    out = {"score": score, "status": st.text() if st else "", "goals": [], "shootout": [], "teams": {}, "unknown": []}
    # golovi: div.events_main, prvi ul = domaćin, drugi = gost (autogol je u popisu ekipe kojoj se gol pripisuje)
    em = hdr.first("div", "events_main")
    for side, ul in zip(("home", "away"), em.children("ul") if em else []):
        for li in ul.children("li"):
            ev = li.first("div", "event"); pn = li.first("div", "playerName")
            if not ev: continue
            kind = next((c for c in ev.cls if c != "event"), "")
            tot, exact = tparse(ev.text())
            name = pn.text() if pn else ""
            if kind == "own_goal": out["goals"].append({"benef": side, "own": True, "name": name, "t": tot, "exact": exact})
            elif kind in EVENT_GOALS:
                out["goals"].append({"benef": side, "own": False, "name": name, "t": tot, "exact": exact, "pen": EVENT_GOALS[kind]})
            else: out["unknown"].append(f"događaj '{kind}' ({name} {ev.text()})")
    # "Jedanaesterci": raspucavanje nakon utakmice samo kad zaglavlje ima oznaku kaznenih (npr. "(3:4 - 11m)").
    # U ligi isti odjeljak navodi kaznene udarce tijekom utakmice (bez minute), pa se tada ne čita.
    sh = next((x for x in hdr.all("div", "additional_status") if "pen" in x.cls), None)
    out["shootout_score"] = None
    if sh:
        pm = re.search(r"(\d+)\s*:\s*(\d+)", sh.text())
        if pm: out["shootout_score"] = (int(pm.group(1)), int(pm.group(2)))
    ep = hdr.first("div", "events_penalties") if sh else None
    for side, ul in zip(("home", "away"), ep.children("ul") if ep else []):
        for li in ul.children("li"):
            ev = li.first("div", "event"); pn = li.first("div", "playerName")
            if ev: out["shootout"].append({"side": side, "name": pn.text() if pn else "", "scored": "penalty_goal" in ev.cls})
    # postave: div.homeTeam / div.awayTeam; do prvog odjeljka "Pričuvni igrači" je početna petorka, "Trener" = stožer
    for side, cls in (("home", "homeTeam"), ("away", "awayTeam")):
        box = root.first("div", cls)
        rows, sect = [], "start"
        if box:
            for ul in box.children("ul"):
                for li in ul.children("li"):
                    if "separatorTitle" in li.cls:
                        t = norm(li.text()); sect = "staff" if "trener" in t or "sluzben" in t else "bench"; continue
                    if "match_lineup" not in li.cls: continue
                    numd, pnd = li.first("div", "shirtNumber"), li.first("div", "playerName")
                    if not pnd: continue
                    h3 = pnd.first("h3"); a = h3.first("a") if h3 else None
                    name = (a.text() if a else (h3.text() if h3 else "")).strip()
                    cap = "(C)" in (h3.text() if h3 else "")
                    role = norm(pnd.own_text())
                    evs = []
                    me = li.first("div", "matchEvents")
                    for e in (me.all("li") if me else []):
                        kind = next(iter(e.cls), "")
                        tot, exact = tparse(e.text())
                        if kind in EVENT_CARDS: evs.append({"card": EVENT_CARDS[kind], "t": tot, "exact": exact})
                        elif kind not in ("goal", "own_goal", "penalty", "ten_meters", "six_meters", "penalty_goal", "penalty_saved", "penalty_failed"):
                            out["unknown"].append(f"događaj igrača '{kind}' ({name})")
                    rows.append({"num": numd.text() if numd else "", "name": name, "cap": cap, "gk": role.startswith("vratar"),
                                 "staff": sect == "staff" or role.startswith("trener"), "start": sect == "start", "events": evs})
        out["teams"][side] = rows
    return out


# ---------------------------------------------------------------- baza (Supabase REST)
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
    if not key: sys.exit("Nema ključa: u .env upiši SUPABASE_SECRET_KEY=... (Supabase -> Settings -> API Keys -> secret).")
    return env


class DB:
    def __init__(self, url, key):
        self.url, self.key = url.rstrip("/"), key

    def call(self, method, path, body=None, prefer=None):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer: h["Prefer"] = prefer
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(f"{self.url}/rest/v1/{path}", data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read(); return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path.split('?')[0]} -> HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:300]}")

    def get(self, path): return self.call("GET", path)
    def patch_match(self, mid, body): self.call("PATCH", f"matches?id=eq.{urllib.parse.quote(mid)}", body, "return=minimal")
    def insert_player(self, row): self.call("POST", "players", row, "return=minimal")
    def log(self, row):
        try: self.call("POST", "semafor_log", row, "return=minimal")
        except RuntimeError as e: print(f"(zapis izvještaja u bazu nije uspio: {e})")


# ---------------------------------------------------------------- usklađivanje
class Sync:
    def __init__(self, db, write=False, cache=None):
        self.db, self.write = db, write
        # utakmice koje su već usklađene: ne učitavaju se ponovno dok se ne promijeni rezultat na Semaforu
        # ili utakmica u bazi (tvoja izmjena), a najkasnije nakon CACHE_HOURS ponovno se provjere
        self.cache = cache if cache is not None else {}
        self.done, self.diffs, self.errors, self.info = [], [], [], []
        clubs = db.get("clubs?select=id,name,full_name,short")
        self.club_by_key = {}
        for c in clubs:
            for n in (c.get("name"), c.get("full_name"), c.get("short"), c["id"].replace("-", " ")):
                if n: self.club_by_key.setdefault(club_key(n), c["id"])
        self.club_name = {c["id"]: c["name"] for c in clubs}
        self.players = {}           # (club, cat) -> [igrači]
        self.skipped = 0

    def club(self, sem_name):
        if sem_name in CLUB_ALIASES: return CLUB_ALIASES[sem_name]
        k = club_key(sem_name)
        if k in self.club_by_key: return self.club_by_key[k]
        cand = [cid for kk, cid in self.club_by_key.items() if kk and (kk in k or k in kk)]
        return cand[0] if len(set(cand)) == 1 else None

    def squad(self, club, cat):
        if (club, cat) not in self.players:
            q = f"players?select=id,club,cat,season,num,name,gk&season=eq.{SEASON}&cat=eq.{urllib.parse.quote(cat)}&club=eq.{club}"
            self.players[(club, cat)] = self.db.get(q) or []
        return self.players[(club, cat)]

    def find_player(self, club, cat, name, num=None, create=True, ctx=""):
        n = norm(name)
        hit = [p for p in self.squad(club, cat) if norm(p.get("name")) == n]
        if hit: return hit[0]["id"], False
        if not create: return None, False
        pid = f"{club}-{rid('', 7)}"
        row = {"id": pid, "club": club, "season": SEASON, "cat": cat, "num": num or "", "name": name, "gk": False, "_new": True}
        self.squad(club, cat).append(row)
        return pid, row

    # --- jedna utakmica
    def sync_match(self, comp, cat, cup, s, m):
        """s = utakmica s popisa Semafora, m = red iz baze."""
        label = f"{self.label(comp)} {s['round']}. kolo {self.club_name.get(m['home'], m['home'])} – {self.club_name.get(m['away'], m['away'])}"
        if not s["score"]:                                      # neodigrana: samo termin
            return self.sync_time(label, s, m)
        if not s["url"]: self.info.append(f"{label}: Semafor ima rezultat, ali nema stranicu utakmice"); return
        key, dbsig = s["url"], match_sig(m)
        c = self.cache.get(key)
        if c and c.get("score") == list(s["score"]) + list(s.get("pen") or []) and c.get("db") == dbsig and time.time() - c.get("at", 0) < CACHE_HOURS * 3600:
            self.diffs += c.get("diffs", []); self.info += c.get("info", []); self.skipped += 1
            return
        n_done, n_err, n_diff, n_info = len(self.done), len(self.errors), len(self.diffs), len(self.info)
        self._sync_page(label, cat, cup, s, m)
        if len(self.done) == n_done and len(self.errors) == n_err:   # ništa za upisati: zapamti (s razlikama, da se i dalje javljaju)
            self.cache[key] = {"score": list(s["score"]) + list(s.get("pen") or []), "db": dbsig, "at": time.time(),
                               "diffs": self.diffs[n_diff:], "info": self.info[n_info:]}
        else: self.cache.pop(key, None)

    def _sync_page(self, label, cat, cup, s, m):
        try: d = parse_match(fetch(s["url"]))
        except SemaforError as e: self.errors.append(f"{label}: {e}"); return
        for u in d["unknown"]: self.info.append(f"{label}: nepoznat {u}")
        if d["score"] != s["score"]: self.errors.append(f"{label}: rezultat na stranici utakmice {d['score']} ≠ popis {s['score']}"); return
        built, new_players, probs = self.build(m, cat, d)
        if probs:
            for p in probs: self.diffs.append(f"{label}: {p}")
            return                                              # bez potpunog zapisnika ne upisujemo ništa
        db_goals = [e for e in (m.get("events") or []) if e.get("type") in ("goal", "owngoal")]
        if not db_goals and m.get("status") != "finished":
            return self.fresh(label, m, built, new_players, d, s)
        if not db_goals and m.get("status") == "finished" and sum(d["score"]) > 0:
            self.diffs.append(f"{label}: u bazi je Kraj bez golova, Semafor {d['score'][0]}:{d['score'][1]}"); return
        self.compare(label, m, built, d, s)

    def label(self, comp):
        return {"1-hmnl-2026-27": "SS HMNL", "juniori-2026-27": "Juniori", "kadeti-2026-27": "Kadeti", "kup-2026-27": "Kup"}.get(comp, comp)

    def sync_time(self, label, s, m):
        if m.get("status") == "finished": return
        if not s["time"]: return                                # Semafor još nema satnicu
        iso = zg_iso(s["date"], s["time"])
        cur = m.get("date") or ""
        same = False
        try: same = datetime.fromisoformat(cur.replace("Z", "+00:00")) == datetime.fromisoformat(iso)
        except ValueError: pass
        if same and not m.get("time_tbd"): return
        when = f"{s['date']} {s['time']}"
        if self.write: self.db.patch_match(m["id"], {"date": iso, "time_tbd": False})
        self.done.append(f"{label}: termin {when}")

    def build(self, m, cat, d):
        """Iz Semafora složi zapisnik i događaje s id-jevima igrača iz baze."""
        probs, new_players, roster, events = [], [], {}, []
        name_side = {}
        for side in ("home", "away"):
            club = m[side]; rows = [r for r in d["teams"].get(side, []) if not r["staff"]]
            if not rows: probs.append(f"Semafor nema postavu za {self.club_name.get(club, club)}"); continue
            R = {"players": [], "start": [], "gk": [], "num": {}}
            for r in rows:
                pid, new = self.find_player(club, cat, r["name"], r["num"])
                if new: new["gk"] = r["gk"]; new_players.append(new)
                name_side[(side, norm(r["name"]))] = pid
                R["players"].append(pid); R["num"][pid] = r["num"]
                if r["start"]: R["start"].append(pid)
                if r["gk"]: R["gk"].append(pid)
                if r["cap"]: R["cap"] = pid
                for c in r["events"]:
                    if c["t"] is None: continue
                    e = {"id": rid(), "type": "yellow" if c["card"] == "yellow" else "red", "side": side, "player": pid, **to_ev_time(c["t"], c["exact"])}
                    if c["card"] == "red2": e["secondYellow"] = True
                    events.append(e)
            for r in d["teams"].get(side, []):                  # kartoni stožeru
                if r["staff"]:
                    for c in r["events"]:
                        if c["t"] is None: continue
                        e = {"id": rid(), "type": "yellow" if c["card"] == "yellow" else "red", "side": side, "staff": True, **to_ev_time(c["t"], c["exact"])}
                        if c["card"] == "red2": e["secondYellow"] = True
                        events.append(e)
            roster[side] = R
        for g in d["goals"]:
            side = ("away" if g["benef"] == "home" else "home") if g["own"] else g["benef"]   # autogol: strana igrača
            pid = name_side.get((side, norm(g["name"])))
            if not pid: probs.append(f"strijelac '{g['name']}' nije u postavi"); continue
            if g["t"] is None: probs.append(f"gol bez vremena ({g['name']})"); continue
            e = {"id": rid(), "type": "owngoal" if g["own"] else "goal", "side": side, "player": pid, **to_ev_time(g["t"], g["exact"])}
            if not g["own"] and g.get("pen") is not None:
                e["pen"] = True
                if g["pen"]: e["dist"] = g["pen"]
            events.append(e)
        kick = {"home": 0, "away": 0}
        for k in d["shootout"]:
            pid = name_side.get((k["side"], norm(k["name"])))
            if not pid: probs.append(f"izvođač kaznenog '{k['name']}' nije u postavi"); continue
            events.append({"id": rid(), "type": "so", "side": k["side"], "player": pid, "scored": k["scored"], "period": 4, "sec": kick[k["side"]] * 2 + (k["side"] == "away")})
            kick[k["side"]] += 1
        if d.get("shootout_score"):
            got = (sum(1 for e in events if e["type"] == "so" and e["side"] == "home" and e["scored"]),
                   sum(1 for e in events if e["type"] == "so" and e["side"] == "away" and e["scored"]))
            if got != d["shootout_score"]: probs.append(f"kazneni {got[0]}:{got[1]} ne odgovaraju rezultatu raspucavanja {d['shootout_score'][0]}:{d['shootout_score'][1]}")
        sc = [0, 0]
        for e in events:
            if e["type"] == "goal": sc[e["side"] == "away"] += 1
            if e["type"] == "owngoal": sc[e["side"] == "home"] += 1
        if d["score"] and tuple(sc) != d["score"]: probs.append(f"golovi ({sc[0]}:{sc[1]}) ne odgovaraju rezultatu {d['score'][0]}:{d['score'][1]}")
        events.sort(key=lambda e: (e["period"], e["sec"]))
        return {"roster": roster, "events": events}, new_players, probs

    def fresh(self, label, m, built, new_players, d, s):
        keep = [e for e in (m.get("events") or []) if e.get("type") not in ("goal", "owngoal", "yellow", "red", "so", "penmiss")]
        body = {"roster": built["roster"], "events": keep + built["events"], "status": "finished", "source": "HNS Semafor", "result": None}
        if self.write:
            for p in new_players: self.db.insert_player({k: v for k, v in p.items() if k != "_new"}); p.pop("_new", None)
            self.db.patch_match(m["id"], body)
        g = sum(1 for e in built["events"] if e["type"] in ("goal", "owngoal"))
        c = sum(1 for e in built["events"] if e["type"] in ("yellow", "red"))
        extra = f", novi igrači: {', '.join(p['name'] for p in new_players)}" if new_players else ""
        self.done.append(f"{label} {d['score'][0]}:{d['score'][1]}: upisan zapisnik, {g} gol., {c} kart.{extra}")

    def compare(self, label, m, built, d, s):
        """Utakmica je u bazi: dopiše sve što fali, a ono što se razlikuje samo javi (ne prepisuje tvoj upis)."""
        ev = [dict(e) for e in (m.get("events") or [])]
        roster = json.loads(json.dumps(m.get("roster") or {}))
        notes, diffs = [], []
        side_hr = lambda sd: "domaćin" if sd == "home" else "gost"

        def match_list(sem, mine, same):
            """Upari događaje Semafora s onima u bazi (ista vrsta, strana, igrač, minuta ±1). Vraća parove i neuparene."""
            used, pairs, miss = set(), [], []
            for e in sem:
                hit = next((i for i, x in enumerate(mine) if i not in used and same(x, e) and abs(ev_minute(x) - ev_minute(e)) <= 1), None)
                if hit is None: miss.append(e)
                else: used.add(hit); pairs.append((mine[hit], e))
            return pairs, miss, [x for i, x in enumerate(mine) if i not in used]

        # --- golovi
        same_goal = lambda x, e: x.get("side") == e["side"] and x.get("type") == e["type"] and x.get("player") == e.get("player")
        g_pairs, g_miss, g_extra = match_list([e for e in built["events"] if e["type"] in ("goal", "owngoal")],
                                              [e for e in ev if e.get("type") in ("goal", "owngoal")], same_goal)
        if g_extra:                                             # u bazi je gol kojeg Semafor nema (npr. drugi strijelac): golove ne diramo
            diffs += [f"gol {ev_minute(x)}' ({side_hr(x.get('side'))}) u bazi se ne slaže sa Semaforom" for x in g_extra]
            diffs += [f"gol {ev_minute(e)}' ({side_hr(e['side'])}, {self.pname(m[e['side']], e.get('player'))}) nije u bazi" for e in g_miss]
        else:
            for x, e in g_pairs:                               # sekunde i oznake penala
                if e.get("exact") and not x.get("exact"): x.update(period=e["period"], sec=e["sec"], exact=True); notes.append("sekunde")
                if e.get("pen") and not x.get("pen"): x["pen"] = True; notes.append("penal")
                if e.get("dist") and not x.get("dist") and x.get("pen"): x["dist"] = e["dist"]
            if g_miss: ev += g_miss; notes.append(f"golovi ({len(g_miss)})")
        # --- kartoni (igrači i stožer)
        same_card = lambda x, e: x.get("side") == e["side"] and x.get("type") == e["type"] and (x.get("player") == e.get("player") or (e.get("staff") and x.get("staff")))
        c_pairs, c_miss, c_extra = match_list([e for e in built["events"] if e["type"] in ("yellow", "red")],
                                              [e for e in ev if e.get("type") in ("yellow", "red")], same_card)
        for x, e in c_pairs:
            if e.get("exact") and not x.get("exact"): x.update(period=e["period"], sec=e["sec"], exact=True)
            if e.get("secondYellow") and not x.get("secondYellow"): x["secondYellow"] = True
        if c_miss: ev += c_miss; notes.append(f"kartoni ({len(c_miss)})")
        if c_extra: diffs += [f"karton {ev_minute(x)}' ({side_hr(x.get('side'))}) u bazi nije na Semaforu" for x in c_extra]
        # --- kazneni nakon utakmice (kup): samo ako ih u bazi nema
        so = [e for e in built["events"] if e["type"] == "so"]
        if so and not any(e.get("type") == "so" for e in ev): ev += so; notes.append("kaznene")
        # --- zapisnik
        for side in ("home", "away"):
            S = built["roster"].get(side) or {}
            if not S.get("players"): continue
            R = roster.get(side) or {}
            name = self.club_name.get(m[side], m[side])
            if not R.get("players"):                            # zapisnika nema: cijeli sa Semafora
                roster[side] = S; notes.append("zapisnik"); continue
            R.setdefault("num", {}); R.setdefault("start", []); R.setdefault("gk", [])
            new = [p for p in S["players"] if p not in R["players"]]
            for pid in new:
                R["players"].append(pid); R["num"][pid] = S["num"].get(pid, "")
                if pid in S.get("gk", []) and pid not in R["gk"]: R["gk"].append(pid)
            if new: notes.append(f"igrači u zapisniku ({len(new)})")
            extra = [p for p in R["players"] if p not in S["players"]]
            if extra: diffs.append(f"{name}: u zapisniku je {len(extra)} igrač(a) kojih nema na Semaforu ({', '.join(self.pname(m[side], p) for p in extra)})")
            for pid in S["players"]:
                a, b = str(R["num"].get(pid, "") or ""), str(S["num"].get(pid, "") or "")
                if not a and b: R["num"][pid] = b; notes.append("brojevi")
                elif a and b and a != b: diffs.append(f"{name}: broj {a} u bazi, {b} na Semaforu ({self.pname(m[side], pid)})")
            if not R["start"] and S.get("start"): R["start"] = list(S["start"]); notes.append("petorka")
            elif set(R["start"]) != set(S.get("start") or []): diffs.append(f"{name}: petorka se razlikuje")
            if not R["gk"] and S.get("gk"): R["gk"] = list(S["gk"]); notes.append("golmani")
            elif set(R["gk"]) != set(S.get("gk") or []): diffs.append(f"{name}: golmani se razlikuju")
            if S.get("cap") and not R.get("cap") and S["cap"] in R["players"]: R["cap"] = S["cap"]; notes.append("kapetan")
            roster[side] = R
        if diffs: self.diffs.append(f"{label}: " + "; ".join(diffs))
        if notes:
            ev.sort(key=lambda e: (e.get("period", 0), e.get("sec", 0)))
            new_players = [p for side in ("home", "away") for p in self.squad(m[side], self.cat_of(m)) if p.get("_new")]
            if self.write:
                for p in new_players: self.db.insert_player({k: v for k, v in p.items() if k != "_new"}); p.pop("_new", None)
                self.db.patch_match(m["id"], {"events": ev, "roster": roster})
            self.done.append(f"{label}: nadopunjeno ({', '.join(dict.fromkeys(notes))})")

    def cat_of(self, m):
        return COMPS.get(m.get("comp"), {}).get("cat", "Seniori")

    def pname(self, club, pid):
        for (c, _), lst in self.players.items():
            for p in lst:
                if p["id"] == pid: return p.get("name") or pid
        return pid

    # --- jedno natjecanje
    def run_comp(self, comp, cfg, only_round=None, days=10, all_played=False):
        cat, cup = cfg["cat"], cfg.get("cup", False)
        rows = parse_competition(fetch(cfg["url"]), cup)
        db_matches = self.db.get(f"matches?select=id,comp,round,date,home,away,status,result,time_tbd,events,roster,extra,source&comp=eq.{comp}") or []
        by_key = {(x["round"], x["home"], x["away"]): x for x in db_matches}
        now = datetime.now(timezone.utc)
        for s in rows:
            if only_round and s["round"] != only_round: continue
            h, a = self.club(s["home"]), self.club(s["away"])
            if not h or not a:
                self.info.append(f"{self.label(comp)} {s['round']}. kolo: klub nije prepoznat ('{s['home'] if not h else s['away']}'), dodaj ga u CLUB_ALIASES"); continue
            m = by_key.get((s["round"], h, a))
            if not m:
                if s["score"]: self.diffs.append(f"{self.label(comp)} {s['round']}. kolo {s['home']} – {s['away']}: nema je u bazi")
                continue
            if s["score"] and not all_played and not only_round:     # stare utakmice preskoči ako su u bazi već upisane
                d = datetime.strptime(s["date"], "%d.%m.%Y").replace(tzinfo=timezone.utc)
                if now - d > timedelta(days=days) and m.get("status") == "finished" and m.get("source") == "HNS Semafor": continue
                if now - d > timedelta(days=days) and m.get("status") == "finished" and any(e.get("type") in ("goal", "owngoal") for e in m.get("events") or []): continue
            try: self.sync_match(comp, cat, cup, s, m)
            except RuntimeError as e: self.errors.append(f"{self.label(comp)} {s['round']}. kolo: baza: {e}")


# ---------------------------------------------------------------- izvještaj
def report(sync, write, args, env, dbh):
    lines = []
    if sync.errors: lines += ["GREŠKE:"] + [f"  {x}" for x in sync.errors]
    if sync.done: lines += [("UPISANO:" if write else "BILO BI UPISANO (--upis):")] + [f"  {x}" for x in sync.done]
    if sync.diffs: lines += ["RAZLIKE (ništa nije mijenjano):"] + [f"  {x}" for x in sync.diffs]
    if sync.info: lines += ["NAPOMENE:"] + [f"  {x}" for x in sync.info]
    summary = (f"{'Upisano' if write else 'Za upis'}: {len(sync.done)}, razlike: {len(sync.diffs)}"
               + (f", greške: {len(sync.errors)}" if sync.errors else ""))
    print(time.strftime("%Y-%m-%d %H:%M"), "·", summary + (f" · preskočeno (već usklađeno): {sync.skipped}" if sync.skipped else ""))
    for ln in lines: print(ln)
    if not lines: print("Sve se slaže, nema ništa novo.")
    # stanje prošlog pokretanja: obavijest samo kad je nešto novo
    state_f = ROOT / "run" / "semafor_state.json"
    try: prev = json.loads(state_f.read_text(encoding="utf-8"))
    except Exception: prev = {}
    sig = hashlib.sha1(json.dumps([sync.diffs, sync.errors], ensure_ascii=False).encode()).hexdigest()
    news = bool(sync.done and write) or (sig != prev.get("sig") and (sync.diffs or sync.errors))
    state_f.parent.mkdir(exist_ok=True)
    state_f.write_text(json.dumps({"sig": sig, "at": time.time()}), encoding="utf-8")
    if not args.bez_zapisa:                                   # izvještaj svakog pokretanja ide u admin
        dbh.log({"mode": "upis" if write else "provjera", "summary": summary + (f", preskočeno {sync.skipped}" if sync.skipped else ""), "lines": lines})
    # obavijest nakon svakog pokretanja; glasnoća po važnosti (ništa novo = tiho)
    prio = 5 if sync.errors else 4 if (sync.done and write) else 3 if news else 2
    tags = "warning" if sync.errors else "white_check_mark" if (sync.done and write) else "soccer"
    from backup_db import ntfy
    ntfy(env, f"Semafor: {summary}", "\n".join(lines)[:3500] or f"Sve se slaže, nema ništa novo{f' (preskočeno {sync.skipped})' if sync.skipped else ''}.", prio, tags)


def main():
    for st in (sys.stdout, sys.stderr):           # Windows: ispis u log (cmd >>) inače puca na č, ć, ž
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--upis", action="store_true", help="upisuj u bazu (bez toga samo provjera)")
    ap.add_argument("--natjecanje", choices=list(COMPS), action="append", help="samo ovo natjecanje (može više puta)")
    ap.add_argument("--kolo", type=int, help="samo ovo kolo")
    ap.add_argument("--dana", type=int, default=10, help="provjeri odigrane utakmice iz zadnjih N dana (zadano 10)")
    ap.add_argument("--sve", action="store_true", help="sve odigrane utakmice sezone")
    ap.add_argument("--uvijek-javi", action="store_true", help="(zastarjelo: obavijest se sad uvijek šalje)")
    ap.add_argument("--bez-zapisa", action="store_true", help="ne zapisuj izvještaj u bazu")
    ap.add_argument("--bez-cachea", action="store_true", help="ponovno učitaj i već usklađene utakmice")
    a = ap.parse_args()
    env = load_env()
    dbh = DB(env["SUPABASE_URL"], env.get("SUPABASE_SECRET_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY"))
    if a.upis:                                    # sigurnosni backup prije upisa (najviše jednom u 6 sati)
        try:
            from backup_db import make_backup, last_backup_age_hours
            age = last_backup_age_hours()
            if age is None or age > 6: make_backup(dbh.url, dbh.key, quiet=True)
        except Exception as e:
            sys.exit(f"Backup prije upisa nije uspio ({e}); ništa nije upisano.")
    sync = Sync(dbh, write=a.upis, cache={} if a.bez_cachea else load_cache())
    for comp in (a.natjecanje or list(COMPS)):
        try: sync.run_comp(comp, COMPS[comp], a.kolo, a.dana, a.sve)
        except SemaforError as e: sync.errors.append(f"{sync.label(comp)}: {e}")
        except RuntimeError as e: sync.errors.append(f"{sync.label(comp)}: baza: {e}")
    if a.upis or not sync.done: save_cache(sync.cache)        # u provjeri se ne pamte utakmice koje bi tek trebalo upisati
    report(sync, a.upis, a, env, dbh)
    sys.exit(1 if sync.errors else 0)


if __name__ == "__main__":
    main()
