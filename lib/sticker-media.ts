import type { TelegramGif, TelegramPhoto, TelegramSticker } from './telegram-api-types';

export const TELEGRAM_HTTP_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_HTTP_URL ?? 'http://127.0.0.1:8765';

type DocumentRef = Pick<TelegramSticker, 'id' | 'access_hash' | 'file_reference'>;

function documentParams(ref: DocumentRef) {
  return new URLSearchParams({
    id: ref.id,
    access_hash: ref.access_hash,
    file_reference: ref.file_reference,
  });
}

export function stickerPreviewUrl(sticker: DocumentRef) {
  return `${TELEGRAM_HTTP_URL}/sticker?${documentParams(sticker).toString()}`;
}

/** Full document file — used for animated GIF playback (video/mp4). */
export function documentMediaUrl(
  doc: DocumentRef & Pick<TelegramGif, 'mime_type'>,
) {
  const params = documentParams(doc);
  if (doc.mime_type) params.set('mime_type', doc.mime_type);
  return `${TELEGRAM_HTTP_URL}/media?${params.toString()}`;
}

/** Large photo preview from Telegram photo or image document. */
export function photoMediaUrl(photo: TelegramPhoto) {
  const params = documentParams(photo);
  if (photo.dc_id) params.set('dc_id', photo.dc_id);
  if (photo.mime_type) params.set('mime_type', photo.mime_type);
  return `${TELEGRAM_HTTP_URL}/photo?${params.toString()}`;
}

/** Proxy remote CDN thumbnails (inline bot results) through the bridge to avoid CORS blocks. */
export function proxiedRemoteUrl(remoteUrl: string) {
  return `${TELEGRAM_HTTP_URL}/fetch?${new URLSearchParams({ url: remoteUrl }).toString()}`;
}

export function isVideoGif(gif: Pick<TelegramGif, 'mime_type'>) {
  return (gif.mime_type || 'video/mp4').startsWith('video/');
}
