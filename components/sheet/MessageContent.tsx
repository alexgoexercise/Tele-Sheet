'use client';

import type { TelegramMessage } from '../../lib/telegram-api-types';
import { stickerPreviewUrl } from '../../lib/sticker-media';

function mediaPreviewSrc(
  media: { thumb_base64?: string; id: string; access_hash: string; file_reference: string },
) {
  return media.thumb_base64 ?? stickerPreviewUrl(media);
}

export function messageDisplayText(message: TelegramMessage, showMedia: boolean): string {
  if (message.media_type === 'sticker') {
    return showMedia ? message.text || message.sticker?.alt || '' : '[sticker]';
  }
  if (message.media_type === 'gif') {
    return showMedia ? message.text || message.gif?.alt || 'GIF' : '[gif]';
  }
  if (message.media_type === 'custom_emoji_text' && message.custom_emojis?.length) {
    if (showMedia) return message.text;
    let text = message.text;
    const sorted = [...message.custom_emojis].sort((a, b) => b.offset - a.offset);
    for (const emoji of sorted) {
      text = `${text.slice(0, emoji.offset)}[emoji]${text.slice(emoji.offset + emoji.length)}`;
    }
    return text;
  }
  return message.text || '—';
}

export default function MessageContent({
  message,
  showMedia,
}: {
  message: TelegramMessage;
  showMedia: boolean;
}) {
  if (message.media_type === 'sticker' && showMedia && message.sticker) {
    const src = mediaPreviewSrc(message.sticker);
    return (
      <span className="inline-flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={message.sticker.alt || 'sticker'} className="h-16 w-16 object-contain" />
        {message.text ? <span>{message.text}</span> : null}
      </span>
    );
  }

  if (message.media_type === 'gif' && showMedia && message.gif?.access_hash && message.gif.file_reference) {
    const src = mediaPreviewSrc(message.gif as Required<Pick<typeof message.gif, 'id' | 'access_hash' | 'file_reference'>> & { thumb_base64?: string });
    return (
      <span className="inline-flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={message.gif.alt || 'GIF'} className="h-16 w-16 object-contain rounded" />
        {message.text ? <span>{message.text}</span> : null}
      </span>
    );
  }

  return (
    <span className="whitespace-pre-wrap break-words">{messageDisplayText(message, showMedia)}</span>
  );
}
