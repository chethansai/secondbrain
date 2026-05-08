package com.notes.nativenotetaking.ainotifications

import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.TimeUnit
import kotlin.math.max

class AiNotificationWorkerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AiNotificationWorkerModule"

  @ReactMethod
  fun scheduleJob(jobId: String, scheduledAtMillis: Double, repeatEveryHours: Double, promise: Promise) {
    try {
      val now = System.currentTimeMillis()
      val delayMs = max(0L, scheduledAtMillis.toLong() - now)
      val input = workDataOf(AiNotificationWorker.KEY_JOB_ID to jobId)
      val workManager = WorkManager.getInstance(reactContext)
      val workName = uniqueJobName(jobId)

      if (repeatEveryHours > 0) {
        val repeatMinutes = max(15L, Math.round(repeatEveryHours * 60.0))
        val request = PeriodicWorkRequestBuilder<AiNotificationWorker>(repeatMinutes, TimeUnit.MINUTES)
          .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
          .setInputData(input)
          .addTag(AiNotificationWorker.WORK_TAG)
          .addTag(workName)
          .build()
        workManager.enqueueUniquePeriodicWork(workName, ExistingPeriodicWorkPolicy.UPDATE, request)
      } else {
        val request = OneTimeWorkRequestBuilder<AiNotificationWorker>()
          .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
          .setInputData(input)
          .addTag(AiNotificationWorker.WORK_TAG)
          .addTag(workName)
          .build()
        workManager.enqueueUniqueWork(workName, ExistingWorkPolicy.REPLACE, request)
      }

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ai_notification_worker_schedule_failed", error.message, error)
    }
  }

  @ReactMethod
  fun schedulePolling(promise: Promise) {
    try {
      val request = PeriodicWorkRequestBuilder<AiNotificationWorker>(15, TimeUnit.MINUTES)
        .addTag(AiNotificationWorker.WORK_TAG)
        .addTag(AiNotificationWorker.POLLING_WORK_NAME)
        .build()
      WorkManager.getInstance(reactContext).enqueueUniquePeriodicWork(
        AiNotificationWorker.POLLING_WORK_NAME,
        ExistingPeriodicWorkPolicy.UPDATE,
        request,
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ai_notification_worker_polling_failed", error.message, error)
    }
  }

  @ReactMethod
  fun cancelJob(jobId: String, promise: Promise) {
    try {
      WorkManager.getInstance(reactContext).cancelUniqueWork(uniqueJobName(jobId))
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ai_notification_worker_cancel_failed", error.message, error)
    }
  }

  @ReactMethod
  fun triggerNow(promise: Promise) {
    try {
      val request = OneTimeWorkRequestBuilder<AiNotificationWorker>()
        .addTag(AiNotificationWorker.WORK_TAG)
        .build()
      WorkManager.getInstance(reactContext).enqueue(request)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("ai_notification_worker_trigger_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val workInfos = WorkManager.getInstance(reactContext).getWorkInfosByTag(AiNotificationWorker.WORK_TAG).get()
      val running = workInfos.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED }
      val map = Arguments.createMap().apply {
        putBoolean("available", true)
        putBoolean("registered", running)
        putInt("workCount", workInfos.size)
      }
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("ai_notification_worker_status_failed", error.message, error)
    }
  }

  private fun uniqueJobName(jobId: String): String {
    return "${AiNotificationWorker.JOB_WORK_PREFIX}$jobId"
  }
}
