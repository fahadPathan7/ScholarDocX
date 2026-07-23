import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTokenEconomy } from "../contexts/TokenEconomyContext";

// Tooltip content is rendered through a portal to document.body so it can never
// be clipped by an ancestor with `overflow: hidden` (the fixed navbar, topbar,
// or `.top-actions` pill all clip a normal in-flow tooltip on small screens).
export function AiTokenUsageButton() {
  const { balance } = useTokenEconomy();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  if (!balance) return null;

  if (balance.is_unlimited) {
    return null;
  }

  // "Used" is tracked explicitly per period (subscription_used) — never derived
  // from allowance − remaining, which collapses to 0 after a mid-period plan
  // change. The pool is used + remaining so the two always add up, even when the
  // live subscription bucket was granted at a higher tier than the current plan.
  const used = balance.subscription_used + Math.max(0, balance.purchased_total - balance.purchased_remaining);
  const totalRemaining = Math.max(0, balance.subscription_remaining) + balance.purchased_remaining;
  const totalPool = used + totalRemaining;

  if (totalPool <= 0) {
    return null;
  }

  const percentage = Math.round((used / totalPool) * 100);

  return (
    <>
      <div
        ref={containerRef}
        className="token-usage-badge custom-tooltip-container"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {percentage}%
      </div>
      {hovered && containerRef.current && (
        <CreditUsageTooltip
          badgeRef={containerRef}
          percentage={percentage}
          used={used}
          totalPool={totalPool}
        />
      )}
    </>
  );
}

type CreditUsageTooltipProps = {
  badgeRef: React.RefObject<HTMLDivElement | null>;
  percentage: number;
  used: number;
  totalPool: number;
};

function CreditUsageTooltip({ badgeRef, percentage, used, totalPool }: CreditUsageTooltipProps) {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });

  // Position the tooltip above the badge, centered horizontally on it. Computed
  // in a layout effect so it tracks the badge even as the navbar reflows.
  useLayoutEffect(() => {
    const badge = badgeRef.current;
    const tip = tipRef.current;
    if (!badge || !tip) return;

    const badgeRect = badge.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    // Place the tooltip below the badge (the natural direction for a navbar
    // tooltip). Center horizontally on the badge, clamped to the viewport.
    const top = badgeRect.bottom + 10;
    const left = Math.max(
      8,
      Math.min(
        badgeRect.left + badgeRect.width / 2 - tipRect.width / 2,
        window.innerWidth - tipRect.width - 8,
      ),
    );

    setStyle({ top, left, visibility: "visible" });
  }, [badgeRef, percentage, used, totalPool]);

  return createPortal(
    <div ref={tipRef} className="custom-tooltip custom-tooltip-floating" style={style} role="tooltip">
      AI Credits Used: {percentage}%
      <br />
      <span style={{ opacity: 0.8, fontSize: "11px" }}>
        {used.toLocaleString()} of {totalPool.toLocaleString()} limit
      </span>
    </div>,
    document.body,
  );
}
