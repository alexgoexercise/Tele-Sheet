'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import TelegramInsertPicker from './sheet/TelegramInsertPicker';
import { useSheetPreferences } from '../lib/sheet-preferences';

export default function SheetInsertMenu() {
  const { showStickerEmoji } = useSheetPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (menuOpen && !target.closest('[data-insert-menu]')) {
        setMenuOpen(false);
        setPosition(null);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const toggleMenu = () => {
    if (!showStickerEmoji) return;
    if (menuOpen) {
      setMenuOpen(false);
      setPosition(null);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 2, left: rect.left });
    }
    setMenuOpen(true);
  };

  const openPicker = () => {
    setMenuOpen(false);
    setPosition(null);
    setPickerOpen(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={showStickerEmoji ? 0 : -1}
        data-insert-menu
        onClick={toggleMenu}
        onKeyDown={(e) => e.key === 'Enter' && toggleMenu()}
        title={
          showStickerEmoji
            ? 'Insert menu'
            : 'Enable View → Show stickers & emoji to use insert'
        }
        className={`px-1 rounded ${
          showStickerEmoji
            ? `hover:bg-gray-100 cursor-pointer ${menuOpen || pickerOpen ? 'bg-gray-100' : ''}`
            : 'text-gray-400 cursor-not-allowed'
        }`}
      >
        Insert
      </span>

      {menuOpen &&
        position &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            data-insert-menu
            className="fixed bg-white border border-gray-300 rounded shadow-lg min-w-[220px] py-1 z-[9999]"
            style={{ top: position.top, left: position.left }}
          >
            <button
              type="button"
              onClick={openPicker}
              className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Insert emoji
            </button>
          </div>,
          document.body,
        )}

      {showStickerEmoji && (
        <TelegramInsertPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          anchorRef={triggerRef}
        />
      )}
    </>
  );
}
