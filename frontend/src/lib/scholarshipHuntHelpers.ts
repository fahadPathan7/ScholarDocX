// SCHOLARDOCX-0175: pure, DOM-free helpers for the Scholarship Hunt search UI.
// Split out of scholarshipDeepHuntApi.ts so they can be unit-tested in vitest
// (the api module imports api.ts which touches `window` at load time). Tested
// in __tests__/scholarshipHuntHelpers.test.ts.

export type RunCostEstimate = {
  max_sources: number;
  max_credits: number;
};

export type DeepHuntRunProgress = {
  completed?: number;
  total?: number | null;
  message?: string;
  sources_scanned?: number;
  sources_filtered?: number;
  opportunities_extracted?: number;
};

// The default worst-case ceiling mirrors the backend's MAX_RAW_HITS_PER_RUN
// (2 search passes × 8 results = 16 sources) at the default $0.015/hit price
// and default 10000 tokens/$ rate: 16 × 0.015 × 10000 = 2,400 credits. The
// backend returns the real figure (which reflects the admin-configured price)
// on run creation; this is the fallback shown before that first response.
export const DEFAULT_MAX_SOURCES = 16;
export const DEFAULT_MAX_CREDITS = 2400;

/**
 * Format the pre-submit cost-estimate line. Falls back to the static ceiling
 * when the backend hasn't returned a fresh estimate yet. Output is plain
 * language (no provider/algorithm jargon per AGENTS.md): just the ceiling.
 */
export function formatCostEstimate(estimate?: RunCostEstimate | null): string {
  const maxSources = estimate?.max_sources ?? DEFAULT_MAX_SOURCES;
  const maxCredits = estimate?.max_credits ?? DEFAULT_MAX_CREDITS;
  return `Up to ${maxSources} sources \u00b7 up to ${maxCredits.toLocaleString()} credits`;
}

/**
 * Predicate for whether the live funnel counters should render during a run.
 * Returns true once the backend has reported at least one counter value, so
 * the funnel doesn't flash empty before the first progress update.
 */
export function shouldShowFunnel(progress?: DeepHuntRunProgress | null): boolean {
  if (!progress) return false;
  return (
    progress.sources_scanned !== undefined ||
    progress.sources_filtered !== undefined ||
    progress.opportunities_extracted !== undefined
  );
}
