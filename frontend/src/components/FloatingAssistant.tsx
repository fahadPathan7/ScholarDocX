import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Copy, Cpu, Download, FileText, Globe, History, Maximize2, Minimize2, Send, Settings2, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, RecordMap } from "../lib/api";
import { useUsage } from "../contexts/UsageContext";
import { useTokenEconomy } from "../contexts/TokenEconomyContext";
import { useAuth } from "../contexts/AuthContext";
import { emitUiError } from "../lib/uiError";
import {
  getChatStorageKey,
  getFallbackModel,
  getModelDisplayName,
  getProviderDisplayName,
  getProviderForModel,
  LEGACY_CHAT_STORAGE_KEY,
  MODEL_OPTIONS,
  MODEL_PROVIDER_FEATURES,
  type ModelOption,
} from "../lib/assistantModels";
import { useAiModels } from "../hooks/useAiModels";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: RecordMap[];
  mode?: string;
  imageUrl?: string;
  attachments?: { name: string; type: string }[];
  actionPlan?: ActionPlan;
  actionState?: "pending" | "running" | "done" | "cancelled" | "error";
  /** Set on failed chat/research bubbles so the last one can offer a
   *  "Try again" action that replays the exact request. */
  retryRequest?: { path: string; payload: RecordMap };
  /** SCHOLARDOCX-0218: set when a research response actually used web
   *  search, so the bubble can say so (and show the query that was run). */
  search_performed?: boolean;
  search_query?: string;
};

type ChatSession = {
  id: string;
  messages: Message[];
  title: string;
  timestamp: number;
  summary?: string;
};

type ActionPlan = {
  status: "no_action" | "needs_info" | "needs_confirmation";
  message?: string;
  missing?: string[];
  actions?: RecordMap[];
  summary?: string[];
};



// SCHOLARDOCX-0178: fixed cap on stored Ask AI chat sessions (client-side,
// browser localStorage only — see the "capped list -> FIFO eviction" design
// principle in AI-Context/CODE_RULES.md). History is newest-first, so
// slicing to MAX_HISTORY after prepending the current session evicts the
// oldest one first, same as the Scholarship Hunt "Previous Searches" cap.
const MAX_HISTORY = 10;

const SUMMARY_MIN_MESSAGES = 2;
const FAILED_SUMMARY_MODES = new Set(["local-fallback", "provider-error"]);
const ACTION_REQUEST_RE = /\b(create|make|add|start|set up|setup|new|update|edit|change|modify|delete|remove|get|show|list|find|search|count|how many)\b/i;
const ACTION_TARGET_RE = /\b(project|projects|sheet|sheets|row|rows|sticky|note|checklist|column|group|pin|dashboard)\b/i;

function looksLikeWorkspaceAction(message: string) {
  return ACTION_REQUEST_RE.test(message) && ACTION_TARGET_RE.test(message);
}

function formatRecentTurns(messages: Message[], count = 3) {
  const pairs: string[] = [];
  let i = messages.length - 1;
  
  while (i >= 0 && pairs.length < count) {
    if (messages[i].role === "assistant") {
      const assistantMsg = messages[i];
      let userIndex = i - 1;
      while (userIndex >= 0 && messages[userIndex].role !== "user") {
        userIndex -= 1;
      }
      
      if (userIndex >= 0) {
        const userMsg = messages[userIndex];
        pairs.unshift(`User: ${userMsg.content}\nAssistant: ${assistantMsg.content}`);
        i = userIndex - 1;
      } else {
        i -= 1;
      }
    } else if (messages[i].role === "user") {
      if (i === messages.length - 1) {
        pairs.unshift(`User: ${messages[i].content}`);
      }
      i -= 1;
    } else {
      i -= 1;
    }
  }

  if (pairs.length === 0) return "";
  return `[Recent History]\n${pairs.join("\n\n")}`;
}

function buildMemoryContext(session: ChatSession, useSummary: boolean, useExact: boolean, exactCount: number) {
  const sections: string[] = [];
  
  if (useSummary && session.summary?.trim()) {
    sections.push(`[Conversation Summary So Far]\n${session.summary.trim()}`);
  }
  
  if (useExact && exactCount > 0) {
    const recentTurns = formatRecentTurns(session.messages, exactCount);
    if (recentTurns) {
      sections.push(recentTurns);
    }
  }
  
  return sections.join("\n\n");
}

const createInitialGreeting = () => ({
  role: "assistant" as const,
  content: "Hi there! 👋 I'm **Lumi**, your ScholarDocX AI assistant. 🌟\n\nI can help you with:\n🎓 Organizing your university applications\n📅 Tracking important deadlines\n👩‍🏫 Finding the right professors\n🔍 Researching academic programs\n\n🛠️ I can also **manage your workspace** — just ask me to create projects, add sheets, count rows, or show your data!\n\nHow can I assist you today?",
  timestamp: Date.now()
});

// SCHOLARDOCX-0220: compact timestamp for chat-export filenames (yyyymmdd-hhmm).
function formatFileTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function FloatingAssistant({ onWorkspaceChanged }: { onWorkspaceChanged?: () => Promise<void> }) {
  const { user } = useAuth();
  const { usageData, refreshUsage } = useUsage();
  // Metered AI actions spend credits; refresh the balance after each one so
  // the navbar credit widget stays accurate (SCHOLARDOCX-0217).
  const { refresh: refreshTokenEconomy } = useTokenEconomy();
  const userId = user?.id;
  const storageKey = useMemo(() => getChatStorageKey(userId), [userId]);

  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentSession, setCurrentSession] = useState<ChatSession>({
    id: Date.now().toString(),
    messages: [createInitialGreeting()],
    title: "New Chat",
    timestamp: Date.now()
  });
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    return localStorage.getItem("scholarDocX_webSearchEnabled") === "true";
  });
  const [useSummaryContext, setUseSummaryContext] = useState<boolean>(() => {
    return localStorage.getItem("scholarDocX_useSummaryContext") !== "false";
  });
  const [useExactContext, setUseExactContext] = useState<boolean>(() => {
    return localStorage.getItem("scholarDocX_useExactContext") !== "false";
  });
  const [exactChatCount, setExactChatCount] = useState<number>(() => {
    return parseInt(localStorage.getItem("scholarDocX_exactChatCount") || "2", 10);
  });
  const [showSettings, setShowSettings] = useState(false);
  const [webSearchCount, setWebSearchCount] = useState<number>(() => {
    const val = localStorage.getItem("scholarDocX_webSearchCount");
    return val ? parseInt(val, 10) : 2;
  });
  const [webSearchMaxChars, setWebSearchMaxChars] = useState<number>(() => {
    const val = localStorage.getItem("scholarDocX_webSearchMaxChars");
    return val ? parseInt(val, 10) : 300;
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("scholarDocX_selectedModel") || "gemini:gemini-2.5-flash";
  });
  const [backgroundModel, setBackgroundModel] = useState<string>(() => {
    return localStorage.getItem("scholarDocX_backgroundModel") || "gemini:gemini-2.5-flash-lite";
  });

  const [executingActionIndex, setExecutingActionIndex] = useState<number | null>(null);
  // SCHOLARDOCX-0220: transient per-message copy feedback. `ok` switches the
  // inline note between "Copied" and the select-to-copy fallback hint.
  const [copyFeedback, setCopyFeedback] = useState<{ index: number; ok: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasAdjustedRestrictedModelsRef = useRef(false);
  // SCHOLARDOCX-0150: when a scholardocx:open-ai event requests an auto-send
  // (optionally on a fresh chat), we cannot call sendMessage() inline because
  // startNewChat()/setInput are async state updates. We stash the text here
  // and a dedicated effect fires sendMessage(text) once state has settled.
  const pendingSendRef = useRef<string | null>(null);
  // When true, the pending send bypasses looksLikeWorkspaceAction() and always
  // routes to /ai/actions/plan. Set by Ask AI menu messages whose custom queries
  // may not match the narrow frontend action-detection regex.
  const forceActionRef = useRef(false);
  // Copy-feedback auto-clear timer. A second copy must cancel the first
  // feedback's pending timeout or it disappears early (same pattern as the
  // App toast timer).
  const copyFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
    };
  }, []);

  // Auto-scroll to bottom and auto-focus
  useEffect(() => {
    if (open && !showHistory) {
      const timeout = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        if (!loading) {
          inputRef.current?.focus();
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [currentSession.messages, loading, open, showHistory]);

  // Persist settings
  useEffect(() => {
    const handleOpenAi = ((e: CustomEvent) => {
      const detail = (e.detail || {}) as {
        contextMessage?: string;
        autoSend?: boolean;
        newChat?: boolean;
        forceAction?: boolean;
      };
      setOpen(true);

      // SCHOLARDOCX-0150: auto-send path (used by the sheet Ask AI menu).
      // When autoSend is requested, optionally roll the session over to a
      // fresh chat, then queue the send. We cannot call sendMessage() inline
      // because startNewChat()/setInput are async; pendingSendRef + the
      // effect below fire the actual send once state settles.
      if (detail.autoSend && detail.contextMessage) {
        if (detail.newChat) {
          // Save the current session if it has real content, then reset.
          if (currentSession.messages.length > 1) {
            saveCurrentSession();
          }
          setCurrentSession({
            id: Date.now().toString(),
            messages: [createInitialGreeting()],
            title: "New Chat",
            timestamp: Date.now(),
          });
        }
        pendingSendRef.current = detail.contextMessage;
        forceActionRef.current = !!detail.forceAction;
        setInput(detail.contextMessage); // shown in the composer while sending
      } else if (detail.contextMessage) {
        // Legacy pre-fill-only path (no auto-send).
        setInput(detail.contextMessage);
      }
      // Focus is handled by the auto-scroll/auto-focus effect.
    }) as EventListener;
    window.addEventListener("scholardocx:open-ai", handleOpenAi);
    return () => window.removeEventListener("scholardocx:open-ai", handleOpenAi);
  }, [currentSession.messages.length]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_webSearchCount", String(webSearchCount));
  }, [webSearchCount]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_webSearchMaxChars", String(webSearchMaxChars));
  }, [webSearchMaxChars]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_webSearchEnabled", String(webSearchEnabled));
  }, [webSearchEnabled]);

  // Reset textarea height when input is cleared
  useEffect(() => {
    if (inputRef.current && input === "") {
      inputRef.current.style.height = 'auto';
    }
  }, [input]);

  // SCHOLARDOCX-0150: drain a pending auto-send queued by the open-ai event.
  // Fires once the assistant is open, not loading, and (if a new chat was
  // requested) the fresh session has mounted. Uses the override-text path so
  // it does not depend on `input` state having flushed.
  useEffect(() => {
    if (!open || loading) return;
    const text = pendingSendRef.current;
    if (!text) return;
    const force = forceActionRef.current;
    pendingSendRef.current = null;
    forceActionRef.current = false;
    void sendMessage(text, force);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, currentSession.id]);

  const canUseWebSearch = (usageData?.limits?.can_use_web_search ?? 0) === 1;
  // Per-role session message limit for the chat-limit wall and footer counter.
  // Falls back to 30 while usage data loads or when the role is unlimited
  // (matching the previous hardcoded wall).
  const rawSessionLimit = usageData?.limits?.["ai_messages_per_session"];
  const sessionMessageLimit =
    typeof rawSessionLimit === "number" && rawSessionLimit > 0 ? rawSessionLimit : 30;
  const allowedProviders = new Set(
    (Object.keys(MODEL_PROVIDER_FEATURES) as Array<keyof typeof MODEL_PROVIDER_FEATURES>).filter(
      (provider) => (usageData?.limits?.[MODEL_PROVIDER_FEATURES[provider]] ?? 0) === 1
    )
  );
  const blockedProviders = (Object.keys(MODEL_PROVIDER_FEATURES) as Array<keyof typeof MODEL_PROVIDER_FEATURES>).filter(
    (provider) => (usageData?.limits?.[MODEL_PROVIDER_FEATURES[provider]] ?? 0) !== 1
  );
  const { data: dynamicModels } = useAiModels(open);

  const allModelOptions: (ModelOption & { is_active?: boolean })[] = useMemo(() => {
    return dynamicModels
      ? dynamicModels.map(m => {
          const fullId = `${m.provider}:${m.model_id}`;
          const fallbackName = getModelDisplayName(fullId);
          // If display_name is just the raw model_id, fallback to the nice name
          const finalDisplayName = (m.display_name && m.display_name !== m.model_id) 
            ? m.display_name 
            : fallbackName;
          return {
            provider: getProviderForModel(fullId),
            providerLabel: getProviderDisplayName(getProviderForModel(fullId)),
            value: fullId,
            label: finalDisplayName,
            is_active: Number(m.is_active) === 1
          };
        })
      : MODEL_OPTIONS;
  }, [dynamicModels]);

  const modelOptionsByProvider = useMemo(() => {
    return allModelOptions.reduce<Record<string, (ModelOption & { is_active?: boolean })[]>>((groups, option) => {
      (groups[option.providerLabel] ||= []).push(option);
      return groups;
    }, {});
  }, [allModelOptions]);

  const isModelAllowed = useCallback((modelValue: string) => {
    const provider = getProviderForModel(modelValue);
    if (!allowedProviders.has(provider)) return false;
    const modelDef = allModelOptions.find(m => m.value === modelValue);
    if (modelDef && modelDef.is_active === false) return false;
    return true;
  }, [allowedProviders, allModelOptions]);

  const handleRestrictedModelAttempt = (model: string, targetLabel: "chat" | "background") => {
    const provider = getProviderForModel(model);
    emitUiError({
      title: "Model unavailable",
      kind: "permission",
      message: `${getProviderDisplayName(provider)} models are disabled for your role, so this ${targetLabel} model cannot be selected.`,
    });
  };

  useEffect(() => {
    if (!canUseWebSearch && webSearchEnabled) {
      setWebSearchEnabled(false);
    }
  }, [canUseWebSearch, webSearchEnabled]);



  useEffect(() => {
    if (!usageData || allowedProviders.size === 0) return;
    if (!allModelOptions.some((option) => allowedProviders.has(option.provider))) return;

    const nextSelectedModel = isModelAllowed(selectedModel)
      ? selectedModel
      : getFallbackModel("chat", allowedProviders, allModelOptions);
    const nextBackgroundModel = isModelAllowed(backgroundModel)
      ? backgroundModel
      : getFallbackModel("background", allowedProviders, allModelOptions);

    const selectedChanged = nextSelectedModel !== selectedModel;
    const backgroundChanged = nextBackgroundModel !== backgroundModel;
    if (!selectedChanged && !backgroundChanged) return;

    if (selectedChanged) setSelectedModel(nextSelectedModel);
    if (backgroundChanged) setBackgroundModel(nextBackgroundModel);

    if (!hasAdjustedRestrictedModelsRef.current) {
      const changedTargets = [
        selectedChanged ? "chat model" : null,
        backgroundChanged ? "background model" : null,
      ].filter(Boolean).join(" and ");
      emitUiError({
        title: "Model access updated",
        kind: "permission",
        message: `Your saved ${changedTargets} was not allowed for this role, so ScholarDocX switched you to an available provider automatically.`,
      });
      hasAdjustedRestrictedModelsRef.current = true;
    }
  }, [usageData, allowedProviders, selectedModel, backgroundModel, allModelOptions, isModelAllowed]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_useSummaryContext", String(useSummaryContext));
  }, [useSummaryContext]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_useExactContext", String(useExactContext));
  }, [useExactContext]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_exactChatCount", String(exactChatCount));
  }, [exactChatCount]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_selectedModel", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem("scholarDocX_backgroundModel", backgroundModel);
  }, [backgroundModel]);

  // Purge legacy non-user-scoped key to prevent cross-account history leakage
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
    } catch (e) {
      // ignore SSR or disabled storage errors
    }
  }, []);

  // Load history from localStorage whenever active user (storageKey) changes
  useEffect(() => {
    const initialSession: ChatSession = {
      id: Date.now().toString(),
      messages: [createInitialGreeting()],
      title: "New Chat",
      timestamp: Date.now()
    };

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const loadedHistory = JSON.parse(stored);
        if (Array.isArray(loadedHistory) && loadedHistory.length > 0) {
          setHistory(loadedHistory);
          setCurrentSession(loadedHistory[0]);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
    }

    setHistory([]);
    setCurrentSession(initialSession);
  }, [storageKey]);

  // Save history to localStorage for the active user
  const saveHistory = useCallback((sessions: ChatSession[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save chat history", e);
    }
    setHistory(sessions);
  }, [storageKey]);

  // Save current session to history
  const saveCurrentSession = () => {
    // Don't save if it's just the initial greeting
    if (currentSession.messages.length <= 1) return;

    const updatedHistory = [currentSession, ...history.filter(s => s.id !== currentSession.id)];
    const trimmedHistory = updatedHistory.slice(0, MAX_HISTORY);
    saveHistory(trimmedHistory);
  };

  // Auto-save current session on every message change
  useEffect(() => {
    if (currentSession.messages.length > 1) {
      const updatedHistory = [currentSession, ...history.filter(s => s.id !== currentSession.id)];
      const trimmedHistory = updatedHistory.slice(0, MAX_HISTORY);
      saveHistory(trimmedHistory);
    }
  }, [currentSession.messages.length, saveHistory]);

  // Start new chat
  const startNewChat = () => {
    if (currentSession.messages.length > 1) {
      saveCurrentSession();
    }
    setCurrentSession({
      id: Date.now().toString(),
      messages: [createInitialGreeting()],
      title: "New Chat",
      timestamp: Date.now()
    });
    setShowHistory(false);
  };

  // Load session from history
  const loadSession = (session: ChatSession) => {
    if (currentSession.messages.length > 1) {
      saveCurrentSession();
    }
    setCurrentSession(session);
    setShowHistory(false);
  };

  // Delete session from history
  const deleteSession = (sessionId: string) => {
    const updatedHistory = history.filter(s => s.id !== sessionId);
    saveHistory(updatedHistory);
  };

  // SCHOLARDOCX-0220: copy an answer's raw markdown to the clipboard. On
  // failure (clipboard unavailable/blocked) the bubble shows a short hint to
  // select the text and copy it manually — the message body is already
  // user-selectable, so no further fallback is needed.
  const showCopyFeedback = (index: number, ok: boolean) => {
    if (copyFeedbackTimerRef.current !== null) window.clearTimeout(copyFeedbackTimerRef.current);
    setCopyFeedback({ index, ok });
    copyFeedbackTimerRef.current = window.setTimeout(() => setCopyFeedback(null), 1800);
  };

  const copyMessage = async (index: number) => {
    const message = currentSession.messages[index];
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.content);
      showCopyFeedback(index, true);
    } catch (e) {
      console.error("Failed to copy message:", e);
      showCopyFeedback(index, false);
    }
  };

  // SCHOLARDOCX-0220: download the active session as a simple markdown
  // transcript (heading with title/date, then You/Lumi blocks). Blob + object
  // URL download, revoked right after the click; no dependencies.
  const exportActiveChat = () => {
    if (currentSession.messages.length === 0) return;
    const lines: string[] = [
      `# ${currentSession.title || "ScholarDocX Chat"}`,
      "",
      `_${new Date(currentSession.timestamp).toLocaleString()}_`,
      "",
    ];
    for (const message of currentSession.messages) {
      lines.push(message.role === "user" ? "**You:**" : "**Lumi:**");
      lines.push("");
      lines.push(message.content);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scholardocx-chat-${formatFileTimestamp(new Date())}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Send message
  const sendMessage = async (overrideText?: unknown, forceAction?: boolean) => {
    // SCHOLARDOCX-0150: overrideText lets callers (e.g. the sheet Ask AI
    // menu) send immediately without waiting for the async setInput state
    // to flush. When omitted (or when React passes a MouseEvent from the
    // Send button / Enter handler), behaves exactly as before (reads `input`).
    // forceAction: when true (set by Ask AI menu), always route to
    // /ai/actions/plan regardless of the looksLikeWorkspaceAction regex.
    const override =
      typeof overrideText === "string" ? overrideText : undefined;
    const text = (override ?? input).trim();
    if (!text || loading) return;

    const userMessageCount = currentSession.messages.filter(m => m.role === "user").length;
    if (userMessageCount >= sessionMessageLimit) {
      const lastMsg = currentSession.messages[currentSession.messages.length - 1];
      if (lastMsg?.role === "assistant" && lastMsg.content.includes("Chat Limit Reached")) {
        setInput(""); // Clear input if they try again
        return;
      }

      const limitMessage: Message = {
        role: "assistant",
        content: `⚠️ **Chat Limit Reached**\n\nYou have reached the maximum limit of ${sessionMessageLimit} messages per session. Please click the **New Chat** icon (🤖) in the header to start a fresh session.`,
        timestamp: Date.now()
      };
      setCurrentSession(prev => ({ ...prev, messages: [...prev.messages, limitMessage] }));
      setInput("");
      return;
    }

    const lastMessage = currentSession.messages[currentSession.messages.length - 1];
    if (lastMessage?.actionState === "pending" && lastMessage.actionPlan) {
      const isConfirm = /^(yes|sure|do it|execute|confirm|ok|okay|y|yeah)$/i.test(text);
      const isCancel = /^(no|cancel|stop|don't|abort|n|nope)$/i.test(text);

      if (isConfirm || isCancel) {
        const userMessage: Message = {
          role: "user",
          content: text,
          timestamp: Date.now()
        };
        const updatedMessages = [...currentSession.messages, userMessage];
        setCurrentSession(prev => ({ ...prev, messages: updatedMessages }));
        setInput("");

        if (isConfirm) {
          confirmActionPlan(currentSession.messages.length - 1, lastMessage.actionPlan);
        } else {
          cancelActionPlan(currentSession.messages.length - 1);
        }
        return;
      }
    }

    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: Date.now()
    };

    const updatedMessages = [...currentSession.messages, userMessage];
    setCurrentSession(prev => ({ ...prev, messages: updatedMessages }));
    setInput("");
    setLoading(true);

    const memoryContext = buildMemoryContext(currentSession, useSummaryContext, useExactContext, exactChatCount);

    // Remember the exact chat/research request so a failed bubble can offer
    // a "Try again" action (one retry per failed send).
    let chatRequest: { path: string; payload: RecordMap } | null = null;

    try {
      let response: RecordMap;

      if (forceAction || looksLikeWorkspaceAction(userMessage.content)) {
        try {
          const actionPlan = await api.post<ActionPlan>("/ai/actions/plan", {
            message: userMessage.content,
            context: memoryContext,
            model: backgroundModel || selectedModel || undefined
          });

          if (actionPlan.status === "needs_info" || actionPlan.status === "needs_confirmation") {
            // Auto-execute READ-only plans (get/count/show) without confirmation
            if (actionPlan.status === "needs_confirmation" && (actionPlan as RecordMap).auto_execute) {
              try {
                const execResponse = await api.post<RecordMap>("/ai/actions/execute", { plan: actionPlan });
                const assistantMessage: Message = {
                  role: "assistant",
                  content: execResponse.message || "Here's what I found.",
                  timestamp: Date.now(),
                  mode: "agentic-action-executed"
                };
                const finalMessages = [...updatedMessages, assistantMessage];
                const firstUserMessage = finalMessages.find(m => m.role === "user");
                const titleStr = firstUserMessage ? firstUserMessage.content : finalMessages[0]?.content || "";
                const title = titleStr.slice(0, 50) + (titleStr.length > 50 ? "..." : "");
                setCurrentSession(prev => ({
                  ...prev,
                  messages: finalMessages,
                  title: title || "New Chat"
                }));
                refreshUsage();
              } catch (error) {
                const errorMessage: Message = {
                  role: "assistant",
                  content: error instanceof Error ? error.message : "I couldn't fetch that data.",
                  timestamp: Date.now(),
                  mode: "agentic-action-error"
                };
                setCurrentSession(prev => ({
                  ...prev,
                  messages: [...updatedMessages, errorMessage]
                }));
              }
              return;
            }

            // WRITE operations: show Confirm/Cancel buttons
            const assistantMessage: Message = {
              role: "assistant",
              content: actionPlan.message || (actionPlan.status === "needs_info"
                ? "I need a little more information before I can prepare that."
                : "Review these local ScholarDocX actions before I run them."),
              timestamp: Date.now(),
              mode: "agentic-action-plan",
              actionPlan,
              actionState: actionPlan.status === "needs_confirmation" ? "pending" : undefined
            };

            const finalMessages = [...updatedMessages, assistantMessage];
            const firstUserMessage = finalMessages.find(m => m.role === "user");
            const titleStr = firstUserMessage ? firstUserMessage.content : finalMessages[0]?.content || "";
            const title = titleStr.slice(0, 50) + (titleStr.length > 50 ? "..." : "");

            setCurrentSession(prev => ({
              ...prev,
              messages: finalMessages,
              title: title || "New Chat"
            }));
            refreshUsage();
            return;
          }
        } catch (error) {
          console.error("Action planning failed; continuing with normal chat.", error);
        }
      }

      // Prior messages already in this session, sent along so the backend can
      // enforce the role's per-session message limit accurately.
      const messageCount = currentSession.messages.length;

      if (webSearchEnabled && webSearchCount > 0) {
        // Hint to backend that web search is preferred — it still decides based on query
        chatRequest = {
          path: "/ai/research",
          payload: {
            message: userMessage.content,
            context: memoryContext,
            model: selectedModel || undefined,
            background_model: backgroundModel || undefined,
            web_search_max_results: webSearchCount,
            web_search_max_chars: webSearchMaxChars,
            message_count: messageCount
          }
        };
        response = await api.post<RecordMap>("/ai/research", chatRequest.payload);
      } else {
        chatRequest = {
          path: "/ai/chat",
          payload: {
            message: userMessage.content,
            context: memoryContext,
            model: selectedModel || undefined,
            message_count: messageCount
          }
        };
        response = await api.post<RecordMap>("/ai/chat", chatRequest.payload);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: response.answer || "No response",
        timestamp: Date.now(),
        sources: response.sources,
        mode: response.mode,
        // SCHOLARDOCX-0218: remember whether this answer used web search (and
        // the query), so the bubble can disclose it. Only /ai/research
        // returns these; /ai/chat responses simply leave them unset.
        search_performed: response.search_performed === true || undefined,
        search_query: typeof response.search_query === "string" ? response.search_query : undefined
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      const firstUserMessage = finalMessages.find(m => m.role === "user");
      const titleStr = firstUserMessage ? firstUserMessage.content : finalMessages[0]?.content || "";
      const title = titleStr.slice(0, 50) + (titleStr.length > 50 ? "..." : "");

      setCurrentSession(prev => ({
        ...prev,
        messages: finalMessages,
        title: title || "New Chat"
      }));
      refreshUsage();
      refreshTokenEconomy();

      if (finalMessages.length >= SUMMARY_MIN_MESSAGES && !FAILED_SUMMARY_MODES.has(String(assistantMessage.mode))) {
        triggerBackgroundSummary(currentSession.summary, userMessage.content, assistantMessage.content);
      }

    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: error instanceof Error ? error.message : "AI request failed.",
        timestamp: Date.now(),
        retryRequest: chatRequest ?? undefined
      };
      setCurrentSession(prev => ({
        ...prev,
        messages: [...updatedMessages, errorMessage]
      }));
    } finally {
      setLoading(false);
    }
  };

  // Replay a failed chat/research send from its error bubble (offered on the
  // last message only, one retry per failed send).
  const retryLastSend = async (messageIndex: number) => {
    const failed = currentSession.messages[messageIndex];
    if (!failed?.retryRequest || loading) return;
    const { path, payload } = failed.retryRequest;
    setLoading(true);
    try {
      const response = await api.post<RecordMap>(path, payload);
      const assistantMessage: Message = {
        role: "assistant",
        content: response.answer || "No response",
        timestamp: Date.now(),
        sources: response.sources,
        mode: response.mode,
        // SCHOLARDOCX-0218: a retry can replay a /ai/research request, so the
        // replaced bubble needs the same search disclosure as a fresh answer.
        search_performed: response.search_performed === true || undefined,
        search_query: typeof response.search_query === "string" ? response.search_query : undefined
      };
      // Replace the error bubble with the real answer (the retried bubble is
      // always the last message in the session).
      setCurrentSession(prev => ({
        ...prev,
        messages: [...prev.messages.slice(0, messageIndex), assistantMessage]
      }));
      refreshUsage();
      refreshTokenEconomy();
    } catch {
      // Retry failed too — drop the retry action from the bubble (one retry
      // per failed send) and keep the original error text.
      setCurrentSession(prev => ({
        ...prev,
        messages: prev.messages.map((m, i) =>
          i === messageIndex ? { ...m, retryRequest: undefined } : m
        )
      }));
    } finally {
      setLoading(false);
    }
  };

  const triggerBackgroundSummary = async (existingSummary: string | undefined, userMsg: string, aiMsg: string) => {
    try {
      let textToSummarize = `User: ${userMsg}\nAssistant: ${aiMsg}`;
      if (existingSummary) {
        textToSummarize = `Previous Summary:\n${existingSummary}\n\nNew Turn:\n${textToSummarize}`;
      }
      const res = await api.post<RecordMap>("/ai/summarize", { text: textToSummarize, model: backgroundModel || undefined });
      if (res.answer && !FAILED_SUMMARY_MODES.has(String(res.mode))) {
        setCurrentSession(prev => ({
          ...prev,
          summary: res.answer
        }));
      }
    } catch (e) {
      console.error("Background summarization failed", e);
    }
  };

  const updateActionMessage = (messageIndex: number, actionState: Message["actionState"]) => {
    setCurrentSession(prev => ({
      ...prev,
      messages: prev.messages.map((message, index) => (
        index === messageIndex ? { ...message, actionState } : message
      ))
    }));
  };

  const confirmActionPlan = async (messageIndex: number, actionPlan: ActionPlan) => {
    if (executingActionIndex !== null) return;
    setExecutingActionIndex(messageIndex);
    updateActionMessage(messageIndex, "running");
    try {
      const response = await api.post<RecordMap>("/ai/actions/execute", { plan: actionPlan });
      const assistantMessage: Message = {
        role: "assistant",
        content: response.message || "Done. I updated your local ScholarDocX workspace.",
        timestamp: Date.now(),
        mode: "agentic-action-executed"
      };
      setCurrentSession(prev => ({
        ...prev,
        messages: [...prev.messages.map((message, index) => (
          index === messageIndex ? { ...message, actionState: "done" as const } : message
        )), assistantMessage]
      }));
      await onWorkspaceChanged?.();
    } catch (error) {
      updateActionMessage(messageIndex, "error");
      const assistantMessage: Message = {
        role: "assistant",
        content: error instanceof Error ? error.message : "I could not execute that action plan.",
        timestamp: Date.now(),
        mode: "agentic-action-error"
      };
      setCurrentSession(prev => ({ ...prev, messages: [...prev.messages, assistantMessage] }));
    } finally {
      setExecutingActionIndex(null);
    }
  };

  const cancelActionPlan = (messageIndex: number) => {
    updateActionMessage(messageIndex, "cancelled");
  };

  // Handle close
  const handleClose = () => {
    if (currentSession.messages.length > 0) {
      saveCurrentSession();
    }
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="ai-trigger-button" onClick={() => setOpen(true)} title="Open AI assistant">
        <Bot size={16} />
        <span>Ask AI</span>
      </button>
    );
  }

  return (
    <>
      <button className="ai-trigger-button active" onClick={handleClose} title="Close AI assistant">
        <Bot size={16} />
        <span>Ask AI</span>
      </button>
      <aside className={wide ? "assistant-dock chat-dock wide" : "assistant-dock chat-dock"}>
        <div className="assistant-head">
          <strong>AI Assistant</strong>
          <div className="chat-head-actions">
            <button className="icon-button compact" onClick={() => setShowHistory(v => !v)} title="View history">
              <History size={15} />
            </button>
            <button className="icon-button compact" onClick={() => setShowSettings(v => !v)} title="Settings">
              <Settings2 size={15} />
            </button>
            <button className="icon-button compact" onClick={() => setWide((v) => !v)} title="Resize assistant">
              {wide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button className="icon-button compact" onClick={startNewChat} title="New chat">
              <Bot size={15} />
            </button>
            <button className="icon-button compact" onClick={handleClose} title="Close assistant">
              <X size={15} />
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="chat-settings-modal">
            <div className="chat-settings-header">
              <strong>AI Settings</strong>
              <button className="icon-button compact" onClick={() => setShowSettings(false)}>
                <X size={15} />
              </button>
            </div>
            
            <div className="chat-setting-item">
              <label>Include Rolling Summary</label>
              <select value={useSummaryContext ? "yes" : "no"} onChange={e => setUseSummaryContext(e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div className={`chat-setting-item ${useExactContext ? 'has-sub-item' : ''}`}>
              <label>Include Recent Chat</label>
              <select value={useExactContext ? "yes" : "no"} onChange={e => setUseExactContext(e.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {useExactContext && (
              <div className="chat-setting-item sub-item">
                <label>⮑ Recent Turns Count</label>
                <select value={exactChatCount} onChange={e => setExactChatCount(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}

            <div className="chat-setting-item">
              <label>Web Search Max Results</label>
              <select value={webSearchCount} onChange={e => setWebSearchCount(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="chat-setting-item">
              <label>Web Search Max Chars per Result</label>
              <select value={webSearchMaxChars} onChange={e => setWebSearchMaxChars(Number(e.target.value))}>
                {[200, 300, 400, 500, 600, 700, 800, 900, 1000].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div className="chat-setting-item">
              <label>Chat Model</label>
              <select
                value={selectedModel}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!isModelAllowed(next)) {
                    handleRestrictedModelAttempt(next, "chat");
                    return;
                  }
                  setSelectedModel(next);
                }}
              >
                {Object.entries(modelOptionsByProvider).map(([label, options]) => (
                  <optgroup key={label} label={label}>
                    {options.map((option) => {
                      const noAccess = !allowedProviders.has(option.provider);
                      const inactive = option.is_active === false;
                      const disabled = noAccess || inactive;
                      const displayLabel = inactive 
                        ? `${option.label} (Disabled)`
                        : noAccess ? `${option.label} (No access)` : option.label;
                      return (
                        <option key={option.value} value={option.value} disabled={disabled}>
                          {displayLabel}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
              {blockedProviders.length > 0 && (
                <small className="chat-setting-note">
                  Disabled for your role: {blockedProviders.map(getProviderDisplayName).join(", ")}
                </small>
              )}

            </div>

            <div className="chat-setting-item">
              <label>Background Model</label>
              <select
                value={backgroundModel}
                onChange={(e) => {
                  const next = e.target.value;
                  if (!isModelAllowed(next)) {
                    handleRestrictedModelAttempt(next, "background");
                    return;
                  }
                  setBackgroundModel(next);
                }}
              >
                {Object.entries(modelOptionsByProvider).map(([label, options]) => (
                  <optgroup key={label} label={label}>
                    {options.map((option) => {
                      const noAccess = !allowedProviders.has(option.provider);
                      const inactive = option.is_active === false;
                      const disabled = noAccess || inactive;
                      const displayLabel = inactive 
                        ? `${option.label} (Disabled)`
                        : noAccess ? `${option.label} (No access)` : option.label;
                      return (
                        <option key={option.value} value={option.value} disabled={disabled}>
                          {displayLabel}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
              {blockedProviders.length > 0 && (
                <small className="chat-setting-note">
                  Disabled for your role: {blockedProviders.map(getProviderDisplayName).join(", ")}
                </small>
              )}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="chat-settings-modal">
            <div className="chat-settings-header">
              <strong>Chat History</strong>
              <button className="icon-button compact" onClick={() => setShowHistory(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="chat-history-list">
              <button
                className="secondary compact"
                type="button"
                onClick={exportActiveChat}
                title="Download the current chat as a Markdown file"
              >
                <Download size={14} /> Export chat
              </button>
              {history.length === 0 ? (
                <p className="empty">No chat history yet. Start a conversation!</p>
              ) : (
                history.map((session) => (
                  <div key={session.id} className="history-item">
                    <button className="history-item-content" onClick={() => loadSession(session)}>
                      <strong>{session.title}</strong>
                      <span>{new Date(session.timestamp).toLocaleString()}</span>
                      <span>{session.messages.length} messages</span>
                    </button>
                    <button
                      className="icon-button compact danger-hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(session.id);
                      }}
                      title="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div className="chat-messages">
          {currentSession.messages.length === 0 ? (
            <div className="chat-empty-state">
              <Bot size={48} />
              <p>Start a conversation with the AI assistant</p>
              <small>Ask questions about your applications, deadlines, or professors.</small>
            </div>
          ) : (
            currentSession.messages.map((message, index) => (
              <div key={index} className={`chat-message ${message.role}`}>
                {message.search_performed && (
                  <span
                    className="message-search-note"
                    title={message.search_query || "This answer used a live web search"}
                  >
                    <Globe size={11} />
                    <span className="message-search-note-text">
                      {message.search_query
                        ? `Searched the web \u2014 \u201C${message.search_query}\u201D`
                        : "Searched the web"}
                    </span>
                  </span>
                )}
                <div className="message-content">
                  {message.imageUrl && (
                    <img src={message.imageUrl} alt="Uploaded" className="message-image" />
                  )}
                  {message.attachments && (
                    <div className="message-attachments">
                      {message.attachments.map((att, idx) => (
                        <span key={idx} className="attachment-badge">
                          <FileText size={12} /> {att.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {message.retryRequest && index === currentSession.messages.length - 1 && (
                    <div style={{ display: "flex", marginTop: "8px" }}>
                      <button
                        className="secondary"
                        type="button"
                        disabled={loading}
                        onClick={() => retryLastSend(index)}
                      >
                        Try again
                      </button>
                    </div>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <div className="message-sources">
                      <small>Sources:</small>
                      <ul>
                        {message.sources.map((source: RecordMap, idx: number) => (
                          <li key={idx}>
                            <a href={source.url} target="_blank" rel="noreferrer">
                              {source.title || source.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {message.actionPlan?.status === "needs_confirmation" && message.actionState !== "done" && message.actionState !== "cancelled" && (
                    <div
                      className="message-sources"
                      style={{
                        borderTop: "1px solid rgba(47, 109, 122, 0.18)",
                        marginTop: "10px",
                        paddingTop: "10px"
                      }}
                    >
                      <small>Workspace actions to confirm:</small>
                      <ul>
                        {(message.actionPlan.summary || []).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                        <button
                          className="primary"
                          type="button"
                          disabled={message.actionState !== "pending" || executingActionIndex !== null}
                          onClick={() => confirmActionPlan(index, message.actionPlan as ActionPlan)}
                        >
                          {message.actionState === "running" ? "Running..." : "Confirm"}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={message.actionState !== "pending" || executingActionIndex !== null}
                          onClick={() => cancelActionPlan(index)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {/* model name intentionally hidden */}
                </div>
                <div className="message-meta-row">
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {message.role === "assistant" && (
                    <>
                      <button
                        type="button"
                        className="icon-button message-copy-button"
                        onClick={() => copyMessage(index)}
                        title={
                          copyFeedback?.index === index && !copyFeedback.ok
                            ? "Couldn't copy automatically — select the message text and copy it manually"
                            : "Copy message"
                        }
                      >
                        {copyFeedback?.index === index && copyFeedback.ok ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      {copyFeedback?.index === index && (
                        <span className="message-time">
                          {copyFeedback.ok ? "Copied" : "Select the text to copy"}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="chat-message assistant">
              <div className="message-content">
                <p className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>


        {/* Input area */}
        <div className="chat-input-section">
          <div className="chat-input-wrapper">
            <button
              className={`chat-tool-button ${webSearchEnabled ? "active" : ""}`}
              onClick={() => {
                if (!webSearchEnabled && !canUseWebSearch) {
                  emitUiError({
                    title: "Permission denied",
                    message: "Web search is disabled for your role.",
                    kind: "permission",
                  });
                  return;
                }
                setWebSearchEnabled(v => !v);
              }}
            >
              <Globe size={18} />
              <div className="chat-tool-tooltip">
                {webSearchEnabled ? "Web search on" : "Web search off"}
              </div>
            </button>
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask Lumi anything..."
              rows={1}
              disabled={loading}
            />
            <button
              className="chat-send-button"
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              title="Send message"
            >
              <Send size={16} style={{ marginLeft: "2px" }} />
            </button>
          </div>
        </div>

        {/* Footer controls */}
        <div className="chat-footer-strip">
          <div className="chat-model-row">
            <div className="chat-model-display" title="Chat Model">
              <Bot size={11} />
              <span>{getModelDisplayName(selectedModel)}</span>
            </div>
            <div className="chat-model-divider" />
            <div className="chat-model-display" title="Background Model">
              <Cpu size={11} />
              <span>{getModelDisplayName(backgroundModel)}</span>
            </div>
            {usageData?.limits?.["ai_messages_per_session"] !== undefined && usageData.limits["ai_messages_per_session"] !== -1 && (
              <>
                <div className="chat-model-divider" />
                <div className="chat-model-display" title="Messages used in this session">
                  <span style={{ opacity: 0.8, fontSize: "10px" }}>
                    {Math.floor(currentSession.messages.length / 2)} / {usageData.limits["ai_messages_per_session"]} msgs
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
