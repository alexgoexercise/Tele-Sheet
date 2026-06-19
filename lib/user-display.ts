import type { TelegramUser } from '../hooks/useTelegramAuth';

export function getUserDisplayName(user: TelegramUser | null): string {
  if (!user) return 'Guest';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'User';
}

export function getUserInitial(user: TelegramUser | null): string {
  if (!user) return '?';
  const fromName = user.first_name?.charAt(0) || user.last_name?.charAt(0);
  if (fromName) return fromName.toUpperCase();
  if (user.username) return user.username.charAt(0).toUpperCase();
  return 'U';
}

export function getFakeGoogleEmail(user: TelegramUser | null): string {
  if (!user) return 'guest@gmail.com';
  if (user.username) return `${user.username}@gmail.com`;
  const local = (user.first_name || 'user').toLowerCase().replace(/\s+/g, '');
  return `${local}@gmail.com`;
}

export function getUserGreetingName(user: TelegramUser | null): string {
  if (!user) return 'there';
  return user.first_name || user.username || 'there';
}
