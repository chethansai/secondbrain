package com.notes.nativenotetaking.assistant

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

class NativeNotesVoiceInteractionSessionService : VoiceInteractionSessionService() {
  override fun onNewSession(args: Bundle?): VoiceInteractionSession {
    return NativeNotesVoiceInteractionSession(this)
  }
}

class NativeNotesVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    launchAssistant("home")
    finish()
  }

  private fun launchAssistant(source: String) {
    val launchIntent = Intent(Intent.ACTION_VIEW).apply {
      data = Uri.parse("nativenotes://assistant?source=$source")
      setPackage(context.packageName)
      addCategory(Intent.CATEGORY_BROWSABLE)
      addCategory(Intent.CATEGORY_DEFAULT)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    context.startActivity(launchIntent)
  }
}
