package com.notes.nativenotetaking.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
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
      ?: if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) NoteWidgetProvider.readCategoryPath(this, appWidgetId) else null
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
      imeOptions = EditorInfo.IME_ACTION_DONE
      setOnEditorActionListener { _, actionId, event ->
        if (isDoneAction(actionId, event)) {
          submitNote(defaultSubmitPath())
          true
        } else {
          false
        }
      }
    }
    categoryInput = EditText(this).apply {
      hint = "New category name"
      maxLines = 1
      textSize = 14f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(true)
      imeOptions = EditorInfo.IME_ACTION_DONE
      setOnEditorActionListener { _, actionId, event ->
        if (isDoneAction(actionId, event)) {
          submitNewCategory()
          true
        } else {
          false
        }
      }
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
    visibleCategories.chunked(2).forEach { pair ->
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, 0, 0, dp(8))
      }
      pair.forEachIndexed { index, category ->
        val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
          if (index == 0) marginEnd = dp(6) else marginStart = dp(6)
        }
        row.addView(categoryRow(category), params)
      }
      if (pair.size == 1) {
        row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f).apply { marginStart = dp(6) })
      }
      categoryList.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun categoryRow(category: OverlayNotesStore.CategoryPath): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, 0, 0, dp(8))
    }
    val chip = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = dp(18).toFloat()
        setColor(0xfffafaf9.toInt())
        setStroke(dp(1), 0xffc8c4be.toInt())
      }
    }
    val label = TextView(this).apply {
      text = category.label
      textSize = 12f
      setTextColor(0xff37352f.toInt())
      setSingleLine(false)
      includeFontPadding = false
      setPadding(dp(12), dp(9), dp(8), dp(9))
      setOnClickListener { submitNote(category.path) }
    }
    val subcategoryInput = EditText(this).apply {
      hint = "Subcategory name"
      maxLines = 1
      setSingleLine(true)
      visibility = View.GONE
      imeOptions = EditorInfo.IME_ACTION_DONE
      setOnEditorActionListener { _, actionId, event ->
        if (isDoneAction(actionId, event)) {
          submitNewSubcategory(category.path, this)
          true
        } else {
          false
        }
      }
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
    chip.addView(label, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    chip.addView(TextView(this).apply {
      text = "..."
      textSize = 16f
      gravity = Gravity.CENTER
      minWidth = dp(40)
      setTextColor(0xff787671.toInt())
      setPadding(dp(8), dp(6), dp(10), dp(6))
      setOnClickListener {
        val show = subcategoryInput.visibility != View.VISIBLE
        subcategoryInput.visibility = if (show) View.VISIBLE else View.GONE
        actions.visibility = if (show) View.VISIBLE else View.GONE
        if (show) {
          subcategoryInput.requestFocus()
          ContextCompat.getSystemService(this@NoteWidgetConfigureActivity, InputMethodManager::class.java)?.showSoftInput(subcategoryInput, InputMethodManager.SHOW_IMPLICIT)
        }
      }
    }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
    row.addView(chip, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    row.addView(subcategoryInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    row.addView(actions, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return row
  }

  private fun defaultSubmitPath(): List<String> {
    return initialCategoryPath ?: listOf(OverlayNotesStore.seekCategoryName)
  }

  private fun isDoneAction(actionId: Int, event: KeyEvent?): Boolean {
    val enterPressed = event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_UP
    return actionId == EditorInfo.IME_ACTION_DONE || enterPressed
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
