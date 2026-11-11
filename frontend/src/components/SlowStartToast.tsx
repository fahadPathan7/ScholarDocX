import { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";

/**
 * Heads-up shown while an auth request is in flight (the hosted backend can
 * take up to a minute to answer the first request after a quiet period).
 *
 * Stays visible for as long as `show` is true and counts down from
 * `countdownSeconds` so users know to wait. When the countdown reaches zero
 * and the request is still running, the text switches to "almost there".
 * Resets the next time `show` goes false → true.
 */
export function SlowStartToast({ show, countdownSeconds = 30, inline = false }: { show: boolean; countdownSeconds?: number; inline?: boolean }) {
  const [remaining, setRemaining] = useState(countdownSeconds);

  useEffect(() => {
    if (!show) return;
    setRemaining(countdownSeconds);
    const timer = window.setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [show, countdownSeconds]);

  if (!show) return null;

  return (
    <div className={inline ? "auth-toast auth-toast-inline" : "auth-toast"} role="status" aria-live="polite">
      <Hourglass size={16} aria-hidden="true" />
      <span>
        {remaining > 0
          ? `The first sign-in after a quiet period can take up to a minute. Please wait… ${remaining}s`
          : "Still waking the server up. Almost there, please keep waiting…"}
      </span>
    </div>
  );
}
