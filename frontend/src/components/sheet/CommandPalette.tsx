/* ------------------------------------------------------------------ */
/*  CommandPalette — Ctrl/Cmd+K, run anything without hunting for it   */
/*                                                                     */
/*  The sheet has a lot of capability spread across four menus, a       */
/*  selection bar and a dozen keyboard bindings. A palette is the       */
/*  single entry point that makes all of it reachable by name, which    */
/*  matters more here than in most places: the menus group controls by  */
/*  purpose, and "purpose" is only obvious once you already know where  */
/*  something lives.                                                    */
/*                                                                     */
/*  SCHOLARDOCX-0203.                                                  */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "../Modal";

export type Command = {
  id: string;
  label: string;
  /** Groups the list; also searched. */
  section: string;
  hint?: string;
  keywords?: string;
  icon?: React.ReactNode;
  run: () => void;
};

/**
 * Subsequence match — "adr" finds "Add record".
 *
 * Deliberately not a fuzzy score: a palette that reorders itself on every
 * keystroke makes the muscle memory of "Ctrl+K, a, Enter" unreliable, which
 * is the entire reason to have one. Order stays as declared; typing only
 * filters.
 */
export function matchesCommand(command: Command, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${command.label} ${command.section} ${command.keywords || ""}`.toLowerCase();
  if (haystack.includes(needle)) return true;
  let index = 0;
  for (const char of needle) {
    if (char === " ") continue;
    index = haystack.indexOf(char, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(
    () => commands.filter((command) => matchesCommand(command, query)),
    [commands, query],
  );

  // Any keystroke can shorten the list past the highlighted row.
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    // Close first: a command that opens a modal should not fight the palette
    // for focus on the way out.
    onClose();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runAt(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  let lastSection = "";

  return (
    <Modal onClose={onClose} zIndex={1200}>
      <div
        className="cmdk"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="cmdk-search">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command, or a column name…"
            aria-label="Search commands"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="cmdk-list" ref={listRef} role="listbox">
          {results.length ? (
            results.map((command, index) => {
              const header = command.section !== lastSection ? command.section : null;
              lastSection = command.section;
              return (
                <div key={command.id}>
                  {header ? <div className="cmdk-section">{header}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    data-active={index === active}
                    className={`cmdk-item${index === active ? " is-active" : ""}`}
                    // Pointer move rather than enter: with the keyboard driving
                    // the highlight, an unmoved cursor sitting over a row would
                    // otherwise steal it back on every re-render.
                    onPointerMove={() => setActive(index)}
                    onClick={() => runAt(index)}
                  >
                    {command.icon ? <span className="cmdk-icon">{command.icon}</span> : null}
                    <span className="cmdk-label">{command.label}</span>
                    {command.hint ? <span className="cmdk-hint">{command.hint}</span> : null}
                  </button>
                </div>
              );
            })
          ) : (
            <p className="cmdk-empty">Nothing matches “{query.trim()}”.</p>
          )}
        </div>

        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </Modal>
  );
}
