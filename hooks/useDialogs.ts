'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramDialog, WsUpdate } from '../lib/telegram-api-types';
import {
  chatIdsMatch,
  filterMainInboxDialogs,
  patchDialogsOnMessage,
  sortDialogsByDate,
} from '../lib/chat';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

export function useDialogs() {
  const { step, isSigningOut, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDialogs = useCallback(
    (showLoading = false) => {
      if (isSigningOut || step !== 'ready') return;
      if (showLoading) {
        setLoading(true);
        setError(null);
      }
      sendCommand({ method: 'getDialogs', limit: 50, archived: false });
    },
    [isSigningOut, step, sendCommand],
  );

  const refresh = useCallback(() => fetchDialogs(true), [fetchDialogs]);

  useEffect(() => {
    if (isSigningOut || step !== 'ready') {
      setDialogs([]);
      setLoading(false);
      setError(null);
      return;
    }
    fetchDialogs(true);
  }, [step, isSigningOut, fetchDialogs]);

  useEffect(() => {
    return subscribeUpdates((update: WsUpdate) => {
      if (update['@type'] === 'updateDialogs') {
        setDialogs(sortDialogsByDate(filterMainInboxDialogs(update.dialogs)));
        setLoading(false);
        setError(null);
      }

      if (update['@type'] === 'updateNewMessage') {
        let missing = false;
        setDialogs((prev) => {
          const result = patchDialogsOnMessage(prev, update.message);
          missing = !result.found;
          return result.dialogs;
        });
        if (missing) fetchDialogs(false);
      }

      if (update['@type'] === 'updateMessageSendSucceeded') {
        let missing = false;
        setDialogs((prev) => {
          const result = patchDialogsOnMessage(prev, update.message);
          missing = !result.found;
          return result.dialogs;
        });
        if (missing) fetchDialogs(false);
      }

      if (update['@type'] === 'updateMessageRead' && update.chat_id && !update.outbox) {
        setDialogs((prev) =>
          prev.map((d) =>
            chatIdsMatch(d.chat_id, update.chat_id) ? { ...d, unread_count: 0 } : d,
          ),
        );
      }

      if (update['@type'] === 'error') {
        if (isSigningOut || step !== 'ready') return;
        setError(update.message);
        setLoading(false);
      }
    });
  }, [subscribeUpdates, fetchDialogs, isSigningOut, step]);

  return { dialogs, loading, error, refresh };
}
