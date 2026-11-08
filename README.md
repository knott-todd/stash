# Loft — unlimited storage, zero setup

Seldon hackathon, 2026-11-07. Replaces Google Drive / Google One storage with the user's own Telegram, wrapped in a drive that a non-technical person can set up in 3 clicks.

- `loft/` — the Next.js app (`npm run dev` → http://localhost:3000)
- `docs/PRODUCT.md` — demo script, KPIs, acceptance scenarios, scope cut
- `docs/OPEN-DECISIONS.md` — the few decisions that need Olusanya
- `seldon.yml` — Wren QA baseline (4 core journeys)
- `scripts/wren.mjs` — run Wren from the terminal without the plugin

## Run it

```bash
cd loft && npm install && npm run dev
```

There is no sign-in: the device is the identity (`loft_uid` cookie). Files are AES-GCM encrypted in the browser before upload (`src/lib/crypto.ts`); the key lives in the device's localStorage and travels to another device only in a URL fragment (email link or QR from "Open on another device"). The server and the storage supplier hold ciphertext only; "What Loft holds" in the drive shows the raw bytes.

Demo mode is on when `TELEGRAM_BOT_TOKEN` is unset: ciphertext goes to `loft/.data/blobs`, migration and photo backup are simulated. With a token (operator-side, from BotFather; users never see it), ciphertext goes to a Loft-operated chat (`LOFT_STORAGE_CHAT_ID`, or the first chat that sends the bot `/start`).

Routes: `/` landing · `/start` (redirects to the drive) · `/drive` · `/m` phone backup · `/claim/<token>` device hand-off.

## Wren (Seldon QA)

Wren drives a real browser against a **public** URL, so expose the dev server first:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Then:

```bash
node scripts/wren.mjs run https://<something>.trycloudflare.com
```

```bash
node scripts/wren.mjs report <experiment_id>
```

Set `SELDON_API_KEY` in your environment first (the key is not committed). The Seldon MCP server is also configured in `.mcp.json` for use inside Claude Code (`validate_seldon_yaml`, `run_seldon`, `get_report`, …).

## Demo script

See `docs/PRODUCT.md`. Short version: landing → Open Telegram → "You're in" → Move my Google Drive → files stream in → phone photo backup on `/m` → drag in a real file → savings tile.
