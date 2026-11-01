"""TrackNet-stil model lopte: 3 uzastopna framea -> toplinska mapa gdje je lopta. Vlastiti U-Net u čistom PyTorchu (od nule).

  python ball/tracknet.py train  [--data ~/futsal-ball] [--epochs 40] [--batch 6]
  python ball/tracknet.py eval   [--model ~/futsal-ball/runs/tracknet/best.pt]
  python ball/tracknet.py detect video.mp4 out.json [--model …/best.pt] [--start 0 --end 9999] [--step 1]

Podaci: labels.json + frames/ (srednji frame) + frames3/ (susjedni, iz ball/extract_neighbors.py).
Validacija: iste utakmice kao YOLO (dataset/split.json), pa je eval izravno usporediv s train_ball.py eval.
detect piše isti format kao scripts/ball_detect.py ([x, y, w, h, conf] po frameu), pa ide ravno u ball_track.py.

Mreža radi na 1280x720 (frameovi se skaliraju); trening na izrezima 640x352 oko lopte ili nasumičnim.
Izlaz: logit po pikselu; cilj je Gaussova mrlja (sigma 2.5 px) na sredini lopte, prazno kad lopte nema.
"""
import argparse, json, math, os, random, sys, time
from pathlib import Path
import cv2, numpy as np

NW, NH = 1280, 720            # mrežna rezolucija cijelog framea
CW, CH = 640, 352             # izrez za trening (djeljivo sa 16)
SIGMA = 2.5


# ---------------- podaci ----------------
def load_items(data, val):
    lab = json.load(open(data / "labels.json", encoding="utf-8"))["frames"]
    meta = json.load(open(data / "frames3" / "meta.json"))
    items = []
    for n, v in lab.items():
        if v == "skip" or not meta.get(n, {}).get("ok"): continue
        st = Path(n).stem
        p3 = [data / "frames3" / f"{st}_p.jpg", data / "frames" / n, data / "frames3" / f"{st}_n.jpg"]
        if not all(p.exists() for p in p3): continue
        items.append({"name": n, "paths": [str(p) for p in p3], "ball": v if isinstance(v, list) else None,
                      "val": n.split("_")[0] in val})
    return items


def val_matches(data, a):
    if a.val: return set(a.val)
    sp = data / "dataset" / "split.json"
    if sp.exists(): return set(json.load(open(sp))["val"])
    sys.exit("Nema dataset/split.json: zadaj --val ID1 ID2 (iste utakmice kao kod YOLO-a).")


def read3(paths):
    ims = [cv2.imread(p) for p in paths]
    h, w = ims[1].shape[:2]
    if (w, h) != (NW, NH): ims = [cv2.resize(im, (NW, NH), interpolation=cv2.INTER_AREA) for im in ims]
    return ims, NW / w, NH / h


def heatmap(h, w, x, y):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * SIGMA ** 2))


def to_tensor(ims):
    import torch
    x = np.concatenate([im[:, :, ::-1] for im in ims], 2).astype(np.float32) / 255.0   # 3 x RGB = 9 kanala
    return torch.from_numpy(np.ascontiguousarray(x.transpose(2, 0, 1)))


class TrainSet:
    def __init__(self, items, epoch_len=None): self.items = items; self.n = epoch_len or len(items)
    def __len__(self): return self.n
    def __getitem__(self, i):
        import torch
        it = self.items[i % len(self.items)] if self.n == len(self.items) else random.choice(self.items)
        ims, sx, sy = read3(it["paths"])
        b = it["ball"]; bx = by = None
        if b: bx, by = b[0] * sx, b[1] * sy
        if b and random.random() < 0.8:                 # izrez oko lopte (s pomakom), inače nasumičan
            x0 = int(np.clip(bx - random.uniform(0.1, 0.9) * CW, 0, NW - CW)); y0 = int(np.clip(by - random.uniform(0.1, 0.9) * CH, 0, NH - CH))
        else:
            x0 = random.randint(0, NW - CW); y0 = random.randint(0, NH - CH)
        ims = [im[y0:y0 + CH, x0:x0 + CW] for im in ims]
        tx, ty = (bx - x0, by - y0) if b else (None, None)
        if random.random() < 0.5:                        # zrcaljenje
            ims = [im[:, ::-1] for im in ims]; tx = CW - 1 - tx if b else None
        if random.random() < 0.5: ims = ims[::-1]          # obrnut smjer vremena
        a_ = random.uniform(0.75, 1.25); c_ = random.uniform(-20, 20)       # svjetlina/kontrast, isto za sva 3
        ims = [np.clip(im.astype(np.float32) * a_ + c_, 0, 255).astype(np.uint8) for im in ims]
        if random.random() < 0.3:                        # pomak nijanse (druge dvorane), isto za sva 3
            dh = random.randint(-8, 8)
            ims = [cv2.cvtColor(cv2.add(cv2.cvtColor(im, cv2.COLOR_BGR2HSV), (dh, 0, 0, 0)), cv2.COLOR_HSV2BGR) for im in ims]
        hm = heatmap(CH, CW, tx, ty) if b and 0 <= tx < CW and 0 <= ty < CH else np.zeros((CH, CW), np.float32)
        return to_tensor(ims), torch.from_numpy(hm[None])


# ---------------- model ----------------
def build_model():
    import torch, torch.nn as nn
    def block(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                                          nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))
    class UNet(nn.Module):
        def __init__(self, ch=(32, 64, 128, 256), cin=9):
            super().__init__()
            self.enc = nn.ModuleList(); c = cin
            for o in ch: self.enc.append(block(c, o)); c = o
            self.mid = block(ch[-1], ch[-1] * 2)
            self.up = nn.ModuleList(); self.dec = nn.ModuleList(); c = ch[-1] * 2
            for o in reversed(ch):
                self.up.append(nn.ConvTranspose2d(c, o, 2, stride=2)); self.dec.append(block(o * 2, o)); c = o
            self.head = nn.Conv2d(ch[0], 1, 1)
            nn.init.constant_(self.head.bias, -4.0)          # na početku "nigdje nema lopte"
        def forward(self, x):
            skips = []
            for e in self.enc: x = e(x); skips.append(x); x = nn.functional.max_pool2d(x, 2)
            x = self.mid(x)
            for u, d, s in zip(self.up, self.dec, reversed(skips)): x = d(torch.cat([u(x), s], 1))
            return self.head(x)
    return UNet()


def wbce(logit, y):
    """Otežani BCE (TrackNetV2): (1-p)^2 * y*log p + p^2 * (1-y)*log(1-p) -- lopta je 0.01 % piksela."""
    import torch
    p = torch.sigmoid(logit).clamp(1e-6, 1 - 1e-6)
    return -((1 - p) ** 2 * y * torch.log(p) + p ** 2 * (1 - y) * torch.log(1 - p)).mean() * 100


# ---------------- predviđanje ----------------
def peaks(prob, k=3, thr=0.05):
    """Do k lokalnih maksimuma iznad praga: [(x, y, p)] u mrežnim koordinatama."""
    import torch
    mp = torch.nn.functional.max_pool2d(prob[None, None], 9, 1, 4)[0, 0]
    m = (prob == mp) & (prob >= thr)
    ys, xs = torch.nonzero(m, as_tuple=True)
    if not len(xs): return []
    v = prob[ys, xs]; o = torch.argsort(v, descending=True)[:k]
    return [(float(xs[i]), float(ys[i]), float(v[i])) for i in o]


def predict(model, ims, dev, amp=True):
    import torch
    x = to_tensor(ims)[None].to(dev)
    with torch.no_grad(), torch.autocast(device_type=dev.type, enabled=amp and dev.type == "cuda"):
        return torch.sigmoid(model(x).float())[0, 0]


def evaluate(model, items, dev, quiet=False):
    """Isti kriterij kao train_ball.py eval: pogodak = najjači vrh unutar max(8 px, promjer lopte) od oznake."""
    model.eval(); res = []
    for it in items:
        ims, sx, sy = read3(it["paths"])
        pk = peaks(predict(model, ims, dev), k=1, thr=0.0)
        res.append((it["ball"], (pk[0][0] / sx, pk[0][1] / sy, pk[0][2]) if pk else None))
    # gusta mreža pragova: grubih 5 pragova promaši najbolju točku čim se pouzdanosti modela malo pomaknu
    thr = [round(0.05 * k, 2) for k in range(1, 20)]; table = []
    for t in thr:
        hit = tot = fa = neg = 0
        for b, d in res:
            d = d if d and d[2] >= t else None
            if b: tot += 1; hit += bool(d and math.hypot(d[0] - b[0], d[1] - b[1]) <= max(8, b[2]))
            else: neg += 1; fa += bool(d)
        table.append((t, hit / max(tot, 1), fa / max(neg, 1)))
    if not quiet:
        print(f"{len(items)} okvira ({sum(1 for b, _ in res if b)} s loptom)\n  prag  odaziv  lažni alarm")
        for t, r, f in table: print(f"  {t:.2f}  {r:6.0%}  {f:10.0%}")
        for lim in (0.15, 0.05):
            ok = [(r, t) for t, r, f in table if f <= lim]
            if ok: r, t = max(ok); print(f"najbolje uz lažni alarm <= {lim:.0%}: odaziv {r:.0%} na pragu {t:.2f}")
    return table


SHOW = (0.1, 0.25, 0.4, 0.55, 0.7)
def short(table): return [x for x in table if x[0] in SHOW]
def best_thr(table, lim=0.15):
    ok = [(r, t) for t, r, f in table if f <= lim]; return max(ok)[1] if ok else None


def score(table):            # za odabir najbolje epohe: najveći odaziv uz lažni alarm <= 15 %
    ok = [r for t, r, f in table if f <= 0.15]
    return max(ok) if ok else 0.0


# ---------------- naredbe ----------------
def cmd_train(a):
    import torch
    data = Path(os.path.expanduser(a.data)); val = val_matches(data, a)
    items = load_items(data, val); tr = [i for i in items if not i["val"]]; va = [i for i in items if i["val"]]
    print(f"train {len(tr)} ({sum(1 for i in tr if i['ball'])} s loptom), val {len(va)} ({sum(1 for i in va if i['ball'])} s loptom), val: {', '.join(sorted(val))}")
    if not tr or not va: sys.exit("Nema podataka: pokreni prvo ball/extract_neighbors.py")
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_model().to(dev)
    print(f"parametara: {sum(p.numel() for p in model.parameters()) / 1e6:.1f} M, uređaj: {dev}")
    dl = torch.utils.data.DataLoader(TrainSet(tr), batch_size=a.batch, shuffle=True, num_workers=a.workers,
                                     drop_last=True, persistent_workers=a.workers > 0)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.epochs * len(dl), pct_start=0.1)
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    out = data / "runs" / "tracknet"; out.mkdir(parents=True, exist_ok=True)
    log = open(out / "results.csv", "a"); log.write("epoha,vrijeme_min,loss,score,prag," + ",".join(f"odaziv@{t},alarm@{t}" for t in SHOW) + "\n")
    best, bad, t0 = -1, 0, time.time()
    for ep in range(1, a.epochs + 1):
        model.train(); tot = 0.0
        for k, (x, y) in enumerate(dl):
            x, y = x.to(dev, non_blocking=True), y.to(dev, non_blocking=True)
            with torch.autocast(device_type=dev.type, enabled=dev.type == "cuda"):
                logit = model(x)
            loss = wbce(logit.float(), y)
            opt.zero_grad(set_to_none=True); scaler.scale(loss).backward(); scaler.step(opt); scaler.update(); sched.step()
            tot += loss.item()
            if k % 50 == 0: print(f"\r  epoha {ep}/{a.epochs}  {k}/{len(dl)}  loss {tot / (k + 1):.4f}", end="", flush=True)
        table = evaluate(model, va, dev, quiet=True); s = score(table)
        mins = (time.time() - t0) / 60
        bt = best_thr(table)
        print(f"\repoha {ep}/{a.epochs}  loss {tot / len(dl):.4f}  odaziv uz alarm<=15%: {s:.0%} (prag {bt})  "
              + "  ".join(f"[{t}: {r:.0%}/{f:.0%}]" for t, r, f in short(table)) + f"  ({mins:.0f} min)", flush=True)
        log.write(f"{ep},{mins:.1f},{tot / len(dl):.5f},{s:.4f},{bt}," + ",".join(f"{r:.4f},{f:.4f}" for _, r, f in short(table)) + "\n"); log.flush()
        torch.save(model.state_dict(), out / "last.pt")
        if s > best: best, bad = s, 0; torch.save(model.state_dict(), out / "best.pt"); print(f"  -> najbolji do sad, spremljen best.pt")
        else:
            bad += 1
            if bad >= a.patience: print(f"nema napretka {a.patience} epoha, kraj"); break
    print("najbolji model:", out / "best.pt", f"(odaziv uz alarm<=15%: {best:.0%})")


def load_model(path, dev):
    import torch
    m = build_model().to(dev); m.load_state_dict(torch.load(os.path.expanduser(path), map_location=dev)); m.eval(); return m


def cmd_eval(a):
    import torch
    data = Path(os.path.expanduser(a.data)); val = val_matches(data, a)
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    va = [i for i in load_items(data, val) if i["val"]]
    print("TrackNet:", a.model); evaluate(load_model(a.model, dev), va, dev)


def cmd_detect(a):
    import torch
    dev = torch.device("cuda" if torch.cuda.is_available() else "cpu"); model = load_model(a.model, dev)
    cap = cv2.VideoCapture(a.video); fps = cap.get(cv2.CAP_PROP_FPS) or 30; nfr = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    W, H = int(cap.get(3)), int(cap.get(4)); sx, sy = NW / W, NH / H
    gap = max(1, round(fps / 30)); f0 = round(a.start * fps); f1 = min(nfr, round(min(a.end, nfr / fps) * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, f0 - gap)); buf = []; fi = max(0, f0 - gap); res = []
    def prep(f): return cv2.resize(f, (NW, NH), interpolation=cv2.INTER_AREA) if (W, H) != (NW, NH) else f
    while fi <= f1 + gap:
        ok, f = cap.read()
        if not ok: break
        buf.append(prep(f)); buf = buf[-(2 * gap + 1):]; c = fi - gap      # srednji frame
        if len(buf) == 2 * gap + 1 and f0 <= c < f1 and (c - f0) % a.step == 0:
            pk = peaks(predict(model, [buf[0], buf[gap], buf[-1]], dev), k=3, thr=0.05)
            res.append({"t": round(c / fps, 3), "dets": [[round(x / sx, 1), round(y / sy, 1), round(12 / sx, 1), round(12 / sy, 1), round(p, 3)] for x, y, p in pk]})
            if len(res) % 600 == 0: print(f"  {c / fps:6.1f} s")
        fi += 1
    json.dump(res, open(a.out, "w"))
    print("frameova", len(res), " s barem jednom detekcijom:", sum(bool(r["dets"]) for r in res))


def main():
    for st in (sys.stdout, sys.stderr):                  # Windows + preusmjeren izlaz (Tee-Object) = cp1252, ruši se na č/ć/đ
        try: st.reconfigure(encoding="utf-8", errors="replace")
        except Exception: pass
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("train", "eval", "detect"):
        p = sub.add_parser(c)
        p.add_argument("--data", default=str(Path.home() / "futsal-ball")); p.add_argument("--val", nargs="*")
        p.add_argument("--model", default=str(Path.home() / "futsal-ball" / "runs" / "tracknet" / "best.pt"))
        if c == "train":
            p.add_argument("--epochs", type=int, default=40); p.add_argument("--batch", type=int, default=6)
            p.add_argument("--lr", type=float, default=2e-3); p.add_argument("--workers", type=int, default=4)
            p.add_argument("--patience", type=int, default=15)
        if c == "detect":
            p.add_argument("video"); p.add_argument("out")
            p.add_argument("--start", type=float, default=0); p.add_argument("--end", type=float, default=1e9); p.add_argument("--step", type=int, default=1)
    a = ap.parse_args()
    {"train": cmd_train, "eval": cmd_eval, "detect": cmd_detect}[a.cmd](a)


if __name__ == "__main__":
    main()
