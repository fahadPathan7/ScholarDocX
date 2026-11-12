import { describe, expect, it } from "vitest";
import { NON_CHAT_PROVIDER_LABELS, getProviderForModel, normalizeStoredModel } from "./assistantModels";

describe("model list grouping", () => {
  it("names OpenRouter and Jina as their own groups instead of GLM", () => {
    expect(NON_CHAT_PROVIDER_LABELS.openrouter).toBe("OpenRouter");
    expect(NON_CHAT_PROVIDER_LABELS.jina).toBe("Jina");
    // The old fallback: an unknown provider id was treated as GLM, which is the bug.
    expect(getProviderForModel("openrouter:openrouter/free")).toBe("glm");
  });

  it("moves a saved retired Gemini choice to the current model", () => {
    expect(normalizeStoredModel("gemini:gemini-2.5-flash")).toBe("gemini:gemini-3.5-flash-lite");
    expect(normalizeStoredModel(null)).toBeNull();
  });
});
