import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'dist');
// Only clean this project's generated output, never a caller-provided directory.
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') {
  throw new Error('Static output must be the project dist directory.');
}
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'src', 'assets', 'fonts'), { recursive: true });
await cp(path.join(root, 'index.html'), path.join(output, 'index.html'));
const runtimeFiles = [
  'art.js', 'bush-sprites.js', 'bush.js', 'engine.js', 'goose.js',
  'hints.js', 'log-motion.js', 'main.js', 'runaway-platform.js',
  'lettering.css', 'style.css', 'theme-type.css',
];
const runtimeAssets = [
  'bush-killer-frames.js', 'bush-killer-sheet.png',
  'hamster-idle.png', 'hamster-jump.png', 'hamster-run.png',
  'meadow-sketch-v1.png',
];
for (const name of runtimeFiles) {
  await cp(path.join(root, 'src', name), path.join(output, 'src', name));
}
for (const name of runtimeAssets) {
  await cp(path.join(root, 'src', 'assets', name), path.join(output, 'src', 'assets', name));
}
for (const name of ['IMFellEnglish-Regular.ttf', 'IMFellEnglish-Italic.ttf', 'OFL.txt']) {
  await cp(path.join(root, 'src', 'assets', 'fonts', name), path.join(output, 'src', 'assets', 'fonts', name));
}
console.log('Static game built in dist/ (HTML, modules, artwork, and fonts).');
