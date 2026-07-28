import { useEffect, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  BookOpenCheck,
  BriefcaseBusiness,
  ChevronDown,
  Check,
  ClipboardCheck,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  Globe2,
  GraduationCap,
  Github,
  LibraryBig,
  Linkedin,
  Mail,
  Network,
  NotebookPen,
  Radar,
  RefreshCw,
  Route,
  Save,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  UsersRound,
  X,
} from "lucide-react";
import {
  AdvisorCandidateDetail,
  advisorAtlasApi,
} from "../../lib/advisorAtlasApi";
import { useUsage } from "../../contexts/UsageContext";

type Props = {
  /** A live candidate, or null when opening a saved snapshot. */
  candidateId: string | null;
  /** SCHOLARDOCX-0197: opens the dossier frozen when this professor was
   *  saved. Used when the search they came from has been deleted, so the
   *  candidate no longer exists. Read-only — there is nothing live to act on. */
  savedProfessorId?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onToast: (message: string) => void;
  onConfirmSave: (candidate: AdvisorCandidateDetail) => Promise<boolean>;
};

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: string) {
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(value) ? humanize(value) : value;
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.replace("www.", "");
  } catch {
    return "verified source";
  }
}

function withoutKey(value: Record<string, any> | undefined, key: string) {
  if (!value) return value;
  return Object.fromEntries(Object.entries(value).filter(([entryKey]) => entryKey !== key));
}

function isStructuredValue(value: any) {
  return Array.isArray(value) || (value != null && typeof value === "object");
}

function shouldStackDetail(value: any) {
  if (isStructuredValue(value)) return true;
  return typeof value === "string" && (value.length > 72 || value.includes("\n"));
}

function ValueBlock({ value }: { value: any }) {
  if (value == null || value === "") return <span className="atlas-muted">Not verified</span>;
  if (Array.isArray(value)) {
    const containsRecords = value.some((item) => item != null && typeof item === "object");
    return value.length ? (
      <ul className={containsRecords ? "atlas-value-list atlas-value-records" : "atlas-value-list"}>
        {value.map((item, index) => <li key={index}><ValueBlock value={item} /></li>)}
      </ul>
    ) : <span className="atlas-muted">No verified items</span>;
  }
  if (typeof value === "object") {
    return (
      <dl className="atlas-detail-list">
        {Object.entries(value).map(([key, item]) => (
          <div key={key} className={shouldStackDetail(item) ? "atlas-detail-row-stacked" : undefined}>
            <dt>{humanize(key)}</dt>
            <dd><ValueBlock value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span>{typeof value === "string" ? displayValue(value) : String(value)}</span>;
}

function stringList(value: any): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
}

function sentenceList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function NarrativePoints({ value }: { value: unknown }) {
  const points = sentenceList(value);
  if (!points.length) return <span className="atlas-muted">No verified summary</span>;
  if (points.length === 1) return <p className="atlas-narrative-summary">{points[0]}</p>;
  return <ul className="atlas-insight-list">{points.map((point) => <li key={point}>{point}</li>)}</ul>;
}

function splitDatedFact(value: string) {
  const cleaned = value.replace(/\s+([,.;:])/g, "$1").trim();
  const dateMatch = cleaned.match(/\s*\(([^()]*)\)\s*$/);
  const date = dateMatch?.[1];
  const main = dateMatch ? cleaned.slice(0, dateMatch.index).trim() : cleaned;
  const commaIndex = main.indexOf(",");
  return {
    title: commaIndex > 0 ? main.slice(0, commaIndex).trim() : main,
    detail: commaIndex > 0 ? main.slice(commaIndex + 1).trim() : "",
    date,
  };
}

function TimelineFacts({
  items,
  empty,
  currentFirst = false,
}: {
  items: string[];
  empty: string;
  currentFirst?: boolean;
}) {
  if (!items.length) return <p className="atlas-muted">{empty}</p>;
  return (
    <ol className="atlas-profile-timeline">
      {items.map((item, index) => {
        const fact = splitDatedFact(item);
        return (
          <li key={`${item}-${index}`}>
            <span className="atlas-profile-timeline-marker" />
            <div>
              <div className="atlas-profile-timeline-title">
                <strong>{fact.title}</strong>
                {currentFirst && index === 0 && <span>Current</span>}
              </div>
              {fact.detail && <p>{fact.detail}</p>}
              {fact.date && <small>{fact.date}</small>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function BackgroundOverview({ value }: { value: Record<string, any> | undefined }) {
  const positions = stringList(value?.positions);
  const education = stringList(value?.education);
  return (
    <div className="atlas-background-overview">
      {value?.summary && <p className="atlas-background-summary">{value.summary}</p>}
      <div className="atlas-background-columns">
        <section>
          <div className="atlas-profile-subheading">
            <BriefcaseBusiness size={17} />
            <div><strong>Career path</strong><span>{positions.length} verified entries</span></div>
          </div>
          <TimelineFacts items={positions} empty="No verified appointments or positions." currentFirst />
        </section>
        <section>
          <div className="atlas-profile-subheading">
            <GraduationCap size={17} />
            <div><strong>Education</strong><span>{education.length} verified degrees</span></div>
          </div>
          <TimelineFacts items={education} empty="No verified education history." />
        </section>
      </div>
    </div>
  );
}

function DecisionSnapshot({ value }: { value: Record<string, any> | undefined }) {
  const recommendation = value?.recommendation || value?.urgency;
  const summary = value?.fit_summary || value?.why_this_professor;
  const evidence = stringList(value?.strongest_evidence);
  const risks = stringList(value?.key_risks);
  const nextAction = value?.next_action || value?.recommended_next_action;
  return (
    <div className="atlas-decision-body">
      {recommendation && <span className="atlas-decision-badge">{displayValue(String(recommendation))}</span>}
      <NarrativePoints value={summary || "A defensible recommendation needs more verified research evidence."} />
      <div className="atlas-decision-columns">
        <div><strong>Why it fits</strong>{evidence.length ? <ul>{evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <span className="atlas-muted">No verified fit signals</span>}</div>
        <div><strong>Watch-outs</strong>{risks.length ? <ul>{risks.map((item) => <li key={item}>{displayValue(item)}</li>)}</ul> : <span className="atlas-muted">{value?.why_this_may_not_work || "No material counter-signal verified"}</span>}</div>
      </div>
      {nextAction && <div className="atlas-next-step"><Target size={16} /><span><strong>Best next move</strong>{nextAction}</span></div>}
    </div>
  );
}

function RecruitmentOutlook({ value }: { value: Record<string, any> | undefined }) {
  const likelihood = Math.max(0, Math.min(100, Number(value?.likelihood || 0)));
  const signals = stringList(value?.signals);
  const counterSignals = stringList(value?.counter_signals);
  return (
    <div className="atlas-outlook-body">
      <div className="atlas-outlook-score">
        <div><span className={`atlas-status-pill status-${value?.status || "unknown"}`}>{displayValue(String(value?.status || "Unknown"))}</span><strong>{likelihood}%</strong><small>likelihood · {Number(value?.confidence || 0)}% confidence</small></div>
        <div className="atlas-likelihood-track"><span style={{ width: `${likelihood}%` }} /></div>
      </div>
      <div className="atlas-semester-list">
        {stringList(value?.likely_semesters).map((semester) => <span key={semester}>{semester}</span>)}
      </div>
      <div className="atlas-outlook-signals">
        <div><strong>Supporting signals</strong>{signals.length ? <ul>{signals.map((item) => <li key={item}>{item}</li>)}</ul> : <span className="atlas-muted">No verified signals</span>}</div>
        <div><strong>Counter-signals</strong>{counterSignals.length ? <ul>{counterSignals.map((item) => <li key={item}>{item}</li>)}</ul> : <span className="atlas-muted">None verified</span>}</div>
      </div>
      {value?.limitation && <p className="atlas-evidence-limit">{value.limitation}</p>}
    </div>
  );
}

function ResearchInterests({ value, matched }: { value: Record<string, any> | undefined; matched: string[] }) {
  const groups = [
    ["Themes", stringList(value?.themes)],
    ["Methods", stringList(value?.methods)],
    ["Applications", stringList(value?.applications)],
  ] as const;
  return (
    <div className="atlas-research-interests">
      <p>{value?.summary || "Research interests were not reliably extracted from accessible sources."}</p>
      {groups.map(([label, items]) => items.length > 0 && (
        <div key={label}><strong>{label}</strong><div className="atlas-chip-row">{items.map((item) => <span key={item}>{item}</span>)}</div></div>
      ))}
      <div><strong>Your matched interests</strong><div className="atlas-chip-row matched">{matched.length ? matched.map((item) => <span key={item}>{item}</span>) : <span className="empty">No defensible match verified</span>}</div></div>
    </div>
  );
}

function ProfileCollection({ candidate }: { candidate: AdvisorCandidateDetail }) {
  const profiles = candidate.intelligence?.academic_profiles || {};
  const links = [
    ["Official profile", candidate.official_profile_url || profiles.official_profile_url, Globe2],
    ["Personal website", candidate.personal_url || profiles.personal_url, Globe2],
    ["LinkedIn", candidate.linkedin_url || profiles.linkedin_url, Linkedin],
    ["Google Scholar", candidate.google_scholar_url || profiles.google_scholar_url, LibraryBig],
    ["ORCID", profiles.orcid_url, SearchCheck],
    ["Semantic Scholar", profiles.semantic_scholar_url, BookOpenCheck],
    ["ResearchGate", profiles.researchgate_url, Network],
    ["GitHub", profiles.github_url, Github],
    ["Lab website", candidate.lab_url, UsersRound],
  ].filter((item) => Boolean(item[1])) as Array<[string, string, typeof Globe2]>;
  const otherProfiles = Array.isArray(profiles.other_profiles)
    ? profiles.other_profiles.filter((item: any) => /^https?:\/\//i.test(String(item?.url || "")))
    : [];
  return (
    <div className="atlas-profile-grid">
      {links.map(([label, url, Icon]) => <a href={url} target="_blank" rel="noreferrer" key={`${label}-${url}`}><Icon size={18} /><span><strong>{label}</strong><small>{hostname(url)}</small></span><ArrowUpRight size={15} /></a>)}
      {otherProfiles.slice(0, 4).map((item: any) => <a href={item.url} target="_blank" rel="noreferrer" key={item.url}><Globe2 size={18} /><span><strong>{item.label || "Academic profile"}</strong><small>{hostname(item.url)}</small></span><ArrowUpRight size={15} /></a>)}
      {!links.length && !otherProfiles.length && <p className="atlas-muted">No verified profile collection is available yet.</p>}
    </div>
  );
}

function FundingIntelligence({ value }: { value: Record<string, any> | undefined }) {
  const items = Array.isArray(value?.items) ? value.items : [];
  const summary = String(value?.summary || "");
  const fundedOpportunity = /\bfully[\s-]?funded\b|\bstudentship\b/i.test(summary);
  return (
    <div className="atlas-funding-body">
      <div className="atlas-funding-status">
        <span><Sparkles size={15} /> {fundedOpportunity ? "Opportunity verified" : "Funding evidence"}</span>
        <strong>{fundedOpportunity ? "Funded PhD opportunity advertised" : "No named award verified"}</strong>
        <small>{items.length ? `${items.length} supporting record${items.length === 1 ? "" : "s"}` : "No supporting funding record"}</small>
      </div>
      <NarrativePoints value={summary || "No recent grant or funding record was verified."} />
      {items.length > 0 && <div className="atlas-funding-list">{items.slice(0, 6).map((item: any, index: number) => (
        <article key={`${item.title || item.project || "funding"}-${index}`}>
          <div><strong>{item.title || item.project || item.grant || "Opportunity funding record"}</strong>{item.status && <span>{displayValue(String(item.status))}</span>}</div>
          <p>{[item.funder || item.sponsor, item.amount, item.period || item.year]
            .filter((entry) => entry && !/^not specified/i.test(String(entry)))
            .join(" · ") || "Sponsor and amount are not publicly specified."}</p>
          {item.role && <small>Role: {item.role}</small>}
          {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">Source <ArrowUpRight size={13} /></a>}
        </article>
      ))}</div>}
    </div>
  );
}

function LabMembers({ value }: { value: Record<string, any> | undefined }) {
  const members = Array.isArray(value?.members) ? value.members : [];
  return (
    <div className="atlas-lab-body">
      <div className={`atlas-lab-status ${members.length ? "has-members" : ""}`}>
        <UsersRound size={22} />
        <div>
          <strong>{members.length ? `${members.length} public member${members.length === 1 ? "" : "s"} verified` : "No public member roster"}</strong>
          <span>{members.length ? "People named in inspected public sources" : "Current lab and PhD members were not named in inspected sources"}</span>
        </div>
      </div>
      {value?.summary && <NarrativePoints value={value.summary} />}
      {members.length > 0 && (
        <div className="atlas-lab-member-list">
          {members.map((member: any, index: number) => (
            <article key={`${member.name || "member"}-${index}`}><ValueBlock value={member} /></article>
          ))}
        </div>
      )}
    </div>
  );
}

function ResearchMetrics({ value }: { value: Record<string, any> | undefined }) {
  if (!value) return null;
  const failed = Number(value.failed_ai_calls || 0);
  const succeeded = Number(value.ai_calls || 0);
  const credits = Number(value.credits_used || 0);
  const metrics = [
    ["Web searches", value.tavily_searches],
    ["AI analyses", succeeded],
    // A bare "0" here used to cover three different situations. Say which.
    ["Credits used", succeeded ? credits.toLocaleString() : "—"],
    ["Pages read", value.pages_crawled],
    ["Sources", value.sources_inspected],
    ["Research time", `${value.elapsed_seconds || 0}s`],
  ];
  return (
    <>
      <aside className="atlas-research-metrics">
        <span>Research run</span>
        {metrics.map(([label, metric]) => (
          <div key={String(label)}>
            <strong>{metric ?? 0}</strong>
            <small>{label}</small>
          </div>
        ))}
      </aside>
      {failed > 0 && (
        <p className="atlas-degraded-notice" role="status">
          <TriangleAlert size={15} />
          {value.analysis_degraded
            ? "The AI analysis step could not complete for this professor, so this dossier was assembled from the evidence alone. Refresh to try again."
            : `${failed} analysis step${failed === 1 ? "" : "s"} could not complete, so parts of this dossier may be thinner than usual.`}
        </p>
      )}
    </>
  );
}

function ContactPath({ value }: { value: Record<string, any> | undefined }) {
  const entries = Object.entries(value || {}).filter(([, item]) => item != null && item !== "");
  if (!entries.length) return <p className="atlas-muted">No verified contact or application path is available.</p>;
  return (
    <dl className="atlas-contact-list">
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt>{humanize(key)}</dt>
          <dd>
            {key === "email" && typeof item === "string"
              ? <a href={`mailto:${item}`}>{item}</a>
              : <ValueBlock value={item} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CollaborationActivity({
  collaborations,
  recentActivity,
}: {
  collaborations: Record<string, any> | undefined;
  recentActivity: Record<string, any> | undefined;
}) {
  const collaborationItems = Array.isArray(collaborations?.items) ? collaborations.items : [];
  const activityItems = stringList(recentActivity?.items);
  return (
    <div className="atlas-collaboration-stack">
      <section className="atlas-collaboration-group">
        <div className="atlas-subsection-heading">
          <Network size={17} />
          <div><strong>Collaborations</strong><span>Verified people and research relationships</span></div>
        </div>
        <NarrativePoints value={collaborations?.summary} />
        {collaborationItems.length > 0 ? (
          <div className="atlas-collaborator-grid">
            {collaborationItems.map((item: any, index: number) => (
              <article key={`${item.name || "collaborator"}-${index}`}>
                <strong>{item.name || "Verified collaborator"}</strong>
                {item.affiliation && <span>{item.affiliation}</span>}
                {item.relationship && <p>{item.relationship}</p>}
              </article>
            ))}
          </div>
        ) : <p className="atlas-muted">No named collaboration was verified.</p>}
      </section>

      <section className="atlas-collaboration-group">
        <div className="atlas-subsection-heading">
          <Radar size={17} />
          <div><strong>Recent activity</strong><span>Latest dated academic signals</span></div>
        </div>
        {activityItems.length > 0 ? (
          <ol className="atlas-activity-timeline">
            {activityItems.map((item) => <li key={item}><span /> <p>{item}</p></li>)}
          </ol>
        ) : <NarrativePoints value={recentActivity?.summary} />}
      </section>
    </div>
  );
}

function NextActionPlan({ value }: { value: Array<Record<string, any>> | undefined }) {
  const items = Array.isArray(value) ? value : [];
  if (!items.length) return <p className="atlas-muted">No next action has been generated.</p>;
  return (
    <ol className="atlas-next-action-list">
      {items.map((item, index) => (
        <li key={`${item.label || "action"}-${index}`}>
          <span>{index + 1}</span>
          <div>
            {item.type && <small>{displayValue(String(item.type))}</small>}
            <strong>{item.label || "Review this advisor evidence"}</strong>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AdvisorDossierDrawer({
  candidateId,
  savedProfessorId,
  onClose,
  onChanged,
  onToast,
  onConfirmSave,
}: Props) {
  const { refreshUsage } = useUsage();
  const [candidate, setCandidate] = useState<AdvisorCandidateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [notes, setNotes] = useState("");
  // A snapshot has no live candidate behind it, so every action that changes
  // something is unavailable rather than broken.
  const [archived, setArchived] = useState<{ savedAt?: string; source?: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (!candidateId && savedProfessorId) {
        const saved = await advisorAtlasApi.getSavedDossier(savedProfessorId);
        setCandidate(saved.candidate as AdvisorCandidateDetail);
        setNotes((saved.candidate as AdvisorCandidateDetail)?.user_notes || "");
        setArchived({ savedAt: saved.saved_at, source: saved.source_run_label ?? undefined });
        return;
      }
      if (!candidateId) return;
      const data = await advisorAtlasApi.getCandidate(candidateId);
      setCandidate(data);
      setNotes(data.user_notes || "");
      setArchived(null);
    } catch {
      onToast("Could not load the advisor dossier.");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [candidateId, savedProfessorId]);

  const saveNotes = async () => {
    if (!candidate) return;
    setWorking("notes");
    try {
      const data = await advisorAtlasApi.updateCandidate(candidate.id, { user_notes: notes });
      setCandidate(data);
      onChanged();
      onToast("Advisor notes saved.");
    } finally {
      setWorking("");
    }
  };

  const updateReading = async (publicationId: string, readingStatus: string) => {
    if (!candidate) return;
    setWorking(`paper-${publicationId}`);
    try {
      const data = await advisorAtlasApi.updatePublication(candidate.id, publicationId, { reading_status: readingStatus });
      setCandidate(data);
      onChanged();
    } finally {
      setWorking("");
    }
  };

  const refresh = async () => {
    if (!candidate) return;
    setWorking("refresh");
    try {
      const data = await advisorAtlasApi.refreshCandidate(candidate.id);
      setCandidate(data);
      onChanged();
      await refreshUsage();
      onToast("Public evidence refreshed.");
    } catch {
      onToast("The refresh could not be completed.");
    } finally {
      setWorking("");
    }
  };

  const saveProfessor = async () => {
    if (!candidate || !(await onConfirmSave(candidate))) return;
    setWorking("save");
    try {
      await advisorAtlasApi.saveCandidate(candidate.id);
      await load();
      onChanged();
      // Name the destination. "Saved to ScholarDocX" gave no clue where the
      // record had gone, which is exactly what made this untraceable.
      onToast("Saved — find them under Saved professors.");
    } finally {
      setWorking("");
    }
  };

  const institutionIsUrl = Boolean(candidate?.institution && /^https?:\/\//i.test(candidate.institution));
  const identityLine = candidate
    ? [candidate.title, candidate.department, institutionIsUrl ? undefined : candidate.institution].filter(Boolean).join(" · ")
    : "";
  const sourceUrl = candidate?.official_profile_url || (institutionIsUrl ? candidate?.institution : undefined);

  return (
    <div className="atlas-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="atlas-dossier-drawer" role="dialog" aria-modal="true" aria-label="Advisor dossier">
        <header className="atlas-dossier-header">
          <div className="atlas-dossier-identity">
            <div className="atlas-dossier-monogram">
              {(candidate?.display_name || "Advisor").split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}
            </div>
            <div>
            <span className="atlas-eyebrow">Advisor dossier</span>
            <h2>{candidate?.display_name || "Loading dossier"}</h2>
              <p>{candidate ? identityLine || "Individual professor intelligence profile" : "Reading secure evidence..."}</p>
              {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Verified source <ArrowUpRight size={13} /></a>}
            </div>
          </div>
          <button className="atlas-icon-button" onClick={onClose} aria-label="Close dossier"><X size={20} /></button>
        </header>

        {loading || !candidate ? (
          <div className="atlas-dossier-loading"><span className="atlas-spinner" /> Building the evidence view...</div>
        ) : (
          <div className="atlas-dossier-content">
            {archived && (
              <p className="atlas-archived-notice" role="status">
                <Archive size={15} />
                Saved copy{archived.savedAt ? ` from ${new Date(archived.savedAt).toLocaleDateString()}` : ""}
                {archived.source ? ` · ${archived.source}` : ""}. The search this came from
                has been deleted, so this dossier is read-only.
              </p>
            )}

            <div className="atlas-dossier-toolbar">
              <div className="atlas-dossier-actions">
                {/* Every action here changes a live candidate. A snapshot has
                    none, so they are absent rather than disabled. */}
                {!archived && (
                  <>
                <button onClick={refresh} disabled={!!working}><RefreshCw size={16} className={working === "refresh" ? "atlas-spin" : ""} /> Refresh evidence</button>
                <button
                  onClick={saveProfessor}
                  disabled={!!working || !!candidate.saved_professor_id}
                  title={
                    candidate.saved_professor_id
                      ? "This professor is in your Professors records, where outreach, drafts and applications link to them."
                      : "Copy this dossier into your Professors records so you can track outreach against it."
                  }
                >
                  {candidate.saved_professor_id ? <Check size={16} /> : <Save size={16} />}
                  {candidate.saved_professor_id ? "Saved to professors" : "Save to professors"}
                </button>
                  </>
                )}
                {candidate.official_profile_url && <a href={candidate.official_profile_url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Official profile</a>}
              </div>
              <ResearchMetrics value={candidate.intelligence?.research_metrics} />
            </div>

            <section className="atlas-decision-snapshot">
              <div>
                <span>Research alignment</span>
                <strong>{candidate.intelligence?.matching_method === "not_requested" ? "Not scored" : `${candidate.match_score}%`}</strong>
                <small>
                  {candidate.intelligence?.matching_method === "not_requested"
                    ? "Add your research interests to compare alignment."
                    : "Similarity between your interests and verified professor research."}
                </small>
              </div>
              <div>
                <span>Source confidence</span>
                <strong>{candidate.evidence_confidence}%</strong>
                <small>Strength and coverage of public evidence supporting this profile.</small>
              </div>
              <div>
                <span>Decision lane</span>
                <strong>{candidate.decision_lane}</strong>
                <small>Advisor Atlas recommendation category based on available evidence.</small>
              </div>
              <div>
                <span>Current recruitment</span>
                <strong>{humanize(candidate.recruitment_state)}</strong>
                <small>Verified present-day PhD recruitment status, not future likelihood.</small>
              </div>
            </section>

            <div className="atlas-dossier-overview-grid" id="dossier-overview">
              <section className="atlas-dossier-section">
                <h3><ClipboardCheck size={18} /> Decision snapshot</h3>
                <DecisionSnapshot value={candidate.dossier?.decision_snapshot} />
              </section>

              <section className="atlas-dossier-section atlas-dossier-feature">
                <h3><Radar size={18} /> Recruitment outlook</h3>
                <p className="atlas-section-kicker">Evidence forecast for the next three semesters</p>
                <RecruitmentOutlook value={candidate.intelligence?.opportunity_outlook} />
              </section>
            </div>

            <section className="atlas-dossier-section">
              <h3><Globe2 size={18} /> Professor profiles</h3>
              <p className="atlas-section-kicker">Verified professional, scholarly, and laboratory destinations</p>
              <ProfileCollection candidate={candidate} />
            </section>

            <section className="atlas-dossier-section atlas-research-section">
              <h3><FileSearch size={18} /> Research interests and fit</h3>
              <ResearchInterests value={candidate.intelligence?.research_interests} matched={candidate.intelligence?.matched_interests || []} />
            </section>

            <div className="atlas-profile-intelligence-grid">
              <section className="atlas-dossier-section atlas-background-section">
                <h3><GraduationCap size={18} /> Background</h3>
                <BackgroundOverview value={candidate.intelligence?.background} />
              </section>
              <section className="atlas-dossier-section atlas-funding-section">
                <h3><CircleDollarSign size={18} /> Funding intelligence</h3>
                <FundingIntelligence value={candidate.intelligence?.funding} />
              </section>
              <section className="atlas-dossier-section atlas-lab-section">
                <h3><UsersRound size={18} /> Lab and PhD members</h3>
                <LabMembers value={candidate.intelligence?.lab_members} />
              </section>
            </div>

            <section className="atlas-dossier-section atlas-contact-section">
              <h3><Mail size={18} /> Contact and application path</h3>
              <ContactPath value={candidate.intelligence?.contact} />
            </section>

            <section className="atlas-dossier-section">
              <h3><Network size={18} /> Collaborations and recent activity</h3>
              <CollaborationActivity
                collaborations={candidate.intelligence?.collaborations}
                recentActivity={candidate.intelligence?.recent_activity}
              />
            </section>

            <section className="atlas-dossier-section">
              <h3><Target size={18} /> Research fit bridge</h3>
              <div className="atlas-two-column">
                <ValueBlock value={candidate.dossier?.research_bridge} />
                <ValueBlock value={candidate.dossier?.method_bridge} />
              </div>
            </section>

            <section className="atlas-dossier-section">
              <h3><ShieldCheck size={18} /> Evidence coverage</h3>
              <div className="atlas-coverage-grid">
                {Object.entries(candidate.coverage || {}).map(([area, status]) => (
                  <div key={area}><span>{area}</span><strong className={`coverage-${status.toLowerCase()}`}>{status}</strong></div>
                ))}
              </div>
            </section>

            <section className="atlas-dossier-section">
              <div className="atlas-section-heading">
                <div><span className="atlas-eyebrow">Scholarly record</span><h3><BookOpenCheck size={18} /> Latest publications</h3></div>
                <small>Most recent 3–5 verifiable works</small>
              </div>
              {candidate.publications.length ? candidate.publications.map((paper) => (
                <article className="atlas-paper" key={paper.id}>
                  <div className="atlas-paper-priority">{paper.publication_year || "·"}</div>
                  <div>
                    <h4>{paper.title}</h4>
                    <p>
                      {[
                        paper.publication_year,
                        paper.venue,
                        typeof paper.citation_count === "number"
                          ? `${paper.citation_count} citations`
                          : null,
                      ].filter(Boolean).join(" · ") || "Publication details not fully verified"}
                    </p>
                    <small>
                      {paper.evidence_source === "OpenAlex"
                        ? "Verified against the scholarly index"
                        : paper.relevance_reason}
                    </small>
                    <div className="atlas-paper-actions">
                      <select
                        value={paper.reading_status}
                        disabled={working === `paper-${paper.id}`}
                        onChange={(event) => updateReading(paper.id, event.target.value)}
                        aria-label={`Reading status for ${paper.title}`}
                      >
                        <option value="unread">Unread</option>
                        <option value="read_next">Read next</option>
                        <option value="reading">Reading</option>
                        <option value="read">Read</option>
                      </select>
                      {paper.source_url && <a href={paper.source_url} target="_blank" rel="noreferrer">Open source <ArrowUpRight size={14} /></a>}
                    </div>
                  </div>
                </article>
              )) : (
                // "Nothing was found" and "nothing was looked for yet" are very
                // different answers, and only one of them is the user's cue to
                // press Refresh. The publication list is built during deep
                // research, which a screened candidate has not had.
                <p className="atlas-muted">
                  {candidate.intelligence?.research_depth === "deep"
                    ? "No publication record could be verified for this professor in the scholarly index or on any readable page."
                    : "Publications are gathered during deep research, which this professor has not had yet. Use Refresh to run it."}
                </p>
              )}
            </section>

            <section className="atlas-dossier-section atlas-dossier-landscape">
              <div className="atlas-section-heading">
                <div>
                  <span className="atlas-eyebrow">Research landscape</span>
                  <h3>Lab, trajectory and application fit</h3>
                </div>
                <Route size={21} />
              </div>
              <div className="atlas-dossier-fit-grid">
                <article className="atlas-dossier-subcard">
                  <h4><UsersRound size={17} /> Lab environment</h4>
                  <ValueBlock value={candidate.dossier?.lab_environment} />
                </article>
                <article className="atlas-dossier-subcard">
                  <h4><Route size={17} /> Research trajectory</h4>
                  <ValueBlock value={withoutKey(candidate.dossier?.trajectory, "opportunity_outlook")} />
                </article>
                <article className="atlas-dossier-subcard">
                  <h4><Target size={17} /> Application fit</h4>
                  <ValueBlock value={candidate.dossier?.application_fit} />
                </article>
              </div>
            </section>

            <section className="atlas-dossier-section">
              <h3><Target size={18} /> Next-action plan</h3>
              <NextActionPlan value={candidate.dossier?.next_actions} />
            </section>

            {candidate.watch_events.length > 0 && (
              <section className="atlas-dossier-section">
                <h3>What changed</h3>
                <ul>
                  {candidate.watch_events.map((event) => (
                    <li key={event.id}>{String(event.event_type).replace(/_/g, " ")} · {event.detected_at}</li>
                  ))}
                </ul>
              </section>
            )}

            <details className="atlas-dossier-section atlas-evidence-disclosure">
              <summary>
                <div>
                  <h3><ShieldCheck size={18} /> Evidence ledger <span>{Math.min(candidate.evidence.length, 5)} sources</span></h3>
                  <p>The strongest, most diverse sources used in this dossier</p>
                </div>
                <ChevronDown size={20} />
              </summary>
              <div className="atlas-evidence-list">
                {candidate.evidence.slice(0, 5).map((evidence) => (
                  <a href={evidence.source_url} target="_blank" rel="noreferrer" key={evidence.id}>
                    <span><strong>{evidence.page_title || new URL(evidence.source_url).hostname}</strong><small>{evidence.source_type} · confidence {evidence.confidence}%</small></span>
                    <ArrowUpRight size={16} />
                    <p>{evidence.evidence_excerpt || evidence.claim_text}</p>
                  </a>
                ))}
              </div>
            </details>

            <section className="atlas-dossier-section">
              <h3><NotebookPen size={18} /> My notes</h3>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="Record outreach ideas, questions or decisions..." />
              <button className="atlas-primary-button compact" onClick={saveNotes} disabled={working === "notes"}>
                <Save size={16} /> Save notes
              </button>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
