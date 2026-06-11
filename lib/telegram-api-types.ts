/** WebSocket URL for the Teleproto bridge */
export const TELEGRAM_WS_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_WS_URL ?? 'ws://127.0.0.1:8765/ws';

// ─── Domain types ───────────────────────────────────────────────────────────

export type TelegramUser = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string;
};

export type TelegramDialog = {
  id: string;
  chat_id: string;
  title: string;
  unread_count: number;
  last_message_date: number;
  is_group: boolean;
  is_user: boolean;
  archived: boolean;
  pinned: boolean;
};

export type TelegramChat = {
  id: string;
  title: string;
  username?: string;
  is_group: boolean;
  is_user: boolean;
  is_channel: boolean;
};

export type TelegramMessage = {
  id: number;
  chat_id?: string;
  date?: number;
  text: string;
  sender_id?: string;
  out: boolean;
  reply_to?: number;
  edit_date?: number;
  is_edited: boolean;
};

// ─── Client → server commands ───────────────────────────────────────────────

export type WsCommand =
  // Auth
  | { method: 'getAuthState' }
  | { method: 'startQrAuth' }
  | { method: 'cancelQrAuth' }
  | { method: 'setAuthenticationPhoneNumber'; phone_number: string }
  | { method: 'checkAuthenticationCode'; code: string }
  | { method: 'checkAuthenticationPassword'; password: string }
  | { method: 'logOut' }
  // User
  | { method: 'getMe' }
  // Chats
  | { method: 'getDialogs'; limit?: number; archived?: boolean }
  | { method: 'getChat'; chat_id: string | number }
  | { method: 'openChat'; chat_id: string | number; limit?: number }
  | { method: 'markAsRead'; chat_id: string | number; message_id?: number }
  // Messages
  | { method: 'getMessages'; chat_id: string | number; limit?: number; offset_id?: number; search?: string }
  | { method: 'sendMessage'; chat_id: string | number; message: string; reply_to?: number }
  | { method: 'editMessage'; chat_id: string | number; message_id: number; message: string }
  | { method: 'deleteMessages'; chat_id: string | number; message_ids: number[]; revoke?: boolean };

// ─── Server → client updates ──────────────────────────────────────────────

export type WsUpdate =
  | { '@type': 'updateAuthorizationState'; authorization_state: { '@type': string; password_hint?: string } }
  | { '@type': 'updateQrCode'; token: string; expires: number }
  | { '@type': 'updateUser'; user: TelegramUser }
  | { '@type': 'updateLoggedOut' }
  | { '@type': 'updateDialogs'; dialogs: TelegramDialog[] }
  | { '@type': 'updateChat'; chat: TelegramChat }
  | { '@type': 'updateMessages'; chat_id: string; messages: TelegramMessage[] }
  | { '@type': 'updateNewMessage'; message: TelegramMessage }
  | { '@type': 'updateMessageEdited'; message: TelegramMessage }
  | { '@type': 'updateMessagesDeleted'; chat_id?: string; message_ids: number[] }
  | { '@type': 'updateMessageRead'; chat_id?: string; max_id?: number; outbox?: boolean }
  | { '@type': 'updateMessageSendSucceeded'; chat_id: string; message: TelegramMessage }
  | { '@type': 'updateMarkAsRead'; chat_id: string; success: boolean }
  | { '@type': 'error'; message: string };

export type WsUpdateType = WsUpdate['@type'];
