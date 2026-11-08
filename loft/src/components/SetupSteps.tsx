"use client";

import Link from "next/link";

// Setting up Stash is two things: bring what you have, and keep it coming.
//   1. Move my files here         Google Drive now; OneDrive and Dropbox to follow
//   2. Back up automatically      this computer (Stash Desktop); my phone
// Big on an empty drive; a slim strip once there are files; gone when both are done.

export type SetupState = { migrated: boolean; computer: boolean; phone: boolean };

export function SetupSteps({ state, big, onGoogle, onDismiss }: { state: SetupState; big: boolean; onGoogle: () => void; onDismiss?: () => void }) {
  const step2 = state.computer || state.phone;
  if (big) {
    return (
      <section className="pt-6" aria-label="Set up Stash">
        <h1 className="text-4xl sm:text-5xl font-semibold">Two things, then it runs itself.</h1>
        <p className="mt-2 text-lg text-ink-2">Everything is encrypted before it is stored.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <StepCard n={1} title="Move my files here" done={state.migrated} body="Everything from your current provider, folders included. Nothing is deleted there.">
            <button className="btn-primary w-full" onClick={onGoogle} data-testid="tile-gdrive">
              <GDriveIcon /> Google Drive
            </button>
            <p className="text-sm text-ink-3">OneDrive and Dropbox are coming.</p>
          </StepCard>
          <StepCard n={2} title="Back up automatically" done={step2} body="Pick the folders and the devices once. From then on every new or changed file arrives on its own.">
            <Link href="/devices" className="btn-primary w-full" data-testid="tile-computer">
              This computer
            </Link>
            <Link href="/devices#phone" className="btn-ghost w-full border border-line text-ink" data-testid="tile-phone">
              My phone
            </Link>
          </StepCard>
        </div>
      </section>
    );
  }
  return (
    <div className="card mb-5 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" role="region" aria-label="Set up Stash" data-testid="setup-strip">
      <span className="font-semibold">Set up</span>
      <Step done={state.migrated} label="Move my files here">
        <button className="underline underline-offset-4 hover:text-ink" onClick={onGoogle}>
          Google Drive
        </button>
      </Step>
      <Step done={step2} label="Back up automatically">
        <Link href="/devices" className="underline underline-offset-4 hover:text-ink">
          This computer
        </Link>
        <span className="text-ink-3"> · </span>
        <Link href="/devices#phone" className="underline underline-offset-4 hover:text-ink">
          My phone
        </Link>
      </Step>
      {onDismiss && (
        <button className="ml-auto text-ink-3 hover:text-ink" onClick={onDismiss} aria-label="Hide setup">
          Hide
        </button>
      )}
    </div>
  );
}

function Step({ done, label, children }: { done: boolean; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-2">
      <Tick done={done} />
      <span className={done ? "line-through text-ink-3" : ""}>{label}</span>
      {!done && <span className="text-ink-2">{children}</span>}
    </span>
  );
}

function StepCard({ n, title, done, body, children }: { n: number; title: string; done: boolean; body: string; children: React.ReactNode }) {
  return (
    <div className={`card p-6 flex flex-col gap-3 ${done ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`inline-flex size-8 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-ok text-white" : "bg-ink text-white"}`} aria-hidden>
          {done ? "✓" : n}
        </span>
        <h2 className="text-xl font-semibold">{title}</h2>
        {done && <span className="ml-auto text-sm text-ok">Done</span>}
      </div>
      <p className="text-ink-2">{body}</p>
      <div className="mt-auto flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Tick({ done }: { done: boolean }) {
  return (
    <span className={`inline-flex size-4 items-center justify-center rounded-full border ${done ? "border-ok bg-ok text-white" : "border-line"}`} aria-hidden>
      {done && (
        <svg width="10" height="10" viewBox="0 0 12 12">
          <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function GDriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path d="M8.5 3h7l6 10.5-3.5 6h-12l-3.5-6L8.5 3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 3 12 9.5m0 0 3.5-6.5M12 9.5 2.5 13.5m9.5-4 9.5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
