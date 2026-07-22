import React, { useMemo } from 'react';
import type { ColumnDef } from './sheetModel';
import { Calendar, CheckCircle, BarChart2, PieChart } from 'lucide-react';

export function SheetFooter({
  columns,
  rows,
  viewRows,
  fullScreenMode,
  recordsPerSheetLimit = 0
}: {
  columns: ColumnDef[];
  rows: Record<string, string>[];
  viewRows: Record<string, string>[];
  fullScreenMode: boolean;
  recordsPerSheetLimit?: number;
}) {
  const metrics = useMemo<{
    countDisplay: string;
    statusCol?: ColumnDef;
    statusCounts: Record<string, number>;
    nextDate: { val: string; colName: string } | null;
    completionMetric: { name: string; pct: number } | null;
  }>(() => {
    // 1. Record Count
    const totalCount = rows.length;
    const viewCount = viewRows.length;
    const countDisplay = viewCount === totalCount ? `${totalCount} records` : `${viewCount} / ${totalCount} records`;

    // 2. Status Breakdown
    // Look for a column that sounds like a status (select type, named 'Status', 'Stage', etc)
    const statusCol = columns.find(c => c.type === 'select' && (c.name.toLowerCase().includes('status') || c.name.toLowerCase().includes('stage')));
    const statusCounts: Record<string, number> = {};
    if (statusCol) {
      viewRows.forEach(r => {
        const val = r[statusCol.name];
        if (val) {
          statusCounts[val] = (statusCounts[val] || 0) + 1;
        }
      });
    }

    // 3. Next Date
    const dateCols = columns.filter(c => c.type === 'date');
    let nextDate: { val: string; colName: string } | null = null;
    let nextDateObj: Date | null = null;
    
    if (dateCols.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      viewRows.forEach(r => {
        dateCols.forEach(dc => {
          const val = r[dc.name];
          if (val) {
            const d = new Date(val);
            if (!isNaN(d.getTime()) && d >= today) {
              if (!nextDateObj || d < nextDateObj) {
                nextDateObj = d;
                nextDate = { val, colName: dc.name };
              }
            }
          }
        });
      });
    }

    // 4. Completion %
    // Look for bool columns or completion indicators
    const boolCols = columns.filter(c => c.type === 'bool');
    let completionMetric: { name: string; pct: number } | null = null;
    
    if (boolCols.length > 0 && viewRows.length > 0) {
      // Pick the first bool col to use as completion
      const bCol = boolCols[0];
      const trueCount = viewRows.filter(r => {
        const v = r[bCol.name];
        return v === 'Yes' || v === 'true' || v === '1';
      }).length;
      completionMetric = {
        name: bCol.name,
        pct: Math.round((trueCount / viewRows.length) * 100)
      };
    }

    return {
      countDisplay,
      statusCol,
      statusCounts,
      nextDate,
      completionMetric
    };
  }, [columns, rows, viewRows]);

  if (rows.length === 0) return null;

  return (
    <div 
      className="sheet-footer" 
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: fullScreenMode ? '6px 12px' : '8px 16px',
        backgroundColor: 'var(--bg)',
        border: '1px solid var(--border)',
        borderTop: 'none',
        borderBottomLeftRadius: fullScreenMode ? '0' : '8px',
        borderBottomRightRadius: fullScreenMode ? '0' : '8px',
        fontSize: fullScreenMode ? '11px' : '12px',
        color: 'var(--text-secondary)',
        gap: '16px',
        flexWrap: 'wrap'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BarChart2 size={14} />
        <span style={{ fontWeight: 600 }}>{metrics.countDisplay}</span>
      </div>

      {metrics.completionMetric && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle size={14} color={metrics.completionMetric.pct === 100 ? 'var(--success)' : 'var(--text-secondary)'} />
          <span>{metrics.completionMetric.name}: <strong>{metrics.completionMetric.pct}%</strong></span>
        </div>
      )}

      {metrics.nextDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={14} />
          <span>Next {metrics.nextDate.colName}: <strong>{metrics.nextDate.val}</strong></span>
        </div>
      )}

      {metrics.statusCol && Object.keys(metrics.statusCounts).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: recordsPerSheetLimit > 0 ? '0' : 'auto' }}>
          <PieChart size={14} />
          <div style={{ display: 'flex', gap: '6px' }}>
            {Object.entries(metrics.statusCounts)
              .sort((a, b) => b[1] - a[1]) // sort by count desc
              .slice(0, 3) // max 3 status chips
              .map(([status, count]) => (
              <span key={status} style={{
                background: 'var(--bg-secondary)',
                padding: '2px 6px',
                borderRadius: '12px',
                fontSize: '11px',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {status} <span style={{ opacity: 0.7 }}>{count}</span>
              </span>
            ))}
            {Object.keys(metrics.statusCounts).length > 3 && (
              <span style={{ fontSize: '11px', alignSelf: 'center' }}>+{Object.keys(metrics.statusCounts).length - 3} more</span>
            )}
          </div>
        </div>
      )}

      {recordsPerSheetLimit > 0 && (() => {
        const used = rows.length;
        const max = recordsPerSheetLimit;
        const pct = Math.min(100, Math.round((used / max) * 100));
        const isNear = pct >= 80;
        const isFull = pct >= 100;
        const isFiltering = viewRows.length !== rows.length;
        return (
          <div className="sheet-toolbar-quota" style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '80px', width: 'auto', marginLeft: 'auto', alignItems: 'flex-end', flexShrink: 0 }}>
            <span className={`toolbar-quota-label${isFull ? ' quota-full' : isNear ? ' quota-near' : ''}`} style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {isFiltering ? `${viewRows.length} of ${used}` : `${used} / ${max}`} records
            </span>
            <div className="quota-bar quota-bar-slim" title={`${used} of ${max} records used`} style={{ width: '100%', height: '4px', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                className={`quota-bar-fill${isFull ? ' full' : isNear ? ' near' : ''}`}
                style={{ width: `${pct}%`, height: '100%', backgroundColor: isFull ? 'var(--danger)' : isNear ? 'var(--warning)' : 'var(--primary)' }}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
