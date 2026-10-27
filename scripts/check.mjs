import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async p => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const manifest = await readJSON('module.json');
const pkg = await readJSON('package.json');
assert.equal(manifest.id, 'pnp-russian');
assert.equal(manifest.version, pkg.version);
assert.equal(manifest.compatibility.minimum, '13');
assert.equal(manifest.relationships.systems[0].id, 'prowlers-and-paragons');
for (const file of [...manifest.esmodules, ...manifest.styles,
  ...manifest.languages.map(l => l.path), manifest.license, manifest.readme]) {
  await access(path.join(root, file));
}
await readJSON('lang/ru.json');
for (const css of manifest.styles) {
  const source = await readFile(path.join(root, css), 'utf8');
  for (const [, url] of source.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
    assert(!url.startsWith('http'), 'Fonts must be local');
    const data = await readFile(path.resolve(root, path.dirname(css), url));
    assert.equal(data.subarray(0, 4).toString(), 'wOF2', 'Valid WOFF2 signature');
  }
}
for (const file of await readdir(path.join(root, 'scripts'))) {
  if (!file.endsWith('.mjs')) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(root, 'scripts', file)], { stdio: 'inherit' });
  assert.equal(result.status, 0, `${file} syntax`);
}
console.log('Manifest, JSON, local fonts, runtime and build script syntax: OK');
