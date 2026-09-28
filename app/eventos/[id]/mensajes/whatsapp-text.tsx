/**
 * Text the way WhatsApp shows it: line breaks kept and *asterisks* as bold.
 * Only bold, because it is the only mark these messages use on purpose — the
 * title — and a stray underscore in someone's message should not turn a
 * preview into italics that the phone may not show.
 */
export function WhatsAppText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <p className="whitespace-pre-line">
      {parts.map((part, i) =>
        /^\*[^*\n]+\*$/.test(part) ? (
          <strong key={i} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}
