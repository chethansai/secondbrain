package com.notes.nativenotetaking.overlay

import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.notes.nativenotetaking.MainActivity
import kotlin.math.max
import kotlin.math.min

class OverlayService : Service() {
  private lateinit var windowManager: WindowManager
  private val notesStore by lazy { OverlayNotesStore(this) }
  private var buttonView: View? = null
  private var inputView: View? = null
  private var buttonParams: WindowManager.LayoutParams? = null
  private var settings = OverlaySettings.State(
    opacity = 0.86f,
    size = 58,
    x = Int.MIN_VALUE,
    y = Int.MIN_VALUE,
    tapAction = OverlaySettings.ACTION_OPEN_TEXT_INPUT,
    swipeLeftAction = OverlaySettings.ACTION_OPEN_TEXT_INPUT,
    swipeDownAction = OverlaySettings.ACTION_HIDE_OVERLAY,
  )
  private val dragThreshold by lazy { dp(12) }
  private val swipeThreshold by lazy { dp(54) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    settings = OverlaySettings.read(this)
    if (!canDrawOverlays()) {
      stopSelf()
      return
    }
    // Android 14+ (API 34+) requires foregroundServiceType parameter when declared in manifest
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(
        OverlayNotification.id,
        createOverlayNotification(this),
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(OverlayNotification.id, createOverlayNotification(this))
    }
    showButton()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    settings = OverlaySettings.read(this)
    when (intent?.action) {
      ACTION_STOP -> stopSelf()
      ACTION_UPDATE -> updateButtonFromSettings()
      ACTION_RESET_POSITION -> {
        OverlaySettings.resetPosition(this)
        settings = OverlaySettings.read(this)
        moveButtonToDefault()
      }
      else -> updateButtonFromSettings()
    }
    return START_STICKY
  }

  override fun onDestroy() {
    removeView(inputView)
    removeView(buttonView)
    inputView = null
    buttonView = null
    super.onDestroy()
  }

  private fun showButton() {
    removeView(buttonView)
    val buttonSize = dp(settings.size)
    val label = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      alpha = settings.opacity
      elevation = dp(8).toFloat()
      background = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        cornerRadius = buttonSize / 2f
        setColor(0xff5645d4.toInt())
      }
      addView(TextView(this@OverlayService).apply {
        text = "P"
        textSize = (settings.size * 0.46f).coerceIn(20f, 38f)
        gravity = Gravity.CENTER
        setTextColor(0xffffffff.toInt())
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        includeFontPadding = false
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, 0, 1f))
      addView(TextView(this@OverlayService).apply {
        text = "---"
        textSize = (settings.size * 0.13f).coerceIn(6f, 10f)
        gravity = Gravity.CENTER
        setTextColor(0xdfffffff.toInt())
        includeFontPadding = false
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }

    val params = WindowManager.LayoutParams(
      buttonSize,
      buttonSize,
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      val defaultPosition = defaultButtonPosition(buttonSize)
      x = if (settings.x == Int.MIN_VALUE) defaultPosition.first else settings.x
      y = if (settings.y == Int.MIN_VALUE) defaultPosition.second else settings.y
      clampParams(this, buttonSize, buttonSize)
    }

    label.setOnTouchListener(OverlayButtonTouchHandler(
      params = params,
      getButtonSize = { dp(settings.size) },
      dragThreshold = dragThreshold,
      swipeThreshold = swipeThreshold,
      clampParams = ::clampParams,
      updateView = { view, layoutParams -> updateView(view, layoutParams) },
      savePosition = { x, y ->
        OverlaySettings.savePosition(this, x, y)
        settings = OverlaySettings.read(this)
        settings
      },
      getSettings = { settings },
      runAction = ::runAction,
    ))
    windowManager.addView(label, params)
    buttonView = label
    buttonParams = params
  }

  private fun updateButtonFromSettings() {
    settings = OverlaySettings.read(this)
    buttonView?.alpha = settings.opacity
    buttonParams?.let {
      val buttonSize = dp(settings.size)
      it.width = buttonSize
      it.height = buttonSize
      it.x = if (settings.x == Int.MIN_VALUE) it.x else settings.x
      it.y = if (settings.y == Int.MIN_VALUE) it.y else settings.y
      clampParams(it, buttonSize, buttonSize)
      updateView(buttonView, it)
    } ?: showButton()
  }

  private fun moveButtonToDefault() {
    buttonParams?.let {
      val buttonSize = dp(settings.size)
      val defaultPosition = defaultButtonPosition(buttonSize)
      it.x = defaultPosition.first
      it.y = defaultPosition.second
      clampParams(it, buttonSize, buttonSize)
      OverlaySettings.savePosition(this, it.x, it.y)
      updateView(buttonView, it)
    }
  }

  private fun defaultButtonPosition(buttonSize: Int): Pair<Int, Int> {
    val bounds = displayBounds()
    return Pair(
      bounds.left + (bounds.width() - buttonSize) / 2,
      bounds.bottom - buttonSize - dp(96),
    )
  }

  private fun showInput() {
    removeView(inputView)
    val editText = EditText(this).apply {
      hint = "Add note"
      minLines = 1
      maxLines = 3
      textSize = 16f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(false)
      imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
    }
    val seekButton = Button(this).apply {
      text = "SEEK"
      setOnClickListener { submitInput(editText, listOf(OverlayNotesStore.seekCategoryName)) }
    }
    val closeButton = Button(this).apply {
      text = "Cancel"
      setOnClickListener { hideInput() }
    }
    val controls = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      addView(seekButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      addView(closeButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    }
    val categoryInput = EditText(this).apply {
      hint = "New category name"
      minLines = 1
      maxLines = 1
      textSize = 14f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(true)
      imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
    }
    val createCategoryButton = Button(this).apply {
      text = "Create category + note"
      setOnClickListener { submitNewCategoryInput(editText, categoryInput) }
    }
    val createCategoryBox = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(8), 0, dp(6))
      addView(categoryInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(createCategoryButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    val searchInput = EditText(this).apply {
      hint = "Search categories"
      minLines = 1
      maxLines = 1
      textSize = 14f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(true)
    }
    val chipWrap = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(8), 0, 0)
      addView(TextView(this@OverlayService).apply {
        text = "Loading categories..."
        textSize = 12f
        setTextColor(0xff787671.toInt())
      })
    }
    val chipScroll = ScrollView(this).apply {
      isFillViewport = true
      isVerticalScrollBarEnabled = true
      overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
      addView(chipWrap)
    }
    val bounds = displayBounds()
    val width = min(bounds.width() - dp(24), dp(380))
    val popupHeight = min(bounds.height() - dp(48), dp(420))
    val container = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(10), dp(12), dp(10))
      setBackgroundColor(0xeeffffff.toInt())
      elevation = dp(10).toFloat()
      addView(editText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(controls, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(createCategoryBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(searchInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(chipScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    }
    val frame = FrameLayout(this).apply {
      addView(container, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    }
    val params = WindowManager.LayoutParams(
      width,
      popupHeight,
      overlayType(),
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      val source = buttonParams
      x = source?.x ?: dp(16)
      y = max(dp(24), (source?.y ?: dp(120)) - dp(72))
      clampParams(this, width, popupHeight)
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    }

    editText.setOnEditorActionListener { _, actionId, event ->
      val enterPressed = event?.keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_UP
      if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE || enterPressed) {
        submitInput(editText, listOf(OverlayNotesStore.seekCategoryName))
        true
      } else {
        false
      }
    }
    categoryInput.setOnEditorActionListener { _, actionId, event ->
      val enterPressed = event?.keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_UP
      if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE || enterPressed) {
        submitNewCategoryInput(editText, categoryInput)
        true
      } else {
        false
      }
    }

    windowManager.addView(frame, params)
    inputView = frame
    loadCategoryChips(chipWrap, editText, searchInput)
    editText.postDelayed({
      editText.requestFocus()
      ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(editText, InputMethodManager.SHOW_IMPLICIT)
    }, 120)
  }

  private fun loadCategoryChips(chipWrap: LinearLayout, editText: EditText, searchInput: EditText) {
    Thread {
      try {
        val recentCategoryKey = readRecentCreatedCategoryKey()
        val categories = notesStore.readCategoryPaths()
          .filter { it.path != listOf(OverlayNotesStore.seekCategoryName) }
          .sortedWith(compareBy<OverlayNotesStore.CategoryPath> { if (it.pinned) it.pinIndex else Int.MAX_VALUE }.thenBy { pathKey(it.path) != recentCategoryKey }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.label })
        Handler(Looper.getMainLooper()).post {
          renderCategoryChips(chipWrap, editText, searchInput, categories, searchInput.text?.toString().orEmpty())
          searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) {
              renderCategoryChips(chipWrap, editText, searchInput, categories, text?.toString().orEmpty())
            }
            override fun afterTextChanged(text: Editable?) {}
          })
        }
      } catch (_: Exception) {
        Handler(Looper.getMainLooper()).post {
          chipWrap.removeAllViews()
          chipWrap.addView(TextView(this).apply {
            text = "Could not load categories."
            textSize = 12f
            setTextColor(0xff787671.toInt())
          })
        }
      }
    }.start()
  }

  private fun renderCategoryChips(chipWrap: LinearLayout, editText: EditText, searchInput: EditText, categories: List<OverlayNotesStore.CategoryPath>, query: String = "") {
    chipWrap.removeAllViews()
    val cleanQuery = query.trim().lowercase()
    val visibleCategories = if (cleanQuery.isBlank()) categories else categories.filter { it.label.lowercase().contains(cleanQuery) }
    if (visibleCategories.isEmpty()) {
      chipWrap.addView(TextView(this).apply {
        text = if (cleanQuery.isBlank()) "No other categories." else "No matching categories."
        textSize = 12f
        setTextColor(0xff787671.toInt())
        setPadding(0, dp(8), 0, dp(8))
      })
      return
    }
    visibleCategories.chunked(2).forEach { pair ->
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, 0, 0, dp(6))
      }
      pair.forEachIndexed { index, category ->
        val params = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
          if (index == 0) marginEnd = dp(6) else marginStart = dp(6)
        }
        row.addView(createCategoryChip(category, editText) { loadCategoryChips(chipWrap, editText, searchInput) }, params)
      }
      if (pair.size == 1) {
        row.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f).apply { marginStart = dp(6) })
      }
      chipWrap.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun createCategoryChip(category: OverlayNotesStore.CategoryPath, editText: EditText, onPinnedChanged: () -> Unit): View {
    val wrap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val chip = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = GradientDrawable().apply { shape = GradientDrawable.RECTANGLE; cornerRadius = dp(18).toFloat(); setColor(if (category.pinned) 0xfff1efff.toInt() else 0xfffafaf9.toInt()); setStroke(dp(1), if (category.pinned) 0xff5645d4.toInt() else 0xffc8c4be.toInt()) }
    }
    val menuBox = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; visibility = View.GONE; setPadding(dp(6), dp(6), dp(6), dp(4))
    }
    val pinButton = Button(this).apply {
      text = if (category.pinned) "Unpin" else "Pin"
      setOnClickListener { togglePinnedCategory(category, this, onPinnedChanged) }
    }
    val subcategoryInput = EditText(this).apply {
      hint = "Subcategory name"; minLines = 1; maxLines = 1; textSize = 13f
      setTextColor(0xff1a1a1a.toInt()); setHintTextColor(0xff787671.toInt()); setSingleLine(true)
      imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
    }
    val subcategoryBox = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; visibility = View.GONE; setPadding(0, dp(6), 0, 0)
      addView(subcategoryInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(Button(this@OverlayService).apply { text = "Create as subcategory"; setOnClickListener { submitNewSubcategoryInput(editText, subcategoryInput, category.path) } }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    menuBox.addView(pinButton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    menuBox.addView(Button(this).apply { text = "Create subcategory"; setOnClickListener { toggleSubcategoryBox(subcategoryBox, subcategoryInput) } }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    menuBox.addView(subcategoryBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    val label = TextView(this).apply {
      text = category.label; textSize = 12f; setTextColor(0xff37352f.toInt()); setSingleLine(false); ellipsize = null; includeFontPadding = false
      setPadding(dp(12), dp(9), dp(8), dp(9)); setOnClickListener { submitInput(editText, category.path) }
    }
    val overflow = TextView(this).apply {
      text = "⋮"; textSize = 18f; gravity = Gravity.CENTER; setTextColor(0xff787671.toInt()); minWidth = dp(40); setPadding(dp(8), dp(6), dp(10), dp(6))
      setOnClickListener { toggleCategoryMenu(menuBox) }
    }
    subcategoryInput.setOnEditorActionListener { _, actionId, event ->
      val enterPressed = event?.keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_UP
      if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE || enterPressed) { submitNewSubcategoryInput(editText, subcategoryInput, category.path); true } else false
    }
    chip.addView(label, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    chip.addView(overflow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.MATCH_PARENT))
    wrap.addView(chip, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    wrap.addView(menuBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return wrap
  }

  private fun toggleCategoryMenu(box: LinearLayout) {
    box.visibility = if (box.visibility == View.VISIBLE) View.GONE else View.VISIBLE
  }

  private fun togglePinnedCategory(category: OverlayNotesStore.CategoryPath, button: Button, onPinnedChanged: () -> Unit) {
    button.isEnabled = false
    Thread {
      try {
        val pinned = notesStore.togglePinnedCategory(category.path)
        Handler(Looper.getMainLooper()).post {
          Toast.makeText(this, if (pinned) "Pinned ${category.label}" else "Unpinned ${category.label}", Toast.LENGTH_SHORT).show()
          onPinnedChanged()
        }
      } catch (_: Exception) {
        Handler(Looper.getMainLooper()).post {
          button.isEnabled = true
          Toast.makeText(this, "Could not update pin.", Toast.LENGTH_LONG).show()
        }
      }
    }.start()
  }

  private fun toggleSubcategoryBox(box: LinearLayout, input: EditText) {
    box.visibility = if (box.visibility == View.VISIBLE) View.GONE else View.VISIBLE
    if (box.visibility == View.VISIBLE) {
      input.requestFocus()
      ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
    }
  }

  private fun submitNewCategoryInput(editText: EditText, categoryInput: EditText) {
    val categoryName = categoryInput.text?.toString()?.trim().orEmpty()
    if (categoryName.isBlank()) {
      Toast.makeText(this, "Category name cannot be empty.", Toast.LENGTH_SHORT).show()
      categoryInput.requestFocus()
      ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(categoryInput, InputMethodManager.SHOW_IMPLICIT)
      return
    }
    val path = listOf(categoryName)
    writeRecentCreatedCategoryKey(path)
    submitInput(editText, path, categoryInput)
  }

  private fun submitNewSubcategoryInput(editText: EditText, subcategoryInput: EditText, parentPath: List<String>) {
    val subcategoryName = subcategoryInput.text?.toString()?.trim().orEmpty()
    if (subcategoryName.isBlank()) {
      Toast.makeText(this, "Subcategory name cannot be empty.", Toast.LENGTH_SHORT).show()
      subcategoryInput.requestFocus()
      ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(subcategoryInput, InputMethodManager.SHOW_IMPLICIT)
      return
    }
    val path = parentPath + subcategoryName
    writeRecentCreatedCategoryKey(path)
    submitInput(editText, path, subcategoryInput)
  }

  private fun submitInput(editText: EditText, path: List<String>, categoryInput: EditText? = null) {
    val note = editText.text?.toString()?.trim().orEmpty()
    if (note.isBlank()) {
      Toast.makeText(this, "Note text cannot be empty.", Toast.LENGTH_SHORT).show()
      return
    }
    editText.isEnabled = false
    categoryInput?.isEnabled = false
    Thread {
      try {
        notesStore.appendNote(path, note)
        Handler(Looper.getMainLooper()).post {
          copyNoteToClipboard(note)
          Toast.makeText(this, "Added to ${path.joinToString(" > ")}", Toast.LENGTH_SHORT).show()
          hideInput()
        }
      } catch (_: Exception) {
        Handler(Looper.getMainLooper()).post {
          editText.isEnabled = true
          categoryInput?.isEnabled = true
          editText.requestFocus()
          ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(editText, InputMethodManager.SHOW_IMPLICIT)
          Toast.makeText(this, "Could not add to Firestore.", Toast.LENGTH_LONG).show()
        }
      }
    }.start()
  }

  private fun hideInput() {
    removeView(inputView)
    inputView = null
  }

  private fun copyNoteToClipboard(note: String) {
    val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Native Note", note))
  }

  private fun readRecentCreatedCategoryKey(): String? {
    return getSharedPreferences(overlayPreferencesName, Context.MODE_PRIVATE).getString(recentCreatedCategoryKey, null)
  }

  private fun writeRecentCreatedCategoryKey(path: List<String>) {
    getSharedPreferences(overlayPreferencesName, Context.MODE_PRIVATE).edit().putString(recentCreatedCategoryKey, pathKey(path)).apply()
  }

  private fun pathKey(path: List<String>): String {
    return path.joinToString("")
  }

  private fun runAction(action: String) {
    when (action) {
      OverlaySettings.ACTION_OPEN_TEXT_INPUT -> showInput()
      OverlaySettings.ACTION_OPEN_APP -> openApp()
      OverlaySettings.ACTION_OPEN_APP_ASSISTANT -> openAppAssistant()
      OverlaySettings.ACTION_HIDE_OVERLAY -> stopSelf()
    }
  }

  private fun openApp() {
    val intent = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    startActivity(intent)
  }

  private fun openAppAssistant() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nativenotes://workspace?source=overlay")).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    startActivity(intent)
  }

  private fun canDrawOverlays(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
  }

  private fun displayBounds(): android.graphics.Rect {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val metrics = windowManager.currentWindowMetrics
      val insets = metrics.windowInsets.getInsetsIgnoringVisibility(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
      )
      android.graphics.Rect(
        insets.left,
        insets.top,
        metrics.bounds.width() - insets.right,
        metrics.bounds.height() - insets.bottom,
      )
    } else {
      @Suppress("DEPRECATION")
      val displayMetrics = resources.displayMetrics
      android.graphics.Rect(0, 0, displayMetrics.widthPixels, displayMetrics.heightPixels)
    }
  }

  private fun clampParams(params: WindowManager.LayoutParams, width: Int, height: Int) {
    val bounds = displayBounds()
    val minX = bounds.left + dp(8)
    val minY = bounds.top + dp(8)
    val maxX = max(minX, bounds.right - width - dp(8))
    val maxY = max(minY, bounds.bottom - height - dp(8))
    params.x = min(max(params.x, minX), maxX)
    params.y = min(max(params.y, minY), maxY)
  }

  private fun updateView(view: View?, params: WindowManager.LayoutParams) {
    if (view == null) return
    try {
      windowManager.updateViewLayout(view, params)
    } catch (_: IllegalArgumentException) {
    }
  }

  private fun removeView(view: View?) {
    if (view == null) return
    try {
      windowManager.removeView(view)
    } catch (_: IllegalArgumentException) {
    }
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }


  companion object {
    private const val overlayPreferencesName = "floating_note_overlay"
    private const val recentCreatedCategoryKey = "recent_created_category_key"
    const val ACTION_STOP = "com.notes.nativenotetaking.overlay.STOP"
    const val ACTION_UPDATE = "com.notes.nativenotetaking.overlay.UPDATE"
    const val ACTION_RESET_POSITION = "com.notes.nativenotetaking.overlay.RESET_POSITION"
  }
}
