"use client";

/**
 * When a console page fails to load. The header stays, so staff can still get
 * somewhere else; the digest is what to look for in the Vercel logs.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <h1 className="font-display text-3xl text-ink">No se pudo cargar esta página</h1>
      <p className="mt-3 max-w-md text-[0.9rem] leading-relaxed text-ink-muted">
        Nada se cambió. Puede ser la base de datos tardando; inténtalo otra vez en un momento.
      </p>
      {error.digest && (
        <p className="mt-4 font-mono text-[0.8rem] text-ink-muted">Referencia: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="mt-8 rounded-full bg-action px-5 py-2 text-[0.9rem] text-ink-onaction"
      >
        Reintentar
      </button>
    </div>
  );
}
