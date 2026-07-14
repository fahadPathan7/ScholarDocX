import { describe, it, expect } from "vitest";
import { buildAccessErrorDetail } from "../accessErrors";

describe("buildAccessErrorDetail — null / no-match cases", () => {
  it("returns null for empty message on 403", () => {
    expect(buildAccessErrorDetail(403, "")).toBeNull();
  });

  it("returns null for whitespace-only message on 403", () => {
    expect(buildAccessErrorDetail(403, "   ")).toBeNull();
  });

  it("returns null for null message", () => {
    // (null || "").trim() === "" → null
    expect(buildAccessErrorDetail(403, null as unknown as string)).toBeNull();
  });

  it("returns null for non-429/403 status", () => {
    expect(buildAccessErrorDetail(200, "error")).toBeNull();
    expect(buildAccessErrorDetail(500, "server error")).toBeNull();
  });
});

describe("buildAccessErrorDetail — rate limiting (429)", () => {
  it("returns a rate-kind error for 429", () => {
    const result = buildAccessErrorDetail(429, "slow down");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("rate");
    expect(result!.title).toBe("Too many requests");
  });
});

describe("buildAccessErrorDetail — limit exceeded (403)", () => {
  it("returns a limit-kind error with feature label from message", () => {
    const result = buildAccessErrorDetail(403, "limit exceeded for ai_tokens_per_month");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("limit");
    expect(result!.message).toContain("monthly AI credits");
  });

  it("returns a limit-kind error for 'limit reached' wording", () => {
    // NOTE: extractFeature only matches "limit exceeded for (slug)", NOT
    // "limit reached for (slug)". So "limit reached" triggers the limit
    // kind but no feature is extracted → falls back to "this action".
    const result = buildAccessErrorDetail(403, "limit reached for total_projects");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("limit");
    expect(result!.message).toContain("this action");
  });

  it("extracts feature from 'limit exceeded for' with known label", () => {
    const result = buildAccessErrorDetail(403, "limit exceeded for total_sheets");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("limit");
    expect(result!.message).toContain("total sheets");
  });

  it("uses unknown feature label when feature slug is not in lookup", () => {
    const result = buildAccessErrorDetail(403, "limit exceeded for unknown_xyz");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("unknown xyz");
  });
});

describe("buildAccessErrorDetail — permission denied (403)", () => {
  it("returns a permission-kind error for 'permission' wording", () => {
    const result = buildAccessErrorDetail(403, "permission denied");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("permission");
  });

  it("extracts feature from 'permission denied for' pattern", () => {
    const result = buildAccessErrorDetail(403, "permission denied for can_use_agents");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("permission");
    expect(result!.message).toContain("AI agent actions");
  });

  it("'access to' alone without 'permission' falls through to general", () => {
    // The substring triggers for the permission branch check for "permission",
    // "admin access required", "disabled for your role", etc. — NOT bare
    // "access to". So a message like "access to can_use_agents" with no
    // "permission" keyword lands in the general fallback, even though
    // extractFeature DOES parse the slug. Documented current behavior.
    const result = buildAccessErrorDetail(403, "access to can_use_agents");
    expect(result!.kind).toBe("general");
  });

  it("returns permission-kind for 'admin access required'", () => {
    const result = buildAccessErrorDetail(403, "admin access required");
    expect(result!.kind).toBe("permission");
  });

  it("returns permission-kind for 'disabled for your role'", () => {
    const result = buildAccessErrorDetail(403, "disabled for your role");
    expect(result!.kind).toBe("permission");
  });

  it("returns permission-kind for 'does not have access'", () => {
    const result = buildAccessErrorDetail(403, "user does not have access");
    expect(result!.kind).toBe("permission");
  });

  it("falls back to 'this action' when no feature is extractable", () => {
    const result = buildAccessErrorDetail(403, "admin access required");
    expect(result!.message).toContain("this action");
  });
});

describe("buildAccessErrorDetail — general fallback (403)", () => {
  it("returns a general-kind error for unrecognized 403 message", () => {
    const result = buildAccessErrorDetail(403, "some random 403 message");
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("general");
    expect(result!.title).toBe("Action blocked");
    // general kind echoes the raw message
    expect(result!.message).toBe("some random 403 message");
  });
});
