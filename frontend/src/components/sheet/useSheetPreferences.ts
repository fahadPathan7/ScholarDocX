/* ------------------------------------------------------------------ */
/*  useSheetPreferences — per-person grid display settings             */
/*                                                                     */
/*  Held in localStorage rather than on the page record on purpose:    */
/*  how tall you like your rows is a property of the person reading    */
/*  the sheet, not of the data. Writing it to the shared page would    */
/*  make one user's choice everyone's.                                 */
/*                                                                     */
/*  SCHOLARDOCX-0202.                                                  */
/* ------------------------------------------------------------------ */

import { useState } from "react";
import { coerceDensity, DENSITIES, type Density } from "./sheetGrid";

const DENSITY_KEY = "scholardocx.sheet.density";

/** Write-through to storage, ignoring failures — a blocked or full store
 *  should cost the preference, not the sheet. */
function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The setting simply will not survive a reload.
  }
}

export function useSheetPreferences() {
  const [density, setDensityState] = useState<Density>(() =>
    coerceDensity(window.localStorage.getItem(DENSITY_KEY)),
  );
  const setDensity = (next: Density) => {
    setDensityState(next);
    remember(DENSITY_KEY, next);
  };

  return {
    density,
    setDensity,
    densityPreset: DENSITIES[density],
  };
}
