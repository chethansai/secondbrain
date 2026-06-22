package com.notes.nativenotetaking.ocr

import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.FileNotFoundException

class OcrModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "OcrModule"

    @ReactMethod
    fun recognizeTextFromImage(uriString: String, promise: Promise) {
        try {
            val context = reactApplicationContext
            val uri = Uri.parse(uriString)

            val image = try {
                InputImage.fromFilePath(context, uri)
            } catch (e: FileNotFoundException) {
                promise.reject("ocr_file_not_found", "Image file not found at URI: $uriString", e)
                return
            } catch (e: Exception) {
                promise.reject("ocr_file_not_found", "Failed to read image: ${e.message}", e)
                return
            }

            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

            recognizer.process(image)
                .addOnSuccessListener { visionText ->
                    val result = WritableNativeMap()
                    result.putString("fullText", visionText.text)

                    val blocksArray = WritableNativeArray()
                    for (block in visionText.textBlocks) {
                        val blockMap = WritableNativeMap()
                        blockMap.putString("text", block.text)

                        val linesArray = WritableNativeArray()
                        for (line in block.lines) {
                            val lineMap = WritableNativeMap()
                            lineMap.putString("text", line.text)
                            if (line.confidence != null) {
                                lineMap.putDouble("confidence", line.confidence!!.toDouble())
                            }
                            linesArray.pushMap(lineMap)
                        }
                        blockMap.putArray("lines", linesArray)
                        blocksArray.pushMap(blockMap)
                    }
                    result.putArray("blocks", blocksArray)

                    promise.resolve(result)
                }
                .addOnFailureListener { e ->
                    promise.reject("ocr_engine_failed", "ML Kit OCR failed: ${e.message}", e)
                }
        } catch (e: SecurityException) {
            promise.reject("ocr_permission_denied", "Permission denied to access image: ${e.message}", e)
        } catch (e: Exception) {
            promise.reject("ocr_engine_failed", "Unexpected OCR error: ${e.message}", e)
        }
    }
}
