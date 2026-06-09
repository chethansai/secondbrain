package com.notes.nativenotetaking.overlay

import android.content.Context
import android.graphics.Color
import android.graphics.Rect
import android.os.Build
import android.view.Gravity
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

class TeleprompterView(context: Context) : LinearLayout(context) {

    private val marqueeText: TextView
    private val countdownText: TextView
    private var windowManager: WindowManager? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    private var currentSpeed = 34f
    private var isScrolling = true

    init {
        orientation = VERTICAL
        setBackgroundColor(0xFF0A1530.toInt()) // brand-navy from design.md
        elevation = 8f
        setPadding(16, 8, 16, 8)

        marqueeText = TextView(context).apply {
            textSize = 14f
            setTextColor(Color.WHITE)
            maxLines = 1
            isSelected = true // for marquee effect (marquee in TextView)
            gravity = Gravity.CENTER_VERTICAL
        }

        countdownText = TextView(context).apply {
            textSize = 12f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            text = "Teleprompter Running\nRemaining: --:--:--"
        }

        addView(marqueeText, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, 1f))
        addView(countdownText, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))

        // Safe area handling in updatePosition
    }

    fun setText(text: String, speed: Float, textSize: Float) {
        currentSpeed = speed
        marqueeText.textSize = textSize
        marqueeText.text = text
        marqueeText.isSelected = isScrolling
    }

    fun updateCountdown(remaining: String) {
        countdownText.text = "Teleprompter Running\nRemaining: $remaining"
    }

    fun setScrolling(scrolling: Boolean) {
        isScrolling = scrolling
        marqueeText.isSelected = scrolling
    }

    fun attachToWindow(wm: WindowManager, params: WindowManager.LayoutParams) {
        this.windowManager = wm
        this.layoutParams = params
        try {
            wm.addView(this, params)
        } catch (e: Exception) {
            // already added
        }
    }

    fun updatePositionAndSize(insets: Rect) {
        layoutParams?.let { params ->
            // Position at top, respecting status bar, notch, cutout
            params.y = insets.top + 8 // small padding
            params.width = insets.width() - 16 // auto adjust width, avoid edges
            params.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            try {
                windowManager?.updateViewLayout(this, params)
            } catch (_: Exception) {}
        }
    }

    fun detach() {
        try {
            windowManager?.removeView(this)
        } catch (_: Exception) {}
        windowManager = null
    }

    companion object {
        fun calculateSafeInsets(context: Context, wm: WindowManager): Rect {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val metrics = wm.currentWindowMetrics
                val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
                    WindowInsets.Type.statusBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.systemBars()
                )
                Rect(insets.left, insets.top, metrics.bounds.width() - insets.right, metrics.bounds.height() - insets.bottom)
            } else {
                val displayMetrics = context.resources.displayMetrics
                Rect(0, 80, displayMetrics.widthPixels, displayMetrics.heightPixels) // fallback safe top for status bar
            }
        }
    }
}
