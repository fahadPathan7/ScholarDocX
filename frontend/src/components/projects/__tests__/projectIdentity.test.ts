import { describe, expect, it } from "vitest";
import { PROJECT_ACCENTS, projectAccent, projectMonogram } from "../projectIdentity";

describe("projectAccent", () => {
  it("is stable for the same key", () => {
    expect(projectAccent("7c1e-project")).toBe(projectAccent("7c1e-project"));
  });

  it("always returns a palette colour, including for an empty key", () => {
    ["", "a", "b0f6", "a much longer project identifier 1234567890"].forEach((key) => {
      expect(PROJECT_ACCENTS).toContain(projectAccent(key));
    });
  });

  it("spreads different keys over more than one colour", () => {
    const colours = new Set(Array.from({ length: 40 }, (_, i) => projectAccent(`project-${i}`)));
    expect(colours.size).toBeGreaterThan(3);
  });
});

describe("projectMonogram", () => {
  it("uses the first letters of the first two words", () => {
    expect(projectMonogram("Canada PhD 2027")).toBe("CP");
  });

  it("uses two letters of a single word", () => {
    expect(projectMonogram("housing")).toBe("HO");
    expect(projectMonogram("x")).toBe("X");
  });

  it("handles blank names and extra spaces", () => {
    expect(projectMonogram("   ")).toBe("?");
    expect(projectMonogram("  trip   plan ")).toBe("TP");
  });
});
