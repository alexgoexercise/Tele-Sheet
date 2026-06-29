'use client';

import type { TelegramMessage } from '../../lib/telegram-api-types';
import { documentMediaUrl, photoMediaUrl, stickerPreviewUrl } from '../../lib/sticker-media';

function stickerPreviewSrc(
  media: { thumb_base64?: string; id: string; access_hash: string; file_reference: string },
) {
  return media.thumb_base64 ?? stickerPreviewUrl(media);
}

export function messageDisplayText(message: TelegramMessage, showMedia: boolean): string {
  if (message.media_type === 'sticker') {
    return showMedia ? message.text || message.sticker?.alt || '' : '[sticker]';
  }
  if (message.media_type === 'gif') {
    return showMedia ? message.text || '' : '[gif]';
  }
  if (message.media_type === 'photo') {
    return showMedia ? message.text || '' : '[photo]';
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
    const src = stickerPreviewSrc(message.sticker);
    return (
      <span className="inline-flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={message.sticker.alt || 'sticker'} className="h-16 w-16 object-contain" />
        {message.text ? <span>{message.text}</span> : null}
      </span>
    );
  }

  if (
    message.media_type === 'gif' &&
    showMedia &&
    message.gif?.access_hash &&
    message.gif.file_reference
  ) {
    const gif = message.gif;
    const src = documentMediaUrl({
      id: gif.id,
      access_hash: gif.access_hash,
      file_reference: gif.file_reference,
      mime_type: gif.mime_type || 'video/mp4',
    });
    const poster = gif.thumb_base64 ?? undefined;
    const isVideo = (gif.mime_type || 'video/mp4').startsWith('video/');
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {isVideo ? (
          <video
            src={src}
            poster={poster}
            autoPlay
            loop
            muted
            playsInline
            className="h-32 max-w-[240px] rounded object-contain bg-black/5"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={gif.alt || 'GIF'}
            className="h-32 max-w-[240px] rounded object-contain bg-black/5"
          />
        )}
        {message.text ? <span className="whitespace-pre-wrap break-words">{message.text}</span> : null}
      </span>
    );
  }

  if (
    message.media_type === 'photo' &&
    showMedia &&
    message.photo?.access_hash &&
    message.photo.file_reference
  ) {
    const src = photoMediaUrl(message.photo);
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={message.text || 'photo'}
          className="h-32 max-w-[240px] rounded object-contain bg-black/5"
        />
        {message.text ? <span className="whitespace-pre-wrap break-words">{message.text}</span> : null}
      </span>
    );
  }

  return (
    <span className="whitespace-pre-wrap break-words">{messageDisplayText(message, showMedia)}</span>
  );
}
