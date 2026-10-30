# Futsal analiza

Automatska analiza snimki futsal utakmica (1. HMNL juniori/kadeti) s YouTube streamova:
igrači i ekipe, brojevi na dresu (uz zapisnik), golmani, lopta, posjed, postava „na terenu“,
mini-mapa terena i web preglednik sinkroniziran s videom.

> Status: radni prototip. Testirano na dva isječka iz dvije dvorane. Najslabija karika je
> detekcija lopte (sljedeći korak: vlastiti model).

## Struktura

```
scripts/            pipeline (Python), svaki korak je zasebna skripta
scripts/legacy/     stare verzije vezane uz prvu dvoranu (za referencu)
configs/rosters/    zapisnici: brojevi igrača po ekipi, golmani, početna postava
configs/matches/    match.json: ekipe, boje dresova, boja brojeva, strane golova
configs/halls/      profili dvorana (kalibracija terena)
web/                preglednik (index.html) + primjeri podataka u web/data/
```

Videi, modeli (`*.pt`) i međurezultati **nisu u gitu** (vidi `.gitignore`).

## Instalacija

```bash
python3 -m venv ~/futsal-cv && source ~/futsal-cv/bin/activate
pip install -r requirements.txt
# za GPU (RTX 2060): instaliraj torch s CUDA podrškom prema pytorch.org prije ostalog
```

PARSeq (čitanje brojeva) se automatski skida preko `torch.hub`. Bez interneta:
`git clone https://github.com/baudm/parseq` i `export PARSEQ_REPO=/putanja/do/parseq`.

## Pipeline (redoslijed koraka)

Primjer za jednu snimku `clip.mp4` u radnoj mapi `run/`:

| # | Korak | Skripta |
|---|-------|---------|
| 1 | detekcija + tracking igrača (15 fps) | `track.py clip.mp4 run --step 2 --conf 0.1 --tracker scripts/botsort_v2.yaml` |
| 2 | lanac pomaka kamere | `camera.py clip.mp4 run/tracks.json run/camera.json run/seg.json --start 0 --end 9999` |
| 3 | globalno poravnanje kamere (bez drifta) | `global_align.py clip.mp4 run/camera.json run/seg.json run/camera_global.json` |
| 4 | panorama terena | `mosaic.py clip.mp4 run/camera_global.json run/seg.json run/mosaic.png` |
| 5 | kalibracija terena (stative, središnja linija, lukovi 6 m) | `calib2.py clip.mp4 points.json run/camera_global.json run/seg.json run/mosaic_S.npy run/court.json --arcs ...` |
| 6 | sat na scoreboardu (gdje je, teče li) | `find_clock.py` → `clock_state.py --roi x1 y1 x2 y2` |
| 7 | ekipe po boji dresa → `match.json` | `team_cluster.py` → `team_fix.py --cfg` → `stitch.py --cfg` |
| 8 | golmani i osoblje | `gk_fix.py --cfg` → `staff_filter.py --cfg` |
| 9 | boja brojeva + čitanje brojeva uz zapisnik | `num_color.py` → `jersey_vote.py --roster` → `number_split.py` → `assign.py --roster` |
| 10 | postava na terenu | `lineup.py --cfg [--init "RIJ:4,26,44,77;NVR:7,9,11,14"]` |
| 11 | lopta | `ball_detect.py` → `ball_track.py` |
| 12 | izlaz | `render_full.py` (video s oznakama) i/ili `export_web.py` (podaci za preglednik) |

Svaka skripta ima opis i primjer poziva na vrhu datoteke.

## Zapisnik (roster)

`configs/rosters/*.json`, kratica ekipe mora odgovarati imenu u `match.json`:

```json
{"RIJ": {"name": "Rijeka", "gk": ["1", "12"], "players": ["1", "4", "7"], "start": ["1", "4", "7", "26", "44"]}}
```

## Poznata ograničenja

- lopta: standardni COCO model, 27–71 % frameova → treba vlastiti model
- izmjene: još nema detekcije zone izmjene (zasad se pretpostavlja stalna postava u isječku)
- profil dvorane je vezan uz referentni frame snimke; registracija novih snimki na spremljenu panoramu je TODO
- YouTube embed: pravila YouTubea ne dopuštaju crtanje preko playera → za YouTube samo panel pored videa

## Plan: očitavanje TV grafike (analyze.py za cijele utakmice)

Traka s rezultatom na SHMNL YouTube prijenosima (vjerojatno ista na svim utakmicama 1. HMNL):
`[poluvrijeme] P [sat] DOM r-r GOST`, a iznad kratica ekipa kvadratići akumuliranih prekršaja.

- sat i poluvrijeme: već postoji (`scripts/find_clock.py`, `clock_state.py`)
- rezultat: promjena = gol → događaj `goal` s točnom minutom i vremenom u videu (seek sa stranice)
- akumulirani prekršaji: kvadratići se pojavljuju jedan po jedan (0 prekršaja = nema kvadratića);
  broji se po svjetlini na fiksnim mjestima iznad kratice → svaki novi kvadratić = događaj `foul`
- grafika se podesi jednom (položaj trake) i vrijedi za sve prijenose iste produkcije
