import { useEffect, useRef } from "react";
import { AlertTriangle, Ban, ShieldAlert, TimerReset } from "lucide-react";
import { useDialog } from "./DialogProvider";
import type { UiErrorDetail } from "../lib/uiError";

export function GlobalErrorAlerts() {
  const { showAlert } = useDialog();
  const lastShownRef = useRef<{ key: string; ts: number }>({ key: "", ts: 0 });

  useEffect(() => {
    const handler = async (event: Event) => {
      const custom = event as CustomEvent<UiErrorDetail>;
      const detail = custom.detail;
      if (!detail?.message) return;

      const dedupeKey = `${detail.title}|${detail.message}`;
      const now = Date.now();
      if (lastShownRef.current.key === dedupeKey && now - lastShownRef.current.ts < 1200) {
        return;
      }
      lastShownRef.current = { key: dedupeKey, ts: now };

      const icon = detail.kind === "permission"
        ? <ShieldAlert size={18} />
        : detail.kind === "limit"
          ? <Ban size={18} />
          : detail.kind === "rate"
            ? <TimerReset size={18} />
            : <AlertTriangle size={18} />;

      await showAlert(
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ marginTop: 2, color: "#475569" }}>{icon}</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: "#1f2937" }}>{detail.message}</p>
            {/* The "Action guidance" line is only meaningful for auth/quota
                failures (permission/limit/rate). For general validation
                errors (e.g. "Password must be between 3 and 10 characters"),
                appending it would mislead the user into thinking the problem
                is role/permission related when it's just bad input. */}
            {(detail.kind === "permission" || detail.kind === "limit" || detail.kind === "rate") && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                Action guidance: ask your admin to review role permissions/limits, or retry after reset if this is a quota issue.
              </p>
            )}
          </div>
        </div>,
        detail.title || "Action blocked"
      );
    };

    window.addEventListener("scholardocx:ui-error", handler as EventListener);
    return () => window.removeEventListener("scholardocx:ui-error", handler as EventListener);
  }, [showAlert]);

  return null;
}
