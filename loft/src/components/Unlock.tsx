"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Logo } from "./Logo";
import { getRawKey, keyFromRecoveryCode, setRawKey } from "@/lib/crypto";
import { makeKeypair, openSealedKey } from "@/lib/handshake";

// A device that can list files but has no key. Two ways in, chosen by device:
//   phone  → open the camera and scan the code shown on a device that has the key
//   laptop → show a code for the phone to scan; the phone sends the key back,
//            encrypted to a one-time keypair the relay can't open
// Plus the recovery code, for when there is no other device.

const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0;

export function Unlock({ fallback }: { fallback?: React.ReactNode } = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<"scan" | "show" | null>(null);
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (getRawKey()) router.replace("/drive");
    else setMode(isPhone() ? "scan" : "show");
  }, [router]);

  function unlocked(raw: string) {
    setRawKey(raw);
    router.replace("/drive");
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Logo />
      </header>
      <section className="mx-auto w-full max-w-md px-5 pb-16">
        {mode === "scan" && <Scanner onKey={unlocked} />}
        {mode === "show" && <ShowCode onKey={unlocked} />}

        {mode && (
          <p className="mt-4 text-sm text-ink-3">
            {mode === "scan" ? (
              <button className="underline underline-offset-2 hover:text-ink" onClick={() => setMode("show")}>
                No camera here? Show a code for my phone to scan instead
              </button>
            ) : (
              <button className="underline underline-offset-2 hover:text-ink" onClick={() => setMode("scan")}>
                This device has a camera? Scan the other device&apos;s code instead
              </button>
            )}
          </p>
        )}

        {fallback}
        <div className="mt-6 text-sm">
          <button className="text-ink-3 hover:text-ink underline underline-offset-2" onClick={() => setShowCode((s) => !s)}>
            {showCode ? "Hide recovery code" : "Have your recovery code? Enter it"}
          </button>
          {showCode && (
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const raw = keyFromRecoveryCode(code);
                if (!raw) return setToast("That code doesn't look right. It's 26 letters and numbers, dashes optional.");
                unlocked(raw);
              }}
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label="Recovery code"
                className="rounded-full border border-line bg-white px-5 py-3 text-base tracking-wider outline-none focus:border-ink"
                data-testid="recovery-input"
              />
              <button type="submit" className="btn-primary py-3 text-base">
                Unlock
              </button>
            </form>
          )}
        </div>
        {toast && (
          <p className="mt-3 text-sm text-accent-ink" role="status">
            {toast}
          </p>
        )}
      </section>
    </main>
  );
}

// Phone: camera on, looking for a Stash code (a link with the key in its fragment).
function Scanner({ onKey }: { onKey: (raw: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"starting" | "on" | "denied" | "none">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let accepted = false;
    const accept = (text: string) => {
      const m = text.match(/#k=([A-Za-z0-9_-]{16,64})/);
      if (!m || accepted) return false;
      accepted = true;
      // The code also says which drive: join it before unlocking.
      const t = text.match(/[?&]t=([A-Za-z0-9]+)/)?.[1];
      (t ? fetch(`/api/claim?t=${encodeURIComponent(t)}`).catch(() => null) : Promise.resolve(null)).then(() => onKey(m[1]));
      return true;
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setCamera("none");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch {
        return setCamera("denied");
      }
      const video = videoRef.current;
      if (!video || stop) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      setCamera("on");
      type Detector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> };
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const native = BD ? new BD({ formats: ["qr_code"] }) : null;
      const jsqr = native ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const tick = async () => {
        if (stop) return;
        if (video.readyState >= 2) {
          try {
            if (native) {
              const found = await native.detect(video);
              if (found[0] && accept(found[0].rawValue)) return;
            } else if (jsqr && ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const q = jsqr(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
              if (q && accept(q.data)) return;
            }
          } catch {}
        }
        setTimeout(tick, 150);
      };
      tick();
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onKey]);

  return (
    <>
      <h1 className="text-3xl font-semibold">Scan the code on your other device</h1>
      <p className="mt-2 text-ink-2">
        On a device that already has your files: <strong>Open on another device → Scan with your phone</strong>. Point this camera at the code and you&apos;re in.
      </p>
      <div className="mt-5 relative aspect-square w-full overflow-hidden rounded-2xl bg-ink">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {camera === "on" && <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" aria-hidden />}
        {camera === "starting" && <p className="absolute inset-0 flex items-center justify-center text-cream text-sm">Starting camera</p>}
        {camera === "denied" && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-cream text-sm">Camera access was refused. Allow it in your browser settings and reload, or show a code instead.</p>
        )}
        {camera === "none" && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-cream text-sm">No camera on this device. Show a code instead.</p>}
      </div>
    </>
  );
}

// Laptop: show a code; a phone that has the key scans it and sends the key back sealed.
function ShowCode({ onKey }: { onKey: (raw: string) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<"starting" | "waiting" | "expired" | "error">("starting");

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        const { kp, pub } = await makeKeypair();
        const r = await fetch("/api/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ask", askerPub: pub }) });
        const { id } = await r.json();
        const url = `${location.origin}/approve?r=${encodeURIComponent(id)}&p=${encodeURIComponent(pub)}`;
        setQr(await QRCode.toDataURL(url, { margin: 1, width: 260, color: { dark: "#111111", light: "#ffffff" } }));
        setState("waiting");
        const poll = async () => {
          if (stop) return;
          const s = await fetch(`/api/unlock?id=${encodeURIComponent(id)}`).then((x) => x.json()).catch(() => ({ state: "waiting" }));
          if (s.state === "answered") {
            try {
              onKey(await openSealedKey(kp.privateKey, s.approverPub, s.iv, s.ct));
            } catch {
              setState("error");
            }
            return;
          }
          if (s.state === "expired" || s.state === "gone") return setState("expired");
          timer = setTimeout(poll, 1500);
        };
        poll();
      } catch {
        setState("error");
      }
    })();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [onKey]);

  return (
    <>
      <h1 className="text-3xl font-semibold">Scan this with your phone</h1>
      <p className="mt-2 text-ink-2">Use the phone that already has your files. Point its camera at this code, tap the link it shows, and say yes. Nothing to type.</p>
      <div className="mt-5 flex items-center justify-center rounded-2xl border border-line bg-white p-5 min-h-[18rem]">
        {qr ? (
          <img src={qr} alt="Code for your phone to scan" width={260} height={260} />
        ) : (
          <p className="text-sm text-ink-3">{state === "error" ? "Couldn't start. Reload to try again." : "Preparing"}</p>
        )}
      </div>
      <p className="mt-3 text-sm text-ink-3" role="status">
        {state === "waiting" && "Waiting for your phone. This code works for 10 minutes."}
        {state === "expired" && (
          <>
            This code expired.{" "}
            <button className="underline" onClick={() => location.reload()}>
              Make a new one
            </button>
          </>
        )}
        {state === "error" && "Something went wrong. Reload to try again."}
      </p>
    </>
  );
}
