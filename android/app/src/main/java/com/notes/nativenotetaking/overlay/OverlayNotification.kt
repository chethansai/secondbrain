package com.notes.nativenotetaking.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object OverlayNotification {
  const val id = 1101
  const val channelId = "floating_note_icon"
  const val TELEPROMPTER_ID = 1102
  const val TELEPROMPTER_CHANNEL = "teleprompter_channel"
}

fun createOverlayNotification(context: Context): Notification {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    val channel = NotificationChannel(
      OverlayNotification.channelId,
      "Floating note icon",
      NotificationManager.IMPORTANCE_LOW,
    )
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }
  val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    Notification.Builder(context, OverlayNotification.channelId)
  } else {
    @Suppress("DEPRECATION")
    Notification.Builder(context)
  }
  return builder
    .setSmallIcon(android.R.drawable.ic_dialog_info)
    .setContentTitle("Native Note Taking")
    .setContentText("Floating note icon is running")
    .setOngoing(true)
    .build()
}

fun createTeleprompterNotification(context: Context, text: String, remaining: String, isPaused: Boolean = false): Notification {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    val channel = NotificationChannel(
      OverlayNotification.TELEPROMPTER_CHANNEL,
      "Teleprompter",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Teleprompter status bar"
      setShowBadge(false)
    }
    context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  val stopIntent = Intent(context, TeleprompterService::class.java).apply { action = TeleprompterService.ACTION_STOP }
  val pauseIntent = Intent(context, TeleprompterService::class.java).apply { action = if (isPaused) TeleprompterService.ACTION_RESUME else TeleprompterService.ACTION_PAUSE }

  val stopPending = PendingIntent.getService(context, 0, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  val pausePending = PendingIntent.getService(context, 0, pauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    Notification.Builder(context, OverlayNotification.TELEPROMPTER_CHANNEL)
  } else {
    @Suppress("DEPRECATION")
    Notification.Builder(context)
  }

  return builder
    .setSmallIcon(android.R.drawable.ic_media_play)
    .setContentTitle(if (isPaused) "Teleprompter Paused" else "Teleprompter Active")
    .setContentText("Text: ${text.take(35)}...\nRemaining: $remaining")
    .setOngoing(true)
    .addAction(0, if (isPaused) "Resume" else "Pause", pausePending)
    .addAction(0, "Stop", stopPending)
    .build()
}