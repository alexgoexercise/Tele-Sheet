'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TelegramMessage, TelegramSticker, WsUpdate } from '../lib/telegram-api-types';
import type { PendingGif, PendingSticker } from '../lib/sheet-compose';
import { chatIdsMatch, sortMessagesByDate } from '../lib/chat';
import { pushRecentEmoji } from '../lib/emoji-categories';
import { pushRecentSticker } from '../lib/insert-favorites';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

function isPickerBridgeError(message: string) {
  return /^(unknown method: (searchGifs|searchStickerSets|getAllStickerSets|getStickerSet|getSavedGifs|getFavedStickers))/.test(
    message,
  );
}

function upsertMessage(messages: TelegramMessage[], incoming: TelegramMessage): TelegramMessage[] {
  const idx = messages.findIndex((m) => m.id === incoming.id);
  const next =
    idx >= 0
      ? messages.map((m, i) => (i === idx ? { ...m, ...incoming } : m))
      : [...messages, incoming];
  return sortMessagesByDate(next);
}

export function useChatMessages(chatId: string) {
  const { step, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [chatTitle, setChatTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingSticker, setPendingSticker] = useState<PendingSticker | null>(null);
  const [pendingGif, setPendingGif] = useState<PendingGif | null>(null);

  useEffect(() => {
    if (step !== 'ready' || !chatId) return;
    setMessages([]);
    setChatTitle('');
    setLoading(true);
    setError(null);
    sendCommand({ method: 'openChat', chat_id: chatId, limit: 50 });
  }, [step, chatId, sendCommand]);

  useEffect(() => {
    return subscribeUpdates((update: WsUpdate) => {
      if (update['@type'] === 'updateChat') {
        setChatTitle(update.chat.title);
      }
      if (update['@type'] === 'updateMessages' && chatIdsMatch(update.chat_id, chatId)) {
        setMessages(sortMessagesByDate(update.messages));
        setLoading(false);
        setError(null);
      }
      if (
        update['@type'] === 'updateNewMessage' &&
        chatIdsMatch(update.message.chat_id, chatId)
      ) {
        setMessages((prev) => upsertMessage(prev, update.message));
        setLoading(false);
      }
      if (
        update['@type'] === 'updateMessageSendSucceeded' &&
        chatIdsMatch(update.chat_id, chatId)
      ) {
        setMessages((prev) => upsertMessage(prev, update.message));
      }
      if (
        update['@type'] === 'updateMessageEdited' &&
        chatIdsMatch(update.message.chat_id, chatId)
      ) {
        setMessages((prev) => upsertMessage(prev, update.message));
      }
      if (update['@type'] === 'error' && !isPickerBridgeError(update.message)) {
        setError(update.message);
        setLoading(false);
      }
    });
  }, [subscribeUpdates, chatId]);

  const insertEmoji = useCallback((emoji: string) => {
    pushRecentEmoji(emoji);
    setDraft((prev) => prev + emoji);
  }, []);

  const insertSticker = useCallback((sticker: TelegramSticker) => {
    pushRecentSticker(sticker);
    setPendingGif(null);
    setPendingSticker({
      id: sticker.id,
      access_hash: sticker.access_hash,
      file_reference: sticker.file_reference,
      alt: sticker.alt,
      thumb_base64: sticker.thumb_base64,
    });
  }, []);

  const insertGif = useCallback((gif: PendingGif) => {
    setPendingSticker(null);
    setPendingGif(gif);
  }, []);

  const deleteLastChar = useCallback(() => {
    if (pendingGif) {
      setPendingGif(null);
      return;
    }
    if (pendingSticker) {
      setPendingSticker(null);
      return;
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const chars = [...prev];
      chars.pop();
      return chars.join('');
    });
  }, [pendingGif, pendingSticker]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (pendingGif) {
      if (pendingGif.kind === 'inline') {
        sendCommand({
          method: 'sendGif',
          chat_id: chatId,
          gif: { query_id: pendingGif.query_id, result_id: pendingGif.result_id },
        });
      } else {
        sendCommand({
          method: 'sendGif',
          chat_id: chatId,
          gif: pendingGif.document,
        });
      }
      setPendingGif(null);
      setDraft('');
      return;
    }
    if (pendingSticker) {
      sendCommand({
        method: 'sendSticker',
        chat_id: chatId,
        sticker: {
          id: pendingSticker.id,
          access_hash: pendingSticker.access_hash,
          file_reference: pendingSticker.file_reference,
        },
      });
      setPendingSticker(null);
      setDraft('');
      return;
    }
    if (!text) return;
    sendCommand({ method: 'sendMessage', chat_id: chatId, message: text });
    setDraft('');
  }, [draft, pendingSticker, pendingGif, chatId, sendCommand]);

  const composeValue = useMemo(
    () => ({
      draft,
      setDraft,
      pendingSticker,
      setPendingSticker,
      pendingGif,
      setPendingGif,
      insertEmoji,
      insertSticker,
      insertGif,
      deleteLastChar,
    }),
    [draft, pendingSticker, pendingGif, insertEmoji, insertSticker, insertGif, deleteLastChar],
  );

  return {
    messages,
    chatTitle,
    loading,
    error,
    draft,
    setDraft,
    pendingSticker,
    setPendingSticker,
    pendingGif,
    setPendingGif,
    insertEmoji,
    insertSticker,
    insertGif,
    deleteLastChar,
    send,
    composeValue,
  };
}
