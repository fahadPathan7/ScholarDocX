/* ------------------------------------------------------------------ */
/*  FormatRulesModal — conditional formatting                          */
/*                                                                     */
/*  Cell formatting was manual and per-cell, so "rejected applications  */
/*  are red" meant colouring each one by hand and re-colouring it when  */
/*  the status changed. Rules make that a property of the data instead  */
/*  of a chore, and they update themselves.                             */
/*                                                                     */
/*  SCHOLARDOCX-0203.                                                  */
/* ------------------------------------------------------------------ */

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Modal } from "../Modal";
import type { ColumnDef } from "./sheetModel";
import {
  countMatches,
  operatorNeedsValue,
  operatorsFor,
  RULE_OPERATOR_LABELS,
  RULE_STYLE_LABELS,
  type FormatRule,
  type RuleStyle,
} from "./sheetInsights";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function FormatRulesModal({
  columns,
  rows,
  rules,
  now,
  onChange,
  onClose,
}: {
  columns: ColumnDef[];
  rows: Record<string, string>[];
  rules: FormatRule[];
  now: Date;
  onChange: (rules: FormatRule[]) => void;
  onClose: () => void;
}) {
  const usable = columns.filter((col) => col.type !== "group" && col.type !== "file");
  const [draftColumn, setDraftColumn] = useState(usable[0]?.name || "");

  const update = (id: string, patch: Partial<FormatRule>) =>
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));

  const addRule = () => {
    const column = usable.find((col) => col.name === draftColumn) || usable[0];
    if (!column) return;
    const operator = operatorsFor(column.type)[0];
    onChange([
      ...rules,
      {
        id: newId(),
        column: column.name,
        operator,
        value: "",
        style: "amber",
        wholeRow: false,
        enabled: true,
      },
    ]);
  };

  return (
    <Modal onClose={onClose}>
      <div
        className="modal-panel format-rules"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Conditional formatting"
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">Format</p>
            <h2>Colour rules</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          {/* One concrete line rather than a paragraph of theory. The rule
              rows below are written as sentences so they explain themselves;
              this only has to say what the feature is for. */}
          <p className="format-rules-lede">
            Colour rows automatically, based on what is in them — so an overdue
            deadline or a rejected application stands out without you tinting
            cells by hand.
          </p>

          {rules.length ? (
            <div className="format-rules-list">
              {rules.map((rule) => {
                const column = usable.find((col) => col.name === rule.column);
                const operators = operatorsFor(column?.type || "text");
                const matches = countMatches(rule, rows, now);
                return (
                  <div className={`format-rule${rule.enabled ? "" : " is-off"}`} key={rule.id}>
                    <label className="format-rule-toggle" title={rule.enabled ? "Switch this rule off" : "Switch this rule on"}>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={() => update(rule.id, { enabled: !rule.enabled })}
                        aria-label="Rule enabled"
                      />
                    </label>

                    <span className="format-rule-word">When</span>

                    <select
                      value={rule.column}
                      aria-label="Column"
                      onChange={(event) => {
                        const next = usable.find((col) => col.name === event.target.value);
                        const allowed = operatorsFor(next?.type || "text");
                        // Changing the column can strand an operator the new
                        // type does not support — reset instead of keeping a
                        // rule that could never fire.
                        update(rule.id, {
                          column: event.target.value,
                          operator: allowed.includes(rule.operator) ? rule.operator : allowed[0],
                        });
                      }}
                    >
                      {usable.map((col) => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                      ))}
                    </select>

                    <select
                      value={rule.operator}
                      aria-label="Condition"
                      onChange={(event) => update(rule.id, { operator: event.target.value as FormatRule["operator"] })}
                    >
                      {operators.map((operator) => (
                        <option key={operator} value={operator}>{RULE_OPERATOR_LABELS[operator]}</option>
                      ))}
                    </select>

                    {operatorNeedsValue(rule.operator) ? (
                      column?.type === "select" && column.options?.length ? (
                        <select
                          value={rule.value}
                          aria-label="Value"
                          onChange={(event) => update(rule.id, { value: event.target.value })}
                        >
                          <option value="">Choose…</option>
                          {column.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={rule.value}
                          aria-label="Value"
                          placeholder={rule.operator === "due_within" ? "days" : "value"}
                          type={rule.operator === "due_within" || column?.type === "number" ? "number" : "text"}
                          onChange={(event) => update(rule.id, { value: event.target.value })}
                        />
                      )
                    ) : (
                      <span className="format-rule-novalue">—</span>
                    )}

                    <span className="format-rule-word">colour it</span>

                    <div className="format-rule-styles" role="group" aria-label="Colour">
                      {(Object.keys(RULE_STYLE_LABELS) as RuleStyle[]).map((style) => (
                        <button
                          key={style}
                          type="button"
                          className={`format-swatch style-${style}${rule.style === style ? " selected" : ""}`}
                          onClick={() => update(rule.id, { style })}
                          title={RULE_STYLE_LABELS[style]}
                          aria-label={RULE_STYLE_LABELS[style]}
                          aria-pressed={rule.style === style}
                        >
                          {/* "Bold only" has no colour to show, so it shows a
                              B. The hatched swatch it had before read as a
                              "not allowed" sign. */}
                          {style === "bold" ? "B" : null}
                        </button>
                      ))}
                    </div>

                    <label className="format-rule-scope" title="Colour the whole row instead of just this one cell">
                      <input
                        type="checkbox"
                        checked={rule.wholeRow}
                        onChange={() => update(rule.id, { wholeRow: !rule.wholeRow })}
                      />
                      across the whole row
                    </label>

                    <div className="format-rule-tail">
                      {/* A live count, so a rule can be checked without hunting
                          through the grid for something that changed colour. */}
                      <span className={`format-rule-count${matches ? "" : " is-zero"}`}>
                        {matches === 0
                          ? "matches nothing yet"
                          : `${matches} row${matches === 1 ? "" : "s"}`}
                      </span>
                      <button
                        type="button"
                        className="format-rule-delete"
                        onClick={() => onChange(rules.filter((existing) => existing.id !== rule.id))}
                        aria-label="Delete rule"
                        title="Delete rule"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="format-rules-empty">No rules yet — add one below.</p>
          )}

          <div className="format-rules-add">
            <span className="format-rule-word">New rule for</span>
            <select value={draftColumn} onChange={(event) => setDraftColumn(event.target.value)} aria-label="Column for new rule">
              {usable.map((col) => (
                <option key={col.name} value={col.name}>{col.name}</option>
              ))}
            </select>
            <button type="button" className="sheet-btn" onClick={addRule} disabled={!usable.length}>
              <Plus size={14} /> Add rule
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="sheet-btn is-primary" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
