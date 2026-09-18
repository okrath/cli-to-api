import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

interface FieldProps {
  label: string;
  error?: string | null;
  children: ReactNode;
  hint?: string;
}

export function Field({ label, error, children, hint }: FieldProps) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-neutral-500">{hint}</span> : null}
      {error ? <span className="block text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

export function Button({
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : "border border-neutral-300 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800";
  return (
    <button
      {...props}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}
