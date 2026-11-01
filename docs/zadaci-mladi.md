# Zakazani zadaci: juniori i kadeti (satnica, sastavi, YouTube)

Upute za Claudeove zakazane zadatke. Mijenjaj ovu datoteku, ne zadatke.

- **A. Dnevna provjera satnice** (svaki dan ujutro): točna vremena utakmica sa Semafora → baza, a za svaku utakmicu jednokratni zadatak 45 min prije početka.
- **B. Prije utakmice** (jednokratni, 45 min prije): sastavi sa Semafora i YouTube link → baza.

## Zajedničko

**Gdje se radi.** Zadaci se pokreću u oblaku, ali sve što dira Semafor i bazu radi se na Erikovom laptopu (alat `device_bash`):
- Semafor (`semafor.hns.family`) iz oblaka nije dostupan. Na laptopu probaj `curl`; ako ne ide, koristi ugrađeni preglednik Claude aplikacije (stranica je dopuštena).
- Secret ključ baze ostaje na laptopu i nikad ne ide u oblak, u izlaz ni u git. Pozivi prema bazi idu `curl`om s laptopa.

**Repo na laptopu.** Mapa čiji je `git remote` `emiksic/futsal-analiza` i koja u korijenu ima `.env` sa `SUPABASE_SECRET_KEY`. URL baze je u `site/src/lib/config.js` (`SUPABASE_URL`). U toj mapi ništa ne commitaj i ne mijenjaj (Erik ondje radi). Ako repo ili ključ ne postoje, javi Eriku i stani.

**Baza (Supabase REST, secret ključ zaobilazi RLS).** Zaglavlja: `apikey: <ključ>` i `Authorization: Bearer <ključ>`.
- Utakmica: `PATCH /rest/v1/matches?id=eq.<id>` s JSON-om samo promijenjenih stupaca.
- Igrači: `POST /rest/v1/players` uz `Prefer: resolution=merge-duplicates`.
- Prije upisa uvijek pročitaj red (`GET /rest/v1/matches?id=eq.<id>&select=*`). Nikad ne pregazi rezultat, događaje ni sastav koji su već upisani ručno ili sa Semafora (`source` postoji i `roster` nije prazan), osim ako se Semafor razlikuje. Tada upiši Semafor i navedi razliku u obavijesti.

**Natjecanja i utakmice.**
- Lige: `juniori-2026-27` (kategorija `U-19`) i `kadeti-2026-27` (`U-17`). Raspored je u `data/juniori-2026-27/schedule.txt` i `data/kadeti-2026-27/schedule.txt` (kolo|datum vrijeme|domaćin|gost|rezultat|dvorana|prijenos). Datum bez vremena znači da satnica još nije objavljena.
- ID utakmice: `<liga>-k<kolo>-<domaćin>-<gost>`, npr. `juniori-2026-27-k4-futsal-dinamo-torcida`.
- ID-jevi klubova: `CLUB` u `data/build.py` (ime na Semaforu bez "MNK ", "HMNK ", "AMNK ").
- Natjecanja na Semaforu nađi preko stranice kluba, npr. `https://semafor.hns.family/klubovi/175217/hmnk-rijeka/` (odabir natjecanja ima `?cid=` za "Futsal 1. HMNL Juniori 26/27" i Kadeti), ili preko poznate utakmice juniora (npr. `https://semafor.hns.family/utakmice/116552146/`). Pronađene ID-jeve zapiši na dno ove datoteke (u oblaku, vidi "Git"), da ih sljedeći put ne tražiš.

**Git (u oblaku, ne na laptopu).** Kloniraj `emiksic/futsal-analiza` i mijenjaj samo `data/juniori-2026-27/schedule.txt`, `data/kadeti-2026-27/schedule.txt`, `site/src/data/juniori-2026-27.json`, `site/src/data/kadeti-2026-27.json` i ovu datoteku. JSON mijenjaj izravno (polja `date`, `timeTbd`, `youtube`). **Nikad ne pokreći `data/build.py` za juniore ili kadete u oblaku**: bez privatnih podataka obrisao bi sastave iz JSON-a. U JSON i u git nikad ne idu puna imena mladih igrača. Commit autor: `emiksic <erikmiksic@gmail.com>`, push na `main`.

**Obavijest.** Na kraju pošalji kratku obavijest (SendUserMessage): što je upisano, što nedostaje i razlike. Ako nije bilo promjena, jedna rečenica.

## A. Dnevna provjera satnice

1. Na Semaforu pročitaj raspored juniora i kadeta za sljedećih 8 dana (datum, vrijeme, domaćin, gost, dvorana).
2. Za svaku utakmicu kojoj se vrijeme ili datum razlikuje od baze upiši `date` (ISO s pomakom za Europe/Zagreb) i `time_tbd: false`. Isto ažuriraj u `schedule.txt` i JSON-u u gitu.
3. Pogledaj postojeće zakazane zadatke (`list_triggers`). Za svaku utakmicu s poznatim vremenom koja počinje za više od 50 minuta i nema svoj zadatak napravi jednokratni zadatak (`create_trigger` s `run_once_at` = početak − 45 min, `requires_local_device: true`, obavijest na mobitel):
   - ime: `Prije utakmice: <id utakmice>`
   - prompt: `Pokreni dio B iz docs/zadaci-mladi.md (repo emiksic/futsal-analiza) za utakmicu <id utakmice>, Semafor <link utakmice>, početak <datum i vrijeme>.`
   - Ako se utakmici promijenilo vrijeme, a zadatak već postoji, pomakni ga (`update_trigger`).
   - Ako utakmica počinje za manje od 50 minuta, odmah odradi dio B.
4. Obavijest: koliko je vremena upisano i koliko zadataka zakazano.

## B. Prije utakmice

1. Pročitaj zapisnik utakmice na Semaforu: oba sastava (broj, puno ime, vratar, početna petorka ili pričuva).
2. Upiši sastave:
   - Igrači: red za svakog igrača `{id, club, season: "2026-27", cat, num, name, gk}`. ID je kao `player_id` u `data/build.py`: `<klub>-2026-27-<cat>-p` + prvih 8 znakova sha1 od `"<klub>|<slug(ime)>"` (`slug` iz `build.py`). Puno ime ide samo u tablicu `players`.
   - Utakmica: `roster = {"home": {"players": [...], "start": [...], "gk": [...], "num": {id: broj}}, "away": {...}}` i `source: "HNS Semafor"`.
3. Nađi YouTube prijenos: `yt-dlp --flat-playlist --print "%(id)s %(title)s" "ytsearch15:<domaćin> <gost> juniori"` (ili kadeti) na laptopu i stranice "Live/Streams" kanala klubova. Uzmi samo prijenos za koji naslov ili opis jasno pokazuje baš ovu utakmicu (oba kluba, kategorija, datum). Upiši `youtube: "https://www.youtube.com/watch?v=<id>"` (i makni `tv`), te isto u `schedule.txt` (`yt:<id>`) i JSON u gitu. Kanale na kojima si našao prijenos zapiši na dno ove datoteke.
4. Ako sastava ili linka još nema, napravi **jedan** novi jednokratni zadatak 10 min nakon početka s istim promptom i dodatkom "(ponovni pokušaj)". U ponovnom pokušaju više ne zakazuj ništa.
5. Obavijest: sastavi upisani da/ne, YouTube link ili "nije pronađen".

## Zapisano tijekom rada

<!-- ID-jevi natjecanja na Semaforu i YouTube kanali klubova -->
