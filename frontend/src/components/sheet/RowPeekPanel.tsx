import React, { useEffect } from "react";
import { X, ExternalLink, Edit, ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "../Modal";
import type { ColumnDef } from "./sheetModel";
import type { RecordMap } from "../../lib/api";

export function RowPeekPanel({
  row,
  columns,
  files,
  onClose,
  onEdit,
  position,
  onStep,
}: {
  row: Record<string, string>;
  columns: ColumnDef[];
  files: RecordMap[];
  onClose: () => void;
  onEdit: () => void;
  /** 1-based position within the current view, for "3 of 24". */
  position?: { index: number; total: number };
  /** Step to the previous/next row without closing (SCHOLARDOCX-0203).
   *  Reviewing a list means moving through it; closing and reopening the
   *  panel for every row turns a scan into a chore. */
  onStep?: (delta: number) => void;
}) {
  useEffect(() => {
    if (!onStep) return;
    const onKey = (event: KeyboardEvent) => {
      // Left/right rather than up/down: the arrows that move between cells
      // in the grid should not also move between records here.
      if (event.key === "ArrowLeft") { event.preventDefault(); onStep(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); onStep(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStep]);
  // The peek panel shows plain default values — no cell formatting.
  const renderValue = (col: ColumnDef): React.ReactNode => {
    const val = row[col.name];

    if (col.type === 'url' && val) {
      return (
        <a href={val} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--ui-brand)' }}>
          {val} <ExternalLink size={13} />
        </a>
      );
    } else if (col.type === 'file' && val) {
      const parts = val.split(', ').filter(Boolean);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {parts.map(part => {
            const fileName = part.split(' (')[0];
            return <span key={part} style={{ fontSize: '13px', backgroundColor: 'var(--bg-secondary)', padding: '3px 8px', borderRadius: '4px', width: 'fit-content' }}>{fileName}</span>;
          })}
        </div>
      );
    } else if (col.type === 'bool') {
      return (
        <span style={{
          fontSize: '12px',
          padding: '3px 10px',
          borderRadius: '12px',
          backgroundColor: val === 'Yes' ? 'var(--success)' : 'var(--bg-secondary)',
          color: val === 'Yes' ? 'white' : 'var(--text-primary)'
        }}>
          {val || 'No'}
        </span>
      );
    } else if (col.type === 'select' && val) {
      return (
        <span style={{
          fontSize: '13px',
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)'
        }}>
          {val}
        </span>
      );
    }
    return <span>{val}</span>;
  };

  /* AGENTS.md names this file as a known offender: it portalled into
     `#sheet-work-surface` and then re-stated position, background, blur and
     z-index inline, so it neither matched the canonical backdrop nor stayed
     in step when that backdrop changed. It now uses <Modal>, which portals
     into `.main-content` and applies `.modal-backdrop-main` — one contract
     for every dialog in the app. */
  return (
    <Modal onClose={onClose}>
      <div
        className="record-peek-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)',
          maxHeight: 'calc(100% - 40px)',
          backgroundColor: 'var(--bg-primary, #fffefb)',
          borderRadius: '16px',
          boxShadow: '0 24px 70px rgba(18,33,31,0.30)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Record Details</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {position ? `Record ${position.index} of ${position.total} · ← → to move` : "Read-only preview"}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onStep && position ? (
              <div className="peek-stepper">
                <button
                  type="button"
                  onClick={() => onStep(-1)}
                  disabled={position.index <= 1}
                  title="Previous record (←)"
                  aria-label="Previous record"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onStep(1)}
                  disabled={position.index >= position.total}
                  title="Next record (→)"
                  aria-label="Next record"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            ) : null}
            <button className="secondary compact" onClick={onEdit} title="Edit this record">
              <Edit size={14} style={{ marginRight: '4px' }} /> Edit
            </button>
            <button className="icon-button compact" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1px',
            backgroundColor: 'rgba(35, 58, 55, 0.08)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}>
            {columns.map(col => {
              const val = row[col.name];
              if (!val && col.type !== 'bool') return null;

              return (
                <div
                  key={col.name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    backgroundColor: 'var(--bg-primary, #fffefb)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{col.name}</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {renderValue(col)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
