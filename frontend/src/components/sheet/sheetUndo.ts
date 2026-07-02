/* ------------------------------------------------------------------ */
/*  sheetUndo — bounded history for undo/redo                          */
/*                                                                     */
/*  The stack always contains the CURRENT state at `index`. Mutations  */
/*  call record(next) AFTER computing the next state, so undo returns  */
/*  the previous snapshot and redo returns the one that was undone.    */
/* ------------------------------------------------------------------ */

import { useCallback, useRef, useState } from "react";
import type { ColumnDef } from "./sheetModel";

export type SheetSnapshot = {
  columns: ColumnDef[];
  rows: Record<string, string>[];
};

export const MAX_HISTORY = 50;

export type SheetHistory<T> = {
  stack: T[];
  index: number;
};

export function createHistory<T>(initial: T): SheetHistory<T> {
  return { stack: [initial], index: 0 };
}

export function recordHistory<T>(history: SheetHistory<T>, next: T): SheetHistory<T> {
  const stack = [...history.stack.slice(0, history.index + 1), next];
  while (stack.length > MAX_HISTORY) stack.shift();
  return { stack, index: stack.length - 1 };
}

export function undoHistory<T>(history: SheetHistory<T>): { history: SheetHistory<T>; snapshot: T | null } {
  if (history.index <= 0) return { history, snapshot: null };
  const index = history.index - 1;
  return { history: { ...history, index }, snapshot: history.stack[index] };
}

export function redoHistory<T>(history: SheetHistory<T>): { history: SheetHistory<T>; snapshot: T | null } {
  if (history.index >= history.stack.length - 1) return { history, snapshot: null };
  const index = history.index + 1;
  return { history: { ...history, index }, snapshot: history.stack[index] };
}

export function useUndoRedo(initialState: SheetSnapshot) {
  const historyRef = useRef<SheetHistory<SheetSnapshot>>(createHistory(initialState));
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  /** Call AFTER computing the next state (post-mutation snapshot). */
  const record = useCallback((next: SheetSnapshot) => {
    historyRef.current = recordHistory(historyRef.current, next);
    bump();
  }, []);

  const undo = useCallback((): SheetSnapshot | null => {
    const { history, snapshot } = undoHistory(historyRef.current);
    historyRef.current = history;
    if (snapshot) bump();
    return snapshot;
  }, []);

  const redo = useCallback((): SheetSnapshot | null => {
    const { history, snapshot } = redoHistory(historyRef.current);
    historyRef.current = history;
    if (snapshot) bump();
    return snapshot;
  }, []);

  /** Re-initialize when a different sheet (or external change) loads. */
  const resetHistory = useCallback((state: SheetSnapshot) => {
    historyRef.current = createHistory(state);
    bump();
  }, []);

  const canUndo = historyRef.current.index > 0;
  const canRedo = historyRef.current.index < historyRef.current.stack.length - 1;

  return { record, undo, redo, canUndo, canRedo, resetHistory };
}
