/* ------------------------------------------------------------------ */
/*  sheetWriteQueue — ordered sheet saves + stale-reload detection     */
/*                                                                     */
/*  Every sheet save PATCHes the whole sheet and is followed by a      */
/*  reload of it. With overlapping saves, two things went wrong:       */
/*  - an older reload (taken before the user's latest edit) was seen   */
/*    as an external change and wrote the old value back, e.g. a cell  */
/*    that had just been cleared got its text back;                    */
/*  - two in-flight PATCHes could land out of order and persist the    */
/*    older sheet.                                                     */
/*  The queue sends writes one at a time and tells the caller when a   */
/*  reload is stale: a write is still in flight, or the reload's       */
/*  updated_at is older than the newest write the server confirmed.    */
/* ------------------------------------------------------------------ */

export function timestampMs(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function createSheetWriteQueue<T>() {
  let chain: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let lastWriteAt = 0;

  return {
    /** Run `write` after every earlier write has settled (success or not). */
    run(write: () => Promise<T>): Promise<T> {
      pending += 1;
      const next = chain.catch(() => undefined).then(write);
      chain = next;
      return next
        .then((saved) => {
          const updatedAt = (saved as { updated_at?: unknown } | null | undefined)?.updated_at;
          lastWriteAt = Math.max(
            lastWriteAt,
            timestampMs(typeof updatedAt === "string" ? updatedAt : null),
          );
          return saved;
        })
        .finally(() => {
          pending -= 1;
        });
    },

    get pending(): number {
      return pending;
    },

    /** True when a reloaded snapshot must not replace local state. */
    isStale(snapshotUpdatedAt?: string | null): boolean {
      if (pending > 0) return true;
      const at = timestampMs(snapshotUpdatedAt);
      return at > 0 && at < lastWriteAt;
    },

    /** Forget write history (another sheet was opened). */
    reset(): void {
      lastWriteAt = 0;
    },
  };
}
