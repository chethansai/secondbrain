package com.notes.nativenotetaking.overlay

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
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
  data class CategoryPath(val path: List<String>) {
    val label: String = path.joinToString(" > ")
  }

  data class NoteSnapshot(val categories: List<CategorySnapshot>)
  data class CategorySnapshot(val path: List<String>, val notes: List<String>) {
    val label: String = path.joinToString(" > ")
  }

  fun readCategoryPaths(): List<CategoryPath> {
    val fields = readDataFields()
    return listCategoryPaths(fields).distinctBy { it.path.joinToString("") }
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
    val connection = openFirestoreConnection("PATCH")
    writeJson(connection, body)
    val responseCode = connection.responseCode
    if (responseCode !in 200..299) throw IllegalStateException(readResponse(connection))
    val simpleData = firestoreDataFieldsToNotesData(dataFields)
    writeNotesDataToLocalCache(simpleData)
    return simpleData
  }

  private fun readDataFields(): JSONObject {
    val document = readFirestoreDocument()
    return document.optJSONObject("fields")
      ?.optJSONObject("data")
      ?.optJSONObject("mapValue")
      ?.optJSONObject("fields") ?: JSONObject()
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
    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer -> writer.write(body.toString()) }
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
    private const val firestoreDocumentUrl = "https://firestore.googleapis.com/v1/projects/notes-55c97/databases/(default)/documents/reactnativecollection/main?key=AIzaSyD8t3f8EvherkuyAmLB6iFN5wuiOmALCzU"
    private val historyDateFormat = ThreadLocal.withInitial { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
  }
}