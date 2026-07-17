import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./PasswordField.css";

/**
 * Password input with a permanent eye icon that toggles visibility.
 *
 * Spreads through any native <input> props (id, name, autoComplete, value,
 * onChange, placeholder, required, …) so it is a drop-in replacement for a
 * plain password input. The eye toggle sits inside the field on the right.
 */
export function PasswordField({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-field">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`pw-input ${className}`.trim()}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
