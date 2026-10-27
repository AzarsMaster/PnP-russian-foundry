import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { render, difficulty, localize } from './helpers.mjs';

let imports = 0;
async function runtime(t, { generation = 14, lang = 'ru', system = 'prowlers-and-paragons' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { window } = dom;
  const callbacks = new Map();
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.Hooks = {
    on(name, callback) {
      if (!callbacks.has(name)) callbacks.set(name, []);
      callbacks.get(name).push({ callback });
    },
    once(name, callback) {
      this.on(name, callback);
      callbacks.get(name).at(-1).once = true;
    }
  };
  const fire = (name, ...args) => {
    for (const entry of [...(callbacks.get(name) ?? [])]) {
      entry.callback(...args);
      if (entry.once) callbacks.set(name, callbacks.get(name).filter(c => c !== entry));
    }
  };
  const settings = new Map();
  globalThis.game = {
    system: { id: system }, version: `${generation}.999`, i18n: { lang, localize },
    settings: {
      settings,
      register(scope, key, options) { settings.set(`${scope}.${key}`, options); },
      get(scope, key) { return settings.get(`${scope}.${key}`)?.default; }
    }
  };
  // Actual upstream registers context entries inside its init callback, later
  // than a module's top-level code. Reproduce that order as a regression check.
  const reroll = () => 'original reroll callback';
  const explode = () => 'original explode callback';
  Hooks.once('init', () => {
    Hooks.on('getChatMessageContextOptions', (_html, options) => {
      options.push({ name: 'Reroll', callback: reroll }, { name: 'Explode 6s', callback: explode });
    });
    settings.set('prowlers-and-paragons.gearLimit', { name: 'Gear Limit', hint: 'Set the gear limit for your world' });
  });
  await import(`../scripts/main.mjs?hooks-test=${++imports}`);
  fire('init');
  fire('ready');
  const roots = [];
  t.after(() => {
    for (const root of roots) fire('closeApplication', {}, root);
    window.close();
  });
  return {
    window, fire, settings, reroll, explode,
    root(content) {
      const root = window.document.createElement('div');
      root.innerHTML = content;
      window.document.body.append(root);
      roots.push(root);
      return root;
    }
  };
}

for (const generation of [13, 14]) {
  test(`Foundry ${generation} render hooks translate sheets and DialogV2, preserving callbacks and documents`, async t => {
    const r = await runtime(t, { generation });
    const root = r.root('<nav class="sheet-tabs"><a data-tab="powers">Powers</a></nav>');
    const document = Object.freeze({ name: 'Powers', system: Object.freeze({ rank: 4 }) });
    const app = { options: { classes: ['prowlers-and-paragons', 'sheet'] }, document };
    r.fire('renderApplication', app, generation === 13 ? { 0: root } : root);
    assert.equal(root.querySelector('a').textContent, 'Силы');
    assert(root.classList.contains('pnp-ru-roboto'));
    assert.equal(document.name, 'Powers');
    const dialog = r.root('<h4 class="window-title">Choose an option</h4><div class="trait-selection-dialog"><b>Abilities</b><label><input value="item:armor">Armor</label></div><footer class="form-footer"><button>Make Choice</button></footer>');
    r.fire('renderApplicationV2', { options: {} }, dialog);
    assert.equal(dialog.querySelector('.window-title').textContent, 'Выберите вариант');
    assert.equal(dialog.querySelector('label').textContent, 'Armor');
    assert.equal(dialog.querySelector('button').textContent, 'Выбрать');
    const options = [];
    r.fire('getChatMessageContextOptions', null, options);
    assert.deepEqual(options.map(o => localize(o.name)), ['Перебросить', 'Взрывать шестёрки']);
    assert.equal(options[0].callback, r.reroll);
    assert.equal(options[1].callback, r.explode);
    assert.equal(localize(r.settings.get('prowlers-and-paragons.gearLimit').name), 'Ограничение снаряжения');
  });
}

test('observer translates dynamically regenerated weapon options then disconnects on close', async t => {
  const r = await runtime(t);
  const root = r.root(render('prowlers-roll-weapon.hbs', {
    ranged: true, modifier: 0, rollDifficulties: difficulty,
    rangedTraits: { agility: 'Agility (5)' }
  }));
  const app = { options: {} };
  r.fire('renderApplication', app, root);
  assert.equal(root.querySelector('option[value="agility"]').textContent, 'Ловкость (5)');
  root.querySelector('select[name="trait"]').innerHTML = '<option value="might">Might (4)</option>';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(root.querySelector('option[value="might"]').textContent, 'Мощь (4)');
  r.fire('closeApplication', app, root);
  root.querySelector('select[name="trait"]').innerHTML = '<option value="might">Might (7)</option>';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(root.querySelector('option[value="might"]').textContent, 'Might (7)');
});

test('system chat hook translates cards and menus added later without changing message data', async t => {
  const r = await runtime(t);
  const content = render('prowlers-dice-result.hbs', {
    type: 'Armor', difficulty: 'Лёгкий (0)', formula: '(6)dp', total: 4,
    netSuccess: 4, narrativeControl: 'Персонаж с Приукрашиванием'
  });
  const message = Object.freeze({ content, rolls: Object.freeze([{ formula: '(6)dp', total: 4 }]) });
  const root = r.root(content);
  r.fire('renderChatMessageHTML', message, root);
  assert.equal(root.querySelector('.opposed-roll').textContent, 'Бросок противостояния');
  const dropdown = root.querySelector('.apply-damage-dropdown');
  dropdown.innerHTML = '<li class="apply-damage-option" data-option="target">Apply to Target (Armor)</li>';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(dropdown.textContent, 'Применить к цели (Armor)');
  assert.equal(message.content, content);
  assert.equal(message.rolls[0].total, 4);
  assert.equal(root.querySelector('.dice-formula').textContent, '(6)dp');
});

for (const config of [{ lang: 'en' }, { system: 'dnd5e' }]) {
  test(`hooks leave unrelated language/system untouched: ${JSON.stringify(config)}`, async t => {
    const r = await runtime(t, config);
    const root = r.root('<nav class="sheet-tabs"><a data-tab="powers">Powers</a></nav>');
    const before = root.innerHTML;
    r.fire('renderApplication', { options: { classes: ['prowlers-and-paragons'] } }, root);
    assert.equal(root.innerHTML, before);
    assert(!root.classList.contains('pnp-ru'));
    const options = [];
    r.fire('getChatMessageContextOptions', null, options);
    assert.deepEqual(options.map(o => o.name), ['Reroll', 'Explode 6s']);
  });
}

test('Roboto client setting can be disabled while translation remains active', async t => {
  const r = await runtime(t);
  r.settings.get('pnp-russian.roboto').default = false;
  const root = r.root('<nav class="sheet-tabs"><a data-tab="powers">Powers</a></nav>');
  r.fire('renderApplication', { options: { classes: ['prowlers-and-paragons'] } }, root);
  assert.equal(root.querySelector('a').textContent, 'Силы');
  assert(!root.classList.contains('pnp-ru-roboto'));
});
