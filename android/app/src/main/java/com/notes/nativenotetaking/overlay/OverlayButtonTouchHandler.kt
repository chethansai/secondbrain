package com.notes.nativenotetaking.overlay

import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import kotlin.math.abs

class OverlayButtonTouchHandler(
  private val params: WindowManager.LayoutParams,
  private val getButtonSize: () -> Int,
  private val dragThreshold: Int,
  private val swipeThreshold: Int,
  private val clampParams: (WindowManager.LayoutParams, Int, Int) -> Unit,
  private val updateView: (View, WindowManager.LayoutParams) -> Unit,
  private val savePosition: (Int, Int) -> OverlaySettings.State,
  private val runAction: (String) -> Unit,
) : View.OnTouchListener {
  private var downRawX = 0f
  private var downRawY = 0f
  private var startX = 0
  private var startY = 0
  private var moved = false

  override fun onTouch(view: View, event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downRawX = event.rawX
        downRawY = event.rawY
        startX = params.x
        startY = params.y
        moved = false
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        val deltaX = event.rawX - downRawX
        val deltaY = event.rawY - downRawY
        if (abs(deltaX) > dragThreshold || abs(deltaY) > dragThreshold) moved = true
        val buttonSize = getButtonSize()
        params.x = startX + deltaX.toInt()
        params.y = startY + deltaY.toInt()
        clampParams(params, buttonSize, buttonSize)
        updateView(view, params)
        return true
      }
      MotionEvent.ACTION_UP -> {
        val deltaX = event.rawX - downRawX
        val deltaY = event.rawY - downRawY
        if (moved) {
          val settings = savePosition(params.x, params.y)
          if (deltaX <= -swipeThreshold && abs(deltaX) > abs(deltaY)) {
            runAction(settings.swipeLeftAction)
          } else if (deltaY >= swipeThreshold && abs(deltaY) > abs(deltaX)) {
            runAction(settings.swipeDownAction)
          }
        } else {
          runAction(savePosition(params.x, params.y).tapAction)
        }
        return true
      }
    }
    return false
  }
}
