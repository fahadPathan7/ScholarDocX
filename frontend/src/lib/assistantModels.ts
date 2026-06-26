export type ModelProvider = "groq" | "mistral" | "gemini" | "glm";

export type ModelOption = {
  provider: ModelProvider;
  providerLabel: string;
  value: string;
  label: string;
};

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "groq:openai/gpt-oss-120b": "GPT OSS 120B",
  "groq:groq/compound": "Groq Compound",
  "groq:llama-3.3-70b-versatile": "Llama 3.3 70B (Versatile)",
  "groq:qwen/qwen3-32b": "Qwen 3 32B",
  "groq:meta-llama/llama-4-scout-17b-16e-instruct": "Llama 4 Scout 17B Instruct",
  "groq:openai/gpt-oss-20b": "GPT OSS 20B",
  "mistral:mistral-large-latest": "Mistral Large",
  "mistral:mistral-medium-3-5": "Mistral Medium 3.5",
  "mistral:devstral-2512": "Devstral 2512",
  "gemini:gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini:gemini-2.5-flash-lite": "Gemini 2.5 Flash-Lite",
  "GLM-5.2": "GLM-5.2",
  "GLM-5.1": "GLM-5.1",
  "GLM-5": "GLM-5",
  "GLM-5-Turbo": "GLM-5-Turbo",
  "GLM-4.7": "GLM-4.7",
  "GLM-4.6V": "GLM-4.6V (Vision)",
};

export const MODEL_OPTIONS: ModelOption[] = [
  { provider: "groq", providerLabel: "Groq", value: "groq:openai/gpt-oss-120b", label: "GPT OSS 120B" },
  { provider: "groq", providerLabel: "Groq", value: "groq:groq/compound", label: "Groq Compound" },
  { provider: "groq", providerLabel: "Groq", value: "groq:llama-3.3-70b-versatile", label: "Llama 3.3 70B (Versatile)" },
  { provider: "groq", providerLabel: "Groq", value: "groq:qwen/qwen3-32b", label: "Qwen 3 32B" },
  { provider: "groq", providerLabel: "Groq", value: "groq:meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B Instruct" },
  { provider: "groq", providerLabel: "Groq", value: "groq:openai/gpt-oss-20b", label: "GPT OSS 20B" },
  { provider: "mistral", providerLabel: "Mistral", value: "mistral:mistral-large-latest", label: "Mistral Large" },
  { provider: "mistral", providerLabel: "Mistral", value: "mistral:mistral-medium-3-5", label: "Mistral Medium 3.5" },
  { provider: "mistral", providerLabel: "Mistral", value: "mistral:devstral-2512", label: "Devstral 2512" },
  { provider: "gemini", providerLabel: "Google AI Studio", value: "gemini:gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { provider: "gemini", providerLabel: "Google AI Studio", value: "gemini:gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { provider: "glm", providerLabel: "GLM", value: "GLM-5.2", label: "GLM-5.2" },
  { provider: "glm", providerLabel: "GLM", value: "GLM-5.1", label: "GLM-5.1" },
  { provider: "glm", providerLabel: "GLM", value: "GLM-5", label: "GLM-5" },
  { provider: "glm", providerLabel: "GLM", value: "GLM-5-Turbo", label: "GLM-5-Turbo" },
  { provider: "glm", providerLabel: "GLM", value: "GLM-4.7", label: "GLM-4.7" },
  { provider: "glm", providerLabel: "GLM", value: "GLM-4.6V", label: "GLM-4.6V (Vision)" },
];

export const MODEL_PROVIDER_FEATURES = {
  gemini: "can_use_gemini",
  groq: "can_use_groq",
  mistral: "can_use_mistral",
  glm: "can_use_glm",
} as const;


export function getProviderForModel(model: string): ModelProvider {
  const lowered = model.toLowerCase();
  if (lowered.startsWith("gemini:") || lowered.startsWith("gemini-")) return "gemini";
  if (lowered.startsWith("groq:") || lowered.startsWith("llama") || lowered.startsWith("qwen") || lowered.startsWith("openai/") || lowered.startsWith("meta-llama/")) return "groq";
  if (lowered.startsWith("mistral:") || lowered.startsWith("mistral") || lowered.startsWith("devstral") || lowered.startsWith("pixtral") || lowered.startsWith("ministral")) return "mistral";
  return "glm";
}

export function getProviderDisplayName(provider: ModelProvider) {
  return provider === "gemini"
    ? "Google AI Studio"
    : provider === "groq"
      ? "Groq"
      : provider === "mistral"
        ? "Mistral"
        : "GLM";
}

export function getModelDisplayName(model: string) {
  return MODEL_DISPLAY_NAMES[model] || model;
}

export function getFallbackModel(
  preferred: "chat" | "background",
  allowedProviders: Set<ModelProvider>,
  modelOptions: ModelOption[] = MODEL_OPTIONS,
) {
  const orderedFallbacks = preferred === "chat"
    ? ["gemini:gemini-2.5-flash", "groq:openai/gpt-oss-120b", "mistral:mistral-medium-3-5", "GLM-5.1"]
    : ["gemini:gemini-2.5-flash-lite", "groq:openai/gpt-oss-20b", "mistral:mistral-medium-3-5", "GLM-5-Turbo"];
  const firstAllowedExplicit = orderedFallbacks.find((value) => allowedProviders.has(getProviderForModel(value)));
  if (firstAllowedExplicit) return firstAllowedExplicit;
  return modelOptions.find((option) => allowedProviders.has(option.provider))?.value ?? "gemini:gemini-2.5-flash";
}
