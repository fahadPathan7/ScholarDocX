export function parseLocalDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return startOfLocalDay(new Date(year, month - 1, day));
  }
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

export function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function formatShortDate(value: unknown) {
  const date = parseLocalDate(value);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatLongDate(value: unknown) {
  const date = parseLocalDate(value);
  if (!date) return "Date TBD";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Local calendar day as `YYYY-MM-DD` (not the UTC day, which `toISOString` would give). */
export function localDateKey(date: Date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Whole calendar days from the viewer's local today to `value`'s local day.
 * Negative = past. Null when unparseable. Rounded so DST days (23/25h) count as one.
 */
export function daysUntilLocal(value: unknown, now: Date = new Date()) {
  const target = parseLocalDate(value);
  if (!target) return null;
  return Math.round((target.getTime() - startOfLocalDay(now).getTime()) / 86400000);
}

/**
 * Like `new Date(value)`, but a date-only string means local midnight of that day
 * instead of UTC midnight. Datetimes keep their exact instant.
 */
export function toLocalInstant(value: unknown) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return parseLocalDate(value.trim());
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
