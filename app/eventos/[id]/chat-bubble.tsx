"use client";

/** The WhatsApp bubble, shared by the canned preview and the live rehearsal. */
export function Bubble({
  from,
  padded = true,
  children,
}: {
  from: "me" | "them";
  padded?: boolean;
  children: React.ReactNode;
}) {
  const mine = from === "me";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg text-[0.8rem] leading-relaxed text-[#111b21] shadow-sm ${
          padded ? "px-2.5 py-1.5" : "p-1"
        } ${mine ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white"}`}
      >
        {children}
      </div>
    </div>
  );
}

/** The chat wallpaper and header, so both panels read as the same phone. */
export function Phone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[22rem] overflow-hidden rounded-2xl border border-line shadow-sm">
      <div className="flex items-center gap-2.5 bg-[#075e54] px-3.5 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/25 text-[0.7rem] font-medium text-white">
          {(title[0] ?? "?").toUpperCase()}
        </span>
        <span className="truncate text-[0.85rem] font-medium text-white">{title}</span>
      </div>
      <div className="space-y-2 bg-[#e5ddd5] px-3 py-3.5">{children}</div>
    </div>
  );
}
