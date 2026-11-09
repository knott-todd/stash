# 04 · Devices and Settings

## Devices

Title **Devices**, header `Plus` ("Link a device"). Pull-to-refresh, plus refresh on focus.

**This phone's card**, always first, from local state, so it shows before the network answers.
- `Smartphone` icon, name, tag *This phone*.
- One status line: *Up to date · checked 4 min ago* / *Backing up · 120 to go* / *48 waiting · they'll back up when you're on Wi-Fi* (or *next time you charge*) / *Stash can't see your photos* + **Allow photos** / *Enter your passcode to keep backing up* + **Enter passcode**.
- Indented source *Camera roll · 1,204 photos*; text button **Check now** (ignores the rules).
- Switches, saved on toggle, waiting count recounted; only here:
  - **Only on Wi-Fi**: *Never uses mobile data.*
  - **Only while charging**: *The big first backup happens overnight, not in your pocket.*
  - **Include videos**: *Videos are large; turn this off to keep only photos safe.*

**Other devices**: icon, name, *2,310 files · 4.1 GB*, status dot and the web's status lines. Indented sources: label, *n files*, *n waiting*, *n couldn't be sent*; none: *Nothing chosen yet. Pick folders in Stash on that device.*

**Rename, unlink**: tap or long-press a card: bottom sheet with **Rename**, **Unlink** (red). Rename: prefilled field, keyboard up, **Save**. Unlink: native confirm *Unlink {name}? It stops backing up. Everything it already sent stays here.* **Keep linked** · **Unlink**; snackbar *{name} unlinked*, or *Couldn't unlink. Try again.*

**States**: loading: two skeletons under this phone. Alone: *Only this phone so far. Link your computer and its folders stay safe too.* + **Link a device**. Offline: last list, banner *Can't reach Stash right now. Pull down to try again.*

## Link a device (pushed)

*The device you add does the rest on itself.* **My computer** first unless one is linked.
- **My computer**: *Send yourself the installer link and open it on that computer.* **Send the link** opens the share sheet with the web's email text and Windows note.
- **Another phone**: *Install Stash there and continue with the same Google account.* **Send the app link**.
- No QR scanner: the website's code links a phone, and this one is linked. (Open item: an App Link for it.)

## Settings

A grouped native list.

- **Account**: avatar, name, email, *n files*. **Sign out everywhere**, confirm *Sign out of Stash in every browser where this account is signed in? Linked devices keep backing up.* No plain Sign out: on a phone that is unlinking.
- **How your files are protected**: mode and tag (*Standard · Recommended* / *Locked · More private*); tap pushes both options in the web's words.
  - To Locked: setup's full screens (passcode, again, hint *shown to anyone*), then **Your recovery code**, shown once, with **Copy** (clipboard marked sensitive, cleared after a minute), screenshots blocked, *I have written the recovery code down*, **Lock my files**.
  - To Standard: *Enter your passcode once more. After this your files open with just a sign-in.*
  - **Show recovery code** asks for the passcode every time: phones get handed around, and the code opens everything.
- **Imports**: *Where files were moved from. Nothing is deleted at the other end.* *Google Drive · Connected*, **Move again** or **Connect** (in-app browser tab, then the setup progress); long-press **Disconnect**.
- **Take everything with you**: *One zip with every file, in its folders. Do it on a computer; a phone hasn't the room.* **Send me the link** shares the website's Settings address.
- **This phone**: *Linked as {email}*. **Unlink this phone** (red): *It stops backing up and signs out here. Everything already sent stays in Stash.*

Errors sit under their row; the account loads from cache.

## Web function → native

| Web | Phone |
|---|---|
| Pencil, inline input | Action sheet, rename sheet |
| Unlink icon, `confirm()` | Action sheet, native confirm, snackbar |
| 60 s polling | Pull-to-refresh, refresh on focus |
| Email me, Copy link, Export | Share sheet |
| Modal dialogs | Full screens, bottom sheets |
| Select-all recovery code | Copy, sensitive clipboard |

## Not on the phone

- **Choose folders**, **Download for Windows**, *This computer*, the *Your phone* stand-in card.
- The QR code, *Something else*, hover titles.
- Export; a separate Sign out.
