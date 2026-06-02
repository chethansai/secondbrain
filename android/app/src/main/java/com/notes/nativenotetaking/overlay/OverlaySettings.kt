package com.notes.nativenotetaking.overlay

import android.content.Context

object OverlaySettings {
  const val ACTION_NONE = "none"
  const val ACTION_OPEN_TEXT_INPUT = "openTextInput"
  const val ACTION_OPEN_APP = "openApp"
  const val ACTION_OPEN_APP_ASSISTANT = "openAppAssistant"
  const val ACTION_HIDE_OVERLAY = "hideOverlay"

  private const val prefsName = "rnnotetaking.overlay.settings"
  private const val keyOpacity = "opacity"
  private const val keySize = "size"
  private const val keyX = "x"
  private const val keyY = "y"
  private const val keyTapAction = "tapAction"
  private const val keySwipeLeftAction = "swipeLeftAction"
  private const val keySwipeDownAction = "swipeDownAction"

  fun read(context: Context): State {
    val prefs = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
    return State(
      opacity = prefs.getFloat(keyOpacity, 0.86f).coerceIn(0.25f, 1f),
      size = prefs.getInt(keySize, 58).coerceIn(42, 86),
      x = prefs.getInt(keyX, Int.MIN_VALUE),
      y = prefs.getInt(keyY, Int.MIN_VALUE),
      tapAction = normalizeAction(prefs.getString(keyTapAction, ACTION_OPEN_TEXT_INPUT)),
      swipeLeftAction = normalizeAction(prefs.getString(keySwipeLeftAction, ACTION_OPEN_TEXT_INPUT)),
      swipeDownAction = normalizeAction(prefs.getString(keySwipeDownAction, ACTION_HIDE_OVERLAY)),
    )
  }

  fun write(context: Context, state: State) {
    context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
      .edit()
      .putFloat(keyOpacity, state.opacity.coerceIn(0.25f, 1f))
      .putInt(keySize, state.size.coerceIn(42, 86))
      .putInt(keyX, state.x)
      .putInt(keyY, state.y)
      .putString(keyTapAction, normalizeAction(state.tapAction))
      .putString(keySwipeLeftAction, normalizeAction(state.swipeLeftAction))
      .putString(keySwipeDownAction, normalizeAction(state.swipeDownAction))
      .apply()
  }

  fun update(context: Context, opacity: Double?, size: Double?, tapAction: String?, swipeLeftAction: String?, swipeDownAction: String?) {
    val current = read(context)
    write(
      context,
      current.copy(
        opacity = opacity?.toFloat()?.coerceIn(0.25f, 1f) ?: current.opacity,
        size = size?.toInt()?.coerceIn(42, 86) ?: current.size,
        tapAction = tapAction?.let(::normalizeAction) ?: current.tapAction,
        swipeLeftAction = swipeLeftAction?.let(::normalizeAction) ?: current.swipeLeftAction,
        swipeDownAction = swipeDownAction?.let(::normalizeAction) ?: current.swipeDownAction,
      ),
    )
  }

  fun savePosition(context: Context, x: Int, y: Int) {
    val current = read(context)
    write(context, current.copy(x = x, y = y))
  }

  fun resetPosition(context: Context) {
    val current = read(context)
    write(context, current.copy(x = Int.MIN_VALUE, y = Int.MIN_VALUE))
  }

  fun normalizeAction(value: String?): String {
    return when (value) {
      ACTION_OPEN_TEXT_INPUT, ACTION_OPEN_APP, ACTION_OPEN_APP_ASSISTANT, ACTION_HIDE_OVERLAY, ACTION_NONE -> value
      else -> ACTION_NONE
    }
  }

  data class State(
    val opacity: Float,
    val size: Int,
    val x: Int,
    val y: Int,
    val tapAction: String,
    val swipeLeftAction: String,
    val swipeDownAction: String,
  )
}
