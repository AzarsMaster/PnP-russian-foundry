import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { characterContext, render } from './helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'module.json'), 'utf8'));
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
  const values = new Map();
  const profile = new Map();
  window.themeProfile = profile;
  window.worldFonts = { Arial: 'Arial', 'World Test Font': 'World Test Font' };
  window.foundry = { applications: { settings: { menus: { FontConfig: {
    getAvailableFontChoices() { return { ...window.worldFonts }; }
  } } } } };
  window.game = {
    version: '14.368', system: { id: 'prowlers-and-paragons' }, i18n: { lang: 'ru' },
    user: { id: 'alice', getFlag(_scope, key) { return profile.get(key); },
      async setFlag(_scope, key, value) { profile.set(key, value); } },
    settings: {
      settings,
      register(scope, key, config) { settings.set(scope + '.' + key, config); },
      get(scope, key) { return values.has(key) ? values.get(key) : settings.get(scope + '.' + key)?.default; },
      async set(scope, key, value) { values.set(key, value); await settings.get(scope + '.' + key)?.onChange?.(value); }
    }
  };
  window.setWorldTheme = value => game.settings.set('pnp-russian', 'worldTheme', value);
  window.setPersonalTheme = value => game.settings.set('pnp-russian', 'personalTheme', value);
  window.setSheetFont = value => game.settings.set('pnp-russian', 'sheetFont', value);
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
      const styles = ['/tests/fixtures/upstream/prowlers-and-paragons.css', ...manifest.styles.map(file => `/${file}`)];
      if (url.searchParams.get('systemLast') === '1') styles.push(styles.shift());
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html><head><meta charset="utf-8">${styles.map(p => `<link rel="stylesheet" href="${p}">`).join('')}
        <style>@font-face{font-family:'World Test Font';src:url('/fonts/roboto-latin-wght-normal.woff2')}body{margin:20px;background:#eee}#sheet{width:650px}.fas{font-family:'Font Awesome 6 Free'}#unrelated{font-family:serif}</style>
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
    assert.equal(await page.locator('#sheet').getAttribute('data-pnp-theme'), 'light');
    await page.evaluate(() => {
      const span = document.createElement('span');
      span.id = 'authored-color'; span.style.color = '#bb2244'; span.textContent = 'Authored color';
      document.querySelector('.editor-content').append(span);
      document.querySelector('.sheet-tabs a').classList.add('active');
    });
    for (const theme of ['dark', 'light', 'green', 'red', 'blue', 'purple']) {
      await page.evaluate(value => window.setWorldTheme(value), theme);
      assert.equal(await page.locator('#sheet').getAttribute('data-pnp-theme'), theme);
      // PnP animates item/control colors for 200 ms; measure the selected
      // palette after those existing CSS transitions finish.
      await page.evaluate(async () => {
        getComputedStyle(document.querySelector('.item-name')).color;
        await Promise.allSettled(document.getAnimations().map(animation => animation.finished));
      });
      const contrasts = await page.evaluate(() => {
        function luminance(color) {
          const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
            v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        }
        const pairs = [
          ['.window-content', '.window-content'], ['input[name="name"]', 'input[name="name"]'],
          ['.sheet-header .resource-label', '.sheet-header'], ['.items-header .item-name', '.items-header'],
          ['.items-list .item-name', '.items-list'], ['button', 'button'],
          ['.sheet-tabs a.active', '.sheet-tabs a.active'], ['.editor-content', '.editor-content']
        ];
        return pairs.map(([text, surface]) => {
          const foreground = luminance(getComputedStyle(document.querySelector(text)).color);
          const background = luminance(getComputedStyle(document.querySelector(surface)).backgroundColor);
          return { selector: text, ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
        });
      });
      for (const { selector, ratio } of contrasts) assert.ok(ratio >= 4.5, `${theme} ${selector}: ${ratio.toFixed(2)} contrast`);
      assert.equal(await page.locator('#authored-color').evaluate(e => getComputedStyle(e).color), 'rgb(187, 34, 68)');
      assert.equal(await page.locator('#unrelated').getAttribute('data-pnp-theme'), null);
      if (!systemLast) {
        await mkdir(path.join(root, 'dist'), { recursive: true });
        await page.locator('#sheet').screenshot({ path: path.join(root, `dist/validation-theme-${theme}.png`) });
      }
    }
    await page.evaluate(() => window.setPersonalTheme('dark'));
    await page.evaluate(() => window.setWorldTheme('light'));
    assert.equal(await page.locator('#sheet').getAttribute('data-pnp-theme'), 'dark', 'Personal choice overrides world changes');
    assert.equal(await page.evaluate(() => window.themeProfile.get('sheetTheme')), 'dark');
    // Recreate a sheet without dispatching any render hook. The DOM attachment
    // fallback must discover the new window and the bounded observer its edits.
    await page.evaluate(() => {
      const clone = document.querySelector('#sheet').cloneNode(true);
      clone.id = 'late-sheet';
      clone.classList.remove('pnp-ru', 'pnp-ru-font');
      clone.querySelector('[data-tab="powers"]').textContent = 'Powers';
      document.body.append(clone);
    });
    await page.waitForFunction(() => document.querySelector('#late-sheet [data-tab="powers"]').textContent === 'Силы');
    assert.match(await page.locator('#late-sheet input[name="name"]').evaluate(e => getComputedStyle(e).fontFamily), /PnP Roboto/);
    assert.equal(await page.locator('#late-sheet').getAttribute('data-pnp-theme'), 'dark');
    await page.evaluate(() => window.setPersonalTheme('world'));
    assert.equal(await page.locator('#sheet').getAttribute('data-pnp-theme'), 'light');
    assert.equal(await page.locator('#late-sheet').getAttribute('data-pnp-theme'), 'light');
    // The list comes from the world's FontConfig and is refreshed for the
    // first settings render, including fonts registered after ready.
    await page.evaluate(() => {
      window.worldFonts['Courier New'] = 'Courier New';
      const form = document.createElement('form');
      form.id = 'font-settings';
      form.innerHTML = '<select name="pnp-russian.sheetFont"><option value="stale">Stale list</option></select>';
      document.body.append(form);
      fire('renderSettingsConfig', {}, form);
    });
    const options = await page.locator('#font-settings option').evaluateAll(elements => elements.map(e => [e.value, e.textContent]));
    assert.deepEqual(options, [['Roboto', 'Roboto (по умолчанию)'], ['Arial', 'Arial'], ['Courier New', 'Courier New'], ['World Test Font', 'World Test Font']]);
    await page.evaluate(() => window.setSheetFont('World Test Font'));
    await page.evaluate(() => document.fonts.load('16px "World Test Font"', 'World test'));
    for (const selector of ['#sheet input[name="name"]', '#sheet .sheet-tabs a', '#sheet .items-header', '#late-sheet input[name="name"]']) {
      assert.match(await page.locator(selector).first().evaluate(e => getComputedStyle(e).fontFamily), /^"World Test Font"/);
    }
    assert.match(await page.locator('#sheet i.fas').first().evaluate(e => getComputedStyle(e).fontFamily), /Font Awesome/);
    assert.doesNotMatch(await page.locator('#unrelated').evaluate(e => getComputedStyle(e).fontFamily), /World Test Font/);
    await page.evaluate(() => window.setSheetFont('Roboto'));
    assert.match(await page.locator('#sheet input[name="name"]').evaluate(e => getComputedStyle(e).fontFamily), /^"PnP Roboto"/);
    assert.deepEqual(errors, []);
    if (!systemLast) {
      await mkdir(path.join(root, 'dist'), { recursive: true });
      await page.screenshot({ path: path.join(root, 'dist/validation-sheet.png'), fullPage: true });
    }
    console.log(`Chromium: Russian tabs, ${Object.keys(fonts).length} font selectors, 6 palettes/contrast, world font dropdown/live selection, personal themes and new windows OK (systemLast=${systemLast})`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
