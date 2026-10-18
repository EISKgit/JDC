import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

interface PasswordInputProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  label: string;
  hint?: string;
  rowExtra?: React.ReactNode;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
}

/** Password input with an eye icon to toggle visibility. */
export function PasswordInput({
  value,
  onChange,
  label,
  hint,
  rowExtra,
  required = false,
  minLength,
  maxLength,
  placeholder,
  disabled = false,
  autoComplete = "current-password",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setVisible((v) => !v);
  }

  return (
    <label>
      <span className="label-row">{label}{rowExtra}</span>
      <div className="password-wrapper">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="icon-btn password-toggle"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={handleToggle}
          disabled={disabled}
        >
          {visible ? (
            <EyeOff size={16} aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
        </button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}