import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AccentColor {
  name: string;
  value: string; // HSL format: "38 92% 50%"
  foreground: string; // Foreground color for contrast
}

export const ACCENT_COLORS: AccentColor[] = [
  { name: 'Gold', value: '38 92% 50%', foreground: '222 47% 6%' },
  { name: 'Blue', value: '217 91% 60%', foreground: '210 40% 98%' },
  { name: 'Purple', value: '270 76% 60%', foreground: '210 40% 98%' },
  { name: 'Green', value: '142 76% 45%', foreground: '210 40% 98%' },
  { name: 'Red', value: '0 84% 60%', foreground: '210 40% 98%' },
  { name: 'Teal', value: '175 80% 40%', foreground: '210 40% 98%' },
  { name: 'Pink', value: '330 80% 60%', foreground: '210 40% 98%' },
  { name: 'Orange', value: '25 95% 55%', foreground: '222 47% 6%' },
];

interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  accentColor: AccentColor;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

const THEME_STORAGE_KEY = 'theme-mode';
const ACCENT_STORAGE_KEY = 'accent-color';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function getStoredThemeMode(): ThemeMode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  }
  return 'dark'; // Default to dark for this cinema-themed app
}

function getStoredAccentColor(): AccentColor {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const found = ACCENT_COLORS.find(c => c.name === parsed.name);
        if (found) return found;
      } catch {
        // Invalid JSON, use default
      }
    }
  }
  return ACCENT_COLORS[0]; // Default to Gold
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredThemeMode);
  const [accentColor, setAccentColorState] = useState<AccentColor>(getStoredAccentColor);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Calculate the resolved theme (actual light/dark value)
  const resolvedTheme: 'light' | 'dark' = themeMode === 'system' ? systemTheme : themeMode;

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove('light', 'dark');

    // Add current theme class
    root.classList.add(resolvedTheme);

    // Store preference
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode, resolvedTheme]);

  // Apply accent color CSS variables
  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty('--primary', accentColor.value);
    root.style.setProperty('--primary-foreground', accentColor.foreground);
    root.style.setProperty('--accent', accentColor.value);
    root.style.setProperty('--accent-foreground', accentColor.foreground);
    root.style.setProperty('--ring', accentColor.value);
    root.style.setProperty('--warning', accentColor.value);

    // Store preference
    localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify(accentColor));
  }, [accentColor]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  const setAccentColor = useCallback((color: AccentColor) => {
    setAccentColorState(color);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        accentColor,
        setThemeMode,
        setAccentColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
