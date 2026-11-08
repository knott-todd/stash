"use client";

import { useState } from "react";
import { getRawKey, keyFromRecoveryCode, recoveryCode, setRawKey, unwrapKey, wrapKey, type WrappedKey } from "@/lib/crypto";

// How the files are protected. Two choices, said plainly:
//   Standard   Files open anywhere you sign in. Private from everyone except Stash
//              itself, the way Google Drive is. (Recommended)
//   Locked     Only you can open your files, with a passcode Stash never sees. Forget
//              the passcode and the recovery code, and the files are gone for good.
// Said to people without the word "key": what it means for them, not how it works.

export type Protection = "standard" | "passcode" | null;

export function ProtectionChoice({ current, onChanged, compact = false }: { current: Protection; onChanged: (p: Protection) => void; compact?: boolean }) {
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseStandard() {
    setError(null);
    const raw = getRawKey();
    const r = await fetch("/api/account/protection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "standard", key: raw }) });
    if (!r.ok) return setError("Couldn't change that. Try again.");
    onChanged("standard");
  }

  async function lock(passcode: string, hint: string) {
    const raw = getRawKey();
    if (!raw) return setError("This device isn't ready yet. Reload and try again.");
    const keyWrapped = await wrapKey(raw, passcode, hint || undefined);
    const r = await fetch("/api/account/protection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "passcode", keyWrapped }) });
    if (!r.ok) return setError("Couldn't lock the account. Try again.");
    setLocking(false);
    onChanged("passcode");
  }

  return (
    <div>
      <div className={`grid gap-3 items-stretch ${compact ? "" : "sm:grid-cols-2"}`}>
        <Option
          selected={current === "standard"}
          title="Standard"
          tag="Recommended"
          icon="cloud"
          body="Opens wherever you sign in. Nothing to remember."
          note="Stash can open your files, as Google Drive can. We never do unless you share one."
          action={current === "standard" ? null : current === "passcode" ? () => setUnlocking(true) : chooseStandard}
          actionLabel={current === "passcode" ? "Switch to Standard" : "Use Standard"}
          testId="protection-standard"
          big={current === null}
          primary
        />
        <Option
          selected={current === "passcode"}
          title="Locked with a passcode"
          tag="More private"
          icon="lock"
          body="Only you can open them, with a passcode you choose."
          note="Not even Stash can. Forget the passcode and the recovery code, and the files are gone."
          action={current === "passcode" ? null : () => setLocking(true)}
          actionLabel="Lock my files"
          testId="protection-passcode"
          big={current === null}
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-accent-ink" role="alert">
          {error}
        </p>
      )}
      {locking && <SetPasscode onCancel={() => setLocking(false)} onDone={lock} />}
      {unlocking && (
        <AskPasscode
          title="Switch to Standard"
          body="Enter your passcode once more. After this your files open with just a sign-in, and the passcode is no longer needed."
          wrapped={null}
          onCancel={() => setUnlocking(false)}
          onUnlocked={async () => {
            setUnlocking(false);
            await chooseStandard();
          }}
        />
      )}
    </div>
  );
}

function Option({ selected, title, tag, icon, body, note, action, actionLabel, testId, big = false, primary = false }: { selected: boolean; title: string; tag: string; icon: "cloud" | "lock"; body: string; note: string; action: (() => void) | null; actionLabel: string; testId: string; big?: boolean; primary?: boolean }) {
  return (
    <div className={`card p-5 h-full flex flex-col `} data-testid={testId} aria-current={selected ? "true" : undefined}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-lg font-semibold">
          <ModeIcon kind={icon} />
          {title}
        </p>
        <span className={`text-xs rounded-full px-2.5 py-1 ${selected ? "bg-ink text-white" : "bg-cream-2 text-ink-2"}`}>{selected ? "Current" : tag}</span>
      </div>
      <p className="mt-3 text-ink">{body}</p>
      <p className="mt-1 text-sm text-ink-3">{note}</p>
      {action && big && (
        <div className="mt-auto pt-5">
          <button className={primary ? "btn-primary w-full" : "btn-ghost w-full border border-line text-ink"} onClick={action}>
            {actionLabel}
          </button>
        </div>
      )}
      {action && !big && (
        <div className="mt-auto pt-3">
          <button className="btn-ghost px-0 text-ink underline underline-offset-4" onClick={action}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// Dialog: choose a passcode, see the recovery code once, confirm it was saved.
function SetPasscode({ onCancel, onDone }: { onCancel: () => void; onDone: (passcode: string, hint: string) => Promise<void> }) {
  const [step, setStep] = useState<"passcode" | "recovery">("passcode");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [hint, setHint] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const raw = getRawKey();

  return (
    <Dialog title={step === "passcode" ? "Choose a passcode" : "Your recovery code"} onClose={onCancel}>
      {step === "passcode" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (a.length < 6) return setErr("Use at least 6 characters.");
            if (a !== b) return setErr("The two passcodes don't match.");
            setErr(null);
            setStep("recovery");
          }}
        >
          <p className="text-sm text-ink-2">You will type this on every new device. Stash never sees it, so Stash cannot reset it.</p>
          <input type="password" value={a} onChange={(e) => setA(e.target.value)} placeholder="Passcode" autoComplete="new-password" className={input} aria-label="Passcode" data-testid="passcode-a" />
          <input type="password" value={b} onChange={(e) => setB(e.target.value)} placeholder="Again" autoComplete="new-password" className={input} aria-label="Passcode again" data-testid="passcode-b" />
          <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="A hint for yourself (optional, shown to anyone)" className={input} aria-label="Hint" maxLength={60} />
          {err && <p className="text-sm text-accent-ink">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" data-testid="passcode-next">
              Next
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">If you ever forget the passcode, this code opens your files. Write it down somewhere safe. It is shown now and in Settings, never by email.</p>
          <code className="block rounded-xl bg-cream-2 px-4 py-3 text-center text-lg tracking-wider font-mono select-all" data-testid="recovery-code">
            {raw ? recoveryCode(raw) : "—"}
          </code>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-1" data-testid="recovery-saved" />
            <span>I have written the recovery code down.</span>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setStep("passcode")}>
              Back
            </button>
            <button
              className="btn-primary"
              disabled={!saved || busy}
              onClick={async () => {
                setBusy(true);
                await onDone(a, hint);
                setBusy(false);
              }}
              data-testid="passcode-lock"
            >
              {busy ? "Locking" : "Lock my files"}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

// Dialog: type the passcode (or the recovery code) to open the files on this device.
export function AskPasscode({ title = "Enter your passcode", body, wrapped, onCancel, onUnlocked }: { title?: string; body?: string; wrapped: WrappedKey | null; onCancel?: () => void; onUnlocked: (raw: string) => void }) {
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    let raw: string | null = null;
    if (useRecovery) raw = keyFromRecoveryCode(code);
    else if (wrapped) raw = await unwrapKey(wrapped, code);
    else raw = getRawKey(); // switching modes on a device that already has the key: the passcode check is the wrapped copy's job
    setBusy(false);
    if (!raw) return setErr(useRecovery ? "That recovery code doesn't look right. It is 26 letters and numbers." : "That passcode didn't open the files.");
    setRawKey(raw);
    onUnlocked(raw);
  }

  return (
    <Dialog title={title} onClose={onCancel}>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        {body && <p className="text-sm text-ink-2">{body}</p>}
        {wrapped?.hint && !useRecovery && <p className="text-sm text-ink-3">Hint: {wrapped.hint}</p>}
        <input
          type={useRecovery ? "text" : "password"}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={useRecovery ? "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X" : "Passcode"}
          autoComplete={useRecovery ? "off" : "current-password"}
          autoFocus
          className={input}
          aria-label={useRecovery ? "Recovery code" : "Passcode"}
          data-testid="passcode-input"
        />
        {err && <p className="text-sm text-accent-ink">{err}</p>}
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="text-sm text-ink-3 hover:text-ink underline underline-offset-2" onClick={() => (setUseRecovery((u) => !u), setCode(""), setErr(null))}>
            {useRecovery ? "Use the passcode instead" : "Forgot it? Use the recovery code"}
          </button>
          <div className="flex gap-2">
            {onCancel && (
              <button type="button" className="btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="btn-primary" disabled={busy || !code} data-testid="passcode-submit">
              {busy ? "Checking" : "Open"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-ink/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="card w-full max-w-md bg-cream p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const input = "rounded-full border border-line bg-white px-5 py-3 text-base outline-none focus:border-ink";

// One line icon per mode, in the same single-colour style as the file icons.
function ModeIcon({ kind }: { kind: "cloud" | "lock" }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "shrink-0 text-ink" };
  if (kind === "cloud")
    return (
      <svg {...common}>
        <path d="M7 18a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8.5 3.75 3.75 0 0 1 17.5 16H7Z" />
        <path d="m9.5 13 2 2 3.5-4" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <circle cx="12" cy="15.5" r="1" fill="currentColor" />
    </svg>
  );
}
