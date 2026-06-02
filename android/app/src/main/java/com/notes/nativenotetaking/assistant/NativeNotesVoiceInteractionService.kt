package com.notes.nativenotetaking.assistant

import android.content.Intent
import android.service.voice.VoiceInteractionService
import com.notes.nativenotetaking.widget.NoteWidgetConfigureActivity

class NativeNotesVoiceInteractionService : VoiceInteractionService() {
  override fun onLaunchVoiceAssistFromKeyguard() {
    super.onLaunchVoiceAssistFromKeyguard()
    launchWorkspace("keyguard")
  }

  private fun launchWorkspace(source: String) {
    val launchIntent = Intent(this, NoteWidgetConfigureActivity::class.java).apply {
      putExtra(NoteWidgetConfigureActivity.quickNoteExtra, true)
      putExtra("source", source)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    startActivity(launchIntent)
  }
}
