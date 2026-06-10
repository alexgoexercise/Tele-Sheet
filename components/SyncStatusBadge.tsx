'use client';

import { CloudCheck, CloudOff, Loader2 } from 'lucide-react';
import { useTelegramAuthContext } from './TelegramAuthProvider';

export default function SyncStatusBadge() {
  const { step, connected, user } = useTelegramAuthContext();

  const isSynced = step === 'ready' && connected;
  const isSaving = !connected || step === 'connecting';

  const label = isSynced
    ? 'All changes saved in Drive'
    : isSaving
      ? 'Saving…'
      : 'Working offline';

  const Icon = isSynced ? CloudCheck : isSaving ? Loader2 : CloudOff;
  const iconClass = isSynced
    ? 'text-gray-500'
    : isSaving
      ? 'text-gray-400 animate-spin'
      : 'text-amber-600';

  const displayInitial = user
    ? (user.first_name?.charAt(0) || user.username?.charAt(0) || 'U').toUpperCase()
    : null;

  return (
    <div className="flex items-center gap-3 mt-0.5">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 select-none">
        <Icon className={`w-3.5 h-3.5 ${iconClass}`} strokeWidth={2} />
        <span className={isSynced ? 'text-gray-500' : isSaving ? 'text-gray-400' : 'text-amber-700'}>
          {label}
        </span>
        {isSynced && displayInitial && (
          <span className="text-gray-400 hidden sm:inline" title="Workspace linked">
            · synced as {displayInitial}
          </span>
        )}
      </div>
    </div>
  );
}
