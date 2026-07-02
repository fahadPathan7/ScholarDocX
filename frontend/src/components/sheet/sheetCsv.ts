/* ------------------------------------------------------------------ */
/*  CSV Utilities for Sheet                                            */
/* ------------------------------------------------------------------ */

export function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  // Ensure trailing newline
  if (!text.endsWith('\n')) {
    text += '\n';
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentVal);
        currentVal = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip LF
        }
        row.push(currentVal);
        result.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  // Remove trailing empty row if present (common in CSVs)
  if (result.length > 0 && result[result.length - 1].length === 1 && result[result.length - 1][0] === '') {
    result.pop();
  }

  return result;
}

export function formatCSV(rows: string[][]): string {
  return rows.map(row => {
    return row.map(val => {
      if (val === undefined || val === null) return '';
      
      const strVal = String(val);
      // Escape if contains comma, newline, or quotes
      if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('\r') || strVal.includes('"')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    }).join(',');
  }).join('\n');
}
