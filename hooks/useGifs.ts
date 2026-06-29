'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramGif } from '../lib/telegram-api-types';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

export function useGifs() {
  const { step, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [savedGifs, setSavedGifs] = useState<TelegramGif[]>([]);
  const [searchResults, setSearchResults] = useState<TelegramGif[]>([]);
  const [nextOffset, setNextOffset] = useState<string | undefined>();
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSaved = useCallback(() => {
    if (step !== 'ready') return;
    setLoadingSaved(true);
    setError(null);
    sendCommand({ method: 'getSavedGifs' });
  }, [step, sendCommand]);

  const search = useCallback(
    (query: string, offset?: string) => {
      if (step !== 'ready') return;
      setSearching(true);
      setError(null);
      sendCommand({ method: 'searchGifs', search: query, offset });
    },
    [step, sendCommand],
  );

  useEffect(() => {
    return subscribeUpdates((update) => {
      if (update['@type'] === 'updateSavedGifs') {
        setSavedGifs(update.gifs);
        setLoadingSaved(false);
        setError(null);
      }
      if (update['@type'] === 'updateGifSearch') {
        setSearchResults((prev) =>
          update.next_offset ? [...prev, ...update.gifs] : update.gifs,
        );
        setNextOffset(update.next_offset);
        setSearching(false);
        setError(null);
      }
      if (update['@type'] === 'error') {
        setLoadingSaved(false);
        setSearching(false);
        setError(update.message);
      }
    });
  }, [subscribeUpdates]);

  return {
    savedGifs,
    searchResults,
    nextOffset,
    loadingSaved,
    searching,
    error,
    refreshSaved,
    search,
    clearSearch: () => {
      setSearchResults([]);
      setNextOffset(undefined);
    },
  };
}
