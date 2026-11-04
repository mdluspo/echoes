import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url), output = new URL('dist/', root);

test('the production build is a complete static game without a server function', async () => {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('scripts/build-static.mjs', root))]);
  const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.buildCommand, 'npm run build');
  assert.deepEqual((await readdir(output)).sort(), ['index.html', 'src']);

  // Crawl the real entry point, module imports, stylesheet imports, and font URLs.
  const visited = new Set();
  async function check(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    assert.ok(url.href.startsWith(output.href), `Dependency must stay inside static output: ${url}`);
    const text = await readFile(url, 'utf8');
    assert.ok(!text.includes("from 'node:"), 'Browser modules must not depend on Node');
    const refs = url.pathname.endsWith('.html')
      ? [...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1])
      : url.pathname.endsWith('.js')
        ? [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1])
        : [...text.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)].map(match => match[1]);
    for (const ref of refs) {
      if (ref.startsWith('data:')) continue;
      const target = ref.startsWith('/') ? new URL(ref.slice(1), output) : new URL(ref, url);
      assert.ok(target.href.startsWith(output.href), `Dependency must stay inside static output: ${target}`);
      if (/\.(html|js|css)$/.test(target.pathname)) await check(target);
      else await access(target);
    }
  }
  await check(new URL('index.html', output));
  assert.ok(visited.has(new URL('src/engine.js', output).href));
  for (const name of ['hamster-idle.png', 'hamster-run.png', 'hamster-jump.png', 'bush-killer-sheet.png', 'meadow-sketch-v1.png']) {
    await access(new URL('src/assets/' + name, output));
  }
  assert.deepEqual((await readdir(new URL('src/assets/', output))).sort(), [
    'bush-killer-frames.js', 'bush-killer-sheet.png', 'fonts',
    'hamster-idle.png', 'hamster-jump.png', 'hamster-run.png', 'meadow-sketch-v1.png',
  ]);
});
