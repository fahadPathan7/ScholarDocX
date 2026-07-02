import React from "react";
import { X, ExternalLink, Edit } from "lucide-react";
import type { ColumnDef } from "./sheetModel";
import type { RecordMap } from "../../lib/api";

export function RowPeekPanel({
  row,
  columns,
  files,
  onClose,
  onEdit
}: {
  row: Record<string, string>;
  columns: ColumnDef[];
  files: RecordMap[];
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="sheet-peek-panel-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.1)', zIndex: 1000,
      display: 'flex', justifyContent: 'flex-end'
    }}>
      <div 
        className="sheet-peek-panel" 
        onClick={e => e.stopPropagation()}
        style={{
          width: '400px',
          height: '100%',
          backgroundColor: 'var(--bg-primary)',
          boxShadow: '-4px 0 15px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)'
        }}
      >
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px' }}>Record Details</h3>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Read-only preview</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="secondary compact" onClick={onEdit} title="Jump to edit">
              <Edit size={14} style={{ marginRight: '4px' }} /> Edit
            </button>
            <button className="icon-button compact" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {columns.map(col => {
              const val = row[col.name];
              if (!val && col.type !== 'bool') return null;

              let displayVal: React.ReactNode = val;

              if (col.type === 'url' && val) {
                displayVal = (
                  <a href={val} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--ui-brand)' }}>
                    {val} <ExternalLink size={12} />
                  </a>
                );
              } else if (col.type === 'file' && val) {
                const parts = val.split(', ').filter(Boolean);
                displayVal = (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {parts.map(part => {
                      const fileName = part.split(' (')[0];
                      return <span key={part} style={{ fontSize: '13px', backgroundColor: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}>{fileName}</span>;
                    })}
                  </div>
                );
              } else if (col.type === 'bool') {
                displayVal = (
                  <span style={{ 
                    fontSize: '12px', 
                    padding: '2px 8px', 
                    borderRadius: '12px', 
                    backgroundColor: val === 'Yes' ? 'var(--success)' : 'var(--bg-secondary)',
                    color: val === 'Yes' ? 'white' : 'var(--text-primary)'
                  }}>
                    {val || 'No'}
                  </span>
                );
              } else if (col.type === 'select' && val) {
                displayVal = (
                  <span style={{ 
                    fontSize: '13px', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)'
                  }}>
                    {val}
                  </span>
                );
              }

              return (
                <div key={col.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{col.name}</div>
                  <div style={{ fontSize: '14px', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {displayVal}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
