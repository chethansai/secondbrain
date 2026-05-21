package com.notes.nativenotetaking.overlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class OverlayModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OverlayModule"

  @ReactMethod
  fun isOverlayPermissionGranted(promise: Promise) {
    promise.resolve(canDrawOverlays())
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    if (canDrawOverlays()) {
      promise.resolve(true)
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactContext.packageName}"),
    ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
    reactContext.startActivity(intent)
    promise.resolve(false)
  }

  @ReactMethod
  fun startOverlay(promise: Promise) {
    if (!canDrawOverlays()) {
      promise.reject("overlay_permission_missing", "Display over other apps permission is not granted.")
      return
    }
    startOverlayService(Intent(reactContext, OverlayService::class.java))
    promise.resolve(true)
  }

  @ReactMethod
  fun stopOverlay(promise: Promise) {
    startOverlayService(Intent(reactContext, OverlayService::class.java).apply { action = OverlayService.ACTION_STOP })
    promise.resolve(true)
  }

  @ReactMethod
  fun updateOverlaySettings(settings: ReadableMap, promise: Promise) {
    val opacity = if (settings.hasKey("opacity") && !settings.isNull("opacity")) settings.getDouble("opacity") else null
    val size = if (settings.hasKey("size") && !settings.isNull("size")) settings.getDouble("size") else null
    val tapAction = if (settings.hasKey("tapAction") && !settings.isNull("tapAction")) settings.getString("tapAction") else null
    val swipeLeftAction = if (settings.hasKey("swipeLeftAction") && !settings.isNull("swipeLeftAction")) settings.getString("swipeLeftAction") else null
    val swipeDownAction = if (settings.hasKey("swipeDownAction") && !settings.isNull("swipeDownAction")) settings.getString("swipeDownAction") else null
    OverlaySettings.update(reactContext, opacity, size, tapAction, swipeLeftAction, swipeDownAction)
    startOverlayService(Intent(reactContext, OverlayService::class.java).apply { action = OverlayService.ACTION_UPDATE })
    promise.resolve(true)
  }

  @ReactMethod
  fun resetOverlayPlacement(promise: Promise) {
    OverlaySettings.resetPosition(reactContext)
    startOverlayService(Intent(reactContext, OverlayService::class.java).apply { action = OverlayService.ACTION_RESET_POSITION })
    promise.resolve(true)
  }

  @ReactMethod
  fun readOverlaySettings(promise: Promise) {
    val state = OverlaySettings.read(reactContext)
    val map = Arguments.createMap().apply {
      putDouble("opacity", state.opacity.toDouble())
      putDouble("size", state.size.toDouble())
      putString("tapAction", state.tapAction)
      putString("swipeLeftAction", state.swipeLeftAction)
      putString("swipeDownAction", state.swipeDownAction)
      putBoolean("permissionGranted", canDrawOverlays())
    }
    promise.resolve(map)
  }

  private fun startOverlayService(intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.startForegroundService(intent)
    } else {
      reactContext.startService(intent)
    }
  }

  private fun canDrawOverlays(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)
  }
}
