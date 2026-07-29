import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Plus, RotateCcw, Search, StickyNote } from "lucide-react";
import { api, deleteRecord, notify, RecordMap } from "../../lib/api";
import { useDialog } from "../DialogProvider";
import { NoteCard } from "./NoteCard";
import { NoteComposer, draftFromNote, draftIsEmpty, draftToPayload, emptyDraft, type NoteDraft, type SaveState } from "./NoteComposer";
import { NoteToolbar } from "./NoteToolbar";
import { NoteViewer } from "./NoteViewer";
import {
  collectTags,
  emptyFilter,
  filterNotes,
  groupNotes,
  isArchived,
  parseChecklist,
  reorder,
  type Note,
  type NoteFilter,
  type SortKey,
} from "../../lib/stickyNotes";
import "./sticky-notes.css";
import "./sticky-controls.css";

const SORT_STORAGE_KEY = "scholardocx.stickynotes.sort";

/** How long a deleted note can be brought back. */
const UNDO_WINDOW_MS = 8000;

export function StickyNotesView({
  onToast,
  refreshTrigger,
}: {
  onToast: (msg: string) => void;
  refreshTrigger?: number;
}) {
  const { showConfirm } = useDialog();
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<NoteFilter>(emptyFilter);
  const [sort, setSort] = useState<SortKey>(
    () => (window.localStorage.getItem(SORT_STORAGE_KEY) as SortKey) || "updated",
  );
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [undoable, setUndoable] = useState<Note | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  // One clock for the whole render, so a note cannot be "today" in the group
  // header and "overdue" on its own badge because the two read Date.now()
  // milliseconds apart. Refreshed every minute so a deadline passing while
  // the tab is open actually shows.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadNotes = useCallback(async () => {
    setNotes(await api.get<RecordMap[]>("/sticky_notes"));
  }, []);

  useEffect(() => {
    loadNotes().catch((error) => onToast(error.message));
  }, [loadNotes, refreshTrigger]);

  useEffect(() => {
    window.localStorage.setItem(SORT_STORAGE_KEY, sort);
  }, [sort]);

  const knownTags = useMemo(() => collectTags(notes), [notes]);
  const visible = useMemo(() => filterNotes(notes, filter), [notes, filter]);
  const groups = useMemo(() => groupNotes(visible, sort, now), [visible, sort, now]);
  const counts = useMemo(
    () => ({
      active: notes.filter((note) => !isArchived(note)).length,
      archived: notes.filter(isArchived).length,
      showing: visible.length,
    }),
    [notes, visible],
  );

  /* --- Writes ------------------------------------------------------------ */

  /** Apply a change locally first, then persist. The board should never wait
   *  on a round trip to show a tick or a pin. */
  const patchNote = useCallback(
    async (note: Note, data: RecordMap) => {
      const optimistic = { ...note, ...data };
      setNotes((current) => current.map((existing) => (existing.id === note.id ? optimistic : existing)));
      setViewingNote((current) => (current?.id === note.id ? optimistic : current));
      try {
        const saved = await api.patch<RecordMap>(`/sticky_notes/${note.id}`, { data });
        setNotes((current) => current.map((existing) => (existing.id === note.id ? { ...existing, ...saved } : existing)));
        setViewingNote((current) => (current?.id === note.id ? { ...current, ...saved } : current));
        return saved;
      } catch (error) {
        // Put the old row back rather than leaving the screen showing a
        // change that never reached the server.
        setNotes((current) => current.map((existing) => (existing.id === note.id ? note : existing)));
        setViewingNote((current) => (current?.id === note.id ? note : current));
        onToast(error instanceof Error ? error.message : "Could not save that change.");
        return null;
      }
    },
    [onToast],
  );

  const saveDraft = useCallback(
    // `auto` marks the debounced autosave. It skips the notification: a
    // notify() per typing pause would be one HTTP call every second of
    // editing, to raise an event the user has switched off by default.
    async (next: NoteDraft, auto = false) => {
      if (draftIsEmpty(next)) {
        if (!auto) onToast("Add a title, some text, a checklist or a sketch first.");
        return;
      }
      const data = draftToPayload(next);
      setSaveState("saving");
      try {
        if (editingNote) {
          const saved = await api.patch<RecordMap>(`/sticky_notes/${editingNote.id}`, { data });
          setNotes((current) => current.map((note) => (note.id === editingNote.id ? { ...note, ...saved } : note)));
          setEditingNote((current) => (current ? { ...current, ...saved } : current));
          if (!auto) await notify("sticky_note_update", { sheetName: data.title });
          setSaveState("saved");
        } else {
          const created = await api.post<RecordMap>("/sticky_notes", { data });
          setNotes((current) => [created, ...current]);
          // Switch into editing the note that was just made, so autosave takes
          // over and a second Save does not create a duplicate.
          setEditingNote(created);
          await notify("sticky_note_create", { sheetName: data.title });
          setSaveState("saved");
          onToast("Sticky note created.");
        }
      } catch (error) {
        setSaveState("idle");
        console.error("Error saving sticky note:", error);
        onToast("Failed to save note. Please try again.");
      }
    },
    [editingNote, onToast],
  );

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingNote(null);
    setDraft(emptyDraft);
    setSaveState("idle");
  };

  const openCreate = () => {
    setDraft(emptyDraft);
    setEditingNote(null);
    setSaveState("idle");
    setComposerOpen(true);
  };

  const openEdit = (note: Note) => {
    setViewingNote(null);
    setEditingNote(note);
    setDraft(draftFromNote(note));
    setSaveState("idle");
    setComposerOpen(true);
  };

  const toggleItem = (note: Note, itemId: string) => {
    const items = parseChecklist(note).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    );
    patchNote(note, { checklist_json: JSON.stringify(items) });
  };

  const togglePin = (note: Note) => patchNote(note, { is_pinned: note.is_pinned ? 0 : 1 });

  const toggleArchive = async (note: Note) => {
    const restoring = isArchived(note);
    await patchNote(note, { archived_at: restoring ? "" : new Date().toISOString() });
    setViewingNote(null);
    onToast(restoring ? "Note restored to the board." : "Note archived.");
  };

  /**
   * Delete with a grace period.
   *
   * The row is removed on the server immediately — holding it back would mean
   * a "deleted" note reappearing on another device — and the note's data is
   * kept in memory so Undo can re-create it. That re-created note is a new
   * row with a new id, which is the honest trade: the alternative is a
   * soft-delete column and a sweeper job for a diversion-sized feature.
   */
  const deleteNote = async (note: Note) => {
    const confirmed = await showConfirm(
      `Delete "${note.title || "this note"}"? Archiving keeps it out of the way without losing it.`,
      "Delete note",
    );
    if (!confirmed) return;
    setNotes((current) => current.filter((existing) => existing.id !== note.id));
    setViewingNote(null);
    try {
      await deleteRecord("sticky_notes", note.id);
      await notify("sticky_note_delete", { sheetName: note.title || "Untitled note" });
      setUndoable(note);
    } catch (error) {
      setNotes((current) => [note, ...current]);
      onToast(error instanceof Error ? error.message : "Could not delete that note.");
    }
  };

  useEffect(() => {
    if (!undoable) return;
    const timer = window.setTimeout(() => setUndoable(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [undoable]);

  const undoDelete = async () => {
    if (!undoable) return;
    const { id, created_at, updated_at, user_id, ...rest } = undoable;
    setUndoable(null);
    try {
      const restored = await api.post<RecordMap>("/sticky_notes", { data: rest });
      setNotes((current) => [restored, ...current]);
      onToast("Note restored.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not restore that note.");
    }
  };

  /* --- Drag to reorder --------------------------------------------------- */

  // Only meaningful under the manual sort: a position recorded while sorted
  // by, say, due date would be overwritten by the next render.
  const canReorder = sort === "manual" && filter.shelf === "active";
  const [dragId, setDragId] = useState<string | null>(null);
  const dropTarget = useRef<string | null>(null);

  const commitReorder = async () => {
    const id = dragId;
    const overId = dropTarget.current;
    setDragId(null);
    dropTarget.current = null;
    if (!id || !overId || id === overId) return;

    const toIndex = visible.findIndex((note) => note.id === overId);
    const changes = reorder(visible, id, toIndex);
    if (!changes.length) return;

    // Show the new order immediately, then persist only the notes that moved.
    const byId = new Map(changes.map((change) => [change.id, change.sort_order]));
    setNotes((current) =>
      current.map((note) => (byId.has(String(note.id)) ? { ...note, sort_order: byId.get(String(note.id)) } : note)),
    );
    try {
      await Promise.all(
        changes.map((change) => api.patch(`/sticky_notes/${change.id}`, { data: { sort_order: change.sort_order } })),
      );
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Could not save the new order.");
      await loadNotes().catch(() => undefined);
    }
  };

  /* --- Shortcuts --------------------------------------------------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "");
      if (composerOpen || viewingNote) return;
      if (typing) return;
      if (event.key === "n") {
        event.preventDefault();
        openCreate();
      }
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.querySelector("input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerOpen, viewingNote]);

  /* --- Render ------------------------------------------------------------ */

  const filtering = Boolean(filter.query || filter.color || filter.tags.length);

  return (
    <div className="sticky-notes-view">
      <section className="sticky-board">
        <div className="sticky-board-head">
          <div>
            <p className="eyebrow">
              {counts.active} note{counts.active === 1 ? "" : "s"}
              {counts.archived ? ` · ${counts.archived} archived` : ""}
            </p>
            <h2>Sticky Notes</h2>
          </div>
          <button className="primary" type="button" onClick={openCreate}>
            <Plus size={16} /> Create note
          </button>
        </div>

        <div ref={searchRef}>
          <NoteToolbar
            filter={filter}
            sort={sort}
            tags={knownTags}
            counts={counts}
            onFilter={setFilter}
            onSort={setSort}
          />
        </div>

        {groups.length ? (
          <div className="sticky-groups">
            {groups.map((group) => (
              <section className="sticky-group" key={group.key}>
                {group.label ? (
                  <h3 className={`sticky-group-head group-${group.key}`}>
                    {group.label} <span className="count">{group.notes.length}</span>
                  </h3>
                ) : null}
                <div className="sticky-card-grid">
                  {group.notes.map((note, index) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      index={index}
                      now={now}
                      draggable={canReorder}
                      dragging={dragId === note.id}
                      onOpen={setViewingNote}
                      onToggleItem={toggleItem}
                      onTogglePin={togglePin}
                      onArchive={toggleArchive}
                      onDelete={deleteNote}
                      onDragStart={(dragged) => setDragId(String(dragged.id))}
                      onDragOver={(over) => { dropTarget.current = String(over.id); }}
                      onDrop={commitReorder}
                      onDragEnd={() => { setDragId(null); dropTarget.current = null; }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState
            filtering={filtering}
            shelf={filter.shelf}
            onCreate={openCreate}
            onClear={() => setFilter({ ...filter, query: "", color: null, tags: [] })}
          />
        )}
      </section>

      {undoable ? (
        <div className="sticky-undo" role="status">
          <span>Deleted “{undoable.title || "Untitled note"}”.</span>
          <button type="button" onClick={undoDelete}>
            <RotateCcw size={13} /> Undo
          </button>
        </div>
      ) : null}

      {composerOpen ? (
        <NoteComposer
          draft={draft}
          editing={editingNote}
          knownTags={knownTags}
          saveState={saveState}
          onChange={setDraft}
          onSave={saveDraft}
          onClose={closeComposer}
        />
      ) : null}

      {viewingNote ? (
        <NoteViewer
          note={viewingNote}
          now={now}
          onEdit={openEdit}
          onClose={() => setViewingNote(null)}
          onToggleItem={toggleItem}
          onArchive={toggleArchive}
          onDelete={deleteNote}
        />
      ) : null}
    </div>
  );
}

/**
 * Nothing to show — but *why* nothing changes what to say.
 *
 * The old view showed "Your board is clear. Capture the next useful thought."
 * whenever the grid was empty, including when a filter simply matched nothing.
 * Telling someone their board is empty while they are looking at a search box
 * with text in it is actively misleading, so the three cases are separate.
 */
function EmptyState({
  filtering,
  shelf,
  onCreate,
  onClear,
}: {
  filtering: boolean;
  shelf: "active" | "archived";
  onCreate: () => void;
  onClear: () => void;
}) {
  if (filtering) {
    return (
      <div className="sticky-empty">
        <Search size={38} />
        <strong>No notes match those filters.</strong>
        <span>Your notes are still here — the search or filters just exclude all of them.</span>
        <button className="secondary" type="button" onClick={onClear}>Clear filters</button>
      </div>
    );
  }
  if (shelf === "archived") {
    return (
      <div className="sticky-empty">
        <Archive size={38} />
        <strong>Nothing archived yet.</strong>
        <span>Archiving takes a note off the board without deleting it.</span>
      </div>
    );
  }
  return (
    <div className="sticky-empty">
      <StickyNote size={40} />
      <strong>Your board is clear.</strong>
      <span>Capture the next useful thought. Press N to start one.</span>
      <button className="primary" type="button" onClick={onCreate}>
        <Plus size={16} /> Create note
      </button>
    </div>
  );
}
