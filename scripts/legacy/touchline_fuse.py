"""Spoji detekcije uzdužne linije kroz vrijeme preko homografije kamere.
python3 touchline_fuse.py touchline.json camera.json clip.mp4 tracks.json out.mp4
"""
import sys, json, cv2, numpy as np

tlj, camj, video, tracks, outp = sys.argv[1:6]
det = [d for d in json.load(open(tlj)) if d["color"] and d["foot"][1] < 700]   # odreži suca na rubu
cam = json.load(open(camj))
tl = json.load(open(tracks))["timeline"]

# akumulirana homografija: ref (prvi frame) -> frame t
times = [tl[0]["t"]]; Hs = [np.eye(3)]
for e in cam:
    times.append(e["t"]); Hs.append(np.array(e["H"]) @ Hs[-1])
times = np.array(times)
def H_at(t): return Hs[int(np.argmin(abs(times - t)))]

def to_ref(pts, t): return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), np.linalg.inv(H_at(t))).reshape(-1, 2)
def from_ref(pts, t): return cv2.perspectiveTransform(np.float32(pts).reshape(-1, 1, 2), H_at(t)).reshape(-1, 2)

# svaka detekcija -> pravac u ref okviru, uzorkujemo y na fiksnim x pozicijama
XS = np.linspace(-1500, 2800, 44)   # ref okvir je širi od slike zbog paniranja
samples = []
for d in det:
    x1, y1, x2, y2 = d["seg"]
    p = to_ref([[x1, y1], [x2, y2]], d["t"])
    k = (p[1, 1] - p[0, 1]) / (p[1, 0] - p[0, 0] + 1e-6)
    samples.append(p[0, 1] + k * (XS - p[0, 0]))
S = np.array(samples)
med = np.median(S, axis=0)
# odbaci outliere (>25 px od medijana u sredini) i ponovi
mid = (XS > 0) & (XS < 1280)
keep = np.median(np.abs(S[:, mid] - med[mid]), axis=1) < 25
med = np.median(S[keep], axis=0)
spread = np.median(np.abs(S[keep][:, mid] - med[mid]))
print(f"detekcija: {len(S)}, zadrzano: {keep.sum()}, rasipanje oko medijana: {spread:.1f}px")
ref_line = np.stack([XS, med], 1)

cap = cv2.VideoCapture(video); fps = cap.get(5); W, H = int(cap.get(3)), int(cap.get(4))
vw = cv2.VideoWriter(outp, cv2.VideoWriter_fourcc(*"mp4v"), 1 / (tl[1]["t"] - tl[0]["t"]), (W, H))
det_t = {round(d["t"], 2) for d in det}
for fr in tl:
    cap.set(1, round(fr["t"] * fps)); ok, f = cap.read()
    if not ok: break
    pts = from_ref(ref_line, fr["t"]).astype(np.int32)
    cv2.polylines(f, [pts], False, (0, 255, 0), 2)
    for p in fr["players"]:
        if p["team"] == "sudac":
            x1, y1, x2, y2 = p["box"]; cv2.circle(f, ((x1 + x2) // 2, y2), 6, (0, 255, 255), -1)
    tag = "detektirano" if round(fr["t"], 2) in det_t else "projicirano"
    cv2.putText(f, f"t={fr['t']:.1f}s  uzduzna linija: {tag}", (10, H - 15), 0, 0.7, (0, 255, 0), 2)
    vw.write(f)
vw.release()
json.dump({"ref_line": ref_line.tolist(), "spread_px": float(spread)}, open(outp.rsplit(".", 1)[0] + "_line.json", "w"))
