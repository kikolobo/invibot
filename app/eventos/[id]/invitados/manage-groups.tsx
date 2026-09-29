"use client";

import { useState, useTransition } from "react";
import { createGroup, deleteGroup, renameGroup, type GroupActionState } from "@/lib/guests/actions";

/**
 * The event's groups, editable in place: add, rename, remove.
 *
 * Counts come from the list the table already has, so they are the guests the
 * organizer can see. They are there to answer "can I remove this one?" at a
 * glance, not to be an audit.
 */
export function ManageGroups({
  eventId,
  groups,
  counts,
}: {
  eventId: string;
  groups: string[];
  counts: Record<string, number>;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [fresh, setFresh] = useState("");
  const [note, setNote] = useState<GroupActionState | null>(null);
  const [pending, startTransition] = useTransition();

  const people = (count: number) => (count === 1 ? "1 invitado" : `${count} invitados`);

  function run(action: () => Promise<GroupActionState>, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      setNote(result);
      if (result.ok) after?.();
    });
  }

  function saveRename(from: string) {
    const to = draft.trim();
    if (!to || to === from) {
      setRenaming(null);
      return;
    }
    startTransition(async () => {
      let result = await renameGroup(eventId, from, to);
      if (result.conflict) {
        // The new name is another group's. Saying so, with the numbers, is
        // what turns a surprising merge into a deliberate one.
        const ok = window.confirm(
          `Ya existe ${result.conflict}. ¿Unir ${from} (${people(counts[from] ?? 0)}) a ${result.conflict}?`,
        );
        if (!ok) return;
        result = await renameGroup(eventId, from, to, true);
      }
      setNote(result);
      if (result.ok) setRenaming(null);
    });
  }

  function remove(name: string) {
    const count = counts[name] ?? 0;
    // An empty group goes without asking; there is nothing to lose.
    if (count > 0 && !window.confirm(`¿Quitar ${name}? Sus ${people(count)} quedan sin grupo.`)) {
      return;
    }
    run(() => deleteGroup(eventId, name));
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <p className="text-[0.88rem] text-ink-muted">Este evento todavía no tiene grupos.</p>
      ) : (
        <ul className="divide-y divide-line/60 rounded-xl border border-line bg-paper-deep">
          {groups.map((group) => (
            <li key={group} className="flex items-center gap-3 px-3 py-2">
              {renaming === group ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveRename(group);
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      // Escape here cancels the rename, not the whole panel.
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                    maxLength={60}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1 text-[0.88rem] text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full bg-action px-3 py-1 text-[0.8rem] text-ink-onaction disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenaming(null)}
                    className="text-[0.8rem] text-ink-muted transition-colors hover:text-accent"
                  >
                    Cancelar
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[0.9rem] text-ink">{group}</span>
                  <span className="shrink-0 text-[0.8rem] text-ink-muted">
                    {people(counts[group] ?? 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(group);
                      setDraft(group);
                      setNote(null);
                    }}
                    disabled={pending}
                    className="shrink-0 text-[0.8rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(group)}
                    disabled={pending}
                    className="shrink-0 text-[0.8rem] text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!fresh.trim()) return;
          run(() => createGroup(eventId, fresh), () => setFresh(""));
        }}
      >
        <input
          value={fresh}
          onChange={(e) => setFresh(e.target.value)}
          placeholder="Nuevo grupo"
          maxLength={60}
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper-deep px-3 py-1.5 text-[0.88rem] text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending || !fresh.trim()}
          className="rounded-full bg-action px-4 py-1.5 text-[0.85rem] text-ink-onaction disabled:opacity-50"
        >
          Agregar
        </button>
      </form>

      {note && (note.ok || note.error) && (
        <p className={`text-[0.85rem] ${note.error ? "text-danger" : "text-ink-soft"}`}>
          {note.ok ?? note.error}
        </p>
      )}
    </div>
  );
}
