'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramDialog, WsUpdate } from '../lib/telegram-api-types';
import { filterMainInboxDialogs, sortDialogsByDate } from '../lib/chat';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

export function useDialogs() {
  const { step, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    sendCommand({ method: 'getDialogs', limit: 50, archived: false });
  }, [sendCommand]);

  useEffect(() => {
    if (step !== 'ready') return;
    refresh();
  }, [step, refresh]);

  useEffect(() => {
    return subscribeUpdates((update: WsUpdate) => {
      if (update['@type'] === 'updateDialogs') {
        setDialogs(sortDialogsByDate(filterMainInboxDialogs(update.dialogs)));
        setLoading(false);
        setError(null);
      }
      if (update['@type'] === 'error') {
        setError(update.message);
        setLoading(false);
      }
    });
  }, [subscribeUpdates]);

  return { dialogs, loading, error, refresh };
}
