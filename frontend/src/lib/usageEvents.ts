// Dedicated event asking the app to open the "Your Current Usage & Limits"
// modal from anywhere (e.g. the out-of-credits modal's "See usage" action).
// Same window-event-bus pattern as lib/tokenEvents.ts: App.tsx listens and
// mounts the app-level <UsageModal>, which reads its own data from the
// usage/token-economy contexts — so no data needs to travel with the event.
// Kept dependency-free so any component can dispatch it.
const USAGE_MODAL_EVENT = "scholardocx:open-usage-modal";

export function openUsageModal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(USAGE_MODAL_EVENT));
}

// Subscribe helper: registers `callback` for every open-usage-modal request
// and returns a cleanup function for the caller's effect teardown.
export function onOpenUsageModal(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(USAGE_MODAL_EVENT, handler as EventListener);
  return () => window.removeEventListener(USAGE_MODAL_EVENT, handler as EventListener);
}
