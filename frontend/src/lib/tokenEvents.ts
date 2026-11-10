// Dedicated event for the AI-token "out of tokens" (HTTP 402) condition.
// Emitted by the API layer; the TokenEconomyProvider listens and opens the
// buy-packs modal. Kept separate from the generic ui-error channel so the
// out-of-tokens UX (offer to buy tokens) is distinct from a plain toast.
export function emitOutOfTokens(message?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("scholardocx:out-of-tokens", { detail: { message } })
  );
}

// Switch the active top-level tab (e.g. from a modal upsell to "Choose Plan").
// Same window-event-bus pattern as emitOutOfTokens; App.tsx listens and calls
// setActiveTab with the supplied tab id.
// Tell the app shell that something shown on the dashboard changed elsewhere (for example a
// sticky note pinned/edited/archived on the Sticky Notes tab). App.tsx re-fetches the dashboard
// summary so the dashboard is current when you switch back, with no manual refresh.
export function emitDashboardChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("scholardocx:dashboard-changed"));
}

export function emitNavigate(tab: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("scholardocx:navigate", { detail: { tab } })
  );
}
