'use client';

import type { ReactNode } from 'react';
import { useSheetPreferences } from '../../lib/sheet-preferences';
import type { PendingGif, PendingSticker } from '../../lib/sheet-compose';
import { stickerPreviewUrl } from '../../lib/sticker-media';

type ComposeInputProps = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  pendingSticker: PendingSticker | null;
  onClearSticker: () => void;
  pendingGif?: PendingGif | null;
  onClearGif?: () => void;
};

export default function ComposeInput({
  draft,
  onDraftChange,
  onSend,
  pendingSticker,
  onClearSticker,
  pendingGif = null,
  onClearGif,
}: ComposeInputProps) {
  const { showStickerEmoji } = useSheetPreferences();
  const canSend = Boolean(draft.trim() || pendingSticker || pendingGif);
  const stickerSrc =
    pendingSticker?.thumb_base64 ??
    (pendingSticker ? stickerPreviewUrl(pendingSticker) : undefined);

  return (
    <div className="flex items-center gap-2 w-full">
      {pendingSticker && (
        <span className="inline-flex items-center gap-1 shrink-0">
          {showStickerEmoji ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stickerSrc}
              alt={pendingSticker.alt || 'sticker'}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <span className="text-xs text-gray-500 font-mono">[sticker]</span>
          )}
          <button
            type="button"
            onClick={onClearSticker}
            className="text-xs text-gray-400 hover:text-gray-600"
            aria-label="Remove sticker"
          >
            ×
          </button>
        </span>
      )}
      {pendingGif && !pendingSticker && (
        <span className="inline-flex items-center gap-1 shrink-0">
          {showStickerEmoji && pendingGif.kind === 'inline' && pendingGif.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingGif.thumb_url} alt="GIF" className="h-8 w-8 object-contain rounded" />
          ) : showStickerEmoji ? (
            <span className="text-xs font-medium text-gray-600">GIF</span>
          ) : (
            <span className="text-xs text-gray-500 font-mono">[gif]</span>
          )}
          <button
            type="button"
            onClick={onClearGif}
            className="text-xs text-gray-400 hover:text-gray-600"
            aria-label="Remove GIF"
          >
            ×
          </button>
        </span>
      )}
      <input
        type="text"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && canSend && onSend()}
        placeholder={
          pendingSticker || pendingGif ? 'Optional caption…' : 'Type a message…'
        }
        className="flex-1 outline-none bg-transparent"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-sm shrink-0"
      >
        Send
      </button>
    </div>
  );
}

export function composeFormulaPreview(
  draft: string,
  pendingSticker: PendingSticker | null,
  showMedia: boolean,
  pendingGif?: PendingGif | null,
): string {
  if (pendingGif && !pendingSticker) {
    const gifLabel = showMedia ? 'GIF' : '[gif]';
    return draft.trim() ? `${gifLabel} ${draft}` : gifLabel;
  }
  if (pendingSticker) {
    const stickerLabel = showMedia ? pendingSticker.alt || '🧩' : '[sticker]';
    return draft.trim() ? `${stickerLabel} ${draft}` : stickerLabel;
  }
  return draft;
}

function pendingStickerSrc(sticker: PendingSticker) {
  return sticker.thumb_base64 ?? stickerPreviewUrl(sticker);
}

export function composeFormulaContent(
  draft: string,
  pendingSticker: PendingSticker | null,
  showMedia: boolean,
  pendingGif?: PendingGif | null,
): ReactNode {
  if (!showMedia) {
    const text = composeFormulaPreview(draft, pendingSticker, showMedia, pendingGif);
    return text || null;
  }

  if (pendingGif && !pendingSticker) {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {pendingGif.kind === 'inline' && pendingGif.thumb_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pendingGif.thumb_url} alt="GIF" className="h-5 w-5 object-contain rounded shrink-0" />
        ) : (
          <span className="text-xs font-medium text-gray-600 shrink-0">GIF</span>
        )}
        {draft.trim() ? <span className="truncate">{draft}</span> : null}
      </span>
    );
  }

  if (pendingSticker) {
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pendingStickerSrc(pendingSticker)}
          alt={pendingSticker.alt || 'sticker'}
          className="h-5 w-5 object-contain shrink-0"
        />
        {draft.trim() ? <span className="truncate">{draft}</span> : null}
      </span>
    );
  }

  return draft || null;
}
