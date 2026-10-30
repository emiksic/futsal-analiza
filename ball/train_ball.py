"""Trening i provjera modela za loptu.

  python ball/train_ball.py dataset --data ~/futsal-ball            # labels.json -> YOLO skup (podjela po utakmici)
  python ball/train_ball.py train   --data ~/futsal-ball            # trening (RTX 2060: zadano imgsz 1280, batch 4)
  python ball/train_ball.py eval    --data ~/futsal-ball --model ~/futsal-ball/runs/ball/weights/best.pt

Validacijske utakmice se NE koriste u treningu, pa je ocjena poštena (model ih nikad nije vidio).
Zadano se za validaciju uzimaju 2 utakmice; svoje biraš s --val ID1 ID2 (YouTube ID-jevi, početak imena okvira).

eval uspoređuje novi model s početnim COCO modelom na istim okvirima:
  pogodak    = najsigurnija detekcija je unutar max(8 px, promjer lopte) od označene sredine
  odaziv     = udio okvira s loptom u kojima je lopta pogođena
  lažni alarm = udio okvira bez vidljive lopte u kojima model ipak nešto javi
"""
import argparse, json, os, random, shutil, sys
from pathlib import Path

def load(data):
    lab = json.load(open(data / "labels.json", encoding="utf-8"))["frames"]
    # "skip" (nije igra) i "cam" (druga kamera) ne ulaze u trening lopte; "cam" kasnije služi za prepoznavanje rezova kamere
    return {n: v for n, v in lab.items() if v not in ("skip", "cam") and (data / "frames" / n).exists()}

def match_of(n): return n.split("_")[0]

def cmd_dataset(a):
    data = Path(os.path.expanduser(a.data)); lab = load(data)
    matches = sorted({match_of(n) for n in lab})
    if len(matches) < 2: sys.exit("Treba oznaka iz barem 2 utakmice (jedna ide u validaciju).")
    val = a.val or sorted(matches, key=lambda m: random.Random(7).random())[:min(2, len(matches) - 1)]
    out = data / "dataset"
    if out.exists(): shutil.rmtree(out)
    cnt = {"train": [0, 0], "val": [0, 0]}
    import cv2
    for n, v in lab.items():
        part = "val" if match_of(n) in val else "train"
        (out / "images" / part).mkdir(parents=True, exist_ok=True); (out / "labels" / part).mkdir(parents=True, exist_ok=True)
        src = data / "frames" / n; dst = out / "images" / part / n
        try: os.link(src, dst)                   # bez kopiranja ako je isti disk
        except OSError: shutil.copy2(src, dst)
        txt = ""
        if isinstance(v, list):
            h, w = cv2.imread(str(src)).shape[:2]
            s = max(v[2], 6)
            txt = f"0 {v[0] / w:.6f} {v[1] / h:.6f} {s / w:.6f} {s / h:.6f}\n"
            cnt[part][0] += 1
        else: cnt[part][1] += 1                  # prazna datoteka = okvir bez lopte (negativni primjer)
        (out / "labels" / part / (Path(n).stem + ".txt")).write_text(txt)
    (out / "ball.yaml").write_text(f"path: {out.as_posix()}\ntrain: images/train\nval: images/val\nnames:\n  0: ball\n")
    json.dump({"val": val}, open(out / "split.json", "w"))
    print(f"validacija: {', '.join(val)}")
    for p, (b, nn) in cnt.items(): print(f"  {p}: {b} s loptom, {nn} bez lopte")
    print("skup:", out / "ball.yaml")

def cmd_train(a):
    from ultralytics import YOLO
    data = Path(os.path.expanduser(a.data)); y = data / "dataset" / "ball.yaml"
    if not y.exists(): cmd_dataset(a)
    m = YOLO(a.base)
    m.train(data=str(y), imgsz=a.imgsz, epochs=a.epochs, batch=a.batch, patience=25, project=str(data / "runs"), name="ball", exist_ok=True,
            single_cls=True, workers=a.workers,
            # lopta je mala i brza: bez jakog smanjivanja, s malo zamućenja i boja zbog različitih dvorana
            scale=0.3, mosaic=1.0, close_mosaic=10, fliplr=0.5, hsv_h=0.02, hsv_s=0.5, hsv_v=0.4, degrees=0, translate=0.1)
    print("najbolji model:", data / "runs" / "ball" / "weights" / "best.pt")

def detect(model, path, imgsz, cls, conf):
    r = model.predict(str(path), imgsz=imgsz, classes=cls, conf=conf, verbose=False)[0]
    if not len(r.boxes): return None
    k = int(r.boxes.conf.argmax()); x, y, w, h = r.boxes.xywh[k].tolist()
    return x, y, float(r.boxes.conf[k])

def cmd_eval(a):
    from ultralytics import YOLO
    data = Path(os.path.expanduser(a.data)); lab = load(data)
    sp = data / "dataset" / "split.json"
    val = a.val or (json.load(open(sp))["val"] if sp.exists() else None)
    if not val: sys.exit("Nije poznato koje su utakmice validacijske; pokreni prvo 'dataset' ili zadaj --val.")
    items = [(n, v) for n, v in lab.items() if match_of(n) in val]
    models = [("COCO (početni)", YOLO("yolo11s.pt"), [32])]
    if a.model: models.append(("novi model", YOLO(os.path.expanduser(a.model)), None))
    thr = [0.1, 0.25, 0.4, 0.55, 0.7]
    print(f"{len(items)} okvira iz: {', '.join(val)}  ({sum(isinstance(v, list) for _, v in items)} s loptom)")
    for name, m, cls in models:
        res = [(v, detect(m, data / "frames" / n, a.imgsz, cls, 0.05)) for n, v in items]
        print(f"\n{name}")
        print("  prag  odaziv  lažni alarm")
        for t in thr:
            hit = tot = fa = neg = 0
            for v, d in res:
                d = d if d and d[2] >= t else None
                if isinstance(v, list):
                    tot += 1
                    if d and ((d[0] - v[0]) ** 2 + (d[1] - v[1]) ** 2) ** 0.5 <= max(8, v[2]): hit += 1
                else:
                    neg += 1; fa += bool(d)
            print(f"  {t:.2f}  {hit / max(tot, 1):6.0%}  {fa / max(neg, 1):10.0%}")

def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("dataset", "train", "eval"):
        p = sub.add_parser(c); p.add_argument("--data", default=str(Path.home() / "futsal-ball")); p.add_argument("--val", nargs="*")
        p.add_argument("--imgsz", type=int, default=1280)
        if c == "train":
            p.add_argument("--base", default="yolo11s.pt"); p.add_argument("--epochs", type=int, default=120)
            p.add_argument("--batch", type=int, default=4, help="RTX 2060 (6 GB) s imgsz 1280: 4; RTX 4060 (8 GB): 6-8")
            p.add_argument("--workers", type=int, default=4)
        if c == "eval": p.add_argument("--model")
    a = ap.parse_args()
    {"dataset": cmd_dataset, "train": cmd_train, "eval": cmd_eval}[a.cmd](a)

if __name__ == "__main__":
    main()
