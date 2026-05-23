package com.notes.nativenotetaking.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.RemoteViews
import com.notes.nativenotetaking.R
import com.notes.nativenotetaking.overlay.OverlayNotesStore

class WorkspaceWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { updateWidget(context, appWidgetManager, it) }
  }

  companion object {
    private const val maxCategories = 5
    private const val maxNotesPerCategory = 3

    fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
      val views = baseViews(context, appWidgetId)
      views.setTextViewText(R.id.workspace_widget_status, "Loading workspace...")
      appWidgetManager.updateAppWidget(appWidgetId, views)
      Thread {
        val loadedViews = try {
          renderSnapshot(context, appWidgetId, OverlayNotesStore(context).readNoteSnapshot())
        } catch (_: Exception) {
          baseViews(context, appWidgetId).apply {
            setTextViewText(R.id.workspace_widget_status, "Could not load notes. Tap + to add.")
            setViewVisibility(R.id.workspace_widget_status, View.VISIBLE)
          }
        }
        Handler(Looper.getMainLooper()).post { appWidgetManager.updateAppWidget(appWidgetId, loadedViews) }
      }.start()
    }

    private fun baseViews(context: Context, appWidgetId: Int): RemoteViews {
      return RemoteViews(context.packageName, R.layout.workspace_widget).apply {
        setOnClickPendingIntent(R.id.workspace_widget_add_button, createConfigureIntent(context, appWidgetId, emptyList()))
        setOnClickPendingIntent(R.id.workspace_widget_seek_button, createConfigureIntent(context, appWidgetId, listOf(OverlayNotesStore.seekCategoryName)))
        setOnClickPendingIntent(R.id.workspace_widget_refresh_button, createRefreshIntent(context, appWidgetId))
        clearCategoryRows()
      }
    }

    private fun renderSnapshot(context: Context, appWidgetId: Int, snapshot: OverlayNotesStore.NoteSnapshot): RemoteViews {
      val visibleCategories = snapshot.categories
        .filter { it.label != "HISTORY" }
        .sortedWith(compareByDescending<OverlayNotesStore.CategorySnapshot> { it.label == OverlayNotesStore.seekCategoryName }.thenBy { it.label.lowercase() })
        .take(maxCategories)
      return baseViews(context, appWidgetId).apply {
        if (visibleCategories.isEmpty()) {
          setTextViewText(R.id.workspace_widget_status, "No categories yet. Add a note to SEEK or create a category.")
          setViewVisibility(R.id.workspace_widget_status, View.VISIBLE)
          return@apply
        }
        setViewVisibility(R.id.workspace_widget_status, View.GONE)
        visibleCategories.forEachIndexed { index, category -> bindCategoryRow(context, appWidgetId, index, category) }
      }
    }

    private fun RemoteViews.bindCategoryRow(context: Context, appWidgetId: Int, index: Int, category: OverlayNotesStore.CategorySnapshot) {
      val containerId = categoryContainerIds[index]
      setViewVisibility(containerId, View.VISIBLE)
      setTextViewText(categoryTitleIds[index], category.label)
      setTextViewText(categoryAddIds[index], "+")
      setOnClickPendingIntent(categoryAddIds[index], createConfigureIntent(context, appWidgetId, category.path))
      setTextViewText(categoryNotesIds[index], formatNotes(category.notes))
    }

    private fun formatNotes(notes: List<String>): String {
      if (notes.isEmpty()) return "No notes yet"
      return notes.take(maxNotesPerCategory).joinToString("\n") { "• ${it.lineSequence().firstOrNull()?.take(90).orEmpty()}" }
    }

    private fun RemoteViews.clearCategoryRows() {
      categoryContainerIds.forEach { setViewVisibility(it, View.GONE) }
    }

    private fun createConfigureIntent(context: Context, appWidgetId: Int, initialPath: List<String>): PendingIntent {
      val intent = Intent(context, NoteWidgetConfigureActivity::class.java).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_CONFIGURE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        if (initialPath.isNotEmpty()) putExtra(NoteWidgetConfigureActivity.initialPathExtra, initialPath.toTypedArray())
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val requestCode = ("workspace:$appWidgetId:${initialPath.joinToString("/")}").hashCode()
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getActivity(context, requestCode, intent, flags)
    }

    private fun createRefreshIntent(context: Context, appWidgetId: Int): PendingIntent {
      val intent = Intent(context, WorkspaceWidgetProvider::class.java).apply {
        action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, intArrayOf(appWidgetId))
      }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      return PendingIntent.getBroadcast(context, "workspace-refresh:$appWidgetId".hashCode(), intent, flags)
    }

    private val categoryContainerIds = intArrayOf(
      R.id.workspace_widget_category_1,
      R.id.workspace_widget_category_2,
      R.id.workspace_widget_category_3,
      R.id.workspace_widget_category_4,
      R.id.workspace_widget_category_5,
    )
    private val categoryTitleIds = intArrayOf(
      R.id.workspace_widget_category_title_1,
      R.id.workspace_widget_category_title_2,
      R.id.workspace_widget_category_title_3,
      R.id.workspace_widget_category_title_4,
      R.id.workspace_widget_category_title_5,
    )
    private val categoryAddIds = intArrayOf(
      R.id.workspace_widget_category_add_1,
      R.id.workspace_widget_category_add_2,
      R.id.workspace_widget_category_add_3,
      R.id.workspace_widget_category_add_4,
      R.id.workspace_widget_category_add_5,
    )
    private val categoryNotesIds = intArrayOf(
      R.id.workspace_widget_category_notes_1,
      R.id.workspace_widget_category_notes_2,
      R.id.workspace_widget_category_notes_3,
      R.id.workspace_widget_category_notes_4,
      R.id.workspace_widget_category_notes_5,
    )
  }
}
