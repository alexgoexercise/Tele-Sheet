'use client';

import { createContext, useContext } from 'react';
import { useTelegramAuth } from '../hooks/useTelegramAuth';

type TelegramAuthContextValue = ReturnType<typeof useTelegramAuth>;

const TelegramAuthContext = createContext<TelegramAuthContextValue | null>(null);

export function TelegramAuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useTelegramAuth();
  return <TelegramAuthContext.Provider value={auth}>{children}</TelegramAuthContext.Provider>;
}

export function useTelegramAuthContext() {
  const ctx = useContext(TelegramAuthContext);
  if (!ctx) {
    throw new Error('useTelegramAuthContext must be used within TelegramAuthProvider');
  }
  return ctx;
}
