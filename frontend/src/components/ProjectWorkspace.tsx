import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronUp, ChevronDown, Edit, ExternalLink, FolderOpen, LayoutDashboard, Mail, Pin, Plus, Settings, Trash2, X } from "lucide-react";
import { Field } from "./Field";

import { PinActions } from "./PinActions";
import { Section } from "./Section";
import { EmailConfigModal, EmailConfig } from "./EmailConfigModal";
import { ProjectDashboard } from "./ProjectDashboard";
import { CellRenderer, rowClass, TypedRecordField } from "./SheetRecordFields";
import { api, createRecord, listRecords, RecordMap, notify } from "../lib/api";
import { formatLongDate } from "../lib/date";
import { composeEmailUrl, ComposeProvider } from "../lib/email";
import { useDialog } from "./DialogProvider";
import { useUsage } from "../contexts/UsageContext";

/* ------------------------------------------------------------------ */
/*  Column definition types                                           */
/* ------------------------------------------------------------------ */

export type ColumnType = "text" | "number" | "bool" | "file" | "date" | "select" | "group" | "url";

export type ColumnDef = {
  name: string;
  type: ColumnType;
  width?: number;
  group?: string;
  color?: string;
  options?: string[];
  unique?: boolean;
};

export const GROUP_COLORS = ["#2f6d7a", "#b24f4f", "#c58940", "#4f8a45", "#6f42c1", "#007bff"];

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "bool", label: "Yes / No" },
  { value: "file", label: "File / Document" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "url", label: "Link" },
];

/** Migrate old string[] columns to ColumnDef[]. */
function migrateColumns(raw: unknown[]): ColumnDef[] {
  if (!raw || raw.length === 0) return [];
  let cols: ColumnDef[];
  if (typeof raw[0] === "string") {
    cols = (raw as string[]).map((name) => ({ name, type: "text" as ColumnType }));
  } else {
    cols = raw as ColumnDef[];
  }

  let hasEmailGroup = cols.some(c => c.type === "group" && c.name === "Email");
  let hasAttachGroup = cols.some(c => c.type === "group" && c.name === "Attachments");
  
  const finalCols: ColumnDef[] = [];
  for (const col of cols) {
    if (!hasEmailGroup && !col.group && (col.name.toLowerCase().includes("email subject") || col.name.toLowerCase().includes("email body"))) {
      finalCols.push({ name: "Email", type: "group", color: "#4f8a45" });
      hasEmailGroup = true;
    }
    if (!hasAttachGroup && col.type === "file" && !col.group) {
      finalCols.push({ name: "Attachments", type: "group", color: "#c58940" });
      hasAttachGroup = true;
    }

    if (col.name.toLowerCase().includes("email subject") || col.name.toLowerCase().includes("email body")) {
      if (!col.group) col.group = "Email";
    } else if (col.type === "file" && !col.group) {
      col.group = "Attachments";
    }
    
    finalCols.push(col);
  }
  
  return finalCols;
}

/* ------------------------------------------------------------------ */
/*  Sheet page type                                                   */
/* ------------------------------------------------------------------ */

type SheetPage = RecordMap & {
  columns?: ColumnDef[];
  rows?: Record<string, string>[];
  email_config?: EmailConfig;
};

export type ProjectNavigationTarget = {
  token: number;
  projectId: number | string;
  sheetId?: number | string;
  pageId?: number | string;
  rowIndex?: number;
};

/* ------------------------------------------------------------------ */
/*  Main workspace component                                          */
/* ------------------------------------------------------------------ */

function SelectOptionsEditor({ options, onChange }: { options: string[], onChange: (opts: string[]) => void }) {
  const [newOpt, setNewOpt] = useState("");
  
  return (
    <div className="select-options-editor">
      <div className="select-options-list">
        {options.map((opt, i) => (
          <div key={i} className="select-option-pill">
            <input 
              value={opt} 
              onChange={(e) => {
                const newOpts = [...options];
                newOpts[i] = e.target.value;
                onChange(newOpts);
              }}
            />
            <button type="button" onClick={() => onChange(options.filter((_, idx) => idx !== i))}><X size={12} /></button>
          </div>
        ))}
      </div>
      <div className="select-add-row">
        <input 
          value={newOpt} 
          onChange={(e) => setNewOpt(e.target.value)} 
          placeholder="New option..." 
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (newOpt.trim()) {
                onChange([...options, newOpt.trim()]);
                setNewOpt("");
              }
            }
          }}
        />
        <button type="button" onClick={() => {
          if (newOpt.trim()) {
            onChange([...options, newOpt.trim()]);
            setNewOpt("");
          }
        }}>Add</button>
      </div>
    </div>
  );
}

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
  const { showAlert, showConfirm } = useDialog();
  const { usageData } = useUsage();

  // Per-project sheet limit and per-sheet row limit from the user's role limits
  const sheetsPerProjectLimit: number = usageData?.limits?.sheets_per_project ?? -1;
  const recordsPerSheetLimit: number = usageData?.limits?.records_per_sheet ?? -1;

  const [projects, setProjects] = useState<RecordMap[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(navigationTarget?.projectId ? String(navigationTarget.projectId) : "");
  const [summary, setSummary] = useState<RecordMap | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState(navigationTarget?.sheetId ? String(navigationTarget.sheetId) : "");
  const [selectedPageId, setSelectedPageId] = useState(navigationTarget?.pageId ? String(navigationTarget.pageId) : "");
  const [projectForm, setProjectForm] = useState({ name: "", degree_type: "phd", intake_term: "", status: "Active", description: "" });
  const [sheetName, setSheetName] = useState("");
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [showColumnForm, setShowColumnForm] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [showEditColumns, setShowEditColumns] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [tempColumns, setTempColumns] = useState<(ColumnDef & { _originalName?: string })[]>([]);
  const [isEmailConfigOpen, setIsEmailConfigOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  /* Edit project/sheet state */
  const [editingProject, setEditingProject] = useState<RecordMap | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ name: "", degree_type: "phd", intake_term: "", status: "Active", description: "" });
  const [editingSheet, setEditingSheet] = useState<RecordMap | null>(null);
  const [editSheetName, setEditSheetName] = useState("");
  const [recordForm, setRecordForm] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [lastHandledToken, setLastHandledToken] = useState<number | null>(null);

  /* Column form state */
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<ColumnType>("text");
  const [newColColor, setNewColColor] = useState<string>(GROUP_COLORS[0]);
  const [newColOptions, setNewColOptions] = useState("");
  const [newColGroup, setNewColGroup] = useState("");
  const [newColUnique, setNewColUnique] = useState(false);
  const [projectSheetCounts, setProjectSheetCounts] = useState<Record<string, number>>({});

  const selectedProject = projects.find((item) => String(item.id) === selectedProjectId);
  const sheets = summary?.sheets || [];
  const pages: SheetPage[] = summary?.pages || [];
  const selectedSheet = sheets.find((item: RecordMap) => String(item.id) === selectedSheetId);
  const selectedPage = selectedSheetId
    ? pages.find((item) => String(item.sheet_id) === selectedSheetId)
    : pages.find((item) => String(item.id) === selectedPageId);

  const refreshProjects = async () => {
    setProjects(await listRecords<RecordMap>("projects"));
  };

  const loadProjectSheetCounts = async () => {
    const counts: Record<string, number> = {};
    await Promise.all(
      projects.map(async (project) => {
        try {
          const summary = await api.get<RecordMap>(`/projects/${project.id}/summary`);
          counts[String(project.id)] = (summary.sheets || []).length;
        } catch {
          counts[String(project.id)] = 0;
        }
      })
    );
    setProjectSheetCounts(counts);
  };

  const refreshSummary = async (projectId = selectedProjectId) => {
    if (!projectId) return;
    const data = await api.get<RecordMap>(`/projects/${projectId}/summary`);
    setSummary(data);
    if (selectedSheetId) {
      const nextPage = data.pages?.find((page: RecordMap) => String(page.sheet_id) === selectedSheetId);
      setSelectedPageId(nextPage ? String(nextPage.id) : "");
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      refreshProjects();
      if (selectedProjectId) {
        refreshSummary(selectedProjectId);
      }
    }
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
      refreshSummary(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (!navigationTarget || navigationTarget.token === lastHandledToken) return;
    setSelectedProjectId(String(navigationTarget.projectId));
    if (!navigationTarget.pageId && !navigationTarget.sheetId) {
      setLastHandledToken(navigationTarget.token);
    }
  }, [navigationTarget?.token]);

  // Lock main scroll when any modal is open
  useEffect(() => {
    const anyModalOpen = showEditColumns || showColumnForm || showRecordForm || showCreateProject || showCreateSheet || !!editingProject || !!editingSheet;
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.style.overflow = anyModalOpen ? "hidden" : "";
    }
    return () => {
      if (mainEl) mainEl.style.overflow = "";
    };
  }, [showEditColumns, showColumnForm, showRecordForm, showCreateProject, showCreateSheet, editingProject, editingSheet]);

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

  useEffect(() => {
    if (!selectedPage) {
      setColumns([]);
      setRows([]);
      return;
    }
    const rawCols = selectedPage.columns || JSON.parse(selectedPage.columns_json || "[]");
    setColumns(migrateColumns(rawCols));
    setRows(selectedPage.rows || JSON.parse(selectedPage.rows_json || "[]"));
  }, [selectedPageId, selectedPage?.updated_at]);

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
  /*  Project CRUD                                                     */
  /* ---------------------------------------------------------------- */

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const project = await createRecord<RecordMap>("projects", projectForm);
    await notify("project_create", { project_id: project.id, projectName: project.name, projectId: Number(project.id) });
    setProjectForm({ name: "", degree_type: "phd", intake_term: "", status: "Active", description: "" });
    onToast?.("Project created.");
    setShowCreateProject(false);
    await refreshProjects();
  };

  const startEditProject = (project: RecordMap) => {
    setEditingProject(project);
    setEditProjectForm({
      name: project.name || "",
      degree_type: project.degree_type || "phd",
      intake_term: project.intake_term || "",
      status: project.status || "Active",
      description: project.description || ""
    });
  };

  const saveProjectEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    try {
      await api.patch(`/projects/${editingProject.id}`, { data: editProjectForm });
      onToast?.("Project updated.");
      setEditingProject(null);
      await refreshProjects();
    } catch (err) {
      console.error(err);
      onToast?.("Failed to update project.");
    }
  };

  const createSheet = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProjectId) return;
    const cleanName = sheetName.trim() || "Application sheet";
    const result = await api.post<RecordMap>(`/projects/${selectedProjectId}/sheets`, { name: cleanName });
    await notify("sheet_create", { project_id: Number(selectedProjectId), sheetName: result.sheet.name, sheetId: Number(result.sheet.id) });
    onToast?.(`Sheet created: ${result.sheet.name}.`);
    setSheetName("");
    setShowCreateSheet(false);
    const data = await api.get<RecordMap>(`/projects/${selectedProjectId}/summary`);
    setSummary(data);
  };

  const startEditSheet = (sheet: RecordMap) => {
    setEditingSheet(sheet);
    setEditSheetName(sheet.name || "");
  };

  const saveSheetEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingSheet) return;
    const cleanName = editSheetName.trim() || "Application sheet";
    try {
      await api.patch(`/project_sheets/${editingSheet.id}`, { data: { name: cleanName } });
      
      const pageToUpdate = pages.find((p) => String(p.sheet_id) === String(editingSheet.id));
      if (pageToUpdate) {
        await api.patch(`/project_pages/${pageToUpdate.id}`, { data: { name: cleanName } });
      }

      onToast?.("Sheet updated.");
      setEditingSheet(null);
      await refreshSummary();
    } catch (err) {
      console.error(err);
      onToast?.("Failed to update sheet.");
    }
  };

  const deleteProject = async (id: number) => {
    const confirmed = await showConfirm("Are you sure you want to delete this project? This will permanently delete all sheets, pages, and records in it.", "Delete Campaign");
    if (!confirmed) return;
    try {
      await api.delete(`/projects/${id}`);
      const deletedProjectName = projects.find((p) => Number(p.id) === id)?.name;
      await notify("project_delete", { project_id: id, projectId: id, projectName: deletedProjectName });
      onToast?.("Project deleted.");
      await refreshProjects();
    } catch (error) {
      console.error("Delete project error:", error);
      onToast?.("Failed to delete project.");
    }
  };

  const deleteSheet = async (id: number) => {
    const confirmed = await showConfirm("Are you sure you want to delete this sheet? This will permanently delete all records in it.", "Delete Sheet");
    if (!confirmed) return;
    try {
      await api.delete(`/project_sheets/${id}`);
      const deletedSheetName = sheets.find((s: RecordMap) => Number(s.id) === id)?.name;
      await notify("sheet_delete", { project_id: Number(selectedProjectId), sheetId: id, sheetName: deletedSheetName });
      onToast?.("Sheet deleted.");
      await refreshSummary();
    } catch (error) {
      console.error("Delete sheet error:", error);
      onToast?.("Failed to delete sheet.");
    }
  };

  const updateProjectPin = async (project: RecordMap, data: RecordMap) => {
    await api.patch(`/projects/${project.id}`, { data });
    if (data.is_pinned !== undefined || data.pinned_to_dashboard !== undefined) {
      await notify("project_pin", {
        project_id: project.id,
        projectName: project.name,
        actionLabel: data.pinned_to_dashboard !== undefined
          ? (data.pinned_to_dashboard ? "added to dashboard" : "removed from dashboard")
          : (data.is_pinned ? "pinned" : "unpinned")
      });
    }
    await refreshProjects();
    await onChanged?.();
  };

  const updateSheetPin = async (sheet: RecordMap, data: RecordMap) => {
    await api.patch(`/project_sheets/${sheet.id}`, { data });
    if (data.is_pinned !== undefined || data.pinned_to_dashboard !== undefined) {
      await notify("sheet_pin", {
        project_id: sheet.project_id,
        sheetName: sheet.name,
        actionLabel: data.pinned_to_dashboard !== undefined
          ? (data.pinned_to_dashboard ? "added to dashboard" : "removed from dashboard")
          : (data.is_pinned ? "pinned" : "unpinned")
      });
    }
    await refreshSummary();
    await onChanged?.();
  };

  /* ---------------------------------------------------------------- */
  /*  Column CRUD (auto-saves)                                        */
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
    setNewColColor(GROUP_COLORS[0]);
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

    setColumns(nextColumns);
    setRows(nextRows);
    setShowEditColumns(false);
    await persistPage(nextColumns, nextRows);
  };

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
      setRows(nextRows);
      await persistPage(columns, nextRows, true);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  /* ---------------------------------------------------------------- */
  /*  Record CRUD (auto-saves)                                        */
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
    setRows(nextRows);
    await persistPage(columns, nextRows);
  };

  const saveCellValue = async (rowIndex: number, column: string, value: string) => {
    if (!selectedPageId || isSaving) throw new Error("Sheet is busy.");
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

  const openSheet = (sheet: RecordMap) => {
    const page = pages.find((item) => String(item.sheet_id) === String(sheet.id));
    setSelectedSheetId(String(sheet.id));
    setSelectedPageId(page ? String(page.id) : "");
    setShowRecordForm(false);
    setShowColumnForm(false);
    setMessage("");
  };

  const getSheetPage = (sheet: RecordMap) => pages.find((page) => String(page.sheet_id) === String(sheet.id));

  /* ================================================================ */
  /*  Render: Project list (no project selected)                      */
  /* ================================================================ */

  const formatDegreeType = (type: string | undefined | null) => {
    if (!type) return "Degree TBD";
    if (type.toLowerCase() === "phd") return "PhD";
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const groupedProjects = projects.reduce<Record<string, RecordMap[]>>((acc, project) => {
    const type = project.degree_type || "uncategorized";
    if (!acc[type]) acc[type] = [];
    acc[type].push(project);
    return acc;
  }, {});

  const projectGroupKeys = Object.keys(groupedProjects).sort((a, b) => {
    const order: Record<string, number> = {
      phd: 1,
      masters: 2,
      bachelors: 3,
      uncategorized: 99
    };
    const valA = order[a.toLowerCase()] || 50;
    const valB = order[b.toLowerCase()] || 50;
    
    if (valA !== valB) {
      return valA - valB;
    }
    return a.localeCompare(b);
  });

  if (!selectedProjectId && !fullScreenMode) {
    return (
      <div className="project-home">
        {showCreateProject ? (
          <div className="modal-backdrop" onClick={() => setShowCreateProject(false)}>
            <form className="modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={createProject}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Application campaign</p>
                  <h2>Create Project</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => setShowCreateProject(false)} title="Close form">
                  <X size={20} />
                </button>
              </div>
              <div className="modal-content form-grid">
                <Field label="Project name" name="name" value={projectForm.name} required onChange={(name, value) => setProjectForm({ ...projectForm, [name]: value })} />
                <Field label="Degree type" name="degree_type" value={projectForm.degree_type} options={["Bachelors", "Masters", "PhD"]} onChange={(name, value) => setProjectForm({ ...projectForm, [name]: value })} />
                <Field label="Intake term" name="intake_term" value={projectForm.intake_term} onChange={(name, value) => setProjectForm({ ...projectForm, [name]: value })} />
                <Field label="Status" name="status" value={projectForm.status} options={["Active", "Paused", "Complete"]} onChange={(name, value) => setProjectForm({ ...projectForm, [name]: value })} />
                <Field label="Description" name="description" value={projectForm.description} rows={3} onChange={(name, value) => setProjectForm({ ...projectForm, [name]: value })} />
              </div>
              <div className="modal-footer">
                <button className="secondary" type="button" onClick={() => setShowCreateProject(false)}>Cancel</button>
                <button className="primary" type="submit"><Plus size={16} /> Create project</button>
              </div>
            </form>
          </div>
        ) : null}

        {editingProject ? (
          <div className="modal-backdrop" onClick={() => setEditingProject(null)}>
            <form className="modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={saveProjectEdit}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">Campaign details</p>
                  <h2>Edit Project</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => setEditingProject(null)} title="Close form">
                  <X size={20} />
                </button>
              </div>
              <div className="modal-content form-grid">
                <Field label="Project name" name="name" value={editProjectForm.name} required onChange={(name, value) => setEditProjectForm({ ...editProjectForm, [name]: value })} />
                <Field label="Degree type" name="degree_type" value={editProjectForm.degree_type} options={["Bachelors", "Masters", "PhD"]} onChange={(name, value) => setEditProjectForm({ ...editProjectForm, [name]: value })} />
                <Field label="Intake term" name="intake_term" value={editProjectForm.intake_term} onChange={(name, value) => setEditProjectForm({ ...editProjectForm, [name]: value })} />
                <Field label="Status" name="status" value={editProjectForm.status} options={["Active", "Paused", "Complete"]} onChange={(name, value) => setEditProjectForm({ ...editProjectForm, [name]: value })} />
                <Field label="Description" name="description" value={editProjectForm.description} rows={3} onChange={(name, value) => setEditProjectForm({ ...editProjectForm, [name]: value })} />
              </div>
              <div className="modal-footer">
                <button className="secondary" type="button" onClick={() => setEditingProject(null)}>Cancel</button>
                <button className="primary" type="submit">Save changes</button>
              </div>
            </form>
          </div>
        ) : null}

        <Section 
          title="Projects" 
          eyebrow={`${projects.length} total`}
          action={
            !showCreateProject ? (
              <button className="primary" onClick={() => setShowCreateProject(true)}>
                <Plus size={16} /> New Project
              </button>
            ) : null
          }
        >
          <div className="project-group-list">
            {projectGroupKeys.map((degreeType) => (
              <div className="project-group" key={degreeType}>
                <h3 className="project-group-title">
                  {degreeType === "uncategorized" 
                    ? "Other Programs" 
                    : `${formatDegreeType(degreeType)} Programs`}
                </h3>
                <div className="project-card-grid">
                  {groupedProjects[degreeType].map((project) => (
                    <article className="project-card" key={project.id}>
                      <div className="project-card-header">
                        <div className="project-card-title-row">
                          <strong>{project.name}</strong>
                          {projectSheetCounts[String(project.id)] !== undefined && (() => {
                            const used = projectSheetCounts[String(project.id)];
                            const max = sheetsPerProjectLimit;
                            const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : -1;
                            const isNear = pct >= 80;
                            const isFull = pct >= 100;
                            return (
                              <div className="project-quota-wrap">
                                <span className={`project-sheet-count${isFull ? ' quota-full' : isNear ? ' quota-near' : ''}`}>
                                  {max > 0 ? `${used} / ${max}` : used}
                                </span>
                                {max > 0 && (
                                  <div className="quota-bar" title={`${used} of ${max} sheets used`}>
                                    <div
                                      className={`quota-bar-fill${isFull ? ' full' : isNear ? ' near' : ''}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <span className="project-card-meta">
                          {formatDegreeType(project.degree_type)} · {project.intake_term || "Intake TBD"} · {project.status} · Created {formatLongDate(project.created_at)}
                        </span>
                        {project.description ? <p className="project-card-desc">{project.description}</p> : null}
                      </div>
                      <div className="project-card-actions">
                        <div className="project-card-pins">
                          <button
                            className={`pin-button${project.is_pinned ? " active" : ""}`}
                            type="button"
                            onClick={() => updateProjectPin(project, { is_pinned: !project.is_pinned })}
                            title={project.is_pinned ? "Unpin from this view" : "Pin to this view"}
                          >
                            <Pin size={15} />
                          </button>
                          <button
                            className={`pin-button dashboard-pin${project.pinned_to_dashboard ? " active" : ""}`}
                            type="button"
                            onClick={() => updateProjectPin(project, { pinned_to_dashboard: !project.pinned_to_dashboard })}
                            title={project.pinned_to_dashboard ? "Remove from dashboard" : "Add to dashboard"}
                          >
                            <LayoutDashboard size={15} />
                          </button>
                        </div>
                        <div className="project-card-main-actions">
                          <button className="primary" onClick={() => setSelectedProjectId(String(project.id))}>Open</button>
                          <button
                            className="secondary"
                            onClick={() => startEditProject(project)}
                            title="Edit project"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            className="secondary danger"
                            onClick={() => deleteProject(project.id)}
                            title="Delete project"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render: Sheet detail (sheet selected)                           */
  /* ================================================================ */

  if (selectedSheetId) {
    type RenderColumn = 
      | { type: 'data'; col: ColumnDef; originalIndex: number; groupName?: string }
      | { type: 'group-control'; groupName: string; collapsed: boolean };

    const renderColumns: RenderColumn[] = [];
    const processedGroups = new Set<string>();

    columns.forEach((col, index) => {
      if (col.type === "group") {
        const groupName = col.name;
        processedGroups.add(groupName);
        const isCollapsed = collapsedGroups[groupName] ?? true;
        renderColumns.push({
          type: 'group-control',
          groupName,
          collapsed: isCollapsed
        });

        if (!isCollapsed) {
          columns.forEach((childCol, childIndex) => {
            if (childCol.type !== "group" && childCol.group === groupName) {
              renderColumns.push({
                type: 'data',
                col: childCol,
                originalIndex: childIndex,
                groupName
              });
            }
          });
        }
      } else if (!col.group || !columns.some(c => c.type === "group" && c.name === col.group)) {
        renderColumns.push({
          type: 'data',
          col,
          originalIndex: index
        });
      }
    });

    const toggleGroup = (groupName: string) => {
      setCollapsedGroups(prev => ({ ...prev, [groupName]: !(prev[groupName] ?? true) }));
    };

    return (
      <div className="project-detail sheet-detail-view" style={fullScreenMode ? {
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
              setShowRecordForm(false);
              setShowColumnForm(false);
              setCollapsedGroups({});
            }}>
              <ChevronLeft size={16} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> Projects
            </span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-item clickable" onClick={() => {
              setSelectedSheetId("");
              setSelectedPageId("");
              setShowRecordForm(false);
              setShowColumnForm(false);
              setCollapsedGroups({});
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
          <Section title={fullScreenMode ? "" : selectedPage.name} eyebrow={fullScreenMode ? "" : "Edit rows and columns"}>
            <div className="sheet-toolbar" style={fullScreenMode ? { marginBottom: '12px', gap: '8px' } : {}}>
              <button className="secondary" onClick={() => { addRow(); setShowColumnForm(false); setShowEditColumns(false); }} disabled={columns.length === 0} title={columns.length === 0 ? "Add columns first" : "Add a new record"} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
                <Plus size={14} /> Add Record
              </button>
              <button className="secondary" onClick={() => setIsEmailConfigOpen(true)} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
                <Mail size={14} /> Email Config
              </button>
              <button 
                className="secondary" 
                onClick={() => {
                  const url = `/sheet/fullscreen?projectId=${selectedProjectId}&pageId=${selectedPageId}`;
                  window.open(url, '_blank');
                }}
                title="Open sheet in full screen"
                style={{ display: fullScreenMode ? 'none' : 'inline-flex' }}
              >
                <ExternalLink size={16} /> Full Screen
              </button>
              <button className="secondary btn-edit-columns" onClick={openEditColumns} disabled={showEditColumns} style={fullScreenMode ? { fontSize: '11px', padding: '6px 12px' } : {}}>
                <Settings size={14} /> Edit columns
              </button>
              {recordsPerSheetLimit > 0 && (() => {
                const used = rows.length;
                const max = recordsPerSheetLimit;
                const pct = Math.min(100, Math.round((used / max) * 100));
                const isNear = pct >= 80;
                const isFull = pct >= 100;
                return (
                  <div className="sheet-toolbar-quota">
                    <span className={`toolbar-quota-label${isFull ? ' quota-full' : isNear ? ' quota-near' : ''}`}>
                      {used} / {max} records
                    </span>
                    <div className="quota-bar quota-bar-slim" title={`${used} of ${max} records used`}>
                      <div
                        className={`quota-bar-fill${isFull ? ' full' : isNear ? ' near' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>
            {columns.length === 0 ? (
              <p className="empty">Add columns first to start tracking records.</p>
            ) : null}

            {isEmailConfigOpen && (
              <EmailConfigModal
                config={selectedPage?.email_config || null}
                columns={columns}
                onSave={saveEmailConfig}
                onClose={() => setIsEmailConfigOpen(false)}
                degreeType={selectedProject?.degree_type}
              />
            )}

            {/* Column creation form */}
            {showColumnForm ? (
              <div className="modal-backdrop" style={{ zIndex: 1010 }} onClick={() => setShowColumnForm(false)}>
                <form className="modal-panel column-form" onClick={(e) => e.stopPropagation()} onSubmit={addColumn} onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setShowColumnForm(false);
                }
              }}>
                <div className="modal-header">
                  <h2>{newColType === "group" ? "Add Group" : "Add Column"}</h2>
                  <button className="icon-button" type="button" onClick={() => setShowColumnForm(false)} title="Close form">
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <label className="field">
                    <span>{newColType === "group" ? "Group name" : "Column name"}</span>
                    <input
                      value={newColName}
                      onChange={(event) => setNewColName(event.target.value)}
                      placeholder={newColType === "group" ? "e.g. Email" : "e.g. University name"}
                      required
                      autoFocus
                      maxLength={30}
                    />
                  </label>
                  {newColType !== "group" && (
                    <label className="field">
                      <span>Type</span>
                      <select value={newColType} onChange={(event) => setNewColType(event.target.value as ColumnType)}>
                        {COLUMN_TYPES.map((ct) => (
                          <option key={ct.value} value={ct.value}>{ct.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {newColType !== "group" && (
                    <label className="field">
                      <span>Group (Optional)</span>
                      <select
                        value={newColGroup}
                        onChange={(event) => setNewColGroup(event.target.value)}
                      >
                        <option value="">No Group</option>
                        {tempColumns.filter(c => c.type === "group").map(g => (
                          <option key={g.name} value={g.name}>{g.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {newColType !== "group" && (
                    <label className="field bool-field">
                      <span>Unique combination check</span>
                      <div
                        className={`bool-toggle${newColUnique ? " active" : ""}`}
                        role="switch"
                        aria-checked={newColUnique}
                        tabIndex={0}
                        onClick={() => setNewColUnique(!newColUnique)}
                        onKeyDown={(event) => {
                          if (event.key === " " || event.key === "Enter") {
                            event.preventDefault();
                            setNewColUnique(!newColUnique);
                          }
                        }}
                      >
                        <span className="bool-toggle-track"><span className="bool-toggle-thumb" /></span>
                        <span className="bool-toggle-label">{newColUnique ? "Yes" : "No"}</span>
                      </div>
                    </label>
                  )}
                  {newColType === "select" ? (
                    <label className="field">
                      <span>Options (comma-separated)</span>
                      <input
                        value={newColOptions}
                        onChange={(event) => setNewColOptions(event.target.value)}
                        placeholder="Option 1, Option 2, Option 3"
                      />
                    </label>
                  ) : null}
                  {newColType === "group" && (
                    <div className="field">
                      <span>Group color</span>
                      <div className="color-picker-row">
                        {GROUP_COLORS.map(color => (
                          <button
                            key={color}
                            type="button"
                            className={`color-swatch ${newColColor === color ? 'active' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => setNewColColor(color)}
                            title={`Select color ${color}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                  <button className="primary" type="submit" disabled={isSaving}>
                    <Plus size={16} /> {isSaving ? "Adding..." : newColType === "group" ? "Add group" : "Add column"}
                  </button>
                </div>
              </form>
              </div>
            ) : null}

            {/* Edit columns form */}
            {showEditColumns ? (
              <div className="modal-backdrop" onClick={() => setShowEditColumns(false)}>
                <form className={`modal-panel column-form edit-columns-form${showColumnForm ? ' blurred' : ''}`} onClick={(e) => e.stopPropagation()} onSubmit={saveColumnEdits} onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setShowEditColumns(false);
                }
              }}>
                <div className="modal-header">
                  <h2>Edit columns</h2>
                  <button className="icon-button" type="button" onClick={() => setShowEditColumns(false)} title="Close form">
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-content edit-columns-list">
                  {tempColumns.map((col, index) => {
                    const groupColor = col.group ? tempColumns.find(c => c.type === "group" && c.name === col.group)?.color : undefined;
                    return (
                    <div key={index} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div className="edit-column-item">
                        <div className="drag-handle-reorder">
                          <button className="icon-button" style={{ padding: "4px", width: "28px", minHeight: "28px" }} type="button" disabled={index === 0} onClick={() => moveColumnUp(index)} title="Move up">
                            <ChevronUp size={16} />
                          </button>
                          <button className="icon-button" style={{ padding: "4px", width: "28px", minHeight: "28px" }} type="button" disabled={index === tempColumns.length - 1} onClick={() => moveColumnDown(index)} title="Move down">
                            <ChevronDown size={16} />
                          </button>
                        </div>
                        <input
                          className="column-name-input"
                          value={col.name}
                          onChange={(e) => renameColumn(index, e.target.value)}
                          placeholder="Column name"
                          required
                          maxLength={30}
                        />
                        {col.type !== "group" ? (
                          <>
                            <select
                              className="column-group-select"
                              value={col.group || ""}
                              onChange={(e) => updateTempColumn(index, "group", e.target.value)}
                              style={groupColor ? { 
                                backgroundColor: `${groupColor}1A`, 
                                borderColor: groupColor, 
                                color: groupColor,
                                fontWeight: 500
                              } : {}}
                            >
                              <option value="">No Group</option>
                              {tempColumns.filter(c => c.type === "group").map(g => (
                                <option key={g.name} value={g.name}>{g.name}</option>
                              ))}
                            </select>
                            <label className="column-unique-check" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={!!col.unique}
                                onChange={(e) => updateTempColumn(index, "unique", e.target.checked)}
                              />
                              Include in unique check
                            </label>
                          </>
                        ) : (
                          <div className="color-picker-row" style={{ marginTop: 0, padding: "0 8px", gridColumn: "span 2" }}>
                            {GROUP_COLORS.map(color => (
                              <button
                                key={color}
                                type="button"
                                className={`color-swatch ${col.color === color ? 'active' : ''}`}
                                style={{ backgroundColor: color, width: '18px', height: '18px', borderRadius: '50%' }}
                                onClick={() => updateTempColumn(index, "color", color)}
                                title={`Select color ${color}`}
                              />
                            ))}
                          </div>
                        )}
                        <span className="column-type-badge">{col.type}</span>
                        <button className="icon-button danger-hover" style={{ padding: "4px", width: "32px", minHeight: "32px" }} type="button" onClick={() => deleteColumnLocal(col.name)} title="Delete column">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {col.type === "select" && (
                        <SelectOptionsEditor 
                          options={col.options || []}
                          onChange={(opts) => updateTempColumn(index, "options", opts)}
                        />
                      )}
                    </div>
                    );
                  })}
                </div>
                <div className="modal-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button type="button" className="secondary" onClick={() => { setShowColumnForm(true); setNewColType("text"); }}>
                    <Plus size={16} /> Column
                  </button>
                  <button type="button" className="secondary" onClick={() => { setShowColumnForm(true); setNewColType("group"); }}>
                    <Plus size={16} /> Group
                  </button>
                  <button className="primary" style={{ marginLeft: "auto" }} type="submit">
                    Done
                  </button>
                </div>
              </form>
              </div>
            ) : null}

            {/* Record creation form */}
            {showRecordForm ? (
              <div className="modal-backdrop" onClick={cancelRecord}>
                <form className="modal-panel record-form" onClick={(e) => e.stopPropagation()} onSubmit={saveRecord} onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRecord();
                  }
                }}>
                <div className="modal-header">
                  <h2>{editingRowIndex !== null ? "Edit Record" : "Add Record"}</h2>
                  <button className="icon-button" type="button" onClick={cancelRecord} title="Close form">
                    <X size={20} />
                  </button>
                </div>
                {validationError ? <p className="validation-error" style={{ margin: "16px 24px 0" }}>{validationError}</p> : null}
                <div className="modal-content record-form-fields" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {columns.filter(col => col.type !== "group").map((col) => (
                    <TypedRecordField
                      key={col.name}
                      column={col}
                      value={recordForm[col.name] || ""}
                      files={files}
                      onChange={(value) => setRecordForm((current) => ({ ...current, [col.name]: value }))}
                      onFileUploaded={onFilesChanged || (async () => {})}
                    />
                  ))}
                </div>
                <div className="modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                  <button className="primary full" type="submit" disabled={isSaving}>
                    <Plus size={16} /> {isSaving ? "Saving..." : editingRowIndex !== null ? "Save changes" : "Add to sheet"}
                  </button>
                </div>
              </form>
              </div>
            ) : null}

            {/* Data table */}
            <div className="sheet-scroll" style={fullScreenMode ? { fontSize: '11px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' } : {}}>
              <table className="sheet-table grouped-table" style={fullScreenMode ? { fontSize: '11px' } : {}}>
                <thead>
                  <tr>
                    <th className="row-index-header" style={{ width: "40px" }}></th>
                    {renderColumns.map((rCol, cIndex) => {
                      const groupDef = columns.find(c => c.type === 'group' && c.name === rCol.groupName);
                      const groupColor = groupDef?.color || "#2f6d7a";
                      
                      if (rCol.type === 'group-control') {
                        return (
                          <th 
                            key={`ctrl-${rCol.groupName}`} 
                            className="group-control-cell"
                            style={{ 
                              width: groupDef?.width ? `${groupDef.width}px` : "130px", 
                              cursor: "pointer",
                              ...(fullScreenMode ? { padding: '4px 6px', fontSize: '11px' } : {})
                            }}
                            onClick={() => toggleGroup(rCol.groupName)}
                          >
                            <div className="column-head-text" style={{ fontWeight: 600, color: groupColor }}>
                              {rCol.groupName} {rCol.collapsed ? "▶" : "▼"}
                            </div>
                          </th>
                        );
                      } else {
                        return (
                          <th 
                            key={`col-${rCol.col.name}-${cIndex}`}
                            className={rCol.groupName ? "group-child-cell" : ""}
                            style={{ 
                              width: rCol.col.width ? `${rCol.col.width}px` : "150px", 
                              position: "relative",
                              ...(fullScreenMode ? { padding: '4px 6px', fontSize: '11px' } : {})
                            }}
                          >
                            {rCol.groupName && (
                              <span className="group-parent-indicator" style={{ color: groupColor, borderColor: groupColor, opacity: 0.9 }}>
                                {rCol.groupName}
                              </span>
                            )}
                            <div className="column-head-text">{rCol.col.name}</div>
                            <div 
                              className="col-resize-handle"
                              onMouseDown={(e) => startResizeColumn(e, rCol.originalIndex)}
                            />
                          </th>
                        );
                      }
                    })}
                    <th style={{ 
                      width: "140px", 
                      minWidth: "140px",
                      ...(fullScreenMode ? { padding: '4px 6px', fontSize: '11px', width: '100px', minWidth: '100px' } : {})
                    }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      className={[rowClass(row), focusedRowIndex === rowIndex ? "row-focused" : ""].filter(Boolean).join(" ")}
                      key={rowIndex}
                      data-row-index={rowIndex}
                    >
                      <td className="row-header" style={{ position: "relative", height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'), ...(fullScreenMode ? { padding: '2px 4px' } : {}) }}>
                        <span className="row-index">{rowIndex + 1}</span>
                        <div 
                          className="row-resize-handle"
                          onMouseDown={(e) => startResizeRow(e, rowIndex)}
                        />
                      </td>
                      {renderColumns.map((rCol, cIndex) => {
                        if (rCol.type === 'group-control') {
                          return (
                            <td
                              key={`ctrl-${rCol.groupName}`}
                              className="group-control-cell"
                              style={{
                                height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'),
                                ...(fullScreenMode ? { padding: '2px 4px' } : {})
                              }}
                            ></td>
                          );
                        } else {
                          return (
                            <td
                              key={`col-${rCol.col.name}-${cIndex}`}
                              className={rCol.groupName ? "group-child-cell" : ""}
                              style={{
                                height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'),
                                ...(fullScreenMode ? { padding: '2px 4px' } : {})
                              }}
                            >
                              <CellRenderer 
                                column={rCol.col} 
                                value={row[rCol.col.name] || ""} 
                                files={files}
                                onSave={(nextValue) => saveCellValue(rowIndex, rCol.col.name, nextValue)}
                                onFileUploaded={onFilesChanged || (async () => {})}
                              />
                            </td>
                          );
                        }
                      })}
                      <td style={{
                        height: row._height ? `${row._height}px` : (fullScreenMode ? '28px' : 'var(--sheet-row-height)'),
                        width: "140px",
                        minWidth: "140px",
                        ...(fullScreenMode ? { padding: '2px 4px', width: '100px', minWidth: '100px' } : {})
                      }}>
                        <div className="row-actions">
                          <button className="secondary" onClick={() => editRow(rowIndex)} title="Edit record" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                            <Edit size={12} />
                          </button>
                          <button className="secondary" onClick={() => openCompose(row)} title="Open email composer" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                            <Mail size={12} />
                          </button>
                          <button className="secondary danger" onClick={() => deleteRow(rowIndex)} title="Delete record" style={fullScreenMode ? { padding: '4px 6px' } : {}}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : (
          <Section title="Sheet" eyebrow="Loading">
            <p className="empty">Preparing this sheet.</p>
          </Section>
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
            <ChevronLeft size={16} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> Projects
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
          onEventClick={(event) => {
            setSelectedSheetId(String(event.sheet_id || ""));
            setSelectedPageId(String(event.page_id || ""));
            setFocusedRowIndex(typeof event.row_index === "number" ? event.row_index : Number(event.row_index));
          }}
        />

      <Section
        title="Sheets"
        eyebrow="Create and open spreadsheet-style trackers"
        action={
          <button className="primary" type="button" onClick={() => setShowCreateSheet(true)}>
            <Plus size={16} /> Create sheet
          </button>
        }
      >
        {showCreateSheet ? (
          <div className="modal-backdrop" onClick={() => setShowCreateSheet(false)}>
            <form className="modal-panel small-modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={createSheet}>
              <div className="modal-header">
                <h2>Create Sheet</h2>
                <button className="icon-button" type="button" onClick={() => setShowCreateSheet(false)} title="Close form">
                  <X size={20} />
                </button>
              </div>
              <div className="modal-content">
                <Field label="Sheet name" name="sheet_name" value={sheetName} required onChange={(_, value) => setSheetName(value)} />
              </div>
              <div className="modal-footer">
                <button className="secondary" type="button" onClick={() => setShowCreateSheet(false)}>Cancel</button>
                <button className="primary" type="submit"><Plus size={16} /> Create sheet</button>
              </div>
            </form>
          </div>
        ) : null}

        {editingSheet ? (
          <div className="modal-backdrop" onClick={() => setEditingSheet(null)}>
            <form className="modal-panel small-modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={saveSheetEdit}>
              <div className="modal-header">
                <h2>Edit columns</h2>
                <button className="icon-button" type="button" onClick={() => setEditingSheet(null)} title="Close form">
                  <X size={20} />
                </button>
              </div>
              <div className="modal-content">
                <Field label="Sheet name" name="sheet_name" value={editSheetName} required onChange={(_, value) => setEditSheetName(value)} />
              </div>
              <div className="modal-footer">
                <button className="secondary" type="button" onClick={() => setEditingSheet(null)}>Cancel</button>
                <button className="primary" type="submit">Save changes</button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="sheet-card-grid">
          {sheets.map((sheet: RecordMap) => (
             <article className="sheet-card" key={sheet.id}>
              <div className="sheet-card-header">
                <div className="sheet-card-title-row">
                  <strong>{sheet.name}</strong>
                  {(() => {
                    const used = (getSheetPage(sheet)?.rows || []).length;
                    const max = recordsPerSheetLimit;
                    const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : -1;
                    const isNear = pct >= 80;
                    const isFull = pct >= 100;
                    return (
                      <div className="sheet-quota-wrap">
                        <span className={`sheet-record-count${isFull ? ' quota-full' : isNear ? ' quota-near' : ''}`}>
                          {max > 0 ? `${used} / ${max}` : used}
                        </span>
                        {max > 0 && (
                          <div className="quota-bar" title={`${used} of ${max} records used`}>
                            <div
                              className={`quota-bar-fill${isFull ? ' full' : isNear ? ' near' : ''}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()
                  }
                </div>
                <span className="sheet-card-meta">
                  Created {formatLongDate(sheet.created_at)}
                </span>
              </div>
              <div className="sheet-card-actions">
                <div className="sheet-card-pins">
                  <button
                    className={`pin-button${sheet.is_pinned ? " active" : ""}`}
                    type="button"
                    onClick={() => updateSheetPin(sheet, { is_pinned: !sheet.is_pinned })}
                    title={sheet.is_pinned ? "Unpin from this view" : "Pin to this view"}
                  >
                    <Pin size={15} />
                  </button>
                  <button
                    className={`pin-button dashboard-pin${sheet.pinned_to_dashboard ? " active" : ""}`}
                    type="button"
                    onClick={() => {
                      updateSheetPin(sheet, { pinned_to_dashboard: !sheet.pinned_to_dashboard });
                    }}
                    title={sheet.pinned_to_dashboard ? "Remove from dashboard" : "Add to dashboard"}
                  >
                    <LayoutDashboard size={15} />
                  </button>
                </div>
                <div className="sheet-card-main-actions">
                  <button className="primary" onClick={() => openSheet(sheet)}>Open</button>
                  <button
                    className="secondary"
                    onClick={() => startEditSheet(sheet)}
                    title="Edit sheet"
                  >
                    <Edit size={15} />
                  </button>
                  <button className="secondary danger" onClick={() => deleteSheet(sheet.id)} title="Delete sheet">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}
