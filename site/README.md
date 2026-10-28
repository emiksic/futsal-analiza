# Stranica (frontend)

Javni dio (lige, tablice, utakmice, video analize) i admin (utakmice, zapisnici, događaji, klubovi, lige, dvorane).
Vite + React, hash routing (`#/liga/1-hmnl/2026-27`), pa radi na bilo kojem statičkom hostingu (Cloudflare Pages).

```bash
cd site
npm install
npm run dev          # lokalno na http://localhost:5173
npm run build        # dist/ za Cloudflare Pages
npm run build:single # jedna HTML datoteka (pregled)
```

- Podaci: `src/lib/seed.js` (primjeri) + izmjene iz admina u `localStorage` (`src/lib/store.js`).
  Kad dođe Supabase, mijenja se samo `store.js`.
- Video analize: `public/media/*.json` (izlaz `export_web.py`) + čisti video (`*.mp4`, nije u gitu).
- Admin → Utakmica → Video analiza daje JSON postavki za `analyze.py`.
