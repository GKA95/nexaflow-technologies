import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

interface StructuredListEditorProps {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyHint?: string;
}

export function StructuredListEditor({
  label,
  items,
  onChange,
  placeholder = 'Add an item and press Enter...',
  emptyHint = 'No items added yet.',
}: StructuredListEditorProps) {
  const [draft, setDraft] = useState('');

  const addDraft = () => {
    const lines = draft
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    onChange([...items, ...lines]);
    setDraft('');
  };

  const updateAt = (idx: number, val: string) => {
    const next = [...items];
    next[idx] = val;
    onChange(next);
  };

  const removeAt = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs font-medium text-[#070B24] dark:text-[#F7F8FF]">
          {label}
        </label>
        <span className="text-[11px] font-mono tabular-nums text-[#4A5578] dark:text-[#AEB8D4]">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC]/60 dark:bg-[#03051B]/60 px-3 py-2.5 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
          {emptyHint}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              <span className="w-6 text-center text-[11px] font-mono tabular-nums text-[#4A5578] dark:text-[#AEB8D4] shrink-0">
                {idx + 1}.
              </span>
              <input
                type="text"
                value={item}
                onChange={(e) => updateAt(idx, e.target.value)}
                aria-label={`${label} item ${idx + 1}`}
                className="flex-1 min-w-0 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={idx === 0}
                onClick={() => move(idx, -1)}
                title="Move up"
                aria-label={`Move item ${idx + 1} up`}
                className="p-1.5 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4] hover:border-[#176BFF] disabled:opacity-35"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={idx === items.length - 1}
                onClick={() => move(idx, 1)}
                title="Move down"
                aria-label={`Move item ${idx + 1} down`}
                className="p-1.5 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4] hover:border-[#176BFF] disabled:opacity-35"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                title="Remove item"
                aria-label={`Remove item ${idx + 1}`}
                className="p-1.5 rounded-md border border-red-500/30 text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            if (pasted.includes('\n')) {
              e.preventDefault();
              const lines = pasted
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean);
              if (lines.length > 0) {
                onChange([...items, ...lines]);
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder={placeholder}
          className="flex-1 min-w-0 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-[#176BFF] px-3 py-2 text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:bg-[#176BFF]/10 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}
