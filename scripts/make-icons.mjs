// Builds the app icons from assets/icon-source.png (white glyph on a purple field).
// The glyph is lifted out by its distance from the purple, then drawn white on the app's door-blue.
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
