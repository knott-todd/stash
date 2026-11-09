import { requireOptionalNativeModule } from "expo-modules-core";

// Android's own crypto (see android/.../StashCryptoModule.kt). Null where the module is
// not built in, so callers can fall back to pure JavaScript.
export type StashCryptoNative = {
  pbkdf2(passcode: string, saltB64: string, iterations: number): Promise<string>;
  gcmDecrypt(keyB64: string, ivB64: string, ctB64: string): Promise<string>;
  gcmEncrypt(keyB64: string, plainB64: string): Promise<string>;
};

export const StashCrypto = requireOptionalNativeModule<StashCryptoNative>("StashCrypto");
