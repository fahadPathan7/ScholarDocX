import {
  ArrowUpRight,
  BookOpenCheck,
  CircleDollarSign,
  FlaskConical,
  GraduationCap,
  Radar,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AdvisorCandidate } from "../../lib/advisorAtlasApi";

type Props = {
  candidate: AdvisorCandidate;
  onOpen: () => void;
  onRefresh: () => void;
  refreshing: boolean;
};

function isWebUrl(value?: string) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function isAcademicUrl(value?: string) {
  if (!isWebUrl(value)) return false;
  try {
    const host = new URL(value!).hostname.toLowerCase();
    return host.endsWith(".edu") || host.includes(".edu.") || host.includes(".ac.");
  } catch {
    return false;
  }
}

function cleanSummary(value?: string) {
  return String(value || "")
    .replace(/^here we go\s*-\s*(instagram|facebook|linkedin)\s*/i, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\bfully-funded\b/gi, "fully funded")
    .trim();
}

function professorReference(name: string) {
  const parts = name.match(/[A-Za-z][A-Za-z'-]*/g) || [];
  return parts[parts.length - 1] || "The professor";
}

function professorPossessive(name: string) {
  const reference = professorReference(name);
  return reference.endsWith("s") ? `${reference}'` : `${reference}'s`;
}

function normalizeProfessorVoice(value: string, name: string) {
  const reference = professorReference(name);
  const possessive = professorPossessive(name);
  return cleanSummary(value)
    .replace(/\bmy research\b/gi, `${possessive} research`)
    .replace(/\bmy work\b/gi, `${possessive} work`)
    .replace(/\bI am\b/gi, `${reference} is`)
    .replace(/\bI'm\b/gi, `${reference} is`)
    .replace(/\bI have\b/gi, `${reference} has`)
    .replace(/\bI focus\b/gi, `${reference} focuses`)
    .replace(/\bI work\b/gi, `${reference} works`)
    .replace(/\bI study\b/gi, `${reference} studies`);
}

function sentences(value?: string) {
  return cleanSummary(value)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function trimFact(value: string, maxLength = 190) {
  const cleaned = cleanSummary(value)
    .replace(/,\s+(including|such as)\b.*[.!?]?$/i, ".")
    .replace(/,\s+(?:(?:which|therefore)\s+)?(?:implying|indicating|suggesting)\b.*[.!?]?$/i, ".")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength - 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 100 ? boundary : clipped.length).trim()}...`;
}

function coreSentence(
  value: string | undefined,
  fallback: string,
  priorities: string[] = [],
) {
  const options = sentences(value);
  for (const priority of priorities) {
    const match = options.find((sentence) => sentence.toLowerCase().includes(priority));
    if (match) return trimFact(match);
  }
  return options.length ? trimFact(options[0]) : fallback;
}

function stringItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(cleanSummary)
    .filter(Boolean);
}

function backgroundSummary(background: Record<string, any>) {
  const positions = stringItems(background.positions);
  const education = stringItems(background.education);
  const position = positions.find((item) => /\bprofessor\b/i.test(item)) || positions[0];
  const degree = education.find((item) => /\b(ph\.?d|doctor)/i.test(item)) || education[0];
  const facts = [position, degree].filter(Boolean).map((item) => (
    /[.!?]$/.test(item!) ? item : `${item}.`
  ));
  return facts.length
    ? trimFact(facts.join(" "), 210)
    : coreSentence(
      background.summary,
      "No verified appointment or education summary is available.",
    );
}

export function AdvisorProfessorBrief({ candidate, onOpen, onRefresh, refreshing }: Props) {
  const intelligence = candidate.intelligence || {};
  const outlook = intelligence.opportunity_outlook || {};
  const background = intelligence.background || {};
  const funding = intelligence.funding || {};
  const members = intelligence.lab_members || {};
  const institution = isWebUrl(candidate.institution) ? undefined : candidate.institution;
  const institutionUrl = isWebUrl(candidate.institution) ? candidate.institution : undefined;
  const profileUrl = [candidate.official_profile_url, institutionUrl].find(isAcademicUrl)
    || candidate.official_profile_url
    || institutionUrl;
  const profileLabel = isAcademicUrl(profileUrl) ? "Official university source" : "Evidence source";
  const fitWasScored = intelligence.matching_method !== "not_requested";
  const identityLine = [candidate.title, candidate.department, institution].filter(Boolean).join(" · ");
  const research = intelligence.research_interests || {};
  const researchSummary = coreSentence(
    normalizeProfessorVoice(
      research.summary || candidate.research_summary || "",
      candidate.display_name,
    ),
    "No verified research direction is available.",
  );
  const researchThemes = (research.themes || []).slice(0, 4);
  const fundingSummary = coreSentence(
    funding.summary,
    "No current grant or funded opportunity was verified.",
    ["fully funded", "fully-funded", "current funding", "recent grant", "grant", "award"],
  );
  const memberSummary = coreSentence(
    members.summary,
    "No public lab-member information was verified.",
    ["no current", "current lab", "members", "students", "research group"],
  );

  return (
    <div className="atlas-professor-brief">
      <section className="atlas-professor-spotlight">
        <div>
          <span className="atlas-eyebrow">Professor intelligence brief</span>
          <h2>{candidate.display_name}</h2>
          <p>{identityLine || "Academic identity requires further verification."}</p>
          <div className="atlas-professor-links">
            <span><ShieldCheck size={15} /> {candidate.evidence_confidence}% evidence confidence</span>
            <span><Radar size={15} /> {String(outlook.status || "unknown").replace(/_/g, " ")}</span>
            {profileUrl && <a href={profileUrl} target="_blank" rel="noreferrer">{profileLabel} <ArrowUpRight size={14} /></a>}
          </div>
        </div>
        <div className="atlas-professor-cta">
          <button onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh evidence"}</button>
          <button className="primary" onClick={onOpen}>Open full dossier <ArrowUpRight size={16} /></button>
        </div>
      </section>

      <section className="atlas-brief-metrics">
        <div><GraduationCap size={20} /><span>Research fit</span><strong>{fitWasScored ? `${candidate.match_score}%` : "Not scored"}</strong></div>
        <div><FlaskConical size={20} /><span>Current recruitment</span><strong>{candidate.recruitment_state.replace(/_/g, " ")}</strong></div>
        <div><Radar size={20} /><span>Future likelihood</span><strong>{outlook.likelihood ?? "Unknown"}{typeof outlook.likelihood === "number" ? "%" : ""}</strong></div>
        <div><BookOpenCheck size={20} /><span>Evidence coverage</span><strong>{Object.values(candidate.coverage || {}).filter((value) => value === "Strong").length} strong areas</strong></div>
      </section>

      <section className="atlas-brief-grid">
        <article>
          <header><GraduationCap size={19} /><h3>Background</h3></header>
          <p>{backgroundSummary(background)}</p>
        </article>
        <article>
          <header><FlaskConical size={19} /><h3>Research direction</h3></header>
          <p className="atlas-brief-summary">{researchSummary}</p>
          {researchThemes.length > 0 && (
            <div className="atlas-brief-topics">
              {researchThemes.map((theme) => <span key={theme}>{theme}</span>)}
            </div>
          )}
        </article>
        <article>
          <header><CircleDollarSign size={19} /><h3>Funding intelligence</h3></header>
          <p>{fundingSummary}</p>
        </article>
        <article>
          <header><UsersRound size={19} /><h3>Lab and PhD members</h3></header>
          <p>{memberSummary}</p>
        </article>
      </section>

      <section className="atlas-outlook-strip">
        <div><Radar size={21} /><div><span className="atlas-eyebrow">Recruitment outlook</span><h3>Next two to three semesters</h3></div></div>
        <div className="atlas-outlook-timeline" aria-label="Likely recruitment semesters">
          {(outlook.likely_semesters || []).map((semester, index) => (
            <div key={semester} className="atlas-outlook-term">
              <span>{index + 1}</span>
              <div><small>{index === 0 ? "Nearest forecast" : "Later forecast"}</small><strong>{semester}</strong></div>
            </div>
          ))}
        </div>
        <p>{outlook.limitation || "Forecasts are evidence-based and require direct verification."}</p>
      </section>
    </div>
  );
}
