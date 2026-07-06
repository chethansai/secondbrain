import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../sync/firebase';

export async function createUserProfile(uid: string, email: string): Promise<void> {
  const userRef = doc(firestore, 'users', uid);
  const now = new Date().toISOString();
  
  // Extract default username from email
  const username = email.split('@')[0] || 'User';

  await setDoc(userRef, {
    username,
    email,
    photoUrl: null,
    createdAt: now,
    lastLogin: now,
    syncEnabled: true,
    premium: false,
  }, { merge: true });
}

export async function updateUserLastLogin(uid: string): Promise<void> {
  const userRef = doc(firestore, 'users', uid);
  const now = new Date().toISOString();
  await setDoc(userRef, {
    lastLogin: now,
  }, { merge: true });
}
