import fs from 'node:fs';

const globalCss = fs.readFileSync('src/index.css', 'utf8');
const panelCss = fs.readFileSync('src/components/PhysicsPanel.module.css', 'utf8');

if (!/@media \(prefers-reduced-motion: reduce\)/.test(globalCss))
  throw new Error('Global reduced-motion media query is missing.');
for (const declaration of [
  'animation-duration: 0.01ms !important',
  'animation-iteration-count: 1 !important',
  'transition-duration: 0.01ms !important',
])
  if (!globalCss.includes(declaration))
    throw new Error(`Reduced-motion rule is missing '${declaration}'.`);
if (/\banimation\s*:/.test(panelCss))
  throw new Error('PhysicsPanel.module.css introduces animation without a local motion audit.');

const token = (name) => {
  const match = globalCss.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!match) throw new Error(`Missing CSS token --${name}.`);
  return match[1];
};

for (const foreground of ['text', 'text-muted', 'gold', 'console-err', 'console-ok']) {
  const ratio = contrastRatio(token(foreground), token('bg-panel'));
  if (ratio < 4.5)
    throw new Error(`--${foreground} contrast is ${ratio.toFixed(2)}; expected 4.5.`);
}

console.log('Physics accessibility CSS checks passed.');

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex
      .slice(1)
      .match(/../g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].toSorted((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
