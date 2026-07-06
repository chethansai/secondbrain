import React, { createContext, useContext, useEffect, useState } from 'react';
import { onIdTokenChanged, signOut, User } from 'firebase/auth';
import { NativeModules, Platform } from 'react-native';
import { firebaseAuth } from '../sync/firebase';
import { clearAllLocalRepositories } from '../sync/localNotesRepository';

const { OverlayModule } = NativeModules;

type AuthContextType = {
  user: User | null;
  uid: string | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  uid: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (Platform.OS === 'android' && OverlayModule && OverlayModule.syncAuthSession) {
        if (currentUser) {
          try {
            const token = await currentUser.getIdToken();
            await OverlayModule.syncAuthSession(currentUser.uid, token);
            console.log('[AUTH CONTEXT] Synced active session to Android Native');
          } catch (error) {
            console.error('[AUTH CONTEXT] Failed to sync auth token to Android Native:', error);
          }
        } else {
          try {
            await OverlayModule.syncAuthSession(null, null);
            console.log('[AUTH CONTEXT] Cleared session on Android Native');
          } catch (error) {
            console.error('[AUTH CONTEXT] Failed to clear session on Android Native:', error);
          }
        }
      }
    });
    return unsubscribe;
  }, []);

  const uid = user ? user.uid : null;

  const logout = async () => {
    try {
      const currentUid = user?.uid ?? null;
      await signOut(firebaseAuth);
      // Wipe only the signing-out user's scoped cache keys
      await clearAllLocalRepositories(currentUid);
    } catch (error) {
      console.error('[AUTH LOGOUT] Error signing out:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, uid, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
