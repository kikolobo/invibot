"use client";

import { useActionState, useState, useTransition } from "react";
import {
  confirmImport,
  previewImport,
  type GuestActionState,
  type ImportPreview,
} from "@/lib/guests/actions";
import { Textarea, SubmitButton } from "@/components/ui/field";

export function ImportGuests({ eventId }: { eventId: string }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();

  const bound = confirmImport.bind(null, eventId);
  const [state, action, pending] = useActionState<GuestActionState, FormData>(bound, {});

  function check() {
    setPreviewError(null);
    startChecking(async () => {
      const result = await previewImport(eventId, text);
      if ("error" in result) {
        setPreviewError(result.error);
        setPreview(null);
      } else {
        setPreview(result);
      }
    });
  }

  const skipped = new Set([
    ...(preview?.alreadyInList ?? []),
    ...(preview?.suppressed ?? []),
  ]);

  return (
    <div className="rounded-xl border border-line bg-paper-deep p-5">
      <p className="font-display text-xl text-ink">Importar una lista</p>
      <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-muted">
        Copia y pega desde Excel o Numbers, o sube un archivo CSV. Reconocemos
        columnas de nombre, teléfono, correo, grupo y pases — con o sin
        encabezado.
      </p>

      <label className="mt-4 inline-block cursor-pointer text-[0.88rem] text-accent hover:underline">
        Subir un archivo CSV
        <input
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              setText(await file.text());
              setPreview(null);
            }
          }}
        />
      </label>

      <Textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={6}
        className="mt-3 font-mono text-[0.82rem]"
        placeholder={"María González, 55 1234 5678, maria@ejemplo.com, Familia novia\nJuan Pérez, 55 8765 4321"}
      />

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={check}
          disabled={!text.trim() || checking}
          className="rounded-full border border-line bg-paper-deep px-5 py-2 text-sm text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {checking ? "Revisando…" : "Revisar lista"}
        </button>
        {previewError && <p className="text-[0.88rem] text-danger">{previewError}</p>}
      </div>

      {preview && (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-[0.9rem] text-ink">
            <strong>{preview.importable}</strong> de {preview.parsed.length} se
            pueden importar.
            {preview.alreadyInList.length > 0 &&
              ` ${preview.alreadyInList.length} ya están en la lista.`}
            {preview.suppressed.length > 0 &&
              ` ${preview.suppressed.length} pidieron no ser contactados.`}
          </p>

          <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-line bg-paper-deep">
            <table className="w-full text-left text-[0.85rem]">
              <tbody>
                {preview.parsed.map((g) => {
                  const errors = g.issues.filter((i) => i.level === "error");
                  const warnings = g.issues.filter((i) => i.level === "warning");
                  const skip = skipped.has(g.row);
                  const bad = errors.length > 0 || skip;
                  return (
                    <tr key={g.row} className="border-b border-line/60 last:border-0">
                      <td className="w-8 px-3 py-2 align-top text-ink-muted">
                        {bad ? "—" : "✓"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span className={bad ? "text-ink-muted line-through" : "text-ink"}>
                          {g.fullName || <em>sin nombre</em>}
                        </span>
                        <span className="ml-2 text-ink-muted">{g.phoneE164 ?? ""}</span>
                        {(errors.length > 0 || warnings.length > 0 || skip) && (
                          <span className="block text-[0.8rem] text-accent">
                            {skip
                              ? preview.suppressed.includes(g.row)
                                ? "Pidió no recibir invitaciones."
                                : "Ya está en la lista."
                              : [...errors, ...warnings].map((i) => i.message).join(" · ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preview.importable > 0 && (
            <form action={action} className="mt-4">
              <input type="hidden" name="list" value={text} />
              <SubmitButton>
                {pending ? "Importando…" : `Importar ${preview.importable}`}
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {state.error && <p className="mt-3 text-[0.88rem] text-danger">{state.error}</p>}
      {state.ok && <p className="mt-3 text-[0.88rem] text-ink-soft">{state.ok}</p>}
    </div>
  );
}
