export function Privacy({ db }) {
  const c = db.site?.contact;
  return (
    <div className="page">
      <section className="panel">
        <div className="ph"><h1>Privatnost i uklanjanje podataka</h1></div>
        <div className="prose">
          <p>{db.site?.name || "Ova stranica"} je neslužbena stranica o hrvatskim futsal ligama. Nije povezana s Hrvatskim nogometnim savezom ni s klubovima.</p>
          <h2>Koje podatke prikazujemo</h2>
          <ul>
            <li>Rezultate, rasporede i zapisnike utakmica: brojeve na dresovima i imena igrača. Za seniore puno ime, za juniore inicijal i prezime.</li>
            <li>Statistiku iz automatske analize javno objavljenih prijenosa: posjed, položaje na terenu, prijeđenu udaljenost.</li>
            <li>U kadetskoj ligi (U-17) prikazujemo samo brojeve, bez imena i bez podataka o kretanju pojedinog igrača.</li>
          </ul>
          <h2>Video</h2>
          <p>Snimke utakmica pripadaju klubovima i prijenosnicima. Prikazujemo ih kroz YouTube player u načinu bez kolačića za praćenje (youtube-nocookie.com).
            Video s ucrtanim oznakama objavljujemo samo uz pisanu dozvolu vlasnika snimke.</p>
          <h2>Kolačići</h2>
          <p>Stranica ne koristi kolačiće za praćenje ni oglašavanje.</p>
          <h2>Ispravak i uklanjanje</h2>
          <p>Igrač, roditelj ili klub može zatražiti ispravak ili uklanjanje podataka. Uklanjamo ih bez obrazloženja i u najkraćem roku.</p>
          <p><b>Kontakt:</b> {c ? <span style={{ userSelect: "all" }}>{c}</span> : <span className="muted">kontakt adresa još nije postavljena</span>}</p>
        </div>
      </section>
    </div>
  );
}
