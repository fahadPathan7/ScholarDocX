/* ------------------------------------------------------------------ */
/*  ProjectsHome — the Projects root: create, find and open projects   */
/*                                                                     */
/*  Extracted from ProjectWorkspace (SCHOLARDOCX-0259). A project is a */
/*  free-form container: it needs a name and nothing else, so the      */
/*  degree type, the intake term and the per-degree grouping are gone. */
/* ------------------------------------------------------------------ */

import { FormEvent, useMemo, useState } from "react";
import { Edit, FolderPlus, LayoutDashboard, Pin, Plus, Search, Trash2, X } from "lucide-react";
import { Field } from "../Field";
import { Modal } from "../Modal";
import { Section } from "../Section";
import { useDialog } from "../DialogProvider";
import { api, createRecord, notify, RecordMap } from "../../lib/api";
import { formatLongDate } from "../../lib/date";
import { projectAccent, projectMonogram } from "./projectIdentity";
import { useLockMainScroll } from "./useLockMainScroll";

const EMPTY_FORM = { name: "", description: "" };
const STATUS_OPTIONS = ["Active", "Paused", "Complete"];
/** Below this many projects a search box is just clutter. */
const SEARCH_THRESHOLD = 7;

export function ProjectsHome({
  projects,
  sheetCounts,
  sheetsPerProjectLimit,
  onOpenProject,
  refreshProjects,
  onChanged,
  onToast,
}: {
  projects: RecordMap[];
  /** Sheet count per project id; a missing key means "still loading". */
  sheetCounts: Record<string, number>;
  sheetsPerProjectLimit: number;
  onOpenProject: (projectId: string) => void;
  refreshProjects: () => Promise<void>;
  onChanged?: () => Promise<void>;
  onToast?: (message: string) => void;
}) {
  const { showConfirm } = useDialog();

  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [editing, setEditing] = useState<RecordMap | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", status: "Active", description: "" });

  const [query, setQuery] = useState("");

  useLockMainScroll(showCreate || !!editing);

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) =>
      `${project.name || ""} ${project.description || ""}`.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const closeCreate = () => {
    setShowCreate(false);
    setForm(EMPTY_FORM);
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (isCreating || !name) return;

    setIsCreating(true);
    try {
      const project = await createRecord<RecordMap>("projects", {
        name,
        description: form.description.trim(),
        status: "Active",
      });
      await notify("project_create", { project_id: project.id, projectName: project.name, projectId: String(project.id) });
      onToast?.("Project created.");
      closeCreate();
      await refreshProjects();
      // Straight in: the next thing anyone does with a new project is add a sheet.
      onOpenProject(String(project.id));
    } catch (error) {
      console.error("Error creating project:", error);
      onToast?.("Failed to create project. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (project: RecordMap) => {
    setEditing(project);
    setEditForm({
      name: project.name || "",
      status: project.status || "Active",
      description: project.description || "",
    });
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    const name = editForm.name.trim();
    if (!editing || isSavingEdit || !name) return;
    setIsSavingEdit(true);
    try {
      await api.patch(`/projects/${editing.id}`, { data: { ...editForm, name, description: editForm.description.trim() } });
      onToast?.("Project updated.");
      setEditing(null);
      await refreshProjects();
    } catch (error) {
      console.error(error);
      onToast?.("Failed to update project.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const deleteProject = async (project: RecordMap) => {
    const confirmed = await showConfirm(
      `Delete “${project.name}”? This permanently deletes every sheet and record in it.`,
      "Delete Project",
    );
    if (!confirmed) return;
    const id = String(project.id);
    try {
      await api.delete(`/projects/${id}`);
      await notify("project_delete", { project_id: id, projectId: id, projectName: project.name });
      onToast?.("Project deleted.");
      await refreshProjects();
    } catch (error) {
      console.error("Delete project error:", error);
      onToast?.("Failed to delete project.");
    }
  };

  const updatePin = async (project: RecordMap, data: RecordMap) => {
    await api.patch(`/projects/${project.id}`, { data });
    await notify("project_pin", {
      project_id: project.id,
      projectName: project.name,
      actionLabel: data.pinned_to_dashboard !== undefined
        ? (data.pinned_to_dashboard ? "added to dashboard" : "removed from dashboard")
        : (data.is_pinned ? "pinned" : "unpinned"),
    });
    await refreshProjects();
    await onChanged?.();
  };

  return (
    <div className="project-home">
      {showCreate ? (
        <Modal onClose={closeCreate} label="Create project">
          <form className="modal-panel small-modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={createProject}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">A place for anything you want to track</p>
                <h2>New Project</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeCreate} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content stacked">
              <Field
                label="Project name"
                name="name"
                value={form.name}
                required
                placeholder="e.g., Fall 2027 applications, Visa paperwork, Reading list"
                onChange={(name, value) => setForm({ ...form, [name]: value })}
              />
              <Field
                label="Description (optional)"
                name="description"
                value={form.description}
                rows={2}
                onChange={(name, value) => setForm({ ...form, [name]: value })}
              />
            </div>
            <div className="modal-footer">
              <button className="secondary" type="button" onClick={closeCreate} disabled={isCreating}>Cancel</button>
              <button className="primary" type="submit" disabled={isCreating || !form.name.trim()}>
                <Plus size={16} /> {isCreating ? "Creating..." : "Create project"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal onClose={() => setEditing(null)} label="Edit project">
          <form className="modal-panel small-modal-panel" onClick={(event) => event.stopPropagation()} onSubmit={saveEdit}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Project details</p>
                <h2>Edit Project</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditing(null)} title="Close form">
                <X size={20} />
              </button>
            </div>
            <div className="modal-content stacked">
              <Field label="Project name" name="name" value={editForm.name} required onChange={(name, value) => setEditForm({ ...editForm, [name]: value })} />
              <Field label="Status" name="status" value={editForm.status} options={STATUS_OPTIONS} onChange={(name, value) => setEditForm({ ...editForm, [name]: value })} />
              <Field label="Description (optional)" name="description" value={editForm.description} rows={2} onChange={(name, value) => setEditForm({ ...editForm, [name]: value })} />
            </div>
            <div className="modal-footer">
              <button className="secondary" type="button" onClick={() => setEditing(null)} disabled={isSavingEdit}>Cancel</button>
              <button className="primary" type="submit" disabled={isSavingEdit || !editForm.name.trim()}>
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <Section
        title="Projects"
        eyebrow={`${projects.length} total`}
        action={(
          <div className="project-home-actions">
            {projects.length >= SEARCH_THRESHOLD ? (
              <label className="project-search">
                <Search size={15} />
                <input
                  type="search"
                  value={query}
                  placeholder="Find a project"
                  aria-label="Find a project"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            ) : null}
            <button className="primary" type="button" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> New Project
            </button>
          </div>
        )}
      >
        {projects.length === 0 ? (
          <div className="project-empty-state">
            <FolderPlus size={34} />
            <strong>No projects yet</strong>
            <p>
              A project holds the sheets for one thing you are working on: an application round,
              a scholarship search, a move abroad. Name it whatever you like.
            </p>
            <button className="primary" type="button" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create your first project
            </button>
          </div>
        ) : visibleProjects.length === 0 ? (
          <p className="empty">No project matches “{query.trim()}”.</p>
        ) : (
          <div className="project-card-grid">
            {visibleProjects.map((project) => {
              const id = String(project.id);
              const count = sheetCounts[id];
              const isLoading = count === undefined;
              const used = count ?? 0;
              const max = sheetsPerProjectLimit;
              const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : -1;
              const isNear = pct >= 80;
              const isFull = pct >= 100;
              const accent = projectAccent(id);
              const status = String(project.status || "Active");
              return (
                <article
                  className="project-card project-card--free"
                  key={id}
                  style={{ ["--project-accent" as string]: accent }}
                >
                  <div className="project-card-header">
                    <button
                      type="button"
                      className="project-card-open"
                      onClick={() => onOpenProject(id)}
                      title={`Open ${project.name}`}
                    >
                      <span className="project-monogram" aria-hidden="true">{projectMonogram(String(project.name || ""))}</span>
                      <span className="project-card-title">
                        <strong>{project.name}</strong>
                        <span className="project-card-sub" title={`Created ${formatLongDate(project.created_at)}`}>
                          <span>
                            {isLoading
                              ? "…"
                              : max > 0
                                ? `${used} of ${max} sheets`
                                : `${used} sheet${used === 1 ? "" : "s"}`}
                          </span>
                          <span>{formatLongDate(project.created_at)}</span>
                        </span>
                      </span>
                    </button>
                    {max > 0 ? (
                      <div className="quota-bar" title={isLoading ? "Loading..." : `${used} of ${max} sheets used`}>
                        <div
                          className={`quota-bar-fill${isFull ? " full" : isNear ? " near" : ""}${isLoading ? " loading" : ""}`}
                          style={{ width: isLoading ? "30%" : `${pct}%` }}
                        />
                      </div>
                    ) : null}
                    {status !== "Active" || project.intake_term ? (
                      <span className="project-card-meta">
                        {status !== "Active" ? (
                          <span className={`project-chip project-chip-status status-${status.toLowerCase()}`}>{status}</span>
                        ) : null}
                        {project.intake_term ? <span className="project-card-intake">{project.intake_term}</span> : null}
                      </span>
                    ) : null}
                    {project.description ? <p className="project-card-desc">{project.description}</p> : null}
                  </div>
                  <div className="project-card-actions">
                    <div className="project-card-pins">
                      <button
                        className={`pin-button${project.is_pinned ? " active" : ""}`}
                        type="button"
                        onClick={() => updatePin(project, { is_pinned: !project.is_pinned })}
                        title={project.is_pinned ? "Unpin from this view" : "Pin to this view"}
                      >
                        <Pin size={15} />
                      </button>
                      <button
                        className={`pin-button dashboard-pin${project.pinned_to_dashboard ? " active" : ""}`}
                        type="button"
                        onClick={() => updatePin(project, { pinned_to_dashboard: !project.pinned_to_dashboard })}
                        title={project.pinned_to_dashboard ? "Remove from dashboard" : "Add to dashboard"}
                      >
                        <LayoutDashboard size={15} />
                      </button>
                    </div>
                    <div className="project-card-main-actions">
                      <button className="primary" type="button" onClick={() => onOpenProject(id)}>Open</button>
                      <button className="secondary" type="button" onClick={() => startEdit(project)} title="Edit project">
                        <Edit size={15} />
                      </button>
                      <button className="secondary danger" type="button" onClick={() => deleteProject(project)} title="Delete project">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
