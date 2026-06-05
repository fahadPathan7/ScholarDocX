import { LayoutDashboard, Pin } from "lucide-react";

type PinActionsProps = {
  isPinned: boolean;
  isDashboardPinned: boolean;
  onTogglePinned: () => void;
  onToggleDashboard: () => void;
};

export function PinActions({
  isPinned,
  isDashboardPinned,
  onTogglePinned,
  onToggleDashboard
}: PinActionsProps) {
  return (
    <div className="pin-actions">
      <button
        className={isPinned ? "secondary pin-button active" : "secondary pin-button"}
        type="button"
        onClick={onTogglePinned}
        title={isPinned ? "Unpin from this view" : "Pin to this view"}
      >
        <Pin size={16} />
        <span>{isPinned ? "Pinned" : "Pin"}</span>
      </button>
      <button
        className={isDashboardPinned ? "secondary pin-button active dashboard-pin" : "secondary pin-button dashboard-pin"}
        type="button"
        onClick={onToggleDashboard}
        title={isDashboardPinned ? "Remove from dashboard" : "Add to dashboard"}
      >
        <LayoutDashboard size={16} />
        <span>{isDashboardPinned ? "On dashboard" : "Dashboard"}</span>
      </button>
    </div>
  );
}
