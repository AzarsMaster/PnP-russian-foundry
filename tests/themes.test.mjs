import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  registerThemeSettings, selectedSheetTheme, refreshSheetThemes,
  synchronizePersonalTheme, applySheetTheme
} from '../scripts/themes.mjs';

function runtime(t, { world = 'light', saved, cached = 'world' } = {}) {
  const dom = new JSDOM('<div id="actor" class="pnp-ru-sheet"></div><div id="item" class="pnp-ru-sheet"></div><div id="chat" class="pnp-ru"></div>');
  globalThis.document = dom.window.document;
  t.after(() => dom.window.close());
  const definitions = new Map();
  const values = new Map([['worldTheme', world], ['personalTheme', cached]]);
  const callbacks = new Map();
  const flags = new Map([['alice', saved]]);
  const writes = [];
  const user = id => ({
    id,
    getFlag(scope, key) {
      assert.equal(scope, 'pnp-russian'); assert.equal(key, 'sheetTheme');
      return flags.get(id);
    },
    async setFlag(scope, key, value) {
      assert.equal(scope, 'pnp-russian'); assert.equal(key, 'sheetTheme');
      writes.push({ user: id, value }); flags.set(id, value);
    }
  });
  globalThis.Hooks = { on(name, callback) { callbacks.set(name, callback); } };
  globalThis.game = {
    user: user('alice'),
    settings: {
      register(scope, key, config) {
        assert.equal(scope, 'pnp-russian'); definitions.set(key, config);
        if (!values.has(key)) values.set(key, config.default);
      },
      get(_scope, key) { return values.get(key); },
      async set(_scope, key, value) {
        values.set(key, value); await definitions.get(key)?.onChange?.(value);
      }
    }
  };
  registerThemeSettings();
  return { definitions, values, flags, writes, user, callbacks };
}

test('world default and personal override expose the three palettes with separate settings scopes', t => {
  const r = runtime(t);
  const world = r.definitions.get('worldTheme');
  const personal = r.definitions.get('personalTheme');
  assert.equal(world.scope, 'world'); // Foundry authorizes world-setting changes for the GM.
  assert.equal(personal.scope, 'client');
  assert.equal(world.default, 'light');
  assert.equal(personal.default, 'world');
  assert.deepEqual(Object.keys(world.choices), ['dark', 'light', 'green']);
  assert.deepEqual(Object.keys(personal.choices), ['world', 'dark', 'light', 'green']);
  assert.equal(world.requiresReload, undefined);
  assert.equal(personal.requiresReload, undefined);
});

test('a world theme change refreshes all open sheets immediately and does not style chat', async t => {
  runtime(t);
  refreshSheetThemes();
  assert.equal(document.querySelector('#actor').dataset.pnpTheme, 'light');
  await game.settings.set('pnp-russian', 'worldTheme', 'dark');
  assert.equal(document.querySelector('#actor').dataset.pnpTheme, 'dark');
  assert.equal(document.querySelector('#item').dataset.pnpTheme, 'dark');
  assert.equal(document.querySelector('#chat').dataset.pnpTheme, undefined);
});

test('personal override persists in the current User and survives world changes; world option restores inheritance', async t => {
  const r = runtime(t);
  await game.settings.set('pnp-russian', 'personalTheme', 'green');
  assert.deepEqual(r.writes, [{ user: 'alice', value: 'green' }]);
  assert.equal(document.querySelector('#actor').dataset.pnpTheme, 'green');
  await game.settings.set('pnp-russian', 'worldTheme', 'dark');
  assert.equal(selectedSheetTheme(), 'green');
  assert.equal(document.querySelector('#actor').dataset.pnpTheme, 'green');
  await game.settings.set('pnp-russian', 'personalTheme', 'world');
  assert.equal(selectedSheetTheme(), 'dark');
  assert.equal(document.querySelector('#actor').dataset.pnpTheme, 'dark');
});

test('login loads the account preference instead of a different account cached in the same browser', async t => {
  const r = runtime(t, { world: 'dark', saved: 'green', cached: 'light' });
  assert.equal(selectedSheetTheme(), 'green');
  await synchronizePersonalTheme();
  assert.equal(r.values.get('personalTheme'), 'green');
  assert.deepEqual(r.writes, [], 'Synchronizing the settings control must not overwrite the saved preference');
  game.user = r.user('bob');
  await synchronizePersonalTheme();
  assert.equal(r.values.get('personalTheme'), 'world');
  assert.equal(selectedSheetTheme(), 'dark');
  assert.equal(r.flags.get('alice'), 'green');
});

test('a preference changed by the same user on another client refreshes this client only', async t => {
  const r = runtime(t);
  r.flags.set('alice', 'dark');
  r.callbacks.get('updateUser')({ id: 'alice' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(r.values.get('personalTheme'), 'dark');
  assert.equal(document.querySelector('#actor').dataset.pnpTheme, 'dark');
  r.flags.set('bob', 'green');
  r.callbacks.get('updateUser')({ id: 'bob' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(selectedSheetTheme(), 'dark');
  assert.deepEqual(r.writes, []);
});

test('invalid preferences fall back to a supported world theme and never become arbitrary CSS attributes', t => {
  runtime(t, { saved: 'invalid', world: 'green' });
  const root = document.createElement('section');
  root.innerHTML = '<input value="Armor"><p style="color:red">User text</p>';
  const content = root.innerHTML;
  applySheetTheme(root);
  assert.equal(root.dataset.pnpTheme, 'green');
  assert.equal(root.innerHTML, content);
  game.settings.get = () => 'invalid';
  assert.equal(selectedSheetTheme(), 'light');
});
