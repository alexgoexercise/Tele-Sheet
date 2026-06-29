'use client';

import { TelegramAuthProvider } from '../components/TelegramAuthProvider';
import { SheetPreferencesProvider } from '../lib/sheet-preferences';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TelegramAuthProvider>
      <SheetPreferencesProvider>{children}</SheetPreferencesProvider>
    </TelegramAuthProvider>
  );
}
