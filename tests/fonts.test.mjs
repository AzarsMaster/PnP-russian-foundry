import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  fontChoices, applyFont, refreshFonts, refreshFontChoices,
  registerFontSettings, initializeFonts
} from '../scripts/fonts.mjs';

function runtime(t, { fonts = {}, custom = {}, selected = 'Roboto', api } = {}) {
  const dom = new JSDOM('<section id="sheet" class="pnp-ru"></section><section id="chat" class="pnp-ru"></section><aside id="unrelated"></aside>');
  globalThis.document = dom.window.document;
  globalThis.CONFIG = { fontDefinitions: fonts };
  globalThis.foundry = { applications: { settings: { menus: { FontConfig: api } } } };
  delete globalThis.FontConfig;
  t.after(() => dom.window.close());
  const values = new Map([['core.fonts', custom], ['pnp-russian.sheetFont', selected]]);
  const definitions = new Map([['core.fonts', { scope: 'world' }]]);
  const callbacks = new Map();
  const writes = [];
  globalThis.Hooks = {
    on(name, callback) {
      if (!callbacks.has(name)) callbacks.set(name, []);
      callbacks.get(name).push(callback);
    }
  };
  globalThis.game = {
    i18n: { localize: key => key === 'PNP_RU.Fonts.RobotoDefault' ? 'Roboto (по умолчанию)' : key },
    settings: {
      settings: definitions,
      register(scope, key, options) { definitions.set(`${scope}.${key}`, options); },
      get(scope, key) { return values.get(`${scope}.${key}`) ?? definitions.get(`${scope}.${key}`)?.default; },
      async set(scope, key, value) {
        const name = `${scope}.${key}`;
        writes.push({ name, value }); values.set(name, value);
        await definitions.get(name)?.onChange?.(value);
      }
    }
  };
  return {
    dom, definitions, values, callbacks, writes,
    fire(name, ...args) { for (const callback of callbacks.get(name) ?? []) callback(...args); }
  };
}

test('FontConfig choices are authoritative, default Roboto is labeled once, and icon families are omitted', t => {
  const api = {
    getAvailableFontChoices() {
      assert.equal(this, api);
      return { Signika: 'Signika', 'World Font': 'World font label', Roboto: 'Roboto', 'PnP Roboto': 'Internal Roboto', 'Font Awesome 6 Free': 'Icons' };
    }
  };
  runtime(t, { api, fonts: { 'Failed Font': { editor: true } }, custom: { 'Not Loaded Yet': { editor: true } } });
  const choices = fontChoices();
  assert.equal(choices.Roboto, 'Roboto (по умолчанию)');
  assert.equal(Object.keys(choices)[0], 'Roboto');
  assert.deepEqual(Object.keys(choices).sort(), ['Roboto', 'Signika', 'World Font'].sort());
  assert.equal(choices['World Font'], 'World font label');
});

test('public getAvailableFonts array supports FontConfig variants without choices API', t => {
  runtime(t, { api: { getAvailableFonts: () => ['Signika', 'Arial', 'Signika', ' roboto ', 'Material Icons', 'Material Symbols Outlined'] } });
  assert.deepEqual(Object.keys(fontChoices()), ['Roboto', 'Arial', 'Signika']);
});

test('v13 fallback merges world definitions over CONFIG and excludes disabled or undeclared editor fonts', t => {
  runtime(t, {
    fonts: { Arial: { editor: true }, Disabled: { editor: false }, Overridden: { editor: true }, Unspecified: {}, 'FontAwesome': { editor: true } },
    custom: { 'World Cyrillic': { editor: true }, Overridden: { editor: false }, 'World Canvas Only': { editor: false } }
  });
  assert.deepEqual(Object.keys(fontChoices()), ['Roboto', 'Arial', 'World Cyrillic']);
});

test('FontConfig not yet initialized falls back safely and later ready refresh discovers loaded fonts', t => {
  const api = { getAvailableFontChoices() { throw new Error('Fonts still initializing'); } };
  const r = runtime(t, { api, fonts: { Arial: { editor: true } } });
  registerFontSettings();
  assert.deepEqual(Object.keys(r.definitions.get('pnp-russian.sheetFont').choices), ['Roboto', 'Arial']);
  api.getAvailableFontChoices = () => ({ 'Late Module Font': 'Late Module Font' });
  initializeFonts();
  assert.deepEqual(Object.keys(r.definitions.get('pnp-russian.sheetFont').choices), ['Roboto', 'Late Module Font']);
});

test('font setting is a client dropdown defaulting to Roboto, with no checkbox or reload requirement', t => {
  const r = runtime(t);
  registerFontSettings();
  const config = r.definitions.get('pnp-russian.sheetFont');
  assert.equal(config.type, String);
  assert.equal(config.scope, 'client');
  assert.equal(config.default, 'Roboto');
  assert.equal(config.config, true);
  assert.equal(config.requiresReload, undefined);
  assert.equal(config.choices.Roboto, 'Roboto (по умолчанию)');
  assert.equal(r.definitions.has('pnp-russian.roboto'), false);
});

for (const hook of ['renderSettingsConfig', 'renderSettingsConfigV2']) {
  test(`${hook} refreshes actual first-open dropdown after late fonts, preserving selection and listeners`, t => {
    const available = { Arial: 'Arial' };
    const r = runtime(t, { selected: 'Late Font', api: { getAvailableFontChoices: () => available } });
    registerFontSettings();
    const form = document.createElement('form');
    form.innerHTML = '<select name="pnp-russian.sheetFont"><option value="Roboto">Old default</option></select><input name="unrelated" value="User text">';
    const select = form.querySelector('select');
    let changes = 0;
    select.addEventListener('change', () => changes++);
    available['Late Font'] = 'Late Font';
    available['<img src=x>'] = '<img src=x>';
    r.fire(hook, {}, hook === 'renderSettingsConfig' ? { 0: form } : form);
    assert.equal(select.value, 'Late Font');
    assert.ok([...select.options].some(option => option.value === 'Late Font'));
    assert.equal(select.options[0].textContent, 'Roboto (по умолчанию)');
    assert.equal(form.querySelector('img'), null, 'Font names must be option text, never parsed as HTML');
    assert.equal(form.querySelector('input').value, 'User text');
    assert.equal(r.definitions.get('pnp-russian.sheetFont').choices['Late Font'], 'Late Font');
    select.dispatchEvent(new r.dom.window.Event('change'));
    assert.equal(changes, 1);
    assert.deepEqual(r.writes, []);
  });
}

test('font changes update all decorated open roots and new roots while unrelated UI remains unchanged', async t => {
  runtime(t, { api: { getAvailableFonts: () => ['Arial'] } });
  registerFontSettings();
  refreshFonts();
  const sheet = document.querySelector('#sheet');
  const chat = document.querySelector('#chat');
  assert.match(sheet.style.getPropertyValue('--pnp-font-family'), /^"PnP Roboto"/);
  await game.settings.set('pnp-russian', 'sheetFont', 'Arial');
  for (const root of [sheet, chat]) {
    assert.ok(root.classList.contains('pnp-ru-font'));
    assert.match(root.style.getPropertyValue('--pnp-font-family'), /^"Arial", "PnP Roboto", sans-serif$/);
  }
  assert.equal(document.querySelector('#unrelated').getAttribute('style'), null);
  const future = document.createElement('section');
  applyFont(future);
  assert.equal(future.style.getPropertyValue('--pnp-font-family'), sheet.style.getPropertyValue('--pnp-font-family'));
});

test('missing saved font falls back without rewriting the preference and is restored when loading finishes', t => {
  const available = {};
  const r = runtime(t, { selected: 'Temporarily Missing', api: { getAvailableFontChoices: () => available } });
  const events = new r.dom.window.EventTarget();
  Object.defineProperty(document, 'fonts', { value: events });
  registerFontSettings();
  initializeFonts();
  const sheet = document.querySelector('#sheet');
  assert.match(sheet.style.getPropertyValue('--pnp-font-family'), /^"PnP Roboto"/);
  assert.equal(game.settings.get('pnp-russian', 'sheetFont'), 'Temporarily Missing');
  available['Temporarily Missing'] = 'Temporarily Missing';
  events.dispatchEvent(new r.dom.window.Event('loadingdone'));
  assert.match(sheet.style.getPropertyValue('--pnp-font-family'), /^"Temporarily Missing"/);
  assert.equal(refreshFontChoices()['Temporarily Missing'], 'Temporarily Missing');
  assert.deepEqual(r.writes, []);
});

test('unusual family names are CSS string values, control-character names are rejected, and content is preserved', t => {
  const unusual = 'A "Quoted"; --injected: red; Font';
  runtime(t, { selected: unusual, api: { getAvailableFonts: () => [unusual, 'Invalid\nFamily', 'Invalid\u0000Family', ''] } });
  const root = document.querySelector('#sheet');
  root.innerHTML = '<input name="name" value="Arial"><p style="color:red">User text</p><i class="fas fa-dice"></i>';
  const before = root.innerHTML;
  applyFont(root);
  assert.equal(root.innerHTML, before);
  assert.equal(root.style.getPropertyValue('--injected'), '');
  assert.equal(root.style.length, 1);
  assert.equal(root.style.getPropertyValue('--pnp-font-family'), `${JSON.stringify(unusual)}, "PnP Roboto", sans-serif`);
  assert.deepEqual(Object.keys(fontChoices()), ['Roboto', unusual]);
});
