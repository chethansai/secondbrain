import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../sync/firebase';

export async function createUserProfile(uid: string, email: string, username: string): Promise<void> {
  const userRef = doc(firestore, 'users', uid);
  const now = new Date().toISOString();

  await setDoc(userRef, {
    username: username.trim(),
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

export async function createUsernameMapping(username: string, email: string, uid: string): Promise<void> {
  const usernameKey = username.trim().toLowerCase();
  const ref = doc(firestore, 'usernames', usernameKey);
  await setDoc(ref, {
    username: username.trim(),
    email: email.trim(),
    uid,
  });
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const usernameKey = username.trim().toLowerCase();
  const ref = doc(firestore, 'usernames', usernameKey);
  const snapshot = await getDoc(ref);
  return !snapshot.exists();
}

export async function getEmailByUsername(username: string): Promise<string | null> {
  const usernameKey = username.trim().toLowerCase();
  const ref = doc(firestore, 'usernames', usernameKey);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    const data = snapshot.data();
    return data.email || null;
  }
  return null;
}

