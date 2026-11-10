import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

/**
 * Brief heads-up shown while an auth request is in flight (the hosted backend
 * can take up to a minute to answer the first request after a quiet period).
 *
 * Appears when `show` turns true, then dismisses itself after `durationMs`
 * even if the request is still running; it re-arms the next time `show`
 * goes false → true. Replaces the old inline note under the submit buttons.
 */
export function SlowStartToast({ show, durationMs = 6000 }: { show: boolean; durationMs?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [show, durationMs]);

  if (!visible) return null;

  return (
    <div className="auth-toast" role="status" aria-live="polite">
      <Hourglass size={16} aria-hidden="true" />
      <span>The first sign-in after a quiet period can take up to a minute. Hang tight!</span>
    </div>
  );
}
