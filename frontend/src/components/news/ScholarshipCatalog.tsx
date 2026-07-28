import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Loader2 } from "lucide-react";
import {
  CatalogEntry,
  getScholarshipCatalog,
} from "../../lib/scholarshipOpportunitiesApi";

// SCHOLARDOCX-0176: the catalog is static-only. The paid "Check current
// cycle" action is removed; each card shows enriched descriptions, tags,
// and 1-N official links. Entries are split into Program/Central and
// University-specific sections. Discovery is via tag chips only.
interface ScholarshipCatalogProps {
  onToast: (msg: string) => void;
}

export function ScholarshipCatalog({ onToast }: ScholarshipCatalogProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    try {
      const data = await getScholarshipCatalog();
      setEntries(data);
    } catch (error) {
      onToast("Failed to load the scholarship catalog.");
    } finally {
      setIsLoading(false);
    }
  };

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    entries.forEach((e) =>
      e.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1))
    );
    // Surface the most common tags first; cap to keep the chip row usable.
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([tag]) => tag);
  }, [entries]);

  // Client-side filter: active tags (AND semantics across selected tags).
  const filterEntry = (e: CatalogEntry): boolean => {
    if (activeTags.size === 0) return true;
    const entryTags = new Set(e.tags.map((t) => t.toLowerCase()));
    for (const wanted of activeTags) {
      if (!entryTags.has(wanted.toLowerCase())) return false;
    }
    return true;
  };

  const programEntries = useMemo(
    () => entries.filter((e) => e.category === "program" && filterEntry(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, activeTags]
  );
  const universityEntries = useMemo(
    () => entries.filter((e) => e.category === "university" && filterEntry(e)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, activeTags]
  );

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="news-loading">
        <Loader2 className="icon-spin" size={24} />
        <span>Loading the scholarship catalog...</span>
      </div>
    );
  }

  const totalVisible = programEntries.length + universityEntries.length;

  return (
    <div className="scholarship-catalog">
      {allTags.length > 0 && (
        <div className="scholarship-catalog-tags" aria-label="Filter by topic">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`scholarship-catalog-tag-chip ${
                activeTags.has(tag) ? "active" : ""
              }`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
          {activeTags.size > 0 && (
            <button
              type="button"
              className="scholarship-catalog-tag-clear"
              onClick={() => setActiveTags(new Set())}
            >
              Clear tags
            </button>
          )}
        </div>
      )}


      <p className="scholarship-catalog-hint">
        {totalVisible === entries.length
          ? `${entries.length} scholarships · free reference, links open in a new tab`
          : `${totalVisible} of ${entries.length} shown`}
      </p>

      {totalVisible === 0 && (
        <p className="news-empty-subtext">
          No scholarships match the selected tags. Clear the tags to see everything.
        </p>
      )}

      {/* Section: Program & Central scholarships */}
      {programEntries.length > 0 && (
        <CatalogSection
          title="Program & Central Scholarships"
          subtitle="Government, foundation, and multilateral programs open to broad applicant pools."
          count={programEntries.length}
          entries={programEntries}
        />
      )}

      {/* Section: University-specific scholarships */}
      {universityEntries.length > 0 && (
        <CatalogSection
          title="University-Specific Scholarships"
          subtitle="Awards bound to a single host institution — apply directly to the university."
          count={universityEntries.length}
          entries={universityEntries}
        />
      )}
    </div>
  );
}

function CatalogSection({
  title,
  subtitle,
  count,
  entries,
}: {
  title: string;
  subtitle: string;
  count: number;
  entries: CatalogEntry[];
}) {
  return (
    <section className="scholarship-catalog-section">
      <header className="scholarship-catalog-section-header">
        <div className="scholarship-catalog-section-title-row">
          <h3>{title}</h3>
          <span className="scholarship-catalog-section-count">{count}</span>
        </div>
        <p className="scholarship-catalog-section-subtitle">{subtitle}</p>
      </header>
      <div className="scholarship-catalog-grid">
        {entries.map((entry) => (
          <CatalogCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  return (
    <div className="scholarship-catalog-card">
      <div className="scholarship-catalog-card-header">
        <h4>{entry.canonical_name}</h4>
        {entry.in_library && (
          <span className="opportunity-in-library-badge">In library</span>
        )}
      </div>
      <p className="scholarship-catalog-sponsor">{entry.sponsor}</p>
      <p className="scholarship-catalog-description">{entry.description}</p>
      <div className="opportunity-badges">
        <span
          className={`opportunity-funding-badge coverage-${entry.funding.coverage}`}
        >
          {entry.funding.coverage === "full" ? "Full funding" : "Partial funding"}
        </span>
        {entry.levels.map((lv) => (
          <span key={lv} className="scholarship-catalog-level-chip">
            {lv}
          </span>
        ))}
      </div>
      {entry.destinations.length > 0 && (
        <p className="scholarship-catalog-destinations">
          {entry.destinations.join(" · ")}
        </p>
      )}
      {entry.funding.notes && (
        <p className="scholarship-catalog-funding-notes">{entry.funding.notes}</p>
      )}
      {entry.cycle_months.length > 0 && (
        <p className="scholarship-catalog-cycle">
          <CalendarClock size={13} />
          <span>Typical window: {entry.cycle_months.join(", ")}</span>
        </p>
      )}
      {entry.tags.length > 0 && (
        <div className="scholarship-catalog-card-tags">
          {entry.tags.map((tag) => (
            <span key={tag} className="scholarship-catalog-card-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="scholarship-catalog-card-actions">
        {entry.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="catalog-btn-outline"
          >
            {link.label} <ExternalLink size={14} />
          </a>
        ))}
      </div>
    </div>
  );
}
