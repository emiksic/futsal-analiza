"""Filtriraj osobe izvan terena + nacrtaj linije terena u svakom frameu + mini-mapa odozgo.
python3 court_filter.py clip.mp4 tracks.json camera.json mosaic_S.npy court_fit.json out.mp4
"""
import sys, json, cv2, numpy as np
from collections import Counter

video, trk, camj, Sp, cfp, outp = sys.argv[1:7]
MARGIN_FAR, MARGIN_ENDS, MARGIN_NEAR = 3.0, 3.0, 0.5      # m; NEAR = strana klupe
TEAM_BGR = {"ljubicasti": (200, 60, 140), "bijeli": (255, 255, 255), "golman_z": (0, 230, 255),
            "sudac": (0, 0, 255), "klupa": (180, 105, 255), "?": (160, 160, 160)}

tl = json.load(open(trk))["timeline"]; cam = json.load(open(camj))
S = np.load(Sp); cf = json.load(open(cfp)); Hc = np.array(cf["H_img_to_court"])
hl, hw = 20.0, 10.0          # crtamo standardni 40x20 (procjena 42.2 x 19.9)
hl, hw = cf["length_m"] / 2, cf["width_m"] / 2

times = [tl[0]["t"]]; Hacc = [np.eye(3)]
for e in cam: times.append(e["t"]); Hacc.append(np.array(e["H"]) @ Hacc[-1])
times = np.array(times)
def frame_to_court(t):
    Ht = Hacc[int(np.argmin(abs(times - t)))]
    return Hc @ S @ np.linalg.inv(Ht)                # frame -> ref -> platno -> teren
def tf(Hm, pts): return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), Hm).reshape(-1, 2)

# far uzdužna je y=-hw? provjeri predznak: MF je mapiran u (0,-1)*b -> y negativan = daljnja strana
def on_court(x, y):
    return (-hl - MARGIN_ENDS <= x <= hl + MARGIN_ENDS) and (-hw - MARGIN_FAR <= y <= hw + MARGIN_NEAR)

court_model = [
    [[-hl, -hw], [hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]], [[0, -hw], [0, hw]],
    [[1.8 * np.cos(t), 1.8 * np.sin(t)] for t in np.linspace(0, 2 * np.pi, 60)],
]
for s in (-1, 1):
    gx = s * hl
    court_model.append([[gx - s * 6 * np.cos(t), -1.5 - 6 * np.sin(t)] for t in np.linspace(np.pi / 2, 0, 15)] +
                       [[gx - s * 6 * np.cos(t), 1.5 + 6 * np.sin(t)] for t in np.linspace(0, np.pi / 2, 15)])
margin_poly = [[-hl - MARGIN_ENDS, -hw - MARGIN_FAR], [hl + MARGIN_ENDS, -hw - MARGIN_FAR],
               [hl + MARGIN_ENDS, hw + MARGIN_NEAR], [-hl - MARGIN_ENDS, hw + MARGIN_NEAR], [-hl - MARGIN_ENDS, -hw - MARGIN_FAR]]

# mini-mapa
MW, MH, PADM = 400, 220, 14
sx = (MW - 2 * PADM) / (2 * hl + 2 * MARGIN_ENDS); sy = (MH - 2 * PADM) / (2 * hw + MARGIN_FAR + MARGIN_NEAR)
def mm(x, y): return int(PADM + (x + hl + MARGIN_ENDS) * sx), int(PADM + (y + hw + MARGIN_FAR) * sy)
def minimap(points):
    img = np.full((MH, MW, 3), (40, 90, 50), np.uint8)
    cv2.polylines(img, [np.int32([mm(*p) for p in margin_poly])], False, (80, 80, 80), 1)
    for seg in court_model: cv2.polylines(img, [np.int32([mm(*p) for p in seg])], False, (230, 230, 230), 1)
    for (x, y), team in points:
        cv2.circle(img, mm(x, y), 6, TEAM_BGR[team], -1); cv2.circle(img, mm(x, y), 6, (0, 0, 0), 1)
    return img

cap = cv2.VideoCapture(video); fps = cap.get(5); W, H = int(cap.get(3)), int(cap.get(4))
vw = cv2.VideoWriter(outp, cv2.VideoWriter_fourcc(*"mp4v"), 1 / (tl[1]["t"] - tl[0]["t"]), (W, H))
kept, dropped = Counter(), Counter()
out_tl = []
for fr in tl:
    cap.set(1, round(fr["t"] * fps)); ok, f = cap.read()
    if not ok: break
    M = frame_to_court(fr["t"]); Mi = np.linalg.inv(M)
    # linije terena u frameu
    ov = f.copy()
    for seg in court_model: cv2.polylines(ov, [tf(Mi, seg).astype(np.int32)], False, (0, 255, 0), 2)
    cv2.polylines(ov, [tf(Mi, margin_poly).astype(np.int32)], False, (0, 160, 255), 1)
    f = cv2.addWeighted(ov, 0.6, f, 0.4, 0)
    pts = []; rows = []
    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]
        cx, cy = tf(M, [[(x1 + x2) / 2, y2]])[0]
        inside = on_court(cx, cy)
        q = dict(p, court=[round(float(cx), 2), round(float(cy), 2)], on_court=bool(inside)); rows.append(q)
        if inside:
            kept[p["team"]] += 1
            if p["team"] not in ("klupa",): pts.append(((cx, cy), p["team"]))
            cv2.rectangle(f, (x1, y1), (x2, y2), TEAM_BGR[p["team"]], 2)
        else:
            dropped[p["team"]] += 1
            cv2.line(f, (x1, y1), (x2, y2), (90, 90, 90), 1); cv2.line(f, (x1, y2), (x2, y1), (90, 90, 90), 1)
    out_tl.append({"t": fr["t"], "players": rows})
    f[H - MH - 10:H - 10, W - MW - 10:W - 10] = minimap(pts)
    cv2.putText(f, f"t={fr['t']:.1f}s", (10, H - 15), 0, 0.8, (0, 255, 255), 2)
    vw.write(f)
vw.release()
json.dump({"timeline": out_tl}, open(outp.rsplit(".", 1)[0] + "_court.json", "w"))
print("zadrzano:", dict(kept)); print("izbaceno:", dict(dropped))
