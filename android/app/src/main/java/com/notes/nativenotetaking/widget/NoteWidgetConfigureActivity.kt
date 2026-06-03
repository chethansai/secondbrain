package com.notes.nativenotetaking.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.notes.nativenotetaking.overlay.OverlayNotesStore

class NoteWidgetConfigureActivity : Activity() {
  private val notesStore by lazy { OverlayNotesStore(this) }
  private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID
  private lateinit var noteInput: EditText
  private lateinit var categoryInput: EditText
  private lateinit var categorySearchInput: EditText
  private lateinit var categoryList: LinearLayout
  private var categories: List<OverlayNotesStore.CategoryPath> = emptyList()
  private var initialCategoryPath: List<String>? = null
  private var quickNoteMode = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)
    quickNoteMode = intent?.getBooleanExtra(quickNoteExtra, false) == true
    appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      ?: AppWidgetManager.INVALID_APPWIDGET_ID
    if (!quickNoteMode && appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }
    initialCategoryPath = intent?.getStringArrayExtra(initialPathExtra)?.toList()?.filter { it.isNotBlank() }?.takeIf { it.isNotEmpty() }
    buildContent()
    loadCategories()
  }

  private fun buildContent() {
    noteInput = EditText(this).apply {
      hint = "Add note"
      minLines = 2
      maxLines = 5
      textSize = 16f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(false)
    }
    categoryInput = EditText(this).apply {
      hint = "New category name"
      maxLines = 1
      textSize = 14f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(true)
    }
    categorySearchInput = EditText(this).apply {
      hint = "Search categories"
      maxLines = 1
      textSize = 14f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(true)
      addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) {
          renderCategories(categories, text?.toString().orEmpty())
        }
        override fun afterTextChanged(text: Editable?) {}
      })
    }
    categoryList = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(statusText("Loading categories..."))
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(14), dp(16), dp(14))
      addView(TextView(this@NoteWidgetConfigureActivity).apply {
        text = "Floating quick add"
        textSize = 18f
        setTextColor(0xff1a1a1a.toInt())
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(noteInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      initialCategoryPath?.let { path ->
        addView(Button(this@NoteWidgetConfigureActivity).apply {
          text = "Add to ${path.joinToString(" > ")}"
          setAllCaps(false)
          setOnClickListener { submitNote(path) }
        }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      }
      addView(LinearLayout(this@NoteWidgetConfigureActivity).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(Button(this@NoteWidgetConfigureActivity).apply {
          text = "SEEK"
          setOnClickListener { submitNote(listOf(OverlayNotesStore.seekCategoryName)) }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        addView(Button(this@NoteWidgetConfigureActivity).apply {
          text = "Cancel"
          setAllCaps(false)
          setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(categoryInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(Button(this@NoteWidgetConfigureActivity).apply {
        text = "Create category + add note"
        setOnClickListener { submitNewCategory() }
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(TextView(this@NoteWidgetConfigureActivity).apply {
        text = "Shown categories"
        textSize = 13f
        setTextColor(0xff5d5b54.toInt())
        setPadding(0, dp(10), 0, dp(4))
      })
      addView(categorySearchInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(ScrollView(this@NoteWidgetConfigureActivity).apply {
        addView(categoryList)
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    }
    setContentView(root)
    noteInput.postDelayed({
      noteInput.requestFocus()
      ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(noteInput, InputMethodManager.SHOW_IMPLICIT)
    }, 120)
  }

  private fun loadCategories() {
    Thread {
      try {
        val loadedCategories = notesStore.readCategoryPaths()
          .filter { it.path != listOf(OverlayNotesStore.seekCategoryName) }
          .sortedBy { it.label.lowercase() }
        Handler(Looper.getMainLooper()).post {
          categories = loadedCategories
          renderCategories(categories, categorySearchInput.text?.toString().orEmpty())
        }
      } catch (_: Exception) {
        Handler(Looper.getMainLooper()).post {
          categoryList.removeAllViews()
          categoryList.addView(statusText("Could not load categories."))
        }
      }
    }.start()
  }

  private fun renderCategories(categories: List<OverlayNotesStore.CategoryPath>, query: String = "") {
    categoryList.removeAllViews()
    val cleanQuery = query.trim().lowercase()
    val visibleCategories = if (cleanQuery.isBlank()) categories else categories.filter { it.label.lowercase().contains(cleanQuery) }
    if (visibleCategories.isEmpty()) {
      categoryList.addView(statusText(if (cleanQuery.isBlank()) "No other categories." else "No matching categories."))
      return
    }
    visibleCategories.forEach { category -> categoryList.addView(categoryRow(category)) }
  }

  private fun categoryRow(category: OverlayNotesStore.CategoryPath): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, 0, 0, dp(8))
    }
    val button = Button(this).apply {
      text = category.label
      gravity = Gravity.CENTER_VERTICAL
      setAllCaps(false)
      setOnClickListener { submitNote(category.path) }
    }
    val subcategoryInput = EditText(this).apply {
      hint = "Subcategory name"
      maxLines = 1
      setSingleLine(true)
      visibility = View.GONE
    }
    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      visibility = View.GONE
      addView(Button(this@NoteWidgetConfigureActivity).apply {
        text = "Create subcategory + add"
        setAllCaps(false)
        setOnClickListener { submitNewSubcategory(category.path, subcategoryInput) }
      }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    }
    row.addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    row.addView(Button(this).apply {
      text = "Create subcategory"
      setAllCaps(false)
      setOnClickListener {
        val show = subcategoryInput.visibility != View.VISIBLE
        subcategoryInput.visibility = if (show) View.VISIBLE else View.GONE
        actions.visibility = if (show) View.VISIBLE else View.GONE
        if (show) subcategoryInput.requestFocus()
      }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    row.addView(subcategoryInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    row.addView(actions, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return row
  }

  private fun submitNewCategory() {
    val categoryName = categoryInput.text?.toString()?.trim().orEmpty()
    if (categoryName.isBlank()) {
      Toast.makeText(this, "Category name cannot be empty.", Toast.LENGTH_SHORT).show()
      return
    }
    submitNote(listOf(categoryName))
  }

  private fun submitNewSubcategory(parentPath: List<String>, input: EditText) {
    val subcategoryName = input.text?.toString()?.trim().orEmpty()
    if (subcategoryName.isBlank()) {
      Toast.makeText(this, "Subcategory name cannot be empty.", Toast.LENGTH_SHORT).show()
      return
    }
    submitNote(parentPath + subcategoryName)
  }

  private fun submitNote(path: List<String>) {
    val note = noteInput.text?.toString()?.trim().orEmpty()
    if (note.isBlank()) {
      Toast.makeText(this, "Note text cannot be empty.", Toast.LENGTH_SHORT).show()
      return
    }
    setInputsEnabled(false)
    Thread {
      try {
        notesStore.appendNote(path, note)
        if (!quickNoteMode && appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
          NoteWidgetProvider.saveCategory(this, appWidgetId, path)
        }
        Handler(Looper.getMainLooper()).post {
          copyNoteToClipboard(note)
          updateWidgetAndFinish()
          Toast.makeText(this, "Added to ${path.joinToString(" > ")}", Toast.LENGTH_SHORT).show()
        }
      } catch (_: Exception) {
        Handler(Looper.getMainLooper()).post {
          setInputsEnabled(true)
          Toast.makeText(this, "Could not add to Firestore.", Toast.LENGTH_LONG).show()
        }
      }
    }.start()
  }

  private fun updateWidgetAndFinish() {
    if (quickNoteMode || appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      setResult(RESULT_OK)
      finish()
      return
    }
    val appWidgetManager = AppWidgetManager.getInstance(this)
    if (intent?.getBooleanExtra(workspaceWidgetExtra, false) == true) {
      WorkspaceWidgetProvider.updateWidget(this, appWidgetManager, appWidgetId)
    } else {
      NoteWidgetProvider.updateWidget(this, appWidgetManager, appWidgetId)
    }
    val resultValue = intent.apply { putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId) }
    setResult(RESULT_OK, resultValue)
    finish()
  }

  private fun copyNoteToClipboard(note: String) {
    val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Native Note", note))
  }

  private fun setInputsEnabled(enabled: Boolean) {
    noteInput.isEnabled = enabled
    categoryInput.isEnabled = enabled
  }

  private fun statusText(textValue: String): TextView {
    return TextView(this).apply {
      text = textValue
      textSize = 12f
      setTextColor(0xff787671.toInt())
      setPadding(0, dp(8), 0, dp(8))
    }
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    const val initialPathExtra = "com.notes.nativenotetaking.widget.INITIAL_PATH"
    const val workspaceWidgetExtra = "com.notes.nativenotetaking.widget.WORKSPACE_WIDGET"
    const val quickNoteExtra = "com.notes.nativenotetaking.widget.QUICK_NOTE"
  }
}
