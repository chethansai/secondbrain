package com.notes.nativenotetaking.voicerecorder

import android.content.Context
import java.io.File
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

object VoiceRecorderStore {
  private const val prefsName = "rnnotetaking.voiceRecorder.settings"
  private const val keyEnabled = "enabled"
  private const val keyDurationSeconds = "durationSeconds"
  private const val recordingsDirName = "voice-recordings"
  private const val metadataFileName = "recordings.json"
  private const val maxDurationSeconds = 24 * 60 * 60

  data class Settings(val enabled: Boolean, val durationSeconds: Int)
  data class Recording(
    val id: String,
    val uri: String,
    val fileName: String,
    val durationMs: Long,
    val createdAt: String,
    val completedAt: String,
    val sizeBytes: Long,
  )

  fun readSettings(context: Context): Settings {
    val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
    return Settings(
      enabled = prefs.getBoolean(keyEnabled, false),
      durationSeconds = prefs.getInt(keyDurationSeconds, 300).coerceIn(1, maxDurationSeconds),
    )
  }

  fun writeSettings(context: Context, settings: Settings) {
    context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(keyEnabled, settings.enabled)
      .putInt(keyDurationSeconds, settings.durationSeconds.coerceIn(1, maxDurationSeconds))
      .apply()
  }

  fun recordingsDir(context: Context): File {
    return File(context.filesDir, recordingsDirName).apply { mkdirs() }
  }

  fun createRecordingFile(context: Context): Pair<String, File> {
    val id = UUID.randomUUID().toString()
    val file = File(recordingsDir(context), "voice-$id.m4a")
    return Pair(id, file)
  }

  fun addRecording(context: Context, recording: Recording) {
    val recordings = listRecordings(context).toMutableList()
    recordings.removeAll { it.id == recording.id }
    recordings.add(0, recording)
    writeRecordings(context, recordings)
  }

  fun listRecordings(context: Context): List<Recording> {
    val file = metadataFile(context)
    if (!file.exists()) return emptyList()
    return try {
      val array = JSONArray(file.readText())
      buildList {
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          add(
            Recording(
              id = item.optString("id"),
              uri = item.optString("uri"),
              fileName = item.optString("fileName"),
              durationMs = item.optLong("durationMs"),
              createdAt = item.optString("createdAt"),
              completedAt = item.optString("completedAt"),
              sizeBytes = item.optLong("sizeBytes"),
            ),
          )
        }
      }.filter { it.id.isNotBlank() && it.uri.isNotBlank() }
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun deleteRecording(context: Context, id: String): Boolean {
    val recordings = listRecordings(context)
    val recording = recordings.firstOrNull { it.id == id } ?: return false
    fileFromUri(recording.uri)?.delete()
    writeRecordings(context, recordings.filterNot { it.id == id })
    return true
  }

  private fun writeRecordings(context: Context, recordings: List<Recording>) {
    val array = JSONArray()
    recordings.forEach { recording ->
      array.put(JSONObject().apply {
        put("id", recording.id)
        put("uri", recording.uri)
        put("fileName", recording.fileName)
        put("durationMs", recording.durationMs)
        put("createdAt", recording.createdAt)
        put("completedAt", recording.completedAt)
        put("sizeBytes", recording.sizeBytes)
      })
    }
    metadataFile(context).writeText(array.toString())
  }

  private fun metadataFile(context: Context): File {
    return File(recordingsDir(context), metadataFileName)
  }

  private fun fileFromUri(uri: String): File? {
    if (!uri.startsWith("file://")) return null
    return File(uri.removePrefix("file://"))
  }
}
