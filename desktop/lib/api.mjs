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
  async uploadFile(key, filePath, meta, thumb, onProgress) {
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
    const parts = [];
    const fh = await fs.promises.open(filePath, "r");
    try {
      const buf = Buffer.allocUnsafe(CHUNK_PLAIN_BYTES);
      let sent = 0;
      for (let i = 0; ; i++) {
        const { bytesRead } = await fh.read(buf, 0, CHUNK_PLAIN_BYTES, i * CHUNK_PLAIN_BYTES);
        if (bytesRead === 0) break;
        const cipher = await encryptChunk(key, buf.subarray(0, bytesRead));
        const fd = new FormData();
        fd.set("piece", new Blob([cipher]), `${meta.name}.part${i}.stash`);
        fd.set("name", meta.name);
        fd.set("index", String(i));
        const r = await this.send("/api/files/part", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `piece ${i} failed (${r.status})`);
        parts.push(j.part);
        sent += bytesRead;
        onProgress?.(sent, st.size);
        if (bytesRead < CHUNK_PLAIN_BYTES) break;
      }
    } finally {
      await fh.close();
    }
    let thumbPart = null;
    if (thumb) {
      const fd = new FormData();
      fd.set("piece", new Blob([await encryptChunk(key, thumb)]), `${meta.name}.thumb.stash`);
      fd.set("name", `${meta.name}.thumb`);
      fd.set("index", "0");
      const r = await this.send("/api/files/part", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok) thumbPart = j.part;
    }
    const r = await this.send("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...fields, parts, ...(thumbPart ? { thumb: thumbPart } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `register failed (${r.status})`);
    return j.file;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
