// Builds the app icons from assets/logo.svg: the cream checklist and saffron bell on the app's terracotta.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import sharp from "sharp";

const TERRACOTTA = { r: 0xab, g: 0x49, b: 0x27 };
const SRC = "assets/logo.svg";
const out = "public/icons";

/** The glyph is drawn as SVG (assets/logo.svg), so every size is rendered sharp rather than resampled. */
const glyphSvg = readFileSync(SRC);

/** Rounded-corner mask, the same 22.5% radius as the logo tile. */
const corners = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.225}"/></svg>`,
  );

/** Square icon: terracotta field, glyph scaled to `scale` of the canvas and centered. */
async function render(size, scale, file, round = false) {
  const g = Math.round(size * scale);
  const sized = await sharp(glyphSvg, { density: Math.max(72, Math.round((72 * g) / 64) * 2) })
    .resize(g, g)
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: TERRACOTTA } })
    .composite([{ input: sized, gravity: "center" }])
    .png()
    .toBuffer()
    .then((square) =>
      round
        ? sharp(square)
            .composite([{ input: corners(size), blend: "dest-in" }])
            .png()
            .toFile(`${out}/${file}`)
        : sharp(square).toFile(`${out}/${file}`),
    );
}

// Rounded where the icon is shown as is (tab, header, install list); square where the OS applies its own mask.
await render(192, 1, "icon-192.png", true);
await render(512, 1, "icon-512.png", true);
await render(180, 1, "apple-touch-icon.png");
await render(512, 0.7, "icon-maskable-512.png"); // glyph kept inside the maskable safe zone

/**
 * App Router icon files. Next.js links these itself, with a content hash in the URL so browsers and CDNs
 * pick up a new icon immediately:
 *   src/app/favicon.ico   what browsers request by default (16, 32, 48 px)
 *   src/app/icon.png      the tab icon for modern browsers
 *   src/app/apple-icon.png  the iPhone/iPad Home Screen icon
 */
// A tab icon never needs 512 px; the smaller file also keeps the page light.
copyFileSync(`${out}/icon-192.png`, "src/app/icon.png");
copyFileSync(`${out}/apple-touch-icon.png`, "src/app/apple-icon.png");

const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((n) => sharp(`${out}/icon-512.png`).resize(n, n).png({ palette: true }).toBuffer()),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0); // width
  e.writeUInt8(sizes[i], 1); // height
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));
