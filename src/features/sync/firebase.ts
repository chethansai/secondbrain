import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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