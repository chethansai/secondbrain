package com.notes.nativenotetaking.overlay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val state = TeleprompterSettings.read(context)
            if (state.isRunning) {
                // Verify permission before starting service to prevent crash (PHASE 4)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !android.provider.Settings.canDrawOverlays(context)) {
                    android.util.Log.w("BootReceiver", "No overlay permission on boot - skipping teleprompter")
                    return
                }
                val serviceIntent = Intent(context, TeleprompterService::class.java).apply {
                    action = TeleprompterService.ACTION_START
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
