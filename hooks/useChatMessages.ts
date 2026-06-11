'use client';

import { useCallback, useEffect, useState } from 'react';
import type { TelegramMessage, WsUpdate } from '../lib/telegram-api-types';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

function upsertMessage(messages: TelegramMessage[], incoming: TelegramMessage): TelegramMessage[] {
  const idx = messages.findIndex((m) => m.id === incoming.id);
  if (idx >= 0) {
    const next = [...messages];
    next[idx] = incoming;
    return next;
  }
  return [...messages, incoming];
}

export function useChatMessages(chatId: string) {
  const { step, subscribeUpdates, sendCommand } = useTelegramAuthContext();
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [chatTitle, setChatTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

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
      if (update['@type'] === 'updateMessages' && update.chat_id === chatId) {
        setMessages(update.messages);
        setLoading(false);
        setError(null);
      }
      if (update['@type'] === 'updateNewMessage' && update.message.chat_id === chatId) {
        setMessages((prev) => upsertMessage(prev, update.message));
      }
      if (update['@type'] === 'updateMessageSendSucceeded' && update.chat_id === chatId) {
        setMessages((prev) => upsertMessage(prev, update.message));
      }
      if (update['@type'] === 'updateMessageEdited' && update.message.chat_id === chatId) {
        setMessages((prev) => upsertMessage(prev, update.message));
      }
      if (update['@type'] === 'error') {
        setError(update.message);
        setLoading(false);
      }
    });
  }, [subscribeUpdates, chatId]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    sendCommand({ method: 'sendMessage', chat_id: chatId, message: text });
    setDraft('');
  }, [draft, chatId, sendCommand]);

  return { messages, chatTitle, loading, error, draft, setDraft, send };
}
