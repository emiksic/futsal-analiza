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

const Dots = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-label="⋯" style={{ verticalAlign: "-2px" }}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>);
const PlusBox = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ verticalAlign: "-2px" }}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>);

// Uputa za iPhone: Safari ne dopušta stranici da sama doda ikonu, pa pokažemo korake i strelicu prema donjoj traci Safarija.
function IOSSheet({ onClose }) {
  const [shareErr, setShareErr] = useState("");
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="ios-sheet-bg" onClick={onClose}>
      <div className="ios-sheet" role="dialog" aria-modal="true" aria-labelledby="ios-sheet-t" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-h">
          <img src="icon-192.png" width="40" height="40" alt="" />
          <div><b id="ios-sheet-t">Instaliraj HMNL Statistiku</b><span>Ikona na početnom zaslonu, otvara se bez adresne trake.</span></div>
          <button type="button" className="install-x" onClick={onClose} aria-label="Zatvori">×</button>
        </div>
        <ol>
          <li>U donjoj traci Safarija dodirni <ShareIcon /> <b>Dijeli</b> (ili prvo <Dots /> pa <b>Dijeli</b>).</li>
          <li>Skrolaj dolje i odaberi <PlusBox /> <b>Dodaj na početni zaslon</b>.</li>
          <li>Dodirni <b>Dodaj</b> u gornjem desnom kutu.</li>
        </ol>
        {navigator.share && (
          <button type="button" className="btn sm" onClick={async () => {
            setShareErr("");
            try { await navigator.share({ title: "HMNL Statistika", url: location.origin + "/" }); }
            catch (e) { if (e?.name !== "AbortError") setShareErr("Dijeljenje nije uspjelo."); }
          }}>Otvori Dijeli</button>)}
        {shareErr && <div className="small muted" style={{ marginTop: 6 }}>{shareErr}</div>}
      </div>
      <div className="ios-arrow" aria-hidden="true">↓</div>
    </div>
  );
}

export function InstallHint() {
  const adm = useStore().isAdmin;
  const [sheet, setSheet] = useState(false);
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
    body = <>
      <span>Instaliraj HMNL Statistiku na iPhone: ikona na početnom zaslonu, bez adresne trake.</span>
      <button type="button" className="btn sm primary" onClick={() => setSheet(true)}>Instaliraj</button>
    </>;
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
      {sheet && <IOSSheet onClose={() => setSheet(false)} />}
    </div>
  );
}
