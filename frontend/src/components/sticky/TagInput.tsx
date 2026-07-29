import { useMemo, useState } from "react";
import { Tag, X } from "lucide-react";
import { MAX_TAGS_PER_NOTE, dedupeTags, normalizeTag, suggestTags } from "../../lib/stickyNotes";

/**
 * Tag entry with autocomplete over tags already in use (SCHOLARDOCX-0201).
 *
 * Suggestions matter more than they look: without them people re-type a tag
 * slightly differently and end up with "sop draft" and "sop drafts" as two
 * unrelated filters. Normalization catches case and spacing; showing what
 * already exists catches the rest.
 */
export function TagInput({
  tags,
  known,
  onChange,
}: {
  tags: string[];
  known: { tag: string; count: number }[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS_PER_NOTE;

  const suggestions = useMemo(
    () => (full ? [] : suggestTags(known, draft, tags)),
    [known, draft, tags, full],
  );

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || full) return;
    onChange(dedupeTags([...tags, tag]));
    setDraft("");
  };

  const remove = (tag: string) => onChange(tags.filter((existing) => existing !== tag));

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter and comma both commit — people type tags both ways, and a comma
    // that silently became part of the tag would be a small daily annoyance.
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
      return;
    }
    // Backspace on an empty box removes the last tag, the usual convention.
    if (event.key === "Backspace" && !draft && tags.length) {
      event.preventDefault();
      remove(tags[tags.length - 1]);
    }
  };

  return (
    <div className="sticky-tag-field">
      <div className="sticky-tag-input-row">
        <Tag size={14} aria-hidden="true" />
        {tags.map((tag) => (
          <span className="sticky-tag chip" key={tag}>
            {tag}
            <button type="button" onClick={() => remove(tag)} aria-label={`Remove tag ${tag}`}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          // Committing on blur means a typed-but-not-entered tag is not lost
          // when someone clicks straight to Save.
          onBlur={() => add(draft)}
          placeholder={full ? `${MAX_TAGS_PER_NOTE} tags is the limit` : "Add a tag…"}
          disabled={full}
          aria-label="Add a tag"
        />
      </div>
      {suggestions.length ? (
        <div className="sticky-tag-suggestions">
          {suggestions.map((tag) => (
            <button type="button" key={tag} onClick={() => add(tag)}>
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
