import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore - getReactNativePersistence is runtime-available in React Native environment but not declared in TypeScript web declarations.
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const requiredFirebaseEnv = [
  ['EXPO_PUBLIC_FIREBASE_API_KEY', process.env.EXPO_PUBLIC_FIREBASE_API_KEY],
  ['EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN],
  ['EXPO_PUBLIC_FIREBASE_PROJECT_ID', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID],
  ['EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET],
  ['EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID],
  ['EXPO_PUBLIC_FIREBASE_APP_ID', process.env.EXPO_PUBLIC_FIREBASE_APP_ID],
] as const satisfies readonly [string, string | undefined][];

const getFirebaseEnv = (name: string, rawValue: string | undefined) => {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error(`Missing Firebase environment variable: ${name}. Copy .env.example to .env and fill it with your Firebase project config.`);
  }
  return value;
};

const [
  firebaseApiKey,
  firebaseAuthDomain,
  firebaseProjectId,
  firebaseStorageBucket,
  firebaseMessagingSenderId,
  firebaseAppId,
] = requiredFirebaseEnv.map(([name, value]) => getFirebaseEnv(name, value));

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);

// Safe initialization of Firebase Auth to prevent "already-initialized" errors
let authInstance;
try {
  if (getApps().length > 0) {
    authInstance = getAuth(getApps()[0]);
  } else {
    authInstance = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
} catch (e) {
  authInstance = getAuth(firebaseApp);
}

export const firebaseAuth = authInstance;