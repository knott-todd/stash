import Link from "next/link";
import { StashLockup } from "@/components/Logo";
import "./landing.css";

// The landing page. One promise, one button, then one short answer per word.
// Anything added here must prove "Free", "Unlimited" or "Private" (docs/BRAND-BRIEF.md).
const answers = [
  {
    h: "Free.",
    p: "There is no plan to upgrade to. The storage behind Stash costs us nothing to give, so there is no bill to pass on. No tiers, no trial, no card.",
  },
  {
    h: "Unlimited.",
    p: "No quota. Add a file today and ten thousand next year; the price stays the same. You will never see “storage full” again.",
  },
  {
    h: "Private.",
    p: "Every file is encrypted before it is stored, so the companies holding the bytes cannot read them. Only you, signed in, can open your files. We never scan them, sell them or train anything on them.",
  },
];

export default function Landing() {
  return (
    <main className="landing">
      <header className="col">
        <Link href="/" className="wordmark" aria-label="Stash home">
          <StashLockup />
        </Link>
        <Link href="/signin" className="quiet-link">
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
            Switch to Stash in 3 easy steps
          </Link>
          <p className="reassure">Sign in with Google. No card.</p>
        </div>
        {/* Scroll cue: the hero fills the screen, so say there is more. */}
        <a href="#answers" className="more" aria-label="Read what that means">
          <span>What that means</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </section>

      <section id="answers" className="col answers" aria-label="What each word means">
        {answers.map((a) => (
          <div key={a.h} className="answer">
            <h2>{a.h}</h2>
            <p>{a.p}</p>
          </div>
        ))}
      </section>

      <footer className="col">
        <p className="thanks">
          A big thank you to{" "}
          <a href="https://x.com/BBesckinder" target="_blank" rel="noreferrer">
            Benoni Taddesse
          </a>
          , who made this all possible &lt;3
        </p>
      </footer>
    </main>
  );
}
