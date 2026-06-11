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

export function messageSenderLabel(message: TelegramMessage): string {
  if (message.out) return 'You';
  return message.sender_id ? `User ${message.sender_id}` : 'Contact';
}

export function sortDialogsByDate(dialogs: TelegramDialog[]): TelegramDialog[] {
  return [...dialogs].sort((a, b) => b.last_message_date - a.last_message_date);
}

export function filterMainInboxDialogs(dialogs: TelegramDialog[]): TelegramDialog[] {
  return dialogs.filter((d) => !d.archived);
}
