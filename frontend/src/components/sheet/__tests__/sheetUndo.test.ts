import { describe, it, expect } from "vitest";
import { createHistory, recordHistory, undoHistory, redoHistory, MAX_HISTORY } from "../sheetUndo";

describe("sheet history", () => {
  it("undo returns the previous state and redo returns the undone one", () => {
    let h = createHistory("initial");
    h = recordHistory(h, "A");
    h = recordHistory(h, "B");

    const u1 = undoHistory(h);
    expect(u1.snapshot).toBe("A");

    const u2 = undoHistory(u1.history);
    expect(u2.snapshot).toBe("initial");

    const r1 = redoHistory(u2.history);
    expect(r1.snapshot).toBe("A");

    const r2 = redoHistory(r1.history);
    expect(r2.snapshot).toBe("B");
  });

  it("cannot undo past the initial state or redo past the newest", () => {
    let h = createHistory("initial");
    expect(undoHistory(h).snapshot).toBeNull();
    expect(redoHistory(h).snapshot).toBeNull();

    h = recordHistory(h, "A");
    const { history: afterUndo } = undoHistory(h);
    expect(undoHistory(afterUndo).snapshot).toBeNull();
  });

  it("recording after an undo discards the redo branch", () => {
    let h = createHistory("initial");
    h = recordHistory(h, "A");
    h = recordHistory(h, "B");
    const { history: afterUndo } = undoHistory(h); // now at A
    const h2 = recordHistory(afterUndo, "C");

    expect(redoHistory(h2).snapshot).toBeNull();
    expect(undoHistory(h2).snapshot).toBe("A");
  });

  it("caps the stack at MAX_HISTORY", () => {
    let h = createHistory(0);
    for (let i = 1; i <= MAX_HISTORY + 20; i++) {
      h = recordHistory(h, i);
    }
    expect(h.stack.length).toBe(MAX_HISTORY);
    expect(h.stack[h.stack.length - 1]).toBe(MAX_HISTORY + 20);
  });
});
