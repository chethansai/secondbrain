package com.notes.nativenotetaking.ainotifications

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AiNotificationHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val data = Arguments.createMap().apply {
      putString(AiNotificationWorker.KEY_JOB_ID, intent?.getStringExtra(AiNotificationWorker.KEY_JOB_ID))
      putString(AiNotificationWorker.KEY_WORK_ID, intent?.getStringExtra(AiNotificationWorker.KEY_WORK_ID))
    }
    return HeadlessJsTaskConfig(
      AiNotificationWorker.HEADLESS_TASK_NAME,
      data,
      10 * 60 * 1000L,
      true,
    )
  }
}
