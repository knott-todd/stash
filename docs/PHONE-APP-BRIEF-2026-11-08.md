# Stash on the phone: brief (2026-11-08, revised)

Agreed framing (Olusanya, 2026-11-08): the phone app **is Stash**, the same product as the website, fully native, not a photo-backup utility and not a web view. The user flows and journeys already established for the website stay intact on the phone; the phone adds the one thing only a phone can do, backing itself up automatically and quietly.

North star, from the landing page: **Free. Unlimited. Private. Storage.** Setup is two steps: move your existing cloud here, then switch on automatic backup. The person deals with one entity.

## 1. Native, screen for screen

Every screen is native, built against the API the website already uses. Nothing is a web view: scrolling, back, images, the share sheet and the keyboard behave like the phone's own. The server does not change for this; every screen has its endpoints already.

What carries over from the current build: native Google sign-in and its server endpoint, the native crypto module, the backup engine with the Wi-Fi and charging rules, chunked uploads, the device self-unlink.

## 2. The journey

**First open: onboarding.** The carousel every app has, with our landing page as its content, one promise per slide:

1. *Free.* There is no plan to upgrade to. No tiers, no trial, no card.
2. *Unlimited.* No quota. You will never see "storage full" again.
3. *Private.* Every file is encrypted before it is stored. Only you, signed in, can open your files.
4. The call to action: **Switch to Stash in 3 easy steps**, and under it the secondary **I already have an account**.

**Switch to Stash (new person).** The same three steps as the website, each a **full screen of its own** so nothing overwhelms: one step, one action, next. When the third is done, a single **"You're in"** moment (the website's "You're in. 3 steps. 0 passwords. 0 GB limit." feeling) before the drive appears.

1. **Sign in with Google.** The phone's account picker, one tap. A new account answers the Standard or Locked question next, worded as on the web.
2. **Move my files here.** Google Drive (and the others when enabled): connect, see what was found, the copy runs with progress and resumes if interrupted, same as the web.
3. **Back up this phone.** The photo permission and the switch. From then on it runs itself, only on Wi-Fi and while charging unless changed.

Then the drive, with their files in it.

**I already have an account.** Sign in with Google (passcode once if Locked), then straight to **Back up this phone**, because that is the only setup a phone can add to an account that exists. Then the drive, with everything already in it. This is the website's "connect your phone" step, finished on the phone.

**Every open after that.** The drive. Backup runs by itself; the Devices page shows this phone as a card like any other device; a one-line strip on Photos when something is waiting (*48 photos will back up when you next charge on Wi-Fi*).

## 3. Screens, in build order

1. **Onboarding and setup.** The carousel, sign-in, the Standard or Locked decision, the passcode, Move my files here, Back up this phone.
2. **My drive.** Folders and files, open and download, upload from the share sheet and the file picker, rename, move, trash, get link. The same header as the web: My drive, Photos, Devices, Settings.
3. **Photos.** The grid by day, native image loading, the lightbox with swipe, select and share through the system share sheet, the backup strip.
4. **Devices.** The same cards as the web; this phone's card with its rules (Wi-Fi only, charging only, include videos) editable in place; Link a device.
5. **Settings.** Account, protection and recovery code, Imports, export, sign out.

Each screen goes to Olusanya's phone as it lands, because feel is the point.

## 4. Design rule for every screen

Every existing page is designed again for the phone, with attention specific to mobile app design. Translate the **function** of each web element into the native concept that serves it; never drop the browser element in. Examples: a toolbar of buttons becomes a bottom sheet or a floating action button; a kebab menu becomes a long-press or a swipe action; a modal dialog becomes a sheet; breadcrumbs become a navigation stack with a back gesture; a hover state does not exist, so the information it carried moves somewhere a thumb can reach; a table becomes a list with the two facts that matter. Each screen gets its own short design spec (docs/phone/*.md) before it is built, written by a designer agent working from this brief and the web screen's function.

## 5. Copy rules

Same as the website. Never "encrypted pieces", "key", "token", "device link", "sync". Say what it means: *safe*, *only you can open them*, *on their own*. Numbers are photos and files, never bytes, except where the web already shows size.

## 6. Not doing

- A web view of any screen.
- A separate native "home" or status screen: the drive is home, the Devices page is status.
- iOS now. The code is portable; a device build needs the Apple developer account.
- Changes to the mobile website until the app is done.
