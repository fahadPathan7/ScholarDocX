/* ------------------------------------------------------------------ */
/*  projectIdentity — a stable colour and monogram for a project       */
/*                                                                     */
/*  Projects used to be told apart by a degree label. Now that a       */
/*  project is free-form (SCHOLARDOCX-0259) each one gets a colour     */
/*  derived from its id, so it is the same on every screen and every   */
/*  visit without storing anything.                                    */
/* ------------------------------------------------------------------ */

/** Accents drawn from the app's own teal / gold / ink palette family. */
export const PROJECT_ACCENTS = [
  "#2f7d74", "#2f6d9a", "#c58a1b", "#8a5a9f", "#b24f4f", "#4f8a45", "#1f4f5a", "#a8632a",
];

export function projectAccent(key: string): string {
  // FNV-1a. A plain "hash * 31 + char" leaves similar keys in the same
  // bucket once reduced modulo a small palette.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= hash >>> 15;
  return PROJECT_ACCENTS[hash % PROJECT_ACCENTS.length];
}

/** Up to two characters standing in for the project: "Canada PhD" → "CP". */
export function projectMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] || "";
  const second = words.length > 1 ? Array.from(words[1])[0] || "" : Array.from(words[0])[1] || "";
  return (first + second).toUpperCase();
}
