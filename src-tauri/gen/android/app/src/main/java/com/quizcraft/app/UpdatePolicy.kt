package com.quizcraft.app

import java.io.InputStream
import java.io.OutputStream
import java.net.URI
import java.security.MessageDigest

internal object UpdatePolicy {
  const val REPOSITORY = "JavinezCyver/QuizCraft"
  const val MAX_APK_BYTES = 150L * 1024 * 1024

  fun versionCode(version: String): Long {
    require(Regex("[0-9]+\\.[0-9]+\\.[0-9]+").matches(version)) { "Invalid release version." }
    val parts = version.split('.').map { it.toLong() }
    require(parts[1] < 1000 && parts[2] < 1000 && parts[0] <= 2147) { "Unsupported release version." }
    val code = parts[0] * 1_000_000 + parts[1] * 1000 + parts[2]
    require(code in 1..Int.MAX_VALUE.toLong()) { "Unsupported release version." }
    return code
  }

  fun assetUrl(version: String, name: String): String {
    versionCode(version)
    require(name == "QuizCraft-$version-android-arm64.apk" || name == "SHA256SUMS.txt") {
      "Unexpected update file."
    }
    return "https://github.com/$REPOSITORY/releases/download/v$version/$name"
  }

  fun allowedDownloadUrl(url: String): Boolean = runCatching {
    val uri = URI(url)
    uri.scheme == "https" && uri.userInfo == null && (uri.port == -1 || uri.port == 443) &&
      (uri.host in setOf("release-assets.githubusercontent.com", "objects.githubusercontent.com",
        "github-releases.githubusercontent.com") ||
        (uri.host == "github.com" && uri.path.startsWith("/$REPOSITORY/releases/download/")))
  }.getOrDefault(false)

  fun checksum(digest: String): String {
    val value = digest.removePrefix("sha256:").lowercase()
    require(Regex("[a-f0-9]{64}").matches(value)) { "The update checksum is missing or invalid." }
    return value
  }

  fun copyVerified(input: InputStream, output: OutputStream, size: Long, sha256: String, progress: (Long) -> Unit) {
    require(size in 1..MAX_APK_BYTES) { "Unexpected update size." }
    val expected = checksum(sha256)
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    var total = 0L
    while (true) {
      val count = input.read(buffer)
      if (count < 0) break
      total += count
      require(total <= size) { "The download is larger than expected." }
      output.write(buffer, 0, count)
      digest.update(buffer, 0, count)
      progress(total)
    }
    require(total == size) { "The download was interrupted. Try again." }
    val actual = digest.digest().joinToString("") { "%02x".format(it) }
    require(actual == expected) { "The update could not be verified. Download it again." }
  }
}
