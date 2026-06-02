package com.notes.nativenotetaking.assistant

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import com.notes.nativenotetaking.widget.NoteWidgetConfigureActivity

class NativeNotesVoiceInteractionSessionService : VoiceInteractionSessionService() {
  override fun onNewSession(args: Bundle?): VoiceInteractionSession {
    return NativeNotesVoiceInteractionSession(this)
  }
}

class NativeNotesVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    launchWorkspace("home")
    finish()
  }

  private fun launchWorkspace(source: String) {
    val launchIntent = Intent(context, NoteWidgetConfigureActivity::class.java).apply {
      putExtra(NoteWidgetConfigureActivity.quickNoteExtra, true)
      putExtra("source", source)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    context.startActivity(launchIntent)
  }
}
