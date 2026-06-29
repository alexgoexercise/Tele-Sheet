'use client';

import Link from 'next/link';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  Italic,
  Link as LinkIcon,
  Menu,
  MoreHorizontal,
  PaintBucket,
  Printer,
  Redo,
  Share,
  Type,
  Underline,
  Undo,
} from 'lucide-react';
import SheetFileMenu from '../SheetFileMenu';
import SheetInsertMenu from '../SheetInsertMenu';
import SheetProfileMenu from '../SheetProfileMenu';
import SheetViewMenu from '../SheetViewMenu';
import SyncStatusBadge from '../SyncStatusBadge';
import GridRow, { SHEET_LABEL_W, SHEET_STATUS_W } from './GridRow';

const TOOLBAR_ICONS = [
  Undo,
  Redo,
  Printer,
  PaintBucket,
  Bold,
  Italic,
  Underline,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  LinkIcon,
  Download,
  MoreHorizontal,
] as const;

type SheetTab = {
  label: string;
  href?: string;
  active?: boolean;
};

type SheetShellProps = {
  title: string;
  formulaText: string;
  formulaContent?: React.ReactNode;
  colA?: string;
  colB?: string;
  colC?: string;
  children: React.ReactNode;
  tabs?: SheetTab[];
};

export default function SheetShell({
  title,
  formulaText,
  formulaContent,
  colA = 'Field',
  colB = 'Value',
  colC = 'Status',
  children,
  tabs,
}: SheetShellProps) {
  return (
    <div className="flex flex-col h-screen bg-white text-sm font-sans">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-green-600 p-2 rounded-sm">
            <Menu className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg text-gray-700 font-medium px-1">{title}</span>
            <SyncStatusBadge />
            <div className="flex gap-4 text-xs text-gray-600 mt-1">
              <SheetFileMenu />
              <span className="hover:bg-gray-100 px-1 rounded cursor-default">Edit</span>
              <SheetViewMenu />
              <SheetInsertMenu />
              {['Format', 'Data', 'Tools', 'Extensions', 'Help'].map((m) => (
                <span key={m} className="hover:bg-gray-100 px-1 rounded cursor-default">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-medium"
            aria-hidden
          >
            <Share className="w-4 h-4" />
            Share
          </button>
          <SheetProfileMenu />
        </div>
      </div>

      <div className="flex items-center gap-1 px-4 py-1 bg-[#edf2fa] rounded-2xl mx-2 my-1 overflow-x-auto shrink-0">
        {TOOLBAR_ICONS.map((Icon, i) => (
          <button key={i} type="button" className="p-1.5 text-gray-700" aria-hidden>
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-300 bg-white shrink-0">
        <div className="text-gray-500 font-bold w-8 text-center bg-gray-100 rounded border border-gray-200 text-xs">
          fx
        </div>
        <div className="w-px h-5 bg-gray-300" />
        <span className="flex-1 text-gray-500 text-sm truncate">
          {formulaContent ?? formulaText}
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-[#f8f9fa]">
        <div className="min-w-[720px] bg-white border-b border-gray-200">
          <div className="flex h-6 border-b border-gray-300">
            <div className="w-10 bg-[#f8f9fa] border-r border-gray-300" />
            <div
              className="bg-[#f8f9fa] border-r border-gray-300 font-bold text-gray-500 text-xs flex items-center justify-center"
              style={{ width: SHEET_LABEL_W }}
            >
              A
            </div>
            <div className="bg-[#f8f9fa] border-r border-gray-300 font-bold text-gray-500 text-xs flex items-center justify-center flex-1">
              B
            </div>
            <div
              className="bg-[#f8f9fa] border-r border-gray-300 font-bold text-gray-500 text-xs flex items-center justify-center"
              style={{ width: SHEET_STATUS_W }}
            >
              C
            </div>
          </div>
          <GridRow n={1}>
            <span className="text-gray-500 font-medium">{colA}</span>
            <span className="text-gray-500 font-medium">{colB}</span>
            <span className="text-gray-500 font-medium">{colC}</span>
          </GridRow>
          {children}
        </div>
      </div>

      {tabs && tabs.length > 0 && (
        <div className="bg-white border-t border-gray-300 px-2 flex items-center gap-2 h-10 shrink-0">
          {tabs.map((tab) =>
            tab.href ? (
              <Link
                key={tab.label}
                href={tab.href}
                className={`px-4 py-1 text-sm ${
                  tab.active
                    ? 'border-b-2 border-green-600 text-green-700 font-medium'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.label}
              </Link>
            ) : (
              <span
                key={tab.label}
                className={`px-4 py-1 text-sm ${
                  tab.active
                    ? 'border-b-2 border-green-600 text-green-700 font-medium'
                    : 'text-gray-400'
                }`}
              >
                {tab.label}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
