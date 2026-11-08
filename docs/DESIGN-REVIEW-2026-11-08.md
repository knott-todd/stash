# Design review and brief (2026-11-08)

What is wrong with the screens as they stand, what each screen should emphasise, and the one pass that fixes it. Written before touching code, so the churn is here and not in the repo.

## 1. The rules this pass follows

- **One emphasis per screen.** Everything else is quieter by size, weight, colour or absence.
- **Say it with less.** Copy, icon, weight and spacing before another sentence.
- **Designed as a whole.** Every bar and card is composed, not appended: a reading order, aligned edges, one primary action.
- **No hand-drawn icons.** Lucide (MIT, one stroke weight, 1,500 icons) for UI. Brand marks only from the brand kit. Third-party logos only from official assets.
- **Backup is one thing.** A device is a device; what it backs up is a list of sources under it. Phone leads with photos and WhatsApp, computer with Documents and Pictures.
- **Spot-check at 1200 px and at phone width before any push.**

## 2. Screen by screen

### Header (all pages)

What the person wants: to know where they are and to get anywhere in one click. Now: four links, a usage figure that appears only on the drive and makes the row jump, Sign out.

Proposal:
- Order: **My drive · Photos · Backup · Settings** on the left of the right-hand group, then the usage pill, then Sign out. The usage pill sits at the far right of the links so it has nothing to its right to push; it animates width and opacity (200 ms) in and out instead of popping.
- The page name: **Devices** stays if it reads more naturally; the proposal is about the page being one device-agnostic list, not the label.
- Current page: bold, no underline on hover for the current one.

### Sign-in and the privacy choice

What the person wants: to get in, and to answer one question they understand. Now: the question is fine; the cards wrap their titles and the icons are mine.

Proposal:
- Cards: Lucide `cloud` and `lock`, title on one line (`Locked` as the title, "with a passcode" in the body), one bold sentence, one grey sentence, button pinned bottom. Equal heights.
- Settings reuses the same card with a "Current" tag; the body copy does not change between the two places.

### Drive

What the person wants: find a file, open it, add files. Secondary: organise. Now: the toolbar reads as a feature list (search, List/Grid, New folder, Move from Google Drive, + Add), the column headers do not line up with the cells, images show a generic icon, Google Drive is a toolbar button although it is a setup step.

Proposal:
- **Toolbar as one composed row.** Left: breadcrumbs. Right, one group with consistent sizes: search (grows on focus), a view toggle, then a single primary **Upload** button. "New folder" moves into a small `+` menu beside Upload (Upload files, Upload folder, New folder). "Move from Google Drive" leaves the toolbar entirely: it lives in the setup strip until done, and afterwards under Settings as Imports ("Google Drive · 1,234 files · moved 8 Nov · Move again · Disconnect"). It is a one-time import, not backup.
- **Columns aligned**: the header and the rows use the same grid, so Modified and Size headers sit over their cells (today the header grid and row grid differ by the badge column). Right-align Size; both header and cell.
- **Images show a thumbnail** in the list instead of the type icon (same encrypted preview the grid uses, at 28 px). Videos too.
- **Selection strip** stays in the header row (done). Add **Download** and **Keep on this device / Remove from this device** to the strip and the menu; the badge becomes an action, not just a state.
- **Photos open in place**: a lightbox that grows from the tile into a centred panel over a dimmed page, with arrows and Esc, Download and Share in its corner. Same for images in the list.
- Live updates: while any linked device reports "uploading", the drive refreshes every 10 s; otherwise every 60 s. A new file fades in. No manual refresh.
- Lucide icons for folder, file types, cloud and check badges, kebab.

### Photos

What the person wants: scroll their memories. Now: a grid by month, which is right.

Proposal: keep. Add the lightbox above, a count per month in grey, and a "From: phone / laptop / Google Drive" filter only when there is more than one source. Nothing else.

### Backup (today "Devices")

What the person wants: "is my stuff backed up?" answered in one glance, and a way to add a device. Now: two sections (Computers, Phone) that treat kinds differently, text explaining the page, folder rows at the same visual level as the device.

Proposal, device-agnostic:
- Title **Backup**. One line under it only if there is nothing yet: "Link a device and choose what it keeps backed up."
- **One list of devices**, newest first, each a card: Lucide `laptop` or `smartphone` at the left, name with a pencil icon beside it (click to rename inline), status line (green dot, "Up to date · last file 7 min ago"), files · size at the right. **Sources indented** under the name with a left rule: Documents, Pictures, Camera roll, WhatsApp. Each source: name, count · size, state. At the row's end a `link-2-off` (broken chain) icon to unlink, with a confirm.
- **Link a device** button, top right, always. The rule behind it: **the device being added always finishes the link on itself.** A laptop links by running the app, which opens the approval page in that laptop's own browser; a phone links by opening Stash on the phone and signing in. So the device you are on has one job: hand the other device the address. The page guesses the two most likely intents from the platform of the browser, whether this browser approved a computer link before, and what is already in the device list:

  | You are on | We know | Primary | Secondary |
  | --- | --- | --- | --- |
  | Laptop, not linked | no computer in the list, and this browser never approved one | **This computer**: download the installer | **My phone**: a QR to the sign-in page with a from=laptop hint |
  | Laptop, already linked | this browser approved a computer, or a computer is in the list | **My phone**: the QR | **Another computer**: copy or email the download link |
  | Phone, not linked | no phone source yet | **This phone**: the phone flow here | **My computer**: email me the download link |
  | Phone, already linked | a phone source exists | **My computer**: email me the link | **Another phone**: a QR for it |

  Laptop to another laptop and phone to another phone sit under a small "Something else" link. The one wrong guess: a second browser on an already-linked laptop shows "This computer" first; the cost is one click and no harm.
- Phone card leads with Camera roll and WhatsApp; computer card leads with Documents and Pictures. Same card, different default sources.
- The "Phone" section with explanatory copy disappears; a phone is a device like any other.

### Settings

What the person wants: account, protection, leave. Now: the protection cards look unfinished, Export is a lone button in a box.

Proposal:
- Three rows in one card list, same shape each: icon, title, one line, control at the right.
  1. Account: avatar, name, email; Sign out at the right.
  2. Protection: the two cards from sign-in, fixed as above.
  3. Take everything with you: title, one line, **Export** button at the right. No box with a button floating in it.
- Lucide `user`, `shield`, `download`.

### Share page (public)

What a stranger wants: the file. Now: fine. Change the Download button to primary and the picture to fill the width; the "Get your own" line stays.

### Desktop app

- Icon: the brand mark's inner shape must be white, not transparent, on the app icon and tray icon (inverted marks the other way round). Generate from the kit with a white fill behind the glyph.
- Status screen: sources indented under the folder label; same card shape as the web Backup page so the two feel like one product.

## 3. Bugs and small fixes, regardless of the above

| # | What | Cause | Fix |
| --- | --- | --- | --- |
| B1 | Modified and Size headers not over the cells | header grid has no badge column; rows do | one grid definition shared by header and rows; right-align Size |
| B2 | Google Drive copy stops on mobile when navigating away | the copy runs inside the drive page component; leaving the page unmounts it; a background tab is also throttled on phones | short term: move the copy runner to the app layout so in-app navigation keeps it going; real fix: a server-side copy for Standard accounts (the server holds the provider token and the key), run in short cron-driven batches, resumable, with progress on the Backup page. Locked accounts keep the browser copy. |
| B3 | Auto-backed-up files need a refresh to appear | no polling | poll while a device is uploading (10 s), else 60 s |
| B4 | "+ Add" | wording | "Upload" |
| B5 | Header jumps between drive and settings | usage pill appears/disappears | pill at the far right of the links, animated width |
| B6 | Privacy cards: wrapped title, wonky icon | hand-drawn SVG, long title | Lucide icons, shorter title |
| B7 | Export looks like a stray button | box with one control | row with text and the button at the right |
| B8 | Folder rows under a device look like siblings | no indent | indented sources with a left rule and smaller type |
| B9 | Rename and Unlink are text links | | pencil beside the name, broken-chain at the row end |
| B10 | Desktop icon transparent centre | mark rendered without a background fill | white fill behind the glyph for the app icon; inverted mark for the tray on dark taskbars |
| B11 | No lightbox for photos | opens a new tab | in-place lightbox with a grow transition |
| B12 | List rows show a generic image icon | | 28 px thumbnail from the stored preview |
| B13 | No "Download" or "Remove local copy" for a selection | | selection strip and menu actions |
| B14 | No way to link a second computer once one exists | the add block is hidden | "Link a device" always visible on Backup |

## 4. Roadmap addition: storage management

Premise: Stash is where everything gets dumped, so managing the dump must be the best experience anywhere, and every recommendation must be provably right, never a guess.

- **Map**: a treemap of the account by folder and type (the WizTree view), with the biggest and oldest first. Computed from the catalogue; no bytes read.
- **Exact duplicates**: same content hash (we already fingerprint phone photos; add a content hash to every upload, including desktop and Drive copies). A recommendation to delete copies is provably safe: the bytes are identical. One tap, with the kept copy named.
- **Unused**: never opened since it arrived, older than N months; "opened" is a fact the catalogue records. Shown as a list, not auto-deleted.
- **Near-duplicate photos**: perceptual hash computed on the device at upload (the browser or the desktop app, never the server), and only pairs above a strict threshold with the same dimensions and within minutes of each other are shown, side by side, with "keep the larger". Never auto-acted on.
- **Guarantee**: anything offered as one-tap is byte-identical or metadata-identical by construction. Anything judged (near-duplicates, "probably unused") is shown for a decision. No model in the loop.

## 5. The pass, in order

1. Icons: add Lucide, replace every drawn icon, fix the privacy cards and Settings rows (B6, B7).
2. Header: Backup label, pill placement and animation (B5).
3. Drive: toolbar composed, Upload, columns aligned, list thumbnails, live polling, selection actions, lightbox (B1, B3, B4, B11, B12, B13).
4. Backup page: device-agnostic cards, sources indented, pencil and broken chain, Link a device with platform detection (B8, B9, B14).
5. Desktop app: icon fill, status card to match (B10).
6. Google Drive copy survives navigation (B2 short term); server-side copy as its own item.
7. Storage management: content hash on every upload first (cheap, needed for everything else), then the map and exact duplicates.

Items 1 to 5 are one coordinated pass with a spot-check of every screen before the push. Item 6 and 7 are separate.
