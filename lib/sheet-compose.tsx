'use client';

import { createContext, useContext } from 'react';
import type { TelegramSticker } from './telegram-api-types';

export type PendingSticker = Pick<
  TelegramSticker,
  'id' | 'access_hash' | 'file_reference' | 'alt' | 'thumb_base64'
>;

export type PendingGif =
  | { kind: 'document'; document: Pick<TelegramSticker, 'id' | 'access_hash' | 'file_reference'> }
  | { kind: 'inline'; query_id: string; result_id: string; thumb_url?: string };

export type SheetComposeContextValue = {
  draft: string;
  setDraft: (value: string) => void;
  pendingSticker: PendingSticker | null;
  setPendingSticker: (sticker: PendingSticker | null) => void;
  pendingGif: PendingGif | null;
  setPendingGif: (gif: PendingGif | null) => void;
  insertEmoji: (emoji: string) => void;
  insertSticker: (sticker: TelegramSticker) => void;
  insertGif: (gif: PendingGif) => void;
  deleteLastChar: () => void;
};

const SheetComposeContext = createContext<SheetComposeContextValue | null>(null);

export function SheetComposeProvider({
  value,
  children,
}: {
  value: SheetComposeContextValue;
  children: React.ReactNode;
}) {
  return <SheetComposeContext.Provider value={value}>{children}</SheetComposeContext.Provider>;
}

export function useSheetCompose() {
  return useContext(SheetComposeContext);
}
