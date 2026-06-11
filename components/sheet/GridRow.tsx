'use client';

import React from 'react';

export const SHEET_LABEL_W = 160;
export const SHEET_STATUS_W = 120;

type GridRowProps = {
  n: number;
  labelW?: number;
  statusW?: number;
  children: React.ReactNode;
  tall?: number;
  header?: boolean;
  highlight?: boolean;
  muted?: boolean;
  onClick?: () => void;
};

export default function GridRow({
  n,
  labelW = SHEET_LABEL_W,
  statusW = SHEET_STATUS_W,
  children,
  tall,
  highlight,
  muted,
  onClick,
}: GridRowProps) {
  const cells = Array.isArray(children) ? children : [children];
  const h = tall ?? 28;

  return (
    <div
      className={`flex border-b border-gray-200 ${onClick ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}
      style={{ minHeight: h }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="w-10 shrink-0 flex items-start justify-center pt-1 bg-[#f8f9fa] border-r border-gray-300 text-xs font-bold text-gray-500">
        {n}
      </div>
      {cells.map((cell, i) => (
        <div
          key={i}
          className={`flex items-center px-2 text-sm relative ${
            muted ? 'bg-[#fafafa] text-gray-500' : 'bg-white'
          } ${i === 0 ? 'border-r border-gray-200' : ''} ${i === 1 ? 'flex-1 border-r border-gray-200' : ''}`}
          style={i === 0 ? { width: labelW } : i === 2 ? { width: statusW } : undefined}
        >
          {highlight && i === 1 && (
            <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none" />
          )}
          <div className="relative z-10 w-full py-1">{cell}</div>
        </div>
      ))}
    </div>
  );
}
