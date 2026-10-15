import { useId, type ReactNode } from "react";
import { Chip } from "./Chip";
import styles from "./Form.module.css";


interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Render the control; pass the given id and aria props to it. */
  children: (control: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <span id={`${id}-error`} className={styles.error}>
          {error}
        </span>
      ) : (
        hint && (
          <span id={`${id}-hint`} className={styles.hint}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

interface ChoicesProps<T extends string> {
  label: string;
  options: { value: T; label: string; emoji?: string }[];
  selected: T[];
  onChange: (selected: T[]) => void;
  multiple?: boolean;
}

/** Single or multiple choice as chips (bigger and clearer than a select on phones). */
export function Choices<T extends string>({ label, options, selected, onChange, multiple = false }: ChoicesProps<T>) {
  const toggle = (value: T) => {
    if (!multiple) return onChange([value]);
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.choices}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            emoji={option.emoji}
            pressed={selected.includes(option.value)}
            onToggle={() => toggle(option.value)}
            look="tonal"
          />
        ))}
      </div>
    </fieldset>
  );
}

export function FormError({ message }: { message?: string | null }) {
  return message ? (
    <p className={styles.formError} role="alert">
      {message}
    </p>
  ) : null;
}
