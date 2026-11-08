// The address other devices can reach this app at. Links that leave this
// browser (email, QR) must use it; "localhost" means nothing on a phone.
// Set PUBLIC_URL (e.g. the tunnel or deployed URL); otherwise fall back to the
// request's forwarded host.
export function publicOrigin(req: Request) {
  const env = process.env.PUBLIC_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
