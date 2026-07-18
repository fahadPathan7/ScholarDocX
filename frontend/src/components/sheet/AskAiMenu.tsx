/* ------------------------------------------------------------------ */
/*  AskAiMenu — dropdown of context-aware prompts anchored to the     */
/*  sheet "Ask AI" button. SCHOLARDOCX-0150.                           */
/*                                                                    */
/*  Mirrors the existing showDataMenu / showColumnsMenu popover        */
/*  pattern in SheetToolbar.tsx (click-outside hook, .data-dropdown-  */
/*  menu styles). No modal — so the AGENTS.md backdrop-blur rule      */
/*  does not apply.                                                    */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
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
  analyze: "Analyze",
  transform: "Fill & Transform",
  selection: "Selection",
};

const GROUP_ORDER: AskAiPromptGroup[] = ["selection", "analyze", "transform"];

type Props = {
  ctx: AskAiContext;
  /** Called with the built prompt message when the user picks or writes one. */
  onPick: (message: string) => void;
  btnStyle?: React.CSSProperties;
};

export function AskAiMenu({ ctx, onPick, btnStyle }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setCustom("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function pick(prompt: AskAiPrompt) {
    onPick(prompt.build(ctx));
    setOpen(false);
    setCustom("");
  }

  function submitCustom() {
    const trimmed = custom.trim();
    if (!trimmed) return;
    // SCHOLARDOCX-0150: scope a free-form prompt to the exact sheet by ID
    // (names can collide) and tell the planner to use the IDs.
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

  const triggerStyle: React.CSSProperties = { ...btnStyle, color: "var(--ui-brand)" };

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
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "4px",
            zIndex: 100,
            width: "320px",
            maxHeight: "420px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              padding: "4px 8px 2px",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Ask AI about "{ctx.sheetName}"
          </div>
          <div style={{ fontSize: "10.5px", padding: "0 8px 6px", color: "var(--text-secondary)" }}>
            {ctx.rowCount} row(s) · {ctx.columns.length} column(s)
            {ctx.selectionCount > 0 ? ` · ${ctx.selectionCount} selected` : ""}
          </div>

          {GROUP_ORDER.map((group) => {
            const items = grouped[group];
            if (items.length === 0) return null;
            return (
              <div key={group} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <div
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    padding: "6px 8px 2px",
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {GROUP_LABELS[group]}
                </div>
                {items.map((p) => (
                  <button
                    key={p.id}
                    className="text-button ask-ai-prompt-item"
                    onClick={() => pick(p)}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "6px",
                      width: "100%",
                      padding: "7px 8px",
                      fontSize: "12px",
                      textAlign: "left",
                      lineHeight: 1.35,
                      borderRadius: "4px",
                    }}
                  >
                    <ArrowRight
                      size={12}
                      style={{ marginTop: "2px", color: "var(--ui-brand)", flexShrink: 0 }}
                    />
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontWeight: 600 }}>{p.title}</span>
                      <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                        {p.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}

          {/* Custom prompt */}
          <div style={{ height: "1px", background: "var(--border)", margin: "6px 0" }} />
          <div style={{ padding: "2px 6px 4px" }}>
            <div
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                padding: "0 2px 4px",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Write your own
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <input
                ref={customInputRef}
                type="text"
                value={custom}
                placeholder="e.g. find all rows missing a deadline"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitCustom();
                  }
                }}
                autoFocus
                style={{
                  flex: 1,
                  fontSize: "12px",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  border: "1px solid var(--ui-line)",
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              />
              <button
                className="secondary"
                onClick={submitCustom}
                disabled={!custom.trim()}
                title="Send your custom prompt"
                style={{ fontSize: "11px", padding: "6px 8px" }}
              >
                <ArrowRight size={12} />
              </button>
            </div>
            {custom && (
              <button
                type="button"
                className="icon-button"
                onClick={() => setCustom("")}
                title="Clear"
                style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-secondary)" }}
              >
                <X size={10} /> clear
              </button>
            )}
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
