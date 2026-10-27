import { mkdir, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'module.json'), 'utf8'));
const dist = path.join(root, 'dist');
const stage = path.join(dist, manifest.id);
await mkdir(dist, { recursive: true });
await rm(stage, { recursive: true, force: true });
await mkdir(stage);
// Explicit runtime allowlist: no node_modules, tests, credentials or dev scripts.
for (const file of ['module.json', 'lang', 'styles', 'fonts', 'README.md', 'LICENSE', 'THIRD_PARTY.md']) {
  await cp(path.join(root, file), path.join(stage, file), { recursive: true });
}
await mkdir(path.join(stage, 'scripts'));
for (const file of ['main.mjs', 'ui.mjs', 'ui-strings.mjs']) {
  await cp(path.join(root, 'scripts', file), path.join(stage, 'scripts', file));
}
await cp(path.join(root, 'docs'), path.join(stage, 'docs'), { recursive: true });
const zipName = `${manifest.id}.zip`;
await rm(path.join(dist, zipName), { force: true });
const result = spawnSync('zip', ['-qr', zipName, manifest.id], { cwd: dist, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await cp(path.join(root, 'module.json'), path.join(dist, 'module.json'));
const hash = createHash('sha256').update(await readFile(path.join(dist, zipName))).digest('hex');
await writeFile(path.join(dist, 'SHA256SUMS'), `${hash}  ${zipName}\n`);
console.log(`Built dist/${zipName} and dist/module.json (${manifest.version})`);
