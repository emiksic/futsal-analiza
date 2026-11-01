# Zakazani zadaci: satnica, YouTube i rezultati (sva natjecanja)

Upute za Claudeove zakazane zadatke. Ponašanje se mijenja ovdje, ne u zadacima.

Postoje tri vrste zadataka:

| Zadatak | Kad | Što radi |
|---|---|---|
| **A. Dnevna provjera** | svaki dan 12:35, ponavlja se | satnica za idućih 8 dana → baza i git; zakazuje B i C za svaku utakmicu |
| **B. Prije utakmice** | jednokratni, početak − 45 min | YouTube prijenos → baza i git |
| **C. Nakon utakmice** | jednokratni, početak + 2 h | rezultat, sastavi, strijelci, kartoni, kazneni udarci sa Semafora → baza i git; provjera YouTube linka |

Sastavi se prije utakmice vide samo u mobilnoj aplikaciji Semafora, pa ih zadatak C uzima s weba nakon utakmice. Analiza videa ionako radi nakon utakmice, pa je to dovoljno.

---

## 1. Okruženje

### 1.1 Server
Svi zadaci rade na Erikovom serveru (Windows 10) preko alata `device_bash` (Git Bash). Iz oblaka nisu dostupni ni Semafor ni secret ključ baze.
- Ako `device_bash` ne odgovara: jedna obavijest „Server nije dostupan, zadatak <ime> nije odrađen.” i kraj. Jednokratni zadatak se ne zakazuje ponovno.
- Ključ (`SUPABASE_SECRET_KEY`) nikad ne ispisuj, ne kopiraj u oblak i ne stavljaj u git. Koristi ga samo unutar naredbe na serveru (npr. `source .env`).

### 1.2 Repo na serveru
- Putanja: `C:\futsal-analiza`, u Git Bashu `/c/futsal-analiza`. To je klon samo za zadatke; Erik u njemu ne radi.
- `.env` u korijenu: `SUPABASE_SECRET_KEY=sb_secret_...`. URL baze je `SUPABASE_URL` u `site/src/lib/config.js`.
- `data/private/semafor-2026-27.txt`: puna imena mladih igrača (nije u gitu, vidi 4.3).
- Na početku svakog zadatka: `git pull --rebase`. Ako ne prođe, obavijest i kraj.
- Ako repo, `.env` ili privatna datoteka nedostaju: obavijest što fali i kraj.

### 1.3 Alati na serveru
`git`, `python` (3.11+), `yt-dlp`, `curl`. Ako nešto nedostaje: obavijest i kraj (ne instaliraj sam).

---

## 2. Natjecanja

| Natjecanje | ID kod nas | Mapa u `data/` | Kategorija | Semafor ID | Faze |
|---|---|---|---|---|---|
| 1. HMNL (SuperSport HMNL) | `1-hmnl-2026-27` | `hmnl-2026-27` | `Seniori` | `115835988` | kola 1–18 |
| Hrvatski kup | `kup-2026-27` | `kup-2026-27` | `Seniori` | `120095680` | 1 = 1/16, 2 = 1/8, 3 = ČF, 4 = PF, 5 = finale |
| 1. HMNL juniori | `juniori-2026-27` | `juniori-2026-27` | `U-19` | *(pronađi, vidi 2.1)* | kola 1–22 |
| 1. HMNL kadeti | `kadeti-2026-27` | `kadeti-2026-27` | `U-17` | *(pronađi, vidi 2.1)* | kola 1–22 |

Raspored natjecanja: `https://semafor.hns.family/natjecanja/<Semafor ID>/x/detaljno/`.

### 2.1 Kako pronaći Semafor ID
Otvori zapisnik bilo koje utakmice tog natjecanja (npr. juniori `https://semafor.hns.family/utakmice/116552146/`). Naslov `.competition-title` daje ime natjecanja. ID je u poveznici na natjecanje, ili u padajućem izborniku natjecanja na stranici kluba (`/klubovi/175217/hmnk-rijeka/`, filter uzrasta „Juniors”/„Cadets”, opcije imaju `?cid=<ID>`). Pronađeni ID upiši u gornju tablicu (commit, vidi 5).

### 2.2 ID-jevi
- Utakmica: `<natjecanje>-k<kolo>-<domaćin>-<gost>`, npr. `kup-2026-27-k2-rijeka-torcida`.
- Klub: `CLUB` u `data/build.py` (ime sa Semafora bez „MNK ”, „HMNK ”, „AMNK ”) i `clubs` u `site/src/lib/seed.js`. Za klub kojeg nema napravi ID kao `slug(ime)` (npr. „Lika šport” → `lika-sport`).
- Igrač: kao `player_id` u `data/build.py`. Seniori i kup: `<klub>-2026-27-Seniori-<slug(ime)>`. Mladi: `<klub>-2026-27-<U-19|U-17>-p` + prvih 8 znakova sha1 od `"<klub>|<slug(ime)>"`.
- Dvorana: `halls` u `seed.js`. Novu dvoranu dodaj kao `slug(ime)` s imenom i gradom sa Semafora.

---

## 3. Semafor (čitanje)

Na serveru: `curl -sL --compressed -A "Mozilla/5.0" <url>`, pa HTML parsiraj Pythonom. Između zahtjeva čekaj najmanje 2 s. Ako Semafor ne odgovara ili vraća grešku: jedan ponovni pokušaj nakon 1 min, zatim obavijest i kraj.

### 3.1 Raspored natjecanja (`/natjecanja/<ID>/x/detaljno/`)
- Faza: `li.header[data-round]` (tekst „4. kolo”, „1/8 finala”…). Utakmice te faze: `li.row[data-round=<isti>][data-match=<Semafor ID utakmice>]`.
- Unutar retka: `.date` („07.11.2026. 18:00”, ili samo „07.11.2026.” kad satnica nije objavljena), `.club1`, `.club2`, `.resRegular` („3:3” ili „-:-”), `.resPen` („(3:4 - 11m)”), `.facility` („Dvorana, Grad”), poveznica na zapisnik `a[href*="/utakmice/"]`.

### 3.2 Zapisnik utakmice (`/utakmice/<ID>/`)
- `.status`: „Završeno” znači da je gotova. Bilo što drugo znači da nije.
- `.res1`, `.res2`: konačni rezultat. `.additional_status.pen`: kazneni udarci „(3:4 - 11m)”.
- Golovi: `.events_main > ul.events`. Prvi `ul` je domaćin, drugi gost. Svaki `li` ima `.playerName` i `.event` s klasom `goal`, `own_goal` (autogol: igrač je iz te ekipe, gol ide protivniku), `six_meters`/`ten_meters`/`penalty` (gol iz kaznenog udarca) i vremenom „8'37"” ili „13'”.
- Kazneni udarci: `.events_penalties > ul.events` (prvi `ul` domaćin). Klasa `penalty_goal` je pogodak, `penalty_saved`/`penalty_failed` promašaj, a redoslijed je redoslijed izvođenja.
- Sastavi: `.homeTeam` i `.awayTeam`, redovi `li.row.match_lineup` (preskoči `li.row.empty`). Iz retka uzmi broj (`.shirtNumber`), ime (`.playerName a`) i vratara („Vratar” u `.playerName`). Retci prije zaglavlja „Pričuvni igrači” su početna petorka, a redove nakon zaglavlja „Trener” preskoči. Kartoni su u `.matchEvents li` s klasom `yellow`, `yellow_red`/`second_yellow` ili `red` i vremenom.

### 3.3 Pretvorba vremena
Kao `to_ev` u `data/build.py`: „M'S"” daje `sec = M*60 + S` i `exact: true`, a „M'” daje `sec = (M-1)*60 + 30`. Poluvrijeme je 20 min (`period` 1 ili 2, `sec` od početka poluvremena). Vrijeme > 40:00 su produžeci (`period` 3). Kazneni udarci nakon utakmice: `period` 4.

Datum u bazi: ISO s pomakom za Europe/Zagreb (`+01:00` zimi, `+02:00` ljeti), npr. `2026-11-07T18:00:00+01:00`.

---

## 4. Upis

### 4.1 Baza (Supabase REST)
Zaglavlja: `apikey: $KEY`, `Authorization: Bearer $KEY`, `Content-Type: application/json`.
- Čitanje: `GET /rest/v1/matches?id=eq.<id>&select=*`.
- Izmjena utakmice: `PATCH /rest/v1/matches?id=eq.<id>` sa samo promijenjenim stupcima.
- Nova utakmica (nova faza kupa): `POST /rest/v1/matches`.
- Igrači, klubovi, dvorane: `POST /rest/v1/<tablica>` uz `Prefer: resolution=merge-duplicates`.
- Stupci utakmice: `date`, `time_tbd`, `hall`, `status` (`scheduled`|`finished`), `result` (`[d, g]` samo kad zbroj golova u `events` ne odgovara rezultatu), `youtube`, `tv`, `source` (`"HNS Semafor"`), `roster`, `events`.
- `roster`: `{"home": {"players": [id…], "start": [id…], "gk": [id…]}, "away": {…}}`. Za mlade se dodaje i `"num": {id: "broj"}`.
- `events`: golovi `{id: "<mid>-g<i>", type: "goal"|"owngoal", side, player, period, sec, exact?, pen?}` (kod autogola `side` je ekipa igrača). Kartoni `{id: "<mid>-c<i>", type: "yellow"|"red", side, player, period, sec, secondYellow?}`. Kazneni udarci `{id: "<mid>-so<i>", type: "so", side, player, scored, period: 4, sec: redni broj}`. Sortiraj po `period`, pa po `sec`.
- **Ne briši tuđe podatke.** Prije izmjene pročitaj red. Događaje koje nije dao Semafor (npr. `shot`, `foul`, `timeout`, `assist` iz analize ili admina) zadrži i samo im dodaj događaje sa Semafora. Polje `analysis` nikad ne diraj. Ako je u bazi već drugačiji rezultat ili sastav, upiši Semafor i navedi razliku u obavijesti.

### 4.2 Git (repo na serveru)
Baza je glavna, a git je kopija iz koje se gradi stranica i početni podaci.
- `data/<mapa>/schedule.txt`: redak `kolo|dd.mm.yyyy hh:mm|domaćin|gost|rezultat|dvorana|prijenos`. Rezultat s kaznenim udarcima je `3:3 (3:4)`, a prijenos je `yt:<id>` ili `tv:MAXsport`.
- Seniori i kup: zapisnik u `data/<mapa>/k<kolo>-<domaćin>-<gost>.txt`, pa `python data/build.py <mapa> <natjecanje> Seniori`. Format (kao `data/kup-2026-27/k1-split-kijevo.txt`):
  ```
  # HNS Semafor <ID utakmice>
  HOME_PLAYERS
  broj|Ime Prezime|GK ili -|S (petorka) ili B (pričuva)
  AWAY_PLAYERS
  …
  GOALS
  8'37"|Ime Prezime|- (gol), AG (autogol) ili P (kazneni udarac)
  CARDS
  26'45"|Ime Prezime|home ili away|y, yy (drugi žuti) ili r
  SHOOTOUT
  home ili away|Ime Prezime|G (pogodak) ili X (promašaj)
  ```
  Golovi idu kronološki, a kazneni udarci redom izvođenja. Sekcije `CARDS` i `SHOOTOUT` pišu se samo kad postoje.
- Mladi: zapisnik ide u privatnu datoteku (4.3), pa `python data/build.py <mapa> <natjecanje> <U-19|U-17>`. Javni JSON tada dobije samo brojeve i ID-jeve.
- Novi klub ili dvorana: dodaj ih i u `site/src/lib/seed.js` (klub sa sivim dresom, kao ostali iz kupa) te u `CLUB` u `build.py`. Zatim povećaj `SEED_VERSION` za 1.
- Nakon `build.py` provjeri ispis: redak s „!” (golovi ne odgovaraju rezultatu, igrač nije u postavi…) ide u obavijest.
- Commit kao `emiksic <erikmiksic@gmail.com>`, poruka npr. „Semafor: juniori 4. kolo, 2 rezultata”, pa `git push`. Ako push ne prođe: `git pull --rebase` i još jedan pokušaj, zatim obavijest.

### 4.3 Privatna datoteka (mladi)
`data/private/semafor-2026-27.txt` (nikad u git). Jedan blok po utakmici, u formatu koji čita `load_private` u `build.py`:
```
=== J 116552146 HMNK Rijeka - MNK Novo vrijeme 5:1
HOME_PLAYERS
7|Ime Prezime|GK|S #y@12'30"
9|Ime Prezime|-|B
…
AWAY_PLAYERS
…
GOALS
15'|Ime Prezime|goal|col0
21'24"|Ime Prezime|AG|col1
```
- Zaglavlje: `J` su juniori, a `K` kadeti, zatim Semafor ID utakmice, puna imena klubova sa Semafora i rezultat.
- Igrač: `broj|ime|GK ili -|S ili B`, a iza ` #` kartoni odvojeni zarezom (`y@vrijeme`, `yy@vrijeme`, `r@vrijeme`).
- Gol: `vrijeme|ime|vrsta|col0 ili col1`. Vrsta je `goal`, `AG` za autogol, ili klasa sa Semafora za kazneni (`ten_meters`, `six_meters`). `col0`/`col1` je stupac na Semaforu (domaćin/gost) u kojem je gol prikazan.
- Ako blok za tu utakmicu već postoji, zamijeni ga.

---

## 5. Zadatak A: dnevna provjera (12:35)

1. Okruženje (1.1–1.3), `git pull --rebase`.
2. Za svako natjecanje iz tablice 2 pročitaj raspored (3.1). Uzmi utakmice od danas do danas + 8 dana, te one iz prošlosti koje su na Semaforu „Završeno”, a u bazi još `scheduled` (propušteni C).
3. Za svaku utakmicu:
   - Nema je u bazi (nova faza kupa): dodaj je u bazu i u `schedule.txt`, s novim klubovima i dvoranama ako treba.
   - Datum, vrijeme ili dvorana razlikuju se od baze: ažuriraj bazu i `schedule.txt`. Kad je vrijeme poznato, postavi `time_tbd: false`.
   - Na Semaforu je „Završeno”, a u bazi nije: odmah odradi C za nju.
4. Zakazani zadaci (`list_triggers`), za svaku utakmicu s poznatim vremenom koja još nije počela:
   - **B** `Prije: <id>`: `run_once_at` = početak − 45 min. Ako je do početka manje od 50 min, B odradi odmah.
   - **C** `Nakon: <id>`: `run_once_at` = početak + 2 h.
   - Oba sa `requires_local_device: true` i obaviješću na mobitel. Prompt: `Odradi zadatak B (ili C) iz docs/zadaci.md (repo emiksic/futsal-analiza) za utakmicu <id>. Semafor: <link zapisnika>. Početak: <datum i vrijeme>.`
   - Ako zadatak već postoji, a vrijeme se promijenilo, pomakni ga (`update_trigger`). Utakmicu koje više nema na Semaforu, ili koja je odgođena bez novog datuma, vrati na `time_tbd: true` i ugasi njene zadatke (`update_trigger` s `enabled: false`).
5. Git commit i push (4.2), ako je išta promijenjeno.
6. Obavijest **samo ako se nešto promijenilo ili nije uspjelo**: koliko je vremena upisano, nove utakmice, zakazani zadaci (broj po natjecanju) i greške.

## 6. Zadatak B: prije utakmice (−45 min)

1. Okruženje, `git pull --rebase`. Pročitaj utakmicu iz baze. Ako `youtube` već postoji, kraj (bez obavijesti).
2. Nađi prijenos:
   - **1. HMNL i kup (seniori):** samo kanal `https://www.youtube.com/@HMNL-cro`.
     `yt-dlp --flat-playlist --playlist-end 15 --print "%(id)s|%(live_status)s|%(title)s" "https://www.youtube.com/@HMNL-cro/streams"`
     Uzmi prijenos u kojem naslov ima oba kluba (`live_status` je `is_upcoming` ili `is_live`).
   - **Juniori i kadeti:** YouTube pretraga s filtrom „Uživo”:
     `yt-dlp --flat-playlist --playlist-end 10 --print "%(id)s|%(live_status)s|%(channel)s|%(title)s" "https://www.youtube.com/results?search_query=<DOMAĆIN>+<GOST>+<juniori|kadeti>&sp=EgJAAQ%253D%253D"`
     Ako nema rezultata, ponovi bez `&sp=…` i bez kategorije. Za oba kluba koristi kratka imena („Rijeka”, „Olmissum”, „Futsal Dinamo”).
   - Prihvati samo prijenos koji je uživo ili najavljen i u čijem su naslovu oba kluba. Za mlade naslov mora sadržavati i kategoriju (juniori/U19 ili kadeti/U17), ili najava mora biti za današnji datum. Ako ima više kandidata ili nisi siguran, ne upisuj ništa i navedi kandidate u obavijesti.
3. Upiši `youtube: "https://www.youtube.com/watch?v=<id>"` i `tv: null` u bazu te `yt:<id>` u `schedule.txt`, pa commit i push.
4. Ako prijenos nije pronađen: ništa se ne zakazuje dodatno, C će još jednom potražiti.
5. Obavijest: link ili „prijenos nije pronađen”.

## 7. Zadatak C: nakon utakmice (+2 h)

1. Okruženje, `git pull --rebase`. Pročitaj zapisnik (3.2).
2. Ako status nije „Završeno”: ako ovo nije ponovni pokušaj, zakaži jednokratni `Nakon: <id> (ponovni pokušaj)` za 2 h, s istim promptom i dodatkom „(ponovni pokušaj)”. Ako jest, pošalji obavijest „Rezultat još nije na Semaforu” i kraj.
3. Upis (4.1, 4.2, 4.3):
   - igrači (seniori s imenom; mladi s imenom samo u bazi, u gitu kroz privatnu datoteku);
   - `roster`, `events` (golovi, kartoni, kazneni udarci), `status: "finished"`, `source: "HNS Semafor"`, a `result` samo ako treba (4.1);
   - `schedule.txt` (rezultat), zapisnik (seniori/kup: `.txt` u mapi, mladi: privatna datoteka), `build.py`, provjera ispisa.
4. Provjera: zbroj golova iz `events` (autogol ide protivniku) mora odgovarati rezultatu sa Semafora, a kod kaznenih udaraca pogoci moraju odgovarati „(x:y - 11m)”. Ako ne odgovaraju, svejedno upiši rezultat (`result`) i navedi razliku u obavijesti.
5. YouTube: ako `youtube` još nema, ponovi pretragu iz B (bez filtra „Uživo”, prijenos je sad snimka). Za 1. HMNL, ako ga nema ni na `@HMNL-cro`, upiši `tv: "MAXsport"`. Za kup i mlade bez prijenosa ostavi prazno.
6. Commit i push.
7. Obavijest: „<Domaćin> – <Gost> d:g (kazneni x:y)”, strijelci ukratko, YouTube da/ne, razlike i greške.

---

## Zapisano tijekom rada

<!-- Semafor ID-jevi, YouTube kanali klubova koji prenose mlade, posebnosti dvorana i klubova -->
