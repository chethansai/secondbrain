package com.notes.nativenotetaking.overlay

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.notes.nativenotetaking.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class OverlayNotesStore(private val context: Context) {
  data class CategoryPath(val path: List<String>, val pinned: Boolean = false, val pinIndex: Int = -1) {
    val label: String = path.joinToString(" > ")
  }

  data class NoteSnapshot(val categories: List<CategorySnapshot>)
  data class CategorySnapshot(val path: List<String>, val notes: List<String>) {
    val label: String = path.joinToString(" > ")
  }

  fun readCategoryPaths(): List<CategoryPath> {
    val fields = readDataFields()
    val pinnedKeys = readPinnedCategoryKeys()
    return listCategoryPaths(fields)
      .distinctBy { it.path.joinToString(pathSeparator) }
      .map { category ->
        val pinIndex = pinnedKeys.indexOf(category.path.joinToString(pathSeparator))
        category.copy(pinned = pinIndex >= 0, pinIndex = pinIndex)
      }
  }

  fun readNoteSnapshot(): NoteSnapshot {
    val fields = readDataFields()
    return NoteSnapshot(listCategorySnapshots(fields).distinctBy { it.path.joinToString("") })
  }

  fun appendNote(path: List<String>, note: String): JSONObject {
    val document = readFirestoreDocument()
    val fields = document.optJSONObject("fields") ?: JSONObject().also { document.put("fields", it) }
    val dataValue = fields.optJSONObject("data") ?: JSONObject().put("mapValue", JSONObject().put("fields", JSONObject())).also { fields.put("data", it) }
    val dataFields = dataValue.optJSONObject("mapValue")?.optJSONObject("fields") ?: JSONObject()
    dataValue.put("mapValue", JSONObject().put("fields", dataFields))
    appendCategoryString(dataFields, path, note)
    appendCategoryString(dataFields, listOf(historyCategoryName), formatAddedNoteHistory(note, path))

    val body = JSONObject().put("fields", JSONObject().put("data", dataValue))
    val connection = openFirestoreConnection(firestoreDocumentUrl(), "PATCH")
    writeJson(connection, body)
    val responseCode = connection.responseCode
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    val simpleData = firestoreDataFieldsToNotesData(dataFields)
    writeNotesDataToLocalCache(simpleData)
    return simpleData
  }

  fun togglePinnedCategory(path: List<String>): Boolean {
    val cleanPath = path.map { it.trim() }.filter { it.isNotEmpty() }
    if (cleanPath.isEmpty()) return false
    val document = readWorkspaceListDocument()
    val fields = document.optJSONObject("fields") ?: JSONObject().also { document.put("fields", it) }
    val workspaceName = fields.optJSONObject("defaultworkspace")?.optString("stringValue")?.trim()?.takeIf { it.isNotEmpty() } ?: defaultWorkspaceId
    val pinnedCategoriesValue = fields.optJSONObject("pinnedcategories") ?: JSONObject().also { fields.put("pinnedcategories", it) }
    val pinnedCategoriesFields = pinnedCategoriesValue.optJSONObject("mapValue")?.optJSONObject("fields") ?: JSONObject()
    pinnedCategoriesValue.put("mapValue", JSONObject().put("fields", pinnedCategoriesFields))

    val currentPins = readStringArrayField(pinnedCategoriesFields.optJSONObject(workspaceName)).toMutableList()
    val pathName = cleanPath.joinToString(" > ")
    val existingIndex = currentPins.indexOfFirst { categoryPathKey(parseCategoryPathName(it)) == categoryPathKey(cleanPath) }
    val pinned = existingIndex < 0
    if (pinned) {
      currentPins.add(pathName)
    } else {
      currentPins.removeAt(existingIndex)
    }
    pinnedCategoriesFields.put(workspaceName, stringArrayField(currentPins))
    fields.put("defaultworkspace", JSONObject().put("stringValue", workspaceName))
    if (!fields.has(workspaceName)) fields.put(workspaceName, stringArrayField(emptyList()))

    val body = JSONObject().put("fields", fields)
    val connection = openFirestoreConnection(workspaceListDocumentUrl(), "PATCH")
    writeJson(connection, body)
    val responseCode = connection.responseCode
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    return pinned
  }

  private fun readDataFields(): JSONObject {
    val document = readFirestoreDocument()
    return document.optJSONObject("fields")
      ?.optJSONObject("data")
      ?.optJSONObject("mapValue")
      ?.optJSONObject("fields") ?: JSONObject()
  }

  private fun readFirestoreDocument(): JSONObject {
    val connection = openFirestoreConnection(firestoreDocumentUrl(), "GET")
    val responseCode = connection.responseCode
    if (responseCode == 404) return JSONObject()
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    val response = readResponse(connection)
    return if (response.isBlank()) JSONObject() else JSONObject(response)
  }

  private fun readWorkspaceListDocument(): JSONObject {
    val connection = openFirestoreConnection(workspaceListDocumentUrl(), "GET")
    val responseCode = connection.responseCode
    if (responseCode == 404) return JSONObject()
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    val response = readResponse(connection)
    return if (response.isBlank()) JSONObject() else JSONObject(response)
  }

  private fun openFirestoreConnection(url: String, method: String): HttpURLConnection {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.requestMethod = method
    connection.connectTimeout = 12000
    connection.readTimeout = 12000
    connection.setRequestProperty("Content-Type", "application/json")
    if (method == "PATCH") connection.doOutput = true
    return connection
  }

  private fun writeJson(connection: HttpURLConnection, body: JSONObject) {
    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer -> writer.write(body.toString()) }
  }

  private fun readPinnedCategoryKeys(): List<String> {
    val document = readWorkspaceListDocument()
    val fields = document.optJSONObject("fields") ?: return emptyList()
    val workspaceName = fields.optJSONObject("defaultworkspace")?.optString("stringValue")?.trim()?.takeIf { it.isNotEmpty() } ?: defaultWorkspaceId
    val workspacePins = fields
      .optJSONObject("pinnedcategories")
      ?.optJSONObject("mapValue")
      ?.optJSONObject("fields")
      ?.optJSONObject(workspaceName)
    return readStringArrayField(workspacePins).map { categoryPathKey(parseCategoryPathName(it)) }.distinct()
  }

  private fun readStringArrayField(value: JSONObject?): List<String> {
    val values = value?.optJSONObject("arrayValue")?.optJSONArray("values") ?: return emptyList()
    val items = mutableListOf<String>()
    for (index in 0 until values.length()) {
      val text = values.optJSONObject(index)?.optString("stringValue")?.trim().orEmpty()
      if (text.isNotEmpty()) items.add(text)
    }
    return items
  }

  private fun stringArrayField(items: List<String>): JSONObject {
    val values = JSONArray()
    items.forEach { item -> values.put(JSONObject().put("stringValue", item)) }
    return JSONObject().put("arrayValue", JSONObject().put("values", values))
  }

  private fun parseCategoryPathName(name: String): List<String> {
    return name.split(">").map { it.trim() }.filter { it.isNotEmpty() }
  }

  private fun categoryPathKey(path: List<String>): String {
    return path.joinToString(pathSeparator)
  }

  private fun readResponse(connection: HttpURLConnection): String {
    val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream ?: connection.inputStream
    return BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader -> reader.readText() }
  }

  private fun appendCategoryString(dataFields: JSONObject, path: List<String>, text: String) {
    if (path.isEmpty()) return
    var categoryValue = getOrCreateCategoryField(dataFields, path.first())
    path.drop(1).forEach { segment -> categoryValue = getOrCreateNestedCategoryField(categoryValue, segment) }
    val categoryArray = categoryValue.optJSONObject("arrayValue") ?: JSONObject().put("values", JSONArray()).also { categoryValue.put("arrayValue", it) }
    val categoryValues = categoryArray.optJSONArray("values") ?: JSONArray().also { categoryArray.put("values", it) }
    categoryValues.put(JSONObject().put("stringValue", text))
  }

  private fun getOrCreateCategoryField(fields: JSONObject, name: String): JSONObject {
    return fields.optJSONObject(name) ?: JSONObject().put("arrayValue", JSONObject().put("values", JSONArray())).also { fields.put(name, it) }
  }

  private fun getOrCreateNestedCategoryField(parentCategoryValue: JSONObject, name: String): JSONObject {
    val parentArray = parentCategoryValue.optJSONObject("arrayValue") ?: JSONObject().put("values", JSONArray()).also { parentCategoryValue.put("arrayValue", it) }
    val parentValues = parentArray.optJSONArray("values") ?: JSONArray().also { parentArray.put("values", it) }
    for (index in 0 until parentValues.length()) {
      val fields = parentValues.optJSONObject(index)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
      val existing = fields.optJSONObject(name)
      if (existing != null) return existing
    }
    val childField = JSONObject().put("arrayValue", JSONObject().put("values", JSONArray()))
    val childFields = JSONObject().put(name, childField)
    parentValues.put(JSONObject().put("mapValue", JSONObject().put("fields", childFields)))
    return childField
  }

  private fun listCategoryPaths(fields: JSONObject, parentPath: List<String> = emptyList()): List<CategoryPath> {
    val paths = mutableListOf<CategoryPath>()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val path = parentPath + key
      paths.add(CategoryPath(path))
      val values = fields.optJSONObject(key)?.optJSONObject("arrayValue")?.optJSONArray("values") ?: continue
      for (index in 0 until values.length()) {
        val childFields = values.optJSONObject(index)?.optJSONObject("mapValue")?.optJSONObject("fields") ?: continue
        paths.addAll(listCategoryPaths(childFields, path))
      }
    }
    return paths
  }

  private fun listCategorySnapshots(fields: JSONObject, parentPath: List<String> = emptyList()): List<CategorySnapshot> {
    val snapshots = mutableListOf<CategorySnapshot>()
    val keys = fields.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val path = parentPath + key
      val notes = mutableListOf<String>()
      val values = fields.optJSONObject(key)?.optJSONObject("arrayValue")?.optJSONArray("values") ?: JSONArray()
      val childFieldsList = mutableListOf<JSONObject>()
      for (index in 0 until values.length()) {
        val value = values.optJSONObject(index) ?: continue
        if (value.has("stringValue")) notes.add(value.optString("stringValue"))
        value.optJSONObject("mapValue")?.optJSONObject("fields")?.let { childFieldsList.add(it) }
      }
      snapshots.add(CategorySnapshot(path, notes))
      childFieldsList.forEach { snapshots.addAll(listCategorySnapshots(it, path)) }
    }
    return snapshots
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

  private fun formatAddedNoteHistory(note: String, path: List<String>): String {
    return "$note - ${path.joinToString(" > ")} - ${historyDateFormat.get()!!.format(Date())}"
  }

  private fun writeNotesDataToLocalCache(data: JSONObject) {
    val db = AsyncStorageDb(context).writableDatabase
    val serialized = JSONObject().put("data", data).toString()
    writeStorageValue(db, localWorkspaceNotesKey, serialized)
    writeStorageValue(db, legacyLocalNotesKey, serialized)
  }

  private fun writeStorageValue(db: SQLiteDatabase, key: String, value: String) {
    val contentValues = ContentValues().apply {
      put(storageKeyColumn, key)
      put(storageValueColumn, value)
    }
    db.insertWithOnConflict(storageTableName, null, contentValues, SQLiteDatabase.CONFLICT_REPLACE)
  }

  private class AsyncStorageDb(context: Context) : SQLiteOpenHelper(context.applicationContext, storageDatabaseName, null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL(createStorageTableSql)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      db.execSQL(createStorageTableSql)
    }
  }

  companion object {
    const val seekCategoryName = "SEEK"
    private const val historyCategoryName = "HISTORY"
    private const val storageDatabaseName = "RKStorage"
    private const val storageTableName = "catalystLocalStorage"
    private const val storageKeyColumn = "key"
    private const val storageValueColumn = "value"
    private const val localWorkspaceNotesKey = "rnnotetaking.notes.workspace.Main"
    private const val legacyLocalNotesKey = "rnnotetaking.notes.main"
    private const val createStorageTableSql = "CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    private const val defaultWorkspaceId = "workspace1"
    private val historyDateFormat = ThreadLocal.withInitial { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
    private const val pathSeparator = "\u001f"

    private fun firestoreDocumentUrl(): String = firestoreDocumentUrl("main")

    private fun workspaceListDocumentUrl(): String = firestoreDocumentUrl("workspaceslist")

    private fun firestoreDocumentUrl(documentId: String): String {
      val projectId = BuildConfig.FIREBASE_PROJECT_ID.trim()
      val apiKey = BuildConfig.FIREBASE_API_KEY.trim()
      if (projectId.isEmpty() || apiKey.isEmpty()) {
        throw IllegalStateException("Missing native Firebase config. Set FIREBASE_PROJECT_ID and FIREBASE_API_KEY in android/local.properties, Gradle properties, or the build environment.")
      }
      return "https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/reactnativecollection/$documentId?key=$apiKey"
    }
  }
}