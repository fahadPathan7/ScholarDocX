import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, CheckSquare2, Eye, ListChecks, Palette, PenTool, Plus, Trash2, X } from "lucide-react";
import { SketchCanvas } from "./SketchCanvas";
import { TagInput } from "./TagInput";
import { NOTE_COLORS } from "./NoteToolbar";
import { buildNoteBody, parseChecklist, parseNoteBody, parseTags, serializeTags, type ChecklistItem, type Note } from "../../lib/stickyNotes";

const NOTE_FONTS = [
  { key: "caveat", label: "Handwriting" },
  { key: "sans", label: "Modern" },
  { key: "serif", label: "Classic" },
  { key: "mono", label: "Code" },
];

const NOTE_SIZES = [
  { key: "small", label: "Small", text: "S" },
  { key: "medium", label: "Medium", text: "M" },
  { key: "large", label: "Large", text: "L" },
];

/** Autosave delay. Long enough not to fire mid-word, short enough that
 *  closing the panel a beat after typing has already saved. */
const AUTOSAVE_MS = 900;

export type NoteDraft = {
  title: string;
  body: string;
  color: string;
  is_checklist: boolean;
  checklist: ChecklistItem[];
  is_sketch: boolean;
  sketch_paths: string[];
  font: string;
  font_size: string;
  tags: string[];
  due_at: string;
};

export const emptyDraft: NoteDraft = {
  title: "",
  body: "",
  color: "sun",
  is_checklist: false,
  checklist: [],
  is_sketch: false,
  sketch_paths: [],
  font: "caveat",
  font_size: "medium",
  tags: [],
  due_at: "",
};

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Build a draft from an existing note, for editing. */
export function draftFromNote(note: Note): NoteDraft {
  const parsed = parseNoteBody(note.body || "");
  return {
    title: note.title || "",
    body: parsed.text,
    color: note.color || "sun",
    is_checklist: Boolean(note.is_checklist),
    checklist: parseChecklist(note),
    is_sketch: parsed.sketchPaths !== null,
    sketch_paths: parsed.sketchPaths || [],
    font: note.font || "caveat",
    font_size: note.font_size || "medium",
    tags: parseTags(note),
    // <input type="datetime-local"> wants a local "YYYY-MM-DDTHH:mm" string,
    // and will silently show nothing for anything else — including the ISO
    // string with a timezone that the API returns.
    due_at: note.due_at ? toLocalInput(new Date(note.due_at)) : "",
  };
}

export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The payload the API expects. Exported so the container can reuse it. */
export function draftToPayload(draft: NoteDraft) {
  const body = buildNoteBody(draft.body, draft.is_sketch ? draft.sketch_paths : []);
  const title =
    draft.title.trim() || (draft.is_checklist ? "Checklist" : draft.is_sketch ? "Sketch" : "Untitled note");
  return {
    title,
    body,
    color: draft.color,
    is_checklist: draft.is_checklist,
    checklist_json: JSON.stringify(draft.checklist),
    font: draft.font,
    font_size: draft.font_size,
    tags_json: serializeTags(draft.tags),
    // "" rather than null: the API normalizes an empty string to NULL for
    // this column, and JSON has no other way to say "clear this".
    due_at: draft.due_at ? new Date(draft.due_at).toISOString() : "",
  };
}

export const draftIsEmpty = (draft: NoteDraft): boolean =>
  !draft.body.trim() && !draft.checklist.length && !(draft.is_sketch && draft.sketch_paths.length) && !draft.title.trim();

export type SaveState = "idle" | "saving" | "saved";

/**
 * Create/edit panel (SCHOLARDOCX-0201).
 *
 * Autosaves while editing an existing note. It deliberately does **not**
 * autosave a brand-new note: that would litter the board with blank notes
 * from anyone who opened the composer and changed their mind, so a new note
 * is created once, explicitly, and autosaves from then on.
 */
export function NoteComposer({
  draft,
  editing,
  knownTags,
  saveState,
  onChange,
  onSave,
  onClose,
}: {
  draft: NoteDraft;
  editing: Note | null;
  knownTags: { tag: string; count: number }[];
  saveState: SaveState;
  onChange: (draft: NoteDraft) => void;
  onSave: (draft: NoteDraft, auto?: boolean) => void;
  onClose: () => void;
}) {
  const [itemText, setItemText] = useState("");
  const set = (patch: Partial<NoteDraft>) => onChange({ ...draft, ...patch });

  // Autosave: only for an existing note, and only once something changed.
  const serialized = useMemo(() => JSON.stringify(draftToPayload(draft)), [draft]);
  const lastSaved = useRef(serialized);
  useEffect(() => {
    if (!editing || serialized === lastSaved.current) return;
    const timer = window.setTimeout(() => {
      lastSaved.current = serialized;
      onSave(draft, true);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [serialized, editing, draft, onSave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") onSave(draft);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onSave, draft]);

  const addItem = () => {
    const text = itemText.trim();
    if (!text) return;
    set({
      is_checklist: true,
      checklist: [...draft.checklist, { id: newId(), text, done: false }],
    });
    setItemText("");
  };

  return (
    <div className="modal-backdrop modal-backdrop-main" onClick={onClose}>
      <form
        className={`modal-panel sticky-note-modal color-${draft.color} font-${draft.font} size-${draft.font_size}`}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{editing ? "Editing" : "Quick capture"}</p>
            <h2>{editing ? "Edit sticky note" : "Create sticky note"}</h2>
          </div>
          <div className="sticky-header-right">
            {editing ? (
              <span className={`sticky-save-state ${saveState}`} role="status">
                {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Saves as you type"}
              </span>
            ) : null}
            <button className="icon-button" type="button" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-content sticky-note-form">
          <div className="sticky-tools">
            <div className="sticky-color-row" aria-label="Note colour">
              <Palette size={16} />
              {NOTE_COLORS.map((color) => (
                <button
                  key={color.key}
                  className={draft.color === color.key ? "sticky-swatch selected" : "sticky-swatch"}
                  style={{ backgroundColor: color.swatch }}
                  type="button"
                  onClick={() => set({ color: color.key })}
                  title={color.label}
                  aria-label={color.label}
                  aria-pressed={draft.color === color.key}
                />
              ))}
            </div>
            <div className="sticky-format-row">
              <div className="sticky-font-row" aria-label="Font">
                <span className="sticky-font-legend">T</span>
                {NOTE_FONTS.map((font) => (
                  <button
                    key={font.key}
                    className={`sticky-font-btn font-${font.key}${draft.font === font.key ? " selected" : ""}`}
                    type="button"
                    onClick={() => set({ font: font.key })}
                    title={font.label}
                    aria-pressed={draft.font === font.key}
                  >
                    Aa
                  </button>
                ))}
              </div>
              <div className="sticky-font-row" aria-label="Text size">
                <span className="sticky-font-legend"><Eye size={14} /></span>
                {NOTE_SIZES.map((size) => (
                  <button
                    key={size.key}
                    className={`sticky-font-btn size-${size.key}${draft.font_size === size.key ? " selected" : ""}`}
                    type="button"
                    onClick={() => set({ font_size: size.key })}
                    title={size.label}
                    aria-pressed={draft.font_size === size.key}
                  >
                    {size.text}
                  </button>
                ))}
              </div>
            </div>
            <button
              className={draft.is_checklist ? "sticky-tool active" : "sticky-tool"}
              type="button"
              onClick={() => set({ is_checklist: !draft.is_checklist })}
              aria-pressed={draft.is_checklist}
            >
              <ListChecks size={16} /> Checklist
            </button>
            <button
              className={draft.is_sketch ? "sticky-tool active" : "sticky-tool"}
              type="button"
              onClick={() => set({ is_sketch: !draft.is_sketch })}
              aria-pressed={draft.is_sketch}
            >
              <PenTool size={16} /> Sketch
            </button>
          </div>

          <input
            className="sticky-title-input"
            value={draft.title}
            onChange={(event) => set({ title: event.target.value })}
            placeholder="Note title"
            aria-label="Note title"
            autoFocus
          />
          <textarea
            value={draft.body}
            onChange={(event) => set({ body: event.target.value })}
            placeholder="Write a quick thought…"
            aria-label="Note body"
            rows={3}
          />

          <div className="sticky-meta-row">
            <label className="sticky-due-field">
              <CalendarClock size={14} aria-hidden="true" />
              <span>Due</span>
              <input
                type="datetime-local"
                value={draft.due_at}
                onChange={(event) => set({ due_at: event.target.value })}
                aria-label="Due date and time"
              />
              {draft.due_at ? (
                <button type="button" onClick={() => set({ due_at: "" })} aria-label="Clear due date">
                  <X size={12} />
                </button>
              ) : null}
            </label>
            <TagInput tags={draft.tags} known={knownTags} onChange={(tags) => set({ tags })} />
          </div>

          {draft.is_checklist ? (
            <div className="sticky-check-editor">
              <div className="sticky-check-add">
                <input
                  value={itemText}
                  onChange={(event) => setItemText(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter adds the item instead of submitting the form —
                    // building a list should not close the panel.
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addItem();
                  }}
                  placeholder="Add checklist item"
                  aria-label="Add checklist item"
                />
                <button type="button" onClick={addItem} aria-label="Add item"><Plus size={16} /></button>
              </div>
              <div className="sticky-check-items">
                {draft.checklist.map((item) => (
                  <div className="sticky-check-row" key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        set({
                          checklist: draft.checklist.map((existing) =>
                            existing.id === item.id ? { ...existing, done: !existing.done } : existing,
                          ),
                        })
                      }
                      aria-pressed={item.done}
                      aria-label={item.done ? `Mark ${item.text} not done` : `Mark ${item.text} done`}
                    >
                      {item.done ? <CheckSquare2 size={17} /> : <span />}
                    </button>
                    <span className={item.done ? "done" : ""}>{item.text}</span>
                    <button
                      className="ghost-danger"
                      type="button"
                      onClick={() => set({ checklist: draft.checklist.filter((existing) => existing.id !== item.id) })}
                      aria-label={`Remove ${item.text}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {draft.is_sketch ? (
            <div className="sticky-sketch-wrap">
              <SketchCanvas
                paths={draft.sketch_paths}
                onChange={(paths) => set({ sketch_paths: paths })}
                height={340}
              />
              <button
                type="button"
                onClick={() => set({ sketch_paths: [] })}
                className="icon-button compact ghost-danger sticky-sketch-clear"
                title="Clear sketch"
                aria-label="Clear sketch"
                disabled={!draft.sketch_paths.length}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="modal-footer sticky-composer-footer">
          <span className="sticky-hint">Ctrl+Enter saves · Esc closes</span>
          <div className="sticky-composer-actions">
            <button className="secondary" type="button" onClick={onClose}>
              {editing ? "Done" : "Cancel"}
            </button>
            <button className="primary" type="submit" disabled={draftIsEmpty(draft)}>
              {editing ? <Check size={16} /> : <Plus size={16} />}
              {editing ? "Save note" : "Create note"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
