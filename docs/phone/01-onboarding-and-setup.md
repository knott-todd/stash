# Phone 01: Onboarding and setup

## Carousel (first open, signed out)

Four swiped, snapping slides; dots bottom-centre:

1. **Free.** *There is no plan to upgrade to. No tiers, no trial, no card.*
2. **Unlimited.** *No quota. You will never see "storage full" again.*
3. **Private.** *Every file is encrypted before it is stored. Only you, signed in, can open your files.*
4. **Free. Unlimited. Private. Storage.** Primary **Switch to Stash in 3 easy steps**, under it *Sign in with Google. No card.* and text button **I already have an account**. No dots, no Skip.

**Skip** (top-right, slides 1–3) jumps to slide 4. Back moves one slide left, or leaves from slide 1. Later signed-out opens start at slide 4.

## Setup frame

Each step: segment bar *Step 1 of 3*, title, one line, one bottom button; errors one line above it. Sub-screens keep their step's segment.

## Step 1: Sign in with Google

*Sign in with Google* / *Your files follow your Google account.* **Continue with Google** opens the account picker.

**Decision (new account).** *How private should your files be?* / *You can change this later in Settings.* Stacked cards, web wording, "files" not "photos":
- **Standard**, *Recommended*: *Opens wherever you sign in. Nothing to remember.* / *Stash can open your files, as Google Drive can. We never do unless you share one.* **Use Standard** (primary).
- **Locked**, *More private*: *Only you can open them, with a passcode you choose.* / *Not even Stash can. Forget the passcode and the recovery code, and the files are gone.* **Lock my files** (outlined).

**Choose a passcode.** *You will type this on every new device. Stash never sees it, so Stash cannot reset it.* Passcode, Again, optional hint. Errors *Use at least 6 characters.* / *The two passcodes don't match.* **Next**.

**Your recovery code.** *If you ever forget the passcode, this code opens your files. Write it down somewhere safe.* Large monospace code. Checkbox *I have written the recovery code down.* enables **Lock my files**. Locking happens here, as on the web.

## Step 2: Move my files here

*Move my files here* / *Everything from Google Drive, folders included. Nothing is deleted there.* **Connect Google Drive** opens Google's own consent in a Custom Tab, returning via `stash://`. Text button **I don't use Google Drive** skips.

Running: *Looking through your Google Drive…*, then *Copying 312 of 1,204 files*, bar, current file.

Honestly: the phone copies only while open or held by a foreground notification (*Copying from Google Drive, 312 of 1,204*); Android may still stop it (*Paused. Nothing is lost. Open Stash to carry on.*). It resumes without duplicates, never promising to finish unattended. So **Continue** appears once copying starts; the copy carries on behind.

## Step 3: Back up this phone

*Back up this phone* / *Your photos and videos back up on their own. Nothing is deleted.* Switches *Only on Wi-Fi* (on), *Only while charging* (on), *Include videos*. **Back up this phone** asks for photo access, then starts. Denied: *Stash needs access to your photos to keep them safe.* + **Open settings**. Partial access: *Only the photos you picked will back up.* + **Allow all photos**. **Not now** skips.

## You're in

Full screen, stacked large: *You're in.* / *3 steps.* / *0 passwords.* (Locked: *1 passcode, only yours.*) / *0 GB limit.* Then *1,204 files moving from Google Drive. 3,880 photos will back up on Wi-Fi while charging.* **Open my drive**.

## I already have an account

Picker → if Locked: *Your passcode*, hint, **Open**, *Forgot it? Use the recovery code* → step 3 headed *One step for this phone* → the drive. A new account here: *There's no Stash account for ana@gmail.com yet. Let's make one.* then the decision. Switch path, existing account: no decision; step 2 only if nothing moved yet.

## Back and returning

Step 1 Back returns to slide 4; inside step 1, recovery → passcode → decision. Back never undoes sign-in: on step 2 or 3 it leaves the app. Reopening goes to the first unfinished item: decision, passcode, step 2 (copy resumes), step 3, else the drive.

## Web to native

| Web | Native |
|---|---|
| Landing hero, answers | Carousel |
| Step cards | Full screens, stacked step title |
| Protection cards | Stacked cards |
| Passcode, recovery dialogs | Full screens |
| Green "Linked" | Step struck through in the stack |
| Copy panel, Resume | Notification, automatic resume |
| Devices "My phone" | Step 3 |
| Set up strip | Reopen routing |

## Step screens, revised 2026-11-08

Each step is one full screen: the brand (mark + wordmark) centred at the top, then the three steps stacked as one title, the way the website stacks *Free. Unlimited. Private.* The current step is large in ink (42, semibold, -0.035em tracking); the other two sit in their places, small (22) and faded; steps already done are also struck through. Under the stack, one line of body copy. At the bottom, one primary button and at most one quiet text button.

The stack is the only place progress is shown: no bar, no *Step N of 3*, no circles or ticks, and nothing repeats the title. So step 1's button stays **Continue with Google**, and step 3's button becomes **Start backing up**. A returning account sees the same large title without numeral or stack.
