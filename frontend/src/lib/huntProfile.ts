import { api, RecordMap } from "./api";
import { ScholarshipOpportunity } from "./scholarshipOpportunitiesApi";

export interface HuntProfile {
  degree_level: string;
  destinations: string[];
  field_of_study: string;
  intake_term: string;
  nationality_opt_in: boolean;
  nationality: string | null;
  funding_requirement?: string;
  english_proficiency?: string;
  current_gpa?: string;
}

export const EMPTY_HUNT_PROFILE: HuntProfile = {
  degree_level: "",
  destinations: [],
  field_of_study: "",
  intake_term: "",
  nationality_opt_in: false,
  nationality: null,
  funding_requirement: "Any",
  english_proficiency: "Not set",
  current_gpa: "",
};

function parseHuntProfile(raw: unknown): HuntProfile {
  if (typeof raw !== "string" || !raw.trim()) return { ...EMPTY_HUNT_PROFILE };
  try {
    const parsed = JSON.parse(raw);
    return { ...EMPTY_HUNT_PROFILE, ...parsed };
  } catch {
    return { ...EMPTY_HUNT_PROFILE };
  }
}

export function isHuntProfileEmpty(profile: HuntProfile): boolean {
  return (
    !profile.degree_level &&
    profile.destinations.length === 0 &&
    !profile.field_of_study &&
    !profile.intake_term
  );
}

export function isHuntProfileComplete(profile: HuntProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.degree_level &&
    profile.destinations.length > 0 &&
    profile.field_of_study &&
    profile.intake_term
  );
}

/** Loads the current user's Hunt Profile from their local profile row (creating
 * the row first if none exists yet, mirroring ProfileView.tsx's pattern). */
export async function getHuntProfile(): Promise<{ profileId: string; profile: HuntProfile }> {
  const rows = await api.get<RecordMap[]>("/local_profiles");
  if (rows.length === 0) {
    const created = await api.post<RecordMap>("/local_profiles", { data: {} });
    return { profileId: created.id, profile: { ...EMPTY_HUNT_PROFILE } };
  }
  return { profileId: rows[0].id, profile: parseHuntProfile(rows[0].hunt_profile_json) };
}

export async function saveHuntProfile(profileId: string, profile: HuntProfile): Promise<void> {
  await api.patch(`/local_profiles/${profileId}`, {
    data: { hunt_profile_json: JSON.stringify(profile) },
  });
}

export interface FitResult {
  score: number;
  matches: string[];
  mismatches: string[];
}

const LEVEL_ALIASES: Record<string, string[]> = {
  "bachelor's": ["bachelor's", "bachelor", "undergraduate"],
  "master's": ["master's", "master", "postgraduate"],
  phd: ["phd", "doctoral", "doctorate"],
  postdoctoral: ["postdoctoral", "postdoc"],
};

function normalizedLevelSet(levels: string[]): Set<string> {
  const set = new Set<string>();
  for (const level of levels) {
    const lower = level.trim().toLowerCase();
    set.add(lower);
    for (const [canonical, aliases] of Object.entries(LEVEL_ALIASES)) {
      if (aliases.includes(lower)) set.add(canonical);
    }
  }
  return set;
}

// Field-of-study synonym groups (SCHOLARDOCX-0173). Used by computeFitScore so
// "CSE" matches "computer science"/"computer engineering"/"software
// engineering" and vice-versa. Kept compact — the backend planner emits a
// richer per-query synonym list; this is the client-side fallback for cards.
const FIELD_SYNONYM_GROUPS: Record<string, string[]> = {
  "computer science": ["computer science", "computer engineering", "computing", "cs", "cse", "software engineering", "artificial intelligence", "ai", "machine learning", "data science"],
  "computer engineering": ["computer engineering", "ce", "computer science", "cs", "cse", "electrical engineering"],
  "electrical engineering": ["electrical engineering", "ee", "electronics"],
  "mechanical engineering": ["mechanical engineering", "mechatronics"],
  "civil engineering": ["civil engineering", "construction"],
  business: ["business", "business administration", "mba", "management", "finance"],
  economics: ["economics", "finance", "economy"],
  biology: ["biology", "biological sciences", "biotechnology", "life sciences"],
  physics: ["physics", "applied physics"],
  mathematics: ["mathematics", "math", "statistics", "applied mathematics"],
  chemistry: ["chemistry", "chemical engineering"],
};

/** Normalize one field string to lowercase alphanumerics for matching. */
function normalizeField(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Word tokens of a field string, e.g. "Classics" -> {"classics"}. Used so
 * "cs" does NOT match "classics" (raw substring matching did — "cs" is in
 * "classics"). SCHOLARDOCX-0173. */
function fieldTokens(field: string): Set<string> {
  return new Set(normalizeField(field).split(" ").filter(Boolean));
}

/** True iff any synonym token set shares a token with any field token set, OR a
 * multi-word synonym (>2 chars) is a full phrase substring of a field or
 * vice-versa. Guards short abbreviations ("cs","ai","me") from leaking into
 * unrelated words. */
function fieldsOverlap(synonyms: string[], fields: string[]): boolean {
  const synPhrases = synonyms.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const fldPhrases = fields.map((f) => f.toLowerCase().trim()).filter(Boolean);
  for (const s of synPhrases) {
    for (const f of fldPhrases) {
      // Require BOTH phrases longer than 2 chars before allowing phrase
      // substring matching; otherwise short abbreviations ("cs","ai","me")
      // leak into unrelated words ("cs" is in "classics", "ai" in "brain").
      if (Math.min(s.length, f.length) > 2 && (s.includes(f) || f.includes(s))) return true;
    }
  }
  const synTokens = new Set<string>();
  for (const s of synPhrases) for (const t of fieldTokens(s)) synTokens.add(t);
  for (const f of fldPhrases) {
    for (const t of fieldTokens(f)) {
      if (synTokens.has(t)) return true;
    }
  }
  return false;
}

/** Return all lowercase match tokens for a profile field of study: the raw
 * text plus any synonyms from the built-in groups. Empty array when nothing
 * useful could be derived (caller treats as "unstated"). */
function fieldSynonyms(fieldOfStudy: string): string[] {
  const raw = fieldOfStudy.trim();
  if (!raw) return [];
  const normalized = normalizeField(raw);
  const tokens = new Set<string>([normalized]);
  for (const variants of Object.values(FIELD_SYNONYM_GROUPS)) {
    if (fieldsOverlap([raw], [...variants])) {
      for (const v of variants) tokens.add(v.toLowerCase());
    }
  }
  return [...tokens].filter(Boolean);
}

/** Pure, provider-free fit score (planbook Phase 3): level, field of study,
 * destination, deadline feasibility, and funding coverage. No network calls.
 * The field-of-study dimension was added in SCHOLARDOCX-0173. */
export function computeFitScore(
  profile: HuntProfile,
  opportunity: Pick<ScholarshipOpportunity, "degree_levels" | "fields_of_study" | "destinations" | "deadlines" | "funding">,
): FitResult {
  const matches: string[] = [];
  const mismatches: string[] = [];
  let score = 40; // baseline: an opportunity with no stated conflicts is a plausible fit

  if (profile.degree_level) {
    const opportunityLevels = normalizedLevelSet(opportunity.degree_levels || []);
    if (opportunityLevels.size === 0) {
      // unstated — neutral, no evidence either way
    } else if (opportunityLevels.has(profile.degree_level.toLowerCase())) {
      score += 25;
      matches.push(profile.degree_level);
    } else {
      score -= 25;
      mismatches.push(`not ${profile.degree_level}`);
    }
  }

  if (profile.field_of_study) {
    const opportunityFields = (opportunity.fields_of_study || []).slice();
    if (opportunityFields.length === 0) {
      // unstated — neutral, no evidence either way
    } else {
      const profileFieldTokens = fieldSynonyms(profile.field_of_study);
      const hit = fieldsOverlap(profileFieldTokens, opportunityFields);
      if (hit) {
        score += 20;
        matches.push(profile.field_of_study.toLowerCase());
      } else {
        score -= 10;
        mismatches.push("not in your field");
      }
    }
  }

  if (profile.destinations.length > 0) {
    const opportunityDestinations = (opportunity.destinations || []).map((d) => d.toLowerCase());
    if (opportunityDestinations.length === 0) {
      // unstated — neutral
    } else {
      const hit = profile.destinations.find((d) => opportunityDestinations.includes(d.toLowerCase()));
      if (hit) {
        score += 20;
        matches.push(hit);
      } else {
        score -= 15;
        mismatches.push(`not in ${profile.destinations.join("/")}`);
      }
    }
  }

  const nearestDeadline = [...(opportunity.deadlines || [])]
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (nearestDeadline) {
    const deadlineDate = new Date(nearestDeadline.date);
    const intakeYear = extractYear(profile.intake_term);
    if (!Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now()) {
      score -= 20;
      mismatches.push("deadline has passed");
    } else if (intakeYear && !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getFullYear() > intakeYear) {
      score -= 10;
      mismatches.push(`deadline after your ${profile.intake_term} intake`);
    } else {
      score += 10;
      matches.push(`deadline ${nearestDeadline.date}`);
    }
  }

  if (opportunity.funding?.coverage === "full") {
    score += 5;
    matches.push("full funding");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    matches,
    mismatches,
  };
}

function extractYear(intakeTerm: string): number | null {
  const match = intakeTerm.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}
