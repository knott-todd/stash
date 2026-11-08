// Installer icon sizes derived from the brand kit mark (loft/src/app/icon.svg),
// never redrawn: a 512 px PNG
// for macOS and the tray, and a multi-size ICO for Windows.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = (await import("sharp")).default;
const svg = fs.readFileSync(path.join(here, "..", "..", "loft", "src", "app", "icon.svg"));
const out = path.join(here, "..", "build");
fs.mkdirSync(out, { recursive: true });
await sharp(svg).resize(512, 512).png().toFile(path.join(out, "icon.png"));
await sharp(svg).resize(64, 64).png().toFile(path.join(out, "tray.png"));
// ICO: a container of PNG images at the usual sizes.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(svg).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
pngs.forEach((png, i) => {
  const e = Buffer.alloc(16);
  e[0] = sizes[i] === 256 ? 0 : sizes[i];
  e[1] = sizes[i] === 256 ? 0 : sizes[i];
  e[2] = 0;
  e[3] = 0;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  entries.push(e);
});
fs.writeFileSync(path.join(out, "icon.ico"), Buffer.concat([header, ...entries, ...pngs]));
console.log("icons written to", out);
