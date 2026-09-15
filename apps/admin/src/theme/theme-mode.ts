import { createContext, useContext } from 'react';
import type { ThemeMode } from '@/config/theme';

/**
 * The reader's theme choice. Light unless they have chosen dark: the default
 * does not follow the operating system, because the admin is used on shared
 * office screens where a surprise dark theme reads as a fault.
 *
 * Kept in this browser only (one key, one of two words). Storage can be missing
 * or refuse access — a private window, a locked-down profile — and then the
 * admin is simply light and forgets the choice at the end of the visit.
 */
export const THEME_STORAGE_KEY = 'ms.admin.theme';

export function readStoredThemeMode(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function storeThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // The choice holds for this visit; nothing else depends on it being saved.
  }
}

export interface ThemeModeValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const ThemeModeContext = createContext<ThemeModeValue>({ mode: 'light', setMode: () => undefined });

export function useThemeMode(): ThemeModeValue {
  return useContext(ThemeModeContext);
}
