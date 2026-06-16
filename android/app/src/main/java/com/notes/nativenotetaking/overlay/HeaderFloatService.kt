package com.notes.nativenotetaking.overlay

import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.ImageButton
import androidx.core.content.ContextCompat

class HeaderFloatService : Service() {
    private var windowManager: WindowManager? = null
    private var floatingView: FrameLayout? = null
    private var headerText: TextView? = null
    private var isExpanded = false

    companion object {
        const val ACTION_START = "com.notes.nativenotetaking.ACTION_HEADER_START"
        const val ACTION_STOP = "com.notes.nativenotetaking.ACTION_HEADER_STOP"
        const val EXTRA_TEXT = "extra_text"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val text = intent.getStringExtra(EXTRA_TEXT) ?: ""
                if (floatingView == null) {
                    createFloatingHeader(text)
                } else {
                    headerText?.text = text
                }
            }
            ACTION_STOP -> {
                stopSelf()
            }
        }
        return START_STICKY
    }

    private fun createFloatingHeader(text: String) {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        floatingView = FrameLayout(this).apply {
            setBackgroundColor(0xFF0A1530.toInt()) // brand-navy
            elevation = 8f
        }

        headerText = TextView(this).apply {
            text = text
            textSize = 14f
            setTextColor(0xFFFFFFFF.toInt())
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            gravity = Gravity.CENTER_VERTICAL
            setPadding(16, 8, 16, 8)
            setOnClickListener {
                toggleExpansion()
            }
        }

        val expandBtn = ImageButton(this).apply {
            setImageResource(android.R.drawable.ic_menu_more)
            setBackgroundColor(android.graphics.Color.TRANSPARENT)
            setColorFilter(0xFFFFFFFF.toInt())
            setOnClickListener {
                toggleExpansion()
            }
        }

        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        floatingView?.addView(headerText, params)
        floatingView?.addView(expandBtn, FrameLayout.LayoutParams(48, 48, Gravity.END or Gravity.CENTER_VERTICAL))

        val layoutParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            y = 0
        }

        windowManager?.addView(floatingView, layoutParams)
    }

    private fun toggleExpansion() {
        isExpanded = !isExpanded
        headerText?.maxLines = if (isExpanded) Int.MAX_VALUE else 1
        headerText?.ellipsize = if (isExpanded) null else android.text.TextUtils.TruncateAt.END
    }

    override fun onDestroy() {
        floatingView?.let {
            windowManager?.removeView(it)
        }
        floatingView = null
        headerText = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}