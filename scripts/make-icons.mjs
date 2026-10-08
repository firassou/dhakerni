import sharp from "sharp";
const out = "public/icons";
await sharp(`${out}/icon.svg`).resize(192).png().toFile(`${out}/icon-192.png`);
await sharp(`${out}/icon.svg`).resize(512).png().toFile(`${out}/icon-512.png`);
await sharp(`${out}/icon.svg`).resize(180).png().toFile(`${out}/apple-touch-icon.png`);
await sharp(`${out}/maskable.svg`).resize(512).png().toFile(`${out}/icon-maskable-512.png`);
