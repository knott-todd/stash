# Stash Desktop

Keeps folders on this computer backed up to your Stash account. Install it,
link it once, tick the folders. After that every new or changed file is
encrypted here and sent on its own; what it is doing shows in the app's window,
its tray icon, and on the Devices page of the website.

## The app (what people install)

`app/` is an Electron app around the same engine as the command line.

- Link: one button; the browser opens for the Google sign-in and a six-letter
  code is approved there.
- Folders: Documents and Pictures ticked by default, any other folder through
  the normal folder picker.
- Status: per folder, how many files, what is waiting, when the last one went;
  Pause, Check now, Change folders, Unlink.
- Tray icon: closing the window keeps it running; it starts when you sign in to
  the computer (switchable in the window).
- Locked accounts: asks for the passcode once.

Build the installer (needs Node 20+; the first build downloads Electron):

```
cd desktop
npm install
npm run icons        # sizes of the brand mark (loft/src/app/icon.svg) for ICO/PNG
npm run dist:win     # dist/Stash-Setup.exe
npm run dist:mac     # on a Mac: dist/Stash-*.dmg
```

Try it without building: `npm run app -- --server http://localhost:3000`.

End-to-end check with the real app driven by Playwright (needs a local server
with `STASH_DEV_SIGNIN=1`):

```
node scripts/test-app.mjs http://localhost:3000 <scratch dir>
```

### Signing

The installer is unsigned. Windows SmartScreen shows "Windows protected your
PC" the first few hundred times an unsigned program is run, with "More info →
Run anyway". Removing that needs a code-signing certificate (Azure Trusted
Signing, about $10 a month, or an EV certificate) or distribution through the
Microsoft Store. macOS needs an Apple developer account for notarization or
users must right-click → Open. This is the one setup step that still is not
polished, and it is a purchase, not code.

## The command line (for staging and development)

```
node desktop/cli.mjs
```

Same engine, same link flow, prompts in the terminal. Flags: `--add <folder>`,
`--remove <folder>`, `--folders`, `--once`, `--unlink`, `--server <url>`,
`--config <dir>`, `--yes`, `--install-startup`.

## What it skips

Hidden files and folders, caches and build folders (`node_modules`, `.git`),
temp and partial downloads, shortcuts, files still being written, files over
4 GB.

## How files land in Stash

`<This computer's name>/<Folder label>/<sub folders>/<file>`. A changed file
replaces its earlier copy. A file deleted here stays in Stash.
