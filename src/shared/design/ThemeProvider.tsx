import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { ColorSchemeName, useColorScheme } from 'react-native';
import { darkColors, lightColors } from './tokens';

type ThemeMode = 'light' | 'dark';
type ThemeColors = typeof lightColors;

type ThemeContextValue = {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMode(colorScheme: ColorSchemeName): ThemeMode {
  return colorScheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const deviceMode = resolveMode(useColorScheme());
  const [overrideMode, setOverrideMode] = useState<ThemeMode | null>(null);
  const mode = overrideMode ?? deviceMode;

  const value = useMemo<ThemeContextValue>(() => ({
    colors: mode === 'dark' ? darkColors : lightColors,
    isDark: mode === 'dark',
    mode,
    toggleTheme: () => setOverrideMode((current) => (current ?? deviceMode) === 'dark' ? 'light' : 'dark'),
  }), [deviceMode, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
