package com.notes.nativenotetaking.overlay

import android.content.Context
import java.util.concurrent.TimeUnit

object TeleprompterSettings {
    private const val PREFS_NAME = "teleprompter_settings"
    private const val KEY_IS_RUNNING = "is_running"
    private const val KEY_TEXT = "current_text"
    private const val KEY_SPEED = "scroll_speed" // pixels per second, default 34
    private const val KEY_TEXT_SIZE = "text_size" // sp
    private const val KEY_DURATION_MS = "duration_ms" // -1 for unlimited
    private const val KEY_START_TIME_MS = "start_time_ms"
    private const val KEY_POSITION = "scroll_position"
    private const val KEY_CATEGORIES = "selected_categories"

    // Duration options in ms (-1 = unlimited)
    val DURATION_OPTIONS = listOf(
        1000L, 5000L, 10000L, 30000L, // 1s,5s,10s,30s
        TimeUnit.MINUTES.toMillis(1), TimeUnit.MINUTES.toMillis(5),
        TimeUnit.MINUTES.toMillis(10), TimeUnit.MINUTES.toMillis(30),
        TimeUnit.HOURS.toMillis(1), TimeUnit.HOURS.toMillis(2),
        TimeUnit.HOURS.toMillis(4), TimeUnit.HOURS.toMillis(8),
        TimeUnit.HOURS.toMillis(12), TimeUnit.HOURS.toMillis(24),
        -1L // Unlimited
    )

    data class State(
        val isRunning: Boolean,
        val text: String,
        val speed: Float,
        val textSize: Float,
        val durationMs: Long,
        val startTimeMs: Long,
        val position: Float,
        val selectedCategories: List<String>
    )

    fun read(context: Context): State {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val categoriesJson = prefs.getString(KEY_CATEGORIES, null)
        val categories = if (categoriesJson != null) {
            try {
                org.json.JSONArray(categoriesJson).let { arr ->
                    (0 until arr.length()).map { arr.getString(it) }
                }
            } catch (e: Exception) {
                emptyList()
            }
        } else emptyList()
        return State(
            isRunning = prefs.getBoolean(KEY_IS_RUNNING, false),
            text = prefs.getString(KEY_TEXT, "No notes yet") ?: "No notes yet",
            speed = prefs.getFloat(KEY_SPEED, 34f),
            textSize = prefs.getFloat(KEY_TEXT_SIZE, 14f),
            durationMs = prefs.getLong(KEY_DURATION_MS, -1L),
            startTimeMs = prefs.getLong(KEY_START_TIME_MS, 0L),
            position = prefs.getFloat(KEY_POSITION, 0f),
            selectedCategories = categories
        )
    }

    fun save(context: Context, state: State) {
        val categoriesJson = org.json.JSONArray(state.selectedCategories).toString()
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
            putBoolean(KEY_IS_RUNNING, state.isRunning)
            putString(KEY_TEXT, state.text)
            putFloat(KEY_SPEED, state.speed)
            putFloat(KEY_TEXT_SIZE, state.textSize)
            putLong(KEY_DURATION_MS, state.durationMs)
            putLong(KEY_START_TIME_MS, state.startTimeMs)
            putFloat(KEY_POSITION, state.position)
            putString(KEY_CATEGORIES, categoriesJson)
            apply()
        }
    }

    fun update(context: Context, isRunning: Boolean? = null, text: String? = null, speed: Float? = null, textSize: Float? = null, durationMs: Long? = null, startTimeMs: Long? = null, position: Float? = null, selectedCategories: List<String>? = null) {
        val current = read(context)
        val newState = current.copy(
            isRunning = isRunning ?: current.isRunning,
            text = text ?: current.text,
            speed = speed ?: current.speed,
            textSize = textSize ?: current.textSize,
            durationMs = durationMs ?: current.durationMs,
            startTimeMs = startTimeMs ?: current.startTimeMs,
            position = position ?: current.position,
            selectedCategories = selectedCategories ?: current.selectedCategories
        )
        save(context, newState)
    }

    fun formatDuration(ms: Long): String {
        if (ms < 0) return "Unlimited"
        val hours = TimeUnit.MILLISECONDS.toHours(ms)
        val minutes = TimeUnit.MILLISECONDS.toMinutes(ms) % 60
        val seconds = TimeUnit.MILLISECONDS.toSeconds(ms) % 60
        return if (hours > 0) String.format("%dh %02dm %02ds", hours, minutes, seconds) else String.format("%02dm %02ds", minutes, seconds)
    }

    fun getRemainingTime(state: State): Long {
        if (state.durationMs < 0 || state.startTimeMs <= 0 || !state.isRunning) return -1
        val elapsed = System.currentTimeMillis() - state.startTimeMs
        return maxOf(0, state.durationMs - elapsed)
    }
}
