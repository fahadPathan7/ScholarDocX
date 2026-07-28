import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  ExternalLink,
  GraduationCap,
  Mail,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { advisorAtlasApi, SavedProfessor } from "../../lib/advisorAtlasApi";
import {
  groupByUniversity,
  matchesQuery,
  shouldRefetch,
} from "../../lib/professors";
import { useDialog } from "../DialogProvider";
import "./advisor-atlas-saved.css";

/** Up to two initials for the card's identity mark. */
function initials(name: string): string {
  const parts = (name || "")
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * The saved-professor library (SCHOLARDOCX-0196).
 *
 * A library and nothing else: the advisors kept from searches, and a way back
 * into each one's dossier. It deliberately has no create or edit form — the
 * dossier is the record, this is the shelf.
 */
export function AdvisorSavedProfessors({
  refreshTrigger,
  onToast,
  onOpenDossier,
  onOpenSavedDossier,
  onBackToSearch,
}: {
  refreshTrigger?: number;
  onToast: (message: string) => void;
  onOpenDossier: (candidateId: string) => void;
  /** Opens the frozen copy, for a professor whose search has been deleted. */
  onOpenSavedDossier: (professorId: string) => void;
  onBackToSearch?: () => void;
}) {
  const { showConfirm } = useDialog();
  const [professors, setProfessors] = useState<SavedProfessor[]>([]);
  const [maxSaved, setMaxSaved] = useState(100);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const library = await advisorAtlasApi.listSavedProfessors();
      setProfessors(library.professors);
      setMaxSaved(library.max_saved);
    } catch {
      onToast("Could not load your saved professors.");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch on refresh without disturbing the search box.
  useEffect(() => {
    if (shouldRefetch(refreshTrigger)) load();
  }, [refreshTrigger, load]);

  const visible = useMemo(
    () => professors.filter((professor) => matchesQuery(professor, query)),
    [professors, query],
  );

  // The join already carries the university name, so grouping needs no lookup
  // table — feed it a map built from the rows themselves.
  const universityNames = useMemo(() => {
    const names: Record<string, string> = {};
    professors.forEach((professor) => {
      if (professor.university_id && professor.university_name) {
        names[String(professor.university_id)] = professor.university_name;
      }
    });
    return names;
  }, [professors]);

  const grouped = useMemo(
    () => groupByUniversity(visible, universityNames),
    [visible, universityNames],
  );

  // With one group there is nothing to distinguish, so the heading is just a
  // bar across the page — and when that one group is "No university linked"
  // it leads with an absence. Show headings only when they separate something.
  const showGroupHeadings = grouped.length > 1;

  const remove = async (professor: SavedProfessor) => {
    const confirmed = await showConfirm(
      `Remove ${professor.name} from your saved professors? The dossier stays in its search — only the saved copy goes.`,
      "Remove from saved?",
      "danger",
    );
    if (!confirmed) return;
    setRemoving(professor.id);
    try {
      await advisorAtlasApi.removeSavedProfessor(professor.id);
      onToast(`${professor.name} removed from saved professors.`);
      await load();
    } catch {
      onToast("Could not remove that professor.");
    } finally {
      setRemoving(null);
    }
  };

  const nearingCap = professors.length >= maxSaved * 0.9;

  return (
    <div className="atlas-saved">
      <header className="atlas-saved-header">
        <div>
          <span className="atlas-eyebrow">Saved professors</span>
          <h2>Your advisor library</h2>
          <p>
            Advisors you kept from a search. Open one to read its full dossier
            again.
          </p>
        </div>
        <div className={`atlas-saved-capacity${nearingCap ? " near" : ""}`}>
          <strong>
            {professors.length}
            <span>/{maxSaved}</span>
          </strong>
          <small>saved</small>
        </div>
      </header>

      {professors.length > 0 && (
        <div className="atlas-saved-toolbar">
          <label className="atlas-saved-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find by name, title, interest or note"
            />
          </label>
          {query && (
            <span className="atlas-saved-count">
              {visible.length} of {professors.length}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="atlas-saved-empty">
          <span className="atlas-spinner" />
          <h3>Loading your library…</h3>
        </div>
      ) : !professors.length ? (
        <div className="atlas-saved-empty">
          <Users size={30} />
          <h3>No professors saved yet.</h3>
          <p>
            Run a search, open an advisor's dossier and choose “Save to
            professors”. They will appear here, ready to revisit.
          </p>
          {onBackToSearch && (
            <button onClick={onBackToSearch}>
              <Search size={15} /> Find advisors
            </button>
          )}
        </div>
      ) : !visible.length ? (
        <div className="atlas-saved-empty">
          <Search size={30} />
          <h3>Nothing matches “{query}”.</h3>
          <button onClick={() => setQuery("")}>Clear search</button>
        </div>
      ) : (
        <div className="atlas-saved-groups">
          {grouped.map((group) => (
            <section key={group.university}>
              {showGroupHeadings && (
                <header>
                  <div>
                    <Building2 size={15} />
                    <strong>{group.university}</strong>
                  </div>
                  <span>{group.professors.length}</span>
                </header>
              )}
              <div className="atlas-saved-grid">
                {group.professors.map((professor) => {
                  // Prefer the live candidate, fall back to the frozen copy.
                  // Only a professor saved before dossiers were snapshotted
                  // can have neither.
                  const open = professor.candidate_id
                    ? () => onOpenDossier(String(professor.candidate_id))
                    : professor.has_dossier
                      ? () => onOpenSavedDossier(professor.id)
                      : null;
                  const openable = Boolean(open);
                  return (
                    <article
                      key={professor.id}
                      className={`atlas-saved-card${openable ? " openable" : ""}`}
                      // The whole card is the target — a library entry's one
                      // job is to get you back to the dossier.
                      onClick={open ?? undefined}
                      role={openable ? "button" : undefined}
                      tabIndex={openable ? 0 : undefined}
                      onKeyDown={
                        open
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                open();
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="atlas-saved-card-head">
                        {/* Same initials mark the dossier header uses, so a
                            card and the panel it opens read as one thing. */}
                        <span className="atlas-saved-avatar" aria-hidden="true">
                          {initials(professor.name)}
                        </span>
                        <div className="atlas-saved-identity">
                          <h4>{professor.name}</h4>
                          {professor.title && <p>{professor.title}</p>}
                          {(professor.university_name || professor.program_name) && (
                            <small>
                              <GraduationCap size={12} />
                              {[professor.program_name, professor.university_name]
                                .filter(Boolean)
                                .join(" · ")}
                            </small>
                          )}
                        </div>
                        <button
                          className="atlas-saved-remove"
                          disabled={removing === professor.id}
                          aria-label={`Remove ${professor.name}`}
                          title="Remove from saved"
                          onClick={(event) => {
                            // Without this the card's own click fires too and
                            // the dossier opens behind the confirm dialog.
                            event.stopPropagation();
                            remove(professor);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {professor.research_interests && (
                        <p className="atlas-saved-interests">
                          {professor.research_interests}
                        </p>
                      )}

                      <footer>
                        <div className="atlas-saved-links">
                          {professor.email && (
                            <a
                              href={`mailto:${professor.email}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Mail size={13} />
                              Email
                            </a>
                          )}
                          {professor.profile_url && (
                            <a
                              href={String(professor.profile_url)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <ExternalLink size={13} />
                              Profile
                            </a>
                          )}
                        </div>
                        {openable ? (
                          <span className="atlas-saved-open">
                            {professor.candidate_id ? "Open dossier" : "Open saved dossier"}
                            <ArrowUpRight size={13} />
                          </span>
                        ) : (
                          <span
                            className="atlas-saved-orphan"
                            title="Saved before dossiers were kept with the professor, and the search it came from has since been deleted. Re-run the search to rebuild it."
                          >
                            No dossier kept
                          </span>
                        )}
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
