import { Archive, ArrowUpDown, Search, StickyNote, X } from "lucide-react";
import type { NoteFilter, SortKey } from "../../lib/stickyNotes";

export const NOTE_COLORS = [
  { key: "sun", label: "Sun", swatch: "#f8dfa3" },
  { key: "mint", label: "Mint", swatch: "#caead8" },
  { key: "sky", label: "Sky", swatch: "#c9e3f5" },
  { key: "rose", label: "Rose", swatch: "#f3c8c8" },
  { key: "lilac", label: "Lilac", swatch: "#ddd0f2" },
  { key: "sand", label: "Sand", swatch: "#eadcc4" },
];

const SORT_LABELS: Record<SortKey, string> = {
  manual: "My order",
  updated: "Recently changed",
  created: "Newest first",
  due: "By due date",
  title: "A–Z",
};

/**
 * Search, filter and sort controls for the board (SCHOLARDOCX-0201).
 *
 * Presentational: it owns no state, so the container stays the single source
 * of truth for what is on screen and the whole bar can be reasoned about by
 * reading one `NoteFilter`.
 */
export function NoteToolbar({
  filter,
  sort,
  tags,
  counts,
  onFilter,
  onSort,
}: {
  filter: NoteFilter;
  sort: SortKey;
  tags: { tag: string; count: number }[];
  counts: { active: number; archived: number; showing: number };
  onFilter: (next: NoteFilter) => void;
  onSort: (next: SortKey) => void;
}) {
  const toggleTag = (tag: string) =>
    onFilter({
      ...filter,
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((existing) => existing !== tag)
        : [...filter.tags, tag],
    });

  const hasFilters = Boolean(filter.query || filter.color || filter.tags.length);

  return (
    <div className="sticky-toolbar">
      <div className="sticky-toolbar-row">
        <div className="sticky-search">
          <Search size={15} aria-hidden="true" />
          <input
            value={filter.query}
            onChange={(event) => onFilter({ ...filter, query: event.target.value })}
            placeholder="Search notes, tags and checklist items…"
            aria-label="Search notes"
            type="search"
          />
        </div>

        <div className="sticky-shelf" role="group" aria-label="Which notes to show">
          <button
            type="button"
            className={filter.shelf === "active" ? "active" : ""}
            onClick={() => onFilter({ ...filter, shelf: "active" })}
            aria-pressed={filter.shelf === "active"}
          >
            <StickyNote size={14} /> Board <span className="count">{counts.active}</span>
          </button>
          <button
            type="button"
            className={filter.shelf === "archived" ? "active" : ""}
            onClick={() => onFilter({ ...filter, shelf: "archived" })}
            aria-pressed={filter.shelf === "archived"}
          >
            <Archive size={14} /> Archive <span className="count">{counts.archived}</span>
          </button>
        </div>

        <label className="sticky-sort">
          <ArrowUpDown size={14} aria-hidden="true" />
          <span className="sr-only">Sort notes</span>
          <select value={sort} onChange={(event) => onSort(event.target.value as SortKey)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* NOT `secondary` — that is the app's secondary-button utility in
          styles.css, and it carries `justify-content: center`, which centred
          this row until a "Clear filters" button appeared with
          `margin-left: auto` and knocked it back to the left. */}
      <div className="sticky-toolbar-row filters">
        <div className="sticky-color-filter" role="group" aria-label="Filter by colour">
          {NOTE_COLORS.map((color) => {
            const on = filter.color === color.key;
            return (
              <button
                key={color.key}
                type="button"
                className={on ? "sticky-swatch selected" : "sticky-swatch"}
                style={{ backgroundColor: color.swatch }}
                // Clicking the colour you already have on clears it, so the
                // filter is its own escape hatch rather than needing Reset.
                onClick={() => onFilter({ ...filter, color: on ? null : color.key })}
                aria-pressed={on}
                title={on ? `${color.label} — click to clear` : color.label}
              />
            );
          })}
        </div>

        {tags.length ? (
          <div className="sticky-tag-filter" role="group" aria-label="Filter by tag">
            {tags.slice(0, 12).map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                className={filter.tags.includes(tag) ? "sticky-tag chip selected" : "sticky-tag chip"}
                onClick={() => toggleTag(tag)}
                aria-pressed={filter.tags.includes(tag)}
              >
                {tag} <span className="count">{count}</span>
              </button>
            ))}
          </div>
        ) : null}

        {hasFilters ? (
          <button
            type="button"
            className="sticky-clear-filters"
            onClick={() => onFilter({ ...filter, query: "", color: null, tags: [] })}
          >
            <X size={13} /> Clear filters
            <span className="count">{counts.showing} shown</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
