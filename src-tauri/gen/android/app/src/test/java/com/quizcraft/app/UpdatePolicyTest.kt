package com.quizcraft.app

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import org.junit.Assert.*
import org.junit.Test

class UpdatePolicyTest {
  private fun rejects(block: () -> Unit) {
    try { block(); fail("Expected the update to be rejected") } catch (_: IllegalArgumentException) {}
  }
  private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it) }

  @Test fun versionsMatchAndroidAndCompareNumerically() {
    assertEquals(1000006L, UpdatePolicy.versionCode("1.0.6"))
    assertTrue(UpdatePolicy.versionCode("1.0.10") > UpdatePolicy.versionCode("1.0.9"))
    assertTrue(UpdatePolicy.versionCode("1.1.0") > UpdatePolicy.versionCode("1.0.999"))
    assertTrue(UpdatePolicy.versionCode("2.0.0") > UpdatePolicy.versionCode("1.999.999"))
  }

  @Test fun rejectsPreReleasesInvalidVersionsAndOverflows() {
    listOf("1.0.7-beta", "v1.0.7", "1.0", "1.0.1000", "1.1000.0", "2148.0.0", "0.0.0", "999999999999999999999.1.1")
      .forEach { rejects { UpdatePolicy.versionCode(it) } }
  }

  @Test fun assetsAreBoundToTheExactRepositoryVersionAndName() {
    assertEquals("https://github.com/JavinezCyver/QuizCraft/releases/download/v1.0.7/QuizCraft-1.0.7-android-arm64.apk",
      UpdatePolicy.assetUrl("1.0.7", "QuizCraft-1.0.7-android-arm64.apk"))
    rejects { UpdatePolicy.assetUrl("1.0.7", "QuizCraft-1.0.6-android-arm64.apk") }
    rejects { UpdatePolicy.assetUrl("1.0.7", "../../other.apk") }
  }

  @Test fun redirectsAllowOnlyHttpsGitHubReleaseHosts() {
    assertTrue(UpdatePolicy.allowedDownloadUrl("https://release-assets.githubusercontent.com/github-production-release-asset/123?token=example"))
    assertTrue(UpdatePolicy.allowedDownloadUrl(UpdatePolicy.assetUrl("1.0.7", "SHA256SUMS.txt")))
    listOf("http://release-assets.githubusercontent.com/a", "https://evil.example/a", "https://github.com/another/repo/a",
      "https://github.com.evil.example/JavinezCyver/QuizCraft/releases/download/a", "https://user@release-assets.githubusercontent.com/a",
      "https://release-assets.githubusercontent.com:8080/a").forEach { assertFalse(UpdatePolicy.allowedDownloadUrl(it)) }
  }

  @Test fun checksumRequiresExactlySha256() {
    val sha = "ab".repeat(32)
    assertEquals(sha, UpdatePolicy.checksum("sha256:$sha"))
    assertEquals(sha, UpdatePolicy.checksum(sha.uppercase()))
    listOf("", "abcd", "sha512:$sha", "gg".repeat(32)).forEach { rejects { UpdatePolicy.checksum(it) } }
  }

  @Test fun downloadsVerifyEveryByteAndReportProgress() {
    val bytes = ByteArray(140_000) { (it % 127).toByte() }
    val output = ByteArrayOutputStream()
    val progress = mutableListOf<Long>()
    UpdatePolicy.copyVerified(ByteArrayInputStream(bytes), output, bytes.size.toLong(), hash(bytes)) { progress.add(it) }
    assertArrayEquals(bytes, output.toByteArray())
    assertEquals(bytes.size.toLong(), progress.last())
    assertTrue(progress.zipWithNext().all { it.second > it.first })
  }

  @Test fun interruptedExcessAndTamperedDownloadsAreRejected() {
    val bytes = "QuizCraft update".toByteArray()
    rejects { UpdatePolicy.copyVerified(ByteArrayInputStream(bytes), ByteArrayOutputStream(), bytes.size + 1L, hash(bytes)) {} }
    rejects { UpdatePolicy.copyVerified(ByteArrayInputStream(bytes), ByteArrayOutputStream(), bytes.size - 1L, hash(bytes)) {} }
    rejects { UpdatePolicy.copyVerified(ByteArrayInputStream(bytes), ByteArrayOutputStream(), bytes.size.toLong(), "00".repeat(32)) {} }
    rejects { UpdatePolicy.copyVerified(ByteArrayInputStream(bytes), ByteArrayOutputStream(), 0L, hash(bytes)) {} }
    rejects { UpdatePolicy.copyVerified(ByteArrayInputStream(bytes), ByteArrayOutputStream(), UpdatePolicy.MAX_APK_BYTES + 1, hash(bytes)) {} }
  }
}
