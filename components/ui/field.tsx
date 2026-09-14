import type { ReactNode } from "react";

const inputBase =
  "w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[0.95rem] text-ink " +
  "placeholder:text-ink-muted/70 outline-none transition-colors " +
  "focus:border-accent focus:ring-2 focus:ring-accent/15";

export function Field({
  label,
  help,
  error,
  children,
  required,
}: {
  label: string;
  help?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[0.95rem] font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      {help && <p className="text-[0.82rem] leading-relaxed text-ink-muted">{help}</p>}
      {children}
      {error && <p className="text-[0.82rem] text-accent">{error}</p>}
    </div>
  );
}

export function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={`${inputBase} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      rows={4}
      {...props}
      className={`${inputBase} resize-y ${props.className ?? ""}`}
    />
  );
}

export function Select({
  options,
  placeholder,
  ...props
}: React.ComponentProps<"select"> & {
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <select {...props} className={`${inputBase} ${props.className ?? ""}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Three-state yes/no. Leaving it unanswered is meaningful: a skipped question
 * produces no fact, so the assistant escalates to the organizer instead of
 * telling a guest something the host never confirmed.
 */
export function YesNo({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: boolean | null;
}) {
  const current = defaultValue === true ? "si" : defaultValue === false ? "no" : "";
  return (
    <div className="flex gap-2">
      {[
        { value: "si", label: "Sí" },
        { value: "no", label: "No" },
        { value: "", label: "Todavía no sé" },
      ].map((o) => (
        <label
          key={o.label}
          className="cursor-pointer rounded-full border border-line bg-white px-4 py-2 text-[0.85rem] text-ink-soft transition-colors has-checked:border-accent has-checked:bg-accent has-checked:text-paper"
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={current === o.value}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-full bg-accent px-7 py-3 text-sm font-medium text-paper transition-colors hover:bg-accent-soft disabled:opacity-60"
    >
      {children}
    </button>
  );
}
