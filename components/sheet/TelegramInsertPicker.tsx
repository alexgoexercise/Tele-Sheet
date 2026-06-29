'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Delete, Smile, Star, Sticker } from 'lucide-react';
import { useFavedStickers } from '../../hooks/useFavedStickers';
import { useGifs } from '../../hooks/useGifs';
import { useStickerSets } from '../../hooks/useStickerSets';
import {
  EMOJI_CATEGORIES,
  type EmojiCategoryId,
  getCategoryBarItems,
  getRecentEmojis,
  pushRecentEmoji,
} from '../../lib/emoji-categories';
import { getFavoriteEmojis, getRecentStickers, toggleFavoriteEmoji, isFavoriteEmoji } from '../../lib/insert-favorites';
import { useSheetCompose } from '../../lib/sheet-compose';
import type { TelegramGif, TelegramSticker } from '../../lib/telegram-api-types';

type MainTab = 'emoji' | 'favorites' | 'stickers' | 'gif';

type TelegramInsertPickerProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

const PICKER_W = 380;
const PICKER_H = 420;

export default function TelegramInsertPicker({ open, onClose, anchorRef }: TelegramInsertPickerProps) {
  const compose = useSheetCompose();
  const { stickers: favedStickers, loading: favedLoading, refresh: refreshFaved } = useFavedStickers();
  const stickerSets = useStickerSets();
  const gifs = useGifs();

  const [tab, setTab] = useState<MainTab>('emoji');
  const [emojiCategory, setEmojiCategory] = useState<EmojiCategoryId>('recent');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [favoriteEmojis, setFavoriteEmojis] = useState<string[]>([]);
  const [recentStickers, setRecentStickers] = useState<TelegramSticker[]>([]);
  const [stickerSearch, setStickerSearch] = useState('');
  const [gifQuery, setGifQuery] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setRecentEmojis(getRecentEmojis());
    setFavoriteEmojis(getFavoriteEmojis());
    setRecentStickers(getRecentStickers());
    refreshFaved();
    stickerSets.refreshSets();
    gifs.refreshSaved();
    setTab('emoji');
    setEmojiCategory('recent');
    setStickerSearch('');
    setGifQuery('');
    gifs.clearSearch();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'stickers' && stickerSets.sets.length > 0 && !stickerSets.activeSet) {
      stickerSets.loadSetStickers(stickerSets.sets[0].short_name);
    }
  }, [tab, stickerSets.sets, stickerSets.activeSet, stickerSets.loadSetStickers]);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - PICKER_W - 8),
    });
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('[data-telegram-insert-picker]') &&
        !target.closest('[data-insert-menu]')
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  const pickEmoji = useCallback(
    (emoji: string) => {
      pushRecentEmoji(emoji);
      setRecentEmojis(getRecentEmojis());
      compose?.insertEmoji(emoji);
    },
    [compose],
  );

  const pickSticker = useCallback(
    (sticker: TelegramSticker) => {
      compose?.insertSticker(sticker);
    },
    [compose],
  );

  const pickGif = useCallback(
    (gif: TelegramGif) => {
      if (gif.access_hash && gif.file_reference) {
        compose?.insertGif({
          kind: 'document',
          document: {
            id: gif.id,
            access_hash: gif.access_hash,
            file_reference: gif.file_reference,
          },
        });
      } else if (gif.query_id) {
        compose?.insertGif({
          kind: 'inline',
          query_id: gif.query_id,
          result_id: gif.id,
          thumb_url: gif.thumb_url,
        });
      }
    },
    [compose],
  );

  const scrollToCategory = (id: EmojiCategoryId) => {
    setEmojiCategory(id);
    const el = sectionRefs.current[id];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - scrollRef.current.offsetTop, behavior: 'smooth' });
    }
  };

  const runStickerSearch = () => {
    if (stickerSearch.trim()) stickerSets.searchSets(stickerSearch.trim());
    else stickerSets.refreshSets();
  };

  const runGifSearch = () => {
    gifs.clearSearch();
    if (gifQuery.trim()) gifs.search(gifQuery.trim());
  };

  const displayStickerSets =
    stickerSearch.trim() && stickerSets.searchResults.length > 0
      ? stickerSets.searchResults
      : stickerSets.sets;

  if (!open || !position || typeof window === 'undefined') return null;

  const noCompose = !compose;

  return createPortal(
    <div
      data-telegram-insert-picker
      className="fixed z-[9999] rounded-xl border border-gray-200/80 shadow-2xl overflow-hidden backdrop-blur-md bg-white/95"
      style={{ top: position.top, left: position.left, width: PICKER_W, height: PICKER_H }}
    >
      <div className="flex flex-col h-full">
        {/* Content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
          {tab === 'emoji' && (
            <>
              <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 overflow-x-auto shrink-0 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
                {getCategoryBarItems().map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.label}
                    onClick={() => scrollToCategory(item.id)}
                    className={`shrink-0 p-1.5 rounded hover:bg-gray-100 text-base ${
                      emojiCategory === item.id ? 'bg-gray-100' : ''
                    }`}
                  >
                    {item.id === 'recent' ? <Clock className="w-4 h-4 text-gray-600" /> : item.icon}
                  </button>
                ))}
              </div>

              {recentEmojis.length > 0 && (
                <div ref={(el) => { sectionRefs.current.recent = el; }}>
                  <p className="px-3 pt-2 pb-1 text-xs text-gray-400">Recently Used</p>
                  <div className="px-2 pb-2 grid grid-cols-8 gap-0.5">
                    {recentEmojis.map((emoji) => (
                      <button
                        key={`r-${emoji}`}
                        type="button"
                        disabled={noCompose}
                        onClick={() => pickEmoji(emoji)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setFavoriteEmojis(toggleFavoriteEmoji(emoji));
                        }}
                        className="relative h-9 w-9 text-xl hover:bg-gray-100 rounded disabled:opacity-40"
                      >
                        {emoji}
                        {isFavoriteEmoji(emoji) && (
                          <Star className="absolute right-0 top-0 h-2 w-2 fill-amber-400 text-amber-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {EMOJI_CATEGORIES.map((cat) => (
                <div key={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }}>
                  <p className="px-3 pt-2 pb-1 text-xs text-gray-400">{cat.label}</p>
                  <div className="px-2 pb-2 grid grid-cols-8 gap-0.5">
                    {cat.emojis.map((emoji) => (
                      <button
                        key={`${cat.id}-${emoji}`}
                        type="button"
                        disabled={noCompose}
                        onClick={() => pickEmoji(emoji)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setFavoriteEmojis(toggleFavoriteEmoji(emoji));
                        }}
                        className="relative h-9 w-9 text-xl hover:bg-gray-100 rounded disabled:opacity-40"
                        title={emoji}
                      >
                        {emoji}
                        {isFavoriteEmoji(emoji) && (
                          <Star className="absolute right-0 top-0 h-2 w-2 fill-amber-400 text-amber-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'favorites' && (
            <div className="p-2">
              {favoriteEmojis.length > 0 && (
                <>
                  <p className="px-1 pb-1 text-xs text-gray-400">Favorite emoji</p>
                  <div className="grid grid-cols-8 gap-0.5 mb-3">
                    {favoriteEmojis.map((emoji) => (
                      <button
                        key={`fav-e-${emoji}`}
                        type="button"
                        disabled={noCompose}
                        onClick={() => pickEmoji(emoji)}
                        className="h-9 w-9 text-xl hover:bg-gray-100 rounded disabled:opacity-40"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <p className="px-1 pb-1 text-xs text-gray-400">Saved stickers</p>
              {favedLoading && <p className="px-1 text-xs text-gray-400">Loading…</p>}
              {!favedLoading && favedStickers.length === 0 && recentStickers.length === 0 && (
                <p className="px-1 text-xs text-gray-400">No favorites yet.</p>
              )}
              <div className="grid grid-cols-5 gap-1">
                {[...favedStickers, ...recentStickers.filter((r) => !favedStickers.some((f) => f.id === r.id))].map(
                  (sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      disabled={noCompose}
                      onClick={() => pickSticker(sticker)}
                      className="h-14 w-14 p-1 hover:bg-gray-100 rounded disabled:opacity-40"
                      title={sticker.alt || 'sticker'}
                    >
                      {sticker.thumb_base64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sticker.thumb_base64} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-lg">{sticker.alt || '🙂'}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}

          {tab === 'stickers' && (
            <div className="flex flex-col h-full">
              <div className="px-2 py-1.5 border-b border-gray-100">
                <input
                  type="text"
                  value={stickerSearch}
                  onChange={(e) => setStickerSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runStickerSearch()}
                  placeholder="Search sticker sets…"
                  className="w-full text-xs px-2 py-1 border border-gray-200 rounded outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex gap-1 px-2 py-1 overflow-x-auto border-b border-gray-100">
                {displayStickerSets.map((set) => (
                  <button
                    key={set.short_name}
                    type="button"
                    onClick={() => stickerSets.loadSetStickers(set.short_name)}
                    className={`shrink-0 px-2 py-1 text-xs rounded ${
                      stickerSets.activeSet?.short_name === set.short_name
                        ? 'bg-blue-100 text-blue-800'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                    title={set.title}
                  >
                    {set.title.slice(0, 12)}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {stickerSets.loadingSets && displayStickerSets.length === 0 && (
                  <p className="text-xs text-gray-400">Loading sticker sets…</p>
                )}
                {stickerSets.loadingSetStickers && (
                  <p className="text-xs text-gray-400">Loading stickers…</p>
                )}
                {!stickerSets.loadingSets &&
                  !stickerSets.loadingSetStickers &&
                  displayStickerSets.length === 0 && (
                    <p className="text-xs text-gray-400">
                      No sticker sets found. Press Enter to search.
                    </p>
                  )}
                {stickerSets.error && (
                  <p className="text-xs text-red-500 mb-2">{stickerSets.error}</p>
                )}
                <div className="grid grid-cols-5 gap-1">
                  {stickerSets.setStickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      disabled={noCompose}
                      onClick={() => pickSticker(sticker)}
                      className="h-14 w-14 p-1 hover:bg-gray-100 rounded disabled:opacity-40"
                      title={sticker.alt || 'sticker'}
                    >
                      {sticker.thumb_base64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sticker.thumb_base64} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-lg">{sticker.alt || '🙂'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'gif' && (
            <div className="flex flex-col h-full">
              <div className="px-2 py-1.5 border-b border-gray-100">
                <input
                  type="text"
                  value={gifQuery}
                  onChange={(e) => setGifQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runGifSearch()}
                  placeholder="Search GIFs…"
                  className="w-full text-xs px-2 py-1 border border-gray-200 rounded outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {(gifs.loadingSaved || gifs.searching) && (
                  <p className="text-xs text-gray-400 mb-2">Loading…</p>
                )}
                {gifs.error && <p className="text-xs text-red-500 mb-2">{gifs.error}</p>}
                {!gifs.loadingSaved &&
                  !gifs.searching &&
                  (gifQuery.trim() ? gifs.searchResults : gifs.savedGifs).length === 0 && (
                    <p className="text-xs text-gray-400 mb-2">
                      {gifQuery.trim()
                        ? 'No GIFs found. Press Enter to search.'
                        : 'No saved GIFs yet.'}
                    </p>
                  )}
                <div className="grid grid-cols-3 gap-1">
                  {(gifQuery.trim() ? gifs.searchResults : gifs.savedGifs).map((gif) => (
                    <button
                      key={gif.id + (gif.query_id ?? '')}
                      type="button"
                      disabled={noCompose}
                      onClick={() => pickGif(gif)}
                      className="aspect-square p-1 hover:bg-gray-100 rounded disabled:opacity-40 overflow-hidden"
                    >
                      {gif.thumb_base64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={gif.thumb_base64} alt="" className="h-full w-full object-cover rounded" />
                      ) : gif.thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={gif.thumb_url} alt="" className="h-full w-full object-cover rounded" />
                      ) : (
                        <span className="text-xs text-gray-400">GIF</span>
                      )}
                    </button>
                  ))}
                </div>
                {gifQuery.trim() && gifs.nextOffset && (
                  <button
                    type="button"
                    onClick={() => gifs.search(gifQuery.trim(), gifs.nextOffset)}
                    className="mt-2 w-full text-xs text-blue-600 hover:underline"
                  >
                    Load more
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {noCompose && (
          <p className="px-3 py-1 text-xs text-amber-600 bg-amber-50 border-t border-amber-100">
            Open a chat compose row to insert.
          </p>
        )}

        {/* Bottom tab bar */}
        <div className="flex items-center border-t border-gray-200 bg-gray-50/90 shrink-0">
          <button
            type="button"
            onClick={() => setTab('emoji')}
            className={`flex-1 py-2 flex justify-center ${tab === 'emoji' ? 'text-blue-600' : 'text-gray-500'}`}
            title="Emoji"
          >
            <span className={`p-1 rounded-full ${tab === 'emoji' ? 'ring-2 ring-blue-400' : ''}`}>
              <Smile className="w-5 h-5" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('favorites')}
            className={`flex-1 py-2 flex justify-center ${tab === 'favorites' ? 'text-blue-600' : 'text-gray-500'}`}
            title="Favorites"
          >
            <Star className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setTab('stickers')}
            className={`flex-1 py-2 flex justify-center ${tab === 'stickers' ? 'text-blue-600' : 'text-gray-500'}`}
            title="Stickers"
          >
            <Sticker className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setTab('gif')}
            className={`flex-1 py-2 flex justify-center text-xs font-bold ${
              tab === 'gif' ? 'text-blue-600' : 'text-gray-500'
            }`}
            title="GIF"
          >
            GIF
          </button>
          <button
            type="button"
            onClick={() => compose?.deleteLastChar()}
            disabled={!compose}
            className="px-3 py-2 text-gray-500 hover:text-gray-800 disabled:opacity-40 border-l border-gray-200"
            title="Backspace"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
