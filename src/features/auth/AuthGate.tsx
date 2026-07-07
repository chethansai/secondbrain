import { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { useTheme } from '../../shared/design/ThemeProvider';
import { useAuth } from './authContext';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { firebaseAuth } from '../sync/firebase';
import { createUserProfile, updateUserLastLogin, createUsernameMapping, isUsernameAvailable, getEmailByUsername } from './userRepository';
import { TextInputField } from '../../shared/ui/TextInputField';
import { Button } from '../../shared/ui/Button';
import { rounded, shadows, spacing, typography } from '../../shared/design/tokens';

type Props = {
  children: (session: { authTimeoutHours: number; onAuthTimeoutChange: (hours: number) => Promise<void>; onLogout: () => Promise<void> }) => React.ReactNode;
};

type AuthView = 'signin' | 'signup' | 'reset';

export function AuthGate({ children }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { user, loading: firebaseLoading, logout } = useAuth();

  // Auth UI state
  const [view, setView] = useState<AuthView>('signin');
  const [username, setUsername] = useState('');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [actionLoading, setActionLoading] = useState(false);

  const switchView = (nextView: AuthView) => {
    setView(nextView);
    setUsername('');
    setUsernameOrEmail('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setUsernameError(undefined);
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);
    setGeneralError(undefined);
  };

  const handleSignIn = async () => {
    setEmailError(undefined);
    setPasswordError(undefined);
    setGeneralError(undefined);

    let valid = true;
    if (!usernameOrEmail.trim()) {
      setEmailError('Username or email is required.');
      valid = false;
    }
    if (!password) {
      setPasswordError('Password is required.');
      valid = false;
    }
    if (!valid) return;

    setActionLoading(true);
    try {
      let targetEmail = usernameOrEmail.trim();
      if (!targetEmail.includes('@')) {
        const resolvedEmail = await getEmailByUsername(targetEmail);
        if (!resolvedEmail) {
          setEmailError('No account found with this username.');
          setActionLoading(false);
          return;
        }
        targetEmail = resolvedEmail;
      }

      const userCredential = await signInWithEmailAndPassword(firebaseAuth, targetEmail, password);
      if (userCredential.user) {
        await updateUserLastLogin(userCredential.user.uid);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-email' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setEmailError('Invalid username/email or incorrect password.');
      } else if (err.code === 'auth/wrong-password') {
        setPasswordError('Incorrect password.');
      } else {
        setGeneralError(err.message || 'Failed to sign in.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignUp = async () => {
    setUsernameError(undefined);
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);
    setGeneralError(undefined);

    let valid = true;
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (!cleanUsername) {
      setUsernameError('Username is required.');
      valid = false;
    } else if (cleanUsername.length < 3) {
      setUsernameError('Username must be at least 3 characters.');
      valid = false;
    } else if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setUsernameError('Username can only contain letters, numbers, and underscores.');
      valid = false;
    }

    if (!cleanEmail) {
      setEmailError('Email is required.');
      valid = false;
    } else if (!cleanEmail.includes('@')) {
      setEmailError('Invalid email format.');
      valid = false;
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      valid = false;
    }
    if (!valid) return;

    setActionLoading(true);
    try {
      const available = await isUsernameAvailable(cleanUsername);
      if (!available) {
        setUsernameError('Username is already taken.');
        setActionLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
      if (userCredential.user) {
        await createUsernameMapping(cleanUsername, cleanEmail, userCredential.user.uid);
        await createUserProfile(userCredential.user.uid, cleanEmail, cleanUsername);
      }
      Alert.alert('Success', 'Account created successfully.');
      switchView('signin');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setEmailError('Email is already registered.');
      } else if (err.code === 'auth/invalid-email') {
        setEmailError('Invalid email format.');
      } else {
        setGeneralError(err.message || 'Failed to create account.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setEmailError(undefined);
    setGeneralError(undefined);

    let targetEmail = email.trim();
    if (!targetEmail) {
      setEmailError('Email or username is required.');
      return;
    }

    setActionLoading(true);
    try {
      if (!targetEmail.includes('@')) {
        const resolvedEmail = await getEmailByUsername(targetEmail);
        if (!resolvedEmail) {
          setEmailError('No account found with this username.');
          setActionLoading(false);
          return;
        }
        targetEmail = resolvedEmail;
      }

      await sendPasswordResetEmail(firebaseAuth, targetEmail);
      Alert.alert('Reset Email Sent', 'Check your inbox for password reset instructions.');
      switchView('signin');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setEmailError('No account found with this email.');
      } else if (err.code === 'auth/invalid-email') {
        setEmailError('Invalid email format.');
      } else {
        setGeneralError(err.message || 'Failed to send reset email.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (firebaseLoading) return <AuthLoadingScreen />;

  if (!user) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={styles.dotPink} />
        <View style={styles.dotYellow} />
        <View style={styles.dotGreen} />
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Native Note Taking</Text>
            </View>

            {view === 'signin' && (
              <>
                <Text style={styles.title}>Welcome back.</Text>
                <Text style={styles.subtitle}>Sign in to sync your notes across devices.</Text>
                {generalError && <Text style={styles.errorText}>{generalError}</Text>}
                <TextInputField
                  label="Username or Email"
                  value={usernameOrEmail}
                  onChangeText={setUsernameOrEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={emailError}
                  accessibilityLabel="Username or Email"
                />
                <TextInputField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={passwordError}
                  accessibilityLabel="Password"
                  onSubmitEditing={handleSignIn}
                />
                <Button label={actionLoading ? "Signing In..." : "Sign In"} onPress={handleSignIn} disabled={actionLoading} />
                <View style={styles.footerRow}>
                  <Button label="Create Account" variant="ghost" onPress={() => switchView('signup')} />
                  <Button label="Forgot Password?" variant="ghost" onPress={() => switchView('reset')} />
                </View>
              </>
            )}

            {view === 'signup' && (
              <>
                <Text style={styles.title}>Join the workspace.</Text>
                <Text style={styles.subtitle}>Create an account to start note taking.</Text>
                {generalError && <Text style={styles.errorText}>{generalError}</Text>}
                <TextInputField
                  label="Username"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={usernameError}
                  accessibilityLabel="Username"
                />
                <TextInputField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={emailError}
                  accessibilityLabel="Email"
                />
                <TextInputField
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={passwordError}
                  accessibilityLabel="Password"
                />
                <TextInputField
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={confirmError}
                  accessibilityLabel="Confirm Password"
                  onSubmitEditing={handleSignUp}
                />
                <Button label={actionLoading ? "Creating Account..." : "Create Account"} onPress={handleSignUp} disabled={actionLoading} />
                <Button label="Back to Sign In" variant="ghost" onPress={() => switchView('signin')} />
              </>
            )}

            {view === 'reset' && (
              <>
                <Text style={styles.title}>Reset password.</Text>
                <Text style={styles.subtitle}>Enter your email or username to receive a password reset link.</Text>
                {generalError && <Text style={styles.errorText}>{generalError}</Text>}
                <TextInputField
                  label="Email or Username"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={emailError}
                  accessibilityLabel="Email or Username"
                  onSubmitEditing={handlePasswordReset}
                />
                <Button label={actionLoading ? "Sending Reset Link..." : "Send Reset Link"} onPress={handlePasswordReset} disabled={actionLoading} />
                <Button label="Back to Sign In" variant="ghost" onPress={() => switchView('signin')} />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return <>{children({ authTimeoutHours: 0, onAuthTimeoutChange: async () => {}, onLogout: logout })}</>;
}

function AuthLoadingScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.brandNavy, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.onPrimary} />
    </View>
  );
}

function createStyles(colors: any) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.brandNavy, justifyContent: 'center' },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
    card: { backgroundColor: colors.canvas, borderRadius: rounded.lg, padding: spacing.xxl, gap: spacing.lg, ...shadows.mockup },
    badge: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: rounded.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
    badgeText: { ...typography.captionBold, color: colors.onPrimary },
    title: { ...typography.heading1, color: colors.ink, letterSpacing: 0 },
    subtitle: { ...typography.subtitle, color: colors.slate },
    dotPink: { position: 'absolute', width: 28, height: 28, borderRadius: rounded.sm, backgroundColor: colors.brandPink, top: 96, left: 32, transform: [{ rotate: '-12deg' }] },
    dotYellow: { position: 'absolute', width: 42, height: 42, borderRadius: rounded.md, backgroundColor: colors.brandYellow, right: 42, top: 158, transform: [{ rotate: '9deg' }] },
    dotGreen: { position: 'absolute', width: 20, height: 20, borderRadius: rounded.xs, backgroundColor: colors.brandGreen, right: 78, bottom: 126, transform: [{ rotate: '-6deg' }] },
    footerRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
    errorText: { ...typography.caption, color: colors.error, marginVertical: spacing.xxs },
  });
}
