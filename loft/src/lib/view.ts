// What the browser can show on its own. Returns the mime to open it with, or null
// to download instead. Config/log/code files are text even when the source called
// them octet-stream.

const TEXT_EXT = /\.(txt|md|conf|cfg|ini|log|json|ya?ml|toml|csv|tsv|xml|html?|css|js|ts|py|sh|env|sha1|gitignore)$/i;

export function viewableMime(mime: string, name: string): string | null {
  if (TEXT_EXT.test(name) || mime.startsWith("text/") || mime === "application/json") return "text/plain";
  if (mime === "application/pdf") return mime;
  if (/^(image|video|audio)\//.test(mime)) return mime;
  return null;
}
