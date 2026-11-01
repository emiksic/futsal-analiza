import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Content-Security-Policy za objavljenu stranicu: skripte samo s vlastite domene i YouTubea, podaci samo iz naše baze.
// (GitHub Pages ne dopušta HTTP zaglavlja, pa ide kao <meta>; frame-ancestors tamo ne radi, zato admin sam odbija okvir.)
const SB = "https://bidsjhztvkbcynawcknp.supabase.co";
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.ytimg.com",
  `connect-src 'self' ${SB} ${SB.replace("https", "wss")}`,
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  `media-src 'self' blob: ${SB} https:`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const csp = () => ({ name: "csp", transformIndexHtml: (html) => html.replace(/(<meta charset="utf-8">)/, `$1\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">\n  <meta name="referrer" content="strict-origin-when-cross-origin">`) });

// "single" = sve u jednu HTML datoteku (pregled), inače normalan build za GitHub Pages
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "single" ? [viteSingleFile()] : [csp()])],
  build: { outDir: mode === "single" ? "dist-single" : "dist" },
}));
