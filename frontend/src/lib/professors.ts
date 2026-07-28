/**
 * Saved-professor helpers (SCHOLARDOCX-0195 / 0196).
 *
 * Pure functions, kept out of the view so the filtering and grouping the
 * library depends on can be tested without rendering anything — this project
 * has no DOM testing library.
 */

// Type-only: this module is pure logic and must not pull the API client (or
// anything else with runtime behaviour) into a test or a consumer that only
// needs the shapes.
import type { RecordMap } from "./api";

export type ProfessorRecord = RecordMap & {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  profile_url?: string | null;
  research_interests?: string | null;
  notes?: string | null;
  university_id?: string | null;
  program_id?: string | null;
  updated_at?: string | null;
};

export const UNAFFILIATED_GROUP = "No university linked";

/** Free-text search across the fields a person would actually search by. */
export function matchesQuery(professor: ProfessorRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    professor.name,
    professor.title,
    professor.email,
    professor.research_interests,
    professor.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/**
 * Group professors under their university.
 *
 * Records with no university land in an explicit group rather than being
 * dropped — every professor saved before SCHOLARDOCX-0195 has a null
 * `university_id`, and silently hiding them would recreate the original
 * complaint ("i don't find where it saved") in a new place.
 */
export function groupByUniversity(
  professors: ProfessorRecord[],
  universityNames: Record<string, string>,
): { university: string; professors: ProfessorRecord[] }[] {
  const groups = new Map<string, ProfessorRecord[]>();
  professors.forEach((professor) => {
    const key = professor.university_id
      ? universityNames[String(professor.university_id)] || UNAFFILIATED_GROUP
      : UNAFFILIATED_GROUP;
    groups.set(key, [...(groups.get(key) || []), professor]);
  });
  return [...groups.entries()]
    .map(([university, items]) => ({
      university,
      professors: [...items].sort((left, right) =>
        String(left.name).localeCompare(String(right.name)),
      ),
    }))
    .sort((left, right) => {
      // Unaffiliated last: it is a residue group, not a place.
      if (left.university === UNAFFILIATED_GROUP) return 1;
      if (right.university === UNAFFILIATED_GROUP) return -1;
      return left.university.localeCompare(right.university);
    });
}

/**
 * Should a `refreshTrigger` change cause a re-fetch?
 *
 * The initial render already loads, so trigger 0 (and an absent trigger) must
 * not fire a second request. Lives here rather than inline in the effect so
 * the rule is testable without a DOM — this project has no renderer in its
 * test setup.
 */
export function shouldRefetch(trigger?: number): boolean {
  return typeof trigger === "number" && trigger > 0;
}
