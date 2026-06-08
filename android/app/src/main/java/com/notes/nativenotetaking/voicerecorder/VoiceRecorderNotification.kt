package com.notes.nativenotetaking.voicerecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object VoiceRecorderNotification {
  const val id = 1301
  const val channelId = "voice_recorder"
}

fun createVoiceRecorderNotification(context: Context): Notification {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    val channel = NotificationChannel(
      VoiceRecorderNotification.channelId,
      "Voice recorder",
      NotificationManager.IMPORTANCE_LOW,
    )
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }
  val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    Notification.Builder(context, VoiceRecorderNotification.channelId)
  } else {
    @Suppress("DEPRECATION")
    Notification.Builder(context)
  }
  return builder
    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
    .setContentTitle("Native Note Taking")
    .setContentText("Voice recorder is running")
    .setOngoing(true)
    .build()
}
