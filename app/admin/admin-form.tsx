"use client";

import { useActionState } from "react";
import type { AdminState } from "@/lib/admin/actions";

/**
 * Every form on the console: one action, its result under the button. The
 * account it is about rides along as a hidden field, and the action looks the
 * account up again rather than trusting anything else the form says about it.
 */
export function AdminForm({
  action,
  userId,
  submit,
  busy = "Guardando…",
  tone = "default",
  confirm,
  children,
  className = "space-y-4",
}: {
  action: (state: AdminState, formData: FormData) => Promise<AdminState>;
  userId?: string;
  submit: string;
  busy?: string;
  tone?: "default" | "quiet" | "danger";
  /** A checkbox to tick before the button does anything, for what is hard to take back. */
  confirm?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, run, pending] = useActionState<AdminState, FormData>(action, {});

  const button = {
    default: "bg-action text-ink-onaction",
    quiet: "border border-line text-ink-soft hover:border-accent hover:text-accent",
    danger: "bg-danger text-paper",
  }[tone];

  return (
    <form action={run} className={className}>
      {userId && <input type="hidden" name="userId" value={userId} />}
      {children}
      {confirm && (
        <label className="flex max-w-sm items-start gap-2 text-[0.85rem] text-ink-soft">
          <input type="checkbox" name="confirmed" required className="mt-1" />
          <span>{confirm}</span>
        </label>
      )}
      {state.error && <p className="text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="text-[0.88rem] text-ink-soft">{state.ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className={`rounded-full px-5 py-2 text-[0.88rem] transition-colors disabled:opacity-50 ${button}`}
      >
        {pending ? busy : submit}
      </button>
    </form>
  );
}

/** The input every admin form uses, labelled. */
export function Field({
  label,
  hint,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[0.9rem] text-ink-soft">{label}</span>
      <input
        {...input}
        className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-ink"
      />
      {hint && <span className="mt-1 block text-[0.8rem] text-ink-muted">{hint}</span>}
    </label>
  );
}
