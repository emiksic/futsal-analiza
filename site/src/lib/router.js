// Hash router (#/liga/1-hmnl/2026-27) — radi na statičkom hostingu bez servera.
// Kod povratka (natrag/naprijed u pregledniku) vraća se i položaj na stranici; nova stranica kreće od vrha.
import { useEffect, useState } from "react";

const parse = () => {
  const s = (location.hash || "").replace(/^#\/?/, "");
  return s ? s.split("/").map(decodeURIComponent) : [];
};
const SK = "scroll-pos";
const load = () => { try { return JSON.parse(sessionStorage.getItem(SK) || "{}"); } catch { return {}; } };
const save = (o) => { try { sessionStorage.setItem(SK, JSON.stringify(o)); } catch { /* */ } };
const key = () => history.state?.k;
function mark() { if (!key()) history.replaceState({ ...(history.state || {}), k: Math.random().toString(36).slice(2) }, ""); }
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
mark();
let last = key();
// položaj tekuće stranice spremamo dok se skrola, jer u trenutku hashchange-a je već kasno
addEventListener("scroll", () => { const o = load(); o[last] = scrollY; save(o); }, { passive: true });

// Čuvar odlaska: funkcija (nova ruta) → true ako se smije otići. Ako odbije, adresa se vraća na staru stranicu.
let guard = null, lastHash = location.hash;
export function setLeaveGuard(fn) { guard = fn; return () => { if (guard === fn) guard = null; }; }

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const f = () => {
      if (guard && location.hash !== lastHash && !guard(parse())) {
        history.replaceState(history.state, "", lastHash || "#/");   // ostani gdje si bio
        return;
      }
      lastHash = location.hash;
      const back = !!key();          // unos u povijesti koji smo već vidjeli → natrag/naprijed
      mark(); last = key();
      setR(parse());
      const y = back ? load()[last] : 0;
      // pričekaj da React iscrta stranicu pa skrolaj
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y || 0)));
    };
    addEventListener("hashchange", f); return () => removeEventListener("hashchange", f);
  }, []);
  return r;
}
export const href = (...seg) => "#/" + seg.filter((x) => x != null && x !== "").map(encodeURIComponent).join("/");
export const go = (...seg) => { location.hash = href(...seg).slice(1); };
// Promjena bez novog unosa u povijesti (kartice, kola): "natrag" vodi na stranicu prije, ne na prethodnu karticu
export function replace(h) {
  if (h === location.hash) return;
  history.replaceState(history.state, "", h);
  dispatchEvent(new HashChangeEvent("hashchange"));
}
export const replaceGo = (...seg) => replace(href(...seg));
export function replaceClick(e) {
  if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // nova kartica preglednika i sl.
  e.preventDefault(); replace(e.currentTarget.getAttribute("href"));
}
