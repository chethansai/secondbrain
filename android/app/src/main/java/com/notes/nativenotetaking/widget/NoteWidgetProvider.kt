package com.notes.nativenotetaking.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.notes.nativenotetaking.R

class NoteWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { updateWidget(context, appWidgetManager, it) }
  }

  companion object {
    const val widgetPreferencesName = "native_note_widgets"
    private const val categoryLabelKeyPrefix = "category_label_"
    private const val categoryPathKeyPrefix = "category_path_"
    private const val pathSeparator = ""

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
      val views = RemoteViews(context.packageName, R.layout.note_widget)
      val categoryLabel = readCategoryLabel(context, appWidgetId) ?: "SEEK"
      views.setTextViewText(R.id.widget_category, categoryLabel)
      views.setOnClickPendingIntent(R.id.widget_button, createConfigureIntent(context, appWidgetId))
      views.setOnClickPendingIntent(R.id.widget_title, createConfigureIntent(context, appWidgetId))
      views.setOnClickPendingIntent(R.id.widget_category, createConfigureIntent(context, appWidgetId))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    fun saveCategory(context: Context, appWidgetId: Int, path: List<String>) {
      context.getSharedPreferences(widgetPreferencesName, Context.MODE_PRIVATE).edit()
        .putString(categoryPathKeyPrefix + appWidgetId, path.joinToString(pathSeparator))
        .putString(categoryLabelKeyPrefix + appWidgetId, path.joinToString(" > "))
        .apply()
    }

    fun readCategoryPath(context: Context, appWidgetId: Int): List<String> {
      val serialized = context.getSharedPreferences(widgetPreferencesName, Context.MODE_PRIVATE)
        .getString(categoryPathKeyPrefix + appWidgetId, null)
      return serialized?.split(pathSeparator)?.filter { it.isNotBlank() } ?: listOf("SEEK")
    }

    private fun readCategoryLabel(context: Context, appWidgetId: Int): String? {
      return context.getSharedPreferences(widgetPreferencesName, Context.MODE_PRIVATE)
        .getString(categoryLabelKeyPrefix + appWidgetId, null)
    }

    private fun createConfigureIntent(context: Context, appWidgetId: Int): PendingIntent {
      val intent = Intent(context, NoteWidgetConfigureActivity::class.java).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_CONFIGURE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getActivity(context, appWidgetId, intent, flags)
    }
  }
}
