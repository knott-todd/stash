import Link from "next/link";
import "./landing.css";

// The landing page. One promise, one button, then one short answer per word.
// Anything added here must prove "Free", "Unlimited" or "Private" (docs/BRAND-BRIEF.md).
const answers = [
  {
    h: "Free.",
    p: "There is no plan to upgrade to. The storage behind Loft costs us nothing to give, so there is no bill to pass on. No tiers, no trial, no card.",
  },
  {
    h: "Unlimited.",
    p: "No quota. Add a file today and ten thousand next year; the price stays the same. You will never see “storage full” again.",
  },
  {
    h: "Private.",
    p: "Every file is encrypted on your device before it leaves. Only your device holds the key. We cannot read your files, and neither can anyone we store them with.",
  },
];

export default function Landing() {
  return (
    <main className="landing">
      <header className="col">
        <Link href="/" className="wordmark" aria-label="Loft home">
          Loft
        </Link>
        <Link href="/drive" className="quiet-link">
          Sign in
        </Link>
      </header>

      <section className="col hero">
        <div className="block">
          <h1 className="promise">
            <span>Free.</span>
            <span>Unlimited.</span>
            <span>Private.</span>
            <span className="brand">Storage.</span>
          </h1>
          <Link href="/start" className="cta" data-testid="cta-start">
            Switch to Loft in 3 easy steps
          </Link>
          <p className="reassure">No account. No card.</p>
        </div>
      </section>

      <section className="col answers" aria-label="What each word means">
        {answers.map((a) => (
          <div key={a.h} className="answer">
            <h2>{a.h}</h2>
            <p>{a.p}</p>
          </div>
        ))}
      </section>

      <footer className="col">Encrypted on your phone before it leaves.</footer>
    </main>
  );
}
