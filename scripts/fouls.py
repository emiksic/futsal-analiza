"""Akumulirani prekršaji iz TV trake (broj kvadratića / crtica uz ime ekipe) -> događaji "foul" na stranici.

  python scripts/fouls.py run/<id>/video.mp4 run/<id>/traka.json [--match ID --write] [--debug run/<id>/prekrsaji.png]

Produkcije (profil trake u traka.json -> pokazivač u FOULS):
  supersport   bež kvadratići IZNAD imena ekipe (prikazuju se samo dio vremena; kad ih nema, broj je nepoznat)
  torcida      5 kućica ISPOD imena, popunjena (tamna) = prekršaj
  hajduk       žute crtice ispod imena
Sat i poluvrijeme za svaki prekršaj uzimaju se iz traka.json (isti trenutak snimke).
Traka pokazuje najviše 5 prekršaja; 6. i svaki sljedeći (deseterac) se iz trake ne vidi, osim ako produkcija to posebno pokaže.
Već upisane ručne prekršaje (bez "auto") skripta ne dira; automatske zamijeni novima.
"""
import argparse, json, os, sys
import cv2, numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# kutije [x, y, w, h] na 1280x720
FOULS = {
    "supersport": {"style": "blocks", "home": [254, 41, 64, 10], "away": [386, 41, 80, 10]},
    "torcida": {"style": "cells", "home": [21, 52, 104, 10], "away": [201, 52, 104, 10], "n": 5},
    # Hajduk: domaći se pune slijeva udesno, gosti zdesna ulijevo (prva crtica gostiju je krajnja desna)
    "hajduk": {"style": "ticks", "home": [36, 83, 48, 10], "away": [252, 83, 52, 10], "n": 5,
               "slots": {"home": (8.5, 8), "away": (44.5, -8)}},
}


def runs(col, minw):
    n, s = 0, None
    for x, v in enumerate(list(col) + [False]):
        if v and s is None: s = x
        if not v and s is not None:
            n += (x - s) >= minw; s = None
    return n


def count(f, cfg, side):
    x, y, w, h = cfg[side]; c = f[y:y + h, x:x + w]
    if c.size == 0: return None
    lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).astype(int)
    st = cfg["style"]
    if st == "blocks":                                  # bež: svijetlo i žućkasto
        m = (lab[..., 0] > 160) & (lab[..., 2] > 140)
        col = m.mean(0) > 0.5
        return runs(col, 4)
    if st == "ticks":                                   # crtice na stalnim mjestima (razmak 8 px): ima je ako se razlikuje od razmaka do susjedne
        Lm, Bm = lab[2:8, :, 0].mean(0), lab[2:8, :, 2].mean(0); k = 0
        for i in range(cfg.get("n", 5)):
            first, pitch = cfg["slots"][side]
            c0 = int(round(first + i * pitch))
            if c0 + 5 > w or c0 - 4 < 0: break
            g = [c0 - 4, c0 + 4]
            dl = min(abs(Lm[c0 - 1:c0 + 1].mean() - Lm[q]) for q in g); db = min(Bm[c0 - 1:c0 + 1].mean() - Bm[q] for q in g)
            if dl > 40 or db > 20: k = i + 1
            else: break                                 # crtice su uzastopne: prva prazna = kraj
        return k
    if st == "cells":                                   # 5 kućica: okvir svijetao, popunjena tamna
        g = cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).astype(float); n = cfg.get("n", 5); cw = w / n
        if np.percentile(g, 90) < 150: return None      # nema svijetlih okvira: traka nije na ekranu
        k = 0
        for i in range(n):
            a, b = int(i * cw + cw * .3), int(i * cw + cw * .7)
            k += g[int(h * .35):int(h * .75), a:b].mean() < 90
        return k
    return None


def series(video, times, cfg):
    cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS) or 30; pos, out = 0, []
    for t in times:
        target = int(round(t * fps))
        while pos < target: cap.grab(); pos += 1
        ok, f = cap.read(); pos += 1
        if not ok: out.append((None, None)); continue
        if f.shape[1] != 1280: f = cv2.resize(f, (1280, 720))
        out.append((count(f, cfg, "home"), count(f, cfg, "away")))
    return out


def detect(reads, cnt, win=9, hold=8.0):
    """Prekršaji iz broja na traci, po poluvremenu i ekipi:
    1) zaglađivanje (najčešća vrijednost u prozoru od `win` čitanja) protiv treperenja,
    2) samo vrijednosti koje se drže barem `hold` s (prekršaji ostaju do kraja poluvremena, smetnje kratko traju),
    3) porast = novi prekršaji (skok za više = više prekršaja u isto vrijeme, npr. kad traka nije bila prikazana),
       pad usred poluvremena se zanemaruje (traka sakrivena / zaklonjena),
    4) vrijednost na samom početku poluvremena (prvih 20 s) je stanje s trake, ne novi prekršaj."""
    ev = []
    for si, side in enumerate(("home", "away")):
        for per in sorted({r[1] for r in reads if r[1] is not None}):
            idx = [i for i, r in enumerate(reads) if r[1] == per and cnt[i][si] is not None]
            if not idx: continue
            vals = [cnt[i][si] for i in idx]
            sm = []
            for k in range(len(vals)):
                w = vals[max(0, k - win // 2):k + win // 2 + 1]
                sm.append(max(set(w), key=w.count))
            segs = []                                    # [vrijednost, prvi indeks, zadnji indeks]
            for k, v in zip(idx, sm):
                if segs and segs[-1][0] == v: segs[-1][2] = k
                else: segs.append([v, k, k])
            segs = [g for g in segs if reads[g[2]][0] - reads[g[1]][0] >= hold]
            cur = 0
            for n, (v, a, b) in enumerate(segs):
                el = int(round(1200 - reads[a][2]))
                if n == 0 and el < 20: cur = v; continue
                if v <= cur: continue
                for _ in range(v - cur):
                    ev.append({"t": reads[a][0], "period": per, "sec": el, "side": side, "n": cur + 1}); cur += 1
    return sorted(ev, key=lambda e: (e["period"], e["sec"]))


def main():
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video"); ap.add_argument("traka")
    ap.add_argument("--match"); ap.add_argument("--write", action="store_true"); ap.add_argument("--debug")
    ap.add_argument("--reread", action="store_true", help="ponovno pročitaj video i kad su brojevi već spremljeni")
    a = ap.parse_args()
    T = json.load(open(a.traka)); prof = T.get("profile", "")
    cfg = FOULS.get(prof) or next((v for k, v in FOULS.items() if prof.startswith(k)), None)
    if not cfg: print(f"raspored trake '{prof}' nema prekršaje (FOULS u scripts/fouls.py)"); return
    reads = T["reads"]; idx = [i for i, r in enumerate(reads) if r[1] is not None]
    if a.debug:                                          # isječci traka s kutijama, za provjeru položaja
        cap = cv2.VideoCapture(a.video); fps = cap.get(5); tiles = []
        for q in np.linspace(0.1, 0.9, 8):
            r = reads[idx[int(q * (len(idx) - 1))]]; cap.set(0, r[0] * 1000); ok, f = cap.read()
            if not ok: continue
            f = cv2.resize(f, (1280, 720)); lbl = f"{count(f, cfg, 'home')} - {count(f, cfg, 'away')}"   # prije crtanja kutija
            for s in ("home", "away"):
                x, y, w, h = cfg[s]; cv2.rectangle(f, (x, y), (x + w, y + h), (0, 255, 255), 1)
            c = cv2.resize(f[0:120, 0:640], None, fx=2, fy=2)
            cv2.putText(c, lbl, (10, 230), 0, 0.9, (0, 0, 255), 2); tiles.append(c)
        cv2.imwrite(a.debug, np.vstack(tiles)); print(a.debug); return
    if T.get("foul_counts") and len(T["foul_counts"]) == len(reads) and not a.reread:
        cnt = [tuple(c) for c in T["foul_counts"]]; cnt_ok = [cnt[i] for i in idx]      # već pročitano: bez videa
    else:
        cnt_ok = series(a.video, [reads[i][0] for i in idx], cfg)
        cnt = [(None, None)] * len(reads)
        for i, c in zip(idx, cnt_ok): cnt[i] = c
        T["foul_counts"] = cnt
    seen = sum(c[0] is not None and c[1] is not None for c in cnt_ok) / max(1, len(cnt_ok))
    ev = detect(reads, cnt)
    T["fouls"] = ev; json.dump(T, open(a.traka, "w"))
    print(f"raspored {prof}: pokazivač prekršaja vidljiv u {seen:.0%} čitanja, prekršaja {len(ev)}")
    for p in (1, 2):
        for s in ("home", "away"):
            L = [e for e in ev if e["period"] == p and e["side"] == s]
            if L: print(f"  {p}. pol {s:4s}: " + ", ".join(f"{e['sec'] // 60}'{e['sec'] % 60:02d}\"" for e in L))
    if not (a.match and a.write): return
    from upload_analysis import load_env, call
    url, key = load_env()
    rows = call("GET", f"{url}/rest/v1/matches?id=eq.{a.match}&select=events", key)
    if not rows: sys.exit(f"utakmica {a.match} ne postoji")
    events = rows[0]["events"] or []
    if any(e["type"] == "foul" and not e.get("auto") for e in events):
        print("utakmica ima ručno upisane prekršaje: ne mijenjam"); return
    events = [e for e in events if e["type"] != "foul"]
    for k, e in enumerate(ev):
        events.append({"id": f"{a.match}-f{k}", "type": "foul", "side": e["side"], "period": e["period"], "sec": e["sec"], "auto": True})
    events.sort(key=lambda e: (e.get("period", 0), e.get("sec", 0)))
    call("PATCH", f"{url}/rest/v1/matches?id=eq.{a.match}", key, json.dumps({"events": events}).encode("utf-8"),
         {"Content-Type": "application/json", "Prefer": "return=minimal"})
    print(f"Upisano {len(ev)} prekršaja.")


if __name__ == "__main__":
    main()
