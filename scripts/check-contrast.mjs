import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");
const colors = Object.fromEntries([...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map(([, name, hex]) => [name, hex]));
function luminance(name) {
  assert.ok(colors[name], `Couleur manquante : ${name}`);
  const channels = colors[name].slice(1).match(/../g).map((hex) => {
    const channel = parseInt(hex, 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
const checks = [];
const surfaces = ["background-primary", "background-secondary", "surface", "surface-hover"];
for (const background of surfaces) {
  for (const foreground of ["text-primary", "text-secondary", "text-subtle", "accent"]) checks.push([foreground, background, 4.5]);
  checks.push(["focus", background, 3], ["control-border", background, 3]);
}
checks.push(["on-accent", "accent", 4.5], ["on-accent", "accent-hover", 4.5]);
let minimumText = Infinity;
let minimumUI = Infinity;
for (const [foreground, background, minimum] of checks) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  const ratio = (values[0] + .05) / (values[1] + .05);
  assert.ok(ratio >= minimum, `${foreground} sur ${background} : ${ratio.toFixed(2)}:1, minimum ${minimum}:1`);
  if (minimum === 4.5) minimumText = Math.min(minimumText, ratio);
  else minimumUI = Math.min(minimumUI, ratio);
}
console.log(`${checks.length} contrastes vérifiés. Minimum texte : ${minimumText.toFixed(2)}:1 ; focus et contours de contrôles : ${minimumUI.toFixed(2)}:1.`);
