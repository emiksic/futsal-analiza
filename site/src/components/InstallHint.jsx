// Traka "Instaliraj aplikaciju" (PWA), samo na mobitelu/tabletu:
//  - Android (Chrome, Samsung, Edge): gumb koji otvara sistemski prozor za instalaciju; ako ga preglednik ne ponudi, uputa za izbornik
//  - Android u Instagram/Facebook pregledniku: "otvori u Chromeu"
//  - iPhone/iPad Safari: uputa Dijeli (donja traka) → Dodaj na početni zaslon; Chrome na iPhoneu: Dijeli gore desno
//  - iPhone u Instagram/Facebook, Firefoxu i sl.: "otvori u Safariju"
// Ne prikazuje se na računalu, u instaliranoj aplikaciji ni kad je korisnik traku zatvorio (30 dana).
import { useEffect, useState } from "react";
import { useStore } from "../lib/store.js";

// Traka je javna od 17. 11. 2026.; false = vidi samo admin.
const INSTALL_PUBLIC = true;
const OFF_KEY = "install-hint-off";
const OFF_DAYS = 30;

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|Snapchat|; wv\)/i.test(ua);   // ugrađeni preglednici (Instagram, Facebook…) ne mogu instalirati
const iosChrome = isIOS && /CriOS/.test(ua);
const iosSafari = isIOS && !inApp && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
const andFirefox = isAndroid && /Firefox/.test(ua);
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

// Uputa za iPhone: stranica ne može sama dodati ikonu, pa pokažemo korake i strelicu prema gumbu Dijeli
// (Safari: donja traka; Chrome: gore desno u adresnoj traci).
function IOSSheet({ onClose, chrome }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className={"ios-sheet-bg" + (chrome ? " top" : "")} onClick={onClose}>
      {chrome && <div className="ios-arrow up" aria-hidden="true">↑</div>}
      <div className="ios-sheet" role="dialog" aria-modal="true" aria-labelledby="ios-sheet-t" onClick={(e) => e.stopPropagation()}>
        <div className="ios-sheet-h">
          <img src="icon-192.png" width="40" height="40" alt="" />
          <div><b id="ios-sheet-t">Instaliraj HMNL Statistiku</b><span>Ikona na početnom zaslonu, otvara se bez adresne trake.</span></div>
          <button type="button" className="install-x" onClick={onClose} aria-label="Zatvori">×</button>
        </div>
        <ol>
          {chrome
            ? <li>Gore desno, u adresnoj traci, dodirni <ShareIcon /> <b>Dijeli</b>.</li>
            : <li>U donjoj traci Safarija dodirni <ShareIcon /> <b>Dijeli</b> (ili prvo <Dots /> pa <b>Dijeli</b>).</li>}
          <li>Skrolaj dolje i odaberi <PlusBox /> <b>Dodaj na početni zaslon</b>.</li>
          <li>Dodirni <b>Dodaj</b>.</li>
        </ol>
      </div>
      {!chrome && <div className="ios-arrow" aria-hidden="true">↓</div>}
    </div>
  );
}

export function InstallHint() {
  const adm = useStore().isAdmin;
  const [sheet, setSheet] = useState(false);
  const [prompt, setPrompt] = useState(() => window.__installPrompt || null);
  const [off, setOff] = useState(() => dismissed() || standalone());
  // Chrome na Androidu javi da se može instalirati odmah po učitavanju; ako ne javi ni nakon 4 s, pokaži ručnu uputu
  const [late, setLate] = useState(false);
  useEffect(() => { if (!isAndroid) return; const t = setTimeout(() => setLate(true), 4000); return () => clearTimeout(t); }, []);

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
  const iosBtn = <>
    <span>Instaliraj HMNL Statistiku na {/iPad/.test(ua) ? "iPad" : "iPhone"}: ikona na početnom zaslonu, bez adresne trake.</span>
    <button type="button" className="btn sm primary" onClick={() => setSheet(true)}>Instaliraj</button>
  </>;
  if (isIOS) {
    if (iosSafari || iosChrome) body = iosBtn;
    else body = <span>Za instalaciju na početni zaslon otvori hmnl.hr u <b>Safariju</b>{inApp ? " (izbornik ⋯ → Otvori u pregledniku)" : ""}.</span>;
  } else if (isAndroid) {
    if (prompt) body = <>
      <span>Instaliraj HMNL Statistiku na mobitel: brže otvaranje, bez adresne trake.</span>
      <button type="button" className="btn sm primary" onClick={async () => {
        prompt.prompt();
        const r = await prompt.userChoice.catch(() => null);
        window.__installPrompt = null; setPrompt(null);
        if (r?.outcome === "accepted") setOff(true);
      }}>Instaliraj</button>
    </>;
    else if (inApp) body = <span>Za instalaciju otvori hmnl.hr u <b>Chromeu</b> (izbornik ⋮ → Otvori u pregledniku).</span>;
    else if (andFirefox || late) body = <span>Instaliraj na mobitel: izbornik <b>⋮</b> → <b>Instaliraj</b> ili <b>Dodaj na početni zaslon</b>.</span>;
  }
  if (!body) return null;
  return (
    <div className="install-bar" role="region" aria-label="Instalacija aplikacije">
      <div>
        <img src="icon-192.png" width="28" height="28" alt="" />
        {body}
        <button type="button" className="install-x" onClick={close} aria-label="Zatvori">×</button>
      </div>
      {sheet && <IOSSheet chrome={iosChrome} onClose={() => setSheet(false)} />}
    </div>
  );
}
