package com.notes.nativenotetaking.ainotifications

import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService

class AiNotificationWorker(private val context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    val intent = Intent(context, AiNotificationHeadlessService::class.java).apply {
      putExtra(KEY_JOB_ID, inputData.getString(KEY_JOB_ID))
      putExtra(KEY_WORK_ID, id.toString())
    }
    return try {
      context.startService(intent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  companion object {
    const val HEADLESS_TASK_NAME = "AiNotificationHeadlessTask"
    const val WORK_TAG = "rnnotetaking-ai-notifications"
    const val POLLING_WORK_NAME = "rnnotetaking-ai-notifications-polling"
    const val JOB_WORK_PREFIX = "rnnotetaking-ai-notification-"
    const val KEY_JOB_ID = "jobId"
    const val KEY_WORK_ID = "workId"
  }
}
