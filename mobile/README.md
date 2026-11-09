# Stash for phones (Android build, first device test pending)

Journey 1: link once, allow photos once, then every photo and video backs up on
its own. Same server contract as the browser and Stash Desktop: device link
code, device token, encrypted pieces, status reports to the Devices page.

**Status (2026-11-08): type-checks, dependencies aligned to Expo SDK 54, Android
release APK builds on Olusanya's machine. Not yet run on a phone.** Known soft spots:

- Crypto is pure JavaScript (`@noble/ciphers` AES-GCM, `@noble/hashes` PBKDF2),
  so there is no native crypto module to build. Slower than native but fine for photos.
- Uses the ledger upload contract (`POST /api/uploads`, pieces under that id).
- Uploads read whole files into memory and send them as data URIs through
  `FormData`; fine for photos, heavy for long videos. A streaming upload
  (`expo-file-system` `uploadAsync` per piece) is the next step.
- Background runs are at the OS's discretion: iOS a few times a day, Android
  about every 15 minutes. Opening the app sends everything waiting at once.
- `expo-device` is used for the device name; add it with `npx expo install expo-device`.

## Run

```
cd mobile
npm install
npx expo install --fix
npx expo run:ios     # or run:android
```

Needs a native build (not Expo Go) because of background tasks and the media library. iOS needs the Apple developer account for a device build.

## Android build on Windows (what worked)

Toolchain in user folders, no admin: JDK at `C:\Users\olusa\android-tools\jdk17`,
SDK at `C:\Users\olusa\android-tools\sdk` (platform-tools, platforms;android-36, build-tools;36.0.0).

```
cd mobile
npm install
npx expo prebuild --platform android --no-install
echo sdk.dir=C:/Users/olusa/android-tools/sdk > android/local.properties
set JAVA_HOME=C:\Users\olusa\android-tools\jdk17
set ANDROID_HOME=C:\Users\olusa\android-tools\sdk
android\gradlew.bat assembleRelease
```

`sdk.dir` takes forward slashes: backslashes are escape characters in a properties file
and the path comes out mangled ("volume label syntax is incorrect").

Three more things that were needed on this machine:

- **Short path.** The C++ parts of Expo mirror the absolute source path inside their build
  folders and blow past the Windows path limit under `DocumentsDev...`. Copy the project to
  `C:stm` (robocopy, keep `node_modules`, skip `.cxx`) and build there. A junction is not
  enough: autolinking resolves it back to the real path.
- **Phone ABIs only, no parallel.** In `android/gradle.properties`:
  `reactNativeArchitectures=arm64-v8a,armeabi-v7a` and `org.gradle.parallel=false`, and run
  with `--max-workers=2`. Heavy parallel clang runs hit transient "cannot open file" errors
  on NDK headers (antivirus scanning); fewer workers made it reliable.
- **Own entry file.** `index.ts` registers the app; `main` in package.json points at it, so the
  bundler entry lives inside the project.

Built 2026-11-08: `exports/android/Stash-0.1.0.apk` (30 MB).

The APK is `android/app/build/outputs/apk/release/app-release.apk`, signed with the debug
key (fine for sideloading onto your own phone; Play needs a release key). `android/` is
generated and not committed.

## Install on a phone

Copy the APK to the phone (or `adb install app-release.apk` with USB debugging on), allow
"install from this source", open Stash, tap **Get a code**, approve it in the browser where
you are signed in, then **Allow access to photos**.
