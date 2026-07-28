import { describe, it, expect } from "vitest";
import {
  formatCostEstimate,
  shouldShowFunnel,
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_CREDITS,
} from "./scholarshipHuntHelpers";

describe("formatCostEstimate (SCHOLARDOCX-0175)", () => {
  it("uses the static ceiling when no estimate is provided", () => {
    const line = formatCostEstimate(null);
    expect(line).toContain(`${DEFAULT_MAX_SOURCES} sources`);
    expect(line).toContain(`${DEFAULT_MAX_CREDITS.toLocaleString()} credits`);
  });

  it("reflects a fresh backend estimate", () => {
    const line = formatCostEstimate({ max_sources: 60, max_credits: 900 });
    expect(line).toContain("60 sources");
    expect(line).toContain("900 credits");
  });

  it("does not leak provider or algorithm jargon (AGENTS.md copy rule)", () => {
    const line = formatCostEstimate().toLowerCase();
    expect(line).not.toContain("brave");
    expect(line).not.toContain("tavily");
    expect(line).not.toContain("hit");
    expect(line).not.toContain("relevance");
    expect(line).not.toContain("extraction");
  });

  it("formats large credit counts with thousands separators", () => {
    const line = formatCostEstimate({ max_sources: 80, max_credits: 1200 });
    expect(line).toContain("1,200 credits");
  });
});

describe("shouldShowFunnel (SCHOLARDOCX-0175)", () => {
  it("returns false when progress is null/undefined", () => {
    expect(shouldShowFunnel(null)).toBe(false);
    expect(shouldShowFunnel(undefined)).toBe(false);
  });

  it("returns false before the first progress update lands", () => {
    expect(shouldShowFunnel({ message: "Planning" })).toBe(false);
    expect(shouldShowFunnel({})).toBe(false);
  });

  it("returns true once any counter is present", () => {
    expect(shouldShowFunnel({ sources_scanned: 0 })).toBe(true);
    expect(shouldShowFunnel({ sources_filtered: 5 })).toBe(true);
    expect(shouldShowFunnel({ opportunities_extracted: 3 })).toBe(true);
  });

  it("returns true for a full live funnel", () => {
    expect(
      shouldShowFunnel({
        sources_scanned: 47,
        sources_filtered: 12,
        opportunities_extracted: 6,
      }),
    ).toBe(true);
  });
});
