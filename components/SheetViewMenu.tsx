'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSheetPreferences } from '../lib/sheet-preferences';

export default function SheetViewMenu() {
  const { showStickerEmoji, toggleShowStickerEmoji } = useSheetPreferences();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (open && !target.closest('[data-view-menu]')) {
        setOpen(false);
        setPosition(null);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      setPosition(null);
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 2, left: rect.left });
    }
    setOpen(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        data-view-menu
        onClick={toggle}
        onKeyDown={(e) => e.key === 'Enter' && toggle()}
        className={`hover:bg-gray-100 px-1 rounded cursor-pointer ${open ? 'bg-gray-100' : ''}`}
      >
        View
      </span>

      {open &&
        position &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            data-view-menu
            className="fixed bg-white border border-gray-300 rounded shadow-lg min-w-[240px] py-1 z-[9999]"
            style={{ top: position.top, left: position.left }}
          >
            <button
              type="button"
              onClick={() => {
                toggleShowStickerEmoji();
                setOpen(false);
                setPosition(null);
              }}
              className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between gap-4"
            >
              <span>Show stickers &amp; emoji</span>
              <span className="text-xs text-gray-500">{showStickerEmoji ? 'On' : 'Off'}</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
