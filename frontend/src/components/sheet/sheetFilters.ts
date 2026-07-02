/* ------------------------------------------------------------------ */
/*  sheetFilters — sort comparators, filter predicates, search match   */
/* ------------------------------------------------------------------ */

import type { ColumnDef, ColumnType } from "./sheetModel";

/* ------------------------------------------------------------------ */
/*  Sort direction                                                     */
/* ------------------------------------------------------------------ */

export type SortDirection = "asc" | "desc" | "off";

export type SortState = {
  column: string;
  direction: SortDirection;
};

export type SheetView = {
  id: string;
  name: string;
  sortState: SortState;
  filters: ColumnFilter[];
  searchQuery: string;
  hiddenColumns: string[];
  groupBy: string | null;
};

/* ------------------------------------------------------------------ */
/*  Type-aware sort comparators                                        */
/* ------------------------------------------------------------------ */

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNumber(a: string, b: string): number {
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (isNaN(numA) && isNaN(numB)) return 0;
  if (isNaN(numA)) return 1;  // empties last
  if (isNaN(numB)) return -1;
  return numA - numB;
}

function compareDate(a: string, b: string): number {
  const dateA = a ? new Date(a).getTime() : NaN;
  const dateB = b ? new Date(b).getTime() : NaN;
  if (isNaN(dateA) && isNaN(dateB)) return 0;
  if (isNaN(dateA)) return 1;
  if (isNaN(dateB)) return -1;
  return dateA - dateB;
}

function compareBool(a: string, b: string): number {
  const boolA = a === "true" || a === "1" || a.toLowerCase() === "yes" ? 1 : 0;
  const boolB = b === "true" || b === "1" || b.toLowerCase() === "yes" ? 1 : 0;
  return boolA - boolB;
}

function getComparator(type: ColumnType): (a: string, b: string) => number {
  switch (type) {
    case "number": return compareNumber;
    case "date": return compareDate;
    case "bool": return compareBool;
    default: return compareText;
  }
}

/** Sort rows by a column. Empty values always sort last. */
export function sortRows(
  rows: Record<string, string>[],
  sort: SortState,
  columns: ColumnDef[]
): Record<string, string>[] {
  if (sort.direction === "off") return rows;
  
  const colDef = columns.find(c => c.name === sort.column);
  if (!colDef) return rows;

  const comparator = getComparator(colDef.type);
  const multiplier = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const valA = (a[sort.column] || "").trim();
    const valB = (b[sort.column] || "").trim();

    // Empty values always last regardless of direction
    if (!valA && !valB) return 0;
    if (!valA) return 1;
    if (!valB) return -1;

    return comparator(valA, valB) * multiplier;
  });
}

/** Cycle sort direction: off → asc → desc → off */
export function nextSortDirection(current: SortDirection): SortDirection {
  if (current === "off") return "asc";
  if (current === "asc") return "desc";
  return "off";
}

/* ------------------------------------------------------------------ */
/*  Per-column filter predicates                                       */
/* ------------------------------------------------------------------ */

export type ColumnFilter = {
  column: string;
  type: ColumnType;
} & (
  | { kind: "values"; values: Set<string> }        // select, bool
  | { kind: "text"; contains: string }              // text, url
  | { kind: "number"; min?: number; max?: number }  // number
  | { kind: "datePreset"; preset: DateFilterPreset } // date
  | { kind: "dateRange"; from?: string; to?: string } // date custom range
);

export type DateFilterPreset = "overdue" | "next3" | "next7" | "next30" | "all";

export const DATE_PRESET_LABELS: { value: DateFilterPreset; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "next3", label: "Next 3 days" },
  { value: "next7", label: "Next 7 days" },
  { value: "next30", label: "Next 30 days" },
];

/** Short human label for an active filter chip. */
export function filterSummary(filter: ColumnFilter): string {
  switch (filter.kind) {
    case "values":
      return filter.values.size === 0 ? "any" : Array.from(filter.values).slice(0, 2).join(", ") + (filter.values.size > 2 ? ` +${filter.values.size - 2}` : "");
    case "text":
      return filter.contains ? `contains "${filter.contains}"` : "any";
    case "number": {
      if (filter.min !== undefined && filter.max !== undefined) return `${filter.min}–${filter.max}`;
      if (filter.min !== undefined) return `≥ ${filter.min}`;
      if (filter.max !== undefined) return `≤ ${filter.max}`;
      return "any";
    }
    case "datePreset":
      return DATE_PRESET_LABELS.find(p => p.value === filter.preset)?.label || filter.preset;
    case "dateRange": {
      if (filter.from && filter.to) return `${filter.from} → ${filter.to}`;
      if (filter.from) return `from ${filter.from}`;
      if (filter.to) return `until ${filter.to}`;
      return "any";
    }
  }
}

function matchesFilter(value: string, filter: ColumnFilter): boolean {
  const trimmed = (value || "").trim();

  switch (filter.kind) {
    case "values":
      return filter.values.size === 0 || filter.values.has(trimmed);

    case "text":
      if (!filter.contains) return true;
      return trimmed.toLowerCase().includes(filter.contains.toLowerCase());

    case "number": {
      if (!trimmed) return true;
      const num = parseFloat(trimmed);
      if (isNaN(num)) return false;
      if (filter.min !== undefined && num < filter.min) return false;
      if (filter.max !== undefined && num > filter.max) return false;
      return true;
    }

    case "datePreset": {
      if (filter.preset === "all") return true;
      if (!trimmed) return filter.preset !== "overdue";
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return true;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      switch (filter.preset) {
        case "overdue": return diffDays < 0;
        case "next3": return diffDays >= 0 && diffDays <= 3;
        case "next7": return diffDays >= 0 && diffDays <= 7;
        case "next30": return diffDays >= 0 && diffDays <= 30;
        default: return true;
      }
    }

    case "dateRange": {
      if (!trimmed) return false;
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return false;
      if (filter.from) {
        const from = new Date(filter.from);
        if (!isNaN(from.getTime()) && d < from) return false;
      }
      if (filter.to) {
        const to = new Date(filter.to);
        // include the whole "to" day
        to.setHours(23, 59, 59, 999);
        if (!isNaN(to.getTime()) && d > to) return false;
      }
      return true;
    }
  }
}

export function filterRows(
  rows: Record<string, string>[],
  filters: ColumnFilter[]
): Record<string, string>[] {
  if (filters.length === 0) return rows;
  return rows.filter(row =>
    filters.every(f => matchesFilter(row[f.column] || "", f))
  );
}

/* ------------------------------------------------------------------ */
/*  Quick search                                                       */
/* ------------------------------------------------------------------ */

export function searchRows(
  rows: Record<string, string>[],
  query: string,
  columns: ColumnDef[]
): Record<string, string>[] {
  if (!query.trim()) return rows;
  const q = query.trim().toLowerCase();
  const visibleCols = columns.filter(c => c.type !== "group");
  return rows.filter(row =>
    visibleCols.some(col => (row[col.name] || "").toLowerCase().includes(q))
  );
}

/** Check if a cell value matches the search query (for highlight). */
export function cellMatchesSearch(value: string, query: string): boolean {
  if (!query.trim()) return false;
  return (value || "").toLowerCase().includes(query.trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Combined view pipeline: search → filter → sort                     */
/* ------------------------------------------------------------------ */

export function applyViewState(
  rows: Record<string, string>[],
  search: string,
  filters: ColumnFilter[],
  sort: SortState,
  groupBy: string | null,
  columns: ColumnDef[]
): { viewRows: Record<string, string>[]; totalCount: number; filteredCount: number } {
  const totalCount = rows.length;
  let viewRows = searchRows(rows, search, columns);
  viewRows = filterRows(viewRows, filters);
  const filteredCount = viewRows.length;
  
  // Sort rows based on the explicit sort state
  viewRows = sortRows(viewRows, sort, columns);
  
  // If grouped, we sort by the groupBy column FIRST to ensure groups are contiguous.
  // We use stable sort principles (by sorting again here on top of the original sort)
  if (groupBy) {
    const groupSortState: SortState = { column: groupBy, direction: "asc" };
    viewRows = sortRows(viewRows, groupSortState, columns);
  }

  return { viewRows, totalCount, filteredCount };
}
