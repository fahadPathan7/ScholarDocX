import { FormEvent, useEffect, useState, useRef } from "react";
import { ChevronLeft, Edit, LayoutDashboard, Pin, Plus, Trash2, X } from "lucide-react";
import { Field } from "./Field";

import { PinActions } from "./PinActions";
import { Section } from "./Section";
import { EmailConfigModal, EmailConfig } from "./EmailConfigModal";
import { ProjectDashboard } from "./ProjectDashboard";
import { api, createRecord, listRecords, RecordMap, notify } from "../lib/api";
import { formatLongDate } from "../lib/date";
import { useDialog } from "./DialogProvider";
import { useUsage } from "../contexts/UsageContext";

/* Re-export shared types so external consumers don't break */
export type { ColumnType, ColumnDef, ProjectNavigationTarget } from "./sheet/sheetModel";
export { GROUP_COLORS } from "./sheet/sheetModel";

/* Sheet sub-components */
import type { SheetPage } from "./sheet/sheetModel";
import type { ProjectNavigationTarget } from "./sheet/sheetModel";
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
import { DateColorConfig, SHEET_TEMPLATES, saveCustomTemplate, getCustomTemplates } from "./sheet/sheetModel";

/* ------------------------------------------------------------------ */
/*  Main workspace component                                          */
/* ------------------------------------------------------------------ */

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [customTemplates, setCustomTemplates] = useState(() => getCustomTemplates());
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);

  /* Edit project/sheet state */
  const [editingProject, setEditingProject] = useState<RecordMap | null>(null);
  const [editProjectForm, setEditProjectForm] = useState({ name: "", degree_type: "phd", intake_term: "", status: "Active", description: "" });
  const [editingSheet, setEditingSheet] = useState<RecordMap | null>(null);
  const [editSheetName, setEditSheetName] = useState("");
  const [message, setMessage] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [lastHandledToken, setLastHandledToken] = useState<number | null>(null);
  const [projectSheetCounts, setProjectSheetCounts] = useState<Record<string, number>>({});

  const selectedProject = projects.find((item) => String(item.id) === selectedProjectId);
  const sheets = summary?.sheets || [];
  const pages: SheetPage[] = summary?.pages || [];
  const selectedSheet = sheets.find((item: RecordMap) => String(item.id) === selectedSheetId);
  const selectedPage = selectedSheetId
    ? pages.find((item) => String(item.sheet_id) === selectedSheetId)
    : pages.find((item) => String(item.id) === selectedPageId);

  /* CSV Import State */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvImportFile, setCsvImportFile] = useState<File | null>(null);

  /* Date Colors Config */
  const [showDateColorConfig, setShowDateColorConfig] = useState(false);
  const [peekRowIndex, setPeekRowIndex] = useState<number | null>(null);
  const [dateColorConfig, setDateColorConfig] = useState<DateColorConfig>(() => {
    try {
      const stored = localStorage.getItem(`scholardock_date_colors_${selectedProjectId}`);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      // ignore
    }
    return { redDays: 3, yellowDays: 7 };
  });

  useEffect(() => {
    if (selectedProjectId) {
      try {
        const stored = localStorage.getItem(`scholardock_date_colors_${selectedProjectId}`);
        if (stored) setDateColorConfig(JSON.parse(stored));
        else setDateColorConfig({ redDays: 3, yellowDays: 7 });
      } catch (e) {
        setDateColorConfig({ redDays: 3, yellowDays: 7 });
      }
    }
  }, [selectedProjectId]);

  const saveDateColorConfig = (config: DateColorConfig) => {
    setDateColorConfig(config);
    if (selectedProjectId) {
      localStorage.setItem(`scholardock_date_colors_${selectedProjectId}`, JSON.stringify(config));
    }
    setShowDateColorConfig(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Sheet page hook (all column/row state, CRUD, modals)             */
  /* ---------------------------------------------------------------- */

  const refreshSummary = async (projectId = selectedProjectId) => {
    if (!projectId) return;
    const data = await api.get<RecordMap>(`/projects/${projectId}/summary`);
    setSummary(data);
    if (selectedSheetId) {
      const nextPage = data.pages?.find((page: RecordMap) => String(page.sheet_id) === selectedSheetId);
      setSelectedPageId(nextPage ? String(nextPage.id) : "");
    }
  };

  const sheet = useSheetPage({
    selectedPageId,
    selectedPage,
    selectedProjectId,
    onToast,
    refreshSummary,
    files,
    onFilesChanged,
    recordsPerSheetLimit,
  });

  /* ---------------------------------------------------------------- */
  /*  Project/sheet data loading                                       */
  /* ---------------------------------------------------------------- */

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

  // Lock main scroll when any modal is open
  useEffect(() => {
    const anyModalOpen = sheet.showEditColumns || sheet.showColumnForm || sheet.showRecordForm || showCreateProject || showCreateSheet || !!editingProject || !!editingSheet || peekRowIndex !== null;
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.style.overflow = anyModalOpen ? "hidden" : "";
    }
    return () => {
      if (mainEl) mainEl.style.overflow = "";
    };
  }, [sheet.showEditColumns, sheet.showColumnForm, sheet.showRecordForm, showCreateProject, showCreateSheet, editingProject, editingSheet]);

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

    // 1. Create the sheet (creates a page with default columns in backend)
    const result = await api.post<RecordMap>(`/projects/${selectedProjectId}/sheets`, { name: cleanName });

    // 2. If a template is selected, immediately patch the new page with template columns
    if (selectedTemplateId !== "default") {
      const template = SHEET_TEMPLATES.find(t => t.id === selectedTemplateId) || customTemplates.find(t => t.id === selectedTemplateId);
      if (template && result.page?.id) {
        await api.patch(`/project_pages/${result.page.id}`, {
          data: { columns_json: template.columns, rows_json: [] }
        });
      }
    }

    await notify("sheet_create", { project_id: Number(selectedProjectId), sheetName: result.sheet.name, sheetId: Number(result.sheet.id) });
    onToast?.(`Sheet created: ${result.sheet.name}.`);
    setSheetName("");
    setSelectedTemplateId("default");
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

  const updateSheetPin = async (sheetItem: RecordMap, data: RecordMap) => {
    await api.patch(`/project_sheets/${sheetItem.id}`, { data });
    if (data.is_pinned !== undefined || data.pinned_to_dashboard !== undefined) {
      await notify("sheet_pin", {
        project_id: sheetItem.project_id,
        sheetName: sheetItem.name,
        actionLabel: data.pinned_to_dashboard !== undefined
          ? (data.pinned_to_dashboard ? "added to dashboard" : "removed from dashboard")
          : (data.is_pinned ? "pinned" : "unpinned")
      });
    }
    await refreshSummary();
    await onChanged?.();
  };

  const openSheet = (sheetItem: RecordMap) => {
    const page = pages.find((item) => String(item.sheet_id) === String(sheetItem.id));
    setSelectedSheetId(String(sheetItem.id));
    setSelectedPageId(page ? String(page.id) : "");
    sheet.setShowRecordForm(false);
    sheet.setShowColumnForm(false);
    setMessage("");
  };

  const getSheetPage = (sheetItem: RecordMap) => pages.find((page) => String(page.sheet_id) === String(sheetItem.id));

  /* ================================================================ */
  /*  Render: Project list (no project selected)                      */
  /* ================================================================ */

  const formatDegreeType = (type: string | undefined | null) => {
    if (!type) return "Degree TBD";
    if (type.toLowerCase() === "phd") return "PhD";
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const groupedProjects = projects.reduce<Record<string, RecordMap[]>>((acc, project) => {
    const type = (project.degree_type || "uncategorized").toLowerCase();
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
                          {(() => {
                            const count = projectSheetCounts[String(project.id)];
                            const used = count !== undefined ? count : 0;
                            const isLoading = count === undefined;
                            const max = sheetsPerProjectLimit;
                            const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : -1;
                            const isNear = pct >= 80;
                            const isFull = pct >= 100;
                            return (
                              <div className={`project-quota-wrap${isLoading ? " loading" : ""}`}>
                                <span className={`project-sheet-count${isFull ? ' quota-full' : isNear ? ' quota-near' : ''}${isLoading ? ' quota-loading' : ''}`}>
                                  {isLoading ? '...' : max > 0 ? `${used} / ${max}` : used}
                                </span>
                                {max > 0 && (
                                  <div className="quota-bar" title={isLoading ? "Loading..." : `${used} of ${max} sheets used`}>
                                    <div
                                      className={`quota-bar-fill${isFull ? ' full' : isNear ? ' near' : ''}${isLoading ? ' loading' : ''}`}
                                      style={{ width: isLoading ? '30%' : `${pct}%` }}
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
                <ChevronLeft size={16} style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }} /> Projects
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
            title={fullScreenMode ? "" : selectedPage.name}
            eyebrow={fullScreenMode ? "" : "Edit rows and columns"}
            action={!fullScreenMode ? (
              <SheetToolbarActions
                fullScreenMode={fullScreenMode}
                selectedProjectId={selectedProjectId}
                selectedPageId={selectedPageId}
                onAskAI={() => {
                  const sheetName = selectedSheet?.name || selectedPage?.name || "Sheet";
                  const projName = selectedProject?.name || "Project";
                  window.dispatchEvent(new CustomEvent("scholardocx:open-ai", {
                    detail: { contextMessage: `I'm looking at sheet "${sheetName}" in project "${projName}". Can you help me analyze it?` }
                  }));
                }}
                onExportCsv={sheet.handleExportCsv}
                onImportCsv={() => fileInputRef.current?.click()}
                onSaveTemplate={() => {
                  const name = window.prompt("Enter a name for this custom template:");
                  if (name) {
                    saveCustomTemplate(name, "Saved from " + selectedPage?.name, sheet.columns);
                    setCustomTemplates(getCustomTemplates());
                    onToast?.("Template saved.");
                  }
                }}
              />
            ) : undefined}
          >
            <SheetToolbar
              columns={sheet.columns}
              rows={sheet.rows}
              viewRows={sheet.viewRows}
              recordsPerSheetLimit={recordsPerSheetLimit}
              fullScreenMode={fullScreenMode}
              showEditColumns={sheet.showEditColumns}
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
            />
            {sheet.focusedCell ? (() => {
              const hasSelection = sheet.selectedRows.size > 0;
              // Targets: all selected rows, or just the focused row.
              const targetRows = hasSelection
                ? [...sheet.selectedRows].sort((a, b) => a - b)
                : [sheet.focusedCell.rowIndex];
              const colName = sheet.focusedCell.colName;

              // Use the first target's style as the display state in the bar.
              const firstRow = sheet.rows[targetRows[0]];
              const displayStyle = firstRow
                ? JSON.parse(firstRow._cellStyles || "{}")[colName] || {}
                : {};

              return (
                <div className="sheet-format-rail">
                  <CellStyleBar
                    style={displayStyle}
                    onChange={(patch) => {
                      if (hasSelection) {
                        sheet.bulkRowCellStyle(targetRows, patch);
                      } else {
                        sheet.saveCellStyle(sheet.focusedCell!.rowIndex, colName, patch);
                      }
                    }}
                    onClear={() => {
                      if (hasSelection) {
                        sheet.bulkClearRowFormatting(targetRows);
                      } else {
                        sheet.clearCellFormatting(sheet.focusedCell!.rowIndex, colName);
                      }
                    }}
                  />
                  {hasSelection ? (
                    <span className="format-rail-scope">
                      Applying to {targetRows.length} selected row{targetRows.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
              );
            })() : null}


            <SelectionToolbar
              selectedCount={sheet.selectedRows.size}
              onClear={sheet.clearSelection}
              onDelete={sheet.bulkDelete}
              onDuplicate={sheet.bulkDuplicate}
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
            />

            {sheet.columns.length === 0 ? (
              <p className="empty">Add columns first to start tracking records.</p>
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
              columns={sheet.columns}
              rows={sheet.rows}
              viewRows={sheet.viewRows}
              rowIndexMap={sheet.rowIndexMap}
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
            />
            <SheetFooter
              columns={sheet.columns}
              rows={sheet.rows}
              viewRows={sheet.viewRows}
              fullScreenMode={fullScreenMode}
              recordsPerSheetLimit={recordsPerSheetLimit}
            />

            {showDateColorConfig && (
              <DateColorConfigModal
                config={dateColorConfig}
                onSave={saveDateColorConfig}
                onClose={() => setShowDateColorConfig(false)}
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
              />
            )}
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
              <div className="modal-content form-grid" style={{ gap: '16px' }}>
                <Field label="Sheet name" name="sheet_name" value={sheetName} required onChange={(_, value) => {
                  setSheetName(value);
                  if (selectedTemplateId === "default") {
                    const lower = value.toLowerCase();
                    if (lower.includes("professor") || lower.includes("outreach") || lower.includes("faculty")) {
                      setSelectedTemplateId("prof_outreach");
                    } else if (lower.includes("university") || lower.includes("program") || lower.includes("shortlist")) {
                      setSelectedTemplateId("univ_shortlist");
                    } else if (lower.includes("scholarship") || lower.includes("funding")) {
                      setSelectedTemplateId("scholarship_tracker");
                    } else if (lower.includes("document") || lower.includes("checklist") || lower.includes("todo")) {
                      setSelectedTemplateId("doc_checklist");
                    }
                  }
                }} />
                <Field
                  label="Template"
                  name="template_id"
                  value={selectedTemplateId}
                  options={[
                    { value: "default", label: "Default App Tracker" },
                    { label: "--- Standard Templates ---", value: "", disabled: true },
                    ...SHEET_TEMPLATES.map(t => ({ value: t.id, label: t.name })),
                    ...(customTemplates.length > 0 ? [{ label: "--- Custom Templates ---", value: "", disabled: true }] : []),
                    ...customTemplates.map(t => ({ value: t.id, label: t.name }))
                  ]}
                  onChange={(_, value) => setSelectedTemplateId(value)}
                />
                {selectedTemplateId !== "default" && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '-8px 0 0 0' }}>
                    {SHEET_TEMPLATES.find(t => t.id === selectedTemplateId)?.description ||
                      customTemplates.find(t => t.id === selectedTemplateId)?.description}
                  </p>
                )}
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
          {sheets.map((sheetItem: RecordMap) => (
            <article className="sheet-card" key={sheetItem.id}>
              <div className="sheet-card-header">
                <div className="sheet-card-title-row">
                  <strong>{sheetItem.name}</strong>
                  {(() => {
                    const used = (getSheetPage(sheetItem)?.rows || []).length;
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
                  Created {formatLongDate(sheetItem.created_at)}
                </span>
              </div>
              <div className="sheet-card-actions">
                <div className="sheet-card-pins">
                  <button
                    className={`pin-button${sheetItem.is_pinned ? " active" : ""}`}
                    type="button"
                    onClick={() => updateSheetPin(sheetItem, { is_pinned: !sheetItem.is_pinned })}
                    title={sheetItem.is_pinned ? "Unpin from this view" : "Pin to this view"}
                  >
                    <Pin size={15} />
                  </button>
                  <button
                    className={`pin-button dashboard-pin${sheetItem.pinned_to_dashboard ? " active" : ""}`}
                    type="button"
                    onClick={() => {
                      updateSheetPin(sheetItem, { pinned_to_dashboard: !sheetItem.pinned_to_dashboard });
                    }}
                    title={sheetItem.pinned_to_dashboard ? "Remove from dashboard" : "Add to dashboard"}
                  >
                    <LayoutDashboard size={15} />
                  </button>
                </div>
                <div className="sheet-card-main-actions">
                  <button className="primary" onClick={() => openSheet(sheetItem)}>Open</button>
                  <button
                    className="secondary"
                    onClick={() => startEditSheet(sheetItem)}
                    title="Edit sheet"
                  >
                    <Edit size={15} />
                  </button>
                  <button className="secondary danger" onClick={() => deleteSheet(sheetItem.id)} title="Delete sheet">
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
