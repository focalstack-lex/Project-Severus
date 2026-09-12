import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

interface Props {
  open: boolean;
  description: string;
  isNewPassword: boolean;
  error: string | null;
  busy: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

/**
 * Control-password gate for destructive system intents (lock workstation,
 * close window). Rendered above every other overlay; the first use asks to
 * set the password, later uses verify it.
 */
export default function PasswordGateModal({
  open,
  description,
  isNewPassword,
  error,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirmPassword("");
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  if (!open) return null;

  const mismatch = isNewPassword && confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = !busy && password.length > 0 && (!isNewPassword || (!mismatch && confirmPassword.length > 0));

  const submit = () => {
    if (canSubmit) onConfirm(password);
  };

  return (
    <div className="overlay gate-overlay" onClick={onCancel}>
      <div className="gate-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gate-header">
          <span className="gate-title">
            <Icon name="lock" size={15} />
            {isNewPassword ? "Set Control Password" : "Control Password"}
          </span>
          <button className="close-btn" onClick={onCancel} title="Cancel (Esc)" aria-label="Cancel (Esc)">
            <Icon name="close" size={13} />
          </button>
        </div>

        <p className="gate-description">{description}</p>
        <p className="gate-sub">
          {isNewPassword
            ? "Choose a password for destructive system actions (locking the PC, closing windows)."
            : "Enter your control password to allow this action."}
        </p>

        <input
          ref={inputRef}
          type="password"
          className="gate-input"
          value={password}
          placeholder="Password"
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && !isNewPassword) submit();
            if (e.key === "Enter" && isNewPassword && !mismatch && confirmPassword) submit();
          }}
        />
        {isNewPassword && (
          <input
            type="password"
            className="gate-input"
            value={confirmPassword}
            placeholder="Confirm password"
            disabled={busy}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        )}
        {mismatch && <div className="gate-error">Passwords do not match.</div>}
        {error && <div className="gate-error">{error}</div>}

        <div className="gate-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="accent" onClick={submit} disabled={!canSubmit}>
            {busy ? "Working…" : isNewPassword ? "Set & Allow" : "Allow"}
          </button>
        </div>
      </div>
    </div>
  );
}
