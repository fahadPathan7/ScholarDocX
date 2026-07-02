/* ------------------------------------------------------------------ */
/*  useSheetPage — state hook for sheet page data, persistence, CRUD   */
/* ------------------------------------------------------------------ */

import { FormEvent, useEffect, useState } from "react";
import { ColumnDef, ColumnType, migrateColumns, SheetPage } from "./sheetModel";
import { api, listRecords, RecordMap, notify } from "../../lib/api";
import { composeEmailUrl, ComposeProvider } from "../../lib/email";
import { useDialog } from "../DialogProvider";
import { EmailConfig } from "../EmailConfigModal";
import { SortState, ColumnFilter, SheetView, applyViewState, nextSortDirection } from "./sheetFilters";
import { useUndoRedo } from "./sheetUndo";
import { parseTSV, formatTSV } from "./sheetPaste";
import { formatCSV } from "./sheetCsv";

export interface UseSheetPageParams {
  selectedPageId: string;
  selectedPage: SheetPage | undefined;
  selectedProjectId: string;
  onToast?: (message: string) => void;
  refreshSummary: () => Promise<void>;
  files: RecordMap[];
  onFilesChanged?: () => Promise<void>;
}

export function useSheetPage({
  selectedPageId,
  selectedPage,
  selectedProjectId,
  onToast,
  refreshSummary,
  files,
}: UseSheetPageParams) {
  const { showAlert, showConfirm } = useDialog();

  /* ---------------------------------------------------------------- */
  /*  Core sheet data state                                            */
  /* ---------------------------------------------------------------- */

  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const { pushState, undo, redo, canUndo, canRedo, resetHistory } = useUndoRedo({ columns: [], rows: [] });

  /* ---------------------------------------------------------------- */
  /*  View state (search, filter, sort, focus, selection)              */
  /* ---------------------------------------------------------------- */

  const [searchQuery, setSearchQuery] = useState("");
  const [sortState, setSortState] = useState<SortState>({ column: "", direction: "off" });
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  
  const [savedViews, setSavedViews] = useState<SheetView[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);
  
  const [focusedCell, setFocusedCell] = useState<{ rowIndex: number, colName: string } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState<number | null>(null);

  // Derived view data
  const { viewRows, totalCount, filteredCount } = applyViewState(rows, searchQuery, filters, sortState, groupBy, columns);

  /* ---------------------------------------------------------------- */
  /*  Modal state                                                      */
  /* ---------------------------------------------------------------- */

  const [showColumnForm, setShowColumnForm] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showEditColumns, setShowEditColumns] = useState(false);
  const [isEmailConfigOpen, setIsEmailConfigOpen] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Column form state                                                */
  /* ---------------------------------------------------------------- */

  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<ColumnType>("text");
  const [newColColor, setNewColColor] = useState<string>("#2f6d7a");
  const [newColOptions, setNewColOptions] = useState("");
  const [newColGroup, setNewColGroup] = useState("");
  const [newColUnique, setNewColUnique] = useState(false);
  const [tempColumns, setTempColumns] = useState<(ColumnDef & { _originalName?: string })[]>([]);

  /* ---------------------------------------------------------------- */
  /*  Record form state                                                */
  /* ---------------------------------------------------------------- */

  const [recordForm, setRecordForm] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState("");

  /* ---------------------------------------------------------------- */
  /*  Page load effect                                                 */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!selectedPage) {
      setColumns([]);
      setRows([]);
      return;
    }
    const rawCols = selectedPage.columns || JSON.parse(selectedPage.columns_json || "[]");
    const migratedCols = migrateColumns(rawCols);
    const rawRows = selectedPage.rows || JSON.parse(selectedPage.rows_json || "[]");
    setColumns(migratedCols);
    setRows(rawRows);
    resetHistory({ columns: migratedCols, rows: rawRows });

    // Load saved views
    try {
      const viewsData = localStorage.getItem(`scholardock_views_${selectedPageId}`);
      if (viewsData) {
        setSavedViews(JSON.parse(viewsData));
      } else {
        setSavedViews([]);
      }
    } catch (e) {
      console.error("Failed to load views", e);
    }
    
    // Reset view state
    setCurrentViewId(null);
    setSearchQuery("");
    setSortState({ column: "", direction: "off" });
    setFilters([]);
    setGroupBy(null);
    // Note: hiddenColumns are part of `columns` state via `hidden` flag, handled by resetHistory
  }, [selectedPageId, selectedPage?.updated_at]);

  /* ---------------------------------------------------------------- */
  /*  View Persist helpers                                             */
  /* ---------------------------------------------------------------- */

  const handleSaveView = (name: string) => {
    if (!selectedPageId) return;
    const id = "view_" + Date.now();
    const hiddenColumns = columns.filter(c => c.hidden).map(c => c.name);
    
    const newView: SheetView = {
      id,
      name,
      sortState,
      filters,
      searchQuery,
      hiddenColumns,
      groupBy
    };

    const nextViews = [...savedViews, newView];
    setSavedViews(nextViews);
    localStorage.setItem(`scholardock_views_${selectedPageId}`, JSON.stringify(nextViews));
    setCurrentViewId(id);
    onToast?.(`View "${name}" saved.`);
  };

  const handleLoadView = (viewId: string | null) => {
    if (!viewId) {
      // Default view: clear everything
      setCurrentViewId(null);
      setSearchQuery("");
      setSortState({ column: "", direction: "off" });
      setFilters([]);
      setGroupBy(null);
      const nextCols = columns.map(c => ({ ...c, hidden: false }));
      setColumns(nextCols);
      pushState({ columns: nextCols, rows });
      return;
    }

    const view = savedViews.find(v => v.id === viewId);
    if (!view) return;

    setCurrentViewId(view.id);
    setSearchQuery(view.searchQuery || "");
    setSortState(view.sortState || { column: "", direction: "off" });
    setFilters(view.filters || []);
    setGroupBy(view.groupBy || null);

    const hiddenCols = new Set(view.hiddenColumns || []);
    const nextCols = columns.map(c => ({
      ...c,
      hidden: hiddenCols.has(c.name)
    }));
    setColumns(nextCols);
    pushState({ columns: nextCols, rows });
  };

  const handleDeleteView = (viewId: string) => {
    if (!selectedPageId) return;
    const nextViews = savedViews.filter(v => v.id !== viewId);
    setSavedViews(nextViews);
    localStorage.setItem(`scholardock_views_${selectedPageId}`, JSON.stringify(nextViews));
    if (currentViewId === viewId) {
      handleLoadView(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Persist helpers                                                  */
  /* ---------------------------------------------------------------- */

  const persistPage = async (nextColumns: ColumnDef[], nextRows: Record<string, string>[], silent = false) => {
    // Unique combination check
    if (!silent) {
      const uniqueCols = nextColumns.filter(c => c.unique).map(c => c.name);
      if (uniqueCols.length > 0) {
        const combinations = new Set<string>();
        let hasDuplicate = false;
        
        for (const row of nextRows) {
          const combo = uniqueCols.map(col => (row[col] || "").trim().toLowerCase()).join("|");
          if (combo && combo !== "|".repeat(uniqueCols.length - 1)) {
            if (combinations.has(combo)) {
              hasDuplicate = true;
              break;
            }
            combinations.add(combo);
          }
        }
        
        if (hasDuplicate) {
          await showAlert(`Warning: This combination of ${uniqueCols.join(" and ")} already exists in the sheet.`, "Duplicate Found");
        }
      }
    }

    if (!selectedPageId || isSaving) return;
    setIsSaving(true);
    try {
      await api.patch(`/project_pages/${selectedPageId}`, {
        data: { columns_json: nextColumns, rows_json: nextRows }
      });
      if (!silent) {
        onToast?.("Saved.");
      }
      await refreshSummary();
    } catch (error) {
      if (!silent) onToast?.("Save failed. Please try again.");
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const saveEmailConfig = async (config: EmailConfig) => {
    if (!selectedPageId || isSaving) return;
    setIsSaving(true);
    try {
      await api.patch(`/project_pages/${selectedPageId}`, {
        data: { email_config_json: config }
      });
      onToast?.("Email configuration saved.");
      setIsEmailConfigOpen(false);
      await refreshSummary();
    } catch (error) {
      console.error(error);
      onToast?.("Failed to save email config.");
    } finally {
      setIsSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Column CRUD                                                      */
  /* ---------------------------------------------------------------- */

  const addColumn = async (event: FormEvent) => {
    event.preventDefault();
    const clean = newColName.trim().slice(0, 30);
    if (!clean || tempColumns.some((col) => col.name === clean)) return;

    const newCol: ColumnDef = { name: clean, type: newColType };
    if (newColType === "group") {
      newCol.color = newColColor;
    }
    if (newColType === "select" && newColOptions.trim()) {
      newCol.options = newColOptions.split(",").map((opt) => opt.trim()).filter(Boolean);
    }
    if (newColGroup.trim()) {
      newCol.group = newColGroup.trim();
    }
    if (newColUnique && newColType !== "group") {
      newCol.unique = true;
    }
    setTempColumns((current) => [...current, newCol]);

    setNewColName("");
    setNewColType("text");
    setNewColColor("#2f6d7a");
    setNewColOptions("");
    setNewColGroup("");
    setNewColUnique(false);
    setShowColumnForm(false);
  };

  const renameColumn = (index: number, nextName: string) => {
    setTempColumns((current) => current.map((col, i) => (i === index ? { ...col, name: nextName.slice(0, 30) } : col)));
  };

  const updateTempColumn = (index: number, key: string, value: any) => {
    setTempColumns((current) => current.map((col, i) => (i === index ? { ...col, [key]: value } : col)));
  };

  const deleteColumnLocal = async (columnName: string) => {
    const confirmed = await showConfirm(`Are you sure you want to delete the column "${columnName}"? All data in this column will be lost.`, "Delete Column");
    if (!confirmed) return;
    setTempColumns((current) => current.filter((col) => col.name !== columnName));
  };

  const moveColumnUp = (index: number) => {
    if (index === 0) return;
    setTempColumns((current) => {
      const next = [...current];
      const temp = next[index];
      next[index] = next[index - 1];
      next[index - 1] = temp;
      return next;
    });
  };

  const moveColumnDown = (index: number) => {
    if (index === tempColumns.length - 1) return;
    setTempColumns((current) => {
      const next = [...current];
      const temp = next[index];
      next[index] = next[index + 1];
      next[index + 1] = temp;
      return next;
    });
  };

  const openEditColumns = () => {
    setTempColumns(columns.map((col) => ({ ...col, _originalName: col.name })));
    setShowEditColumns(true);
    setShowColumnForm(false);
    setShowRecordForm(false);
  };

  const saveColumnEdits = async (event?: FormEvent) => {
    if (event) event.preventDefault();

    const names = tempColumns.map(c => c.name.trim()).filter(Boolean);
    if (names.length !== tempColumns.length) {
      await showAlert("Column names cannot be empty.", "Invalid Configuration");
      return;
    }
    
    // Check duplicates separately for data columns and groups
    const dataColNames = tempColumns.filter(c => c.type !== "group").map(c => c.name.trim());
    const groupColNames = tempColumns.filter(c => c.type === "group").map(c => c.name.trim());
    
    const dataDuplicates = dataColNames.filter((name, index) => dataColNames.indexOf(name) !== index);
    if (dataDuplicates.length > 0) {
      await showAlert(`Duplicate data column name found: "${dataDuplicates[0]}". Data columns must have unique names so their data doesn't overlap.`, "Duplicate Name");
      return;
    }
    
    const groupDuplicates = groupColNames.filter((name, index) => groupColNames.indexOf(name) !== index);
    if (groupDuplicates.length > 0) {
      await showAlert(`Duplicate group name found: "${groupDuplicates[0]}". Groups must have unique names.`, "Duplicate Name");
      return;
    }

    let nextRows = [...rows];

    tempColumns.forEach((col) => {
      const colName = col.name.trim();
      if (!columns.some(c => c.name === colName)) {
        nextRows = nextRows.map((row) => ({ ...row, [colName]: "" }));
      }
    });

    tempColumns.forEach((col) => {
      if (col._originalName && col.name.trim() !== col._originalName) {
        const oldKey = col._originalName;
        const newKey = col.name.trim();
        nextRows = nextRows.map((row) => {
          const updated = { ...row, [newKey]: row[oldKey] || "" };
          delete updated[oldKey];
          return updated;
        });
      }
    });

    const remainingOriginalNames = new Set(tempColumns.map(c => c._originalName).filter(Boolean));
    columns.forEach((oldCol) => {
      if (!remainingOriginalNames.has(oldCol.name)) {
        nextRows = nextRows.map((row) => {
          const updated = { ...row };
          delete updated[oldCol.name];
          return updated;
        });
      }
    });

    const nextColumns: ColumnDef[] = tempColumns.map(({ _originalName, ...col }) => col);

    pushState({ columns, rows });
    setColumns(nextColumns);
    setRows(nextRows);
    setShowEditColumns(false);
    await persistPage(nextColumns, nextRows);
  };

  /* ---------------------------------------------------------------- */
  /*  Column / row resize                                              */
  /* ---------------------------------------------------------------- */

  const startResizeColumn = (event: React.MouseEvent, columnIndex: number) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columns[columnIndex].width || 150;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const newWidth = Math.max(80, startWidth + dx);
      setColumns((current) =>
        current.map((col, idx) => (idx === columnIndex ? { ...col, width: newWidth } : col))
      );
    };

    const handleMouseUp = async (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      
      const dx = upEvent.clientX - startX;
      if (dx === 0) return;

      const finalWidth = Math.max(80, startWidth + dx);
      const nextColumns = columns.map((col, idx) =>
        idx === columnIndex ? { ...col, width: finalWidth } : col
      );
      pushState({ columns, rows });
      setColumns(nextColumns);
      await persistPage(nextColumns, rows, true);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const startResizeRow = (event: React.MouseEvent, rowIndex: number) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = parseInt(rows[rowIndex]._height || "60", 10);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dy = moveEvent.clientY - startY;
      const newHeight = Math.max(40, startHeight + dy);
      setRows((current) =>
        current.map((row, idx) =>
          idx === rowIndex ? { ...row, _height: String(newHeight) } : row
        )
      );
    };

    const handleMouseUp = async (upEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const dy = upEvent.clientY - startY;
      if (dy === 0) return;

      const finalHeight = Math.max(40, startHeight + dy);
      const nextRows = rows.map((row, idx) =>
        idx === rowIndex ? { ...row, _height: String(finalHeight) } : row
      );
      pushState({ columns, rows });
      setRows(nextRows);
      await persistPage(columns, nextRows, true);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  /* ---------------------------------------------------------------- */
  /*  Record CRUD                                                      */
  /* ---------------------------------------------------------------- */

  const addRow = () => {
    if (columns.length === 0) return;
    setRecordForm(Object.fromEntries(columns.filter(col => col.type !== "group").map((col) => [col.name, ""])));
    setEditingRowIndex(null);
    setShowRecordForm(true);
    setValidationError("");
  };

  const editRow = (index: number) => {
    if (columns.length === 0) return;
    setRecordForm({ ...rows[index] });
    setEditingRowIndex(index);
    setShowRecordForm(true);
    setValidationError("");
  };

  const saveRecord = async (event: FormEvent) => {
    event.preventDefault();
    const hasContent = Object.values(recordForm).some((value) => value.trim() !== "");
    if (!hasContent) {
      setValidationError("Please fill in at least one field.");
      return;
    }
    setValidationError("");
    
    let nextRows: Record<string, string>[];
    if (editingRowIndex !== null) {
      nextRows = [...rows];
      nextRows[editingRowIndex] = recordForm;
    } else {
      nextRows = [...rows, recordForm];
      await notify("record_create", { project_id: Number(selectedProjectId) });
    }
    
    pushState({ columns, rows });
    setRows(nextRows);
    setRecordForm({});
    setEditingRowIndex(null);
    setShowRecordForm(false);
    await persistPage(columns, nextRows);
  };

  const cancelRecord = () => {
    setRecordForm({});
    setShowRecordForm(false);
    setValidationError("");
  };

  const deleteRow = async (rowIndex: number) => {
    const confirmed = await showConfirm("Are you sure you want to delete this record? This cannot be undone.", "Delete Record");
    if (!confirmed) return;
    const nextRows = rows.filter((_, index) => index !== rowIndex);
    await notify("record_delete", { project_id: Number(selectedProjectId) });
    pushState({ columns, rows });
    setRows(nextRows);
    await persistPage(columns, nextRows);
  };

  const saveCellValue = async (rowIndex: number, column: string, value: string) => {
    if (!selectedPageId || isSaving) throw new Error("Sheet is busy.");
    if (rows[rowIndex][column] === value) return; // no-op

    pushState({ columns, rows });
    const nextRows = rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row));
    setRows(nextRows);
    setIsSaving(true);
    try {
      await api.patch(`/project_pages/${selectedPageId}`, {
        data: { columns_json: columns, rows_json: nextRows }
      });
      onToast?.("Cell saved.");
      await refreshSummary();
    } catch (error) {
      setRows(rows);
      onToast?.("Cell save failed. Please try again.");
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Email compose                                                    */
  /* ---------------------------------------------------------------- */

  const openCompose = async (row: Record<string, string>) => {
    const config = selectedPage?.email_config;
    const toCol = config?.toColumn || "Email" || "Professor email";
    const subCol = config?.subjectColumn || "Email subject";
    const bodyCol = config?.bodyColumn || "Email body";
    const attachCols = columns.filter(c => c.type === "file").map(c => c.name);

    const profiles = await api.get<RecordMap[]>("/local_profiles");
    const provider = (profiles[0]?.preferred_email_provider || "gmail") as ComposeProvider;
    
    const to = row[toCol] || row["Professor email"] || "";
    let subject = row[subCol] || "";
    if (!subject && !config?.subjectColumn) {
      subject = `Research inquiry for ${row["Name"] || row["Professor name"] || "Professor"}`;
    }
    const body = row[bodyCol] || "";

    const url = composeEmailUrl(provider, to, subject, body);

    if (selectedProjectId && row["Scheduled send time"]) {
      const attachNames = attachCols.map(col => row[col]).filter(Boolean).map(val => val.split(' (')[0]).join(", ");
      const title = `Scheduled email: ${row["Name"] || row["Professor name"] || to || "Unknown"}`;
      const notifications = await listRecords<RecordMap>("notifications");
      const duplicate = notifications.some((item) =>
        String(item.project_id) === String(selectedProjectId) &&
        item.title === title &&
        item.due_at === row["Scheduled send time"] &&
        item.notification_type === "scheduled-email" &&
        !item.read_at
      );
      if (!duplicate) {
        await notify("scheduled_email", {
          project_id: Number(selectedProjectId),
          sheetName: row["Name"] || row["Professor name"] || to || "Unknown",
          dueAt: row["Scheduled send time"],
          attachmentSummary: attachNames || "No attachments listed"
        });
      }
    }

    if (url.startsWith("mailto:")) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Group toggle                                                     */
  /* ---------------------------------------------------------------- */

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupName]: !(prev[groupName] ?? true) }));
  };

  /* ---------------------------------------------------------------- */
  /*  View State Handlers (Phase 1)                                    */
  /* ---------------------------------------------------------------- */

  const toggleSort = (columnName: string) => {
    if (sortState.column === columnName) {
      setSortState({ column: columnName, direction: nextSortDirection(sortState.direction) });
    } else {
      setSortState({ column: columnName, direction: "asc" });
    }
  };

  const addFilter = (filter: ColumnFilter) => {
    setFilters(prev => {
      const existingIdx = prev.findIndex(f => f.column === filter.column);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = filter;
        return next;
      }
      return [...prev, filter];
    });
  };

  const removeFilter = (columnName: string) => {
    setFilters(prev => prev.filter(f => f.column !== columnName));
  };

  const clearFilters = () => {
    setFilters([]);
    setSearchQuery("");
  };

  const toggleColumnVisibility = async (columnName: string) => {
    const nextColumns = columns.map(c => 
      c.name === columnName ? { ...c, hidden: !c.hidden } : c
    );
    pushState({ columns, rows });
    setColumns(nextColumns);
    await persistPage(nextColumns, rows, true);
  };

  const reorderColumn = async (dragIndex: number, hoverIndex: number) => {
    const nextColumns = [...columns];
    const [removed] = nextColumns.splice(dragIndex, 1);
    nextColumns.splice(hoverIndex, 0, removed);
    pushState({ columns, rows });
    setColumns(nextColumns);
    await persistPage(nextColumns, rows, true);
  };

  /* ---------------------------------------------------------------- */
  /*  Undo / Redo Integrations                                         */
  /* ---------------------------------------------------------------- */

  const handleUndo = async () => {
    const snap = undo();
    if (snap) {
      setColumns(snap.columns);
      setRows(snap.rows);
      await persistPage(snap.columns, snap.rows, true);
    }
  };

  const handleRedo = async () => {
    const snap = redo();
    if (snap) {
      setColumns(snap.columns);
      setRows(snap.rows);
      await persistPage(snap.columns, snap.rows, true);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Selection & Bulk Operations (Phase 2)                            */
  /* ---------------------------------------------------------------- */

  const toggleRowSelection = (rowIndex: number, shiftKey: boolean = false) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedRowIndex !== null) {
        const start = Math.min(lastSelectedRowIndex, rowIndex);
        const end = Math.max(lastSelectedRowIndex, rowIndex);
        for (let i = start; i <= end; i++) {
          next.add(i);
        }
      } else {
        if (next.has(rowIndex)) next.delete(rowIndex);
        else next.add(rowIndex);
        setLastSelectedRowIndex(rowIndex);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedRows.size === viewRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(viewRows.map(r => rows.indexOf(r))));
    }
  };

  const clearSelection = () => setSelectedRows(new Set());

  const bulkDelete = async () => {
    if (selectedRows.size === 0) return;
    const confirmed = await showConfirm(`Are you sure you want to delete ${selectedRows.size} row(s)?`, "Bulk Delete");
    if (!confirmed) return;

    pushState({ columns, rows });
    const nextRows = rows.filter((_, idx) => !selectedRows.has(idx));
    setRows(nextRows);
    clearSelection();
    onToast?.(`Deleted ${selectedRows.size} row(s)`);
    await persistPage(columns, nextRows);
  };

  const bulkDuplicate = async () => {
    if (selectedRows.size === 0) return;
    pushState({ columns, rows });
    
    const duplicates = Array.from(selectedRows).map(idx => ({ ...rows[idx] }));
    const nextRows = [...rows, ...duplicates];
    setRows(nextRows);
    clearSelection();
    onToast?.(`Duplicated ${selectedRows.size} row(s)`);
    await persistPage(columns, nextRows);
  };

  const handlePaste = async (tsvText: string) => {
    const visibleCols = columns.filter(c => c.type !== 'group' && !c.hidden);
    const newRows = parseTSV(tsvText, visibleCols);
    if (newRows.length === 0) return;

    pushState({ columns, rows });
    const nextRows = [...rows, ...newRows];
    setRows(nextRows);
    onToast?.(`Pasted ${newRows.length} row(s)`);
    await persistPage(columns, nextRows);
  };

  const handleExportCsv = () => {
    // Export only visible columns, but respect filters and sorts
    const visibleCols = columns.filter(c => c.type !== 'group' && !c.hidden);
    const headers = visibleCols.map(c => c.name);
    const csvRows = [headers];
    
    for (const row of viewRows) {
      csvRows.push(visibleCols.map(c => row[c.name] || ""));
    }

    const csvContent = formatCSV(csvRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${selectedPage?.title || 'Export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ---------------------------------------------------------------- */
  /*  Return                                                           */
  /* ---------------------------------------------------------------- */

  return {
    // Core data
    columns, setColumns,
    rows, setRows,
    viewRows,
    totalCount,
    filteredCount,
    isSaving,
    collapsedGroups,

    // View state
    searchQuery, setSearchQuery,
    sortState, setSortState,
    filters, setFilters,
    groupBy, setGroupBy,
    savedViews,
    currentViewId,
    handleSaveView,
    handleLoadView,
    handleDeleteView,
    focusedCell, setFocusedCell,
    selectedRows, toggleRowSelection, selectAll, clearSelection,
    toggleSort,
    addFilter,
    removeFilter,
    clearFilters,
    toggleColumnVisibility,
    reorderColumn,

    // Phase 2 actions
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    bulkDelete,
    bulkDuplicate,
    handlePaste,

    // Phase 3 actions
    handleExportCsv,
    pushState,
    persistPage,

    // Modal state
    showColumnForm, setShowColumnForm,
    showRecordForm, setShowRecordForm,
    showEditColumns, setShowEditColumns,
    isEmailConfigOpen, setIsEmailConfigOpen,
    editingRowIndex,

    // Column form state
    newColName, setNewColName,
    newColType, setNewColType,
    newColColor, setNewColColor,
    newColOptions, setNewColOptions,
    newColGroup, setNewColGroup,
    newColUnique, setNewColUnique,
    tempColumns,

    // Record form state
    recordForm, setRecordForm,
    validationError,

    // Column CRUD
    addColumn,
    renameColumn,
    updateTempColumn,
    deleteColumnLocal,
    moveColumnUp,
    moveColumnDown,
    openEditColumns,
    saveColumnEdits,

    // Resize
    startResizeColumn,
    startResizeRow,

    // Record CRUD
    addRow,
    editRow,
    saveRecord,
    cancelRecord,
    deleteRow,
    saveCellValue,

    // Persistence
    saveEmailConfig,

    // Email
    openCompose,

    // Groups
    toggleGroup,
  };
}
