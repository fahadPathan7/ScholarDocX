/**
 * Sticky Notes rules (SCHOLARDOCX-0201).
 *
 * Everything here is a pure function over plain data. The components render
 * and handle input; parsing, tag handling, due-date bucketing, searching,
 * filtering, sorting and grouping all live here — which is the only reason
 * any of it can be tested, since this repo has no DOM test harness.
 *
 * Nothing in this file touches the network, the DOM, or `Date.now()` without
 * being handed the clock explicitly. Bucketing a note as "overdue" depends
 * entirely on what time it is, so `now` is always a parameter: a function
 * that reads the clock itself can only be tested on the day you wrote it.
 */

export type ChecklistItem = { id: string; text: string; done: boolean };

/** A sticky note row as it comes back from the API. */
export type Note = Record<string, any>;

/* --- Body parsing -------------------------------------------------------- */

/**
 * A note body is either plain text or a JSON envelope carrying sketch paths.
 * The envelope predates this task; it is parsed defensively because a body is
 * user data that may have been written by an older version or hand-edited.
 */
export function parseNoteBody(body: string): { text: string; sketchPaths: string[] | null } {
  if (!body) return { text: "", sketchPaths: null };
  if (body.trim().startsWith("{")) {
    try {
      const data = JSON.parse(body);
      if (data.type === "sketch" && Array.isArray(data.paths)) {
        return { text: "", sketchPaths: data.paths };
      }
      if (data.type === "mixed" && Array.isArray(data.paths)) {
        return { text: typeof data.text === "string" ? data.text : "", sketchPaths: data.paths };
      }
    } catch {
      // Unparseable means it was never an envelope — treat it as what it is.
    }
  }
  return { text: body, sketchPaths: null };
}

export const parseSketch = (body: string): string[] | null => parseNoteBody(body).sketchPaths;
export const parseText = (body: string): string => parseNoteBody(body).text;

/** Re-encode text and sketch paths into the stored body format. */
export function buildNoteBody(text: string, sketchPaths: string[]): string {
  const trimmed = text.trim();
  if (!sketchPaths.length) return trimmed;
  if (!trimmed) return JSON.stringify({ type: "sketch", paths: sketchPaths });
  return JSON.stringify({ type: "mixed", text: trimmed, paths: sketchPaths });
}

export function parseChecklist(note: Note): ChecklistItem[] {
  try {
    const parsed = JSON.parse(note.checklist_json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* --- Tags ---------------------------------------------------------------- */

export const MAX_TAGS_PER_NOTE = 8;
export const MAX_TAG_LENGTH = 24;

/**
 * Fold a raw tag to its canonical form.
 *
 * Lowercased and internally de-spaced, because "Round 1", "round 1" and
 * "round  1" are one tag as far as the user is concerned, and a tag list that
 * treats them as three is worse than no tags at all. A leading "#" is dropped
 * so typing it (which people do) is harmless rather than creating a twin.
 * Returns "" for anything that normalizes to nothing, so callers have one
 * emptiness check rather than several.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
}

/** Parse the stored JSON, dropping anything that is not a usable tag. */
export function parseTags(note: Note): string[] {
  try {
    const parsed = JSON.parse(note.tags_json || "[]");
    if (!Array.isArray(parsed)) return [];
    return dedupeTags(parsed.filter((tag): tag is string => typeof tag === "string"));
  } catch {
    return [];
  }
}

/** Normalize, drop blanks and duplicates, and cap the count — order kept. */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_TAGS_PER_NOTE) break;
  }
  return result;
}

export const serializeTags = (tags: string[]): string => JSON.stringify(dedupeTags(tags));

/**
 * Every tag in use, most-used first then alphabetical, for the filter bar and
 * the composer's autocomplete. Frequency order matters: the tags someone uses
 * constantly should not sink under one-offs that happen to start with "a".
 */
export function collectTags(notes: Note[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  notes.forEach((note) => {
    parseTags(note).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
}

/** Tags matching what has been typed so far, excluding ones already applied. */
export function suggestTags(all: { tag: string }[], query: string, applied: string[]): string[] {
  const needle = normalizeTag(query);
  const taken = new Set(applied.map(normalizeTag));
  return all
    .map((entry) => entry.tag)
    .filter((tag) => !taken.has(tag) && (!needle || tag.includes(needle)))
    .slice(0, 6);
}

/* --- Due dates ----------------------------------------------------------- */

export type DueBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

/** Midnight local time on the same day as `value`. */
export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Whole days from `now`'s day to `due`'s day. Negative means overdue. */
export function daysUntil(due: Date, now: Date): number {
  const MS_PER_DAY = 86_400_000;
  // Compared at day granularity, not by subtracting timestamps: something due
  // at 9am today is "today", not "-0.4 days". Rounding handles the hour that
  // daylight saving adds or removes between the two midnights.
  return Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / MS_PER_DAY);
}

/** null for a missing or unparseable date, so callers have one check. */
export function parseDue(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Which urgency bucket a note falls in.
 *
 * A note due earlier today is **overdue**, not "today": the day is not the
 * deadline, the time is. Anything already ticked complete is never overdue —
 * a finished checklist that keeps shouting at you trains people to ignore the
 * colour, which costs more than the reminder is worth.
 */
export function dueBucket(note: Note, now: Date): DueBucket {
  const due = parseDue(note.due_at);
  if (!due) return "none";
  if (isComplete(note)) return "later";
  const days = daysUntil(due, now);
  if (days < 0) return "overdue";
  if (days === 0) return due.getTime() < now.getTime() ? "overdue" : "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

/** A checklist note is complete when it has items and all of them are done. */
export function isComplete(note: Note): boolean {
  if (!note.is_checklist) return false;
  const items = parseChecklist(note);
  return items.length > 0 && items.every((item) => item.done);
}

/** Short, human due label — "Overdue by 3 days", "Today", "Fri 14 Mar". */
export function formatDue(due: Date, now: Date): string {
  const days = daysUntil(due, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days <= 7) return due.toLocaleDateString(undefined, { weekday: "long" });
  return due.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(due.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/* --- Search and filtering ------------------------------------------------ */

export type NoteFilter = {
  query: string;
  color: string | null;
  tags: string[];
  /** "active" hides archived notes; "archived" shows only them. */
  shelf: "active" | "archived";
};

export const emptyFilter: NoteFilter = { query: "", color: null, tags: [], shelf: "active" };

export const isArchived = (note: Note): boolean => Boolean(note.archived_at);

/**
 * Does the note match a free-text query?
 *
 * Searches the title, the body text and **every checklist item**. Leaving the
 * items out is the obvious shortcut and it is wrong: a checklist note's real
 * content is its items, so searching only the title would miss the thing the
 * user is actually looking for. Sketch paths are excluded — they are
 * coordinates, and matching "M 12" against them is noise.
 */
export function matchesQuery(note: Note, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (String(note.title || "").toLowerCase().includes(needle)) return true;
  if (parseText(note.body || "").toLowerCase().includes(needle)) return true;
  if (parseTags(note).some((tag) => tag.includes(needle))) return true;
  return parseChecklist(note).some((item) => item.text.toLowerCase().includes(needle));
}

/** All active filters must pass. Selecting several tags means "has all". */
export function matchesFilter(note: Note, filter: NoteFilter): boolean {
  if (filter.shelf === "archived" ? !isArchived(note) : isArchived(note)) return false;
  if (filter.color && (note.color || "sun") !== filter.color) return false;
  if (filter.tags.length) {
    const tags = new Set(parseTags(note));
    if (!filter.tags.every((tag) => tags.has(tag))) return false;
  }
  return matchesQuery(note, filter.query);
}

export const filterNotes = (notes: Note[], filter: NoteFilter): Note[] =>
  notes.filter((note) => matchesFilter(note, filter));

/* --- Sorting and grouping ------------------------------------------------ */

export type SortKey = "manual" | "updated" | "created" | "due" | "title";

const text_ = (value: unknown) => String(value || "");

/**
 * Compare two notes under the chosen sort.
 *
 * `manual` is the drag order, with `updated_at` as the tie-break — every note
 * starts at `sort_order` 0, so until something is actually dragged this is
 * exactly the old most-recent-first behaviour rather than an arbitrary
 * reshuffle.
 *
 * Under `due`, notes *without* a date sort last rather than first. A missing
 * date is not "due at the beginning of time", and treating it that way buries
 * the dated notes the sort exists to surface.
 */
export function compareNotes(a: Note, b: Note, sort: SortKey): number {
  switch (sort) {
    case "manual": {
      const order = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      return order || text_(b.updated_at).localeCompare(text_(a.updated_at));
    }
    case "created":
      return text_(b.created_at).localeCompare(text_(a.created_at));
    case "title":
      return text_(a.title).localeCompare(text_(b.title), undefined, { sensitivity: "base" });
    case "due": {
      const dueA = parseDue(a.due_at);
      const dueB = parseDue(b.due_at);
      if (!dueA && !dueB) return text_(b.updated_at).localeCompare(text_(a.updated_at));
      if (!dueA) return 1;
      if (!dueB) return -1;
      return dueA.getTime() - dueB.getTime();
    }
    case "updated":
    default:
      return text_(b.updated_at).localeCompare(text_(a.updated_at));
  }
}

export const sortNotes = (notes: Note[], sort: SortKey): Note[] =>
  [...notes].sort((a, b) => compareNotes(a, b, sort));

export type GroupKey = "pinned" | "overdue" | "today" | "week" | "rest";

export type NoteGroup = { key: GroupKey; label: string; notes: Note[] };

const GROUP_LABELS: Record<GroupKey, string> = {
  pinned: "Pinned",
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  rest: "Everything else",
};

/**
 * Assign a note to exactly one group, most urgent claim first.
 *
 * Pinned wins over overdue deliberately: pinning is an explicit instruction
 * about where a note should sit, and a board that moves a pinned note out
 * from under the user because a date passed has ignored them.
 */
export function groupKeyOf(note: Note, now: Date): GroupKey {
  if (note.is_pinned) return "pinned";
  const bucket = dueBucket(note, now);
  if (bucket === "overdue") return "overdue";
  if (bucket === "today") return "today";
  if (bucket === "tomorrow" || bucket === "week") return "week";
  return "rest";
}

/**
 * Split sorted notes into display groups, dropping empty ones.
 *
 * Empty groups are omitted rather than rendered as headed blank space: a
 * board showing "Overdue" with nothing under it reads as a loading failure.
 * With `manual` or `title` sort the grouping is skipped entirely — the user
 * asked for one specific order, and slicing it into five buckets is not it.
 */
export function groupNotes(notes: Note[], sort: SortKey, now: Date): NoteGroup[] {
  const ordered = sortNotes(notes, sort);
  if (sort === "manual" || sort === "title") {
    return ordered.length ? [{ key: "rest", label: "", notes: ordered }] : [];
  }
  const order: GroupKey[] = ["pinned", "overdue", "today", "week", "rest"];
  const buckets = new Map<GroupKey, Note[]>(order.map((key) => [key, []]));
  ordered.forEach((note) => buckets.get(groupKeyOf(note, now))!.push(note));
  return order
    .filter((key) => buckets.get(key)!.length)
    .map((key) => ({ key, label: GROUP_LABELS[key], notes: buckets.get(key)! }));
}

/* --- Board helpers ------------------------------------------------------- */

/**
 * Reposition `id` to sit at `toIndex` and hand back the new sort_order for
 * every note whose position changed.
 *
 * Returns only what moved, so a drag is a handful of small writes rather than
 * rewriting the whole board. Renumbering from zero each time keeps the values
 * dense and avoids the fractional-index drift that shows up after enough
 * reorders.
 */
export function reorder(notes: Note[], id: string, toIndex: number): { id: string; sort_order: number }[] {
  const from = notes.findIndex((note) => note.id === id);
  if (from < 0) return [];
  const target = Math.max(0, Math.min(toIndex, notes.length - 1));
  if (from === target) return [];
  const next = [...notes];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next
    .map((note, index) => ({ id: String(note.id), sort_order: index }))
    .filter(({ id: noteId, sort_order }) => {
      const original = notes.find((note) => String(note.id) === noteId);
      return (Number(original?.sort_order) || 0) !== sort_order;
    });
}

/** Checklist progress for the card badge. */
export function checklistProgress(note: Note): { done: number; total: number } {
  const items = parseChecklist(note);
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/**
 * Is there more to this note than the card can show?
 *
 * Drives the "+ more" badge. Kept here rather than in the card so the
 * thresholds are in one place and can be checked against.
 */
export function hasHiddenContent(note: Note, previewItems: number): boolean {
  const text = parseText(note.body || "");
  const items = parseChecklist(note);
  if (parseSketch(note.body || "")?.length) return true;
  if (note.is_checklist && text) return true;
  if (items.length > previewItems) return true;
  return text.length > 180;
}
