import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD8t3f8EvherkuyAmLB6iFN5wuiOmALCzU',
  authDomain: 'notes-55c97.firebaseapp.com',
  projectId: 'notes-55c97',
  storageBucket: 'notes-55c97.firebasestorage.app',
  messagingSenderId: '743180759053',
  appId: '1:743180759053:web:8181c9a6d49abd3315a544',
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);