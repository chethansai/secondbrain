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
  apiKey: "AIzaSyD8t3f8EvherkuyAmLB6iFN5wuiOmALCzU",
  authDomain: "notes-55c97.firebaseapp.com",
  projectId: "notes-55c97",
  storageBucket: "notes-55c97.firebasestorage.app",
  messagingSenderId: "743180759053",
  appId: "1:743180759053:web:8181c9a6d49abd3315a544",
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);