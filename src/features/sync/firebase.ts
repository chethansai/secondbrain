import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const requiredFirebaseEnv = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const getFirebaseEnv = (name: (typeof requiredFirebaseEnv)[number]) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing Firebase environment variable: ${name}. Copy .env.example to .env and fill it with your Firebase project config.`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: getFirebaseEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: getFirebaseEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: getFirebaseEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: getFirebaseEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getFirebaseEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getFirebaseEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);