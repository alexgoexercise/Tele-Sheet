import type { TelegramDialog, TelegramMessage } from './telegram-api-types';

export function formatMessageTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

export function dialogTypeLabel(dialog: TelegramDialog): string {
  if (dialog.is_group) return 'Group';
  if (dialog.is_user) return 'Direct';
  return 'Chat';
}

/** Telegram peer IDs can appear as marked (-100…) or raw entity ids; compare both forms. */
export function chatIdsMatch(
  a: string | number | undefined,
  b: string | number | undefined,
): boolean {
  if (a == null || b == null || a === '' || b === '') return false;
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) return true;

  const variants = (id: string): Set<string> => {
    const set = new Set<string>([id]);
    if (id.startsWith('-100')) {
      set.add(id.slice(4));
    } else if (id.startsWith('-')) {
      set.add(id.slice(1));
    } else {
      set.add(`-100${id}`);
      set.add(`-${id}`);
    }
    return set;
  };

  const va = variants(sa);
  for (const v of variants(sb)) {
    if (va.has(v)) return true;
  }
  return false;
}

/** Newest first — matches compose-at-top layout (latest row sits just below compose). */
export function sortMessagesByDate(messages: TelegramMessage[]): TelegramMessage[] {
  return [...messages].sort(
    (a, b) => (b.date ?? 0) - (a.date ?? 0) || b.id - a.id,
  );
}

export function messageSenderLabel(message: TelegramMessage): string {
  if (message.out) return 'You';
  if (message.sender_name) return message.sender_name;
  if (message.sender_username) return `@${message.sender_username}`;
  return message.sender_id ? `User ${message.sender_id}` : 'Contact';
}

export function sortDialogsByDate(dialogs: TelegramDialog[]): TelegramDialog[] {
  return [...dialogs].sort((a, b) => b.last_message_date - a.last_message_date);
}

function findDialogIndex(dialogs: TelegramDialog[], chatId: string): number {
  return dialogs.findIndex(
    (d) => chatIdsMatch(d.chat_id, chatId) || chatIdsMatch(d.id, chatId),
  );
}

/** Bump a conversation to the top when a live message arrives (inbox overview). */
export function patchDialogsOnMessage(
  dialogs: TelegramDialog[],
  message: TelegramMessage,
): { dialogs: TelegramDialog[]; found: boolean } {
  const chatId = message.chat_id;
  if (!chatId) return { dialogs, found: false };

  const idx = findDialogIndex(dialogs, chatId);
  if (idx < 0) return { dialogs, found: false };

  const dialog = dialogs[idx];
  const msgDate = message.date ?? dialog.last_message_date;
  const updated: TelegramDialog = {
    ...dialog,
    last_message_date: Math.max(msgDate, dialog.last_message_date),
    unread_count: message.out ? dialog.unread_count : dialog.unread_count + 1,
  };

  const rest = dialogs.filter((_, i) => i !== idx);
  return { dialogs: sortDialogsByDate([updated, ...rest]), found: true };
}

export function filterMainInboxDialogs(dialogs: TelegramDialog[]): TelegramDialog[] {
  return dialogs.filter((d) => !d.archived);
}
