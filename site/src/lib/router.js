// Hash router (#/liga/1-hmnl/2026-27) — radi na statičkom hostingu bez servera.
import { useEffect, useState } from "react";

const parse = () => {
  const s = (location.hash || "").replace(/^#\/?/, "");
  return s ? s.split("/").map(decodeURIComponent) : [];
};
export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const f = () => { setR(parse()); window.scrollTo(0, 0); };
    addEventListener("hashchange", f); return () => removeEventListener("hashchange", f);
  }, []);
  return r;
}
export const href = (...seg) => "#/" + seg.filter((x) => x != null && x !== "").map(encodeURIComponent).join("/");
export const go = (...seg) => { location.hash = href(...seg).slice(1); };
