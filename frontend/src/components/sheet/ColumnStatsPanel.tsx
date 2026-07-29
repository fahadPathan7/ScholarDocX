/* ------------------------------------------------------------------ */
/*  ColumnStatsPanel — what is actually in this column                 */
/*                                                                     */
/*  A sheet is easy to store things in and hard to read. This answers   */
/*  the questions people otherwise scroll to work out: how much of it   */
/*  is filled in, how many different answers are there, what is the     */
/*  next deadline, what is the spread of a number column.               */
/*                                                                     */
/*  SCHOLARDOCX-0203.                                                  */
/* ------------------------------------------------------------------ */

import { BarChart3, X } from "lucide-react";
import type { ColumnDef } from "./sheetModel";
import { columnStats } from "./sheetInsights";

const shortDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : value;
};

/** Trim a long float without dropping a meaningful integer's digits. */
const num = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");

export function ColumnStatsPanel({
  column,
  rows,
  now,
  onFilterValue,
  onClose,
}: {
  column: ColumnDef;
  rows: Record<string, string>[];
  now: Date;
  /** Clicking a top value filters the sheet to it — reading and acting on
   *  what you read should not be two separate journeys. */
  onFilterValue?: (column: string, value: string) => void;
  onClose: () => void;
}) {
  const stats = columnStats(rows, column, now);
  const empty = stats.total - stats.filled;

  return (
    <div className="col-stats" role="dialog" aria-label={`Statistics for ${column.name}`}>
      <div className="col-stats-head">
        <span className="col-stats-title">
          <BarChart3 size={13} /> {column.name}
        </span>
        <button type="button" onClick={onClose} aria-label="Close" title="Close">
          <X size={13} />
        </button>
      </div>

      <div className="col-stats-fill">
        <div className="col-stats-bar" aria-hidden="true">
          <i style={{ width: `${stats.fillRate}%` }} />
        </div>
        <span>
          <strong>{stats.fillRate}%</strong> filled — {stats.filled} of {stats.total}
          {empty ? `, ${empty} blank` : ""}
        </span>
      </div>

      {stats.numeric ? (
        <dl className="col-stats-figures">
          <div><dt>Lowest</dt><dd>{num(stats.numeric.min)}</dd></div>
          <div><dt>Highest</dt><dd>{num(stats.numeric.max)}</dd></div>
          <div><dt>Average</dt><dd>{num(stats.numeric.average)}</dd></div>
          <div><dt>Total</dt><dd>{num(stats.numeric.sum)}</dd></div>
        </dl>
      ) : null}

      {stats.dates ? (
        <dl className="col-stats-figures">
          <div>
            <dt>Next up</dt>
            <dd>{stats.dates.next ? shortDate(stats.dates.next) : "Nothing ahead"}</dd>
          </div>
          <div>
            <dt>In the past</dt>
            <dd className={stats.dates.overdue ? "is-warning" : ""}>{stats.dates.overdue}</dd>
          </div>
          <div><dt>Earliest</dt><dd>{shortDate(stats.dates.earliest)}</dd></div>
          <div><dt>Latest</dt><dd>{shortDate(stats.dates.latest)}</dd></div>
        </dl>
      ) : null}

      {stats.top.length ? (
        <div className="col-stats-top">
          <h5>
            {stats.distinct} different value{stats.distinct === 1 ? "" : "s"}
          </h5>
          {stats.top.map(({ value, count }) => (
            <button
              key={value}
              type="button"
              className="col-stats-value"
              onClick={() => onFilterValue?.(column.name, value)}
              title={onFilterValue ? `Show only rows where ${column.name} is "${value}"` : value}
              disabled={!onFilterValue}
            >
              <span className="col-stats-value-name">{value}</span>
              <span className="col-stats-value-bar" aria-hidden="true">
                <i style={{ width: `${stats.filled ? (count / stats.filled) * 100 : 0}%` }} />
              </span>
              <span className="col-stats-value-count">{count}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="col-stats-empty">Nothing has been entered in this column yet.</p>
      )}
    </div>
  );
}
