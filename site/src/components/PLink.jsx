// Ime igrača kao poveznica na njegovu stranicu (#/igrac/:id).
// Stranice igrača postoje samo za seniore; za mlađe kategorije ime ostaje običan tekst.
import { href } from "../lib/router.js";
import { useStore } from "../lib/store.js";

// Poveznice na stranice igrača (javno od 17. 11. 2026.); false = vidi samo admin.
export const PLAYERS_PUBLIC = true;
export const PLAYER_CATS = ["Seniori"];
export const hasPlayerPage = (p) => !!p && PLAYER_CATS.includes(p.cat) && !!(p.name || "").trim();

export function usePlayerHref() {
  const adm = useStore().isAdmin;
  return (p) => ((PLAYERS_PUBLIC || adm) && hasPlayerPage(p) ? href("igrac", p.id) : null);
}

export function PLink({ p, children, className = "plink" }) {
  const h = usePlayerHref()(p);
  return h ? <a className={className} href={h} onClick={(e) => e.stopPropagation()}>{children}</a> : <>{children}</>;
}
