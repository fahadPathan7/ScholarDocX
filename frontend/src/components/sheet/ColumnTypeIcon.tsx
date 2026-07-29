/* ------------------------------------------------------------------ */
/*  ColumnTypeIcon — the small glyph in a column header                */
/*                                                                     */
/*  Column types were previously invisible in the grid: a date column  */
/*  and a text column looked identical until you tried to edit one and */
/*  got a date picker. One glyph makes the column's behaviour readable */
/*  before you touch it.                                               */
/*                                                                     */
/*  SCHOLARDOCX-0202.                                                  */
/* ------------------------------------------------------------------ */

import { CalendarDays, CheckSquare, ChevronDownSquare, Hash, Link2, Paperclip, Type } from "lucide-react";
import type { ColumnType } from "./sheetModel";

const ICONS: Record<ColumnType, typeof Type | null> = {
  text: Type,
  number: Hash,
  date: CalendarDays,
  bool: CheckSquare,
  select: ChevronDownSquare,
  url: Link2,
  file: Paperclip,
  // A group is a header spanning other columns, not a value — it has no
  // cell behaviour to advertise.
  group: null,
};

export function ColumnTypeIcon({ type, title }: { type: ColumnType; title?: string }) {
  const Icon = ICONS[type];
  if (!Icon) return null;
  return (
    <span className="column-type-icon" title={title} aria-hidden="true">
      <Icon size={12} />
    </span>
  );
}
