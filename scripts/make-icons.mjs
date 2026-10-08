// Builds the app icons from assets/icon-source.png (white glyph on a purple field).
// The glyph is lifted out by its distance from the purple, then drawn white on the app's door-blue.
import { writeFileSync, copyFileSync } from "node:fs";
import sharp from "sharp";

const BLUE = { r: 0x21, g: 0x52, b: 0xd1 };
const SRC = "assets/icon-source.png";
const out = "public/icons";

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// Green channel separates white (255) from the purple field (~135).
const bg = data[1];
const glyph = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  const m = Math.max(0, Math.min(1, (data[i * 4 + 1] - bg) / (255 - bg)));
  glyph[i * 4] = glyph[i * 4 + 1] = glyph[i * 4 + 2] = 255;
  glyph[i * 4 + 3] = Math.round(m * 255);
}
const glyphPng = await sharp(glyph, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toBuffer();

/** Square icon: blue field, glyph scaled to `scale` of the canvas and centered. */
async function render(size, scale, file) {
  const g = Math.round(size * scale);
  const sized = await sharp(glyphPng).resize(g, g).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: BLUE } })
    .composite([{ input: sized, gravity: "center" }])
    .png()
    .toFile(`${out}/${file}`);
}

await render(192, 1, "icon-192.png");
await render(512, 1, "icon-512.png");
await render(180, 1, "apple-touch-icon.png");
await render(512, 0.7, "icon-maskable-512.png"); // glyph kept inside the maskable safe zone
await render(64, 1, "favicon.png");

/**
 * App Router icon files. Next.js links these itself, with a content hash in the URL so browsers and CDNs
 * pick up a new icon immediately:
 *   src/app/favicon.ico   what browsers request by default (16, 32, 48 px)
 *   src/app/icon.png      the tab icon for modern browsers
 *   src/app/apple-icon.png  the iPhone/iPad Home Screen icon
 */
copyFileSync(`${out}/icon-512.png`, "src/app/icon.png");
copyFileSync(`${out}/apple-touch-icon.png`, "src/app/apple-icon.png");

const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((n) => sharp(`${out}/icon-512.png`).resize(n, n).png().toBuffer()),
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

// ---- Android app (android/): launcher icons in every density ----
// Legacy square and round icons, plus the adaptive pair: a transparent foreground holding the glyph inside
// the middle two thirds (launchers crop the rest into their own shape) over a plain blue background.
const res = "android/app/src/main/res";
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const square = await sharp({
    create: { width: legacy, height: legacy, channels: 4, background: { ...BLUE, alpha: 1 } },
  })
    .composite([{ input: await sharp(glyphPng).resize(legacy, legacy).png().toBuffer() }])
    .png()
    .toBuffer();
  const rounded = (radius) =>
    Buffer.from(
      `<svg width="${legacy}" height="${legacy}"><rect width="${legacy}" height="${legacy}" rx="${radius}" ry="${radius}"/></svg>`,
    );
  await sharp(square)
    .composite([{ input: rounded(legacy * 0.22), blend: "dest-in" }])
    .toFile(`${res}/mipmap-${name}/ic_launcher.png`);
  await sharp(square)
    .composite([{ input: rounded(legacy / 2), blend: "dest-in" }])
    .toFile(`${res}/mipmap-${name}/ic_launcher_round.png`);

  const layer = Math.round(108 * k);
  const g = Math.round(layer * 0.6);
  await sharp({
    create: {
      width: layer,
      height: layer,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await sharp(glyphPng).resize(g, g).png().toBuffer(), gravity: "center" }])
    .png()
    .toFile(`${res}/mipmap-${name}/ic_launcher_foreground.png`);
}
