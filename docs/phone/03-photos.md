# 03 Photos

## Grid

- **Contents**: Stash's photos and videos plus this phone's, newest first, by date taken.
- **By day**: sticky headers *Today*, *Yesterday*, weekday this week, then *3 March*, with the year before this year. A count sits at the right.
- **Density**: 4 square tiles per row, 2 dp gaps. Pinch switches 3, 4 or 6 columns, remembered.
- **Scrubbing**: a fast-scroll handle on the right edge while scrolling. Dragging shows *March 2025* and jumps by month.
- **Performance**: 50,000 items at 60 fps on a mid-range phone, one recycled list. The index is cached on disk, so later opens paint in under 500 ms.
- **Previews**:
  - Placeholder: a muted square, play mark for video.
  - Phone pictures load locally, nothing to decrypt.
  - Others: the stored preview, decrypted off the main thread.
  - Disk keeps previews still locked and clears on sign-out. Memory keeps about 3 screens.
  - Prefetch one screen in the scroll direction. Cancel passed tiles. Scrubbing draws placeholders only.
- **Older pictures without a preview**: the phone makes one for on-screen tiles, 2 at a time, under 25 MB, and attaches it for every device.

## This phone and Stash

- **Each picture appears once**: a backed-up phone picture shows as its Stash copy. Backup must record each picture's Stash file.
- **Not yet sent**: a small Lucide `cloud-upload` mark.
- **Free up space**: not planned. It would delete phone originals on the promise that Stash holds the only copy, which Stash does not make until it has a full export and a second storage backend (ROADMAP, decisions log 2026-11-08).

## Backup strip

One line under the header while something waits. Tap opens this phone's Devices card. Say *photos and videos* when videos are on; singular for 1.

| State | Copy | Button |
|---|---|---|
| Wi-Fi | *48 photos will back up when you're on Wi-Fi* | Back up now |
| Charging | *48 photos will back up when you next charge* | Back up now |
| Both | *48 photos will back up when you next charge on Wi-Fi* | Back up now |
| Sending | *Backing up · 48 to go*, thin progress line | none |
| Done | *Everything on this phone is safe*, 3 s, then gone | none |
| Failed | *3 photos couldn't be backed up* | Try again |

## Viewer

- **Open**: the preview grows from its tile over 300 ms against black, and the full picture fades in over it. Swipe down shrinks into the current picture's tile, or fades if that tile is off screen.
- **Swipe**: 2 neighbours each side prepared ahead; 6 kept.
- **Zoom**: pinch to 4×. Double-tap toggles 2.5× at the tap point. Paging pauses while zoomed.
- **Video**: decrypted to a private temp file, native player, autoplays; the file is deleted on close.
- **Controls** (tap toggles):
  - Top bar: back arrow, *Saturday, 3 March 2025 · 14:22*.
  - **Share** opens the system share sheet.
  - **Save to phone** is hidden if the picture is already on the phone. When done: *Saved to your phone*.
  - **Delete** opens a sheet: *Move to Trash?* *You can restore it from Trash in My drive.* If the picture is also on the phone, it adds *The copy on this phone stays.*
  - **Info** opens a sheet: name, date, size, folder, and *On this phone and safe in Stash*, *Safe in Stash* or *Waiting to back up*.

## Selection

- **Enter**: long-press a tile, then drag to sweep more. A day header's circle selects the day.
- **Top bar**: *3 selected* and close. The back gesture leaves selection.
- **Bottom bar**: Share, Save to phone, Delete (*Move 3 photos to Trash?*).

## States

- **Loading**: placeholder tiles and headers, no spinner.
- **Empty**: *No photos or videos yet.* *Pictures from this phone and your computer gather here as they are backed up.* The button *Back up this phone* shows if backup is off.
- **Offline**: the strip reads *You're offline. Showing what this phone already has.*
- **A failed tile** stays a placeholder, retrying in view.
- **A failed viewer** shows *Couldn't open this one.* and *Try again*.

## Web function to native

| Web | Function | Native |
|---|---|---|
| Month heading, count | Orientation | Sticky day header, month scrubber |
| Responsive columns | Density | Pinch 3/4/6 |
| Lazy load | Load what's seen | Recycled list, prefetch, cancel |
| Travelling thumbnail | Continuity | Shared-element open, swipe-down close |
| Arrows, keys | Next picture | Pager |
| Download | Get the file | Share, Save to phone |
| Close, Escape | Leave | Back gesture, swipe down |
| Make previews for old files | Every tile has a picture | Same, on the phone |
