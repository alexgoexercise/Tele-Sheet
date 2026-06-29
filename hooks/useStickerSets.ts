'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramSticker, TelegramStickerSet } from '../lib/telegram-api-types';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

export function useStickerSets() {
  const { step, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [sets, setSets] = useState<TelegramStickerSet[]>([]);
  const [setStickers, setSetStickers] = useState<TelegramSticker[]>([]);
  const [activeSet, setActiveSet] = useState<TelegramStickerSet | null>(null);
  const [searchResults, setSearchResults] = useState<TelegramStickerSet[]>([]);
  const [loadingSets, setLoadingSets] = useState(false);
  const [loadingSetStickers, setLoadingSetStickers] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSets = useCallback(() => {
    if (step !== 'ready') return;
    setLoadingSets(true);
    setError(null);
    sendCommand({ method: 'getAllStickerSets' });
  }, [step, sendCommand]);

  const loadSetStickers = useCallback(
    (shortName: string) => {
      if (step !== 'ready') return;
      setLoadingSetStickers(true);
      setError(null);
      sendCommand({ method: 'getStickerSet', short_name: shortName });
    },
    [step, sendCommand],
  );

  const searchSets = useCallback(
    (query: string) => {
      if (step !== 'ready') return;
      setSearching(true);
      setError(null);
      sendCommand({ method: 'searchStickerSets', search: query });
    },
    [step, sendCommand],
  );

  useEffect(() => {
    return subscribeUpdates((update) => {
      if (update['@type'] === 'updateStickerSets') {
        setSets(update.sets);
        setLoadingSets(false);
        setSearching(false);
        setError(null);
      }
      if (update['@type'] === 'updateStickerSetSearch') {
        setSearchResults(update.sets);
        setSearching(false);
        setError(null);
      }
      if (update['@type'] === 'updateStickerSetStickers') {
        setSetStickers(update.stickers);
        setActiveSet(update.set);
        setLoadingSetStickers(false);
        setError(null);
      }
      if (update['@type'] === 'error') {
        setLoadingSets(false);
        setLoadingSetStickers(false);
        setSearching(false);
        setError(update.message);
      }
    });
  }, [subscribeUpdates]);

  return {
    sets,
    setStickers,
    activeSet,
    searchResults,
    loadingSets,
    loadingSetStickers,
    searching,
    error,
    refreshSets,
    loadSetStickers,
    searchSets,
  };
}
