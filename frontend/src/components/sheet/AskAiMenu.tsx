/* ------------------------------------------------------------------ */
/*  AskAiMenu — dropdown of context-aware prompts anchored to the     */
/*  sheet "Ask AI" button. SCHOLARDOCX-0150.                           */
/*                                                                    */
/*  Redesigned with a cleaner, more visual interface for better UX.   */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";
import { 
  ArrowRight, 
  Sparkles, 
  Search,
  BarChart3,
  Calendar,
  DollarSign,
  AlertCircle,
  Mail,
  Wand2,
  Target,
  Layers,
  TrendingUp,
  MousePointerClick,
  Zap
} from "lucide-react";
import {
  ASK_AI_PROMPTS,
  buildAskAiContext,
  target,
  visiblePrompts,
  type AskAiContext,
  type AskAiPrompt,
  type AskAiPromptGroup,
} from "./askAiPrompts";
import type { ColumnDef } from "./sheetModel";

const GROUP_LABELS: Record<AskAiPromptGroup, string> = {
  analyze: "Analyze My Data",
  transform: "Smart Actions",
  selection: "Selected Rows",
};

const GROUP_ORDER: AskAiPromptGroup[] = ["selection", "analyze", "transform"];

// Icon mapping for each prompt
const PROMPT_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; color?: string }>> = {
  "application-summary": BarChart3,
  "deadline-risk": Calendar,
  "funding-totals": DollarSign,
  "missing-info": AlertCircle,
  "response-rate": Mail,
  "draft-emails": Wand2,
  "priority-score": Target,
  "categorize-status": Layers,
  "rank-by-fit": TrendingUp,
  "act-on-selected": MousePointerClick,
  "fill-cell": Zap,
};

type Props = {
  ctx: AskAiContext;
  /** Called with the built prompt message when the user picks or writes one. */
  onPick: (message: string) => void;
  btnStyle?: React.CSSProperties;
};

export function AskAiMenu({ ctx, onPick, btnStyle }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [hoveredPrompt, setHoveredPrompt] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setCustom("");
        setHoveredPrompt(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function pick(prompt: AskAiPrompt) {
    onPick(prompt.build(ctx));
    setOpen(false);
    setCustom("");
    setHoveredPrompt(null);
  }

  function submitCustom() {
    const trimmed = custom.trim();
    if (!trimmed) return;
    onPick(
      `In ${target(ctx)}, ${trimmed}. ` +
        `When you emit any action plan, target this exact sheet using its project_id and sheet_id (not the names), because there may be other sheets with the same name.`
    );
    setOpen(false);
    setCustom("");
  }

  const prompts = visiblePrompts(ctx);
  const grouped: Record<AskAiPromptGroup, AskAiPrompt[]> = {
    analyze: [],
    transform: [],
    selection: [],
  };
  for (const p of prompts) grouped[p.group].push(p);

  const triggerStyle: React.CSSProperties = { ...btnStyle, color: "var(--ui-primary)" };

  return (
    <div className="ask-ai-menu-container" ref={containerRef} style={{ position: "relative" }}>
      <button
        className={`secondary ${open ? "active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        style={triggerStyle}
        title="Ask AI to analyze, fill, or transform this sheet"
      >
        <Sparkles size={12} /> Ask AI
      </button>

      {open && (
        <div
          className="data-dropdown-menu ask-ai-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: "4px",
            backgroundColor: "var(--ui-paper-strong)",
            border: "1px solid var(--ui-line)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)",
            zIndex: 100,
            width: "380px",
            maxHeight: "540px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Fixed Header */}
          <div
            style={{
              padding: "16px 16px 12px",
              borderBottom: "1px solid var(--ui-line)",
              background: "linear-gradient(to bottom, var(--ui-paper-strong), var(--ui-canvas-2))",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "var(--ui-ink)",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Sparkles size={14} style={{ color: "var(--ui-primary)" }} />
              Ask AI about "{ctx.sheetName}"
            </div>
            <div style={{ fontSize: "11px", color: "var(--ui-muted)" }}>
              {ctx.rowCount} row{ctx.rowCount !== 1 ? "s" : ""} · {ctx.columns.length} column{ctx.columns.length !== 1 ? "s" : ""}
              {ctx.selectionCount > 0 && ` · ${ctx.selectionCount} selected`}
            </div>
          </div>

          {/* Scrollable Prompt Groups */}
          <div 
            style={{ 
              padding: "8px",
              paddingRight: "4px", // Less padding on right to account for scrollbar
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {GROUP_ORDER.map((group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div key={group} style={{ marginBottom: "12px" }}>
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "8px 8px 6px",
                      color: "var(--ui-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {GROUP_LABELS[group]}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {items.map((p) => {
                      const Icon = PROMPT_ICONS[p.id] || ArrowRight;
                      const isHovered = hoveredPrompt === p.id;
                      return (
                        <button
                          key={p.id}
                          className="text-button ask-ai-prompt-item"
                          onClick={() => pick(p)}
                          onMouseEnter={() => setHoveredPrompt(p.id)}
                          onMouseLeave={() => setHoveredPrompt(null)}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            width: "100%",
                            padding: "10px 12px",
                            fontSize: "12px",
                            textAlign: "left",
                            lineHeight: 1.4,
                            borderRadius: "6px",
                            backgroundColor: isHovered ? "var(--ui-mint)" : "transparent",
                            border: `1px solid ${isHovered ? "var(--ui-line)" : "transparent"}`,
                            transition: "all 0.15s ease",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              marginTop: "1px",
                              flexShrink: 0,
                              width: "28px",
                              height: "28px",
                              borderRadius: "6px",
                              background: isHovered
                                ? "var(--ui-primary)"
                                : "var(--ui-mint)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <Icon size={14} color={isHovered ? "#ffffff" : "var(--ui-primary)"} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: "var(--ui-ink)",
                                marginBottom: "3px",
                                lineHeight: 1.3,
                              }}
                            >
                              {p.title}
                            </div>
                            <div
                              style={{
                                color: "var(--ui-muted)",
                                fontSize: "11px",
                                lineHeight: 1.4,
                              }}
                            >
                              {p.description}
                            </div>
                          </div>
                          <div style={{
                            marginTop: "6px",
                            flexShrink: 0,
                            color: "var(--ui-muted)",
                            opacity: isHovered ? 1 : 0,
                            transition: "opacity 0.15s ease",
                          }}>
                            <ArrowRight size={14} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fixed Custom Prompt Footer */}
          <div
            style={{
              padding: "12px 16px 16px",
              borderTop: "1px solid var(--ui-line)",
              backgroundColor: "var(--ui-canvas-2)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                padding: "0 0 8px",
                color: "var(--ui-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Search size={12} />
              Custom Request
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <textarea
                ref={customInputRef}
                value={custom}
                placeholder="e.g., find all rows missing a deadline"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitCustom();
                  }
                }}
                rows={1}
                style={{
                  flex: 1,
                  fontSize: "12px",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--ui-line)",
                  backgroundColor: "var(--ui-paper-strong)",
                  color: "var(--ui-ink)",
                  outline: "none",
                  transition: "border-color 0.15s ease",
                  resize: "none",
                  fontFamily: "inherit",
                  lineHeight: "1.4",
                  minHeight: "36px",
                  maxHeight: "92px",
                  overflowY: "auto",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--ui-primary)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--ui-line)";
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 92) + "px";
                }}
              />
              <button
                onClick={submitCustom}
                disabled={!custom.trim()}
                title="Send your custom prompt (Enter)"
                style={{
                  padding: 0,
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: custom.trim() ? "#2563eb" : "#94a3b8",
                  border: "none",
                  cursor: custom.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.15s ease",
                  width: "36px",
                  height: "36px",
                  flexShrink: 0,
                  opacity: custom.trim() ? 1 : 0.6,
                }}
              >
                <ArrowRight size={16} strokeWidth={2.5} color="#ffffff" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Convenience wrapper: builds the context from raw sheet props, renders the menu. */
export function AskAiMenuFromSheet(props: {
  projectId: string;
  sheetId?: string;
  projectName: string;
  sheetName: string;
  degreeType?: string;
  columns: ColumnDef[];
  rows: unknown[];
  selectedRows: Set<number>;
  focusedCell?: { rowIndex: number; colName: string } | null;
  onPick: (message: string) => void;
  btnStyle?: React.CSSProperties;
}) {
  const {
    projectId,
    sheetId,
    projectName,
    sheetName,
    degreeType,
    columns,
    rows,
    selectedRows,
    focusedCell,
    onPick,
    btnStyle,
  } = props;
  const ctx = buildAskAiContext({
    projectId,
    sheetId,
    projectName,
    sheetName,
    degreeType,
    columns,
    rows,
    selectedRows,
    focusedCell,
  });
  return <AskAiMenu ctx={ctx} onPick={onPick} btnStyle={btnStyle} />;
}

// Re-export so callers can build context / targeting directly if they prefer.
export { buildAskAiContext, ASK_AI_PROMPTS, target as askAiTarget };
