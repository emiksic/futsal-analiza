// #/izrada/<natjecanje>/<kolo>/<raspored|rezultati>/<dark|light>
// Javna stranica bez sučelja: nacrta slike objave iz baze i izloži ih skripti (scripts/objava.py) kroz window.__objava.
// Ne objavljuje ništa sama; objavu radi skripta s tajnim ključem.
import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store.js";
import { buildPost, drawPage, loadFonts, W, H } from "../lib/igPost.js";

export function Render({ db, ix, comp, round, mode = "raspored", theme = "dark" }) {
  const st = useStore(), box = useRef(null), [msg, setMsg] = useState("Učitavam…");
  useEffect(() => {
    if (st.status === "loading") return;
    if (st.status !== "ready") { window.__objava = { ready: true, error: "Baza nije dostupna (" + st.status + ")." }; setMsg(window.__objava.error); return; }
    (async () => {
      try {
        if (!ix.comp[comp]) throw new Error("Nepoznato natjecanje: " + comp);
        await loadFonts();
        const post = buildPost(db, ix, comp, +round, mode === "rezultati" ? "rezultati" : "raspored");
        const ms = db.matches.filter((m) => m.comp === comp && m.round === +round);
        const images = [];
        box.current.innerHTML = "";
        post.slides.forEach((_, i) => {
          const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.style.width = "270px";
          drawPage(cv.getContext("2d"), post, i, theme === "light" ? "light" : "dark");
          box.current.append(cv); images.push(cv.toDataURL("image/png"));
        });
        window.__objava = {
          ready: true, comp, round: +round, kind: post.res ? "rezultati" : "raspored", caption: post.caption, images,
          matches: ms.length, timed: ms.filter((m) => !m.timeTbd).length, finished: ms.filter((m) => m.status === "finished").length,
        };
        setMsg(`${images.length} slika spremno.`);
      } catch (e) { window.__objava = { ready: true, error: e.message }; setMsg(e.message); }
    })();
  }, [st.status, db, comp, round, mode, theme]);
  return <div className="page"><div className="small muted" id="izrada-status">{msg}</div><div ref={box} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }} /></div>;
}
