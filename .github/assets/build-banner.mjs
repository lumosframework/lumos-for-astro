// Rebuilds banner.png from logo.svg and lumi.svg. Run from the repository
// root, so that `sharp` and the asset paths resolve:
//
//   node .github/assets/build-banner.mjs

import sharp from "sharp";

const W = 1180, H = 400;
const base = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" rx="28" fill="#1E1E1E"/>
  <text x="196" y="192" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="62" font-weight="700" fill="#FFFFFF">Lumos For Astro</text>
  <text x="198" y="244" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="27" font-weight="400" fill="#A0A3A0">Components and styling for Astro sites.</text>
</svg>`);

const logo = await sharp(".github/assets/logo.svg", { density: 600 })
  .resize({ width: 104 }).png().toBuffer();
const lumi = await sharp(".github/assets/lumi.svg", { density: 300 })
  .resize({ height: 320 }).png().toBuffer();
const lm = await sharp(lumi).metadata();

await sharp(base)
  .composite([
    { input: logo, left: 68, top: 148 },
    { input: lumi, left: W - lm.width - 44, top: Math.round((H - 320) / 2) },
  ])
  .png().toFile(".github/assets/banner.png");

console.log("lumi:", lm.width + "x" + lm.height);
const b = await sharp(".github/assets/banner.png").metadata();
console.log("banner:", b.width + "x" + b.height);
