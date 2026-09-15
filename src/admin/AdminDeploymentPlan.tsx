const SECTORS = [
  { name: "Sector I · Q Line 1", shifts: "A 08:00–16:00 · B 16:00–00:00 · C 17:00–01:00", posts: ["Mahankali Temple entry", "Emergency Gate 1", "Chilla at Bada Ganesh", "Indira Nagar entry", "Q Line 1 pushing parties", "VIP intersection and entry", "Prasadam Counter", "Q Line 1 exit", "Public-address system"] },
  { name: "Sector II · Q Line 2", shifts: "A 08:00–16:00 · B 16:00–00:00 · C 17:00–01:00", posts: ["Mint Compound entry", "Printing Press Junction", "Emergency Gates 1–3", "Sushil Tiffin Center / Gajelamma Temple Lane", "CIB Quarters", "Municipal Ward Office", "Wellness Hospital", "Q Line 2 pushing parties and exit"] },
  { name: "Sector III · Q Line 3", shifts: "A 08:00–16:00 · B 16:00–00:00 · C 17:00–01:00", posts: ["Ram Reddy Chicken Centre entry", "Emergency gate", "Q Line 3 pushing parties", "Shaka Ground", "Congress Party Office exit", "Iyangery Bakery", "Vijaya Reddy Office"] },
  { name: "Sector IV · Metro to Railway Gate", shifts: "A 08:00–16:00 · B 16:00–00:00 · C 17:00–01:00", posts: ["Khairatabad Metro Station", "VV Statue bus-stop steps", "ICICI Bank to Kammari Krishna Statue", "Holding point", "Khairatabad Railway Track", "Ambedkar Statue"] },
  { name: "Sector V · Outer Orbit", shifts: "A 08:00–16:00 · B 16:00–00:00 · C 17:00–01:00", posts: ["Ram Reddy Chicken Centre to Gajelamma Temple", "Printing Press Junction to Gajelamma Temple", "Railway Gate to Mahankali Temple", "Control Room"] },
  { name: "Sector VI · Mass Pushing Teams", shifts: "A 09:00–17:00 · B 17:00–00:00", posts: ["Q Line 1 entry to Prasadam Counter", "Q Lines 2 & 3 to Prasadam Counter", "VIP entry / Prasadam Counter", "VIP protocol immediate-response team"] },
  { name: "Sector VII · Night Shift", shifts: "00:00–08:00", posts: ["Mahankali Temple", "Indira Nagar rear entry", "Mint Compound / Printing Press turn", "Ram Reddy Chicken Centre Junction"] },
];

export default function AdminDeploymentPlan() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">PS Khairatabad</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-foreground">Bada Ganesh deployment plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Official 2026 sector, post, and shift schedule from the supplied deployment order.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTORS.map((sector) => (
          <article key={sector.name} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="font-display text-lg font-semibold text-card-foreground">{sector.name}</h2>
            <p className="mt-1 text-sm font-medium text-azure">{sector.shifts}</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {sector.posts.map((post) => <li key={post} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />{post}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
