/* ------------------------------------------------------------------ */
/*  FilterMenu — per-column filter popup content                       */
/* ------------------------------------------------------------------ */

import { useState } from "react";
import { X } from "lucide-react";
import type { ColumnDef } from "./sheetModel";
import { ColumnFilter, DateFilterPreset, DATE_PRESET_LABELS } from "./sheetFilters";

export function FilterMenuContent({
  col,
  currentFilter,
  valueOptions,
  onApply,
  onClear,
  onClose
}: {
  col: ColumnDef;
  currentFilter?: ColumnFilter;
  /** Checklist choices for select/bool columns (options ∪ values present in rows). */
  valueOptions: string[];
  onApply: (f: ColumnFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [textVal, setTextVal] = useState(currentFilter?.kind === 'text' ? currentFilter.contains : "");
  const [numMin, setNumMin] = useState(currentFilter?.kind === 'number' ? (currentFilter.min?.toString() || "") : "");
  const [numMax, setNumMax] = useState(currentFilter?.kind === 'number' ? (currentFilter.max?.toString() || "") : "");

  const [selValues, setSelValues] = useState<Set<string>>(
    currentFilter?.kind === 'values' ? new Set(currentFilter.values) : new Set()
  );

  const [dateMode, setDateMode] = useState<DateFilterPreset | "range">(
    currentFilter?.kind === 'dateRange' ? "range"
      : currentFilter?.kind === 'datePreset' ? currentFilter.preset : "next7"
  );
  const [rangeFrom, setRangeFrom] = useState(currentFilter?.kind === 'dateRange' ? (currentFilter.from || "") : "");
  const [rangeTo, setRangeTo] = useState(currentFilter?.kind === 'dateRange' ? (currentFilter.to || "") : "");

  const handleApply = () => {
    if (col.type === 'number') {
      const min = numMin ? parseFloat(numMin) : undefined;
      const max = numMax ? parseFloat(numMax) : undefined;
      onApply({ column: col.name, type: col.type, kind: 'number', min, max });
    } else if (col.type === 'select' || col.type === 'bool') {
      onApply({ column: col.name, type: col.type, kind: 'values', values: selValues });
    } else if (col.type === 'date') {
      if (dateMode === "range") {
        onApply({ column: col.name, type: col.type, kind: 'dateRange', from: rangeFrom || undefined, to: rangeTo || undefined });
      } else {
        onApply({ column: col.name, type: col.type, kind: 'datePreset', preset: dateMode });
      }
    } else {
      onApply({ column: col.name, type: col.type, kind: 'text', contains: textVal });
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>Filter {col.name}</div>
        <button className="icon-button" onClick={onClose} style={{ padding: '2px', margin: '-4px' }} title="Close">
          <X size={14} />
        </button>
      </div>

      {col.type === 'number' ? (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="number" placeholder="Min" value={numMin} onChange={e => setNumMin(e.target.value)} style={{ width: '80px', padding: '4px' }} />
          <span>-</span>
          <input type="number" placeholder="Max" value={numMax} onChange={e => setNumMax(e.target.value)} style={{ width: '80px', padding: '4px' }} />
        </div>
      ) : col.type === 'select' || col.type === 'bool' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
          {valueOptions.length === 0 ? (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No values yet.</span>
          ) : valueOptions.map(opt => (
            <label key={opt} style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={selValues.has(opt)}
                onChange={(e) => {
                  const next = new Set(selValues);
                  if (e.target.checked) next.add(opt); else next.delete(opt);
                  setSelValues(next);
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      ) : col.type === 'date' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
          {DATE_PRESET_LABELS.map(preset => (
            <label key={preset.value} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="radio"
                name={`date-filter-${col.name}`}
                checked={dateMode === preset.value}
                onChange={() => setDateMode(preset.value)}
              />
              {preset.label}
            </label>
          ))}
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="radio"
              name={`date-filter-${col.name}`}
              checked={dateMode === "range"}
              onChange={() => setDateMode("range")}
            />
            Custom range
          </label>
          {dateMode === "range" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '22px' }}>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'space-between' }}>
                From
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={{ padding: '3px' }} />
              </label>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'space-between' }}>
                To
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={{ padding: '3px' }} />
              </label>
            </div>
          )}
        </div>
      ) : (
        <input
          type="text"
          placeholder="Contains text..."
          value={textVal}
          onChange={e => setTextVal(e.target.value)}
          style={{ padding: '6px', width: '100%', boxSizing: 'border-box' }}
          onKeyDown={e => { if (e.key === 'Enter') handleApply(); }}
          autoFocus
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
        <button className="text-button danger" onClick={onClear} style={{ fontSize: '12px', padding: '4px 8px' }}>Clear</button>
        <button className="primary" onClick={handleApply} style={{ fontSize: '12px', padding: '0 14px', height: '28px', minHeight: '28px', borderRadius: '6px' }}>Apply</button>
      </div>
    </>
  );
}
