/**
 * Daily five-letter word puzzle (SCHOLARDOCX-0198).
 *
 * One puzzle a day, chosen deterministically from the date so it is the same
 * for the whole day and cannot be rerolled. That limit is the point: in a
 * workspace, a break should end on its own rather than offer another round.
 */

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** green = right letter, right place. amber = in the word, elsewhere. */
export type Mark = "green" | "amber" | "grey";

/**
 * Answer pool. Common words only — a break puzzle should be losable on a bad
 * day, not on obscure vocabulary. 260 entries is over seven months before one
 * repeats.
 */
export const ANSWERS: readonly string[] = [
  "about", "above", "actor", "acute", "admit", "adopt", "after", "again", "agent", "agree",
  "ahead", "alarm", "album", "alert", "alike", "alive", "allow", "alone", "along", "alter",
  "among", "anger", "angle", "angry", "ankle", "apart", "apple", "apply", "arena", "argue",
  "arise", "armor", "aroma", "array", "arrow", "aside", "asset", "audio", "audit", "avoid",
  "awake", "award", "aware", "badge", "baker", "basic", "basin", "batch", "beach", "beard",
  "beast", "began", "begin", "being", "below", "bench", "birth", "black", "blade", "blame",
  "blank", "blast", "blend", "bless", "blind", "block", "blood", "bloom", "board", "boast",
  "bonus", "boost", "booth", "bound", "brain", "brand", "brave", "bread", "break", "breed",
  "brick", "bride", "brief", "bring", "broad", "broke", "brown", "brush", "build", "built",
  "bunch", "burst", "cabin", "cable", "candy", "canoe", "cargo", "carry", "carve", "catch",
  "cause", "chain", "chair", "chalk", "charm", "chart", "chase", "cheap", "check", "cheer",
  "chess", "chest", "chief", "child", "chill", "choir", "chose", "civic", "civil", "claim",
  "clash", "class", "clean", "clear", "clerk", "click", "cliff", "climb", "clock", "close",
  "cloth", "cloud", "coach", "coast", "color", "comet", "coral", "couch", "could", "count",
  "court", "cover", "crack", "craft", "crane", "crash", "crawl", "crazy", "cream", "creek",
  "crest", "crisp", "cross", "crowd", "crown", "crust", "curve", "cycle", "daily", "dance",
  "dealt", "debut", "delay", "delta", "dense", "depth", "diary", "dirty", "dodge", "doubt",
  "draft", "drain", "drama", "drank", "dream", "dress", "dried", "drift", "drink", "drive",
  "eager", "eagle", "early", "earth", "eight", "elbow", "elder", "elect", "elite", "empty",
  "enemy", "enjoy", "enter", "entry", "equal", "equip", "error", "essay", "event", "every",
  "exact", "exist", "extra", "fable", "faith", "false", "fancy", "fault", "favor", "feast",
  "fence", "fever", "fiber", "field", "fifth", "fight", "final", "first", "flame", "flash",
  "fleet", "flesh", "float", "flock", "flood", "floor", "flour", "fluid", "flush", "focus",
  "force", "forge", "forth", "found", "frame", "fraud", "fresh", "front", "frost", "fruit",
  "fully", "funny", "giant", "given", "glass", "globe", "glory", "glove", "grace", "grade",
  "grain", "grand", "grant", "grape", "graph", "grasp", "grass", "grave", "great", "green",
];

/** Pure ASCII letters, lower case — the shape a guess must have. */
const WORD_PATTERN = /^[a-z]{5}$/;

export const isWellFormed = (guess: string): boolean =>
  WORD_PATTERN.test(guess.trim().toLowerCase());

/**
 * Days since an arbitrary epoch, so the same date gives the same word.
 *
 * Uses local calendar date rather than UTC: the puzzle should change when the
 * player's own day does, not at some hour that depends on their timezone.
 */
export function dayNumber(date: Date = new Date()): number {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = Date.UTC(2024, 0, 1);
  return Math.floor((local - epoch) / 86_400_000);
}

/**
 * The word for a given day.
 *
 * A stride coprime with the pool size walks the whole list before repeating,
 * so consecutive days are not adjacent entries — picking `day % length` would
 * march alphabetically through the list, which is guessable.
 */
export function wordForDay(day: number = dayNumber()): string {
  const stride = 97;
  const index = ((day * stride) % ANSWERS.length + ANSWERS.length) % ANSWERS.length;
  return ANSWERS[index];
}

/**
 * Score a guess against the answer.
 *
 * The duplicate-letter case is the whole difficulty, and naive
 * implementations get it wrong. Guessing "geese" against "those": there is one
 * `e` in the answer and it is already matched green in the final position, so
 * neither earlier `e` may come back amber. Two passes: take all greens and
 * decrement a tally of the answer's letters, then hand out ambers only while
 * that tally still has the letter left.
 */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const g = guess.toLowerCase().split("");
  const a = answer.toLowerCase().split("");
  const marks: Mark[] = Array(g.length).fill("grey");

  const remaining = new Map<string, number>();
  a.forEach((letter) => remaining.set(letter, (remaining.get(letter) ?? 0) + 1));

  g.forEach((letter, i) => {
    if (letter === a[i]) {
      marks[i] = "green";
      remaining.set(letter, (remaining.get(letter) ?? 0) - 1);
    }
  });

  g.forEach((letter, i) => {
    if (marks[i] === "green") return;
    const left = remaining.get(letter) ?? 0;
    if (left > 0) {
      marks[i] = "amber";
      remaining.set(letter, left - 1);
    }
  });

  return marks;
}

/**
 * Best-known state per letter, for colouring the on-screen keyboard.
 *
 * A letter never downgrades: once a green is known, a later amber or grey for
 * the same letter must not overwrite it.
 */
export function keyboardState(
  guesses: string[],
  answer: string,
): Record<string, Mark> {
  const rank: Record<Mark, number> = { grey: 0, amber: 1, green: 2 };
  const state: Record<string, Mark> = {};
  guesses.forEach((guess) => {
    scoreGuess(guess, answer).forEach((mark, i) => {
      const letter = guess[i].toLowerCase();
      if (!state[letter] || rank[mark] > rank[state[letter]]) state[letter] = mark;
    });
  });
  return state;
}

export type Progress = "playing" | "won" | "lost";

export function progressOf(guesses: string[], answer: string): Progress {
  if (guesses.some((guess) => guess.toLowerCase() === answer.toLowerCase())) return "won";
  return guesses.length >= MAX_GUESSES ? "lost" : "playing";
}
