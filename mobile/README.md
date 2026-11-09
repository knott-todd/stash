# Stash for phones (Android build, first device test pending)

Journey 1: link once, allow photos once, then every photo and video backs up on
its own. Same server contract as the browser and Stash Desktop: device link
code, device token, encrypted pieces, status reports to the Devices page.

**Status (2026-11-08): type-checks, dependencies aligned to Expo SDK 54, Android
release APK builds on Olusanya's machine. Not yet run on a phone.** Known soft spots:

- `react-native-quick-crypto` provides WebCrypto (AES-GCM, PBKDF2); its
  `install()` must run before any crypto call.
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

Needs a native build (not Expo Go) because of `react-native-quick-crypto` and
background tasks. iOS needs the Apple developer account for a device build.

## Android build on Windows (what worked)

Toolchain in user folders, no admin: JDK at `C:Usersolusaandroid-toolsjdk-17.0.21.0.2+1`,
SDK at `C:Usersolusaandroid-toolssdk` (platform-tools, platforms;android-36, build-tools;36.0.0).

```
cd mobile
npm install
npx expo prebuild --platform android --no-install
echo sdk.dir=C:\Users\olusa\android-tools\sdk > android/local.properties
set JAVA_HOME=C:Usersolusaandroid-toolsjdk-17.0.21.0.2+1
set ANDROID_HOME=C:Usersolusaandroid-toolssdk
androidgradlew.bat assembleRelease
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`, signed with the debug
key (fine for sideloading onto your own phone; Play needs a release key). `android/` is
generated and not committed.

## Install on a phone

Copy the APK to the phone (or `adb install app-release.apk` with USB debugging on), allow
"install from this source", open Stash, tap **Get a code**, approve it in the browser where
you are signed in, then **Allow access to photos**.
