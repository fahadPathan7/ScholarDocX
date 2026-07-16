import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  GitCompareArrows,
  MapPinned,
  Network,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  AdvisorCandidate,
  AdvisorDepartmentRelation,
  AdvisorDiscoverySummary,
} from "../../lib/advisorAtlasApi";
import {
  AdvisorCandidateCard,
  DiscoveryCardVariant,
} from "./AdvisorCandidateCard";

type Stage = "map" | "faculty" | "matches" | "opportunities";
type Sort = "recommended" | "alignment" | "confidence" | "outlook" | "name";

type Props = {
  candidates: AdvisorCandidate[];
  summary?: AdvisorDiscoverySummary;
  compareIds: string[];
  refreshingCandidateId: string | null;
  onOpenCandidate: (id: string) => void;
  onRefreshCandidate: (id: string) => void;
  onShortlist: (candidate: AdvisorCandidate) => void;
  onCompare: (candidate: AdvisorCandidate) => void;
  onOpenComparison: () => void;
  onClearComparison: () => void;
};

const stageMeta = {
  map: {
    label: "University map",
    eyebrow: "Where Advisor Atlas looked",
    description: "Direct, adjacent, and interdisciplinary units related to the requested field.",
    icon: MapPinned,
  },
  faculty: {
    label: "Verified faculty",
    eyebrow: "Who was verified",
    description: "Professors found across accessible official and public academic sources.",
    icon: Users,
  },
  matches: {
    label: "Research matches",
    eyebrow: "Who aligns with your work",
    description: "Faculty with at least one defensible semantic bridge to your research interests.",
    icon: Sparkles,
  },
  opportunities: {
    label: "Opportunity outlook",
    eyebrow: "Who may be recruiting",
    description: "Research matches with a confirmed opening or strong near-term recruitment likelihood.",
    icon: Radar,
  },
};

export function AdvisorDiscoveryFunnel({
  candidates,
  summary,
  compareIds,
  refreshingCandidateId,
  onOpenCandidate,
  onRefreshCandidate,
  onShortlist,
  onCompare,
  onOpenComparison,
  onClearComparison,
}: Props) {
  const coverage = summary?.coverage || {};
  const departments = summary?.department_map || [];
  const [stage, setStage] = useState<Stage>(() => (
    coverage.opportunity_matches
      ? "opportunities"
      : coverage.research_matches
        ? "matches"
        : candidates.length
          ? "faculty"
          : "map"
  ));
  const [query, setQuery] = useState("");
  const [unitFilter, setUnitFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("recommended");

  const ids = useMemo(() => ({
    faculty: new Set(summary?.faculty_ids || candidates.map((candidate) => candidate.id)),
    matches: new Set(summary?.research_match_ids || []),
    opportunities: new Set(summary?.opportunity_match_ids || []),
  }), [candidates, summary]);

  const visibleUnits = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const units = departments.filter((unit) => {
      const matchesQuery = !normalizedQuery
        || `${unit.name} ${unit.reason}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (unitFilter === "all" || unit.relation === unitFilter);
    });
    return [...units].sort((left, right) => (
      sort === "name"
        ? String(left.name).localeCompare(String(right.name))
        : (right.relevance_score || 0) - (left.relevance_score || 0)
    ));
  }, [departments, query, sort, unitFilter]);

  const visibleCandidates = useMemo(() => {
    if (stage === "map") return [];
    const normalizedQuery = query.trim().toLowerCase();
    const stageIds = ids[stage];
    const filtered = candidates.filter((candidate) => {
      if (!stageIds.has(candidate.id)) return false;
      if (unitFilter !== "all" && candidate.department !== unitFilter) return false;
      if (!normalizedQuery) return true;
      const intelligence = candidate.intelligence || {};
      return [
        candidate.display_name,
        candidate.department,
        candidate.title,
        candidate.research_summary,
        ...(intelligence.matched_interests || []),
        ...(intelligence.match_reasons || []),
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
    return [...filtered].sort((left, right) => {
      if (sort === "name") return left.display_name.localeCompare(right.display_name);
      if (sort === "alignment") return right.match_score - left.match_score;
      if (sort === "confidence") return right.evidence_confidence - left.evidence_confidence;
      if (sort === "outlook") {
        return (right.intelligence?.opportunity_outlook?.likelihood || 0)
          - (left.intelligence?.opportunity_outlook?.likelihood || 0);
      }
      const leftRecommended = left.match_score + left.evidence_confidence
        + (left.intelligence?.opportunity_outlook?.likelihood || 0);
      const rightRecommended = right.match_score + right.evidence_confidence
        + (right.intelligence?.opportunity_outlook?.likelihood || 0);
      return rightRecommended - leftRecommended;
    });
  }, [candidates, ids, query, sort, stage, unitFilter]);

  const groupedFaculty = useMemo(() => {
    const groups = new Map<string, AdvisorCandidate[]>();
    visibleCandidates.forEach((candidate) => {
      const key = candidate.department || "Affiliation needs verification";
      groups.set(key, [...(groups.get(key) || []), candidate]);
    });
    return [...groups.entries()];
  }, [visibleCandidates]);

  const stageCount = (key: Stage) => {
    if (key === "map") return coverage.units_mapped || departments.length;
    if (key === "faculty") return coverage.verified_faculty || ids.faculty.size;
    if (key === "matches") return coverage.research_matches || ids.matches.size;
    return coverage.opportunity_matches || ids.opportunities.size;
  };
  const ActiveIcon = stageMeta[stage].icon;
  const cardVariant = stage as DiscoveryCardVariant;

  const changeStage = (nextStage: Stage) => {
    setStage(nextStage);
    setQuery("");
    setUnitFilter("all");
    setSort("recommended");
  };

  return (
    <div className="atlas-discovery-v2">
      <section className="atlas-discovery-overview">
        <div>
          <span className="atlas-eyebrow">Discovery intelligence</span>
          <h2>{summary?.requested_field || "Selected field"} advisor landscape</h2>
          <p>
            The university was mapped first. Faculty were then verified, matched to
            your interests, and screened for credible PhD opportunity signals.
          </p>
        </div>
        <div className="atlas-discovery-coverage-badge">
          <ShieldCheck size={21} />
          <span>Coverage</span>
          <strong>{coverage.directories_accessible || 0} accessible directories</strong>
          <small>{coverage.sources_inspected || 0} public sources inspected</small>
        </div>
      </section>

      <nav className="atlas-discovery-steps" aria-label="Discovery stages">
        {(Object.keys(stageMeta) as Stage[]).map((key, index) => {
          const item = stageMeta[key];
          const Icon = item.icon;
          return (
            <div className="atlas-discovery-step-wrap" key={key}>
              <button
                className={stage === key ? "active" : ""}
                onClick={() => changeStage(key)}
                aria-pressed={stage === key}
              >
                <span className="atlas-discovery-step-number">{index + 1}</span>
                <Icon size={19} />
                <span>
                  <strong>{item.label}</strong>
                  <small>{stageCount(key)} {key === "map" ? "units" : "professors"}</small>
                </span>
              </button>
              {index < 3 && <ArrowRight size={16} aria-hidden="true" />}
            </div>
          );
        })}
      </nav>

      {compareIds.length > 0 && (
        <div className="atlas-discovery-selection-bar" role="status">
          <GitCompareArrows size={17} />
          <strong>{compareIds.length} selected</strong>
          <span>
            {compareIds.length < 2
              ? "Select one more professor to compare."
              : "Compare research alignment, evidence, recruitment, and risks."}
          </span>
          <button onClick={onOpenComparison} disabled={compareIds.length < 2}>
            Compare now
          </button>
          <button
            className="icon"
            onClick={onClearComparison}
            aria-label="Clear comparison selection"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <section className="atlas-discovery-stage">
        <header className="atlas-discovery-stage-header">
          <div>
            <span><ActiveIcon size={17} /> {stageMeta[stage].eyebrow}</span>
            <h3>{stageMeta[stage].label}</h3>
            <p>{stageMeta[stage].description}</p>
          </div>
          <strong>{stage === "map" ? visibleUnits.length : visibleCandidates.length} shown</strong>
        </header>

        <div className="atlas-discovery-toolbar">
          <label className="atlas-discovery-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={stage === "map" ? "Find an academic unit" : "Find a professor, topic, or method"}
            />
          </label>
          <label>
            <span>{stage === "map" ? "Relationship" : "Academic unit"}</span>
            <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}>
              <option value="all">{stage === "map" ? "All relationships" : "All academic units"}</option>
              {stage === "map" ? (
                <>
                  <option value="direct">Direct</option>
                  <option value="adjacent">Adjacent</option>
                  <option value="interdisciplinary">Interdisciplinary</option>
                </>
              ) : departments.map((unit) => (
                <option key={unit.name} value={unit.name}>{unit.name}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="recommended">Recommended</option>
              {stage !== "map" && <option value="alignment">Research alignment</option>}
              {stage !== "map" && <option value="confidence">Source confidence</option>}
              {stage === "opportunities" && <option value="outlook">Recruitment outlook</option>}
              <option value="name">Name</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>

        {stage === "map" ? (
          <UniversityMap
            units={visibleUnits}
            coverage={coverage}
          />
        ) : visibleCandidates.length ? (
          stage === "faculty" ? (
            <div className="atlas-discovery-faculty-groups">
              {groupedFaculty.map(([department, professors]) => (
                <section key={department}>
                  <header>
                    <div><Building2 size={17} /><strong>{department}</strong></div>
                    <span>{professors.length} verified</span>
                  </header>
                  <div className="atlas-discovery-faculty-grid">
                    {professors.map((candidate) => (
                      <Candidate
                        key={candidate.id}
                        candidate={candidate}
                        variant="faculty"
                        compareIds={compareIds}
                        refreshingCandidateId={refreshingCandidateId}
                        onOpenCandidate={onOpenCandidate}
                        onRefreshCandidate={onRefreshCandidate}
                        onShortlist={onShortlist}
                        onCompare={onCompare}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={`atlas-discovery-results ${stage}`}>
              {visibleCandidates.map((candidate) => (
                <Candidate
                  key={candidate.id}
                  candidate={candidate}
                  variant={cardVariant}
                  compareIds={compareIds}
                  refreshingCandidateId={refreshingCandidateId}
                  onOpenCandidate={onOpenCandidate}
                  onRefreshCandidate={onRefreshCandidate}
                  onShortlist={onShortlist}
                  onCompare={onCompare}
                />
              ))}
            </div>
          )
        ) : (
          <div className="atlas-discovery-empty">
            <ActiveIcon size={32} />
            <h3>No professors reached this stage.</h3>
            <p>
              {stage === "opportunities"
                ? "No research match had a confirmed opening or high-confidence near-term recruitment signal."
                : "Adjust the filters or inspect the previous stage and coverage gaps."}
            </p>
            {stage === "opportunities" && (
              <button onClick={() => changeStage("matches")}>Review research matches</button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Candidate({
  candidate,
  variant,
  compareIds,
  refreshingCandidateId,
  onOpenCandidate,
  onRefreshCandidate,
  onShortlist,
  onCompare,
}: {
  candidate: AdvisorCandidate;
  variant: DiscoveryCardVariant;
  compareIds: string[];
  refreshingCandidateId: string | null;
  onOpenCandidate: (id: string) => void;
  onRefreshCandidate: (id: string) => void;
  onShortlist: (candidate: AdvisorCandidate) => void;
  onCompare: (candidate: AdvisorCandidate) => void;
}) {
  return (
    <AdvisorCandidateCard
      candidate={candidate}
      variant={variant}
      selected={compareIds.includes(candidate.id)}
      refreshing={refreshingCandidateId === candidate.id}
      onOpen={() => onOpenCandidate(candidate.id)}
      onCompare={() => onCompare(candidate)}
      onShortlist={() => onShortlist(candidate)}
      onRefresh={() => onRefreshCandidate(candidate.id)}
    />
  );
}

function UniversityMap({
  units,
  coverage,
}: {
  units: AdvisorDepartmentRelation[];
  coverage: NonNullable<AdvisorDiscoverySummary["coverage"]>;
}) {
  return (
    <div className="atlas-university-map-workspace">
      {units.length ? (
        <div className="atlas-university-unit-grid">
          {units.map((unit, index) => (
            <article key={`${unit.name}-${index}`} className={unit.relation || "adjacent"}>
              <header>
                <span>{unit.relation || "related"}</span>
                <strong>{unit.relevance_score || 0}% relevance</strong>
              </header>
              <h4>{unit.name}</h4>
              <p>{unit.reason}</p>
              <div>
                <span><Users size={14} /> {unit.faculty_count || 0} faculty</span>
                <span><Sparkles size={14} /> {unit.research_match_count || 0} matches</span>
                <span><Radar size={14} /> {unit.opportunity_count || 0} opportunities</span>
              </div>
              {unit.source_url && (
                <a href={unit.source_url} target="_blank" rel="noreferrer">
                  View mapping source <ArrowRight size={14} />
                </a>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="atlas-discovery-empty compact">
          <Network size={30} />
          <h3>No related academic units were verified.</h3>
          <p>Review the university URL and requested field, then run a new search.</p>
        </div>
      )}

      <details className="atlas-discovery-coverage">
        <summary>
          <span><ShieldCheck size={17} /> Coverage and limitations</span>
          <span>{coverage.directories_accessible || 0} of {coverage.directories_inspected || 0} directories accessible</span>
        </summary>
        <div className="atlas-discovery-coverage-body">
          <div className="atlas-discovery-coverage-metrics">
            <span><strong>{coverage.sources_inspected || 0}</strong>Sources inspected</span>
            <span><strong>{coverage.directories_inspected || 0}</strong>Directories checked</span>
            <span><strong>{coverage.directories_accessible || 0}</strong>Directories accessible</span>
            <span><strong>{coverage.directories_inaccessible || 0}</strong>Access gaps</span>
          </div>
          <p><CheckCircle2 size={15} /> {coverage.completeness_note}</p>
          {!!coverage.coverage_gaps?.length && (
            <div className="atlas-discovery-gaps">
              <strong><ShieldAlert size={16} /> Known coverage gaps</strong>
              {coverage.coverage_gaps.map((gap) => <span key={gap}>{gap}</span>)}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
