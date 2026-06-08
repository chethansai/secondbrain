package com.notes.nativenotetaking.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object OverlayNotification {
  const val id = 1101
  const val channelId = "floating_note_icon"
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