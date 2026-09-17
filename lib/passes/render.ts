import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { parse, type Font } from "opentype.js";
import sharp from "sharp";

/**
 * Draws the pass a guest shows at the door.
 *
 * Deliberately plain: this is read off a phone screen in a dark entrance by
 * someone holding a scanner, so the code is large, the quiet zone is real, and
 * nothing decorative sits near it. The name lets a human check the two match;
 * the warning is there because a code forwarded to four friends is not a pass.
 *
 * Every glyph is converted to a path before rendering. The first version used
 * SVG <text> with font-family: Helvetica, which worked on a Mac and produced a
 * row of empty boxes in production — a serverless runtime has no system fonts,
 * so the renderer had nothing to resolve the family to. Outlines remove the
 * question entirely: there is no font to find at render time, and the pass
 * looks the same everywhere.
 */

const WIDTH = 760;
const QR_SIZE = 560;
const MARGIN = (WIDTH - QR_SIZE) / 2;

const INK = "#1a1a1a";
const MUTED = "#8a8178";
const PAPER = "#ffffff";

/**
 * Read once per process. The file is ~740 KB and parsing it on every pass would
 * be the slowest thing in the send path by a wide margin.
 */
let cached: Font | null = null;

function font(): Font {
  if (cached) return cached;
  // Resolved from the project root rather than the module, because the compiled
  // module does not live where the source does. `next.config.ts` keeps this
  // file in the deployment bundle.
  const file = path.join(process.cwd(), "lib/passes/fonts/DejaVuSans.ttf");
  cached = parse(
    // A Buffer's underlying ArrayBuffer can be a slice of a larger pool, so the
    // byte range matters: handing over the whole pool parses garbage.
    readFileSync(file).buffer.slice(0) as ArrayBuffer,
  );
  return cached;
}

/**
 * One line of text as an SVG path, centred on `x`.
 *
 * Laid out a glyph at a time rather than through `getPath`, which routes every
 * string through opentype.js's shaping engine — and that engine cannot read
 * every lookup table DejaVu ships ("lookupType: 6 substFormat: 2 is not yet
 * supported") and throws before drawing anything. Walking the characters
 * touches none of it. Ligatures and kerning are lost, which on a name and a
 * one-line warning is nothing to miss.
 */
function measure(parsed: Font, text: string, size: number): number {
  const scale = size / parsed.unitsPerEm;
  let width = 0;
  for (const character of text) {
    // `advanceWidth` is optional in the typings; a glyph without one occupies
    // no space, which is the right answer for the handful that lack it.
    width += (parsed.charToGlyph(character).advanceWidth ?? 0) * scale;
  }
  return width;
}

function line(text: string, x: number, y: number, size: number, fill: string): string {
  const parsed = font();
  const scale = size / parsed.unitsPerEm;
  let cursor = x - measure(parsed, text, size) / 2;

  const parts: string[] = [];
  for (const character of text) {
    const glyph = parsed.charToGlyph(character);
    const data = glyph.getPath(cursor, y, size).toPathData(2);
    // A space has an advance and no outline; skipping the empty `d` keeps the
    // document from filling with useless nodes.
    if (data) parts.push(data);
    cursor += (glyph.advanceWidth ?? 0) * scale;
  }

  return `<path d="${parts.join(" ")}" fill="${fill}" />`;
}

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
  const centre = WIDTH / 2;

  const text = `<svg width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg">
${line(input.eventName.toUpperCase(), centre, 56, 22, MUTED)}
${line(input.label, centre, nameY, nameSize(input.label), INK)}
${line("Código único por invitado, no lo compartas", centre, warnY, 20, MUTED)}
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
