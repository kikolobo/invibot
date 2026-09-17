import QRCode from "qrcode";
import sharp from "sharp";

/**
 * Draws the pass a guest shows at the door.
 *
 * Deliberately plain. This is read by a phone screen in a dark entrance by
 * someone holding a scanner, so the code is large, the quiet zone is real, and
 * nothing decorative sits near it. The name is there so a human can check the
 * two match; the warning is there because a code that gets forwarded to four
 * friends is not a pass.
 */

const WIDTH = 760;
const QR_SIZE = 560;
const MARGIN = (WIDTH - QR_SIZE) / 2;

const INK = "#1a1a1a";
const MUTED = "#8a8178";
const PAPER = "#ffffff";

/** XML-escapes a name before it goes into an SVG. "Ana & José" must not break the document. */
const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Long names shrink rather than run off the card. */
function nameSize(name: string): number {
  if (name.length <= 18) return 44;
  if (name.length <= 26) return 36;
  return 30;
}

export async function renderPass(input: {
  code: string;
  label: string;
  eventName: string;
}): Promise<Buffer> {
  const qr = await QRCode.toBuffer(input.code, {
    type: "png",
    width: QR_SIZE,
    // The quiet zone is drawn by the layout below, not by the encoder, so the
    // code sits where the composite expects it.
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: INK, light: PAPER },
  });

  const top = 96;
  const nameY = top + QR_SIZE + 78;
  const warnY = nameY + 40;
  const height = warnY + 60;

  const text = `<svg width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text x="${WIDTH / 2}" y="56" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="24" fill="${MUTED}" letter-spacing="1.5">${xml(input.eventName.toUpperCase())}</text>
  <text x="${WIDTH / 2}" y="${nameY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="${nameSize(input.label)}" fill="${INK}">${xml(input.label)}</text>
  <text x="${WIDTH / 2}" y="${warnY}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="21" fill="${MUTED}">Código único por invitado, no lo compartas</text>
</svg>`;

  return sharp({
    create: { width: WIDTH, height, channels: 3, background: PAPER },
  })
    .composite([
      { input: qr, top, left: Math.round(MARGIN) },
      { input: Buffer.from(text), top: 0, left: 0 },
    ])
    // PNG keeps the code's edges crisp; a JPEG at this size would ring around
    // every module and scanners notice.
    .png({ compressionLevel: 9 })
    .toBuffer();
}
