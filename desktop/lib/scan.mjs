import fs from "node:fs";
import path from "node:path";

// Walks a watched folder and says which files are new or changed since the
// last run. Skips what nobody wants backed up: hidden and system files,
// caches, temp files, anything still being written.

const SKIP_DIRS = new Set(["node_modules", ".git", "$RECYCLE.BIN", "System Volume Information", "AppData", "Library", ".Trash", "__pycache__", ".venv", "venv", ".cache"]);
const SKIP_FILES = /^(desktop\.ini|thumbs\.db|\.ds_store|~\$.*|.*\.(tmp|temp|crdownload|part|partial|download|lnk|lock))$/i;
const MAX_BYTES = 4 * 1024 * 1024 * 1024;
const SETTLE_MS = 3000; // a file modified this recently may still be being written

export function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && !SKIP_FILES.test(e.name)) yield p;
    }
  }
}

// Files in `root` that aren't in `state` as sent with the same size and mtime.
export function changed(root, state, now = Date.now()) {
  const out = [];
  let total = 0;
  let bytes = 0;
  for (const p of walk(root)) {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.size > MAX_BYTES) continue;
    total++;
    bytes += st.size;
    const prev = state[p];
    if (prev && prev.size === st.size && Math.abs(prev.mtimeMs - st.mtimeMs) < 1) continue;
    if (now - st.mtimeMs < SETTLE_MS) continue; // next pass
    out.push({ path: p, size: st.size, mtimeMs: st.mtimeMs, previousId: prev?.fileId });
  }
  return { pending: out, total, bytes };
}

export function mimeOf(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  const m = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", heic: "image/heic", heif: "image/heif", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", svg: "image/svg+xml",
    mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", avi: "video/x-msvideo", mkv: "video/x-matroska", webm: "video/webm",
    mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg",
    pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", html: "text/html", htm: "text/html",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
  };
  return m[ext] ?? "application/octet-stream";
}
