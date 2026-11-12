import { useEffect, useMemo, useState, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { Modal } from "./Modal";

import { Section } from "./Section";
import { EmailConfigModal } from "./EmailConfigModal";
import { ProjectDashboard } from "./ProjectDashboard";
import { api, listRecords, RecordMap, notify } from "../lib/api";
import { useDialog } from "./DialogProvider";
import { useUsage } from "../contexts/UsageContext";

/* Re-export shared types so external consumers don't break */
export type { ColumnType, ColumnDef, ProjectNavigationTarget } from "./sheet/sheetModel";
export { GROUP_COLORS, SHEET_TEMPLATES, saveCustomTemplate, getCustomTemplates } from "./sheet/sheetModel";

/* Projects root + sheet list (SCHOLARDOCX-0259) */
import { ProjectsHome } from "./projects/ProjectsHome";
import { ProjectSheetsSection } from "./projects/ProjectSheetsSection";
import type { SheetStart } from "./projects/CreateSheetModal";

/* Sheet sub-components */
import { saveCustomTemplate, getCustomTemplates } from "./sheet/sheetModel";
import { nextSheetName } from "./sheet/sheetColumns";
import { SheetTabsBar } from "./sheet/SheetTabsBar";
import type { SheetPage, ProjectNavigationTarget, DateColorConfig } from "./sheet/sheetModel";
import { useSheetPage } from "./sheet/useSheetPage";
import { SheetToolbar, SheetToolbarActions } from "./sheet/SheetToolbar";
import { CellStyleBar } from "./sheet/CellStyleBar";
import { SheetFooter } from "./sheet/SheetFooter";
import { AddColumnModal, EditColumnsModal } from "./sheet/ColumnEditor";
import { SheetTable } from "./sheet/SheetTable";
import { RecordFormModal } from "./sheet/RecordFormModal";
import { RowPeekPanel } from "./sheet/RowPeekPanel";
import { SelectionToolbar } from "./sheet/SelectionToolbar";
import { CsvImportModal } from "./sheet/CsvImportModal";
import { DateColorConfigModal } from "./sheet/DateColorConfigModal";
import { ShortcutsPanel } from "./sheet/ShortcutsPanel";
import { SheetBlankState } from "./sheet/SheetBlankState";
import { CommandPalette, type Command } from "./sheet/CommandPalette";
import { ColumnStatsPanel } from "./sheet/ColumnStatsPanel";
import { FormatRulesModal } from "./sheet/FormatRulesModal";

// Main workspace component

export function ProjectWorkspace({
  files,
  onChanged,
  onFilesChanged,
  navigationTarget,
  onToast,
  fullScreenMode = false,
  refreshTrigger
}: {
  files: RecordMap[];
  onChanged?: () => Promise<void>;
  onFilesChanged?: () => Promise<void>;
  navigationTarget?: ProjectNavigationTarget | null;
  onToast?: (message: string) => void;
  fullScreenMode?: boolean;
  refreshTrigger?: number;
}) {
  const { showPrompt } = useDialog();
  const { usageData } = useUsage();

  // Per-project sheet limit and per-sheet row limit from the user's role limits
  const sheetsPerProjectLimit: number = usageData?.limits?.sheets_per_project ?? -1;
  const recordsPerSheetLimit: number = usageData?.limits?.records_per_sheet ?? -1;

  const [projects, setProjects] = useState<RecordMap[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(navigationTarget?.projectId ? String(navigationTarget.projectId) : "");
  const [summary, setSummary] = useState<RecordMap | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState(navigationTarget?.sheetId ? String(navigationTarget.sheetId) : "");
  const [selectedPageId, setSelectedPageId] = useState(navigationTarget?.pageId ? String(navigationTarget.pageId) : "");
  const [customTemplates, setCustomTemplates] = useState(() => getCustomTemplates());
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [lastHandledToken, setLastHandledToken] = useState<number | null>(null);
  const [projectSheetCounts, setProjectSheetCounts] = useState<Record<string, number>>({});

  const selectedProject = projects.find((item) => String(item.id) === selectedProjectId);
  const sheets = summary?.sheets || [];
  // Page stubs from /meta — lightweight (id, sheet_id, name, updated_at, row_count).
  // Full row/column data for the ONE open sheet lives in `selectedPageData`.
  const pages: SheetPage[] = summary?.page_stubs || [];
  const selectedSheet = sheets.find((item: RecordMap) => String(item.id) === selectedSheetId);
  const selectedStub = selectedSheetId
    ? pages.find((item) => String(item.sheet_id) === selectedSheetId)
    : pages.find((item) => String(item.id) === selectedPageId);
  // Full page data — fetched on demand for the open sheet only.
  const [selectedPageData, setSelectedPageData] = useState<SheetPage | null>(null);
  // True only when the last load of the open sheet failed; distinct from the
  // null-because-loading state so the sheet can offer a Retry button.
  const [pageLoadFailed, setPageLoadFailed] = useState(false);
  const selectedPage = selectedPageData ?? undefined;

  /* CSV Import State */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvImportFile, setCsvImportFile] = useState<File | null>(null);

  const [showDateColorConfig, setShowDateColorConfig] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showFormatRules, setShowFormatRules] = useState(false);
  const [statsColumn, setStatsColumn] = useState<string | null>(null);
  // One clock per render pass for everything date-dependent in the sheet, so
  // a deadline cannot read as "today" in one place and "overdue" in another.
  const [sheetNow, setSheetNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setSheetNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [peekRowIndex, setPeekRowIndex] = useState<number | null>(null);
  const [dateColorConfig, setDateColorConfig] = useState<DateColorConfig>(() => {
    try {
      const stored = localStorage.getItem(`scholardock_date_colors_${selectedProjectId}`);
      return stored ? JSON.parse(stored) : { redDays: 3, yellowDays: 7 };
    } catch {
      return { redDays: 3, yellowDays: 7 };
    }
  });

  useEffect(() => {
    if (!selectedProjectId) return;
    try {
      const stored = localStorage.getItem(`scholardock_date_colors_${selectedProjectId}`);
      setDateColorConfig(stored ? JSON.parse(stored) : { redDays: 3, yellowDays: 7 });
    } catch {
      setDateColorConfig({ redDays: 3, yellowDays: 7 });
    }
  }, [selectedProjectId]);

  /* Sheet-level shortcuts (SCHOLARDOCX-0202). Bound on the window so they
     work wherever focus happens to be in the sheet, and skipped while the
     user is typing — "/" and "?" are ordinary characters in a cell. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ctrl/Cmd+K is checked before the typing guard: the whole point of a
      // palette is that it opens from anywhere, including mid-edit.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowPalette((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "")
      ) {
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts(true);
      }
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".sheet-search input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saveDateColorConfig = (config: DateColorConfig) => {
    setDateColorConfig(config);
    if (selectedProjectId) {
      localStorage.setItem(`scholardock_date_colors_${selectedProjectId}`, JSON.stringify(config));
    }
    setShowDateColorConfig(false);
  };

  // Sheet page hook (all column/row state, CRUD, modals)

  const refreshSummary = async (projectId = selectedProjectId) => {
    if (!projectId) return;
    // /meta returns lightweight stubs + aggregates + calendar. Full row data for
    // the open sheet is fetched separately via getSelectedPageData().
    const data = await api.get<RecordMap>(`/projects/${projectId}/meta?include_calendar=true`);
    setSummary(data);
    if (selectedSheetId) {
      const nextStub = (data.page_stubs || []).find((page: RecordMap) => String(page.sheet_id) === selectedSheetId);
      setSelectedPageId(nextStub ? String(nextStub.id) : "");
    }
  };

  // Post-save refresh: re-fetch lightweight metadata WITHOUT the calendar scan.
  // The open sheet's own rows are kept in local state; only sidebar/dashboard
  // stubs + notifications need to resync. Used by useSheetPage persist handlers.
  const refreshMeta = async () => {
    if (!selectedProjectId) return;
    const data = await api.get<RecordMap>(`/projects/${selectedProjectId}/meta?include_calendar=false`);
    setSummary(data);
  };

  // Fetch the ONE open sheet's full columns/rows. Called when the selected page
  // changes, or when its stub's updated_at changes (external edit / save by an
  // agent in another tab). Our own saves are no-oped by the contentSignature
  // guard inside useSheetPage, so this resync only applies to real changes.
  const getSelectedPageData = async (pageId: string): Promise<void> => {
    if (!pageId) { setSelectedPageData(null); return; }
    setPageLoadFailed(false);
    try {
      const page = await api.get<SheetPage>(`/project_pages/${pageId}`);
      setSelectedPageData(page);
    } catch (err) {
      console.error("Failed to load sheet page:", err);
      setSelectedPageData(null);
      setPageLoadFailed(true);
    }
  };

  const sheet = useSheetPage({
    selectedPageId,
    selectedPage,
    selectedProjectId,
    onToast,
    refreshSummary,
    refreshMeta,
    files,
    onFilesChanged,
    recordsPerSheetLimit,
  });

  /* Command palette entries (SCHOLARDOCX-0203).

     Built from the sheet's own state so the list is never stale: a column
     added a second ago is jumpable to immediately. Order is fixed rather
     than usage-ranked — the palette's value is that "Ctrl+K, a, Enter"
     means the same thing every time. */
  const sheetCommands: Command[] = useMemo(() => {
    if (!selectedPage) return [];
    const list: Command[] = [
      { id: "add-record", section: "Records", label: "Add record", keywords: "new row create",
        run: () => { sheet.addRow(); } },
      { id: "search", section: "Records", label: "Search rows", hint: "/", keywords: "find filter",
        run: () => document.querySelector<HTMLInputElement>(".sheet-search input")?.focus() },
      { id: "clear-filters", section: "Records", label: "Clear all filters and search", keywords: "reset",
        run: () => { sheet.clearFilters(); sheet.setSearchQuery(""); } },
      { id: "undo", section: "Records", label: "Undo", hint: "Ctrl+Z", run: () => sheet.handleUndo() },
      { id: "redo", section: "Records", label: "Redo", hint: "Ctrl+Shift+Z", run: () => sheet.handleRedo() },

      { id: "density-compact", section: "Display", label: "Row height: Compact", run: () => sheet.setDensity("compact") },
      { id: "density-cosy", section: "Display", label: "Row height: Cosy", run: () => sheet.setDensity("cosy") },
      { id: "density-roomy", section: "Display", label: "Row height: Roomy", run: () => sheet.setDensity("roomy") },
      { id: "ungroup", section: "Display", label: "Stop categorising rows", keywords: "group",
        run: () => sheet.setGroupBy(null) },

      { id: "rules", section: "Format", label: "Colour rules…", keywords: "conditional formatting highlight",
        run: () => setShowFormatRules(true) },
      { id: "add-column", section: "Format", label: "Add column", keywords: "new field letter",
        run: () => { void sheet.quickAddColumn(); } },
      { id: "columns", section: "Format", label: "Edit columns…", run: () => sheet.openEditColumns() },
      { id: "date-colors", section: "Format", label: "Deadline colours…", run: () => setShowDateColorConfig(true) },

      { id: "export", section: "Data", label: "Export to CSV", run: () => sheet.handleExportCsv() },
      { id: "import", section: "Data", label: "Import from CSV…", run: () => fileInputRef.current?.click() },
      { id: "email", section: "Data", label: "Email settings…", run: () => sheet.setIsEmailConfigOpen(true) },

      { id: "shortcuts", section: "Help", label: "Keyboard shortcuts", hint: "?", run: () => setShowShortcuts(true) },
    ];

    sheet.columns.filter((col) => col.type !== "group").forEach((col) => {
      list.push({
        id: `stats-${col.name}`,
        section: "Columns",
        label: `Summarise “${col.name}”`,
        keywords: `${col.name} stats insight column`,
        run: () => setStatsColumn(col.name),
      });
      list.push({
        id: `hide-${col.name}`,
        section: "Columns",
        label: `${col.hidden ? "Show" : "Hide"} “${col.name}”`,
        keywords: `${col.name} visibility`,
        run: () => sheet.toggleColumnVisibility(col.name),
      });
    });

    sheet.savedViews.forEach((view) => {
      list.push({
        id: `view-${view.id}`,
        section: "Saved views",
        label: `Open saved view: ${view.name}`,
        run: () => sheet.handleLoadView(view.id),
      });
    });

    return list;
  }, [selectedPage, sheet, fileInputRef]);

  /* ---------------------------------------------------------------- */
  /*  Project/sheet data loading                                       */
  /* ---------------------------------------------------------------- */

  const refreshProjects = async () => {
    setProjects(await listRecords<RecordMap>("projects"));
  };

  // Load per-project sheet counts for the Projects list in ONE grouped request,
  // instead of one /summary call per project (N+1). The endpoint returns
  // { "<project_id>": <count> } for the current user.
  //
  // SCHOLARDOCX-0150: seed every known project with 0 BEFORE the fetch so a
  // project with no sheets never gets stuck on the card's "loading" state.
  // The card treats a missing key as isLoading=true; without this seed, a
  // zero-sheet project (which the backend now correctly returns as 0) would
  // still flash "..." until the network round-trip completes, and any future
  // endpoint change that omits a key would regress to the perpetual spinner.
  const loadProjectSheetCounts = async () => {
    const seeded: Record<string, number> = {};
    for (const p of projects) seeded[String(p.id)] = 0;
    setProjectSheetCounts(seeded);
    try {
      const counts = await api.get<Record<string, number>>(`/projects/sheet_counts`);
      setProjectSheetCounts({ ...seeded, ...counts });
    } catch (err) {
      console.error("Failed to load project sheet counts:", err);
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      refreshProjects();
      // SCHOLARDOCX-0152: a Refresh click must also reload the per-project
      // sheet-count badges (they only re-fetch on projects.length change,
      // so without this they go stale after add/remove sheet) and the open
      // sheet's actual rows/columns (selectedPageData). Previously this only
      // hit /meta stubs, so the open grid stayed stale even after Refresh.
      loadProjectSheetCounts();
      if (selectedProjectId) {
        refreshSummary(selectedProjectId);
      }
      if (selectedPageId) {
        getSelectedPageData(selectedPageId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  useEffect(() => {
    if (projects.length > 0) {
      loadProjectSheetCounts();
    }
  }, [projects.length]);

  useEffect(() => {
    if (selectedProjectId) {
      setSummary(null);
      setSelectedSheetId("");
      setSelectedPageId("");
      setSelectedPageData(null);
      refreshSummary(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Fetch the open sheet's full columns/rows on demand. Re-fetches when the
  // stub's updated_at changes (external edit) so the open sheet stays fresh.
  // Our own saves are no-oped inside useSheetPage via contentSignature, so this
  // only triggers real re-syncs, not echoes of our edits.
  const selectedStubUpdatedAt = selectedStub?.updated_at;
  useEffect(() => {
    if (selectedPageId) {
      getSelectedPageData(selectedPageId);
    } else {
      setSelectedPageData(null);
      setPageLoadFailed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPageId, selectedStubUpdatedAt]);

  useEffect(() => {
    if (!navigationTarget || navigationTarget.token === lastHandledToken) return;
    setSelectedProjectId(String(navigationTarget.projectId));
    if (!navigationTarget.pageId && !navigationTarget.sheetId) {
      setLastHandledToken(navigationTarget.token);
    }
  }, [navigationTarget?.token]);

  // Global paste handler for TSV import
  useEffect(() => {
    if (!selectedPageId) return;
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in an input/textarea
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      const tsvText = e.clipboardData?.getData("text/plain");
      if (tsvText) {
        sheet.handlePaste(tsvText);
      }
    };
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [selectedPageId, sheet.handlePaste]);

  // Lock main scroll while a sheet modal is open. (The project and sheet-list
  // modals lock it themselves, in ProjectsHome / ProjectSheetsSection.)
  useEffect(() => {
    const anyModalOpen = sheet.showEditColumns || sheet.showColumnForm || sheet.showRecordForm || peekRowIndex !== null;
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.style.overflow = anyModalOpen ? "hidden" : "";
    }
    return () => {
      if (mainEl) mainEl.style.overflow = "";
    };
  }, [sheet.showEditColumns, sheet.showColumnForm, sheet.showRecordForm, peekRowIndex]);

  useEffect(() => {
    if (!navigationTarget || !summary || navigationTarget.token === lastHandledToken) return;
    if (String(navigationTarget.projectId) !== selectedProjectId) return;
    const targetPage = pages.find((page) => {
      const pageMatches = navigationTarget.pageId && String(page.id) === String(navigationTarget.pageId);
      const sheetMatches = navigationTarget.sheetId && String(page.sheet_id) === String(navigationTarget.sheetId);
      return pageMatches || sheetMatches;
    });
    if (!targetPage) return;
    setSelectedSheetId(String(targetPage.sheet_id));
    setSelectedPageId(String(targetPage.id));
    setFocusedRowIndex(typeof navigationTarget.rowIndex === "number" ? navigationTarget.rowIndex : null);
    setLastHandledToken(navigationTarget.token);
  }, [navigationTarget?.token, summary, selectedProjectId]);

  useEffect(() => {
    if (focusedRowIndex === null || !selectedSheetId) return;
    const timer = window.setTimeout(() => {
      const row = document.querySelector(`[data-row-index="${focusedRowIndex}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 80);
    const clearTimer = window.setTimeout(() => setFocusedRowIndex(null), 2800);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [focusedRowIndex, selectedSheetId]);

  /* ---------------------------------------------------------------- */
  /*  Sheet create / rename (shared by the sheet list and the tabs)    */
  /* ---------------------------------------------------------------- */

  /** Create a sheet and open it. Resolves false if it was not created. */
  const createSheet = async (name: string, start: SheetStart): Promise<boolean> => {
    if (!selectedProjectId || isCreatingSheet) return false;

    setIsCreatingSheet(true);
    try {
      // One request: the starting columns travel with the create call, so a
      // template sheet never exists half-made between a POST and a PATCH.
      const result = await api.post<RecordMap>(`/projects/${selectedProjectId}/sheets`, {
        name: name.trim() || "Untitled sheet",
        template: start.kind === "application" ? "application" : "blank",
        ...(start.kind === "columns" ? { columns: start.columns } : {}),
      });
      await notify("sheet_create", { project_id: String(selectedProjectId), sheetName: result.sheet.name, sheetId: String(result.sheet.id) });
      onToast?.(`Sheet created: ${result.sheet.name}.`);
      const data = await api.get<RecordMap>(`/projects/${selectedProjectId}/meta?include_calendar=true`);
      setSummary(data);
      // Straight into the new sheet.
      sheet.setShowRecordForm(false);
      sheet.setShowColumnForm(false);
      setSelectedSheetId(String(result.sheet.id));
      setSelectedPageId(result.page?.id ? String(result.page.id) : "");
      setProjectSheetCounts((current) => ({
        ...current,
        [String(selectedProjectId)]: (data.sheets || []).length,
      }));
      return true;
    } catch (error) {
      console.error("Error creating sheet:", error);
      onToast?.("Failed to create sheet. Please try again.");
      return false;
    } finally {
      setIsCreatingSheet(false);
    }
  };

  /** Rename a sheet and its page together. Resolves false on failure. */
  const renameSheet = async (sheetItem: RecordMap, name: string): Promise<boolean> => {
    const cleanName = name.trim();
    if (!cleanName) return false;
    try {
      await api.patch(`/project_sheets/${sheetItem.id}`, { data: { name: cleanName } });
      const pageToUpdate = pages.find((p) => String(p.sheet_id) === String(sheetItem.id));
      if (pageToUpdate) {
        await api.patch(`/project_pages/${pageToUpdate.id}`, { data: { name: cleanName } });
      }
      onToast?.("Sheet renamed.");
      await refreshSummary();
      return true;
    } catch (err) {
      console.error(err);
      onToast?.("Failed to rename sheet.");
      return false;
    }
  };

  const openSheet = (sheetItem: RecordMap) => {
    const page = pages.find((item) => String(item.sheet_id) === String(sheetItem.id));
    setSelectedSheetId(String(sheetItem.id));
    setSelectedPageId(page ? String(page.id) : "");
    sheet.setShowRecordForm(false);
    sheet.setShowColumnForm(false);
  };

  // Record count per sheet id, from the lightweight page stubs.
  const sheetRowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    pages.forEach((page) => { counts[String(page.sheet_id)] = Number(page.row_count) || 0; });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  /* ================================================================ */
  /*  Render: Project list (no project selected)                      */
  /* ================================================================ */

  if (!selectedProjectId && !fullScreenMode) {
    return (
      <ProjectsHome
        projects={projects}
        sheetCounts={projectSheetCounts}
        sheetsPerProjectLimit={sheetsPerProjectLimit}
        onOpenProject={setSelectedProjectId}
        refreshProjects={refreshProjects}
        onChanged={onChanged}
        onToast={onToast}
      />
    );
  }

  /* ================================================================ */
  /*  Render: Sheet detail (sheet selected)                           */
  /* ================================================================ */

  if (selectedSheetId) {
    return (
      <div className="project-detail sheet-detail-view" id="sheet-work-surface" style={fullScreenMode ? {
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: '16px',
        boxSizing: 'border-box',
        overflow: 'auto',
        fontSize: '12px',
        '--sheet-row-height': '32px',
        '--sheet-cell-lines': '1'
      } as React.CSSProperties : {}}>
        {!fullScreenMode && (
          <div className="detail-bar">
            <div className="breadcrumb-nav">
              <span className="breadcrumb-item clickable" onClick={() => {
                setSelectedProjectId("");
                setSelectedSheetId("");
                setSelectedPageId("");
                sheet.setShowRecordForm(false);
                sheet.setShowColumnForm(false);
              }}>
                <ChevronLeft size={16} /> Projects
              </span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-item clickable" onClick={() => {
                setSelectedSheetId("");
                setSelectedPageId("");
                sheet.setShowRecordForm(false);
                sheet.setShowColumnForm(false);
              }}>
                {selectedProject?.name}
              </span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-item active">
                {selectedSheet?.name || selectedPage?.name || "Sheet"}
              </span>
            </div>
          </div>
        )}

        {selectedPage ? (
          <Section
            title={selectedPage.name}
            eyebrow="Edit rows and columns"
            action={(
              <SheetToolbarActions
                fullScreenMode={fullScreenMode}
                selectedProjectId={selectedProjectId}
                selectedPageId={selectedPageId}
                selectedSheetId={selectedSheetId || undefined}
                projectName={selectedProject?.name || "Project"}
                sheetName={selectedSheet?.name || selectedPage?.name || "Sheet"}
                degreeType={selectedProject?.degree_type as string | undefined}
                onAskAi={(message) => {
                  // SCHOLARDOCX-0150: send the built prompt straight to Lumi on a
                  // fresh chat (no manual Send click needed). Action-oriented
                  // prompts still route through /ai/actions/plan with Confirm/Cancel.
                  window.dispatchEvent(new CustomEvent("scholardocx:open-ai", {
                    detail: { contextMessage: message, autoSend: true, newChat: true, forceAction: true }
                  }));
                }}
                focusedCell={sheet.focusedCell}
                onClearFocus={() => sheet.setFocusedCell(null)}
                selectedRows={sheet.selectedRows}
                rows={sheet.rows}
                columns={sheet.columns}
                onCellStyle={sheet.saveCellStyle}
                onClearCellFormatting={sheet.clearCellFormatting}
                bulkRowCellStyle={sheet.bulkRowCellStyle}
                bulkClearRowFormatting={sheet.bulkClearRowFormatting}
              />
            )}
          >
            <SheetToolbar
              columns={sheet.columns}
              rows={sheet.rows}
              viewRows={sheet.viewRows}
              recordsPerSheetLimit={recordsPerSheetLimit}
              fullScreenMode={fullScreenMode}
              showEditColumns={sheet.showEditColumns}
              isEmailConfigOpen={sheet.isEmailConfigOpen}
              showDateColorConfig={showDateColorConfig}
              searchQuery={sheet.searchQuery}
              onSearchChange={sheet.setSearchQuery}
              onToggleColumnVisibility={sheet.toggleColumnVisibility}
              onAddRow={() => { sheet.addRow(); sheet.setShowColumnForm(false); sheet.setShowEditColumns(false); }}
              onOpenEditColumns={sheet.openEditColumns}
              onOpenEmailConfig={() => sheet.setIsEmailConfigOpen(true)}
              onOpenDateColors={() => setShowDateColorConfig(true)}
              groupBy={sheet.groupBy}
              onGroupByChange={sheet.setGroupBy}
              savedViews={sheet.savedViews}
              currentViewId={sheet.currentViewId}
              onSaveView={sheet.handleSaveView}
              onLoadView={sheet.handleLoadView}
              onDeleteView={sheet.handleDeleteView}
              density={sheet.density}
              onDensityChange={sheet.setDensity}
              onOpenShortcuts={() => setShowShortcuts(true)}
              onOpenFormatRules={() => setShowFormatRules(true)}
              ruleCount={sheet.formatRules.filter((r) => r.enabled).length}
              onExportCsv={sheet.handleExportCsv}
              onImportCsv={() => fileInputRef.current?.click()}
              onSaveTemplate={async () => {
                const name = await showPrompt("Enter a name for this custom template:");
                if (name) {
                  saveCustomTemplate(name, "Saved from " + selectedPage?.name, sheet.columns);
                  setCustomTemplates(getCustomTemplates());
                  onToast?.("Template saved.");
                }
              }}
            />

            <SelectionToolbar
              selectedCount={sheet.selectedRows.size}
              onClear={sheet.clearSelection}
              onDelete={sheet.bulkDelete}
              onDuplicate={sheet.bulkDuplicate}
              columns={sheet.columns}
              rows={sheet.rows}
              activeColumn={sheet.focusedCell?.colName ?? null}
              onFillDown={sheet.fillDownSelection}
              onSetColumnValue={sheet.setColumnForSelection}
              onClearCells={sheet.clearSelectedCells}
              onCopy={() => {
                import("./sheet/sheetPaste").then(({ formatTSV }) => {
                  const visibleCols = sheet.columns.filter(c => c.type !== 'group' && !c.hidden);
                  const selectedData = Array.from(sheet.selectedRows).map(idx => sheet.rows[idx]);
                  const tsv = formatTSV(selectedData, visibleCols);
                  navigator.clipboard.writeText(tsv).then(() => {
                    onToast?.("Copied to clipboard");
                  }).catch(err => {
                    console.error(err);
                    onToast?.("Failed to copy");
                  });
                });
              }}
              onPeek={() => {
                const idx = Array.from(sheet.selectedRows)[0];
                if (idx !== undefined) setPeekRowIndex(idx);
              }}
              onEdit={() => {
                const idx = Array.from(sheet.selectedRows)[0];
                if (idx !== undefined) sheet.editRow(idx);
              }}
              onEmail={() => {
                const idx = Array.from(sheet.selectedRows)[0];
                if (idx !== undefined && sheet.rows[idx]) sheet.openCompose(sheet.rows[idx]);
              }}
            />

            {sheet.columns.length === 0 ? (
              <SheetBlankState
                onAddColumn={() => { sheet.setShowColumnForm(true); sheet.setNewColType("text"); }}
                onEditColumns={sheet.openEditColumns}
              />
            ) : null}

            {sheet.isEmailConfigOpen && (
              <EmailConfigModal
                config={selectedPage?.email_config || null}
                columns={sheet.columns}
                onSave={sheet.saveEmailConfig}
                onClose={() => sheet.setIsEmailConfigOpen(false)}
                degreeType={selectedProject?.degree_type}
              />
            )}

            {sheet.showColumnForm ? (
              <AddColumnModal
                newColName={sheet.newColName} setNewColName={sheet.setNewColName}
                newColType={sheet.newColType} setNewColType={sheet.setNewColType}
                newColColor={sheet.newColColor} setNewColColor={sheet.setNewColColor}
                newColOptions={sheet.newColOptions} setNewColOptions={sheet.setNewColOptions}
                newColGroup={sheet.newColGroup} setNewColGroup={sheet.setNewColGroup}
                newColUnique={sheet.newColUnique} setNewColUnique={sheet.setNewColUnique}
                tempColumns={sheet.tempColumns}
                isSaving={sheet.isSaving}
                onSubmit={sheet.addColumn}
                onClose={() => sheet.setShowColumnForm(false)}
              />
            ) : null}

            {sheet.showEditColumns ? (
              <EditColumnsModal
                tempColumns={sheet.tempColumns}
                showColumnForm={sheet.showColumnForm}
                isSaving={sheet.isSaving}
                onRename={sheet.renameColumn}
                onUpdateColumn={sheet.updateTempColumn}
                onDeleteColumn={sheet.deleteColumnLocal}
                onMoveUp={sheet.moveColumnUp}
                onMoveDown={sheet.moveColumnDown}
                onSave={sheet.saveColumnEdits}
                onClose={() => sheet.setShowEditColumns(false)}
                onAddColumn={() => { sheet.setShowColumnForm(true); sheet.setNewColType("text"); }}
                onAddGroup={() => { sheet.setShowColumnForm(true); sheet.setNewColType("group"); }}
              />
            ) : null}

            {sheet.showRecordForm ? (
              <RecordFormModal
                columns={sheet.columns}
                recordForm={sheet.recordForm}
                setRecordForm={sheet.setRecordForm}
                editingRowIndex={sheet.editingRowIndex}
                validationError={sheet.validationError}
                isSaving={sheet.isSaving}
                files={files}
                onFilesChanged={onFilesChanged || (async () => { })}
                onSave={sheet.saveRecord}
                onCancel={sheet.cancelRecord}
              />
            ) : null}

            <SheetTable
              density={sheet.density}
              formatRules={sheet.formatRules}
              now={sheetNow}
              onOpenColumnStats={setStatsColumn}
              columns={sheet.columns}
              rows={sheet.rows}
              viewRows={sheet.viewRows}
              rowIndexMap={sheet.rowIndexMap}
              duplicateRowIndices={sheet.duplicateRowIndices}
              searchQuery={sheet.searchQuery}
              groupBy={sheet.groupBy}
              files={files}
              fullScreenMode={fullScreenMode}
              collapsedGroups={sheet.collapsedGroups}
              focusedRowIndex={focusedRowIndex}
              sortState={sheet.sortState}
              filters={sheet.filters}
              onToggleGroup={sheet.toggleGroup}
              onResizeColumn={sheet.startResizeColumn}
              onResizeRow={sheet.startResizeRow}
              onSaveCellValue={sheet.saveCellValue}
              onEditRow={sheet.editRow}
              onCompose={sheet.openCompose}
              onDeleteRow={sheet.deleteRow}
              onFilesChanged={onFilesChanged || (async () => { })}
              onToggleSort={sheet.toggleSort}
              onAddFilter={sheet.addFilter}
              onRemoveFilter={sheet.removeFilter}
              onClearFilters={sheet.clearFilters}
              onReorderColumn={sheet.reorderColumn}
              selectedRows={sheet.selectedRows}
              onToggleRowSelection={sheet.toggleRowSelection}
              onSelectAll={sheet.selectAll}
              focusedCell={sheet.focusedCell}
              onFocusedCellChange={sheet.setFocusedCell}
              onUndo={sheet.handleUndo}
              onRedo={sheet.handleRedo}
              onQuickAddRow={sheet.quickAddRow}
              dateColorConfig={dateColorConfig}
              onPeekRow={(idx) => setPeekRowIndex(idx)}
              onCellStyle={sheet.saveCellStyle}
              onCellClearFormatting={sheet.clearCellFormatting}
              onRowStyle={sheet.saveRowStyle}
              columnActions={{
                nameProblem: sheet.columnNameProblem,
                onRename: sheet.renameColumnInline,
                onInsert: sheet.quickAddColumn,
                onSetType: sheet.setColumnType,
                onHide: sheet.toggleColumnVisibility,
                onDelete: sheet.deleteColumnDirect,
              }}
              onQuickAddColumn={() => sheet.quickAddColumn()}
            />
            <SheetFooter
              columns={sheet.columns}
              rows={sheet.rows}
              viewRows={sheet.viewRows}
              fullScreenMode={fullScreenMode}
              recordsPerSheetLimit={recordsPerSheetLimit}
            />
            {!fullScreenMode ? (
              <SheetTabsBar
                sheets={sheets}
                activeSheetId={selectedSheetId}
                rowCounts={{ ...sheetRowCounts, [selectedSheetId]: sheet.rows.length }}
                isCreating={isCreatingSheet}
                onOpen={openSheet}
                onCreate={() => {
                  void createSheet(nextSheetName(sheets.map((item: RecordMap) => String(item.name || ""))), { kind: "blank" });
                }}
                onRename={renameSheet}
              />
            ) : null}

            {showDateColorConfig && (
              <DateColorConfigModal
                config={dateColorConfig}
                onSave={saveDateColorConfig}
                onClose={() => setShowDateColorConfig(false)}
              />
            )}

            {showShortcuts && <ShortcutsPanel onClose={() => setShowShortcuts(false)} />}

            {showFormatRules && (
              <FormatRulesModal
                columns={sheet.columns}
                rows={sheet.rows}
                rules={sheet.formatRules}
                now={sheetNow}
                onChange={sheet.setFormatRules}
                onClose={() => setShowFormatRules(false)}
              />
            )}

            {statsColumn && sheet.columns.some((c) => c.name === statsColumn) && (
              <Modal onClose={() => setStatsColumn(null)}>
                <div onClick={(event) => event.stopPropagation()}>
                  <ColumnStatsPanel
                    column={sheet.columns.find((c) => c.name === statsColumn)!}
                    rows={sheet.rows}
                    now={sheetNow}
                    onFilterValue={(column, value) => {
                      const def = sheet.columns.find((c) => c.name === column);
                      if (!def) return;
                      // ColumnFilter is a discriminated union; a select/bool
                      // column filters by value set, everything else by text.
                      sheet.addFilter(
                        def.type === "select" || def.type === "bool"
                          ? { column, type: def.type, kind: "values", values: new Set([value]) }
                          : { column, type: def.type, kind: "text", contains: value },
                      );
                      setStatsColumn(null);
                    }}
                    onClose={() => setStatsColumn(null)}
                  />
                </div>
              </Modal>
            )}

            {showPalette && (
              <CommandPalette
                commands={sheetCommands}
                onClose={() => setShowPalette(false)}
              />
            )}

            {peekRowIndex !== null && sheet.rows[peekRowIndex] && (
              <RowPeekPanel
                row={sheet.rows[peekRowIndex]}
                columns={sheet.columns}
                files={files}
                onClose={() => setPeekRowIndex(null)}
                onEdit={() => {
                  setPeekRowIndex(null);
                  sheet.editRow(peekRowIndex);
                }}
                position={(() => {
                  // Position within the *filtered, sorted* view, not the raw
                  // row array — stepping should follow what is on screen.
                  const order = sheet.viewRows.map((r) => sheet.rowIndexMap.get(r) ?? -1);
                  const at = order.indexOf(peekRowIndex);
                  return at >= 0 ? { index: at + 1, total: order.length } : undefined;
                })()}
                onStep={(delta) => {
                  const order = sheet.viewRows.map((r) => sheet.rowIndexMap.get(r) ?? -1);
                  const at = order.indexOf(peekRowIndex);
                  const next = order[at + delta];
                  if (next !== undefined && next >= 0) setPeekRowIndex(next);
                }}
              />
            )}
          </Section>
        ) : pageLoadFailed && selectedPageId ? (
          <Section title="Sheet" eyebrow="Error">
            <p className="empty">This sheet could not be loaded.</p>
            <button
              className="primary"
              type="button"
              onClick={() => getSelectedPageData(selectedPageId)}
            >
              Retry
            </button>
          </Section>
        ) : (
          <Section title="Sheet" eyebrow="Loading">
            <p className="empty">Preparing this sheet.</p>
          </Section>
        )}

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCsvImportFile(file);
              e.target.value = '';
            }
          }}
        />

        {csvImportFile && (
          <CsvImportModal
            file={csvImportFile}
            existingColumns={sheet.columns}
            recordsPerSheetLimit={recordsPerSheetLimit}
            currentRowsCount={sheet.rows.length}
            onClose={() => setCsvImportFile(null)}
            onImport={async (newRows, newCols) => {
              const nextCols = [...sheet.columns, ...newCols];
              const nextRows = [...sheet.rows, ...newRows];

              sheet.setColumns(nextCols);
              sheet.setRows(nextRows);
              sheet.record({ columns: nextCols, rows: nextRows });
              sheet.persistPage(nextCols, nextRows);
              setCsvImportFile(null);
            }}
          />
        )}
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: Project detail (project selected, no sheet)             */
  /* ================================================================ */

  return (
    <div className="project-detail">
      {!fullScreenMode && (
        <div className="detail-bar">
          <div className="breadcrumb-nav">
            <span className="breadcrumb-item clickable" onClick={() => setSelectedProjectId("")}>
              <ChevronLeft size={16} /> Projects
            </span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-item active">
              {selectedProject?.name}
            </span>
          </div>
        </div>
      )}

      <ProjectDashboard
        summary={summary}
        projectId={selectedProjectId}
        onEventClick={(event) => {
          setSelectedSheetId(String(event.sheet_id || ""));
          setSelectedPageId(String(event.page_id || ""));
          setFocusedRowIndex(typeof event.row_index === "number" ? event.row_index : Number(event.row_index));
        }}
        onReminderChanged={() => refreshSummary()}
      />

      <ProjectSheetsSection
        projectId={selectedProjectId}
        sheets={sheets}
        rowCounts={sheetRowCounts}
        recordsPerSheetLimit={recordsPerSheetLimit}
        customTemplates={customTemplates}
        isCreatingSheet={isCreatingSheet}
        onCreateSheet={createSheet}
        onRenameSheet={renameSheet}
        onOpenSheet={openSheet}
        refreshSummary={() => refreshSummary()}
        onChanged={onChanged}
        onToast={onToast}
      />
    </div>
  );
}
