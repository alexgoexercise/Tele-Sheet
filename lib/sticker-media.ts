import type { TelegramSticker } from './telegram-api-types';

export const TELEGRAM_HTTP_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_HTTP_URL ?? 'http://127.0.0.1:8765';

export function stickerPreviewUrl(sticker: Pick<TelegramSticker, 'id' | 'access_hash' | 'file_reference'>) {
  const params = new URLSearchParams({
    id: sticker.id,
    access_hash: sticker.access_hash,
    file_reference: sticker.file_reference,
  });
  return `${TELEGRAM_HTTP_URL}/sticker?${params.toString()}`;
}
