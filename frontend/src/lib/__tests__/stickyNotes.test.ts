import { describe, it, expect } from "vitest";
import {
  buildNoteBody,
  checklistProgress,
  collectTags,
  compareNotes,
  daysUntil,
  dedupeTags,
  dueBucket,
  filterNotes,
  formatDue,
  groupKeyOf,
  groupNotes,
  hasHiddenContent,
  isComplete,
  matchesQuery,
  normalizeTag,
  parseChecklist,
  parseDue,
  parseNoteBody,
  parseTags,
  reorder,
  serializeTags,
  sortNotes,
  suggestTags,
  type Note,
} from "../stickyNotes";

/** A fixed clock. Every date-dependent assertion is relative to this. */
const NOW = new Date("2026-07-29T14:00:00");

const note = (fields: Partial<Note> = {}): Note => ({
  id: Math.random().toString(36).slice(2),
  title: "",
  body: "",
  color: "sun",
  is_checklist: 0,
  checklist_json: "[]",
  tags_json: "[]",
  is_pinned: 0,
  sort_order: 0,
  due_at: null,
  archived_at: null,
  created_at: "2026-07-01T10:00:00",
  updated_at: "2026-07-01T10:00:00",
  ...fields,
});

const checklist = (...items: [string, boolean][]) =>
  JSON.stringify(items.map(([text, done], index) => ({ id: `i${index}`, text, done })));

describe("parseNoteBody", () => {
  it("treats plain text as plain text", () => {
    expect(parseNoteBody("just a thought")).toEqual({ text: "just a thought", sketchPaths: null });
  });

  it("reads a sketch-only envelope", () => {
    const body = JSON.stringify({ type: "sketch", paths: ["M 0 0 L 1 1"] });
    expect(parseNoteBody(body)).toEqual({ text: "", sketchPaths: ["M 0 0 L 1 1"] });
  });

  it("reads a mixed envelope", () => {
    const body = JSON.stringify({ type: "mixed", text: "hi", paths: ["M 0 0"] });
    expect(parseNoteBody(body)).toEqual({ text: "hi", sketchPaths: ["M 0 0"] });
  });

  it("falls back to the raw string when the JSON is broken", () => {
    // A body is user data. Half-written JSON must render as text, not crash.
    expect(parseNoteBody('{"type": "sketch"').text).toBe('{"type": "sketch"');
  });

  it("ignores an envelope whose paths are not an array", () => {
    const body = JSON.stringify({ type: "sketch", paths: "nope" });
    expect(parseNoteBody(body).sketchPaths).toBeNull();
  });

  it("round-trips through buildNoteBody", () => {
    expect(parseNoteBody(buildNoteBody("hi", ["M 0 0"]))).toEqual({ text: "hi", sketchPaths: ["M 0 0"] });
    expect(parseNoteBody(buildNoteBody("", ["M 0 0"]))).toEqual({ text: "", sketchPaths: ["M 0 0"] });
    expect(buildNoteBody("  hi  ", [])).toBe("hi");
  });
});

describe("parseChecklist", () => {
  it("returns [] for missing, broken and non-array JSON", () => {
    expect(parseChecklist(note())).toEqual([]);
    expect(parseChecklist(note({ checklist_json: "{oops" }))).toEqual([]);
    expect(parseChecklist(note({ checklist_json: '{"a":1}' }))).toEqual([]);
  });
});

describe("tags", () => {
  it("folds case, spacing and a leading hash to one canonical form", () => {
    expect(normalizeTag("Round 1")).toBe("round 1");
    expect(normalizeTag("  round   1 ")).toBe("round 1");
    expect(normalizeTag("#Round 1")).toBe("round 1");
    expect(normalizeTag("###tag")).toBe("tag");
  });

  it("normalizes anything blank to the empty string", () => {
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("#")).toBe("");
  });

  it("caps a tag's length", () => {
    expect(normalizeTag("a".repeat(60))).toHaveLength(24);
  });

  it("drops duplicates that differ only by case or spacing", () => {
    expect(dedupeTags(["Fall 26", "fall  26", "FALL 26"])).toEqual(["fall 26"]);
  });

  it("keeps the order tags were added in", () => {
    expect(dedupeTags(["zeta", "alpha", "mu"])).toEqual(["zeta", "alpha", "mu"]);
  });

  it("caps the number of tags on one note", () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(dedupeTags(many)).toHaveLength(8);
  });

  it("survives a tags_json that is broken or not an array", () => {
    expect(parseTags(note({ tags_json: "nonsense" }))).toEqual([]);
    expect(parseTags(note({ tags_json: '{"a":1}' }))).toEqual([]);
    expect(parseTags(note({ tags_json: '["ok", 4, null]' }))).toEqual(["ok"]);
  });

  it("round-trips through serializeTags", () => {
    expect(parseTags(note({ tags_json: serializeTags(["Fall 26", "sop"]) }))).toEqual(["fall 26", "sop"]);
  });

  it("ranks collected tags by use, then alphabetically", () => {
    const notes = [
      note({ tags_json: serializeTags(["sop", "urgent"]) }),
      note({ tags_json: serializeTags(["sop"]) }),
      note({ tags_json: serializeTags(["sop", "lor"]) }),
      note({ tags_json: serializeTags(["urgent"]) }),
    ];
    expect(collectTags(notes)).toEqual([
      { tag: "sop", count: 3 },
      { tag: "urgent", count: 2 },
      { tag: "lor", count: 1 },
    ]);
  });

  it("suggests matching tags and never one already applied", () => {
    const all = [{ tag: "sop" }, { tag: "sop draft" }, { tag: "lor" }];
    expect(suggestTags(all, "so", [])).toEqual(["sop", "sop draft"]);
    expect(suggestTags(all, "so", ["sop"])).toEqual(["sop draft"]);
    expect(suggestTags(all, "", ["sop", "lor"])).toEqual(["sop draft"]);
  });
});

describe("due dates", () => {
  it("rejects missing and unparseable values", () => {
    expect(parseDue(null)).toBeNull();
    expect(parseDue("")).toBeNull();
    expect(parseDue("   ")).toBeNull();
    expect(parseDue("not a date")).toBeNull();
    expect(parseDue(12345)).toBeNull();
  });

  it("counts whole days between calendar days, not elapsed hours", () => {
    // 11pm tonight and 1am tomorrow are two hours apart but one day apart.
    expect(daysUntil(new Date("2026-07-29T23:00:00"), NOW)).toBe(0);
    expect(daysUntil(new Date("2026-07-30T01:00:00"), NOW)).toBe(1);
    expect(daysUntil(new Date("2026-07-28T23:59:00"), NOW)).toBe(-1);
  });

  it("buckets by urgency", () => {
    expect(dueBucket(note(), NOW)).toBe("none");
    expect(dueBucket(note({ due_at: "2026-07-25T09:00:00" }), NOW)).toBe("overdue");
    expect(dueBucket(note({ due_at: "2026-07-29T18:00:00" }), NOW)).toBe("today");
    expect(dueBucket(note({ due_at: "2026-07-30T09:00:00" }), NOW)).toBe("tomorrow");
    expect(dueBucket(note({ due_at: "2026-08-02T09:00:00" }), NOW)).toBe("week");
    expect(dueBucket(note({ due_at: "2026-09-30T09:00:00" }), NOW)).toBe("later");
  });

  it("calls a time earlier today overdue, not today", () => {
    // The day is not the deadline, the time is.
    expect(dueBucket(note({ due_at: "2026-07-29T09:00:00" }), NOW)).toBe("overdue");
  });

  it("never marks a finished checklist overdue", () => {
    // A done note that keeps shouting trains people to ignore the colour.
    const done = note({
      due_at: "2026-07-01T09:00:00",
      is_checklist: 1,
      checklist_json: checklist(["a", true], ["b", true]),
    });
    expect(dueBucket(done, NOW)).toBe("later");

    const partly = note({
      due_at: "2026-07-01T09:00:00",
      is_checklist: 1,
      checklist_json: checklist(["a", true], ["b", false]),
    });
    expect(dueBucket(partly, NOW)).toBe("overdue");
  });

  it("does not call an empty checklist complete", () => {
    expect(isComplete(note({ is_checklist: 1 }))).toBe(false);
    expect(isComplete(note({ is_checklist: 0 }))).toBe(false);
  });

  it("labels near dates in words", () => {
    expect(formatDue(new Date("2026-07-29T18:00:00"), NOW)).toBe("Today");
    expect(formatDue(new Date("2026-07-30T09:00:00"), NOW)).toBe("Tomorrow");
    expect(formatDue(new Date("2026-07-28T09:00:00"), NOW)).toBe("Yesterday");
    expect(formatDue(new Date("2026-07-24T09:00:00"), NOW)).toBe("5 days ago");
  });
});

describe("search", () => {
  it("matches everything on an empty query", () => {
    expect(matchesQuery(note({ title: "anything" }), "   ")).toBe(true);
  });

  it("searches title, body and tags", () => {
    expect(matchesQuery(note({ title: "SOP draft" }), "sop")).toBe(true);
    expect(matchesQuery(note({ body: "ask about funding" }), "FUNDING")).toBe(true);
    expect(matchesQuery(note({ tags_json: serializeTags(["urgent"]) }), "urg")).toBe(true);
  });

  it("searches checklist items", () => {
    // A checklist note's real content is its items — searching only the title
    // would miss the thing the user is looking for.
    const list = note({ is_checklist: 1, checklist_json: checklist(["email Prof Chen", false]) });
    expect(matchesQuery(list, "chen")).toBe(true);
  });

  it("does not match against sketch path coordinates", () => {
    const sketch = note({ body: JSON.stringify({ type: "sketch", paths: ["M 12 40 L 13 41"] }) });
    expect(matchesQuery(sketch, "M 12")).toBe(false);
  });
});

describe("filtering", () => {
  const notes = [
    note({ id: "a", title: "sop", color: "mint", tags_json: serializeTags(["sop", "urgent"]) }),
    note({ id: "b", title: "lor", color: "sun", tags_json: serializeTags(["lor"]) }),
    note({ id: "c", title: "old", color: "mint", archived_at: "2026-07-02T10:00:00" }),
  ];
  const ids = (list: Note[]) => list.map((n) => n.id);

  it("hides archived notes from the active shelf", () => {
    expect(ids(filterNotes(notes, { query: "", color: null, tags: [], shelf: "active" }))).toEqual(["a", "b"]);
  });

  it("shows only archived notes on the archive shelf", () => {
    expect(ids(filterNotes(notes, { query: "", color: null, tags: [], shelf: "archived" }))).toEqual(["c"]);
  });

  it("filters by colour", () => {
    expect(ids(filterNotes(notes, { query: "", color: "mint", tags: [], shelf: "active" }))).toEqual(["a"]);
  });

  it("treats several selected tags as 'has all of them'", () => {
    const all = { query: "", color: null, shelf: "active" as const };
    expect(ids(filterNotes(notes, { ...all, tags: ["sop"] }))).toEqual(["a"]);
    expect(ids(filterNotes(notes, { ...all, tags: ["sop", "urgent"] }))).toEqual(["a"]);
    expect(ids(filterNotes(notes, { ...all, tags: ["sop", "lor"] }))).toEqual([]);
  });

  it("applies query and colour together", () => {
    expect(ids(filterNotes(notes, { query: "sop", color: "sun", tags: [], shelf: "active" }))).toEqual([]);
  });
});

describe("sorting", () => {
  it("puts undated notes last under a due sort", () => {
    // A missing date is not "due at the beginning of time".
    const notes = [
      note({ id: "none" }),
      note({ id: "late", due_at: "2026-09-01T09:00:00" }),
      note({ id: "soon", due_at: "2026-07-30T09:00:00" }),
    ];
    expect(sortNotes(notes, "due").map((n) => n.id)).toEqual(["soon", "late", "none"]);
  });

  it("falls back to most-recent when neither note has a date", () => {
    const notes = [
      note({ id: "old", updated_at: "2026-07-01T00:00:00" }),
      note({ id: "new", updated_at: "2026-07-20T00:00:00" }),
    ];
    expect(sortNotes(notes, "due").map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("uses manual order, breaking ties on recency", () => {
    // Every note starts at 0, so an undragged board keeps its old ordering.
    const notes = [
      note({ id: "a", sort_order: 0, updated_at: "2026-07-01T00:00:00" }),
      note({ id: "b", sort_order: 0, updated_at: "2026-07-20T00:00:00" }),
      note({ id: "c", sort_order: -1, updated_at: "2026-07-05T00:00:00" }),
    ];
    expect(sortNotes(notes, "manual").map((n) => n.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts titles case-insensitively", () => {
    const notes = [note({ id: "b", title: "beta" }), note({ id: "a", title: "Alpha" })];
    expect(sortNotes(notes, "title").map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the array it is given", () => {
    const notes = [note({ id: "a", title: "z" }), note({ id: "b", title: "a" })];
    sortNotes(notes, "title");
    expect(notes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("is symmetric on comparison", () => {
    const a = note({ due_at: "2026-07-30T09:00:00" });
    const b = note({ due_at: "2026-08-30T09:00:00" });
    expect(Math.sign(compareNotes(a, b, "due"))).toBe(-Math.sign(compareNotes(b, a, "due")));
  });
});

describe("grouping", () => {
  it("lets pinned win over overdue", () => {
    // Pinning is an explicit instruction about where a note sits; moving it
    // because a date passed would be ignoring the user.
    const pinnedAndLate = note({ is_pinned: 1, due_at: "2026-07-01T09:00:00" });
    expect(groupKeyOf(pinnedAndLate, NOW)).toBe("pinned");
  });

  it("folds tomorrow and this-week into one group", () => {
    expect(groupKeyOf(note({ due_at: "2026-07-30T09:00:00" }), NOW)).toBe("week");
    expect(groupKeyOf(note({ due_at: "2026-08-03T09:00:00" }), NOW)).toBe("week");
  });

  it("drops empty groups instead of heading blank space", () => {
    const notes = [note({ id: "a" }), note({ id: "b", is_pinned: 1 })];
    expect(groupNotes(notes, "updated", NOW).map((g) => g.key)).toEqual(["pinned", "rest"]);
  });

  it("returns nothing at all for an empty board", () => {
    expect(groupNotes([], "updated", NOW)).toEqual([]);
    expect(groupNotes([], "manual", NOW)).toEqual([]);
  });

  it("skips grouping under manual and title sorts", () => {
    // The user asked for one specific order; slicing it into five is not it.
    const notes = [note({ id: "a", is_pinned: 1 }), note({ id: "b", due_at: "2026-07-01T09:00:00" })];
    expect(groupNotes(notes, "manual", NOW)).toHaveLength(1);
    expect(groupNotes(notes, "title", NOW)).toHaveLength(1);
  });

  it("places every note in exactly one group", () => {
    const notes = [
      note({ id: "p", is_pinned: 1 }),
      note({ id: "o", due_at: "2026-07-01T09:00:00" }),
      note({ id: "t", due_at: "2026-07-29T18:00:00" }),
      note({ id: "w", due_at: "2026-08-01T09:00:00" }),
      note({ id: "r" }),
    ];
    const groups = groupNotes(notes, "updated", NOW);
    expect(groups.flatMap((g) => g.notes.map((n) => n.id)).sort()).toEqual(["o", "p", "r", "t", "w"]);
    expect(groups.map((g) => g.key)).toEqual(["pinned", "overdue", "today", "week", "rest"]);
  });
});

describe("reorder", () => {
  const board = [
    note({ id: "a", sort_order: 0 }),
    note({ id: "b", sort_order: 1 }),
    note({ id: "c", sort_order: 2 }),
  ];

  it("returns only the notes whose position actually changed", () => {
    // A drag should be a handful of small writes, not a whole-board rewrite.
    expect(reorder(board, "c", 0)).toEqual([
      { id: "c", sort_order: 0 },
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
    expect(reorder(board, "a", 1)).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
    ]);
  });

  it("does nothing when the note is already there", () => {
    expect(reorder(board, "a", 0)).toEqual([]);
  });

  it("does nothing for an unknown id", () => {
    expect(reorder(board, "missing", 0)).toEqual([]);
  });

  it("clamps a target index past either end", () => {
    expect(reorder(board, "a", 99)).toEqual(reorder(board, "a", 2));
    expect(reorder(board, "c", -5)).toEqual(reorder(board, "c", 0));
  });

  it("does not mutate the board it is given", () => {
    reorder(board, "c", 0);
    expect(board.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("card helpers", () => {
  it("counts checklist progress", () => {
    const list = note({ is_checklist: 1, checklist_json: checklist(["a", true], ["b", false], ["c", true]) });
    expect(checklistProgress(list)).toEqual({ done: 2, total: 3 });
  });

  it("flags hidden content for sketches, extra items and long text", () => {
    expect(hasHiddenContent(note({ body: "short" }), 3)).toBe(false);
    expect(hasHiddenContent(note({ body: "x".repeat(200) }), 3)).toBe(true);
    expect(hasHiddenContent(note({ body: JSON.stringify({ type: "sketch", paths: ["M 0 0"] }) }), 3)).toBe(true);
    const list = note({
      is_checklist: 1,
      checklist_json: checklist(["a", false], ["b", false], ["c", false], ["d", false]),
    });
    expect(hasHiddenContent(list, 3)).toBe(true);
  });

  it("flags a checklist that also carries body text", () => {
    // The card shows the items; the text is real content the user cannot see.
    const both = note({ is_checklist: 1, body: "context", checklist_json: checklist(["a", false]) });
    expect(hasHiddenContent(both, 3)).toBe(true);
  });
});
