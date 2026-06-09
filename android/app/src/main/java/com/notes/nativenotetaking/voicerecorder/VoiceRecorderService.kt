package com.notes.nativenotetaking.voicerecorder

import android.Manifest
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.content.ContextCompat
import java.io.File
import java.time.Instant

class VoiceRecorderService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var recorder: MediaRecorder? = null
  private var currentFile: File? = null
  private var currentId: String? = null
  private var currentStartedAtMs = 0L
  private var running = false
  private var segmentDurationSeconds = 300

  private val rotateRunnable = Runnable {
    stopCurrentSegment()
    if (running) startSegment()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    startForeground(VoiceRecorderNotification.id, createVoiceRecorderNotification(this))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        running = false
        VoiceRecorderStore.writeSettings(this, VoiceRecorderStore.Settings(false, segmentDurationSeconds))
        stopCurrentSegment()
        stopSelf()
      }
      else -> {
        if (!hasRecordAudioPermission()) {
          running = false
          stopSelf()
          return START_NOT_STICKY
        }
        segmentDurationSeconds = intent?.getIntExtra(EXTRA_DURATION_SECONDS, VoiceRecorderStore.readSettings(this).durationSeconds)
          ?.coerceIn(1, MAX_DURATION_SECONDS) ?: VoiceRecorderStore.readSettings(this).durationSeconds
        VoiceRecorderStore.writeSettings(this, VoiceRecorderStore.Settings(true, segmentDurationSeconds))
        running = true
        if (recorder == null) startSegment()
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    stopCurrentSegment()
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
  }

  private fun startSegment() {
    val (id, file) = VoiceRecorderStore.createRecordingFile(this)
    currentId = id
    currentFile = file
    currentStartedAtMs = System.currentTimeMillis()
    val mediaRecorder = createMediaRecorder().apply {
      setAudioSource(MediaRecorder.AudioSource.MIC)
      setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      setAudioEncodingBitRate(128000)
      setAudioSamplingRate(44100)
      setOutputFile(file.absolutePath)
    }
    try {
      mediaRecorder.prepare()
      mediaRecorder.start()
      recorder = mediaRecorder
      handler.removeCallbacks(rotateRunnable)
      handler.postDelayed(rotateRunnable, segmentDurationSeconds * 1000L)
    } catch (_: Exception) {
      releaseRecorder(mediaRecorder)
      file.delete()
      running = false
      stopSelf()
    }
  }

  private fun stopCurrentSegment() {
    handler.removeCallbacks(rotateRunnable)
    val mediaRecorder = recorder ?: return
    val file = currentFile
    val id = currentId
    val startedAtMs = currentStartedAtMs
    recorder = null
    currentFile = null
    currentId = null
    currentStartedAtMs = 0L

    try {
      mediaRecorder.stop()
    } catch (_: Exception) {
      file?.delete()
    } finally {
      releaseRecorder(mediaRecorder)
    }

    if (file != null && id != null && file.exists() && file.length() > 0L) {
      val completedAtMs = System.currentTimeMillis()
      VoiceRecorderStore.addRecording(
        this,
        VoiceRecorderStore.Recording(
          id = id,
          uri = "file://${file.absolutePath}",
          fileName = file.name,
          durationMs = (completedAtMs - startedAtMs).coerceAtLeast(0L),
          createdAt = Instant.ofEpochMilli(startedAtMs).toString(),
          completedAt = Instant.ofEpochMilli(completedAtMs).toString(),
          sizeBytes = file.length(),
        ),
      )
    }
  }

  private fun createMediaRecorder(): MediaRecorder {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(this)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }
  }

  private fun releaseRecorder(mediaRecorder: MediaRecorder) {
    try {
      mediaRecorder.reset()
    } catch (_: Exception) {
    }
    mediaRecorder.release()
  }

  private fun hasRecordAudioPermission(): Boolean {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
  }

  companion object {
    const val ACTION_START = "com.notes.nativenotetaking.voicerecorder.START"
    const val ACTION_STOP = "com.notes.nativenotetaking.voicerecorder.STOP"
    const val EXTRA_DURATION_SECONDS = "durationSeconds"
    private const val MAX_DURATION_SECONDS = 24 * 60 * 60
  }
}
