package com.quizcraft.app

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

@Suppress("DEPRECATION")
@TauriPlugin
class AppUpdatesPlugin(private val activity: Activity) : Plugin(activity) {
  private data class Release(val version: String, val notes: String, val url: String, val size: Long, val sha256: String) {
    fun json() = JSONObject().put("version", version).put("notes", notes).put("url", url)
      .put("size", size).put("sha256", sha256)
  }
  private data class State(val phase: String = "idle", val release: Release? = null,
    val downloaded: Long = 0, val message: String = "", val error: String = "")

  private val worker = Executors.newSingleThreadExecutor()
  private val lock = Any()
  @Volatile private var state = State()
  private val directory = File(activity.cacheDir, "app-updates")
  private val apk = File(directory, "update.apk")
  private val metadata = File(directory, "release.json")
  private val installed: PackageInfo get() = activity.packageManager.getPackageInfo(activity.packageName, signatureFlags())
  private val currentCode: Long get() = packageCode(installed)
  private val busy: Boolean get() = state.phase in setOf("checking", "downloading", "verifying")

  init {
    // Restore only a fully verified APK. An interrupted .part file is never installed.
    state = State(phase = "checking")
    worker.execute {
      try {
        if (metadata.isFile && apk.isFile) {
          val data = JSONObject(metadata.readText())
          val release = Release(data.getString("version"), data.optString("notes"), data.getString("url"),
            data.getLong("size"), UpdatePolicy.checksum(data.getString("sha256")))
          require(release.url == UpdatePolicy.assetUrl(release.version, "QuizCraft-${release.version}-android-arm64.apk"))
          verifyApk(release)
          state = State("ready", release, release.size)
        } else state = State()
      } catch (_: Exception) {
        apk.delete()
        metadata.delete()
        state = State()
      }
      File(directory, "update.part").delete()
    }
  }

  private fun signatureFlags() = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
  private fun packageCode(info: PackageInfo) = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
  private fun signatures(info: PackageInfo): Set<String> {
    val values = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return values?.map { signature -> MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
      .joinToString("") { "%02x".format(it) } }?.toSet() ?: emptySet()
  }
  private fun canInstall() = Build.VERSION.SDK_INT < 26 || activity.packageManager.canRequestPackageInstalls()

  private fun snapshot(): JSObject {
    val value = state
    return JSObject().apply {
      put("phase", value.phase)
      put("currentVersion", installed.versionName ?: BuildConfig.VERSION_NAME)
      put("latestVersion", value.release?.version ?: "")
      put("hasUpdate", value.release?.let { UpdatePolicy.versionCode(it.version) > currentCode } ?: false)
      put("notes", value.release?.notes ?: "")
      put("downloadedBytes", value.downloaded)
      put("totalBytes", value.release?.size ?: 0)
      put("canInstall", canInstall())
      put("message", value.message)
      put("error", value.error)
    }
  }

  @Command fun status(invoke: Invoke) { invoke.resolve(snapshot()) }

  private fun start(invoke: Invoke, phase: String, operation: () -> Unit) {
    val previous: State
    synchronized(lock) {
      if (busy) { invoke.resolve(snapshot()); return }
      previous = state
      state = state.copy(phase = phase, downloaded = if (phase == "downloading") 0 else state.downloaded,
        error = "", message = "")
    }
    invoke.resolve(snapshot())
    worker.execute {
      try { operation() }
      catch (error: Exception) {
        state = state.copy(phase = if (phase == "checking" && previous.phase == "ready") "ready" else "error",
          error = if (error is IOException) "Unable to reach the update service. Check your connection and try again."
            else error.message ?: "Unable to update. Please try again.")
      }
    }
  }

  @Command fun check(invoke: Invoke) = start(invoke, "checking") {
    val release = latestRelease()
    if (UpdatePolicy.versionCode(release.version) <= currentCode) {
      apk.delete()
      metadata.delete()
      state = State("current", release)
    } else {
      val cached = runCatching { verifyApk(release); true }.getOrDefault(false)
      state = State(if (cached) "ready" else "available", release, if (cached) release.size else 0)
    }
  }

  @Command fun download(invoke: Invoke) {
    val release = state.release
    if (release == null || UpdatePolicy.versionCode(release.version) <= currentCode) {
      invoke.reject("Check for an update first."); return
    }
    start(invoke, "downloading") {
      directory.mkdirs()
      val partial = File(directory, "update.part")
      val connection = connect(release.url)
      try {
        connection.inputStream.use { input ->
          partial.outputStream().use { output ->
            UpdatePolicy.copyVerified(input, output, release.size, release.sha256) { count ->
              state = state.copy(downloaded = count)
            }
          }
        }
        state = state.copy(phase = "verifying")
        if (apk.exists()) require(apk.delete()) { "Unable to replace the previous download." }
        require(partial.renameTo(apk)) { "Unable to save the download." }
        verifyApk(release)
        metadata.writeText(release.json().toString())
        state = State("ready", release, release.size)
      } catch (error: Exception) {
        partial.delete()
        apk.delete()
        metadata.delete()
        throw error
      } finally { connection.disconnect() }
    }
  }

  @Command fun allow(invoke: Invoke) {
    if (Build.VERSION.SDK_INT >= 26 && !canInstall()) {
      try {
        activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${activity.packageName}")))
      } catch (_: Exception) { invoke.reject("Open Android Settings and allow QuizCraft to install app updates."); return }
    }
    invoke.resolve(snapshot())
  }

  @Command fun install(invoke: Invoke) {
    val release = state.release
    if (state.phase != "ready" || release == null) { invoke.reject("Download and verify the update first."); return }
    if (!canInstall()) { invoke.reject("Allow QuizCraft to install app updates first."); return }
    start(invoke, "verifying") {
      verifyApk(release)
      activity.runOnUiThread {
        try {
          val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
          activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          })
          state = State("ready", release, release.size, "Confirm the update in Android’s installer. Your flashcards stay on this device.")
        } catch (_: Exception) {
          state = state.copy(phase = "ready", error = "Android could not open the installer. Please try again.")
        }
      }
    }
  }

  private fun verifyApk(release: Release) {
    require(UpdatePolicy.versionCode(release.version) > currentCode) { "This update is already installed." }
    require(apk.isFile && apk.length() == release.size) { "Download the update again." }
    apk.inputStream().use { input ->
      UpdatePolicy.copyVerified(input, object : java.io.OutputStream() {
        override fun write(value: Int) {}
        override fun write(bytes: ByteArray, offset: Int, count: Int) {}
      }, release.size, release.sha256) {}
    }
    val archive = activity.packageManager.getPackageArchiveInfo(apk.absolutePath, signatureFlags())
      ?: error("Android could not read the update.")
    require(archive.packageName == activity.packageName && archive.versionName == release.version &&
      packageCode(archive) == UpdatePolicy.versionCode(release.version)) { "This file is not the expected QuizCraft update." }
    val currentSignatures = signatures(installed)
    require(currentSignatures.isNotEmpty() && currentSignatures == signatures(archive)) {
      "This update uses a different signing key. Install the official release version to receive updates."
    }
  }

  private fun latestRelease(): Release {
    val json = JSONObject(readText("https://api.github.com/repos/${UpdatePolicy.REPOSITORY}/releases/latest", true))
    require(!json.optBoolean("draft") && !json.optBoolean("prerelease")) { "No stable update is available." }
    val tag = json.getString("tag_name")
    require(tag.startsWith("v")) { "Invalid release version." }
    val version = tag.removePrefix("v")
    UpdatePolicy.versionCode(version)
    val name = "QuizCraft-$version-android-arm64.apk"
    val assets = json.getJSONArray("assets")
    val asset = (0 until assets.length()).map { assets.getJSONObject(it) }
      .firstOrNull { it.optString("name") == name && it.optString("state") == "uploaded" }
      ?: error("The Android update has not been uploaded yet. Try again later.")
    val url = UpdatePolicy.assetUrl(version, name)
    require(asset.getString("browser_download_url") == url) { "Unexpected update location." }
    val size = asset.getLong("size")
    require(size in 1..UpdatePolicy.MAX_APK_BYTES) { "Unexpected update size." }
    val digest = asset.optString("digest")
    val checksum = if (digest.startsWith("sha256:")) UpdatePolicy.checksum(digest) else {
      val sums = readText(UpdatePolicy.assetUrl(version, "SHA256SUMS.txt"))
      val match = sums.lineSequence().map { it.trim().split(Regex("\\s+"), limit = 2) }
        .firstOrNull { it.size == 2 && it[1].removePrefix("*") == name }
        ?: error("The update checksum has not been uploaded yet. Try again later.")
      UpdatePolicy.checksum(match[0])
    }
    return Release(version, json.optString("body").take(100_000), url, size, checksum)
  }

  private fun connect(address: String, api: Boolean = false): HttpsURLConnection {
    var url = address
    repeat(6) {
      require((api && url == "https://api.github.com/repos/${UpdatePolicy.REPOSITORY}/releases/latest") ||
        (!api && UpdatePolicy.allowedDownloadUrl(url))) { "Untrusted update location." }
      val connection = URL(url).openConnection() as HttpsURLConnection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 15_000
      connection.readTimeout = 30_000
      connection.setRequestProperty("User-Agent", "QuizCraft/${BuildConfig.VERSION_NAME}")
      if (api) {
        connection.setRequestProperty("Accept", "application/vnd.github+json")
        connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
      }
      val code = try { connection.responseCode } catch (error: Exception) { connection.disconnect(); throw error }
      if (!api && code in setOf(301, 302, 303, 307, 308)) {
        val location = connection.getHeaderField("Location") ?: error("The download moved. Try checking again.")
        connection.disconnect()
        url = URL(URL(url), location).toString()
      } else {
        if (code != 200) {
          connection.disconnect()
          error(when (code) {
            403, 429 -> "Update checks are temporarily limited. Please try again later."
            404 -> "No Android update is available yet."
            else -> "Unable to reach the update service. Check your connection and try again."
          })
        }
        return connection
      }
    }
    error("Too many download redirects. Try again later.")
  }

  private fun readText(address: String, api: Boolean = false): String {
    val connection = connect(address, api)
    return try {
      connection.inputStream.use { input ->
        val bytes = input.readBytesLimited(1_048_576)
        bytes.toString(Charsets.UTF_8)
      }
    } finally { connection.disconnect() }
  }
}

private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
  val bytes = readNBytesCompat(limit + 1)
  require(bytes.size <= limit) { "The update response was too large." }
  return bytes
}

// Java 9 stream helpers are unavailable on older supported Android versions.
private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
  val output = java.io.ByteArrayOutputStream()
  val buffer = ByteArray(8192)
  while (output.size() < limit) {
    val count = read(buffer, 0, minOf(buffer.size, limit - output.size()))
    if (count < 0) break
    output.write(buffer, 0, count)
  }
  return output.toByteArray()
}
