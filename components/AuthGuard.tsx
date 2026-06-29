'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Menu } from 'lucide-react';
import { useTelegramAuthContext } from './TelegramAuthProvider';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { step, connected, user, isSigningOut, sessionRestorePending } = useTelegramAuthContext();

  const restoring =
    connected && !user && (step === 'connecting' || sessionRestorePending);
  const needsLogin = connected && !user && !restoring && step !== 'ready';

  useEffect(() => {
    if (step === 'connecting' || !connected || restoring) return;
    if (isSigningOut || step !== 'ready') {
      router.replace('/login');
    }
  }, [step, connected, isSigningOut, restoring, router]);

  if (step === 'connecting' || !connected || restoring) {
    return (
      <div className="flex flex-col h-screen bg-white text-sm font-sans">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="bg-green-600 p-2 rounded-sm">
              <Menu className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg text-gray-700 font-medium">Untitled spreadsheet</span>
          </div>
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-500">
          {restoring ? 'Restoring Telegram session…' : 'Loading workspace…'}
        </div>
      </div>
    );
  }

  if (isSigningOut || needsLogin || step !== 'ready') {
    return (
      <div className="flex flex-col h-screen bg-white text-sm font-sans">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="bg-green-600 p-2 rounded-sm">
              <Menu className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg text-gray-700 font-medium">Untitled spreadsheet</span>
          </div>
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-100 text-gray-500">
          Redirecting to sign in…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
