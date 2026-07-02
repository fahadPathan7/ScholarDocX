/* ------------------------------------------------------------------ */
/*  sheetUndo — bounded in-memory stack for undo/redo                  */
/* ------------------------------------------------------------------ */

import { useState, useCallback } from "react";
import type { ColumnDef } from "./sheetModel";

export type SheetSnapshot = {
  columns: ColumnDef[];
  rows: Record<string, string>[];
};

const MAX_HISTORY = 50;

export function useUndoRedo(initialState: SheetSnapshot) {
  const [history, setHistory] = useState<SheetSnapshot[]>([initialState]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Call this BEFORE making a mutation
  const pushState = useCallback((newState: SheetSnapshot) => {
    setHistory((prev) => {
      // Discard future states if we are not at the end
      const past = prev.slice(0, currentIndex + 1);
      const nextHistory = [...past, newState];
      if (nextHistory.length > MAX_HISTORY) {
        nextHistory.shift();
      }
      return nextHistory;
    });
    setCurrentIndex((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [currentIndex]);

  const undo = useCallback((): SheetSnapshot | null => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      return history[newIndex];
    }
    return null;
  }, [currentIndex, history]);

  const redo = useCallback((): SheetSnapshot | null => {
    if (currentIndex < history.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      return history[newIndex];
    }
    return null;
  }, [currentIndex, history]);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  // Used to re-initialize history when a new sheet loads from the server
  const resetHistory = useCallback((state: SheetSnapshot) => {
    setHistory([state]);
    setCurrentIndex(0);
  }, []);

  return {
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
  };
}
