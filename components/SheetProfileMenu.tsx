'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Cloud, LogOut, Plus, X } from 'lucide-react';
import { useTelegramAuthContext } from './TelegramAuthProvider';
import {
  getFakeGoogleEmail,
  getUserGreetingName,
  getUserInitial,
} from '../lib/user-display';

const POPUP_W = 400;

const avatarClass =
  'w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0';

type SheetProfileMenuProps = {
  /** When false, shows the avatar only (no click / popup). Use on the login page. */
  interactive?: boolean;
};

export default function SheetProfileMenu({ interactive = true }: SheetProfileMenuProps) {
  const router = useRouter();
  const { user, logout } = useTelegramAuthContext();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const initial = getUserInitial(user);
  const email = getFakeGoogleEmail(user);
  const greetingName = getUserGreetingName(user);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (open && !target.closest('[data-profile-menu]')) {
        setOpen(false);
        setPosition(null);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPosition(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setPosition(null);
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen(true);
  };

  const handleSignOut = () => {
    close();
    logout();
    router.replace('/login');
  };

  if (!interactive) {
    return (
      <div className={avatarClass} aria-hidden>
        {initial}
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-profile-menu
        onClick={toggle}
        className={`${avatarClass} cursor-pointer hover:ring-2 hover:ring-purple-300 transition`}
        aria-label="Google Account"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open &&
        position &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            data-profile-menu
            className="fixed z-[9999] rounded-3xl shadow-xl border border-gray-200/80 overflow-hidden"
            style={{
              top: position.top,
              right: position.right,
              width: POPUP_W,
              background: 'linear-gradient(180deg, #e8eaf6 0%, #ede7f6 55%, #f3e5f5 100%)',
            }}
          >
            <div className="relative px-6 pt-5 pb-2 text-center">
              <button
                type="button"
                onClick={close}
                className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-black/5 text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <p className="text-sm text-gray-700 truncate pr-8">{email}</p>
            </div>

            <div className="flex flex-col items-center px-6 pb-4">
              <div
                className="p-1 rounded-full mb-3"
                style={{
                  background: 'linear-gradient(135deg, #fbbc04, #ea4335, #34a853, #4285f4)',
                }}
              >
                <div className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-medium">
                  {initial}
                </div>
              </div>
              <p className="text-2xl text-gray-800 mb-4">
                Hi, {greetingName}!
              </p>
              <button
                type="button"
                disabled
                className="px-5 py-2 rounded-full border border-blue-600 text-blue-700 text-sm font-medium bg-white/60 cursor-default"
              >
                Manage your Google Account
              </button>
            </div>

            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled
                  className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl py-5 px-3 text-sm text-gray-500 cursor-default shadow-sm"
                >
                  <Plus className="w-5 h-5 text-blue-600" />
                  Add account
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl py-5 px-3 text-sm text-gray-700 hover:bg-gray-50 shadow-sm transition cursor-pointer"
                >
                  <LogOut className="w-5 h-5 text-gray-600" />
                  Sign out
                </button>
              </div>

              <div className="mt-3 bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                <Cloud className="w-5 h-5 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-600">7% of 5 TB used</span>
              </div>
            </div>

            <div className="px-6 py-4 text-center text-xs text-gray-500 border-t border-white/40">
              <button type="button" disabled className="hover:underline cursor-default">
                Privacy Policy
              </button>
              <span className="mx-2">·</span>
              <button type="button" disabled className="hover:underline cursor-default">
                Terms of Service
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
