"""Brzi pregled modela lopte: video s ucrtanom loptom (bez igrača i kalibracije).

  python ball/render_ball.py run/klip.mp4 run/klip_lopta.mp4 --model ~/futsal-ball/runs/ball/weights/best.pt
  python ball/render_ball.py run/klip.mp4 run/klip_lopta.mp4 --dets run/klip_lopta_dets.json   (bez modela, brzo)
       [--start 0 --end 240] [--step 2] [--raw]

Detekcije se uvijek spreme uz izlaz (<izlaz>_dets.json), pa se praćenje može mijenjati i ponovno renderirati bez modela.

Praćenje je "unatrag i unaprijed" (cijeli isječak odjednom, jer analiza ide nakon utakmice):
  1. tracklets: detekcije se spajaju u kratke nizove kad je sljedeća blizu predviđene pozicije
  2. putanja: od svih trackleta bira se skup koji se ne preklapa u vremenu i ima najveći zbroj pouzdanosti;
     prijelaz između dva trackleta je "fizički moguć" ako lopta nije morala letjeti brže od --vmax piksela po koraku,
     a nemoguć skok (druga strana dvorane) se plaća kaznom --jump, pa ga putanja bira samo ako nema boljeg
  3. rupe do --max-gap sekundi između susjednih dijelova putanje se popune linearno (žuto)
Promjena kadra (druga kamera, repriza) prekida tracklete i putanju.
Boje: zeleno = model je vidi, žuto = popunjeno, sivo (--raw) = sve sirove detekcije >= --min-conf.
"""
import argparse, json, math, os, shutil, subprocess, sys
import cv2, numpy as np


def detect_pass(a, cap, f0, f1, fps):
    """1. prolaz: detekcije (model ili JSON) i promjene kadra, za svaki korak."""
    pre = model = None
    if a.dets:
        pre = {round(d["t"], 2): d["dets"] for d in json.load(open(a.dets))}
    else:
        from ultralytics import YOLO
        model = YOLO(os.path.expanduser(a.model))
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    steps, prev_h, prev_g, cam, fi = [], None, None, np.zeros(2), f0
    while fi < f1:
        ok, img = cap.read()
        if not ok: break
        if (fi - f0) % a.step: fi += 1; continue
        t = fi / fps
        if pre is not None:
            dets = pre.get(round(t, 2)) or []
        else:
            r = model.predict(img, imgsz=a.imgsz, conf=0.05, verbose=False)[0]
            dets = [[*[round(v, 1) for v in b.xywh[0].tolist()], round(float(b.conf), 3)] for b in r.boxes]
        hsv = cv2.cvtColor(cv2.resize(img, (160, 90)), cv2.COLOR_BGR2HSV)
        hh = cv2.normalize(cv2.calcHist([hsv], [0, 1], None, [30, 16], [0, 180, 0, 256]), None).flatten()
        cut = prev_h is not None and cv2.compareHist(prev_h, hh, cv2.HISTCMP_CORREL) < a.cut
        prev_h = hh
        # pomak kamere (fazna korelacija na smanjenoj slici): da se razlikuje mirna stvar na zidu od lopte
        g = cv2.cvtColor(cv2.resize(img, (320, 180)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        if prev_g is not None and not cut:
            (dx, dy), _ = cv2.phaseCorrelate(prev_g, g); cam = cam + np.array([dx, dy]) * img.shape[1] / 320
        prev_g = g
        steps.append({"t": round(t, 3), "dets": dets, "cut": cut, "cam": cam.tolist()})
        if len(steps) % 300 == 0: print(f"  detekcija {t:6.1f} s")
        fi += 1
    return steps


def drop_static(steps, a, s):
    """Detekcija koja je u ±5 s većinu vremena na istom mjestu u sceni (pomak kamere poništen) je znak, lampa,
    rezervna lopta... a ne lopta u igri. Takve se izbace prije praćenja."""
    W = round(5 * a.fps_step); n = len(steps); R = 10 * s
    rel = [np.array([[d[0] - st["cam"][0], d[1] - st["cam"][1]] for d in st["dets"] if d[4] >= a.min_conf]).reshape(-1, 2) for st in steps]
    dropped = 0
    for k in range(n):
        if not len(rel[k]): continue
        lo, hi = max(0, k - W), min(n, k + W + 1)
        keep = []
        for d, r in zip([d for d in steps[k]["dets"] if d[4] >= a.min_conf], rel[k]):
            hits = sum(1 for j in range(lo, hi) if len(rel[j]) and np.min(np.linalg.norm(rel[j] - r, axis=1)) < R)
            if hits > a.static_share * (hi - lo): dropped += 1
            else: keep.append(d)
        steps[k]["dets"] = keep
    if dropped: print(f"  izbačeno {dropped} detekcija nepomičnih stvari (znak, lampa, rezervna lopta...)")


def build_tracklets(steps, a, s):
    """Spaja detekcije u tracklete: [{k0, k1, pts: {k: (x, y, conf)}, score}]"""
    done, active = [], []
    for k, st in enumerate(steps):
        if st["cut"]: done += active; active = []
        dets = sorted((d for d in st["dets"] if d[4] >= a.min_conf), key=lambda d: -d[4])
        alive = [tr for tr in active if k - tr["k1"] <= 3]
        done += [tr for tr in active if k - tr["k1"] > 3]; active = alive
        used = set()
        for d in dets:
            best, bd = None, 1e9
            for tr in active:
                if id(tr) in used: continue
                g = k - tr["k1"]; x, y, _ = tr["pts"][tr["k1"]]
                px, py = x + tr["v"][0] * g, y + tr["v"][1] * g
                dist = math.hypot(d[0] - px, d[1] - py)
                if dist <= (25 + 15 * g) * s and dist < bd: best, bd = tr, dist
            if best is None:
                tr = {"k0": k, "k1": k, "pts": {k: (d[0], d[1], d[4])}, "v": (0.0, 0.0)}; active.append(tr); used.add(id(tr))
            else:
                g = k - best["k1"]; x, y, _ = best["pts"][best["k1"]]
                nv = ((d[0] - x) / g, (d[1] - y) / g)
                best["v"] = nv if len(best["pts"]) == 1 else (0.6 * nv[0] + 0.4 * best["v"][0], 0.6 * nv[1] + 0.4 * best["v"][1])
                best["pts"][k] = (d[0], d[1], d[4]); best["k1"] = k; used.add(id(best))
    done += active
    out = []; static = 0
    long_k = round(a.static_s * a.fps_step)
    for tr in done:
        c = [p[2] for p in tr["pts"].values()]
        if len(c) < 3 and max(c) < a.short_conf: continue    # kratki i nesigurni = šum
        if tr["k1"] - tr["k0"] >= long_k:                     # dugo "zalijepljen" za pozadinu = znak, lampa, rezervna lopta
            rel = np.array([[x - steps[k]["cam"][0], y - steps[k]["cam"][1]] for k, (x, y, _) in tr["pts"].items()])
            if np.max(np.linalg.norm(rel - np.median(rel, 0), axis=1)) < 8 * s: static += 1; continue
        tr["score"] = sum(c); out.append(tr)
    if static: print(f"  odbačeno {static} nepomičnih trackleta (stvar na zidu/podu, ne lopta u igri)")
    return out


def best_path(trs, steps, a, s):
    """Najbolji niz trackleta koji se ne preklapaju (dinamičko programiranje)."""
    trs.sort(key=lambda tr: tr["k0"])
    cut_k = [k for k, st in enumerate(steps) if st["cut"]]
    def crosses_cut(k0, k1): return any(k0 < c <= k1 for c in cut_k)
    dp, prev = [0.0] * len(trs), [-1] * len(trs)
    for i, b in enumerate(trs):
        dp[i] = b["score"]
        xb, yb, _ = b["pts"][b["k0"]]
        for j in range(i):
            p = trs[j]
            if p["k1"] >= b["k0"]: continue                   # preklapanje u vremenu
            gap = b["k0"] - p["k1"]; xp, yp, _ = p["pts"][p["k1"]]
            dist = math.hypot(xb - xp, yb - yp)
            ok = dist <= (40 + a.vmax * gap) * s and not crosses_cut(p["k1"], b["k0"])
            val = dp[j] + b["score"] - (0 if ok else a.jump)
            if val > dp[i]: dp[i], prev[i] = val, j
    if not trs: return []
    i = int(np.argmax(dp)); chain = []
    while i >= 0: chain.append(trs[i]); i = prev[i]
    return chain[::-1]


def path_positions(chain, steps, a, fps_step, s):
    """Pozicija po koraku: ('det', x, y) iz trackleta, ('fill', x, y) popunjeno, None nema."""
    pos = [None] * len(steps)
    for tr in chain:
        for k, (x, y, c) in tr["pts"].items(): pos[k] = ("det", x, y)
        ks = sorted(tr["pts"])                              # rupe unutar trackleta
        for k0, k1 in zip(ks, ks[1:]):
            for k in range(k0 + 1, k1):
                u = (k - k0) / (k1 - k0); x0, y0, _ = tr["pts"][k0]; x1, y1, _ = tr["pts"][k1]
                pos[k] = ("fill", x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)
    max_gap = round(a.max_gap * fps_step)
    for p, b in zip(chain, chain[1:]):                      # rupe između trackleta
        gap = b["k0"] - p["k1"]
        if gap > max_gap or any(steps[k]["cut"] for k in range(p["k1"] + 1, b["k0"] + 1)): continue
        x0, y0, _ = p["pts"][p["k1"]]; x1, y1, _ = b["pts"][b["k0"]]
        if math.hypot(x1 - x0, y1 - y0) > (40 + a.vmax * gap) * s: continue
        for k in range(p["k1"] + 1, b["k0"]):
            u = (k - p["k1"]) / gap; pos[k] = ("fill", x0 + (x1 - x0) * u, y0 + (y1 - y0) * u)
    return pos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("out")
    ap.add_argument("--model"); ap.add_argument("--dets", help="JSON detekcija (od prijašnjeg rendera ili scripts/ball_detect.py)")
    ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
    ap.add_argument("--step", type=int, default=2, help="svaki N-ti frame (60 fps snimka -> 2 = 30 fps)")
    ap.add_argument("--imgsz", type=int, default=1280)
    ap.add_argument("--min-conf", type=float, default=0.1, help="detekcije ispod ovoga se ignoriraju")
    ap.add_argument("--vmax", type=float, default=60, help="najveći pomak lopte po koraku (px na 1280 širine)")
    ap.add_argument("--jump", type=float, default=2.0, help="kazna za nemoguć skok (u jedinicama pouzdanosti)")
    ap.add_argument("--max-gap", type=float, default=0.7, help="najdulja rupa (s) koja se popunjava")
    ap.add_argument("--short-conf", type=float, default=0.45, help="kratki tracklet (<3) se zadrži samo ako ima detekciju >= ovoga")
    ap.add_argument("--static-share", type=float, default=0.35, help="detekcija na istom mjestu u sceni u ovolikom udjelu frameova (±5 s) = nepomična stvar")
    ap.add_argument("--static-s", type=float, default=2.0, help="tracklet koji ovoliko sekundi stoji na istom mjestu u sceni se odbaci")
    ap.add_argument("--raw", action="store_true", help="nacrtaj i sve sirove detekcije")
    ap.add_argument("--cut", type=float, default=0.7, help="prag sličnosti boja između frameova za promjenu kadra")
    a = ap.parse_args()
    if not (a.model or a.dets): sys.exit("Treba --model ili --dets")

    cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(3)), int(cap.get(4)); nfr = int(cap.get(7))
    f0 = round(a.start * fps); f1 = min(nfr, round(min(a.end, nfr / fps) * fps))
    s = W / 1280                                             # pragovi su zadani za 1280 px širine

    steps = detect_pass(a, cap, f0, f1, fps); a.fps_step = fps / a.step
    if not a.dets:
        json.dump([{"t": st["t"], "dets": st["dets"]} for st in steps], open(os.path.splitext(a.out)[0] + "_dets.json", "w"))
    drop_static(steps, a, s)
    trs = build_tracklets(steps, a, s)
    chain = best_path(trs, steps, a, s)
    pos = path_positions(chain, steps, a, fps / a.step, s)

    # 2. prolaz: crtanje
    out_fps = fps / a.step
    if shutil.which("ffmpeg"):
        enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
                                "-r", f"{out_fps:.3f}", "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                                "-pix_fmt", "yuv420p", a.out], stdin=subprocess.PIPE)
        write = lambda img: enc.stdin.write(img.tobytes())
    else:
        vw = cv2.VideoWriter(a.out, cv2.VideoWriter_fourcc(*"mp4v"), out_fps, (W, H)); write = vw.write
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    fi, k = f0, 0
    while fi < f1 and k < len(steps):
        ok, img = cap.read()
        if not ok: break
        if (fi - f0) % a.step: fi += 1; continue
        if a.raw:
            for d in steps[k]["dets"]:
                if d[4] >= a.min_conf: cv2.circle(img, (int(d[0]), int(d[1])), int(10 * s), (160, 160, 160), 1, cv2.LINE_AA)
        for j in range(max(0, k - 13), k):                   # trag
            p, q = pos[j], pos[j + 1]
            if p and q and not steps[j + 1]["cut"]:
                cv2.line(img, (int(p[1]), int(p[2])), (int(q[1]), int(q[2])), (60, 220, 60), max(2, int(2 * s)), cv2.LINE_AA)
        if pos[k]:
            col = (60, 220, 60) if pos[k][0] == "det" else (0, 210, 255)
            cv2.circle(img, (int(pos[k][1]), int(pos[k][2])), int(13 * s), col, max(2, int(2 * s)), cv2.LINE_AA)
        t = steps[k]["t"]
        cv2.putText(img, f"{int(t // 60)}:{t % 60:04.1f}", (W - int(130 * s), H - int(20 * s)), cv2.FONT_HERSHEY_SIMPLEX, 0.8 * s, (255, 255, 255), 2, cv2.LINE_AA)
        write(img); fi += 1; k += 1
    if shutil.which("ffmpeg"): enc.stdin.close(); enc.wait()
    else: vw.release()

    n = len(steps); nd = sum(1 for p in pos if p and p[0] == "det"); nf = sum(1 for p in pos if p and p[0] == "fill")
    jumps = sum(1 for p, b in zip(chain, chain[1:]) if math.hypot(b["pts"][b["k0"]][0] - p["pts"][p["k1"]][0],
                                                                    b["pts"][b["k0"]][1] - p["pts"][p["k1"]][1]) > (40 + a.vmax * (b["k0"] - p["k1"])) * s)
    print(f"{n} frameova: lopta viđena {nd / max(n, 1):.0%}, popunjena {nf / max(n, 1):.0%}, ukupno {(nd + nf) / max(n, 1):.0%}; "
          f"{len(chain)} dijelova putanje, skokova {jumps}, promjena kadra {sum(st['cut'] for st in steps)}  -> {a.out}")


if __name__ == "__main__":
    main()
