# Teleprompter Status Bar Implementation Plan

## Analysis Summary (from codebase inspection)
- **Current Teleprompter**: `src/features/workspace/NotesTeleprompterBar.tsx` - RN-only Animated marquee scrolling notes from workspace. Runs only while app/activity is foreground. Uses `formatTeleprompterNotes` to join non-history notes.
- **Existing Overlay Architecture** (reused heavily):
  - `android/app/src/main/java/com/notes/nativenotetaking/overlay/OverlayService.kt`: Foreground Service (START_STICKY), WindowManager + TYPE_APPLICATION_OVERLAY, notification via `OverlayNotification.kt`, SharedPreferences via `OverlaySettings.kt`, drag/swipe handler, permission checks.
  - `OverlayModule.kt`: React Native bridge for start/stop/update/read settings, permission requests.
  - `OverlayPackage.kt`, registered in `MainApplication.kt`.
  - Manifest has FOREGROUND_SERVICE, SYSTEM_ALERT_WINDOW, POST_NOTIFICATIONS, service declaration.
  - `OverlayNotesStore.kt` for Firestore REST fallback (not for teleprompter).
- **Other Relevant**:
  - `SettingsPanel.tsx` and `floatingOverlay.ts` handle floating icon UI/settings.
  - No existing MMKV (use SharedPreferences like OverlaySettings).
  - No BootReceiver yet.
  - App.tsx renders NotesTeleprompterBar always when notes present.
  - Permissions mostly present; add RECEIVE_BOOT_COMPLETED if not.
  - No current duration/countdown for teleprompter.

**Reuse Strategy**: Extend the overlay package with teleprompter-specific classes (TeleprompterSettings, TeleprompterService, update Notification, add to Module). Keep separate service to avoid interfering with floating button. Use broadcast intents for communication between RN and service. Persist state in dedicated SharedPreferences. Service independent of RN lifecycle.

## Step-by-Step Implementation Plan
1. **Update Manifest**:
   - Add RECEIVE_BOOT_COMPLETED permission.
   - Add BootReceiver.
   - Add TeleprompterService declaration with foregroundServiceType.
   - Add intent-filter for BOOT_COMPLETED on receiver.

2. **Create TeleprompterSettings.kt** (reuse OverlaySettings pattern):
   - Persist: isRunning, currentText, speed, textSize, durationMs, startTimeMs, position (for resume).
   - Methods: read, save, defaults (duration options mapped to ms, unlimited = -1).

3. **Create TeleprompterView.kt**:
   - Custom View with TextView for marquee scrolling (use horizontal scroll or Animator).
   - Safe top positioning using WindowInsets, DisplayCutout, status bar height.
   - Live countdown TextView.
   - Smooth marquee without clipping, auto-width.
   - Update every second for countdown.

4. **Create TeleprompterService.kt** (new dedicated foreground service):
   - START_STICKY.
   - Notification Channel "teleprompter" with actions (Pause, Resume, Stop) using PendingIntent.
   - Notification content: "Teleprompter Active", current text snippet, remaining time.
   - WindowManager add/remove TeleprompterView.
   - Handler for countdown, stop on duration expire.
   - Load state from prefs on start, save on changes/pause/stop.
   - Handle screen on/off, lock with WakeLock if needed.
   - Only one instance (check if running).
   - On boot, check if was running and restart.

5. **Create BootReceiver.kt**:
   - On BOOT_COMPLETED, if teleprompter was running per prefs, start the service.

6. **Update OverlayNotification.kt**:
   - Add createTeleprompterNotification with dynamic text, remaining, actions.

7. **Update OverlayModule.kt** (or add new TeleprompterModule):
   - Add methods: startTeleprompter(text: String, duration: String), stopTeleprompter(), pause, resume, updateSettings (speed, size, duration), readTeleprompterState().
   - Bridge to service intents or direct start.

8. **Update RN Side**:
   - Enhance `floatingOverlay.ts` or create `teleprompter.ts` with NativeModule bindings.
   - Update `SettingsPanel.tsx`: Add dedicated "Teleprompter Settings" section with Status, Duration picker, Remaining, Sliders for speed/size, Start/Stop buttons. Live sync with service state using useEffect/polling or events.
   - Update `NotesTeleprompterBar.tsx` to optionally sync with native or hide when native is running.
   - Add duration options as per spec (1s to 24h, Unlimited).
   - Persist in AsyncStorage synced with native prefs.

9. **Update MainApplication.kt** if new package needed.
10. **Add permissions handling in RN and Kotlin (request POST_NOTIFICATIONS, ignore battery if needed using ignoreBatteryOptimizations).
11. **Performance & Lifecycle**:
    - Use single service instance check.
    - Proper removeView on destroy.
    - No leaks (Handler removeCallbacks).
    - Battery: Use Foreground, WakeLock sparingly, respect Doze.
12. **UI/Positioning**:
    - Top safe area, respect insets, cutouts, notch.
    - Modern UI matching design.md (navy, etc).
    - Countdown in both overlay and notification.
13. **Test Cases**: App close, background, screen off, reboot, duration expire, notification actions, permission flow.

**Order of Implementation** (to minimize conflicts):
- Plan file created.
- Add permissions and receiver to Manifest.
- Create TeleprompterSettings.kt.
- Update Notification.
- Create TeleprompterService.kt (core).
- Create supporting files (View, Receiver).
- Update Module and Package.
- Update RN files (ts, SettingsPanel, App.tsx if needed).
- Update build.gradle if new deps (none).
- Test with run_in_terminal for build.

After all changes, verify with `npm run typecheck`, Android build, and manual tests.

This plan reuses Overlay architecture (service, WM, prefs, notification, module) to avoid breaking existing floating button, note widgets, voice, AI, sync, categories, editor.

Next: Implement using edit/create tools.
