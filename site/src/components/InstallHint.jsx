// Traka "Instaliraj aplikaciju" (PWA). Android/Chrome: gumb koji otvara sistemski prozor za instalaciju.
// iPhone/iPad (Safari): Apple ne dopušta gumb, pa samo uputa Dijeli → Dodaj na početni zaslon.
// Ne prikazuje se ako je stranica već otvorena kao instalirana aplikacija ili ako je korisnik traku zatvorio (30 dana).
import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";

// Zasad vidi samo admin (testiranje); kad je spremno za javnost, stavi na true.
const INSTALL_PUBLIC = false;
const OFF_KEY = "install-hint-off";
const OFF_DAYS = 30;

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const inApp = /FBAN|FBAV|Instagram|Line\/|TikTok/i.test(ua);           // ugrađeni preglednici (Instagram, Facebook…) ne mogu instalirati
const standalone = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
const dismissed = () => { try { return Date.now() - Number(localStorage.getItem(OFF_KEY) || 0) < OFF_DAYS * 864e5; } catch { return false; } };

const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Dijeli" style={{ verticalAlign: "-2px" }}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" /><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17" />
  </svg>);

export function InstallHint() {
  const adm = useStore().isAdmin;
  const [prompt, setPrompt] = useState(() => window.__installPrompt || null);
  const [off, setOff] = useState(() => dismissed() || standalone());

  useEffect(() => {
    const on = () => setPrompt(window.__installPrompt || null);
    const done = () => { setOff(true); window.__installPrompt = null; };
    window.addEventListener("installable", on);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("installable", on); window.removeEventListener("appinstalled", done); };
  }, []);

  if (!(INSTALL_PUBLIC || adm) || off) return null;
  const close = () => { try { localStorage.setItem(OFF_KEY, String(Date.now())); } catch { /* */ } setOff(true); };

  let body = null;
  if (isIOS && inApp) {
    body = <span>Za instalaciju otvori stranicu u Safariju (izbornik ⋯ → Otvori u pregledniku).</span>;
  } else if (isIOS) {
    body = <span>Instaliraj na iPhone: dodirni <ShareIcon /> <b>Dijeli</b>, pa <b>Dodaj na početni zaslon</b>.</span>;
  } else if (prompt) {
    body = <>
      <span>Instaliraj HMNL Statistiku na mobitel: brže otvaranje, bez adresne trake.</span>
      <button type="button" className="btn sm primary" onClick={async () => {
        prompt.prompt();
        const r = await prompt.userChoice.catch(() => null);
        window.__installPrompt = null; setPrompt(null);
        if (r?.outcome === "accepted") setOff(true);
      }}>Instaliraj</button>
    </>;
  }
  if (!body) return null;
  return (
    <div className="install-bar" role="region" aria-label="Instalacija aplikacije">
      <div>
        <img src="icon-192.png" width="28" height="28" alt="" />
        {body}
        <button type="button" className="install-x" onClick={close} aria-label="Zatvori">×</button>
      </div>
    </div>
  );
}
