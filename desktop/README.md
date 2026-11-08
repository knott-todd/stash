# Stash Desktop

Keeps folders on this computer backed up to your Stash account. Every new or
changed file is encrypted here and sent on its own; you never have to do
anything after the first run. What it is doing shows on the Devices page.

## Run it (developer preview)

Needs Node.js 20 or newer.

```
node desktop/cli.mjs
```

First run: it shows a six-letter code and opens the Stash link page; approve the
computer there. Then it suggests Documents and Pictures; press Enter to keep
those, or type numbers or a path. After that it watches the folders.

Keep it running. To start it with the computer:

```
node desktop/cli.mjs --install-startup
```

More: `--add <folder>`, `--remove <folder>`, `--folders`, `--once`, `--unlink`,
`--server <url>`, `--config <dir>`, `--yes`.

## What it skips

Hidden files and folders, caches and build folders (`node_modules`, `.git`),
temp and partial downloads, shortcuts, files still being written, and files
over 4 GB.

## How files land in Stash

`<This computer's name>/<Folder label>/<sub folders>/<file>`. A changed file
replaces its earlier copy. A file deleted here stays in Stash.

## Previews

If `sharp` is installed (`npm install` in this folder), images get a small
encrypted preview for the grid and Photos views. Without it, everything still
backs up; photos just show as icons until a browser opens them.
