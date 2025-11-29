import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ChevronDown, 
  Plus, 
  Menu, 
  Search, 
  Share, 
  MoreHorizontal, 
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
  LucideIcon
} from 'lucide-react';

const NUM_ROWS = 100;
const NUM_COLS = 26; // A-Z

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

// Helper to get column label (0 -> A, 1 -> B, etc.)
const getColLabel = (index: number): string => {
  return String.fromCharCode(65 + index);
};

export default function App() {
  // State for the grid data
  // data format: { "0-0": { value: "Text", style: {} } }
  const [data, setData] = useState<GridData>({});
  const [selectedCell, setSelectedCell] = useState<SelectedCell>(null);
  const [editMode, setEditMode] = useState(false);
  const [formulaValue, setFormulaValue] = useState("");

  // Update formula bar when selection changes
  useEffect(() => {
    if (selectedCell) {
      const key = `${selectedCell.row}-${selectedCell.col}`;
      setFormulaValue(data[key]?.value || "");
    } else {
      setFormulaValue("");
    }
  }, [selectedCell, data]);

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
      // Move selection down
      if (row < NUM_ROWS - 1) setSelectedCell({ row: row + 1, col });
    }
  };

  // formatting handlers (mock implementation for visual feedback)
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

  return (
    <div className="flex flex-col h-screen bg-white text-sm font-sans">
      {/* 1. Top Navigation Bar (Green Logo Area) */}
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
            <div className="flex gap-4 text-xs text-gray-600 mt-1">
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">File</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Edit</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">View</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Insert</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Format</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Data</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Tools</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Extensions</span>
              <span className="hover:bg-gray-100 px-1 rounded cursor-pointer">Help</span>
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
            U
          </div>
        </div>
      </div>

      {/* 2. Toolbar (Icons) */}
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
          placeholder=""
        />
      </div>

      {/* 4. The Grid */}
      <div className="flex-1 overflow-auto relative bg-gray-100">
        {/* We use a CSS grid for simplicity in this demo, though real apps use canvas or virtualization */}
        <div className="inline-block min-w-full bg-white relative">
          
          {/* Header Row (A, B, C...) */}
          <div className="flex sticky top-0 z-20 shadow-sm">
            <div className="w-10 flex-shrink-0 bg-[#f8f9fa] border-r border-b border-gray-300 z-30 sticky left-0">
               {/* Corner box */}
               <div className="w-full h-full bg-gray-200/50" />
            </div>
            {Array.from({ length: NUM_COLS }).map((_, i) => (
              <div 
                key={i} 
                className={`w-24 flex-shrink-0 flex items-center justify-center bg-[#f8f9fa] border-r border-b border-gray-300 font-bold text-gray-500 select-none ${selectedCell?.col === i ? 'bg-green-100 text-green-700 border-b-green-500 border-b-2' : ''}`}
              >
                {getColLabel(i)}
              </div>
            ))}
          </div>

          {/* Grid Rows */}
          {Array.from({ length: NUM_ROWS }).map((_, r) => (
            <div key={r} className="flex h-6">
              {/* Row Number (Sticky Left) */}
              <div className={`w-10 flex-shrink-0 flex items-center justify-center bg-[#f8f9fa] border-r border-b border-gray-300 font-bold text-gray-500 select-none sticky left-0 z-10 ${selectedCell?.row === r ? 'bg-green-100 text-green-700 border-r-green-500 border-r-2' : ''}`}>
                {r + 1}
              </div>
              
              {/* Cells */}
              {Array.from({ length: NUM_COLS }).map((_, c) => {
                const key = `${r}-${c}`;
                const cellData = data[key] || {};
                const isSelected = selectedCell?.row === r && selectedCell?.col === c;
                const style = cellData.style || {};

                return (
                  <div 
                    key={c}
                    onClick={() => handleCellClick(r, c)}
                    onDoubleClick={() => handleCellDoubleClick(r, c)}
                    className={`w-24 flex-shrink-0 border-r border-b border-gray-200 relative outline-none cursor-cell text-gray-800
                      ${isSelected ? 'z-10' : ''}
                    `}
                  >
                    {isSelected && (
                      <div className="absolute inset-0 border-2 border-blue-600 pointer-events-none shadow-[0_0_0_1px_rgba(37,99,235,0.2)]" />
                    )}
                    
                    {/* Corner selection handle */}
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
                      <div className="w-full h-full px-1 overflow-hidden whitespace-nowrap leading-6 select-none"
                           style={{
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
          ))}

        </div>
      </div>
      
      {/* 5. Bottom Sheet Tab Bar */}
      <div className="bg-white border-t border-gray-300 px-2 flex items-center gap-2 h-10">
        <div className="p-1 hover:bg-gray-100 rounded cursor-pointer">
           <Plus className="w-5 h-5 text-gray-600" />
        </div>
        <div className="p-1 hover:bg-gray-100 rounded cursor-pointer">
           <Menu className="w-4 h-4 text-gray-600" />
        </div>
        <div className="flex items-center bg-white px-4 py-1 border-b-2 border-green-600 text-green-700 font-medium text-sm shadow-sm cursor-pointer">
           Sheet1
           <ChevronDown className="w-3 h-3 ml-2" />
        </div>
         <div className="flex items-center px-4 py-1 text-gray-600 text-sm hover:bg-gray-100 rounded cursor-pointer">
           Sheet2
        </div>
      </div>
    </div>
  );
}

type ToolbarButtonProps = {
  icon: LucideIcon;
  onClick?: () => void;
};

function ToolbarButton({ icon: Icon, onClick }: ToolbarButtonProps) {
  return (
    <button onClick={onClick} className="p-1.5 hover:bg-gray-200 rounded my-1 text-gray-700 transition flex-shrink-0">
      <Icon className="w-4 h-4" />
    </button>
  );
}