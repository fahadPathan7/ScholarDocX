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
