'use client';

import { TelegramAuthProvider } from '../components/TelegramAuthProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <TelegramAuthProvider>{children}</TelegramAuthProvider>;
}
