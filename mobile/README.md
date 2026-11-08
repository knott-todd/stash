# Stash for phones (scaffold, untested)

Journey 1: link once, allow photos once, then every photo and video backs up on
its own. Same server contract as the browser and Stash Desktop: device link
code, device token, encrypted pieces, status reports to the Devices page.

**Status: written without a device or simulator to run it on. Expect to fix
things on first run.** Known soft spots:

- `react-native-quick-crypto` provides WebCrypto (AES-GCM, PBKDF2); its
  `install()` must run before any crypto call. Versions in `package.json` are
  from memory; run `npx expo install --fix`.
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
