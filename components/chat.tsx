/**
 * Chat mockups for the marketing page. Deliberately styled with our own palette
 * rather than WhatsApp's exact colours and marks — it should read as a messaging
 * thread without being a clone of their brand.
 */

export type Line = {
  side: "in" | "out";
  text?: string;
  time: string;
  /** Renders a miniature invitation card above the text. */
  card?: { hosts: string; kind: string; date: string; venue: string };
  /** Renders as a muted system note instead of a bubble. */
  note?: boolean;
};

function InviteCard({ card }: { card: NonNullable<Line["card"]> }) {
  return (
    <div className="mb-2 overflow-hidden rounded-lg bg-paper px-4 py-5 text-center">
      <p className="font-display text-[0.6rem] uppercase tracking-[0.2em] text-ink-muted">
        {card.kind}
      </p>
      <p className="mt-2 font-display text-xl leading-tight text-ink">{card.hosts}</p>
      <div className="mx-auto my-2.5 h-px w-8 bg-action/40" />
      <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-soft">
        {card.date}
      </p>
      <p className="mt-1 text-[0.65rem] text-ink-muted">{card.venue}</p>
    </div>
  );
}

function Bubble({ line }: { line: Line }) {
  if (line.note) {
    return (
      <p className="my-1 text-center text-[0.7rem] leading-relaxed text-chat-soft/70">
        {line.text}
      </p>
    );
  }

  const out = line.side === "out";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[0.82rem] leading-snug ${
          out
            ? "rounded-br-sm bg-bubble-out text-chat-text"
            : "rounded-bl-sm bg-bubble-in text-chat-text"
        }`}
      >
        {line.card && <InviteCard card={line.card} />}
        {line.text && <p className="whitespace-pre-line">{line.text}</p>}
        <p
          className={`mt-1 text-[0.6rem] ${
            out ? "text-right text-chat-text/45" : "text-chat-soft/60"
          }`}
        >
          {line.time}
          {out && " ✓✓"}
        </p>
      </div>
    </div>
  );
}

export function Phone({
  title,
  subtitle,
  lines,
  className = "",
}: {
  title: string;
  subtitle: string;
  lines: Line[];
  className?: string;
}) {
  return (
    <div
      className={`w-full max-w-[19rem] overflow-hidden rounded-[1.75rem] border border-chat-line bg-chat-surface shadow-2xl shadow-black/40 ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-chat-line bg-chat-raised px-4 py-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chat-gold/20 font-display text-sm text-chat-gold">
          {title.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[0.8rem] font-medium text-chat-text">{title}</p>
          <p className="truncate text-[0.65rem] text-chat-soft">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 py-4">
        {lines.map((line, i) => (
          <Bubble key={i} line={line} />
        ))}
      </div>
    </div>
  );
}
