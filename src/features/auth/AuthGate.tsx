import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { clearSavedUnlock, defaultAuthTimeoutHours, markUnlocked, readAuthTimeoutHours, readShouldStartUnlocked, writeAuthTimeoutHours } from './authSession';
import { LockScreen } from './LockScreen';

type Props = {
  children: (session: { authTimeoutHours: number; onAuthTimeoutChange: (hours: number) => Promise<void>; onLogout: () => Promise<void> }) => React.ReactNode;
};

export function AuthGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authTimeoutHours, setAuthTimeoutHours] = useState(defaultAuthTimeoutHours);

  useEffect(() => {
    let mounted = true;
    async function loadAuthSession() {
      try {
        const [timeoutHours, shouldStartUnlocked] = await Promise.all([
          readAuthTimeoutHours(),
          readShouldStartUnlocked(),
        ]);
        if (!mounted) return;
        setAuthTimeoutHours(timeoutHours);
        setUnlocked(shouldStartUnlocked);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    loadAuthSession();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const shouldStayUnlocked = await readShouldStartUnlocked();
      setUnlocked(shouldStayUnlocked);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(async () => {
      const shouldStayUnlocked = await readShouldStartUnlocked();
      setUnlocked(shouldStayUnlocked);
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [unlocked]);

  async function unlock() {
    await markUnlocked();
    setUnlocked(true);
  }

  async function updateAuthTimeout(hours: number) {
    const nextHours = await writeAuthTimeoutHours(hours);
    setAuthTimeoutHours(nextHours);
    const shouldStayUnlocked = await readShouldStartUnlocked();
    setUnlocked(shouldStayUnlocked);
  }

  async function logout() {
    await clearSavedUnlock();
    setUnlocked(false);
  }

  if (authLoading) return <AuthLoadingScreen />;
  if (!unlocked) return <LockScreen onUnlock={unlock} />;
  return <>{children({ authTimeoutHours, onAuthTimeoutChange: updateAuthTimeout, onLogout: logout })}</>;
}

function AuthLoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.brandNavy }]}>
      <ActivityIndicator color={colors.onPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
