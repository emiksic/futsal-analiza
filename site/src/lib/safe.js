// Obrana od ubacivanja koda kroz podatke iz baze (npr. ako netko dođe do admin računa).
// Linkovi: samo https:// (ili relativni za vlastite datoteke), nikad javascript:, data: i sl.
export function safeUrl(u, { relative = false } = {}) {
  if (typeof u !== "string") return null;
  const s = u.trim(); if (!s) return null;
  if (relative && /^(?!\/\/)[\w./-]+$/.test(s) && !s.includes("..")) return s;
  try { const x = new URL(s); return x.protocol === "https:" ? x.href : null; } catch { return null; }
}
// samo pravi YouTube linkovi
export function safeYouTube(u) {
  const s = safeUrl(u); if (!s) return null;
  const h = new URL(s).hostname.replace(/^www\.|^m\./, "");
  return ["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(h) ? s : null;
}
// tekst za umetanje u HTML string
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// boja iz podataka: samo #rgb / #rrggbb
export const safeColor = (c, d = "#888888") => (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c || "") ? c : d);
