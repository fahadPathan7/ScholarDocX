import { describe, it, expect } from "vitest";
import {
  groupByUniversity,
  matchesQuery,
  ProfessorRecord,
  shouldRefetch,
  UNAFFILIATED_GROUP,
} from "../professors";

const professor = (overrides: Partial<ProfessorRecord>): ProfessorRecord =>
  ({ id: "p1", name: "Shaif Chowdhury", ...overrides }) as ProfessorRecord;

describe("matchesQuery", () => {
  const record = professor({
    title: "Assistant Professor of Computer Science",
    email: "shaif@tamu.edu",
    research_interests: "computer vision, medical imaging",
    notes: "met at conference",
  });

  it("matches an empty query", () => {
    expect(matchesQuery(record, "")).toBe(true);
    expect(matchesQuery(record, "   ")).toBe(true);
  });

  it("searches every field a person would search by", () => {
    expect(matchesQuery(record, "chowdhury")).toBe(true);
    expect(matchesQuery(record, "assistant professor")).toBe(true);
    expect(matchesQuery(record, "tamu.edu")).toBe(true);
    expect(matchesQuery(record, "medical imaging")).toBe(true);
    expect(matchesQuery(record, "conference")).toBe(true);
  });

  it("is case-insensitive and rejects non-matches", () => {
    expect(matchesQuery(record, "SHAIF")).toBe(true);
    expect(matchesQuery(record, "astrophysics")).toBe(false);
  });

  it("survives records with empty fields", () => {
    expect(matchesQuery(professor({}), "anything")).toBe(false);
    expect(matchesQuery(professor({}), "shaif")).toBe(true);
  });
});

describe("groupByUniversity", () => {
  const names = { u1: "Texas A&M", u2: "Baylor" };

  it("groups under the university name", () => {
    const groups = groupByUniversity(
      [
        professor({ id: "a", name: "Ann", university_id: "u1" }),
        professor({ id: "b", name: "Bob", university_id: "u2" }),
        professor({ id: "c", name: "Cara", university_id: "u1" }),
      ],
      names,
    );
    expect(groups.map((group) => group.university)).toEqual(["Baylor", "Texas A&M"]);
    expect(groups[1].professors.map((item) => item.name)).toEqual(["Ann", "Cara"]);
  });

  it("keeps unaffiliated professors instead of dropping them", () => {
    // Every professor saved before the university link existed has a null
    // university_id. Hiding them would recreate the original complaint.
    const groups = groupByUniversity([professor({ id: "a", university_id: null })], names);
    expect(groups).toHaveLength(1);
    expect(groups[0].university).toBe(UNAFFILIATED_GROUP);
  });

  it("treats an unknown university id as unaffiliated rather than crashing", () => {
    const groups = groupByUniversity([professor({ id: "a", university_id: "gone" })], names);
    expect(groups[0].university).toBe(UNAFFILIATED_GROUP);
  });

  it("sorts the residue group last", () => {
    const groups = groupByUniversity(
      [
        professor({ id: "a", name: "Ann", university_id: null }),
        professor({ id: "b", name: "Bob", university_id: "u2" }),
      ],
      names,
    );
    expect(groups.map((group) => group.university)).toEqual(["Baylor", UNAFFILIATED_GROUP]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByUniversity([], names)).toEqual([]);
  });
});

/**
 * CODE_RULES requires every new page/tab component to be covered by a test
 * proving it handles `refreshTrigger` for state-preserving refreshes.
 *
 * `AdvisorSavedProfessors` calls `shouldRefetch` in that effect, so the
 * decision it makes is tested here directly. What is NOT tested is the
 * rendered behaviour — that a refresh leaves the search box untouched —
 * because this project has no DOM testing library (vitest alone, no
 * @testing-library/react, no jsdom). Adding one is a dependency decision for
 * the project owner, not something to slip in alongside a feature.
 */
describe("shouldRefetch — the refreshTrigger rule", () => {
  it("re-fetches when the trigger advances", () => {
    expect(shouldRefetch(1)).toBe(true);
    expect(shouldRefetch(42)).toBe(true);
  });

  it("does not fire on the initial render", () => {
    // The mount effect already loads; firing here would double every request.
    expect(shouldRefetch(0)).toBe(false);
    expect(shouldRefetch(undefined)).toBe(false);
  });

  it("ignores a negative trigger", () => {
    expect(shouldRefetch(-1)).toBe(false);
  });
});
