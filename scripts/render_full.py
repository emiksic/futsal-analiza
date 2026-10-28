"""Sve zajedno: linije terena, igrači (samo na terenu), brojevi, lopta + trag, mini-mapa, posjed, postava.
python3 render_full.py clip.mp4 tracks.json camera.json S.npy court.json out.mp4 --cfg match.json
       [--ball ball.json] [--clock clock.json] [--lineup lineup.json] [--start s] [--end s]
"""
import argparse, json, os, sys, cv2, numpy as np
from collections import deque, Counter
sys.path.insert(0, os.path.dirname(__file__))
from matchcfg import Match
from smooth import foot_and_cov, smooth_positions

ap = argparse.ArgumentParser()
for k in ("video", "tracks", "camera", "S", "court", "out"): ap.add_argument(k)
ap.add_argument("--cfg", required=True); ap.add_argument("--ball"); ap.add_argument("--clock"); ap.add_argument("--lineup")
ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
ap.add_argument("--smooth", choices=["rts", "kalman", "none"], default="rts",
                help="mini-mapa: rts = najglađe (snimka), kalman = samo naprijed (live), none = sirovo")
ap.add_argument("--minimap-compare", action="store_true", help="mini-mapa: sirovo lijevo, izglađeno desno")
a = ap.parse_args()
Mt = Match(a.cfg); TEAMS = Mt.teams; NAME = Mt.name; BGR = Mt.bgr
MARGIN_FAR, MARGIN_ENDS, MARGIN_NEAR = 3.0, 3.0, 0.5
POSS_DIST = 1.5

tl_all = json.load(open(a.tracks))["timeline"]; cam = json.load(open(a.camera))
tl = [fr for fr in tl_all if a.start <= fr["t"] <= a.end]
ball = json.load(open(a.ball)) if a.ball else []
bt = np.array([b["t"] for b in ball]) if ball else None
clock = json.load(open(a.clock)) if a.clock else None
ct = np.array([c["t"] for c in clock]) if clock else None
def running(t): return True if clock is None else clock[int(np.argmin(abs(ct - t)))]["running"]
lineup = json.load(open(a.lineup))["timeline"] if a.lineup else None
lt = np.array([x["t"] for x in lineup]) if lineup else None
S = np.load(a.S); cf = json.load(open(a.court)); Hc = np.array(cf["H_img_to_court"])
hl, hw, D = cf["length_m"] / 2, cf["width_m"] / 2, cf["penalty_m"]

times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; Hacc = [np.eye(3)]   # početak kamere
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
def Hframe(t): return Hacc[int(np.argmin(abs(times - t)))]
def tf(H, p): return cv2.perspectiveTransform(np.float32(p).reshape(-1, 1, 2), H).reshape(-1, 2)
def on_court(x, y): return -hl - MARGIN_ENDS <= x <= hl + MARGIN_ENDS and -hw - MARGIN_FAR <= y <= hw + MARGIN_NEAR

model = [[[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]], [[0, -hw], [0, hw]]]
for s in (-1, 1):
    gx = s * hl
    model.append([[gx - s * D * np.cos(t), -1.5 - D * np.sin(t)] for t in np.linspace(np.pi / 2, 0, 15)] +
                 [[gx - s * D * np.cos(t), 1.5 + D * np.sin(t)] for t in np.linspace(0, np.pi / 2, 15)])
    model.append([[gx, -1.5], [gx + s, -1.5], [gx + s, 1.5], [gx, 1.5]])
dense = [np.concatenate([np.linspace(seg[i], seg[i + 1], 25) for i in range(len(seg) - 1)]) for seg in model]

MW, MH, PM = 400, 200, 12
sx = (MW - 2 * PM) / (2 * hl + 2); sy = (MH - 2 * PM) / (2 * hw + 2)
def mm(x, y): return int(PM + (x + hl + 1) * sx), int(PM + (y + hw + 1) * sy)
def txt(img, s, org, sc, col, th=2):
    cv2.putText(img, s, org, 0, sc, (0, 0, 0), th + 2); cv2.putText(img, s, org, 0, sc, col, th)

# izglađene pozicije za mini-mapu (po tracku, cijeli raspon odjednom)
samples = {}
for fr in tl:
    Mf = Hc @ S @ np.linalg.inv(Hframe(fr["t"]))
    for p in fr["players"]:
        if p["team"] in ("klupa", "osoblje", "?"): continue
        z, R = foot_and_cov(Mf, p["box"])
        if on_court(*z): samples.setdefault(p["id"], []).append((fr["t"], z, R))
SM = {} if a.smooth == "none" else smooth_positions(samples, causal=(a.smooth == "kalman"))
def smpos(p, t, raw): return SM.get((p["id"], round(float(t), 3)), raw)

cap = cv2.VideoCapture(a.video); fps = cap.get(5); W, H = int(cap.get(3)), int(cap.get(4))
vw = cv2.VideoWriter(a.out, cv2.VideoWriter_fourcc(*"mp4v"), 1 / (tl[1]["t"] - tl[0]["t"]), (W, H))
want = {round(fr["t"] * fps): fr for fr in tl}
fi = round(tl[0]["t"] * fps); cap.set(1, fi); last = max(want)
trail = deque(maxlen=20); poss = Counter(); last_team = None
while fi <= last:
    ok, f = cap.read()
    if not ok: break
    fr = want.get(fi); fi += 1
    if fr is None: continue
    Hf = Hframe(fr["t"]); M = Hc @ S @ np.linalg.inv(Hf); Mi = np.linalg.inv(M)
    ov = f.copy()
    for seg in dense:
        q = tf(Mi, seg)
        if np.all(np.isfinite(q)) and np.abs(q).max() < 1e5: cv2.polylines(ov, [q.astype(np.int32)], False, (0, 255, 0), 2)
    f = cv2.addWeighted(ov, 0.5, f, 0.5, 0)

    players = []
    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]
        cx, cy = tf(M, [[(x1 + x2) / 2, y2]])[0]
        if not on_court(cx, cy) or p["team"] in ("klupa", "osoblje", "?"): continue
        players.append((p, cx, cy))
        col = BGR[p["team"]]
        cv2.rectangle(f, (x1, y1), (x2, y2), col, 2)
        lab = None if p["team"] == "sudac" else ("GK" if p.get("gk") else (p["player"].split()[-1] if "player" in p else "?"))
        if lab: txt(f, lab, (x1, y1 - 6), 0.7, col)

    holder = None; gbx = gby = None; b = None
    if ball:
        b = ball[int(np.argmin(abs(bt - fr["t"])))]
        if b["ball"] is not None and abs(b["t"] - fr["t"]) < 0.05:
            trail.append((fr["t"], np.array(b["ref"]))); gbx, gby = tf(M, [b["ball"]])[0]
            near = [(np.hypot(cx - gbx, cy - gby), p) for p, cx, cy in players if p["team"] in TEAMS]
            if near:
                dd, p = min(near, key=lambda z: z[0])
                if dd < POSS_DIST: holder = p
    live = running(fr["t"])
    if holder: last_team = holder["team"]
    if last_team and live: poss[last_team] += 1
    recent = [(t_, r_) for t_, r_ in trail if fr["t"] - t_ <= 1.5]
    if len(recent) >= 2:
        pts = tf(Hf, np.array([r_ for _, r_ in recent])).astype(int); ts_ = [t_ for t_, _ in recent]
        for i in range(len(pts) - 1):
            if ts_[i + 1] - ts_[i] <= 0.3:                       # ne spajaj preko rupa
                cv2.line(f, tuple(pts[i]), tuple(pts[i + 1]), (0, 165, 255), 1 + 2 * i // len(pts))
    if gbx is not None: cv2.circle(f, tuple(map(int, b["ball"])), 11, (0, 165, 255) if b["src"] == "det" else (0, 100, 180), 2)
    if holder:
        x1, y1, x2, y2 = holder["box"]; cv2.drawMarker(f, ((x1 + x2) // 2, y1 - 12), (0, 165, 255), cv2.MARKER_TRIANGLE_DOWN, 14, 3)

    # mini-mapa
    mini = np.full((MH, MW, 3), (40, 90, 50), np.uint8)
    for seg in model: cv2.polylines(mini, [np.int32([mm(*q) for q in seg])], False, (230, 230, 230), 1)
    raw_mini = mini.copy() if a.minimap_compare else None
    for p, cx, cy in players:
        if raw_mini is not None:
            cv2.circle(raw_mini, mm(cx, cy), 6, BGR[p["team"]], -1); cv2.circle(raw_mini, mm(cx, cy), 6, (0, 0, 0), 1)
        sx_, sy_ = smpos(p, fr["t"], (cx, cy))
        cv2.circle(mini, mm(sx_, sy_), 6, BGR[p["team"]], -1); cv2.circle(mini, mm(sx_, sy_), 6, (0, 0, 0), 1)
    L = lineup[int(np.argmin(abs(lt - fr["t"])))] if lineup else None
    if L:
        for tm, g in L["gk"].items():
            if not g["visible"]: cv2.circle(mini, mm(*g["pos"]), 6, BGR[Mt.key_of[tm]], 2)
        for tm in NAME.values():
            for num in L["unseen"].get(tm, []):
                if f"{tm} {num}" in L["last_pos"]: cv2.circle(mini, mm(*L["last_pos"][f"{tm} {num}"]), 5, BGR[Mt.key_of[tm]], 1)
    if gbx is not None: cv2.circle(mini, mm(gbx, gby), 4, (0, 165, 255), -1)
    f[H - MH - 10:H - 10, W - MW - 10:W - 10] = mini
    if raw_mini is not None:
        f[H - MH - 10:H - 10, W - 2 * MW - 20:W - MW - 20] = raw_mini
        txt(f, "sirovo", (W - 2 * MW - 15, H - MH - 15), 0.6, (255, 255, 255)); txt(f, "izgladjeno", (W - MW - 5, H - MH - 15), 0.6, (255, 255, 255))

    # posjed
    tot = sum(poss.values())
    if tot and len(TEAMS) >= 2:
        tA, tB = TEAMS[:2]; r = poss[tA] / tot; bw = 300; x0, y0 = W - bw - 10, H - MH - 45
        cv2.rectangle(f, (x0, y0), (x0 + int(bw * r), y0 + 22), BGR[tA], -1)
        cv2.rectangle(f, (x0 + int(bw * r), y0), (x0 + bw, y0 + 22), BGR[tB], -1)
        txt(f, f"{NAME[tA]} {r*100:.0f}%", (x0 + 5, y0 + 17), 0.55, (255, 255, 255))
        txt(f, f"{(1-r)*100:.0f}% {NAME[tB]}", (x0 + bw - 100, y0 + 17), 0.55, (255, 255, 255))
    # panel na terenu
    if L:
        px, py = W - 260, 115
        cv2.rectangle(f, (px - 10, py - 28), (W - 10, py + 52), (20, 20, 20), -1)
        cv2.putText(f, "NA TERENU", (px, py - 8), 0, 0.55, (0, 255, 255), 1)
        for i, key in enumerate(TEAMS[:2]):
            tm = NAME[key]; col = BGR[key]; xx = px + 60
            cv2.putText(f, f"{tm}:", (px, py + 18 + 24 * i), 0, 0.6, col, 2)
            for num in L["on"].get(tm, []):
                cv2.putText(f, num, (xx, py + 18 + 24 * i), 0, 0.6, (130, 130, 130) if num in L["unseen"][tm] else col, 2)
                xx += 16 + 14 * len(num)
    if not live: txt(f, "SAT STOJI - posjed se ne broji", (W - 520, H - MH - 60), 0.7, (0, 0, 255))
    txt(f, f"t={fr['t']:.1f}s", (10, H - 15), 0.8, (0, 255, 255))
    vw.write(f)
vw.release()
tot = sum(poss.values())
print("posjed:", {NAME[k]: f"{v/tot*100:.0f}%" for k, v in poss.items()} if tot else "-")
