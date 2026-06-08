package com.notes.nativenotetaking.assistant

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class AssistantModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), RecognitionListener {
  private var recognizer: SpeechRecognizer? = null

  override fun getName(): String = "AssistantModule"

  @ReactMethod
  fun startListening(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("activity_unavailable", "Speech recognition needs an active app window.")
      return
    }
    if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
      promise.reject("speech_unavailable", "Speech recognition is not available on this device.")
      return
    }

    activity.runOnUiThread {
      try {
        if (recognizer == null) {
          recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext).also {
            it.setRecognitionListener(this)
          }
        }
        recognizer?.startListening(createRecognizerIntent())
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("speech_start_failed", error.message, error)
      }
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      stopRecognizer()
      promise.resolve(true)
      return
    }

    activity.runOnUiThread {
      stopRecognizer()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun launchAssistant(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  override fun invalidate() {
    stopRecognizer()
    recognizer?.destroy()
    recognizer = null
    super.invalidate()
  }

  override fun onResults(results: Bundle?) {
    val text = firstResult(results)
    if (text.isNotBlank()) emit("AssistantSpeechResult", text)
  }

  override fun onPartialResults(partialResults: Bundle?) {
    val text = firstResult(partialResults)
    if (text.isNotBlank()) emit("AssistantSpeechPartial", text)
  }

  override fun onError(error: Int) {
    emit("AssistantSpeechError", error.toString())
  }

  override fun onReadyForSpeech(params: Bundle?) = Unit
  override fun onBeginningOfSpeech() = Unit
  override fun onRmsChanged(rmsdB: Float) = Unit
  override fun onBufferReceived(buffer: ByteArray?) = Unit
  override fun onEndOfSpeech() = Unit
  override fun onEvent(eventType: Int, params: Bundle?) = Unit

  private fun createRecognizerIntent(): Intent {
    return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
  }

  private fun stopRecognizer() {
    try {
      recognizer?.stopListening()
      recognizer?.cancel()
    } catch (_: Exception) {
    }
  }

  private fun firstResult(results: Bundle?): String {
    return results
      ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      ?.firstOrNull()
      ?.trim()
      ?: ""
  }

  private fun emit(eventName: String, text: String) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, text)
  }
}
