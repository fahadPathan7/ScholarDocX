import { describe, it, expect } from "vitest";
import { parseLocalDate, formatShortDate, formatLongDate } from "../date";

describe("parseLocalDate", () => {
  it("returns null for empty string", () => {
    expect(parseLocalDate("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parseLocalDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseLocalDate(undefined)).toBeNull();
  });

  it("returns null for 0 (falsy number)", () => {
    expect(parseLocalDate(0)).toBeNull();
  });

  it("returns null for invalid string", () => {
    expect(parseLocalDate("invalid")).toBeNull();
  });

  it("parses a valid ISO date string", () => {
    const result = parseLocalDate("2026-07-13");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    // getMonth is 0-indexed, so July = 6
    expect(result!.getMonth()).toBe(6);
    expect(result!.getDate()).toBe(13);
  });

  it("rolls over an impossible date instead of returning null (known limitation)", () => {
    // KNOWN BUG: "2026-13-45" matches the ^\d{4}-\d{2}-\d{2}$ regex, then
    // new Date(2026, 12, 45) auto-rolls over (month 12 → Jan 2027, day 45
    // rolls forward) → a valid but WRONG date instead of null.
    // Documenting current behavior; fixing is a separate task.
    const result = parseLocalDate("2026-13-45");
    expect(result).not.toBeNull();
  });

  it("returns null for a non-ISO date that Date cannot parse", () => {
    expect(parseLocalDate("not-a-date")).toBeNull();
  });

  it("zeroes the time component to start of local day", () => {
    const result = parseLocalDate("2026-07-13");
    expect(result!.getHours()).toBe(0);
    expect(result!.getMinutes()).toBe(0);
    expect(result!.getSeconds()).toBe(0);
  });
});

describe("formatShortDate", () => {
  it("returns 'No date' for null", () => {
    expect(formatShortDate(null)).toBe("No date");
  });

  it("returns 'No date' for empty string", () => {
    expect(formatShortDate("")).toBe("No date");
  });

  it("returns 'No date' for invalid string", () => {
    expect(formatShortDate("invalid")).toBe("No date");
  });

  it("formats a valid date with month abbreviation and day", () => {
    const result = formatShortDate("2026-07-13");
    expect(result).toContain("Jul");
    expect(result).toContain("13");
  });
});

describe("formatLongDate", () => {
  it("returns 'Date TBD' for null", () => {
    expect(formatLongDate(null)).toBe("Date TBD");
  });

  it("returns 'Date TBD' for empty string", () => {
    expect(formatLongDate("")).toBe("Date TBD");
  });

  it("returns 'Date TBD' for invalid string", () => {
    expect(formatLongDate("invalid")).toBe("Date TBD");
  });

  it("formats a valid date with month, day, and year", () => {
    const result = formatLongDate("2026-07-13");
    expect(result).toContain("Jul");
    expect(result).toContain("13");
    expect(result).toContain("2026");
  });
});
