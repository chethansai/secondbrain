# Android Assistant Integration Plan

**Date**: June 2, 2026  
**Status**: Planning Phase  
**Scope Decision**: TBD (v1 release vs. future v2 feature)

---

## Overview

This document outlines how to integrate Android Assistant capabilities into Native Note Taking, allowing it to appear as a selectable default digital assistant app (competing with Gemini, Google Assistant, Bixby).

**User Flows Enabled**:
- Assistant gesture (long-press power, corner swipes, dedicated button) launches the app
- User can set Native Note Taking as the default digital assistant in Settings > Apps > Default Apps
- Voice input and response delivery
- Optional: Floating overlay on top of other apps
- Optional: Wake word detection ("Hey Preethi")
- Optional: Voice commands for notes

**Key Constraint**: User must manually select the app in Settings; there is no programmatic way to force it as default.

---

## Critical Decision: Scope Timing

### Option A: v1 Core (Current Focus)
- **Goal**: Stable notes/categories/search/sync/auth by initial release
- **Assistant Status**: Defer to v2+
- **Rationale**: Assistant is high-complexity, requires native modules, delays core release
- **Recommendation**: ✅ Likely correct for first release

### Option B: v1.5 Assistant (Post-Core, Pre-Full-Release)
- **Goal**: Ship core notes, then add assistant capability
- **Rationale**: Differentiation from other note apps, early user adoption as default assistant
- **Complexity**: Medium—defer speech/wake-word, launch chat as minimal v1
- **Timeline**: 4-8 weeks after core release
- **Recommendation**: Reasonable if you want assistant positioning early

### Option C: v2 Assistant (Full Featured)
- **Goal**: Core notes mature, then enterprise assistant features
- **Scope**: Voice, wake words, foreground listening, overlays, deep AI integration
- **Timeline**: 3–6 months after core release
- **Recommendation**: Most practical for stability and user retention

---

## Phase Breakdown

### Phase 1: Android Manifest & Intent Filtering
**Dependency**: Android native build configuration  
**Effort**: 1–2 days

**What's Required**:

1. **Register Assistant Intent Filter**
   - In `android/app/src/main/AndroidManifest.xml`:
     ```xml
     <activity android:name=".AssistantActivity"
               android:exported="true">
         <intent-filter>
             <action android:name="android.intent.action.ASSIST" />
             <category android:name="android.intent.category.DEFAULT" />
         </intent-filter>
         <intent-filter>
             <action android:name="android.intent.action.VOICE_ASSIST" />
             <category android:name="android.intent.category.DEFAULT" />
         </intent-filter>
     </activity>
     ```
   - This allows Android OS to discover your app as an assistant provider.

2. **Optional: Voice Interaction Support**
   ```xml
   <uses-feature android:name="android.hardware.microphone" android:required="false" />
   ```

3. **Optional: RECORD_AUDIO Permission** (if doing voice)
   ```xml
   <uses-permission android:name="android.permission.RECORD_AUDIO" />
   ```

**Outcome**: Native Note Taking appears in Settings > Apps > Default Apps > Digital Assistant App

---

### Phase 2: AssistantActivity (Native Entry Point)
**Dependency**: Phase 1 + Expo native module bridging  
**Effort**: 2–3 days

**What's Required**:

1. **Kotlin/Java Activity Class**
   - File: `android/app/src/main/java/com/notes/nativenotetaking/AssistantActivity.kt`
   ```kotlin
   package com.notes.nativenotetaking

   import android.app.Activity
   import android.os.Bundle
   import android.content.Intent

   class AssistantActivity : Activity() {
       override fun onCreate(savedInstanceState: Bundle?) {
           super.onCreate(savedInstanceState)
           
           // Detect which assistant action was invoked
           val intent = intent
           when {
               intent.action == Intent.ACTION_ASSIST -> {
                   // Power-button long-press assistant gesture
               }
               intent.action == "android.intent.action.VOICE_ASSIST" -> {
                   // Voice assistant gesture
               }
           }
           
           // Option 1: Open chat screen directly
           startAiChatScreen()
           
           // Option 2: Show overlay (Phase 5)
           startAssistantOverlay()
       }
       
       private fun startAiChatScreen() {
           // Bridge to React Native AiChatPanel or similar
       }
   }
   ```

2. **React Native Module Bridge**
   - Create `src/features/assistant/nativeAssistantBridge.ts`:
     ```typescript
     import { NativeModules } from 'react-native';
     
     const { AssistantModule } = NativeModules;
     
     export const assistantBridge = {
       launchAssistant: () => AssistantModule.launchChat(),
       startListening: () => AssistantModule.startVoiceInput(),
       stopListening: () => AssistantModule.stopVoiceInput(),
     };
     ```

3. **Integration with Deep Links**
   - Reuse existing `src/features/automation/deepLinks.ts` pattern:
     - Add `assistant:` scheme handler
     - Route to AI Chat panel

**Outcome**: Tapping your app in Default Apps > Digital Assistant launches React Native AI Chat

---

### Phase 3: Voice Input (Optional v1.5+)
**Dependency**: Phase 2 + Android SpeechRecognizer  
**Effort**: 3–4 days

**What's Required**:

1. **Speech Recognizer Service**
   - File: `android/app/src/main/java/.../VoiceInputService.kt`
   ```kotlin
   class VoiceInputService : Service() {
       private lateinit var speechRecognizer: SpeechRecognizer
       
       fun startListening() {
           val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
               putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
               putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
           }
           speechRecognizer.startListening(intent)
       }
   }
   ```

2. **Text-to-Speech Response**
   - File: `android/app/src/main/java/.../TextToSpeechService.kt`
   ```kotlin
   class TextToSpeechService {
       private val tts = TextToSpeech(context) { status ->
           if (status == TextToSpeech.SUCCESS) {
               tts.language = Locale.US
           }
       }
       
       fun speak(text: String) {
           tts.speak(text, TextToSpeech.QUEUE_FLUSH, null)
       }
   }
   ```

3. **React Native Native Module**
   - Create `src/features/assistant/VoiceModule.ts`:
     ```typescript
     export const VoiceModule = {
       startListening: async () => {
           // Returns transcribed text from Android SpeechRecognizer
       },
       speakResponse: async (text: string) => {
           // Plays response via TextToSpeech
       },
     };
     ```

**Outcome**: User can speak to assistant, hear back responses

---

### Phase 4: AI Backend Integration
**Dependency**: Phase 3 (or can be done in parallel for text-only chat)  
**Effort**: 2–3 days

**What's Required**:

1. **LLM API Bridging**
   - Reuse existing `src/features/ai/` structure:
     - Add assistant-specific prompt templates
     - Route voice input → LLM → response
   - Example endpoint call:
     ```typescript
     async function getAssistantResponse(userInput: string) {
         const response = await fetch('https://vmi3321442.tailb6229f.ts.net/v1/responses', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                 prompt: userInput,
                 context: 'notes', // or 'general'
             }),
         });
         return response.json();
     }
     ```

2. **Note Context Integration** (Optional)
   - Inject current notes into assistant prompt:
     ```typescript
     const systemPrompt = `You are an assistant for a note-taking app. Current notes:\n${flattenedNotes}`;
     ```

3. **Response Formatting**
   - Voice-optimized responses (shorter, clearer)
   - Quick action responses ("Note added", "Category created")

**Outcome**: Assistant can respond intelligently to user queries + perform note operations

---

### Phase 5: Floating Overlay (Optional v2)
**Dependency**: Phase 4 + Android Overlay Manager  
**Effort**: 4–5 days

**What's Required**:

1. **Overlay Permission**
   ```xml
   <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
   ```

2. **Overlay Service**
   - File: `android/app/src/main/java/.../OverlayService.kt`
   ```kotlin
   class OverlayService : Service() {
       private val windowManager by lazy { getSystemService(Context.WINDOW_SERVICE) as WindowManager }
       private val params = WindowManager.LayoutParams().apply {
           type = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
           format = PixelFormat.TRANSLUCENT
           flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
           width = 200
           height = 200
       }
       
       override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
           val bubbleView = createBubbleView()
           windowManager.addView(bubbleView, params)
           return START_STICKY
       }
       
       private fun createBubbleView(): View {
           // React Native RootView or simple native bubble
       }
   }
   ```

3. **Foreground Service (For Always-On)**
   - Requires foreground notification (Android 8+)
   - Metadata for Android 14+:
     ```xml
     <service
         android:name=".OverlayService"
         android:foregroundServiceType="specialUse" />
     
     <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
     ```

4. **Gesture Detection**
   - Detect swipes, taps from edges
   - Launch chat or mini-window

**Outcome**: Floating chat bubble on top of other apps (Gemini-style)

---

### Phase 6: Wake Word Detection (Optional v2+)
**Dependency**: Phase 5 + background service library  
**Effort**: 5–7 days

**What's Required**:

1. **Wake Word Engine**
   - Options:
     - **Porcupine** (Picovoice): ~$50–200/month production, free dev
     - **Snowboy** (discontinued, but still works)
     - **Google ML Kit On-Device**: Requires Google Play Services integration
     - **Custom TensorFlow Lite Model**: High effort

2. **Background Listening Service**
   - File: `android/app/src/main/java/.../WakeWordService.kt`
   ```kotlin
   class WakeWordService : Service() {
       private lateinit var porcupineManager: PorcupineManager
       
       override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
           startForeground(1, createNotification())
           porcupineManager.start()
           return START_STICKY
       }
       
       private val keywordCallback = { keywordIndex: Int ->
           if (keywordIndex == 0) { // "Hey Preethi"
               startAssistant()
           }
       }
   }
   ```

3. **React Native Module**
   ```typescript
   export const WakeWordModule = {
       startWakeWordDetection: async (keyword: string) => {
           // Platform native call to Porcupine/Snowboy
       },
       stopWakeWordDetection: async () => {},
   };
   ```

4. **User Settings**
   - Toggle wake word on/off
   - Choose keyword ("Hey Preethi", "Hey Assistant", etc.)
   - Storage in workspace metadata

**Outcome**: "Hey Preethi" voice trigger activates assistant

---

### Phase 7: Full Assistant Replacement (v2+ Maturity)
**Dependency**: Phases 1–6  
**Effort**: 3–5 days (integration only; features built above)

**What's Possible**:
- ✅ User manually sets Native Note Taking as default assistant in Settings
- ✅ Assistant gesture (long-press power, swipe) opens your app
- ✅ Voice commands and responses
- ✅ Floating overlay with mini-chat
- ✅ Wake word activation
- ✅ Deep integration with notes for smart queries

**What Requires Special Privileges** (❌ not feasible without MDM/OEM):
- Uninstall Gemini programmatically
- Force-set as default without user action
- Replace Android system UI
- Intercept all assistant actions
- Modify system settings

**Integration Checklist**:
- [ ] `AssistantActivity` routes correctly from all gestures
- [ ] Intent filters registered in manifest
- [ ] Deep links unified with assistant routes
- [ ] Voice input → LLM → voice output (if enabled)
- [ ] Overlay service starts/stops cleanly
- [ ] Wake word service respects user prefs
- [ ] Permissions all requested with rationale
- [ ] Error handling if Firestore unavailable (offline mode)
- [ ] Battery drain tested (services shouldn't be aggressive)
- [ ] Tested on Android 11, 12, 13, 14, 15, 16

**Outcome**: Full-featured assistant competing with Gemini in feature set

---

## Architecture: Integration with Existing Codebase

### Feature Structure
```
src/features/assistant/
├── AssistantGate.tsx           # Conditionally wraps app if enabled
├── AssistantPanel.tsx          # Main UI (chat or voice input)
├── assistantBridge.ts          # React Native ↔ native communication
├── assistantService.ts         # LLM prompt/response logic
├── assistantTypes.ts           # Intent, VoiceInput, Response types
├── useAssistantVoice.ts        # Voice input/TTS hook (if enabled)
├── assistantSettings.ts        # Persistence for wake word, prefs
└── __tests__/
    └── assistantService.test.ts
```

### App.tsx Integration
```typescript
// Existing AppContainer wraps auth, sync, workspace
// New: AssistantGate can optionally wrap or co-exist

<AppContainer>
  <AuthGate>
    <NotesSync>
      <AssistantGate>
        <App />
      </AssistantGate>
    </NotesSync>
  </AuthGate>
</AppContainer>
```

### Deep Link Routing
- Existing: `nativenotes://add-note?category=SEEK`
- New: `assistant://launch` or `nativenotes://assistant?action=chat`
- Reuse `src/features/automation/deepLinks.ts` handler

### Android Manifest Entries
```
android/app/src/main/AndroidManifest.xml
├── <activity android:name=".AssistantActivity" />        # Phase 2
├── <service android:name=".VoiceInputService" />         # Phase 3
├── <service android:name=".TextToSpeechService" />       # Phase 3
├── <service android:name=".OverlayService" />            # Phase 5
├── <service android:name=".WakeWordService" />           # Phase 6
├── <uses-permission RECORD_AUDIO />                      # Phase 3
├── <uses-permission SYSTEM_ALERT_WINDOW />               # Phase 5
└── <uses-permission FOREGROUND_SERVICE_SPECIAL_USE />    # Phase 5/6
```

### Firestore Data Model (Assistant Metadata)
```
reactnativecollection/workspaceslist
{
  "defaultWorkspaceId": "workspace-1",
  "assistantPreferences": {
    "enabled": true,
    "voiceEnabled": false,
    "wakeWordEnabled": false,
    "wakeWord": "Hey Preethi",
    "overlayEnabled": false,
    "responseMode": "text" | "voice"
  }
}
```

---

## Implementation Sequencing

### Minimal v1.5 (Text-Only Assistant)
**Timeline**: 1–2 weeks post-core release  
**Effort**: 5–7 days development
1. Phase 1: Manifest + intent filters
2. Phase 2: AssistantActivity → AI Chat
3. Phase 4: LLM integration (reuse existing)
4. Integration: Test in Settings > Default Apps

**Deliverable**: User can set app as assistant; launching opens AI Chat

---

### Moderate v1.8 (Text + Voice)
**Timeline**: 2–4 weeks post-core release  
**Effort**: 12–15 days development
1. Phases 1–4 (above)
2. Phase 3: Voice recognition + TTS
3. Settings panel for voice prefs

**Deliverable**: User can speak to assistant, hear responses

---

### Full v2.0 (Enterprise Assistant)
**Timeline**: 8–12 weeks post-core release  
**Effort**: 25–35 days development
1. Phases 1–6
2. Polish + battery/performance tuning
3. Deep note context integration
4. Extensive testing on Android 11–16

**Deliverable**: Full-featured assistant with wake words, overlays, deep note queries

---

## Known Challenges & Mitigations

| Challenge | Mitigation |
|-----------|-----------|
| **Voice on older Android** (< 8) | Check `Build.VERSION.SDK_INT`, gracefully degrade |
| **Firestore unavailable (offline)** | Fallback to cached notes, clear response |
| **Battery drain from wake word** | User opt-in only, document battery impact |
| **Permission denials** | Show rationale dialogs, allow disable assistant |
| **Expo CLI limitations** | Use `expo prebuild` or bare React Native for full native control |
| **LLM API latency** | Show "typing..." indicator, queue responses |
| **User confusion (too many assistants)** | Clarify docs, explain why they'd use yours vs. Gemini |
| **Marketplace discovery** | Feature in release notes, enable by default in beta |

---

## Test Matrix (Before Release)

| Feature | Android 11 | 12 | 13 | 14 | 15 | 16 | Notes |
|---------|-----------|----|----|----|----|----|----|
| Intent filter discovery | ✓ | ✓ | ✓ | ✓ | ? | ? | Verify in Settings > Default Apps |
| Voice input | ✓ | ✓ | ✓ | ✓ | ? | ? | Pixel phones official; others may vary |
| Overlay (Phase 5) | ✓ | ✓ | ✓ | ⚠ | ⚠ | ⚠ | Android 14+ requires metadata |
| Wake word (Phase 6) | ✓ | ✓ | ✓ | ✓ | ⚠ | ⚠ | Battery impact on 15+ untested |
| Background service | ✓ | ✓ | ✓ | ⚠ | ⚠ | ⚠ | Stricter doze/battery optimization 14+ |

---

## Decision Required

**The plan assumes you decide on scope timing now:**

- [ ] **v1 Only**: Core notes. Defer assistant to v2+. (Recommended for stability)
- [ ] **v1.5 Assistant**: Core notes ship, then text-only assistant in parallel
- [ ] **v2 Full Assistant**: Core mature, then feature-complete voice assistant

**Next Step**: Reply with your preferred timeline, and I'll refine phases into actionable sprint tasks + code scaffolding.
