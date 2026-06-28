import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, CheckSquare2, Edit, Eye, ListChecks, Palette, Plus, StickyNote, Trash2, X, PenTool, Pin, FileText } from "lucide-react";
import { api, deleteRecord, notify, RecordMap } from "../lib/api";
import { formatLongDate } from "../lib/date";
import { useDialog } from "./DialogProvider";
import "./sticky-notes.css";

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type NoteDraft = {
  title: string;
  body: string;
  color: string;
  is_checklist: boolean;
  checklist: ChecklistItem[];
  is_sketch: boolean;
  sketch_paths: string[];
  font: string;
  font_size: string;
};

const noteColors = [
  { key: "sun", label: "Sun", swatch: "#f8dfa3" },
  { key: "mint", label: "Mint", swatch: "#caead8" },
  { key: "sky", label: "Sky", swatch: "#c9e3f5" },
  { key: "rose", label: "Rose", swatch: "#f3c8c8" },
  { key: "lilac", label: "Lilac", swatch: "#ddd0f2" },
  { key: "sand", label: "Sand", swatch: "#eadcc4" }
];

const emptyDraft: NoteDraft = {
  title: "",
  body: "",
  color: "sun",
  is_checklist: false,
  checklist: [],
  is_sketch: false,
  sketch_paths: [],
  font: "caveat",
  font_size: "medium"
};

const noteFonts = [
  { key: "caveat", label: "Handwriting", text: "Aa" },
  { key: "sans", label: "Modern", text: "Aa" },
  { key: "serif", label: "Classic", text: "Aa" },
  { key: "mono", label: "Code", text: "Aa" }
];

const noteSizes = [
  { key: "small", label: "Small", text: "S" },
  { key: "medium", label: "Medium", text: "M" },
  { key: "large", label: "Large", text: "L" }
];

function parseNoteBody(body: string): { text: string, sketchPaths: string[] | null } {
  if (!body) return { text: "", sketchPaths: null };
  if (body.trim().startsWith('{')) {
    try {
      const data = JSON.parse(body);
      if (data.type === 'sketch' && Array.isArray(data.paths)) {
        return { text: "", sketchPaths: data.paths };
      }
      if (data.type === 'mixed' && Array.isArray(data.paths)) {
        return { text: data.text || "", sketchPaths: data.paths };
      }
    } catch {
      // fallback
    }
  }
  return { text: body, sketchPaths: null };
}

function parseSketch(body: string): string[] | null {
  return parseNoteBody(body).sketchPaths;
}

function parseText(body: string): string {
  return parseNoteBody(body).text;
}

function SketchCanvas({
  paths,
  onChange,
  readOnly = false,
  width = "100%",
  height = "180px"
}: {
  paths: string[];
  onChange?: (paths: string[]) => void;
  readOnly?: boolean;
  width?: string | number;
  height?: string | number;
}) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPath(`M ${x} ${y}`);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (readOnly || currentPath === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPath((prev) => `${prev} L ${x} ${y}`);
  };

  const handlePointerUp = () => {
    if (readOnly || currentPath === null) return;
    if (onChange) {
      onChange([...paths, currentPath]);
    }
    setCurrentPath(null);
  };

  return (
    <svg
      style={{
        width,
        height,
        background: readOnly ? "transparent" : "rgba(255, 255, 255, 0.4)",
        borderRadius: "8px",
        touchAction: "none",
        cursor: readOnly ? "default" : "crosshair",
        marginTop: readOnly ? 0 : "8px"
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {paths.map((p, i) => (
        <path key={i} d={p} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {currentPath && (
        <path d={currentPath} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function parseChecklist(note: RecordMap): ChecklistItem[] {
  try {
    const parsed = JSON.parse(note.checklist_json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function StickyNotesView({ onToast, refreshTrigger }: { onToast: (msg: string) => void, refreshTrigger?: number }) {
  const { showConfirm, showAlert } = useDialog();
  const [notes, setNotes] = useState<RecordMap[]>([]);
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft);
  const [editingNote, setEditingNote] = useState<RecordMap | null>(null);
  const [viewingNote, setViewingNote] = useState<RecordMap | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemText, setItemText] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  const sortedNotes = useMemo(() => {
    let filtered = notes;
    if (activeFilter !== "All") {
      filtered = notes.filter(n => (n.color || "sun").toLowerCase() === activeFilter.toLowerCase());
    }
    return [...filtered].sort((a, b) => {
      const pinA = a.is_pinned ? 1 : 0;
      const pinB = b.is_pinned ? 1 : 0;
      if (pinA !== pinB) {
        return pinB - pinA;
      }
      return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
    });
  }, [notes, activeFilter]);

  const loadNotes = async () => {
    setNotes(await api.get<RecordMap[]>("/sticky_notes"));
  };

  useEffect(() => {
    loadNotes().catch((error) => onToast(error.message));
  }, []);

  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadNotes().catch((error) => onToast(error.message));
    }
  }, [refreshTrigger]);

  const resetDraft = () => {
    setDraft(emptyDraft);
    setEditingNote(null);
    setItemText("");
    setIsModalOpen(false);
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setEditingNote(null);
    setItemText("");
    setIsModalOpen(true);
  };

  const openEdit = (note: RecordMap) => {
    setViewingNote(null);
    setEditingNote(note);
    const parsed = parseNoteBody(note.body || "");
    setDraft({
      title: note.title || "",
      body: parsed.text,
      color: note.color || "sun",
      is_checklist: Boolean(note.is_checklist),
      checklist: parseChecklist(note),
      is_sketch: parsed.sketchPaths !== null,
      sketch_paths: parsed.sketchPaths || [],
      font: note.font || "caveat",
      font_size: note.font_size || "medium"
    });
    setItemText("");
    setIsModalOpen(true);
  };

  const addChecklistItem = () => {
    const text = itemText.trim();
    if (!text) return;
    setDraft((current) => ({
      ...current,
      is_checklist: true,
      is_sketch: false,
      checklist: [...current.checklist, { id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2), text, done: false }]
    }));
    setItemText("");
  };

  const toggleDraftItem = (id: string) => {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) => item.id === id ? { ...item, done: !item.done } : item)
    }));
  };

  const removeDraftItem = (id: string) => {
    setDraft((current) => ({ ...current, checklist: current.checklist.filter((item) => item.id !== id) }));
  };

  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    let finalBody = draft.body.trim();
    if (draft.is_sketch && draft.sketch_paths && draft.sketch_paths.length > 0) {
      if (finalBody) {
        finalBody = JSON.stringify({ type: "mixed", text: finalBody, paths: draft.sketch_paths });
      } else {
        finalBody = JSON.stringify({ type: "sketch", paths: draft.sketch_paths });
      }
    }
    const title = draft.title.trim() || (draft.is_checklist ? "Checklist" : draft.is_sketch ? "Sketch" : "Untitled note");
    if (!finalBody && !draft.checklist.length && !(draft.is_sketch && draft.sketch_paths.length)) {
      onToast("Please add some content — body, checklist, or a sketch.");
      return;
    }
    const data = {
      title,
      body: finalBody,
      color: draft.color,
      is_bold: false,
      is_checklist: draft.is_checklist,
      checklist_json: JSON.stringify(draft.checklist),
      font: draft.font,
      font_size: draft.font_size
    };
    if (editingNote) {
      await api.patch(`/sticky_notes/${editingNote.id}`, { data });
      await notify("sticky_note_update", { sheetName: title });
      onToast("Sticky note updated.");
    } else {
      await api.post("/sticky_notes", { data });
      await notify("sticky_note_create", { sheetName: title });
      onToast("Sticky note created.");
    }
    resetDraft();
    await loadNotes();
  };

  const deleteNote = async (note: RecordMap) => {
    const confirmed = await showConfirm(`Delete "${note.title || "this note"}"?`, "Delete Note");
    if (!confirmed) return;
    await deleteRecord("sticky_notes", note.id);
    await notify("sticky_note_delete", { sheetName: note.title || "Untitled note" });
    onToast("Sticky note deleted.");
    await loadNotes();
  };

  const toggleSavedItem = async (note: RecordMap, itemId: string) => {
    const nextItems = parseChecklist(note).map((item) => item.id === itemId ? { ...item, done: !item.done } : item);
    const updatedNote = { ...note, checklist_json: JSON.stringify(nextItems) };
    if (viewingNote?.id === note.id) {
      setViewingNote(updatedNote);
    }
    setNotes(notes.map(n => n.id === note.id ? updatedNote : n));
    await api.patch(`/sticky_notes/${note.id}`, { data: { checklist_json: JSON.stringify(nextItems) } });
    await loadNotes();
  };

  const togglePin = async (note: RecordMap) => {
    const isPinned = note.is_pinned ? 0 : 1;
    const updatedNote = { ...note, is_pinned: isPinned };
    setNotes(prev => prev.map(n => n.id === note.id ? updatedNote : n));
    await api.patch(`/sticky_notes/${note.id}`, { data: { is_pinned: isPinned } });
    await loadNotes();
  };

  const shouldShowView = (note: RecordMap, items: ChecklistItem[]) =>
    (note.body || "").length > 120 || items.length > 3;
  return (
    <div className="sticky-notes-view">
      <section className="sticky-board">
        <div className="sticky-board-head">
          <div>
            <p className="eyebrow">{notes.length} note{notes.length === 1 ? "" : "s"}</p>
            <h2>Sticky Notes</h2>
          </div>
          <button className="primary" type="button" onClick={openCreate}>
            <Plus size={16} /> Create note
          </button>
        </div>

        <div className="filter-row" style={{ display: 'flex', gap: 8, padding: '0 24px', marginBottom: 16, marginTop: 12, alignItems: 'center' }}>
          <button
            className={`filter-chip ${activeFilter === 'All' ? 'active' : ''}`}
            onClick={() => setActiveFilter('All')}
          >
            All
          </button>
          {noteColors.map(c => (
            <button
              key={c.key}
              className={`sticky-swatch ${activeFilter.toLowerCase() === c.key ? 'selected' : ''}`}
              style={{ backgroundColor: c.swatch, width: 28, height: 28, margin: 0 }}
              onClick={() => setActiveFilter(c.label)}
              title={c.label}
              type="button"
            />
          ))}
        </div>

        {sortedNotes.length ? (
          <div className="sticky-card-grid">
            {sortedNotes.map((note, index) => (
              <NoteCard
                key={note.id}
                note={note}
                index={index}
                openEdit={openEdit}
                deleteNote={deleteNote}
                setViewingNote={setViewingNote}
                toggleSavedItem={toggleSavedItem}
                togglePin={togglePin}
              />
            ))}
          </div>
        ) : (
          <div className="sticky-empty">
            <StickyNote size={40} />
            <strong>Your board is clear.</strong>
            <span>Capture the next useful thought.</span>
            <button className="primary" type="button" onClick={openCreate}>
              <Plus size={16} /> Create note
            </button>
          </div>
        )}
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" onClick={resetDraft}>
          <form className={`modal-panel sticky-note-modal color-${draft.color || "sun"} font-${draft.font || "caveat"} size-${draft.font_size || "medium"}`} onClick={(event) => event.stopPropagation()} onSubmit={saveNote}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{editingNote ? "Update note" : "Quick capture"}</p>
                <h2>{editingNote ? "Edit sticky note" : "Create sticky note"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={resetDraft} title="Close note form"><X size={18} /></button>
            </div>
            <div className="modal-content sticky-note-form">
              <div className="sticky-tools">
                <div className="sticky-color-row" aria-label="Note colors">
                  <Palette size={16} />
                  {noteColors.map((color) => (
                    <button
                      key={color.key}
                      className={draft.color === color.key ? "sticky-swatch selected" : "sticky-swatch"}
                      style={{ backgroundColor: color.swatch }}
                      type="button"
                      onClick={() => setDraft({ ...draft, color: color.key })}
                      title={color.label}
                    />
                  ))}
                </div>
                <div className="sticky-format-row">
                  <div className="sticky-font-row" aria-label="Note fonts">
                    <span style={{ fontSize: '14px', marginRight: '4px', opacity: 0.8 }}>T</span>
                    {noteFonts.map((font) => (
                      <button
                        key={font.key}
                        className={draft.font === font.key ? `sticky-font-btn selected font-${font.key}` : `sticky-font-btn font-${font.key}`}
                        type="button"
                        onClick={() => setDraft({ ...draft, font: font.key })}
                        title={font.label}
                      >
                        {font.text}
                      </button>
                    ))}
                  </div>
                  <div className="sticky-font-row" aria-label="Note font sizes">
                    <span style={{ fontSize: '14px', marginRight: '4px', opacity: 0.8 }}><Eye size={14} /></span>
                    {noteSizes.map((size) => (
                      <button
                        key={size.key}
                        className={draft.font_size === size.key ? `sticky-font-btn selected` : `sticky-font-btn`}
                        type="button"
                        onClick={() => setDraft({ ...draft, font_size: size.key })}
                        title={size.label}
                        style={{ fontSize: size.key === 'small' ? '12px' : size.key === 'large' ? '16px' : '14px' }}
                      >
                        {size.text}
                      </button>
                    ))}
                  </div>
                </div>
                <button className={draft.is_checklist ? "sticky-tool active" : "sticky-tool"} type="button" onClick={() => setDraft({ ...draft, is_checklist: !draft.is_checklist })}>
                  <ListChecks size={16} /> Checklist
                </button>
                <button className={draft.is_sketch ? "sticky-tool active" : "sticky-tool"} type="button" onClick={() => setDraft({ ...draft, is_sketch: !draft.is_sketch })}>
                  <PenTool size={16} /> Sketch
                </button>
              </div>
              <input
                className="sticky-title-input"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Note title"
              />
              <textarea
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                placeholder="Write a quick thought..."
                rows={3}
              />
              {draft.is_checklist ? (
                <div className="sticky-check-editor">
                  <div className="sticky-check-add">
                    <input value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Add checklist item" />
                    <button type="button" onClick={addChecklistItem}><Plus size={16} /></button>
                  </div>
                  <div className="sticky-check-items">
                    {draft.checklist.map((item) => (
                      <div className="sticky-check-row" key={item.id}>
                        <button type="button" onClick={() => toggleDraftItem(item.id)}>{item.done ? <CheckSquare2 size={17} /> : <span />}</button>
                        <span className={item.done ? "done" : ""}>{item.text}</span>
                        <button className="ghost-danger" type="button" onClick={() => removeDraftItem(item.id)}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {draft.is_sketch ? (
                <div style={{ position: "relative" }}>
                  <SketchCanvas paths={draft.sketch_paths} onChange={(paths) => setDraft({ ...draft, sketch_paths: paths })} height={400} />
                  <button 
                    type="button" 
                    onClick={() => setDraft({ ...draft, sketch_paths: [] })} 
                    className="icon-button compact ghost-danger" 
                    style={{ position: "absolute", top: "12px", right: "4px" }}
                    title="Clear sketch"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="secondary" type="button" onClick={resetDraft}>Cancel</button>
              <button className="primary" type="submit">
                {editingNote ? <Check size={16} /> : <Plus size={16} />}
                {editingNote ? "Save note" : "Create note"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {viewingNote ? (
        <div className="modal-backdrop" onClick={() => setViewingNote(null)}>
          <div className={`modal-panel sticky-view-modal color-${viewingNote.color || "sun"} font-${viewingNote.font || "caveat"} size-${viewingNote.font_size || "medium"}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Full sticky note</p>
                <h2 className="sticky-view-title">{viewingNote.title || "Untitled note"}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setViewingNote(null)} title="Close full note"><X size={18} /></button>
            </div>
            <div className="modal-content sticky-view-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {parseText(viewingNote.body || "") ? (
                <div style={{ border: '1px dashed rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                  <p className="sticky-body" style={{ margin: 0 }}>{parseText(viewingNote.body || "")}</p>
                </div>
              ) : null}
              {viewingNote.is_checklist ? (
                <div style={{ border: '1px dashed rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                  <div className="sticky-check-list expanded">
                    {parseChecklist(viewingNote).map((item) => (
                      <div className={`check-item ${item.done ? "checked" : ""}`} key={item.id}>
                        <span>{item.done ? <Check size={13} /> : null}</span>
                        {item.text}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {parseSketch(viewingNote.body || "") ? (
                <div style={{ border: '1px dashed rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                  <SketchCanvas paths={parseSketch(viewingNote.body || "") || []} readOnly height={400} />
                </div>
              ) : null}
            </div>
            <div className="modal-footer sticky-view-footer">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', gridArea: 'date', justifySelf: 'start' }}>
                <span className="sticky-view-date" style={{ gridArea: 'unset', justifySelf: 'unset' }}>
                  Created: {new Date(viewingNote.created_at || viewingNote.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {new Date(viewingNote.created_at || viewingNote.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
                <span className="sticky-view-date" style={{ gridArea: 'unset', justifySelf: 'unset' }}>
                  Updated: {new Date(viewingNote.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}
                  {new Date(viewingNote.updated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </span>
              </div>
              <div className="sticky-view-main-actions">
                <button className="primary" type="button" onClick={() => openEdit(viewingNote)}>
                  <Edit size={16} /> Edit note
                </button>
                <button
                  className="icon-button compact sticky-view-delete-icon"
                  type="button"
                  onClick={() => { deleteNote(viewingNote); setViewingNote(null); }}
                  aria-label="Delete note"
                  title="Delete note"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NoteCard({
  note,
  index,
  openEdit,
  deleteNote,
  setViewingNote,
  toggleSavedItem,
  togglePin
}: {
  note: RecordMap;
  index: number;
  openEdit: (n: RecordMap) => void;
  deleteNote: (n: RecordMap) => void;
  setViewingNote: (n: RecordMap) => void;
  toggleSavedItem: (n: RecordMap, id: string) => void;
  togglePin: (n: RecordMap) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const items = parseChecklist(note);
  const isSketch = parseSketch(note.body || "");
  const textBody = parseText(note.body || "");
  const shouldShowView = (n: RecordMap, itms: ChecklistItem[]) => parseText(n.body || "").length > 120 || itms.length > 3;
  const isLongNote = shouldShowView(note, items) || (isSketch && isSketch.length > 15);
  const visibleItems = isLongNote ? items.slice(0, 3) : items;
  const hiddenItemCount = Math.max(0, items.length - visibleItems.length);
  
  // Show "+ more" if there's hidden content: text not shown, hidden items, sketch (always clipped), or long text
  const hasHiddenContent = (textBody && note.is_checklist) || hiddenItemCount > 0 || (isLongNote && !note.is_checklist) || (isSketch && isSketch.length > 0);
  const moreBadgeText = hasHiddenContent ? "+ more" : null;
  
  const doneCount = items.filter((item) => item.done).length;
  const totalCount = items.length;

  return (
    <article 
      className={`sticky-card color-${note.color || "sun"} font-${note.font || "caveat"} size-${note.font_size || "medium"} tilt-${index % 4}${isLongNote ? " has-view" : ""}`}
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={() => setViewingNote(note)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered || note.is_pinned ? (
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, zIndex: 100 }}>
          <button 
            type="button"
            className={`sticky-action-btn ${note.is_pinned ? 'active' : ''}`}
            aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
            onClick={(e) => { 
              e.preventDefault(); 
              e.stopPropagation(); 
              togglePin(note); 
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={note.is_pinned ? "Unpin note" : "Pin note"}
            style={note.is_pinned ? { opacity: 1, pointerEvents: 'auto' } : { pointerEvents: 'auto' }}
          >
            <Pin size={13} fill={note.is_pinned ? "currentColor" : "none"} />
          </button>
        </div>
      ) : null}
      <div className="sticky-card-head">
        <div className="sticky-title-wrap">
          <div className="note-title" style={{ fontWeight: 600 }}>{note.title || "Untitled"}</div>
        </div>
      </div>
      
      <div className="sticky-card-content">
        {textBody ? (
          <>
            <p className="sticky-body">{textBody}</p>
          </>
        ) : null}
        
        {isSketch ? (
          <SketchCanvas paths={isSketch} readOnly height="100%" />
        ) : null}
        
        {note.is_checklist ? (
          <div className="sticky-check-list">
            {visibleItems.map((item) => (
              <div className={`check-item ${item.done ? "checked" : ""}`} key={item.id}>
                <span>{item.done ? <Check size={13} /> : null}</span>
                {item.text}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="sticky-card-meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
          {note.is_checklist ? (
            <div className="sticky-badge sticky-badge-checklist" title={`${totalCount} items · ${doneCount} done`}>
              <ListChecks size={13} />
              <span className="sticky-badge-text">{doneCount}/{totalCount}</span>
            </div>
          ) : null}
          {textBody ? (
            <div className="sticky-badge sticky-badge-icon" title="Has description">
              <FileText size={13} />
            </div>
          ) : null}
          {isSketch ? (
            <div className="sticky-badge sticky-badge-icon" title="Has sketch">
              <PenTool size={13} />
            </div>
          ) : null}
          {moreBadgeText ? <div className="sticky-more">{moreBadgeText}</div> : null}
        </div>
        <small className="sticky-card-date">
          {new Date(note.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).replace(',', '')}
        </small>
      </div>
    </article>
  );
}
