'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'telesheet.showStickerEmoji';

type SheetPreferencesContextValue = {
  showStickerEmoji: boolean;
  setShowStickerEmoji: (value: boolean) => void;
  toggleShowStickerEmoji: () => void;
};

const SheetPreferencesContext = createContext<SheetPreferencesContextValue | null>(null);

export function SheetPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [showStickerEmoji, setShowStickerEmojiState] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored != null) setShowStickerEmojiState(stored === '1');
    } catch {
      // ignore storage errors
    }
  }, []);

  const setShowStickerEmoji = useCallback((value: boolean) => {
    setShowStickerEmojiState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleShowStickerEmoji = useCallback(() => {
    setShowStickerEmojiState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  return (
    <SheetPreferencesContext.Provider
      value={{ showStickerEmoji, setShowStickerEmoji, toggleShowStickerEmoji }}
    >
      {children}
    </SheetPreferencesContext.Provider>
  );
}

export function useSheetPreferences() {
  const ctx = useContext(SheetPreferencesContext);
  if (!ctx) {
    throw new Error('useSheetPreferences must be used within SheetPreferencesProvider');
  }
  return ctx;
}
