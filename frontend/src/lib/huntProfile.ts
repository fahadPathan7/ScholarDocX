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
export async function getHuntProfile(): Promise<{ profileId: number; profile: HuntProfile }> {
  const rows = await api.get<RecordMap[]>("/local_profiles");
  if (rows.length === 0) {
    const created = await api.post<RecordMap>("/local_profiles", { data: {} });
    return { profileId: created.id, profile: { ...EMPTY_HUNT_PROFILE } };
  }
  return { profileId: rows[0].id, profile: parseHuntProfile(rows[0].hunt_profile_json) };
}

export async function saveHuntProfile(profileId: number, profile: HuntProfile): Promise<void> {
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

/** Pure, provider-free fit score (planbook Phase 3): level, destination,
 * deadline feasibility, and funding coverage. No network calls. */
export function computeFitScore(
  profile: HuntProfile,
  opportunity: Pick<ScholarshipOpportunity, "degree_levels" | "destinations" | "deadlines" | "funding">,
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
