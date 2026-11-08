"use client";

import Link from "next/link";

// Setting up Stash is two things: bring what you have, and keep it coming.
//   1. Move my files here         Google Drive now; OneDrive and Dropbox to follow
//   2. Back up automatically      this computer (Stash Desktop); my phone
// Big on an empty drive; a slim strip once there are files; gone when both are done.

export type SetupState = { migrated: boolean; computer: boolean; phone: boolean; linked: { "google-drive": boolean; dropbox: boolean; onedrive: boolean } };

type Prov = "google-drive" | "dropbox" | "onedrive";

export function SetupSteps({ state, big, onStart, providers, onDismiss }: { state: SetupState; big: boolean; onStart: (p: Prov) => void; providers: { dropbox: boolean; onedrive: boolean }; onDismiss?: () => void }) {
  const others = (["dropbox", "onedrive"] as const).filter((p) => providers[p]);
  const coming = (["dropbox", "onedrive"] as const).filter((p) => !providers[p]).map((p) => (p === "dropbox" ? "Dropbox" : "OneDrive"));
  const step2 = state.computer || state.phone;
  if (big) {
    return (
      <section className="pt-6" aria-label="Set up Stash">
        <h1 className="text-4xl sm:text-5xl font-semibold">Two things, then it runs itself.</h1>
        <p className="mt-2 text-lg text-ink-2">Everything is encrypted before it is stored.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <StepCard n={1} title="Move my files here" done={state.migrated} body="Everything from your current provider, folders included. Nothing is deleted there.">
            <ActionButton primary linked={state.linked["google-drive"]} onClick={() => onStart("google-drive")} testId="tile-gdrive">
              <GDriveIcon /> Google Drive
            </ActionButton>
            {others.map((p) => (
              <ActionButton key={p} linked={state.linked[p]} onClick={() => onStart(p)} testId={`tile-`}>
                {p === "dropbox" ? "Dropbox" : "OneDrive"}
              </ActionButton>
            ))}
            {coming.length > 0 && <p className="text-sm text-ink-3">{coming.join(" and ")} {coming.length > 1 ? "are" : "is"} coming.</p>}
          </StepCard>
          <StepCard n={2} title="Back up automatically" done={step2} body="Pick the folders and the devices once. From then on every new or changed file arrives on its own.">
            <ActionButton primary linked={state.computer} href="/devices" testId="tile-computer">
              This computer
            </ActionButton>
            <ActionButton linked={state.phone} href="/devices#phone" testId="tile-phone">
              My phone
            </ActionButton>
          </StepCard>
        </div>
      </section>
    );
  }
  return (
    <div className="card mb-5 px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" role="region" aria-label="Set up Stash" data-testid="setup-strip">
      <span className="font-semibold">Set up</span>
      <Step done={state.migrated} label="Move my files here">
        <button className="underline underline-offset-4 hover:text-ink" onClick={() => onStart("google-drive")}>
          Google Drive
        </button>
        {others.map((p) => (
          <span key={p}>
            <span className="text-ink-3"> · </span>
            <button className="underline underline-offset-4 hover:text-ink" onClick={() => onStart(p)}>
              {p === "dropbox" ? "Dropbox" : "OneDrive"}
            </button>
          </span>
        ))}
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

// Google Drive's own mark (official brand asset), never a redrawing.
function GDriveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 87.3 78" aria-hidden>
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

// A step's button: the action until it is done, then a quiet green "Linked" that still opens the same place.
function ActionButton({ children, linked, primary = false, href, onClick, testId }: { children: React.ReactNode; linked: boolean; primary?: boolean; href?: string; onClick?: () => void; testId: string }) {
  const cls = linked ? "btn-ghost w-full border border-ok/40 bg-ok-soft text-ok hover:bg-ok-soft" : primary ? "btn-primary w-full" : "btn-ghost w-full border border-line text-ink";
  const inner = (
    <>
      {children}
      {linked && (
        <span className="inline-flex items-center gap-1 text-sm font-medium" data-testid={`${testId}-linked`}>
          <svg width="14" height="14" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Linked
        </span>
      )}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls} data-testid={testId}>
        {inner}
      </Link>
    );
  return (
    <button className={cls} onClick={onClick} data-testid={testId}>
      {inner}
    </button>
  );
}
