// Kostur stranice dok se baza učitava: sivi obrisi u obliku stranice koja dolazi (svjetlucanje u CSS-u, .sk).
const B = ({ w = "100%", h = 12, r, style }) => <i className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />;

function Rows({ n = 6 }) {
  return Array.from({ length: n }, (_, i) => (
    <div className="sk-row" key={i}>
      <B w={34} h={10} />
      <div className="sk-teams">
        <div><B w={16} h={16} r={3} /><B w={`${48 + ((i * 17) % 30)}%`} /></div>
        <div><B w={16} h={16} r={3} /><B w={`${40 + ((i * 23) % 34)}%`} /></div>
      </div>
      <div className="sk-sc"><B w={12} /><B w={12} /></div>
    </div>));
}

function Table({ n = 10 }) {
  return Array.from({ length: n }, (_, i) => (
    <div className="sk-trow" key={i}><B w={20} h={20} /><B w={18} h={18} r={3} /><B w={`${38 + ((i * 13) % 26)}%`} /><span /><B w={60} /><B w={22} /></div>));
}

export function Skeleton({ page }) {
  const body = page === "utakmica" ? (
    <>
      <section className="panel sk-board">
        <B w="55%" h={10} style={{ margin: "0 auto" }} />
        <div className="sk-board-m">
          <div><B w={56} h={56} r={6} /><B w={90} h={14} /></div>
          <B w={110} h={44} />
          <div><B w={56} h={56} r={6} /><B w={90} h={14} /></div>
        </div>
      </section>
      <section className="panel"><div className="sk-tabs"><B w={64} /><B w={70} /><B w={60} /><B w={58} /></div><Rows n={5} /></section>
    </>
  ) : page === "liga" ? (
    <section className="panel">
      <div className="sk-head"><B w={52} h={52} /><div><B w={160} h={20} /><B w={120} h={10} style={{ marginTop: 8 }} /></div></div>
      <div className="sk-tabs"><B w={64} /><B w={72} /><B w={66} /><B w={70} /></div>
      <Table n={10} />
    </section>
  ) : page === "klub" || page === "igrac" ? (
    <>
      <section className="panel">
        <div className="sk-head"><B w={60} h={60} r={6} /><div><B w={170} h={22} /><B w={110} h={10} style={{ marginTop: 8 }} /></div></div>
        <div className="sk-tiles">{Array.from({ length: 5 }, (_, i) => <div key={i}><B w={28} h={22} /><B w={48} h={9} /></div>)}</div>
      </section>
      <section className="panel"><Rows n={5} /></section>
    </>
  ) : (
    <section className="panel">
      <div className="sk-tabs"><B w={90} /><B w={100} /></div>
      {[6, 5, 4].map((n, g) => <div key={g}><div className="sk-group"><B w={22} h={22} /><B w={130} /><B w={70} h={10} /></div><Rows n={n} /></div>)}
    </section>
  );
  return (
    <div className="page skel" role="status" aria-busy="true">
      <span className="vh">Učitavam podatke…</span>
      <main className="col" aria-hidden="true">{body}</main>
    </div>
  );
}
