package expo.modules.stashcrypto

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

// The account's crypto, done by Android itself: PBKDF2-SHA256 to open a Locked account's
// key with the passcode, and AES-GCM for every piece. Same byte layout as the browser and
// Stash Desktop: 12-byte IV, ciphertext, 16-byte tag. Everything crosses the bridge as base64.

class StashCryptoModule : Module() {
  private val random = SecureRandom()

  private fun b64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)
  private fun unb64(s: String): ByteArray = Base64.decode(s, Base64.DEFAULT)

  override fun definition() = ModuleDefinition {
    Name("StashCrypto")

    // 32-byte key from a passcode (already NFKC-normalised by the caller) and a salt.
    AsyncFunction("pbkdf2") { passcode: String, saltB64: String, iterations: Int ->
      val spec = PBEKeySpec(passcode.toCharArray(), unb64(saltB64), iterations, 256)
      val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
      b64(key)
    }

    // AES-GCM decrypt: key, iv, ciphertext||tag -> plaintext.
    AsyncFunction("gcmDecrypt") { keyB64: String, ivB64: String, ctB64: String ->
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(unb64(keyB64), "AES"), GCMParameterSpec(128, unb64(ivB64)))
      b64(cipher.doFinal(unb64(ctB64)))
    }

    // AES-GCM encrypt with a fresh random IV -> iv||ciphertext||tag.
    AsyncFunction("gcmEncrypt") { keyB64: String, plainB64: String ->
      val iv = ByteArray(12).also { random.nextBytes(it) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(unb64(keyB64), "AES"), GCMParameterSpec(128, iv))
      val ct = cipher.doFinal(unb64(plainB64))
      b64(iv + ct)
    }
  }
}
