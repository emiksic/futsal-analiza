# Model za loptu

Postojeći COCO model loptu u futsalu nađe tek povremeno. Ovdje se trenira vlastiti model na okvirima iz naših snimki.
Videi, okviri i oznake ostaju na tvom računalu (zadano u `~/futsal-ball`) i ne idu u repo.

## 1. Priprema (jednom)

```
pip install yt-dlp ultralytics opencv-python
```
Treba i `ffmpeg` u PATH-u (Windows: `winget install ffmpeg`). Za trening na grafičkoj kartici treba PyTorch s CUDA podrškom
(upute na pytorch.org, npr. `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124`).

## 2. Izvlačenje okvira

```
python ball/extract_frames.py --per-match 250
```
Skine sve odigrane utakmice koje imaju YouTube prijenos (popis iz `site/src/data`) i iz svake izvuče 250 nasumičnih okvira.
Uz svaki okvir zapiše prijedlog gdje je lopta. Dodaj `--delete-video` ako ti ponestaje mjesta na disku.

## 3. Označavanje

Otvori `ball/label.html` u Chromeu ili Edgeu, klikni **Otvori mapu** i odaberi `futsal-ball`.

| tipka | značenje |
|---|---|
| klik | sredina lopte |
| Enter | žuti prijedlog je dobar |
| N | lopta se ne vidi (skrivena, izvan kadra) |
| S | nije igra: repriza, reklama, poluvrijeme |
| Z ili ← | natrag |
| [ ] | manji / veći okvir (promjer lopte) |

Oznake se same spremaju u `futsal-ball/labels.json`, pa možeš stati i nastaviti kad hoćeš.
Za ~3000 okvira računaj 2–3 sata, a prvi trening ima smisla već nakon 1000.

## 4. Trening

```
python ball/train_ball.py train
```
Dvije utakmice se odvoje za provjeru i model ih ne vidi u treningu. Na RTX 2060 je zadano `--batch 4`, na RTX 4060 može `--batch 8`.
Model se spremi u `futsal-ball/runs/ball/weights/best.pt`.

## 5. Provjera

```
python ball/train_ball.py eval --model ~/futsal-ball/runs/ball/weights/best.pt
```
Usporedi novi model s početnim na odvojenim utakmicama: koliko lopti nađe (odaziv) i koliko puta javi loptu kad je nema (lažni alarm).
Pošalji mi tu tablicu.

## 6. Drugi krug (preporučeno)

```
python ball/extract_frames.py --per-match 400 --model ~/futsal-ball/runs/ball/weights/best.pt
```
Doda nove okvire s prijedlozima novog modela, koji su puno bolji, pa je označavanje većinom samo Enter. Zatim ponovi trening.
