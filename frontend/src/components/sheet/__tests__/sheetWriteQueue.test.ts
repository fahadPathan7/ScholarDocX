import { describe, expect, it } from "vitest";
import { createSheetWriteQueue, timestampMs } from "../sheetWriteQueue";

type Saved = { updated_at: string; value: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("sheetWriteQueue", () => {
  it("sends writes one at a time, in order", async () => {
    const queue = createSheetWriteQueue<Saved>();
    const started: string[] = [];
    const first = deferred<Saved>();

    const a = queue.run(() => {
      started.push("type text");
      return first.promise;
    });
    const b = queue.run(async () => {
      started.push("clear cell");
      return { updated_at: "2026-11-12T10:00:02Z", value: "" };
    });

    await new Promise((resolve) => setTimeout(resolve, 0)); // let queued work start
    // The clear must not reach the server before the earlier write finished.
    expect(started).toEqual(["type text"]);
    expect(queue.pending).toBe(2);

    first.resolve({ updated_at: "2026-11-12T10:00:01Z", value: "hdfdjk" });
    await a;
    await b;
    expect(started).toEqual(["type text", "clear cell"]);
    expect(queue.pending).toBe(0);
  });

  it("keeps going after a failed write", async () => {
    const queue = createSheetWriteQueue<Saved>();
    const failed = queue.run(() => Promise.reject(new Error("network")));
    const next = queue.run(async () => ({ updated_at: "2026-11-12T10:00:03Z", value: "ok" }));
    await expect(failed).rejects.toThrow("network");
    await expect(next).resolves.toMatchObject({ value: "ok" });
    expect(queue.pending).toBe(0);
  });

  it("rejects a reload taken before the latest edit", async () => {
    const queue = createSheetWriteQueue<Saved>();
    const clear = deferred<Saved>();
    const write = queue.run(() => clear.promise);

    // Reload from the earlier save arrives while the clear is in flight.
    expect(queue.isStale("2026-11-12T10:00:01Z")).toBe(true);

    clear.resolve({ updated_at: "2026-11-12T10:00:02Z", value: "" });
    await write;

    // ...or after it, but carrying an older timestamp.
    expect(queue.isStale("2026-11-12T10:00:01Z")).toBe(true);
    // A genuinely newer snapshot (another tab, an agent) still applies.
    expect(queue.isStale("2026-11-12T10:00:05Z")).toBe(false);
  });

  it("forgets write history when another sheet opens", async () => {
    const queue = createSheetWriteQueue<Saved>();
    await queue.run(async () => ({ updated_at: "2026-11-12T10:00:09Z", value: "x" }));
    queue.reset();
    expect(queue.isStale("2026-11-12T10:00:01Z")).toBe(false);
  });

  it("parses server timestamps with or without a T separator", () => {
    expect(timestampMs("2026-11-12 10:00:01")).toBe(timestampMs("2026-11-12T10:00:01"));
    expect(timestampMs(undefined)).toBe(0);
    expect(timestampMs("not a date")).toBe(0);
  });
});
