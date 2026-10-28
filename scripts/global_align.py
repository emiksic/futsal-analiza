"""Globalno poravnanje kamere (bez drifta): ključni frameovi + SIFT + loop closure + bundle adjustment.
Model: kamera na stativu, samo rotacija + zum -> frame k = (R_k, f_k). H_ref->k = K_k R_k K_0^-1.
Izlaz je u istom formatu kao camera.py (frame-to-frame H), pa ga ostale skripte koriste bez promjene.
python3 global_align.py clip.mp4 camera.json tracks.json out_camera.json [--kf 0.5] [--loop 4]
"""
import argparse, json, time, cv2, numpy as np
from scipy.optimize import least_squares
from scipy.sparse import lil_matrix

ap = argparse.ArgumentParser()
for k in ("video", "camera", "tracks", "out"): ap.add_argument(k)
ap.add_argument("--kf", type=float, default=0.5, help="razmak ključnih frameova (s)")
ap.add_argument("--loop", type=int, default=4, help="max loop-closure partnera po ključnom frameu")
ap.add_argument("--nfeat", type=int, default=2500)
ap.add_argument("--f0", type=float, default=0.0, help="0 = procijeni automatski")
a = ap.parse_args()
T0 = time.time()
rng = np.random.default_rng(0)

cam = json.load(open(a.camera)); tl = json.load(open(a.tracks))["timeline"]
times = np.array([tl[0]["t"]] + [e["t"] for e in cam])
G = [np.eye(3)]
for e in cam: G.append(np.array(e["H"]) @ G[-1])          # ref -> frame (lanac, ima drift)
G = np.array(G)

kf = [0]
for i, t in enumerate(times):
    if t - times[kf[-1]] >= a.kf - 1e-6: kf.append(i)
kf = np.array(kf); n = len(kf); kt = times[kf]; Gk = G[kf]
cap = cv2.VideoCapture(a.video); fps = cap.get(5)
W, Hh = int(cap.get(3)), int(cap.get(4)); cx, cy = W / 2, Hh / 2
print(f"ključnih frameova: {n}")

import os
cache = a.out.rsplit(".", 1)[0] + "_corr.npz"
if os.path.exists(cache):
    z = np.load(cache, allow_pickle=True); corr = list(z["corr"]); print("korespondencije iz cachea")
else:
    corr = None
# --- maska: grafika preko slike + igrači ---
if corr is None:
    samp = []
    for t in kt[::max(1, n // 30)]:
        cap.set(1, round(t * fps)); samp.append(cv2.cvtColor(cap.read()[1], cv2.COLOR_BGR2GRAY))
    samp = np.array(samp, np.int16)
    overlay = ((samp.max(0) - samp.min(0)) < 50).astype(np.uint8)
    overlay = cv2.dilate(cv2.morphologyEx(overlay, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)), np.ones((9, 9), np.uint8))
    tlt = np.array([f["t"] for f in tl])
    sift = cv2.SIFT_create(a.nfeat)
    kps, descs = [], []
    for t in kt:
        cap.set(1, round(t * fps)); g = cv2.cvtColor(cap.read()[1], cv2.COLOR_BGR2GRAY)
        m = np.full((Hh, W), 255, np.uint8); m[overlay > 0] = 0
        for p in tl[int(np.argmin(abs(tlt - t)))]["players"]:
            x1, y1, x2, y2 = p["box"]; m[max(0, y1 - 15):y2 + 15, max(0, x1 - 15):x2 + 15] = 0
        k, d = sift.detectAndCompute(g, m)
        kps.append(np.float32([q.pt for q in k]) if k else np.zeros((0, 2), np.float32)); descs.append(d)
    print(f"SIFT gotov ({time.time()-T0:.0f}s), prosj. značajki {np.mean([len(k) for k in kps]):.0f}")

    # --- parovi: susjedni + loop closure prema predikciji lanca ---
    corners = np.float32([[0, 0], [W, 0], [W, Hh], [0, Hh]])
    def overlap(i, j):
        poly = cv2.perspectiveTransform(corners.reshape(-1, 1, 2), Gk[j] @ np.linalg.inv(Gk[i])).reshape(-1, 2)
        try: area, _ = cv2.intersectConvexConvex(poly.astype(np.float32), corners)
        except cv2.error: return 0.0
        return area / (W * Hh)
    pairs = {(i, j) for i in range(n) for j in (i + 1, i + 2) if j < n}
    for i in range(n):
        cand = [(overlap(i, j), j) for j in range(i + 3, n) if kt[j] - kt[i] > 3.0]
        cand = sorted([c for c in cand if c[0] > 0.35], reverse=True); taken = []
        for ov, j in cand:
            if all(abs(kt[j] - kt[q]) > 5.0 for q in taken): taken.append(j); pairs.add((i, j))
            if len(taken) >= a.loop: break
    print(f"parova za uparivanje: {len(pairs)}")

    flann = cv2.FlannBasedMatcher(dict(algorithm=1, trees=4), dict(checks=40))
    corr = []          # (i, j, pts_i, pts_j, loop?)
    for i, j in sorted(pairs):
        di, dj = descs[i], descs[j]
        if di is None or dj is None or len(di) < 30 or len(dj) < 30: continue
        good = [m for m, s in (x for x in flann.knnMatch(di, dj, k=2) if len(x) == 2) if m.distance < 0.75 * s.distance]
        if len(good) < 25: continue
        pi = kps[i][[m.queryIdx for m in good]]; pj = kps[j][[m.trainIdx for m in good]]
        Hd, inl = cv2.findHomography(pi, pj, cv2.RANSAC, 3.0)
        if Hd is None or inl.sum() < 25: continue
        inl = inl.ravel().astype(bool); pi, pj = pi[inl], pj[inl]
        loop = j - i > 2
        if loop:   # odbaci lažna podudaranja (ponavljajući uzorci): ne smije biti daleko od lanca
            pred = cv2.perspectiveTransform(pi.reshape(-1, 1, 2), Gk[j] @ np.linalg.inv(Gk[i])).reshape(-1, 2)
            if np.median(np.linalg.norm(pred - pj, axis=1)) > 150: continue
        sel = rng.choice(len(pi), min(60, len(pi)), replace=False)
        corr.append((i, j, pi[sel], pj[sel], loop))
    np.savez(cache, corr=np.array(corr, dtype=object))
n_loop = sum(c[4] for c in corr)
print(f"prihvaćenih parova: {len(corr)} (loop closure: {n_loop})  ({time.time()-T0:.0f}s)")

I_ = np.concatenate([np.full(len(c[2]), c[0]) for c in corr]); J_ = np.concatenate([np.full(len(c[2]), c[1]) for c in corr])
P_ = np.concatenate([c[2] for c in corr]).astype(float); Q_ = np.concatenate([c[3] for c in corr]).astype(float)
LOOP = np.concatenate([np.full(len(c[2]), c[4]) for c in corr])
# simetrično: i->j i j->i
I_, J_, P_, Q_, LOOP = (np.concatenate([I_, J_]), np.concatenate([J_, I_]), np.concatenate([P_, Q_]),
                        np.concatenate([Q_, P_]), np.concatenate([LOOP, LOOP]))

# --- žarišna duljina iz parova s dovoljno rotacije ---
if a.f0 <= 0:
    fs = []
    for (i, j, P, Q, lp) in corr:
        if lp or j - i != 2 or len(fs) >= 150: continue
        def r_(p):
            Rm = cv2.Rodrigues(p[:3])[0]; fi, fj = np.exp(p[3:])
            Hr = np.array([[fj, 0, cx], [0, fj, cy], [0, 0, 1]]) @ Rm @ np.linalg.inv(np.array([[fi, 0, cx], [0, fi, cy], [0, 0, 1]]))
            return (cv2.perspectiveTransform(P.reshape(-1, 1, 2).astype(np.float32), Hr).reshape(-1, 2) - Q).ravel()
        best = None
        for g0 in (600, 1000, 1600, 2400):
            r = least_squares(r_, np.r_[0, 0, 0, np.log(g0), np.log(g0)]); c = np.sum(r.fun ** 2)
            if best is None or c < best[0]: best = (c, np.exp(r.x[3]), np.linalg.norm(r.x[:3]))
        if best[2] > 0.01: fs.append(best[1])
    a.f0 = float(np.median(fs)); print(f"procijenjena žarišna duljina: {a.f0:.0f} px (iz {len(fs)} parova)")
# --- inicijalizacija iz lanca ---
K0 = np.array([[a.f0, 0, cx], [0, a.f0, cy], [0, 0, 1]])
rv0 = np.zeros((n, 3)); lf0 = np.zeros(n)
for k in range(n):
    A = Gk[k] @ K0; A = A / np.linalg.norm(A[2])
    if A[2, 2] < 0: A = -A
    r0, r1 = A[0] - cx * A[2], A[1] - cy * A[2]
    fk = (np.linalg.norm(r0) + np.linalg.norm(r1)) / 2
    U, _, Vt = np.linalg.svd(np.stack([r0 / fk, r1 / fk, A[2]])); Rm = U @ Vt
    if np.linalg.det(Rm) < 0: Rm = U @ np.diag([1, 1, -1]) @ Vt
    rv0[k] = cv2.Rodrigues(Rm)[0].ravel(); lf0[k] = np.log(fk)
lf0[0] = np.log(a.f0)

def rodrigues(rv):
    th = np.linalg.norm(rv, axis=1); k = rv / np.maximum(th, 1e-12)[:, None]
    Kx = np.zeros((len(rv), 3, 3))
    Kx[:, 0, 1], Kx[:, 0, 2], Kx[:, 1, 0] = -k[:, 2], k[:, 1], k[:, 2]
    Kx[:, 1, 2], Kx[:, 2, 0], Kx[:, 2, 1] = -k[:, 0], -k[:, 1], k[:, 0]
    s, c = np.sin(th)[:, None, None], (1 - np.cos(th))[:, None, None]
    return np.eye(3)[None] + s * Kx + c * (Kx @ Kx)

def project(x):
    rv = x[:3 * n].reshape(n, 3); f = np.exp(x[3 * n:]); R = rodrigues(rv)
    ray = np.stack([(P_[:, 0] - cx) / f[I_], (P_[:, 1] - cy) / f[I_], np.ones(len(I_))], 1)
    w = np.einsum("nji,nj->ni", R[I_], ray)           # R_i^T ray
    c = np.einsum("nij,nj->ni", R[J_], w)
    return np.stack([f[J_] * c[:, 0] / c[:, 2] + cx, f[J_] * c[:, 1] / c[:, 2] + cy], 1)

def resid(x):
    return np.concatenate([(project(x) - Q_).ravel(), 100 * x[:3]])     # zadnje: R_0 = I

npar = 4 * n
Sp = lil_matrix((2 * len(I_) + 3, npar), dtype=int)
rows = np.arange(len(I_))
for comp in range(2):
    r = 2 * rows + comp
    for d in range(3):
        Sp[r, 3 * I_ + d] = 1; Sp[r, 3 * J_ + d] = 1
    Sp[r, 3 * n + I_] = 1; Sp[r, 3 * n + J_] = 1
for d in range(3): Sp[2 * len(I_) + d, d] = 1

x0 = np.concatenate([rv0.ravel(), lf0])
def stats(err, mask): return f"medijan {np.median(err[mask]):.1f}px, 90% {np.percentile(err[mask], 90):.1f}px"
# greška samog lanca (prije optimizacije), izravno iz homografija
Hpair = np.array([Gk[j] @ np.linalg.inv(Gk[i]) for i, j in zip(I_, J_)])
ph = np.einsum("nij,nj->ni", Hpair, np.c_[P_, np.ones(len(P_))]); ph = ph[:, :2] / ph[:, 2:]
e_chain = np.linalg.norm(ph - Q_, axis=1)
print(f"LANAC     susjedni: {stats(e_chain, ~LOOP)} | loop: {stats(e_chain, LOOP)}")

e_init = np.linalg.norm(project(x0) - Q_, axis=1)
print(f"POČETAK   susjedni: {stats(e_init, ~LOOP)} | loop: {stats(e_init, LOOP)}")
xs = np.r_[np.full(3 * n, 1e-3), np.full(n, 1e-2)]
res = least_squares(resid, x0, jac_sparsity=Sp, loss="soft_l1", f_scale=1.5, x_scale=xs,
                    method="trf", tr_solver="lsmr", max_nfev=300, verbose=0)
print("  optimizacija:", res.message)
e_opt = np.linalg.norm(project(res.x) - Q_, axis=1)
print(f"GLOBALNO  susjedni: {stats(e_opt, ~LOOP)} | loop: {stats(e_opt, LOOP)}  ({res.nfev} iteracija, {time.time()-T0:.0f}s)")

rv = res.x[:3 * n].reshape(n, 3); f = np.exp(res.x[3 * n:]); R = rodrigues(rv)
Kf = lambda fv: np.array([[fv, 0, cx], [0, fv, cy], [0, 0, 1]])
Gopt = np.array([Kf(f[k]) @ R[k] @ np.linalg.inv(Kf(f[0])) for k in range(n)])
Gopt = np.array([g @ np.linalg.inv(Gopt[0]) for g in Gopt])
print(f"žarišna duljina: {f.min():.0f}-{f.max():.0f} px (zum {f.max()/f.min():.2f}x)")

# --- svi frameovi: lokalni lanac od susjednih ključnih, stopljeno ---
Gall = np.zeros_like(G)
for idx in range(len(times)):
    k1 = np.searchsorted(kf, idx, side="right") - 1; k2 = min(k1 + 1, n - 1)
    a_, b_ = kf[k1], kf[k2]
    Gf = (G[idx] @ np.linalg.inv(G[a_])) @ Gopt[k1]
    if b_ == a_: Gall[idx] = Gf / Gf[2, 2]; continue
    Gb = (G[idx] @ np.linalg.inv(G[b_])) @ Gopt[k2]
    w = (idx - a_) / (b_ - a_)
    Gall[idx] = (1 - w) * Gf / Gf[2, 2] + w * Gb / Gb[2, 2]
out = [{"t": float(times[i]), "H": (Gall[i] @ np.linalg.inv(Gall[i - 1])).tolist(), "inliers": cam[i - 1]["inliers"]}
       for i in range(1, len(times))]
json.dump(out, open(a.out, "w"))
json.dump({"kf_times": kt.tolist(), "focal": f.tolist(), "rvec": rv.tolist(), "cx": cx, "cy": cy},
          open(a.out.rsplit(".", 1)[0] + "_poses.json", "w"))
print(f"gotovo ({time.time()-T0:.0f}s)")
