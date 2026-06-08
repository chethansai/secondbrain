package com.notes.nativenotetaking.voicerecorder

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class VoiceRecorderModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "VoiceRecorderModule"

  @ReactMethod
  fun startRecording(settings: ReadableMap, promise: Promise) {
    val durationSeconds = if (settings.hasKey("durationSeconds") && !settings.isNull("durationSeconds")) {
      settings.getDouble("durationSeconds").toInt()
    } else {
      VoiceRecorderStore.readSettings(reactContext).durationSeconds
    }.coerceIn(1, maxDurationSeconds)

    VoiceRecorderStore.writeSettings(reactContext, VoiceRecorderStore.Settings(true, durationSeconds))
    val intent = Intent(reactContext, VoiceRecorderService::class.java).apply {
      action = VoiceRecorderService.ACTION_START
      putExtra(VoiceRecorderService.EXTRA_DURATION_SECONDS, durationSeconds)
    }
    startRecorderService(intent)
    promise.resolve(true)
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    val current = VoiceRecorderStore.readSettings(reactContext)
    VoiceRecorderStore.writeSettings(reactContext, current.copy(enabled = false))
    startRecorderService(Intent(reactContext, VoiceRecorderService::class.java).apply {
      action = VoiceRecorderService.ACTION_STOP
    })
    promise.resolve(true)
  }

  @ReactMethod
  fun listRecordings(promise: Promise) {
    val array = Arguments.createArray()
    VoiceRecorderStore.listRecordings(reactContext).forEach { recording ->
      array.pushMap(Arguments.createMap().apply {
        putString("id", recording.id)
        putString("uri", recording.uri)
        putString("fileName", recording.fileName)
        putDouble("durationMs", recording.durationMs.toDouble())
        putString("createdAt", recording.createdAt)
        putString("completedAt", recording.completedAt)
        putDouble("sizeBytes", recording.sizeBytes.toDouble())
      })
    }
    promise.resolve(array)
  }

  @ReactMethod
  fun deleteRecording(id: String, promise: Promise) {
    promise.resolve(VoiceRecorderStore.deleteRecording(reactContext, id))
  }

  private fun startRecorderService(intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.startForegroundService(intent)
    } else {
      reactContext.startService(intent)
    }
  }

  companion object {
    private const val maxDurationSeconds = 24 * 60 * 60
  }
}
