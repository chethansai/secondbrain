package com.notes.nativenotetaking.assistant

import android.content.Intent
import android.net.Uri
import android.service.voice.VoiceInteractionService

class NativeNotesVoiceInteractionService : VoiceInteractionService() {
  override fun onReady() {
    super.onReady()
    launchAssistant("ready")
  }

  override fun onLaunchVoiceAssistFromKeyguard() {
    super.onLaunchVoiceAssistFromKeyguard()
    launchAssistant("keyguard")
  }

  private fun launchAssistant(source: String) {
    val launchIntent = Intent(Intent.ACTION_VIEW).apply {
      data = Uri.parse("nativenotes://assistant?source=$source")
      setPackage(packageName)
      addCategory(Intent.CATEGORY_BROWSABLE)
      addCategory(Intent.CATEGORY_DEFAULT)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    startActivity(launchIntent)
  }
}
