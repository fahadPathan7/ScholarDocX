import { describe, it, expect } from "vitest";
import {
  ANSWERS,
  dayNumber,
  isWellFormed,
  keyboardState,
  MAX_GUESSES,
  progressOf,
  scoreGuess,
  WORD_LENGTH,
  wordForDay,
} from "../wordPuzzle";

/** "GA..." — G green, A amber, . grey. Far easier to read than an array. */
const score = (guess: string, answer: string) =>
  scoreGuess(guess, answer)
    .map((mark) => ({ green: "G", amber: "A", grey: "." }[mark]))
    .join("");

describe("scoreGuess", () => {
  it("marks an exact match all green", () => {
    expect(score("crane", "crane")).toBe("GGGGG");
  });

  it("marks a guess sharing nothing all grey", () => {
    expect(score("crane", "moist")).toBe(".....");
  });

  it("marks present-but-misplaced letters amber", () => {
    expect(score("crane", "nacre")).toBe("AAAAG");
  });

  it("is case-insensitive on both sides", () => {
    expect(score("CRANE", "crane")).toBe("GGGGG");
    expect(score("crane", "CRANE")).toBe("GGGGG");
  });

  describe("duplicate letters — the part that is easy to get wrong", () => {
    it("gives no amber for a letter the answer has already spent on a green", () => {
      // "three" holds two e. One is green in the last position, one goes amber
      // to the first e of the guess — the middle e gets nothing.
      expect(score("eerie", "three")).toBe("A.G.G");
    });

    it("caps ambers at the number of copies the answer actually has", () => {
      // "apple" holds a single l. The first l in the guess takes it; the
      // second must be grey, not a second amber.
      expect(score("allot", "apple")).toBe("GA...");
    });

    it("gives nothing back when the only copy is already green", () => {
      // "basic" holds one s, matched green in place. Neither other s in
      // "sassy" may come back amber.
      expect(score("sassy", "basic")).toBe(".GG..");
    });

    it("counts greens before ambers regardless of position order", () => {
      // Both s and e align. The two earlier e in the guess get nothing,
      // because the answer's only e is spent.
      expect(score("geese", "those")).toBe("...GG");
    });
  });

  it("returns one mark per letter, always one of the three", () => {
    const marks = scoreGuess("crane", "moist");
    expect(marks).toHaveLength(WORD_LENGTH);
    marks.forEach((mark) => expect(["green", "amber", "grey"]).toContain(mark));
  });
});

describe("isWellFormed", () => {
  it("accepts five letters, trimmed and any case", () => {
    expect(isWellFormed("crane")).toBe(true);
    expect(isWellFormed("  CRANE  ")).toBe(true);
  });

  it("rejects the wrong length or anything non-alphabetic", () => {
    expect(isWellFormed("cran")).toBe(false);
    expect(isWellFormed("cranes")).toBe(false);
    expect(isWellFormed("cr4ne")).toBe(false);
    expect(isWellFormed("")).toBe(false);
  });
});

describe("the answer pool", () => {
  it("holds only five-letter lowercase words", () => {
    ANSWERS.forEach((word) => expect(word).toMatch(/^[a-z]{5}$/));
  });

  it("has no duplicates", () => {
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
  });
});

describe("wordForDay", () => {
  it("gives the same word all day", () => {
    expect(wordForDay(500)).toBe(wordForDay(500));
  });

  it("changes from one day to the next", () => {
    expect(wordForDay(500)).not.toBe(wordForDay(501));
  });

  it("does not march alphabetically through the list", () => {
    // `day % length` would hand out adjacent entries on consecutive days,
    // which is guessable once noticed. A coprime stride avoids that.
    const step = ANSWERS.indexOf(wordForDay(501)) - ANSWERS.indexOf(wordForDay(500));
    expect(step).not.toBe(1);
  });

  it("uses every word before repeating any", () => {
    const seen = new Set([...Array(ANSWERS.length).keys()].map((day) => wordForDay(day)));
    expect(seen.size).toBe(ANSWERS.length);
  });

  it("handles a day before the epoch without going out of bounds", () => {
    expect(wordForDay(-5)).toMatch(/^[a-z]{5}$/);
  });

  it("derives the day from the local calendar date", () => {
    const a = dayNumber(new Date(2026, 0, 1, 23, 59));
    const b = dayNumber(new Date(2026, 0, 2, 0, 1));
    expect(b - a).toBe(1);
  });
});

describe("keyboardState", () => {
  it("keeps the best mark a letter has ever earned", () => {
    // 'c', 'r' and 'a' are green in the second guess; the first guess must not
    // be able to pull them back down.
    const state = keyboardState(["crane", "crash"], "crash");
    expect(state.c).toBe("green");
    expect(state.r).toBe("green");
    expect(state.a).toBe("green");
  });

  it("marks letters the answer does not contain", () => {
    const state = keyboardState(["crane"], "crash");
    expect(state.n).toBe("grey");
    expect(state.e).toBe("grey");
  });

  it("is empty before the first guess", () => {
    expect(keyboardState([], "crane")).toEqual({});
  });
});

describe("progressOf", () => {
  it("recognises a win", () => {
    expect(progressOf(["crane"], "crane")).toBe("won");
  });

  it("keeps playing while guesses remain", () => {
    expect(progressOf(["moist"], "crane")).toBe("playing");
  });

  it("loses once the guesses run out", () => {
    expect(progressOf(Array(MAX_GUESSES).fill("moist"), "crane")).toBe("lost");
  });

  it("counts a win on the final guess as a win", () => {
    const guesses = [...Array(MAX_GUESSES - 1).fill("moist"), "crane"];
    expect(progressOf(guesses, "crane")).toBe("won");
  });
});
