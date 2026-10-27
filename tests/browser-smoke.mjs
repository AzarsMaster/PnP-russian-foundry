import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { characterContext, render } from './helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const context = characterContext();
context.cssClass = '';
const sheet = render('actor/actor-character-sheet.hbs', context);
const hooks = `
  const callbacks = new Map();
  window.Hooks = {
    on(name, callback) {
      if (!callbacks.has(name)) callbacks.set(name, []);
      callbacks.get(name).push(callback);
    },
    once(name, callback) { this.on(name, callback); }
  };
  window.fire = (name, ...args) => {
    for (const callback of callbacks.get(name) ?? []) callback(...args);
  };
  const settings = new Map();
  window.game = {
    version: '14.368', system: { id: 'prowlers-and-paragons' }, i18n: { lang: 'ru' },
    settings: {
      settings,
      register(scope, key, config) { settings.set(scope + '.' + key, config); },
      get(scope, key) { return settings.get(scope + '.' + key)?.default; }
    }
  };
  window.ui = { windows: {} };
  await import('/scripts/main.mjs');
  fire('init');
  fire('ready');
  // Deliberately dispatch the concrete system event only, passing inner content.
  const element = document.querySelector('#sheet');
  fire('renderProwlersParagonsActorSheet', { options: {}, element: { 0: element } },
    { 0: element.querySelector('.window-content') });
  window.initialized = true;
`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      // Test both stylesheet orders: upstream loaded after the module must not
      // restore Bangers/Roboto Condensed on any text container.
      const styles = ['/tests/fixtures/upstream/prowlers-and-paragons.css', '/styles/roboto.css', '/styles/pnp-russian.css'];
      if (url.searchParams.get('systemLast') === '1') styles.push(styles.shift());
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html><head><meta charset="utf-8">${styles.map(p => `<link rel="stylesheet" href="${p}">`).join('')}
        <style>body{margin:20px;background:#eee}#sheet{width:650px}.fas{font-family:'Font Awesome 6 Free'}#unrelated{font-family:serif}</style>
        </head><body><section id="sheet" class="app window-app prowlers-and-paragons sheet actor">
        <header class="window-header"><h4 class="window-title">Armor</h4></header><section class="window-content">${sheet}</section>
        </section><p id="unrelated">Unrelated window</p><script type="module">${hooks}</script></body></html>`);
      return;
    }
    const file = path.resolve(root, `.${url.pathname}`);
    if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
    response.setHeader('content-type', {
      '.mjs': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2'
    }[path.extname(file)] ?? 'text/plain');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const launchOptions = { headless: true };
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
let browser;
try {
  browser = await chromium.launch(launchOptions);
  for (const systemLast of [0, 1]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // The system stylesheet imports Google Fonts; the module must work offline.
    await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/?systemLast=${systemLast}`);
    await page.waitForFunction(() => window.initialized);
    const fonts = await page.evaluate(async () => {
      for (const style of ['400', '700', 'italic 400']) {
        await document.fonts.load(`${style} 16px "PnP Roboto"`, 'Ёё Щщ Йй № ABC');
      }
      await document.fonts.ready;
      const selectors = [
        '#sheet', '.window-title', '.sheet-tabs > a', '.resource-label',
        '.items-header', '.item-name', '.item-prop', '.editor', '.editor h3',
        'input[name="name"]', '.spend-resolve-dropdown'
      ];
      return Object.fromEntries(selectors.map(selector => {
        const element = document.querySelector(selector);
        return [selector, element ? getComputedStyle(element).fontFamily : null];
      }));
    });
    for (const [selector, font] of Object.entries(fonts)) assert.match(font ?? '', /PnP Roboto/, selector);
    assert.equal(await page.locator('.sheet-tabs [data-tab="powers"]').textContent(), 'Силы');
    assert.equal(await page.locator('.sheet-tabs [data-tab="gear"]').textContent(), 'Снаряжение');
    assert.equal(await page.locator('.editor h3').first().textContent(), 'Powers');
    assert.equal(await page.locator('input[name="name"]').inputValue(), 'Armor');
    assert.match(await page.locator('i.fas').first().evaluate(e => getComputedStyle(e).fontFamily), /Font Awesome/);
    assert.doesNotMatch(await page.locator('#unrelated').evaluate(e => getComputedStyle(e).fontFamily), /PnP Roboto/);
    // Recreate a sheet without dispatching any render hook. The DOM attachment
    // fallback must discover the new window and the bounded observer its edits.
    await page.evaluate(() => {
      const clone = document.querySelector('#sheet').cloneNode(true);
      clone.id = 'late-sheet';
      clone.classList.remove('pnp-ru', 'pnp-ru-roboto');
      clone.querySelector('[data-tab="powers"]').textContent = 'Powers';
      document.body.append(clone);
    });
    await page.waitForFunction(() => document.querySelector('#late-sheet [data-tab="powers"]').textContent === 'Силы');
    assert.match(await page.locator('#late-sheet input[name="name"]').evaluate(e => getComputedStyle(e).fontFamily), /PnP Roboto/);
    assert.deepEqual(errors, []);
    if (!systemLast) {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'dist/validation-sheet.png'), fullPage: true });
    }
    console.log(`Chromium: concrete hook, window attachment, Russian tabs and all ${Object.keys(fonts).length} font selectors OK (systemLast=${systemLast})`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
