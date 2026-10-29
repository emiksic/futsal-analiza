// Obavijest pri prvom ulasku: neslužbena stranica, prava pripadaju vlasnicima. Pamti se po pregledniku.
import { useEffect, useRef, useState } from "react";
import { href } from "../lib/router.js";

const KEY = "notice-ack-v1";
const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };

export function Notice({ name }) {
  const [open, setOpen] = useState(() => !seen());
  const btn = useRef(null);
  useEffect(() => { if (open) { btn.current?.focus(); document.body.style.overflow = "hidden"; } return () => { document.body.style.overflow = ""; }; }, [open]);
  if (!open) return null;
  const ok = () => { try { localStorage.setItem(KEY, "1"); } catch { /* */ } setOpen(false); };
  return (
    <div className="notice-bg">
      <div className="notice" role="dialog" aria-modal="true" aria-labelledby="notice-t">
        <h2 id="notice-t">Neslužbena stranica</h2>
        <p><b>{name}</b> je neovisna stranica o hrvatskim futsal ligama. Nije povezana s Hrvatskim nogometnim savezom, ligom ni klubovima, i oni je nisu odobrili.</p>
        <ul>
          <li>Rezultati, rasporedi i postave preneseni su iz javnih izvora i mogu sadržavati greške. Službeni podaci objavljuju se na HNS Semaforu.</li>
          <li>Video prijenosi pripadaju klubovima i prijenosnicima i prikazuju se kroz originalni YouTube player. Nazivi i oznake klubova i lige vlasništvo su njihovih nositelja. Sva prava pridržana.</li>
          <li>Statistika iz video analize je automatska procjena i nije službena.</li>
        </ul>
        <div className="notice-act">
          <button ref={btn} className="btn primary" onClick={ok}>Razumijem</button>
          <a href={href("privatnost")} onClick={ok}>Privatnost i uklanjanje podataka</a>
        </div>
      </div>
    </div>
  );
}
