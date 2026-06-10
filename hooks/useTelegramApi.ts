'use client';

import { useEffect } from 'react';
import type {
  TelegramChat,
  TelegramDialog,
  TelegramMessage,
  TelegramUser,
  WsCommand,
  WsUpdate,
  WsUpdateType,
} from '../lib/telegram-api-types';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';

/**
 * Typed Telegram messaging API over the existing WebSocket connection.
 *
 * @example
 * ```tsx
 * const api = useTelegramApi((update) => {
 *   if (update['@type'] === 'updateNewMessage') {
 *     appendMessage(update.message);
 *   }
 * });
 *
 * api.openChat(chatId);
 * api.sendMessage(chatId, 'hello');
 * ```
 */
export function useTelegramApi(onUpdate?: (update: WsUpdate) => void) {
  const auth = useTelegramAuthContext();
  const { sendCommand, subscribeUpdates, step, connected, error, user, logout, clearError } = auth;

  useEffect(() => {
    if (!onUpdate) return;
    return subscribeUpdates(onUpdate);
  }, [onUpdate, subscribeUpdates]);

  const send = sendCommand;

  return {
    // Connection / auth
    step,
    connected,
    error,
    user,
    logout,
    clearError,
    isReady: step === 'ready',

    // ─── Chats ───────────────────────────────────────────────────────────
    /** List inbox chats (DMs + groups). Response: `updateDialogs` */
    getDialogs: (limit = 50) => send({ method: 'getDialogs', limit }),

    /** Get metadata for one chat. Response: `updateChat` */
    getChat: (chatId: string | number) => send({ method: 'getChat', chat_id: chatId }),

    /** Open chat: metadata + latest messages. Response: `updateChat` then `updateMessages` */
    openChat: (chatId: string | number, limit = 30) =>
      send({ method: 'openChat', chat_id: chatId, limit }),

    /** Mark chat read up to message_id (optional). Response: `updateMarkAsRead` */
    markAsRead: (chatId: string | number, messageId?: number) =>
      send({ method: 'markAsRead', chat_id: chatId, message_id: messageId }),

    // ─── Messages ────────────────────────────────────────────────────────
    /**
     * Fetch message history (newest first).
     * Pass `offsetId` = oldest loaded message id to paginate older history.
     * Response: `updateMessages`
     */
    getMessages: (
      chatId: string | number,
      opts?: { limit?: number; offsetId?: number; search?: string },
    ) =>
      send({
        method: 'getMessages',
        chat_id: chatId,
        limit: opts?.limit ?? 30,
        offset_id: opts?.offsetId,
        search: opts?.search,
      }),

    /** Send text. Optional `replyTo` message id. Response: `updateMessageSendSucceeded` */
    sendMessage: (chatId: string | number, message: string, replyTo?: number) =>
      send({ method: 'sendMessage', chat_id: chatId, message, reply_to: replyTo }),

    /** Edit message. Response: `updateMessageEdited` */
    editMessage: (chatId: string | number, messageId: number, message: string) =>
      send({ method: 'editMessage', chat_id: chatId, message_id: messageId, message }),

    /** Delete messages. Response: `updateMessagesDeleted` */
    deleteMessages: (chatId: string | number, messageIds: number[], revoke = true) =>
      send({ method: 'deleteMessages', chat_id: chatId, message_ids: messageIds, revoke }),

    // ─── User ────────────────────────────────────────────────────────────
    /** Current user. Response: `updateUser` */
    getMe: () => send({ method: 'getMe' }),

    send,
  };
}

/** Parse raw WebSocket JSON into a typed update */
export function parseWsUpdate(raw: string): WsUpdate | null {
  try {
    return JSON.parse(raw) as WsUpdate;
  } catch {
    return null;
  }
}

export type {
  TelegramChat,
  TelegramDialog,
  TelegramMessage,
  TelegramUser,
  WsCommand,
  WsUpdate,
  WsUpdateType,
};
