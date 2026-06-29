import type { TelegramSticker } from './telegram-api-types';

const FAV_EMOJI_KEY = 'telesheet.favoriteEmojis';
const RECENT_STICKER_KEY = 'telesheet.recentStickers';
const RECENT_MAX = 24;

export function getFavoriteEmojis(): string[] {
  try {
    const raw = localStorage.getItem(FAV_EMOJI_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === 'string');
  } catch {
    return [];
  }
}

export function toggleFavoriteEmoji(emoji: string): string[] {
  try {
    const current = getFavoriteEmojis();
    const next = current.includes(emoji)
      ? current.filter((e) => e !== emoji)
      : [emoji, ...current];
    localStorage.setItem(FAV_EMOJI_KEY, JSON.stringify(next));
    return next;
  } catch {
    return getFavoriteEmojis();
  }
}

export function isFavoriteEmoji(emoji: string): boolean {
  return getFavoriteEmojis().includes(emoji);
}

export function getRecentStickers(): TelegramSticker[] {
  try {
    const raw = localStorage.getItem(RECENT_STICKER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is TelegramSticker =>
        typeof s === 'object' &&
        s != null &&
        typeof (s as TelegramSticker).id === 'string' &&
        typeof (s as TelegramSticker).access_hash === 'string',
    );
  } catch {
    return [];
  }
}

export function pushRecentSticker(sticker: TelegramSticker) {
  try {
    const recent = getRecentStickers().filter((s) => s.id !== sticker.id);
    recent.unshift({
      id: sticker.id,
      access_hash: sticker.access_hash,
      file_reference: sticker.file_reference,
      alt: sticker.alt,
      thumb_base64: sticker.thumb_base64,
    });
    localStorage.setItem(RECENT_STICKER_KEY, JSON.stringify(recent.slice(0, RECENT_MAX)));
  } catch {
    // ignore storage errors
  }
}
