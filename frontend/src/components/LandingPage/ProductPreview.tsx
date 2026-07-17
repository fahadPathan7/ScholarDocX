import {
  LayoutDashboard,
  FolderKanban,
  Table2,
  FileText,
  CheckCircle2,
  Clock,
  PenLine,
} from "lucide-react";
import "./ProductPreview.css";

/**
 * Pure CSS/HTML mock of the ScholarDocX workspace. No external screenshots or
 * assets — built from the same design tokens as the real app so it stays
 * on-brand. Uses real-looking content (project names, deadlines, statuses)
 * instead of abstract bars so it reads as a genuine product, not a skeleton.
 */
export function ProductPreview() {
  return (
    <div className="lp-preview" aria-hidden="true">
      {/* Floating accent cards around the main window */}
      <div className="lp-preview-chip lp-preview-chip-1 lp-float-slow">
        <CheckCircle2 size={14} />
        <span>AI outreach drafted</span>
      </div>
      <div className="lp-preview-chip lp-preview-chip-2 lp-float">
        <Clock size={14} />
        <span>3 deadlines this week</span>
      </div>

      {/* Main app window */}
      <div className="lp-preview-window">
        <div className="lp-preview-titlebar">
          <span className="lp-preview-dots">
            <span className="lp-preview-dot" />
            <span className="lp-preview-dot" />
            <span className="lp-preview-dot" />
          </span>
          <span className="lp-preview-url">scholardocx.app/dashboard</span>
        </div>

        <div className="lp-preview-body">
          {/* Mini left rail */}
          <aside className="lp-preview-rail">
            <div className="lp-preview-rail-item active"><LayoutDashboard size={15} /></div>
            <div className="lp-preview-rail-item"><FolderKanban size={15} /></div>
            <div className="lp-preview-rail-item"><Table2 size={15} /></div>
            <div className="lp-preview-rail-item"><FileText size={15} /></div>
          </aside>

          {/* Main content */}
          <div className="lp-preview-main">
            <div className="lp-preview-pagehead">
              <div>
                <div className="lp-preview-pagetitle">PhD Applications · Fall 2026</div>
                <div className="lp-preview-pagemeta">12 programs · 4 in review</div>
              </div>
              <div className="lp-preview-newbtn"><Table2 size={11} /> New Sheet</div>
            </div>

            {/* Tracker sheet with real-looking rows */}
            <div className="lp-preview-sheet">
              <div className="lp-preview-sheet-row head">
                <span className="lp-preview-col-program">Program</span>
                <span className="lp-preview-col-deadline">Deadline</span>
                <span className="lp-preview-col-status">Status</span>
              </div>
              <div className="lp-preview-sheet-row">
                <span className="lp-preview-col-program">Stanford CS PhD</span>
                <span className="lp-preview-col-deadline">Dec 15</span>
                <span className="lp-preview-status tone-teal"><PenLine size={9} /> In Review</span>
              </div>
              <div className="lp-preview-sheet-row">
                <span className="lp-preview-col-program">MIT EECS</span>
                <span className="lp-preview-col-deadline">Dec 12</span>
                <span className="lp-preview-status tone-blue"><CheckCircle2 size={9} /> Submitted</span>
              </div>
              <div className="lp-preview-sheet-row">
                <span className="lp-preview-col-program">ETH Zürich · CS</span>
                <span className="lp-preview-col-deadline">Jan 30</span>
                <span className="lp-preview-status tone-mint"><Clock size={9} /> Drafting</span>
              </div>
              <div className="lp-preview-sheet-row">
                <span className="lp-preview-col-program">CMU LTI</span>
                <span className="lp-preview-col-deadline">Dec 10</span>
                <span className="lp-preview-status tone-blue"><CheckCircle2 size={9} /> Submitted</span>
              </div>
            </div>

            {/* Mini stat tiles */}
            <div className="lp-preview-mini-stats">
              <div className="lp-preview-mini-stat">
                <span className="lp-preview-mini-num">7</span>
                <span className="lp-preview-mini-lbl">Submitted</span>
              </div>
              <div className="lp-preview-mini-stat">
                <span className="lp-preview-mini-num">4</span>
                <span className="lp-preview-mini-lbl">In review</span>
              </div>
              <div className="lp-preview-mini-stat">
                <span className="lp-preview-mini-num">1</span>
                <span className="lp-preview-mini-lbl">Offer</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle reflection/depth shadow */}
      <div className="lp-preview-shadow" />
    </div>
  );
}
