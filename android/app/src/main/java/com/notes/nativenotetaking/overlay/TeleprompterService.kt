package com.notes.nativenotetaking.overlay

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import java.util.concurrent.TimeUnit
import java.math.BigInteger

class TeleprompterService : Service() {

    private lateinit var windowManager: WindowManager
    private var teleprompterView: TeleprompterView? = null
    private val settings by lazy { TeleprompterSettings }
    private val handler = Handler(Looper.getMainLooper())
    private var countdownRunnable: Runnable? = null
    private var currentState = TeleprompterSettings.State(false, "", 34f, 14f, -1L, 0L, 0f, emptyList())
    private var isPaused = false

    companion object {
        const val NOTIFICATION_ID = 1102
        const val CHANNEL_ID = "teleprompter_channel"
        const val ACTION_START = "com.notes.nativenotetaking.teleprompter.START"
        const val ACTION_STOP = "com.notes.nativenotetaking.teleprompter.STOP"
        const val ACTION_PAUSE = "com.notes.nativenotetaking.teleprompter.PAUSE"
        const val ACTION_RESUME = "com.notes.nativenotetaking.teleprompter.RESUME"
        const val ACTION_UPDATE = "com.notes.nativenotetaking.teleprompter.UPDATE"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        currentState = settings.read(this)

        // CRITICAL: startForeground IMMEDIATELY before any permission or view work. This was the root cause of "Native Note Taking keeps stopping" crash.
        try {
            val notification = createTeleprompterNotification()
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            android.util.Log.i("TeleprompterService", "onCreate foreground started: running=${currentState.isRunning}, duration=${currentState.durationMs}, categories=${currentState.selectedCategories.size}")
        } catch (e: Exception) {
            android.util.Log.e("TeleprompterService", "Failed to start foreground service", e)
            stopSelf()
            return
        }

        // PATCH: Removed stopSelf on no overlay - notification mode is safe fallback per spec. No crash.
        if (!canDrawOverlays()) {
            android.util.Log.i("TeleprompterService", "No overlay permission - using notification-only foreground mode (safe Android behavior)")
        }

        // CRITICAL FIX: NEVER auto-start teleprompter on service creation or resume. Only explicit user Start button. Prevents auto on app launch, category load, Firebase sync.
        android.util.Log.d("TeleprompterService", "onCreate: loaded state, isRunning=${currentState.isRunning} (will NOT auto-start per spec - user must press Start)")
        // Do NOT call showTeleprompter() or startCountdown() here automatically
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        currentState = settings.read(this)
        when (intent?.action) {
            ACTION_STOP -> {
                stopTeleprompter()
                stopSelf()
            }
            ACTION_PAUSE -> pauseTeleprompter()
            ACTION_RESUME -> resumeTeleprompter()
            ACTION_START, ACTION_UPDATE -> {
                val text = intent.getStringExtra("text") ?: currentState.text
                val duration = intent.getLongExtra("durationMs", currentState.durationMs)
                val speed = intent.getFloatExtra("speed", currentState.speed)
                val size = intent.getFloatExtra("textSize", currentState.textSize)
                val categoriesJson = intent.getStringExtra("categories")
                val categories = if (categoriesJson != null) {
                    try {
                        org.json.JSONArray(categoriesJson).let { arr ->
                            (0 until arr.length()).map { arr.getString(it) }
                        }
                    } catch (e: Exception) { emptyList() }
                } else currentState.selectedCategories
                if (categories.isEmpty()) {
                    android.util.Log.w("TeleprompterService", "No categories selected - cannot start")
                    stopTeleprompter()
                    return START_STICKY
                }
                currentState = currentState.copy(selectedCategories = categories)
                settings.save(this, currentState)
                android.util.Log.i("TeleprompterService", "ACTION_START: categories=${categories}, duration=${duration}, text.length=${text.length}")
                updateState(text, speed, size, duration, System.currentTimeMillis())
                if (canDrawOverlays()) {
                    try {
                        showTeleprompter()
                    } catch (e: Exception) {
                        android.util.Log.e("TeleprompterService", "Overlay failed, falling back to notification-only", e)
                    }
                }
                startCountdown()
                updateNotification()
            }
            else -> {
                // PATCH: No auto-start in default case. Prevents resume/auto on app open, Firebase sync, category load.
                android.util.Log.d("TeleprompterService", "No action - status=${currentState.isRunning} (stopped by default)")
            }
        }
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Teleprompter",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Teleprompter status bar notification"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun createTeleprompterNotification(isPaused: Boolean = false): Notification {
        val remaining = TeleprompterSettings.getRemainingTime(currentState)
        val remainingStr = if (remaining > 0) formatRemaining(remaining) else if (currentState.durationMs < 0) "Unlimited" else "00:00:00"
        return createTeleprompterNotification(this, currentState.text, remainingStr, isPaused)
    }

    private fun updateNotification() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, createTeleprompterNotification(isPaused))
    }

    private fun showTeleprompter() {
        if (teleprompterView != null) return
        val view = TeleprompterView(this)
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = (Gravity.TOP or Gravity.CENTER_HORIZONTAL).toInt()
            y = 40
        }
        val safeInsets = TeleprompterView.calculateSafeInsets(this, windowManager)
        view.setText(currentState.text, currentState.speed, currentState.textSize)
        view.attachToWindow(windowManager, params)
        view.updatePositionAndSize(safeInsets)
        teleprompterView = view
    }

    private fun hideTeleprompter() {
        teleprompterView?.detach()
        teleprompterView = null
    }

    private fun updateState(text: String, speed: Float, textSize: Float, durationMs: Long, startTime: Long) {
        currentState = currentState.copy(
            isRunning = true,
            text = text,
            speed = speed,
            textSize = textSize,
            durationMs = durationMs,
            startTimeMs = startTime
        )
        settings.save(this, currentState)
        updateNotification()
    }

    private fun startCountdown() {
        countdownRunnable?.let { handler.removeCallbacks(it) } // Prevent duplicate timers
        countdownRunnable = object : Runnable {
            override fun run() {
                if (!currentState.isRunning || isPaused) return
                val remaining = TeleprompterSettings.getRemainingTime(currentState)
                if (remaining <= 0 && currentState.durationMs > 0) {
                    android.util.Log.i("TeleprompterService", "Duration ended - stopping cleanly")
                    stopTeleprompter()
                    return
                }
                val remainingStr = if (remaining < 0) "Unlimited" else formatRemaining(remaining)
                teleprompterView?.updateCountdown(remainingStr)
                updateNotification()
                handler.postDelayed(this, 1000)
            }
        }
        handler.post(countdownRunnable!!)
    }

    private fun formatRemaining(ms: Long): String {
        val hours = TimeUnit.MILLISECONDS.toHours(ms)
        val minutes = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
        val seconds = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
        return if (hours > 0) String.format("%02d:%02d:%02d", hours, minutes, seconds) else String.format("%02d:%02d", minutes, seconds)
    }

    private fun pauseTeleprompter() {
        isPaused = true
        teleprompterView?.setScrolling(false)
        updateNotification()
        settings.update(this, isRunning = true) // keep running state but paused
    }

    private fun resumeTeleprompter() {
        isPaused = false
        teleprompterView?.setScrolling(true)
        currentState = currentState.copy(startTimeMs = System.currentTimeMillis() - (currentState.durationMs - TeleprompterSettings.getRemainingTime(currentState))) // adjust for pause
        settings.save(this, currentState)
        startCountdown()
        updateNotification()
    }

    private fun stopTeleprompter() {
        isPaused = false
        hideTeleprompter()
        countdownRunnable?.let { handler.removeCallbacks(it) }
        currentState = currentState.copy(isRunning = false, startTimeMs = 0)
        settings.save(this, currentState)
        stopForeground(true)
    }

    private fun canDrawOverlays(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    }

    override fun onDestroy() {
        hideTeleprompter()
        countdownRunnable?.let { handler.removeCallbacks(it) }
        super.onDestroy()
    }
}
