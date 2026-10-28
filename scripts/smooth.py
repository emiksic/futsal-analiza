"""Izglađivanje pozicija na terenu: Kalman (konstantna brzina) po tracku + RTS smoother.
Šum mjerenja ovisi o mjestu na terenu: piksel jitter -> metri preko Jakobijana homografije.
from smooth import smooth_positions
"""
import numpy as np, cv2

PX_SIGMA = 4.0      # px: trešnja donjeg ruba okvira
ACC_SIGMA = 4.0     # m/s^2: koliko naglo igrač može promijeniti brzinu
GATE = 16.0         # Mahalanobis^2: veće = ispad, preskoči

def foot_and_cov(M, box):
    """pozicija stopala na terenu (m) i kovarijanca mjerenja iz Jakobijana homografije"""
    x1, y1, x2, y2 = box; u, v = (x1 + x2) / 2, y2
    pts = np.float32([[[u, v]], [[u + 1, v]], [[u, v + 1]]])
    q = cv2.perspectiveTransform(pts, M).reshape(-1, 2)
    J = np.stack([q[1] - q[0], q[2] - q[0]], 1)               # d(teren)/d(piksel)
    R = J @ np.diag([PX_SIGMA ** 2, (1.5 * PX_SIGMA) ** 2]) @ J.T + np.eye(2) * 0.01
    return q[0], R

def _kf(ts, zs, Rs, causal):
    n = len(ts); Hm = np.array([[1., 0, 0, 0], [0, 1, 0, 0]])
    xs = np.zeros((n, 4)); Ps = np.zeros((n, 4, 4)); xp_ = np.zeros((n, 4)); Pp_ = np.zeros((n, 4, 4)); Fs = np.zeros((n, 4, 4))
    x = np.r_[zs[0], 0, 0]; P = np.diag([Rs[0][0, 0], Rs[0][1, 1], 9, 9])
    for k in range(n):
        if k:
            dt = max(ts[k] - ts[k - 1], 1e-3)
            F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1.]])
            G = np.array([[dt * dt / 2, 0], [0, dt * dt / 2], [dt, 0], [0, dt]])
            x = F @ x; P = F @ P @ F.T + G @ G.T * ACC_SIGMA ** 2
            Fs[k] = F
        xp_[k], Pp_[k] = x, P
        y = zs[k] - Hm @ x; S = Hm @ P @ Hm.T + Rs[k]
        if k == 0 or y @ np.linalg.solve(S, y) < GATE:
            K = P @ Hm.T @ np.linalg.inv(S); x = x + K @ y; P = (np.eye(4) - K @ Hm) @ P
        xs[k], Ps[k] = x, P
    if causal: return xs[:, :2]
    for k in range(n - 2, -1, -1):                              # RTS unatrag
        C = Ps[k] @ Fs[k + 1].T @ np.linalg.inv(Pp_[k + 1])
        xs[k] = xs[k] + C @ (xs[k + 1] - xp_[k + 1]); Ps[k] = Ps[k] + C @ (Ps[k + 1] - Pp_[k + 1]) @ C.T
    return xs[:, :2]

def smooth_positions(samples, causal=False):
    """samples: {track_id: [(t, z(2,), R(2,2)), ...]} -> {(track_id, t): (x, y)}"""
    out = {}
    for tid, seq in samples.items():
        seq = sorted(seq, key=lambda s: s[0])
        ts = np.array([s[0] for s in seq]); zs = np.array([s[1] for s in seq]); Rs = [s[2] for s in seq]
        sm = _kf(ts, zs, Rs, causal)
        for t, p in zip(ts, sm): out[(tid, round(float(t), 3))] = p
    return out
