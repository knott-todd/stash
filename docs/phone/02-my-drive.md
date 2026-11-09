# My drive (phone)

## Navigation
Bottom navigation bar: **My drive**, **Photos**, **Devices**, **Settings**, Lucide icons with labels: four peers, in thumb reach. Each tab keeps its own stack; tapping the active tab returns to its root. **Sign out** moves to Settings. The usage figure (`1,240 files · 18.2 GB`) is the subtitle under the root's large title.

## Folder stack
A folder pushes a screen titled with its name; the back gesture pops one level. No breadcrumbs.

## Row (64dp)
- **Leading:** 40dp rounded thumbnail for pictures and videos (stored preview, disk-cached); otherwise the Lucide type icon.
- **Line 1:** name, ellipsis before the extension.
- **Line 2:** `12 Nov · 3.4 MB`; folders `12 items` or `Empty`; search results show the path, `School / Thesis`.
- **Trailing:** a check only when kept on this phone.

Folders first, then files, by name.

## Opening
Picture or video: the Photos lightbox, swiping through this folder. Other files: row spinner, then Android's "Open with". Failure: `Couldn't open Thesis.pdf.` **Retry**.

## Adding
- **Floating `+`** opens a sheet: **Upload files** (file picker, several), **Upload photos or videos** (photo picker), **New folder** (field `Folder name`, **Create**, then opens it).
- **Share target:** `Save 3 files to Stash`, last-used folder with **Change**, **Save**.
- Uploads appear as rows with a progress ring. Done: `Safe. Encrypted on this device before it left.` Failed: `Couldn't upload Report.mov. Check your connection.` **Retry**. Too big: the web's message.

## Actions
**Long-press** selects and swaps the top bar for `1 selected`, X, then **Get link**, **Move**, **Trash**, and **More** (sheet): **Save to phone**, **Rename**, **Keep on this phone** / **Remove from this phone**, **Select all**. No swipes: a trashing swipe fires by accident.
- **Get link** sheet: `Anyone with the link can download Thesis.pdf. Remove it any time.` **Copy link**, **Share link**, **Remove link**. Absent on Locked accounts.
- **Rename** sheet: name selected, extension kept; **Rename**.
- **Move:** full-screen picker `Move 3 items` with its own stack, **New folder**, and `Move to School` (`Already here`); then `Moved to School.`
- **Trash:** snackbar `3 files moved to trash.` **Undo**, 6 s.

## Multi-select
After the first long-press, taps toggle; folders can join. With several, Rename and Get link hide. Back clears.

## Search
Search icon in every folder's top bar opens a full-width `Search` field over the whole drive. Nothing: `Nothing matches "tax".`

## Phone photos and device folders
**Phone photos** is an ordinary folder. While open and this phone backs up, rows appear as each upload finishes (local event). Computer folders arrive under their own names.

## Root-only strips
- Copying: `Copying from Google Drive · 340 of 1,200`, thin bar; tap opens Move my files here.
- Done: `Your Google Drive is here. Google Drive stays as it was.` No nudge to cancel anything: Stash copies and never asks people to drop the copy they have (ROADMAP, decisions log 2026-11-08).
- Setup: only while Move my files here is undone; **Hide**.

## Empty
Root: `Your drive is empty.` `Everything is encrypted before it is stored.` **Move my files here**, **Add a file**. Folder: `This folder is empty.` **Add a file**.

## Loading, errors, offline
- First load: five skeleton rows; later, the cache instantly, with a thin progress line.
- Unreachable, no cache: `Couldn't reach Stash. Check your connection.` **Try again**.
- Offline: strip `Offline. Showing your drive as it was last time.` Cached: the list, folders, thumbnails, files kept or opened before. Not cached: other file contents, links. Rename, Move, Trash, Get link disabled; uploads wait.

## Refresh
Pull to refresh, plus a change check on open, on tab focus, and every 60 s while open (10 s while a device sends). Never in the background.

## Web to phone
| Web | Phone |
|---|---|
| Header links | Bottom bar |
| Breadcrumbs | Stack, back gesture |
| Upload, drag-drop | `+` sheet, share target |
| ⋮, right-click | Long-press, More sheet |
| Dialogs | Sheets, Move picker |
| Selection strip | Contextual top bar |
| Usage pill | Root subtitle |
| "On this device" badge | Check on kept files |
| Polling | Pull, focus checks |

## Not on the phone
List/grid toggle (Photos is the grid), sort columns, keyboard shortcuts, drag to move, hover titles, drop overlay, "In cloud" badge, "Back up photos", "Show phone code", pairing card, "Add a sample file", "Start fresh".
