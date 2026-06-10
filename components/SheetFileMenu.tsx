'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTelegramAuthContext } from './TelegramAuthProvider';

const DECOY_ITEMS = ['New spreadsheet', 'Open…', 'Make a copy', 'Download'] as const;

export default function SheetFileMenu() {
  const router = useRouter();
  const { logout } = useTelegramAuthContext();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (open && !target.closest('[data-file-menu]')) {
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

  const handleDisconnect = () => {
    setOpen(false);
    setPosition(null);
    logout();
    router.replace('/login');
  };

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        data-file-menu
        onClick={toggle}
        onKeyDown={(e) => e.key === 'Enter' && toggle()}
        className={`hover:bg-gray-100 px-1 rounded cursor-pointer ${open ? 'bg-gray-100' : ''}`}
      >
        File
      </span>

      {open &&
        position &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            data-file-menu
            className="fixed bg-white border border-gray-300 rounded shadow-lg min-w-[220px] py-1 z-[9999]"
            style={{ top: position.top, left: position.left }}
          >
            {DECOY_ITEMS.map((item) => (
              <button
                key={item}
                type="button"
                className="w-full text-left px-4 py-1.5 text-sm text-gray-400 cursor-default"
                disabled
              >
                {item}
              </button>
            ))}
            <div className="my-1 border-t border-gray-200" />
            <button
              type="button"
              onClick={handleDisconnect}
              className="w-full text-left px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Disconnect cloud sync…
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
