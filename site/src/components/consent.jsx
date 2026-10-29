// YouTube se učitava tek na klik (bez bannera za kolačiće na cijeloj stranici).
// Pristanak vrijedi do kraja posjete (sessionStorage); bez njega se ništa s YouTubea ne učitava.
import { useSyncExternalStore } from "react";

let ok = (() => { try { return sessionStorage.getItem("yt-ok") === "1"; } catch { return false; } })();
const subs = new Set();
export const useYTConsent = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => ok);
export const giveYTConsent = () => { ok = true; try { sessionStorage.setItem("yt-ok", "1"); } catch { /* */ } subs.forEach((f) => f()); };

export function YTGate({ youtube }) {
  return (
    <div className="ytgate">
      <svg width="54" height="38" viewBox="0 0 54 38" aria-hidden="true"><rect width="54" height="38" rx="10" fill="currentColor" opacity=".18" /><path d="M22 11v16l14-8Z" fill="currentColor" /></svg>
      <p>Snimka se prikazuje preko YouTubea. Kad je učitaš, YouTube može spremiti podatke na tvoj uređaj.</p>
      <div className="ytgate-act">
        <button className="btn primary" onClick={giveYTConsent}>Učitaj YouTube video</button>
        {youtube && <a className="btn ghost" href={youtube} target="_blank" rel="noreferrer">Otvori na YouTubeu</a>}
      </div>
      <a className="ytgate-more" href="#/privatnost">Više o privatnosti</a>
    </div>
  );
}
