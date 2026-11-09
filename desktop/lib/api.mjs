import fs from "node:fs";
import { encryptChunk, CHUNK_PLAIN_BYTES } from "./crypto.mjs";

// Talks to the Stash server as a linked device. Same contract as the browser:
// one request per piece, then one that lists the pieces.

export class Api {
  constructor(server, token, bypass) {
    this.server = server.replace(/\/+$/, "");
    this.token = token;
    this.bypass = bypass; // staging sits behind Vercel's login; this header lets automation through
  }

  headers(extra = {}) {
    return { authorization: `Bearer ${this.token}`, ...(this.bypass ? { "x-vercel-protection-bypass": this.bypass } : {}), ...extra };
  }

  // Storage sometimes asks for a pause (rate limits). Honour it, then retry.
  async send(path, init = {}, tries = 4) {
    for (let attempt = 0; ; attempt++) {
      let r;
      try {
        r = await fetch(this.server + path, { ...init, headers: this.headers(init.headers) });
      } catch (e) {
        if (attempt >= tries) throw e;
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (r.status === 503 && attempt < tries) {
        const j = await r.clone().json().catch(() => ({}));
        await sleep(Math.min(Number(j.retryAfter) || 5, 120) * 1000);
        continue;
      }
      if (r.status >= 500 && attempt < tries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return r;
    }
  }

  async me() {
    const r = await this.send("/api/me");
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.signedIn) throw new Error(j.error ?? "unlinked");
    return j;
  }

  async report(state) {
    const r = await this.send("/api/devices/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(state) });
    if (r.status === 401) throw new Error("unlinked");
    return r.ok;
  }

  async listFiles() {
    const r = await this.send("/api/files");
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "list failed");
    return j.files;
  }

  async deleteFile(id) {
    await this.send(`/api/files/${id}`, { method: "DELETE" });
  }

  // Encrypt and send one file from disk. Small files in one request; larger ones
  // piece by piece, streaming from disk so memory stays flat.
  // `resume` (optional) remembers the upload id per file path between runs, so a backup that
  // stopped at piece 40 of 60 carries on from 41 instead of starting again.
  async uploadFile(key, filePath, meta, thumb, onProgress, resume) {
    const st = fs.statSync(filePath);
    const fields = { ...meta, size: String(st.size), encrypted: "1", modifiedAt: String(Math.round(st.mtimeMs)) };
    if (st.size <= CHUNK_PLAIN_BYTES) {
      const cipher = await encryptChunk(key, fs.readFileSync(filePath));
      const fd = new FormData();
      fd.set("file", new Blob([cipher]), `${meta.name}.stash`);
      if (thumb) fd.set("thumb", new Blob([await encryptChunk(key, thumb)]), "thumb.stash");
      for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      const r = await this.send("/api/files", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `upload failed (${r.status})`);
      onProgress?.(st.size, st.size);
      return j.file;
    }
    // Resume if this file's upload was started before (same size and mtime), else start one.
    let upload = resume?.get?.(filePath, st);
    let have = new Set();
    let haveThumb = false;
    if (upload) {
      const r = await this.send(`/api/uploads/${upload}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.pieces)) {
        have = new Set(j.pieces);
        haveThumb = !!j.thumb;
      } else upload = null;
    }
    if (!upload) {
      const r = await this.send("/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: meta.name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.upload) throw new Error(j.error ?? `upload start failed (${r.status})`);
      upload = j.upload;
      resume?.set?.(filePath, st, upload);
    }
    const fh = await fs.promises.open(filePath, "r");
    try {
      const buf = Buffer.allocUnsafe(CHUNK_PLAIN_BYTES);
      let sent = 0;
      for (let i = 0; ; i++) {
        const { bytesRead } = await fh.read(buf, 0, CHUNK_PLAIN_BYTES, i * CHUNK_PLAIN_BYTES);
        if (bytesRead === 0) break;
        if (!have.has(i)) {
          const cipher = await encryptChunk(key, buf.subarray(0, bytesRead));
          const fd = new FormData();
          fd.set("piece", new Blob([cipher]), `${meta.name}.part${i}.stash`);
          fd.set("upload", upload);
          fd.set("index", String(i));
          const r = await this.send("/api/files/part", { method: "POST", body: fd });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error ?? `piece ${i} failed (${r.status})`);
        }
        sent += bytesRead;
        onProgress?.(sent, st.size);
        if (bytesRead < CHUNK_PLAIN_BYTES) break;
      }
    } finally {
      await fh.close();
    }
    if (thumb && !haveThumb) {
      const fd = new FormData();
      fd.set("piece", new Blob([await encryptChunk(key, thumb)]), "thumb.stash");
      fd.set("upload", upload);
      fd.set("index", "thumb");
      await this.send("/api/files/part", { method: "POST", body: fd });
    }
    const r = await this.send("/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, upload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `register failed (${r.status})`);
    resume?.del?.(filePath);
    return j.file;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
