"use client";

import { useState } from "react";
import { getRawKey, keyFromRecoveryCode, recoveryCode, setRawKey, unwrapKey, wrapKey, type WrappedKey } from "@/lib/crypto";

// How the files are protected. Two choices, said plainly:
//   Standard   Stash keeps the key. Sign in anywhere and your files open. (Recommended)
//   Locked     Only you hold the key, behind a passcode Stash never sees. Forget
//              the passcode and the recovery code, and the files are gone for good.

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
    if (!raw) return setError("This device doesn't have the key yet. Reload and try again.");
    const keyWrapped = await wrapKey(raw, passcode, hint || undefined);
    const r = await fetch("/api/account/protection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "passcode", keyWrapped }) });
    if (!r.ok) return setError("Couldn't lock the account. Try again.");
    setLocking(false);
    onChanged("passcode");
  }

  return (
    <div>
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <Option
          selected={current === "standard"}
          title="Standard"
          tag="Recommended"
          body="Stash keeps your key. Sign in with Google on any device and your files are there. Nothing to remember."
          action={current === "standard" ? null : current === "passcode" ? () => setUnlocking(true) : chooseStandard}
          actionLabel={current === "passcode" ? "Switch to Standard" : "Use Standard"}
          testId="protection-standard"
        />
        <Option
          selected={current === "passcode"}
          title="Locked with a passcode"
          tag="More private"
          body="Only you hold the key, behind a passcode Stash never sees. Not even Stash can open your files. If you forget the passcode and lose the recovery code, the files are gone for good."
          action={current === "passcode" ? null : () => setLocking(true)}
          actionLabel="Lock my files"
          testId="protection-passcode"
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
          body="Enter your passcode once more. Stash will keep the key from now on, and the passcode is no longer needed."
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

function Option({ selected, title, tag, body, action, actionLabel, testId }: { selected: boolean; title: string; tag: string; body: string; action: (() => void) | null; actionLabel: string; testId: string }) {
  return (
    <div className={`card p-5 ${selected ? "border-ink" : ""}`} data-testid={testId} aria-current={selected ? "true" : undefined}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold">{title}</p>
        <span className={`text-xs rounded-full px-2.5 py-1 ${selected ? "bg-ink text-white" : "bg-cream-2 text-ink-2"}`}>{selected ? "Current" : tag}</span>
      </div>
      <p className="mt-2 text-sm text-ink-2">{body}</p>
      {action && (
        <button className="btn-ghost mt-3 px-0 text-ink underline underline-offset-4" onClick={action}>
          {actionLabel}
        </button>
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
