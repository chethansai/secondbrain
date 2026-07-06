import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { firebaseAuth } from '../sync/firebase';
import { clearAllLocalRepositories } from '../sync/localNotesRepository';

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
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const uid = user ? user.uid : null;

  const logout = async () => {
    try {
      await signOut(firebaseAuth);
      await clearAllLocalRepositories();
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
