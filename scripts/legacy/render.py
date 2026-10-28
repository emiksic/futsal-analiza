"""Iscrtaj tracks.json preko videa; tragovi su vezani za pod (kompenzacija kamere homografijom).
python3 render.py clip.mp4 tracks.json out.mp4
"""
import sys, json, cv2, numpy as np
from collections import defaultdict, deque

TEAM_BGR = {"ljubicasti": (200, 60, 140), "bijeli": (255, 255, 255), "golman_z": (0, 230, 255),
            "sudac": (0, 0, 255), "klupa": (180, 105, 255), "?": (128, 128, 128)}
SCOREBOARD = (0, 0, 420, 100)          # x1,y1,x2,y2 na 1280x720 - fiksni overlay, ne smije u procjenu
TRAIL_LEN = 30                          # 2 s na 15 fps

video, js, outp = sys.argv[1:4]
tl = json.load(open(js))["timeline"]
cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS)
W, H = int(cap.get(3)), int(cap.get(4))
vw = cv2.VideoWriter(outp, cv2.VideoWriter_fourcc(*"mp4v"), 1 / (tl[1]["t"] - tl[0]["t"]), (W, H))

def bg_mask(players):
    m = np.full((H, W), 255, np.uint8)
    x1, y1, x2, y2 = SCOREBOARD; m[y1:y2, x1:x2] = 0
    for p in players:
        a, b, c, d = p["box"]; m[max(0, b - 10):d + 10, max(0, a - 10):c + 10] = 0
    return m

def camera_h(prev_g, g, mask):
    """homografija prev -> cur iz optičkog toka točaka pozadine"""
    p0 = cv2.goodFeaturesToTrack(prev_g, 600, 0.01, 12, mask=mask)
    if p0 is None or len(p0) < 20: return np.eye(3), 0
    p1, st, _ = cv2.calcOpticalFlowPyrLK(prev_g, g, p0, None, winSize=(21, 21), maxLevel=3)
    ok = st.ravel() == 1
    if ok.sum() < 20: return np.eye(3), 0
    Hm, inl = cv2.findHomography(p0[ok], p1[ok], cv2.RANSAC, 3.0)
    return (Hm if Hm is not None else np.eye(3)), int(inl.sum()) if inl is not None else 0

trail = defaultdict(lambda: deque(maxlen=TRAIL_LEN))
last_seen = {}
prev_g = None; prev_players = []
grid = np.array([[x, y] for y in range(300, 701, 100) for x in range(80, 1281, 160)], np.float32).reshape(-1, 1, 2)
log = []
for k, fr in enumerate(tl):
    cap.set(cv2.CAP_PROP_POS_FRAMES, round(fr["t"] * fps)); ok, f = cap.read()
    if not ok: break
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    gap = k > 0 and fr["t"] - tl[k - 1]["t"] > 0.2      # rupa (npr. replay) -> resetiraj tragove
    if prev_g is not None and not gap:
        Hm, n_inl = camera_h(prev_g, g, bg_mask(prev_players + fr["players"]))
        # pomakni sve postojeće točke tragova za pomak kamere
        for tid, dq in trail.items():
            if not dq: continue
            arr = np.array(dq, np.float32).reshape(-1, 1, 2)
            dq.clear(); dq.extend(map(tuple, cv2.perspectiveTransform(arr, Hm).reshape(-1, 2)))
        grid = cv2.perspectiveTransform(grid, Hm)
        log.append({"t": fr["t"], "H": Hm.tolist(), "inliers": n_inl})
    elif gap:
        trail.clear()
    prev_g, prev_players = g, fr["players"]

    for p in fr["players"]:
        x1, y1, x2, y2 = p["box"]; c = TEAM_BGR[p["team"]]
        if p["team"] in ("klupa", "?"):
            cv2.rectangle(f, (x1, y1), (x2, y2), c, 1); continue
        trail[p["id"]].append(((x1 + x2) / 2, y2)); last_seen[p["id"]] = fr["t"]
        cv2.rectangle(f, (x1, y1), (x2, y2), c, 2)
        cv2.putText(f, str(p["id"]), (x1, y1 - 5), 0, 0.7, (0, 0, 0), 4)
        cv2.putText(f, str(p["id"]), (x1, y1 - 5), 0, 0.7, c, 2)
    # crtaj tragove (i onih koji nisu u ovom frameu ali su viđeni nedavno)
    for tid, dq in trail.items():
        if fr["t"] - last_seen.get(tid, -9) > 1.0 or len(dq) < 2: continue
        team = next((p["team"] for p in fr["players"] if p["id"] == tid), None)
        c = TEAM_BGR.get(team, (160, 160, 160))
        pts = [tuple(map(int, q)) for q in dq]
        for i, (a, b) in enumerate(zip(pts, pts[1:])):
            cv2.line(f, a, b, c, 1 + 2 * i // len(pts))   # deblje prema sadašnjosti
    for q in grid.reshape(-1, 2):
        cv2.drawMarker(f, tuple(map(int, q)), (0, 255, 0), cv2.MARKER_CROSS, 14, 2)
    cv2.putText(f, f"t={fr['t']:.1f}s", (10, H - 15), 0, 0.8, (0, 255, 255), 2)
    vw.write(f)
vw.release()
json.dump(log, open(outp.rsplit(".", 1)[0] + "_camera.json", "w"))
print("frameova:", len(tl), " prosj. inliera:", int(np.mean([x["inliers"] for x in log])))
