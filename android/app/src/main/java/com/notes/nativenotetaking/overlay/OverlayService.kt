package com.notes.nativenotetaking.overlay

import android.app.Service
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Handler
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.notes.nativenotetaking.MainActivity
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class OverlayService : Service() {
  private lateinit var windowManager: WindowManager
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
        text = "+"
        textSize = (settings.size * 0.48f).coerceIn(20f, 38f)
        gravity = Gravity.CENTER
        setTextColor(0xffffffff.toInt())
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
      val bounds = displayBounds()
      x = if (settings.x == Int.MIN_VALUE) bounds.width() - buttonSize - dp(18) else settings.x
      y = if (settings.y == Int.MIN_VALUE) bounds.height() / 2 else settings.y
      clampParams(this, buttonSize, buttonSize)
    }

    label.setOnTouchListener(ButtonTouchHandler(params))
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
      val bounds = displayBounds()
      it.x = bounds.width() - buttonSize - dp(18)
      it.y = bounds.height() / 2
      clampParams(it, buttonSize, buttonSize)
      OverlaySettings.savePosition(this, it.x, it.y)
      updateView(buttonView, it)
    }
  }

  private fun showInput() {
    removeView(inputView)
    val editText = EditText(this).apply {
      hint = "Add to SEEK"
      minLines = 1
      maxLines = 3
      textSize = 16f
      setTextColor(0xff1a1a1a.toInt())
      setHintTextColor(0xff787671.toInt())
      setSingleLine(false)
      imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_DONE
    }
    val saveButton = Button(this).apply {
      text = "Save"
      setOnClickListener { submitInput(editText) }
    }
    val closeButton = Button(this).apply {
      text = "Close"
      setOnClickListener { hideInput() }
    }
    val controls = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      addView(saveButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
      addView(closeButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    }
    val container = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), dp(10), dp(12), dp(10))
      setBackgroundColor(0xeeffffff.toInt())
      elevation = dp(10).toFloat()
      addView(editText, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
      addView(controls, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    }
    val frame = FrameLayout(this).apply { addView(container) }
    val width = min(displayBounds().width() - dp(32), dp(340))
    val params = WindowManager.LayoutParams(
      width,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      val source = buttonParams
      x = source?.x ?: dp(16)
      y = max(dp(24), (source?.y ?: dp(120)) - dp(72))
      clampParams(this, width, dp(150))
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
    }

    editText.setOnEditorActionListener { _, actionId, event ->
      val enterPressed = event?.keyCode == android.view.KeyEvent.KEYCODE_ENTER && event.action == android.view.KeyEvent.ACTION_UP
      if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE || enterPressed) {
        submitInput(editText)
        true
      } else {
        false
      }
    }

    windowManager.addView(frame, params)
    inputView = frame
    editText.postDelayed({
      editText.requestFocus()
      ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(editText, InputMethodManager.SHOW_IMPLICIT)
    }, 120)
  }

  private fun submitInput(editText: EditText) {
    val note = editText.text?.toString()?.trim().orEmpty()
    if (note.isBlank()) {
      Toast.makeText(this, "Note text cannot be empty.", Toast.LENGTH_SHORT).show()
      return
    }
    editText.isEnabled = false
    Thread {
      try {
        val data = appendSeekNoteToFirestore(note)
        writeNotesDataToLocalCache(data)
        Handler(Looper.getMainLooper()).post {
          Toast.makeText(this, "Added to Firestore SEEK", Toast.LENGTH_SHORT).show()
          hideInput()
        }
      } catch (_: Exception) {
        Handler(Looper.getMainLooper()).post {
          editText.isEnabled = true
          editText.requestFocus()
          ContextCompat.getSystemService(this, InputMethodManager::class.java)?.showSoftInput(editText, InputMethodManager.SHOW_IMPLICIT)
          Toast.makeText(this, "Could not add to Firestore.", Toast.LENGTH_LONG).show()
        }
      }
    }.start()
  }

  private fun appendSeekNoteToFirestore(note: String): JSONObject {
    val document = readFirestoreDocument()
    val fields = document.optJSONObject("fields") ?: JSONObject().also { document.put("fields", it) }
    val dataValue = fields.optJSONObject("data") ?: JSONObject().put("mapValue", JSONObject().put("fields", JSONObject())).also { fields.put("data", it) }
    val dataFields = dataValue.optJSONObject("mapValue")?.optJSONObject("fields") ?: JSONObject()
    dataValue.put("mapValue", JSONObject().put("fields", dataFields))
    val seekValue = dataFields.optJSONObject("SEEK") ?: JSONObject().put("arrayValue", JSONObject().put("values", JSONArray())).also { dataFields.put("SEEK", it) }
    val seekArray = seekValue.optJSONObject("arrayValue") ?: JSONObject().put("values", JSONArray()).also { seekValue.put("arrayValue", it) }
    val seekValues = seekArray.optJSONArray("values") ?: JSONArray().also { seekArray.put("values", it) }
    seekValues.put(JSONObject().put("stringValue", note))

    val body = JSONObject().put("fields", JSONObject().put("data", dataValue))
    val connection = openFirestoreConnection("PATCH")
    writeJson(connection, body)
    val responseCode = connection.responseCode
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    return firestoreDataFieldsToNotesData(dataFields)
  }

  private fun readFirestoreDocument(): JSONObject {
    val connection = openFirestoreConnection("GET")
    val responseCode = connection.responseCode
    if (responseCode == 404) return JSONObject()
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    val response = readResponse(connection)
    return if (response.isBlank()) JSONObject() else JSONObject(response)
  }

  private fun openFirestoreConnection(method: String): HttpURLConnection {
    val connection = URL(firestoreDocumentUrl).openConnection() as HttpURLConnection
    connection.requestMethod = method
    connection.connectTimeout = 12000
    connection.readTimeout = 12000
    connection.setRequestProperty("Content-Type", "application/json")
    if (method == "PATCH") connection.doOutput = true
    return connection
  }

  private fun writeJson(connection: HttpURLConnection, body: JSONObject) {
    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
      writer.write(body.toString())
    }
  }

  private fun readResponse(connection: HttpURLConnection): String {
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream ?: connection.inputStream
    return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader -> reader.readText() }
  }

  private fun firestoreDataFieldsToNotesData(dataFields: JSONObject): JSONObject {
    val data = JSONObject()
    val keys = dataFields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val arrayValue = dataFields.optJSONObject(key)?.optJSONObject("arrayValue") ?: continue
      data.put(key, firestoreArrayToNoteItems(arrayValue.optJSONArray("values") ?: JSONArray()))
    }
    return data
  }

  private fun firestoreArrayToNoteItems(values: JSONArray): JSONArray {
    val items = JSONArray()
    for (index in 0 until values.length()) {
      val value = values.optJSONObject(index) ?: continue
      when {
        value.has("stringValue") -> items.put(value.optString("stringValue"))
        value.has("mapValue") -> items.put(firestoreMapToCategoryNode(value.optJSONObject("mapValue")?.optJSONObject("fields") ?: JSONObject()))
      }
    }
    return items
  }

  private fun firestoreMapToCategoryNode(fields: JSONObject): JSONObject {
    val node = JSONObject()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val arrayValue = fields.optJSONObject(key)?.optJSONObject("arrayValue") ?: continue
      node.put(key, firestoreArrayToNoteItems(arrayValue.optJSONArray("values") ?: JSONArray()))
    }
    return node
  }

  private fun writeNotesDataToLocalCache(data: JSONObject) {
    val db = AsyncStorageDb(this).writableDatabase
    val serialized = JSONObject().put("data", data).toString()
    writeStorageValue(db, localWorkspaceNotesKey, serialized)
    writeStorageValue(db, legacyLocalNotesKey, serialized)
  }

  private fun readStorageValue(db: SQLiteDatabase, key: String): String? {
    val cursor = db.query(storageTableName, arrayOf(storageValueColumn), "$storageKeyColumn=?", arrayOf(key), null, null, null)
    return cursor.use { if (it.moveToFirst()) it.getString(0) else null }
  }

  private fun writeStorageValue(db: SQLiteDatabase, key: String, value: String) {
    val contentValues = ContentValues().apply {
      put(storageKeyColumn, key)
      put(storageValueColumn, value)
    }
    db.insertWithOnConflict(storageTableName, null, contentValues, SQLiteDatabase.CONFLICT_REPLACE)
  }

  private fun hideInput() {
    removeView(inputView)
    inputView = null
  }

  private fun runAction(action: String) {
    when (action) {
      OverlaySettings.ACTION_OPEN_TEXT_INPUT -> showInput()
      OverlaySettings.ACTION_OPEN_APP -> openApp()
      OverlaySettings.ACTION_HIDE_OVERLAY -> stopSelf()
    }
  }

  private fun openApp() {
    val intent = Intent(this, MainActivity::class.java).apply {
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

  private inner class ButtonTouchHandler(private val params: WindowManager.LayoutParams) : View.OnTouchListener {
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
          val buttonSize = dp(settings.size)
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
            OverlaySettings.savePosition(this@OverlayService, params.x, params.y)
            settings = OverlaySettings.read(this@OverlayService)
            if (deltaX <= -swipeThreshold && abs(deltaX) > abs(deltaY)) {
              runAction(settings.swipeLeftAction)
            } else if (deltaY >= swipeThreshold && abs(deltaY) > abs(deltaX)) {
              runAction(settings.swipeDownAction)
            }
          } else {
            runAction(settings.tapAction)
          }
          return true
        }
      }
      return false
    }
  }

  companion object {
    const val ACTION_STOP = "com.notes.nativenotetaking.overlay.STOP"
    const val ACTION_UPDATE = "com.notes.nativenotetaking.overlay.UPDATE"
    const val ACTION_RESET_POSITION = "com.notes.nativenotetaking.overlay.RESET_POSITION"
    private const val storageDatabaseName = "RKStorage"
    private const val storageTableName = "catalystLocalStorage"
    private const val storageKeyColumn = "key"
    private const val storageValueColumn = "value"
    private const val localWorkspaceNotesKey = "rnnotetaking.notes.workspace.Main"
    private const val legacyLocalNotesKey = "rnnotetaking.notes.main"
    private const val createStorageTableSql = "CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    private const val firestoreDocumentUrl = "https://firestore.googleapis.com/v1/projects/notes-55c97/databases/(default)/documents/reactnativecollection/main?key=AIzaSyD8t3f8EvherkuyAmLB6iFN5wuiOmALCzU"
  }

  private class AsyncStorageDb(context: Context) : SQLiteOpenHelper(context.applicationContext, storageDatabaseName, null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL(createStorageTableSql)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      db.execSQL(createStorageTableSql)
    }
  }
}
