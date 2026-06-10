'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import AuthGuard from '../components/AuthGuard';
import DeleteSheetModal from '../components/DeleteSheetModal';
import SheetFileMenu from '../components/SheetFileMenu';
import SyncStatusBadge from '../components/SyncStatusBadge';
import { useTelegramAuthContext } from '../components/TelegramAuthProvider';
import { 
  ChevronDown, 
  Plus, 
  Menu, 
  Share, 
  Undo, 
  Redo, 
  Printer, 
  PaintBucket, 
  Type, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Bold, 
  Italic, 
  Underline, 
  Link as LinkIcon, 
  Download,
  RotateCcw,
  MoreHorizontal
} from 'lucide-react';

const NUM_ROWS = 100;
const NUM_COLS = 26; // A-Z
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 24;
const MIN_COL_WIDTH = 40;
const MIN_ROW_HEIGHT = 24;

// Type definitions
type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

type CellData = {
  value?: string;
  style?: CellStyle;
};

type GridData = {
  [key: string]: CellData;
};

type SelectedCell = {
  row: number;
  col: number;
} | null;

type SizeMap = {
  [index: number]: number;
};

type ResizeState = {
  type: 'col' | 'row';
  index: number;
  startPos: number;
  startSize: number;
} | null;

type Sheet = {
  id: string;
  name: string;
  data: GridData;
  colWidths: SizeMap;
  rowHeights: SizeMap;
};

// Helper to get column label (0 -> A, 1 -> B, etc.)
const getColLabel = (index: number): string => {
  return String.fromCharCode(65 + index);
};

// Helper to generate sheet name (Sheet1, Sheet2, etc.)
const generateSheetName = (sheets: Sheet[]): string => {
  const existingNames = new Set(sheets.map(s => s.name.toLowerCase()));
  let num = 1;
  while (existingNames.has(`sheet${num}`.toLowerCase())) {
    num++;
  }
  return `Sheet${num}`;
};

export default function App() {
  return (
    <AuthGuard>
      <SpreadsheetApp />
    </AuthGuard>
  );
}

function SpreadsheetApp() {
  const { user } = useTelegramAuthContext();
  const userInitial = user
    ? (user.first_name?.charAt(0) || user.username?.charAt(0) || 'U').toUpperCase()
    : 'U';

  // Sheets State
  const [sheets, setSheets] = useState<Sheet[]>([
    { id: '1', name: 'Sheet1', data: {}, colWidths: {}, rowHeights: {} },
    { id: '2', name: 'Sheet2', data: {}, colWidths: {}, rowHeights: {} }
  ]);
  const [activeSheetId, setActiveSheetId] = useState<string>('1');
  const [showSheetList, setShowSheetList] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [sheetToDelete, setSheetToDelete] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const hamburgerRef = useRef<HTMLDivElement>(null);

  // Get current active sheet
  const activeSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];
  
  // Data State (derived from active sheet)
  const [data, setData] = useState<GridData>(activeSheet.data);
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [editMode, setEditMode] = useState(false);
  const [formulaValue, setFormulaValue] = useState("");

  // Dimensions State (derived from active sheet)
  const [colWidths, setColWidths] = useState<SizeMap>(activeSheet.colWidths);
  const [rowHeights, setRowHeights] = useState<SizeMap>(activeSheet.rowHeights);
  const [resizing, setResizing] = useState<ResizeState>(null);

  // Refs for resizing optimization
  // We use refs to access the latest state inside the global event listener without re-binding it constantly
  const resizingRef = useRef<ResizeState>(null);
  const colWidthsRef = useRef<SizeMap>({});
  const rowHeightsRef = useRef<SizeMap>({});

  // Update refs when state changes
  useEffect(() => { resizingRef.current = resizing; }, [resizing]);
  useEffect(() => { colWidthsRef.current = colWidths; }, [colWidths]);
  useEffect(() => { rowHeightsRef.current = rowHeights; }, [rowHeights]);

  // Sync state when active sheet changes
  useEffect(() => {
    const sheet = sheets.find(s => s.id === activeSheetId);
    if (sheet) {
      setData(sheet.data);
      setColWidths(sheet.colWidths);
      setRowHeights(sheet.rowHeights);
      setSelectedCell(null);
      setEditMode(false);
      setFormulaValue("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheetId]); // Only depend on activeSheetId to avoid loops

  // Save current sheet data when it changes
  useEffect(() => {
    setSheets(prev => {
      const currentSheet = prev.find(s => s.id === activeSheetId);
      if (currentSheet) {
        // Only update if data actually changed
        const dataChanged = JSON.stringify(currentSheet.data) !== JSON.stringify(data);
        const colWidthsChanged = JSON.stringify(currentSheet.colWidths) !== JSON.stringify(colWidths);
        const rowHeightsChanged = JSON.stringify(currentSheet.rowHeights) !== JSON.stringify(rowHeights);
        
        if (dataChanged || colWidthsChanged || rowHeightsChanged) {
          return prev.map(sheet => 
            sheet.id === activeSheetId 
              ? { ...sheet, data, colWidths, rowHeights }
              : sheet
          );
        }
      }
      return prev;
    });
  }, [data, colWidths, rowHeights, activeSheetId]);

  // Update formula bar when selection changes
  useEffect(() => {
    if (selectedCell) {
      const key = `${selectedCell.row}-${selectedCell.col}`;
      setFormulaValue(data[key]?.value || "");
    } else {
      setFormulaValue("");
    }
  }, [selectedCell, data]);

  // Close sheet list dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showSheetList && !target.closest('[data-sheet-list]')) {
        setShowSheetList(false);
        setDropdownPosition(null);
      }
    };

    if (showSheetList) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSheetList]);


  // -- Resizing Logic --

  const startResize = (e: React.MouseEvent, type: 'col' | 'row', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startSize = type === 'col' 
      ? (colWidths[index] || DEFAULT_COL_WIDTH)
      : (rowHeights[index] || DEFAULT_ROW_HEIGHT);

    setResizing({
      type,
      index,
      startPos: type === 'col' ? e.clientX : e.clientY,
      startSize
    });
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    const currentResize = resizingRef.current;
    if (!currentResize) return;

    if (currentResize.type === 'col') {
      const delta = e.clientX - currentResize.startPos;
      const newWidth = Math.max(MIN_COL_WIDTH, currentResize.startSize + delta);
      
      setColWidths(prev => ({
        ...prev,
        [currentResize.index]: newWidth
      }));
    } else {
      const delta = e.clientY - currentResize.startPos;
      const newHeight = Math.max(MIN_ROW_HEIGHT, currentResize.startSize + delta);
      
      setRowHeights(prev => ({
        ...prev,
        [currentResize.index]: newHeight
      }));
    }
  }, []);

  const handleGlobalMouseUp = useCallback(() => {
    setResizing(null);
  }, []);

  // Attach global listeners when resizing
  useEffect(() => {
    if (resizing) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      // Add a cursor style to body to ensure cursor stays consistent even if mouse leaves the handle
      document.body.style.cursor = resizing.type === 'col' ? 'col-resize' : 'row-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [resizing, handleGlobalMouseMove, handleGlobalMouseUp]);


  // -- Cell Interaction Logic --

  const handleCellClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
    setEditMode(false);
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
    setEditMode(true);
  };

  const handleChange = (row: number, col: number, value: string) => {
    const key = `${row}-${col}`;
    setData(prev => ({
      ...prev,
      [key]: { ...prev[key], value }
    }));
    setFormulaValue(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, row: number, col: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setEditMode(false);
      if (row < NUM_ROWS - 1) setSelectedCell({ row: row + 1, col });
    }
  };

  const toggleStyle = (styleKey: keyof CellStyle) => {
    if (!selectedCell) return;
    const key = `${selectedCell.row}-${selectedCell.col}`;
    const currentCell = data[key] || { value: "" };
    const currentStyle = currentCell.style || {};
    
    setData(prev => ({
      ...prev,
      [key]: {
        ...currentCell,
        style: {
          ...currentStyle,
          [styleKey]: !currentStyle[styleKey]
        }
      }
    }));
  };

  // -- Sheet Management Logic --

  const handleSheetClick = (sheetId: string) => {
    setActiveSheetId(sheetId);
  };

  const handleCreateSheet = () => {
    const newSheet: Sheet = {
      id: Date.now().toString(),
      name: generateSheetName(sheets),
      data: {},
      colWidths: {},
      rowHeights: {}
    };
    setSheets(prev => [...prev, newSheet]);
    setActiveSheetId(newSheet.id);
  };

  const handleSheetRightClick = (e: React.MouseEvent, sheetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSheetToDelete(sheetId);
    setShowDeleteModal(true);
  };

  const handleDeleteSheet = () => {
    if (!sheetToDelete || sheets.length <= 1) return; // Can't delete if only one sheet
    
    setSheets(prev => {
      const filtered = prev.filter(s => s.id !== sheetToDelete);
      // If we deleted the active sheet, switch to the first remaining sheet
      if (sheetToDelete === activeSheetId && filtered.length > 0) {
        setActiveSheetId(filtered[0].id);
      }
      return filtered;
    });
    
    setShowDeleteModal(false);
    setSheetToDelete(null);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setSheetToDelete(null);
  };

  return (
    <div className="flex flex-col h-screen bg-white text-sm font-sans">
      {/* 1. Top Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-green-600 p-2 rounded-sm cursor-pointer hover:bg-green-700 transition">
             <Menu className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <input 
              type="text" 
              defaultValue="Untitled spreadsheet" 
              className="text-lg text-gray-700 font-medium focus:outline-none focus:border-b-2 focus:border-green-600 px-1"
            />
            <SyncStatusBadge />
            <div className="flex gap-4 text-xs text-gray-600 mt-1">
              <SheetFileMenu />
              {['Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help'].map(menu => (
                <span key={menu} className="hover:bg-gray-100 px-1 rounded cursor-pointer">{menu}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 hover:bg-gray-100 rounded-full">
            <RotateCcw className="w-5 h-5 text-gray-600" />
          </button>
           <button className="flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-medium hover:bg-blue-200 transition">
            <Share className="w-4 h-4" />
            Share
          </button>
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
            {userInitial}
          </div>
        </div>
      </div>

      {/* 2. Toolbar */}
      <div className="flex items-center gap-1 px-4 py-1 bg-[#edf2fa] rounded-2xl mx-2 my-1 overflow-x-auto">
         <ToolbarButton icon={Undo} />
         <ToolbarButton icon={Redo} />
         <ToolbarButton icon={Printer} />
         <ToolbarButton icon={PaintBucket} />
         <div className="w-px h-6 bg-gray-300 mx-1" />
         <ToolbarButton icon={Bold} onClick={() => toggleStyle('bold')} />
         <ToolbarButton icon={Italic} onClick={() => toggleStyle('italic')} />
         <ToolbarButton icon={Underline} onClick={() => toggleStyle('underline')} />
         <ToolbarButton icon={Type} />
         <div className="w-px h-6 bg-gray-300 mx-1" />
         <ToolbarButton icon={AlignLeft} />
         <ToolbarButton icon={AlignCenter} />
         <ToolbarButton icon={AlignRight} />
         <div className="w-px h-6 bg-gray-300 mx-1" />
         <ToolbarButton icon={LinkIcon} />
         <ToolbarButton icon={Download} />
         <ToolbarButton icon={MoreHorizontal} />
      </div>

      {/* 3. Formula Bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-300 bg-white">
        <div className="text-gray-500 font-bold w-8 text-center bg-gray-100 rounded border border-gray-200">
           fx
        </div>
        <div className="w-px h-6 bg-gray-300 mx-2" />
        <input 
          type="text" 
          value={formulaValue}
          onChange={(e) => {
             setFormulaValue(e.target.value);
             if (selectedCell) handleChange(selectedCell.row, selectedCell.col, e.target.value);
          }}
          className="flex-1 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded border border-transparent hover:border-gray-300 transition"
        />
      </div>

      {/* 4. The Grid */}
      <div className="flex-1 overflow-auto relative bg-gray-100">
        <div className="inline-block min-w-full bg-white relative">
          
          {/* Header Row (A, B, C...) */}
          <div className="flex sticky top-0 z-20 shadow-sm h-6">
            <div className="w-10 flex-shrink-0 bg-[#f8f9fa] border-r border-b border-gray-300 z-30 sticky left-0">
               <div className="w-full h-full bg-gray-200/50" />
            </div>
            {Array.from({ length: NUM_COLS }).map((_, i) => (
              <div 
                key={i} 
                className={`flex-shrink-0 flex items-center justify-center bg-[#f8f9fa] border-r border-b border-gray-300 font-bold text-gray-500 select-none relative group
                  ${selectedCell?.col === i ? 'bg-green-100 text-green-700 border-b-green-500 border-b-2' : ''}
                `}
                style={{ width: colWidths[i] || DEFAULT_COL_WIDTH }}
              >
                {getColLabel(i)}
                {/* Column Resize Handle */}
                <div 
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-green-500 z-40 opacity-0 group-hover:opacity-100 transition-opacity active:opacity-100 active:bg-green-500"
                  onMouseDown={(e) => startResize(e, 'col', i)}
                />
              </div>
            ))}
          </div>

          {/* Grid Rows */}
          {Array.from({ length: NUM_ROWS }).map((_, r) => {
             const rowHeight = rowHeights[r] || DEFAULT_ROW_HEIGHT;
             return (
              <div key={r} className="flex" style={{ height: rowHeight }}>
                {/* Row Number (Sticky Left) */}
                <div 
                  className={`w-10 flex-shrink-0 flex items-center justify-center bg-[#f8f9fa] border-r border-b border-gray-300 font-bold text-gray-500 select-none sticky left-0 z-10 relative group
                    ${selectedCell?.row === r ? 'bg-green-100 text-green-700 border-r-green-500 border-r-2' : ''}
                  `}
                >
                  {r + 1}
                   {/* Row Resize Handle */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-green-500 z-40 opacity-0 group-hover:opacity-100 transition-opacity active:opacity-100 active:bg-green-500"
                    onMouseDown={(e) => startResize(e, 'row', r)}
                  />
                </div>
                
                {/* Cells */}
                {Array.from({ length: NUM_COLS }).map((_, c) => {
                  const key = `${r}-${c}`;
                  const cellData = data[key] || {};
                  const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                  const style = cellData.style || {};
                  const colWidth = colWidths[c] || DEFAULT_COL_WIDTH;

                  return (
                    <div 
                      key={c}
                      onClick={() => handleCellClick(r, c)}
                      onDoubleClick={() => handleCellDoubleClick(r, c)}
                      className={`flex-shrink-0 border-r border-b border-gray-200 relative outline-none cursor-cell text-gray-800
                        ${isSelected ? 'z-10' : ''}
                      `}
                      style={{ width: colWidth }}
                    >
                      {isSelected && (
                        <div className="absolute inset-0 border-2 border-blue-600 pointer-events-none shadow-[0_0_0_1px_rgba(37,99,235,0.2)]" />
                      )}
                      
                      {isSelected && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-600 border border-white cursor-crosshair z-20" />
                      )}

                      {isSelected && editMode ? (
                        <input
                          autoFocus
                          type="text"
                          value={cellData.value || ""}
                          onChange={(e) => handleChange(r, c, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, r, c)}
                          onBlur={() => setEditMode(false)}
                          className="w-full h-full px-1 outline-none text-sm absolute top-0 left-0 z-20"
                          style={{
                             fontWeight: style.bold ? 'bold' : 'normal',
                             fontStyle: style.italic ? 'italic' : 'normal',
                             textDecoration: style.underline ? 'underline' : 'none',
                          }}
                        />
                      ) : (
                        <div className="w-full h-full px-1 overflow-hidden whitespace-nowrap select-none flex items-center"
                             style={{
                               lineHeight: `${rowHeight}px`,
                               fontWeight: style.bold ? 'bold' : 'normal',
                               fontStyle: style.italic ? 'italic' : 'normal',
                               textDecoration: style.underline ? 'underline' : 'none',
                             }}>
                          {cellData.value}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

        </div>
      </div>
      
      {/* 5. Bottom Sheet Tab Bar */}
      <div className="bg-white border-t border-gray-300 px-2 flex items-center gap-2 h-10 overflow-x-auto relative">
        <button 
          onClick={handleCreateSheet}
          className="p-1 hover:bg-gray-100 rounded cursor-pointer flex-shrink-0"
          title="Add sheet"
        >
           <Plus className="w-5 h-5 text-gray-600" />
        </button>
        <div 
          ref={hamburgerRef}
          className="relative flex-shrink-0" 
          data-sheet-list
        >
          <button
            onClick={() => {
              if (hamburgerRef.current) {
                const rect = hamburgerRef.current.getBoundingClientRect();
                setDropdownPosition({
                  top: rect.top - 8, // 8px margin above
                  left: rect.left
                });
              }
              setShowSheetList(!showSheetList);
            }}
            className="p-1 hover:bg-gray-100 rounded cursor-pointer"
            title="Show all sheets"
          >
             <Menu className="w-4 h-4 text-gray-600" />
          </button>
        </div>
        {sheets.map((sheet) => (
          <button
            key={sheet.id}
            onClick={() => handleSheetClick(sheet.id)}
            onContextMenu={(e) => handleSheetRightClick(e, sheet.id)}
            className={`flex items-center px-4 py-1 text-sm rounded cursor-pointer transition flex-shrink-0 ${
              sheet.id === activeSheetId
                ? 'bg-white border-b-2 border-green-600 text-green-700 font-medium shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {sheet.name}
            {sheet.id === activeSheetId && (
              <ChevronDown className="w-3 h-3 ml-2" />
            )}
          </button>
        ))}
      </div>

      {/* Delete Sheet Modal */}
      <DeleteSheetModal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        onConfirm={handleDeleteSheet}
        sheetName={sheets.find(s => s.id === sheetToDelete)?.name || ''}
        canDelete={sheets.length > 1}
      />

      {/* Sheet List Dropdown Portal */}
      {showSheetList && dropdownPosition && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed bg-white border border-gray-300 rounded shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            transform: 'translateY(-100%)',
            marginBottom: '8px',
            zIndex: 9998
          }}
          data-sheet-list
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            {sheets.map((sheet) => (
              <button
                key={sheet.id}
                onClick={() => {
                  handleSheetClick(sheet.id);
                  setShowSheetList(false);
                  setDropdownPosition(null);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                  sheet.id === activeSheetId ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'
                }`}
                data-sheet-list
              >
                <span>{sheet.name}</span>
                {sheet.id === activeSheetId && (
                  <span className="text-green-600">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

type ToolbarButtonProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  onClick?: () => void;
};

function ToolbarButton({ icon: Icon, onClick }: ToolbarButtonProps) {
  return (
    <button onClick={onClick} className="p-1.5 hover:bg-gray-200 rounded my-1 text-gray-700 transition flex-shrink-0">
      <Icon className="w-4 h-4" />
    </button>
  );
}