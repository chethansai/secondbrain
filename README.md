# Native Note Taking

Expo React Native notes app backed by Firebase Firestore.

## Fork Firebase Setup

Forks must use their own Firebase project. Do not edit committed source files with real Firebase values.

1. Create a Firebase project and enable Firestore.
2. Add a Firebase Web app in the Firebase console.
3. Copy `.env.example` to `.env` and fill the `EXPO_PUBLIC_FIREBASE_*` values from the Web app config.
4. Copy `.firebaserc.example` to `.firebaserc` or run `firebase use --add`, then select your Firebase project.
5. Run `npm install`.
6. Run `npm run deploy:rules` after confirming Firebase CLI is using your project.
7. Run `npm start`, `npm run android`, `npm run ios`, or `npm run web`.

The app stores notes in `reactnativecollection/main` and workspace metadata in `reactnativecollection/workspaceslist`.

## Android Overlay And Widgets

The Android floating overlay, quick-entry note widget, and workspace widget use native Firestore REST calls through `OverlayNotesStore`, not the Expo Firebase SDK config in `src/features/sync/firebase.ts`.

For Android builds, provide these values locally as Gradle properties or environment variables:

```properties
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_API_KEY=your-firebase-api-key
```

Common local options:

- Put them in `android/local.properties`.
- Put them in your user Gradle properties file.
- Pass them with `-PFIREBASE_PROJECT_ID=... -PFIREBASE_API_KEY=...`.
- Configure them as CI or EAS environment variables.

Do not commit `.env`, `.firebaserc`, or real local property values. Firebase client API keys are public identifiers, but each fork still needs its own project so data does not go to the original Firestore.

## Commands

- `npm install` - install dependencies.
- `npm start` - start Expo/Metro on LAN.
- `npm run android` - start Expo and open Android.
- `npm run ios` - start Expo and open iOS.
- `npm run web` - start Expo web.
- `npm run typecheck` - run TypeScript validation.
- `npm run deploy:rules` - deploy Firestore rules to the Firebase CLI selected project.