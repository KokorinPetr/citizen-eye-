import { useEffect, useState, type ComponentProps } from "react";
import { Button } from "./Button";

const CONFIRM_WINDOW_MS = 3500;

interface ConfirmButtonProps extends Omit<ComponentProps<typeof Button>, "onClick"> {
  confirmLabel: string;
  onConfirm: () => void;
}

/** For actions that are hard to undo: first tap asks "tap again to confirm" (no pop-up dialog). */
export function ConfirmButton({ confirmLabel, onConfirm, children, ...rest }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      {...rest}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
