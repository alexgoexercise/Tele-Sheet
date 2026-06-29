'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramSticker } from '../lib/telegram-api-types';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

export function useFavedStickers() {
  const { step, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [stickers, setStickers] = useState<TelegramSticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (step !== 'ready') return;
    setLoading(true);
    setError(null);
    sendCommand({ method: 'getFavedStickers' });
  }, [step, sendCommand]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeUpdates((update) => {
      if (update['@type'] === 'updateFavedStickers') {
        setStickers(update.stickers);
        setLoading(false);
        setError(null);
      }
      if (update['@type'] === 'error') {
        setLoading(false);
        setError(update.message);
      }
    });
  }, [subscribeUpdates]);

  return { stickers, loading, error, refresh };
}
