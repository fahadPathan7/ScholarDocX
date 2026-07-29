import { useState, useEffect } from "react";
import { X, ArrowRight, Upload } from "lucide-react";
import { Modal } from "../Modal";
import { parseCSV } from "./sheetCsv";
import type { ColumnDef, ColumnType } from "./sheetModel";

export function CsvImportModal({
  file,
  existingColumns,
  recordsPerSheetLimit,
  currentRowsCount,
  onClose,
  onImport,
}: {
  file: File;
  existingColumns: ColumnDef[];
  recordsPerSheetLimit: number;
  currentRowsCount: number;
  onClose: () => void;
  onImport: (newRows: Record<string, string>[], newCols: ColumnDef[]) => Promise<void>;
}) {
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({}); // csvHeader -> sheetColName or '__NEW__' or '__SKIP__'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        setError("Failed to read file.");
        setLoading(false);
        return;
      }
      try {
        const rows = parseCSV(text);
        if (rows.length < 1) {
          setError("CSV file is empty.");
          setLoading(false);
          return;
        }
        
        // Ensure all rows have the same length as headers
        const headers = rows[0].map(h => h.trim());
        const dataRows = rows.slice(1).filter(r => r.some(cell => cell.trim() !== ''));

        setCsvHeaders(headers);
        setCsvData(dataRows);

        // Auto-map logic
        const initialMapping: Record<string, string> = {};
        for (const h of headers) {
          const match = existingColumns.find(c => c.name.toLowerCase() === h.toLowerCase());
          if (match) {
            initialMapping[h] = match.name;
          } else {
            initialMapping[h] = '__SKIP__'; // Default to skip, user can change to __NEW__
          }
        }
        setColumnMapping(initialMapping);
      } catch (err: any) {
        setError("Error parsing CSV: " + err.message);
      }
      setLoading(false);
    };
    reader.readAsText(file);
  }, [file, existingColumns]);

  const handleImport = async () => {
    if (csvData.length === 0) return;
    setImporting(true);

    const remainingQuota = recordsPerSheetLimit - currentRowsCount;
    if (recordsPerSheetLimit !== -1 && csvData.length > remainingQuota) {
      setError(`Cannot import ${csvData.length} rows. Only ${remainingQuota} remaining in your quota.`);
      setImporting(false);
      return;
    }

    try {
      const newCols: ColumnDef[] = [];
      const newRows: Record<string, string>[] = [];

      // Determine which new columns to create
      for (const h of csvHeaders) {
        if (columnMapping[h] === '__NEW__') {
          // Check if name already exists to avoid collisions
          let colName = h;
          let counter = 1;
          while (existingColumns.some(c => c.name === colName) || newCols.some(c => c.name === colName)) {
            colName = `${h} ${counter}`;
            counter++;
          }
          newCols.push({ name: colName, type: "text", width: 150 });
          // Update mapping to reflect the actual new name
          columnMapping[h] = colName;
        }
      }

      for (const csvRow of csvData) {
        const mappedRow: Record<string, string> = {};
        csvHeaders.forEach((h, idx) => {
          const targetCol = columnMapping[h];
          if (targetCol && targetCol !== '__SKIP__') {
            mappedRow[targetCol] = csvRow[idx] || "";
          }
        });
        if (Object.keys(mappedRow).length > 0) {
          newRows.push(mappedRow);
        }
      }

      await onImport(newRows, newCols);
      onClose();
    } catch (err: any) {
      setError("Import failed: " + err.message);
      setImporting(false);
    }
  };

  const remainingQuota = recordsPerSheetLimit !== -1 ? recordsPerSheetLimit - currentRowsCount : Infinity;
  const isOverQuota = csvData.length > remainingQuota;

  return (
    <Modal onClose={() => { if (!importing) onClose(); }}>
      <div
        className="modal-panel"
        style={{ width: '600px', maxWidth: '90vw' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Import CSV</h2>
          <button className="icon-button" onClick={onClose} disabled={importing}><X size={20} /></button>
        </div>
        
        <div className="modal-content">
          {loading ? (
            <p>Parsing CSV file...</p>
          ) : error ? (
            <div className="error-message" style={{ color: 'var(--danger)', padding: '12px', background: 'rgba(var(--danger-rgb), 0.1)', borderRadius: '6px' }}>
              {error}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '13px' }}>
                <p>Found <strong>{csvData.length}</strong> rows and <strong>{csvHeaders.length}</strong> columns.</p>
                {recordsPerSheetLimit !== -1 && (
                  <p style={{ color: isOverQuota ? 'var(--danger)' : 'var(--text-secondary)', marginTop: '4px' }}>
                    Quota: {currentRowsCount} / {recordsPerSheetLimit} rows used.
                    {isOverQuota && <strong> Cannot import more than {remainingQuota} rows.</strong>}
                  </p>
                )}
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--bg-secondary)' }}>
                    <tr>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>CSV Column</th>
                      <th style={{ padding: '8px 12px', width: '30px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}></th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Sheet Column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvHeaders.map(h => (
                      <tr key={h}>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>{h}</td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <ArrowRight size={14} />
                        </td>
                        <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                          <select 
                            value={columnMapping[h]} 
                            onChange={(e) => setColumnMapping({ ...columnMapping, [h]: e.target.value })}
                            style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--border)' }}
                          >
                            <option value="__SKIP__">-- Skip --</option>
                            <option value="__NEW__">+ Create as new Text column</option>
                            <optgroup label="Existing Columns">
                              {existingColumns.filter(c => c.type !== 'group').map(c => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>
        
        <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="secondary" onClick={onClose} disabled={importing}>Cancel</button>
          <button 
            className="primary" 
            onClick={handleImport} 
            disabled={loading || !!error || isOverQuota || importing || csvData.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={16} />
            {importing ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
