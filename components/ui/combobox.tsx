"use client";

import { useId, useMemo, useRef, useState } from "react";

/**
 * Type-to-filter picker that submits a plain string.
 *
 * Existing options are one click away so the same group does not get retyped
 * three slightly different ways, but a new name can still be typed — the server
 * resolves it against the normalized form, so "familia novia" lands on the
 * existing "Familia de la novia" rather than creating a near-duplicate.
 */
export function Combobox({
  name,
  options,
  value: initialValue = "",
  placeholder,
  createLabel = (typed: string) => `Crear «${typed}»`,
}: {
  name: string;
  options: string[];
  value?: string;
  placeholder?: string;
  createLabel?: (typed: string) => string;
}) {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = useMemo(() => {
    const needle = value.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, value]);

  const exactMatch = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  const showCreate = value.trim().length > 0 && !exactMatch;
  const items = showCreate ? [...filtered, null] : filtered;

  function choose(index: number) {
    const item = items[index];
    // `null` is the "create this" row; the typed text is already the value.
    if (item !== null && item !== undefined) setValue(item);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so a click on an option registers before the list unmounts.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open && items.length > 0) {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-ink-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/15"
      />

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {items.map((item, index) => (
            <li key={item ?? "__create__"} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  choose(index);
                }}
                className={`block w-full px-3.5 py-2 text-left text-[0.9rem] ${
                  index === active ? "bg-paper-deep text-ink" : "text-ink-soft"
                }`}
              >
                {item ?? (
                  <span className="text-accent">{createLabel(value.trim())}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
