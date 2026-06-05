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
