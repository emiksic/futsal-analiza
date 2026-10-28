"""Prenesi kalibraciju terena iz starog referentnog framea u novo (globalno) poravnanje kamere.
Stara: teren = Hc_old @ S_old @ (frame u t_ref_old).  Nova: teren = H_new @ ref_new, H_new = Hc_old @ S_old @ G_new(t_ref_old)
python3 transfer_court.py old_court.json old_S.npy t_ref_old new_camera.json out_court.json out_S.npy
"""
import sys, json, numpy as np
oc, oS, tref, ncam, out_c, out_S = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5], sys.argv[6]
c = json.load(open(oc)); Hc = np.array(c["H_img_to_court"]); S = np.load(oS); cam = json.load(open(ncam))
times = [cam[0]["t"] - (cam[1]["t"] - cam[0]["t"])]; G = [np.eye(3)]
for e in cam: times.append(e["t"]); G.append(np.array(e["H"]) @ G[-1])
i = int(np.argmin(abs(np.array(times) - tref)))
print(f"referentni frame stare kalibracije: {tref}s -> najbliži u novom poravnanju {times[i]:.3f}s")
c["H_img_to_court"] = (Hc @ S @ G[i]).tolist()
json.dump(c, open(out_c, "w"), indent=1); np.save(out_S, np.eye(3))
