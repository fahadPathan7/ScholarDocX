import { describe, expect, it } from "vitest";
import {
  BANNED_COPY_PATTERNS,
  CONNECTED_APPS_COPY,
  buildClaudeCodeCommand,
  buildJsonConfig,
  formatWhen,
  mcpUrlFromApiBase,
  scopeLabel,
} from "./connectedAppsHelpers";

describe("mcpUrlFromApiBase", () => {
  it("swaps the /api suffix for /mcp on the same origin", () => {
    expect(mcpUrlFromApiBase("https://api.example.com/api")).toBe("https://api.example.com/mcp");
    expect(mcpUrlFromApiBase("http://127.0.0.1:8000/api/")).toBe("http://127.0.0.1:8000/mcp");
  });
  it("leaves a base without /api alone", () => {
    expect(mcpUrlFromApiBase("https://api.example.com")).toBe("https://api.example.com/mcp");
  });
});

describe("setup snippets", () => {
  const url = "https://api.example.com/mcp";
  it("builds the Claude Code command with the key as a bearer header", () => {
    expect(buildClaudeCodeCommand(url, "sdx_abc")).toBe(
      'claude mcp add --transport http scholardocx https://api.example.com/mcp --header "Authorization: Bearer sdx_abc"',
    );
  });
  it("builds valid JSON for editors that read a config file", () => {
    const parsed = JSON.parse(buildJsonConfig(url, "sdx_abc"));
    expect(parsed.mcpServers.scholardocx).toEqual({ url, headers: { Authorization: "Bearer sdx_abc" } });
  });
});

describe("labels", () => {
  it("names the two scopes in plain words", () => {
    expect(scopeLabel("read")).toBe("Can read");
    expect(scopeLabel("read_suggest")).toBe("Can read and suggest changes");
  });
  it("formats missing or invalid dates as Never", () => {
    expect(formatWhen(null)).toBe("Never");
    expect(formatWhen("not a date")).toBe("Never");
    expect(formatWhen("2026-11-12T10:00:00Z")).not.toBe("Never");
  });
});

describe("user-facing copy", () => {
  it("contains no protocol, provider or infrastructure jargon", () => {
    const text = Object.values(CONNECTED_APPS_COPY).join(" \n ");
    for (const pattern of BANNED_COPY_PATTERNS) {
      expect(text).not.toMatch(pattern);
    }
  });
});
