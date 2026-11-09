package expo.modules.stashshare

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// "Save to Stash" from other apps. Android hands the app an intent (SEND or SEND_MULTIPLE)
// carrying content URIs and/or text. This reads it, with each file's name, type and size,
// and clears the intent's action so the same share is never handled twice. A share that
// arrives while the app is open comes through OnNewIntent as the "onShared" event.

class StashShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StashShare")
    Events("onShared")

    // The share that opened the app, if any.
    Function("getShared") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      return@Function read(intent)
    }

    OnNewIntent { intent ->
      val payload = read(intent) ?: return@OnNewIntent
      sendEvent("onShared", payload)
    }
  }

  private fun read(intent: Intent): Map<String, Any?>? {
    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return null
    // Reopened from recents after the process died: Android replays the old share. Ignore it.
    if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
      intent.action = null
      return null
    }

    val uris = LinkedHashSet<Uri>()
    if (action == Intent.ACTION_SEND) stream(intent)?.let { uris.add(it) }
    else streams(intent)?.let { uris.addAll(it) }
    // Some apps only fill the clip data.
    intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) } }

    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.takeIf { it.isNotBlank() }
    intent.action = null // handled
    if (uris.isEmpty() && text == null) return null

    val files = uris.map { describe(it, intent.type) }
    return mapOf("uris" to uris.map { it.toString() }, "files" to files, "text" to text)
  }

  private fun describe(uri: Uri, intentType: String?): Map<String, Any?> {
    val resolver = appContext.reactContext?.contentResolver
    var name: String? = null
    var size = 0.0
    try {
      resolver?.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
          val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val s = c.getColumnIndex(OpenableColumns.SIZE)
          if (n >= 0 && !c.isNull(n)) name = c.getString(n)
          if (s >= 0 && !c.isNull(s)) size = c.getLong(s).toDouble()
        }
      }
    } catch (_: Exception) {}
    if (name.isNullOrBlank()) name = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "Shared file"
    val ext = name!!.substringAfterLast('.', "").lowercase()
    val mime = try { resolver?.getType(uri) } catch (_: Exception) { null }
      ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
      ?: intentType?.takeIf { !it.contains('*') }
      ?: "application/octet-stream"
    return mapOf("uri" to uri.toString(), "name" to name, "mime" to mime, "size" to size)
  }

  @Suppress("DEPRECATION")
  private fun stream(intent: Intent): Uri? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri

  @Suppress("DEPRECATION")
  private fun streams(intent: Intent): List<Uri>? =
    if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
}
