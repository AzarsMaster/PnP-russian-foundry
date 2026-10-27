import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { render, difficulty, localize, characterContext } from './helpers.mjs';

let imports = 0;
async function runtime(t, { generation = 14, lang = 'ru', system = 'prowlers-and-paragons', autoReady = true } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { window } = dom;
  const callbacks = new Map();
  globalThis.document = window.document;
  globalThis.window = window;
  globalThis.ui = { windows: {} };
  globalThis.foundry = { applications: { instances: new Map() } };
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
  if (autoReady) fire('ready');
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
  for (const [hook, template, context] of [
    ['renderProwlersParagonsActorSheet', 'actor/actor-character-sheet.hbs', characterContext],
    ['renderProwlersParagonsItemSheet', 'item/item-power-sheet.hbs', () => ({
      cssClass: 'prowlers-and-paragons', item: { name: 'Powers' }, effects: [],
      enrichedDescription: '<h3>Powers</h3><p>Gear and Might</p>',
      system: { rank_type: 'power', rank: 4, baseline_scaling_options: {}, charges: {} }
    })],
    ['renderProwlersParagonsGMSheet', 'actor/actor-gm-sheet.hbs', () => ({
      cssClass: 'prowlers-and-paragons', system: { adversity: 4 },
      config: { talents: {}, adversity_spend_options: [] }, characters: []
    })]
  ]) {
    test(`Foundry ${generation} concrete ${hook} works without a generic hook or app options metadata`, async t => {
      const r = await runtime(t, { generation });
      const wrapper = r.root(render(template, context()));
      // Foundry's concrete hook can receive a jQuery form or HTMLElement rather
      // than the same wrapper used by generic Application render callbacks.
      const form = wrapper.querySelector('form');
      const app = { options: {}, element: generation === 13 ? { 0: wrapper } : wrapper };
      r.fire(hook, app, generation === 13 ? { 0: form } : form);
      const decorated = form.closest('.pnp-ru-roboto');
      assert.ok(decorated, 'Specific sheet hook must enable Roboto on the rendered sheet or its ancestor');
      if (hook.includes('GMSheet')) {
        assert.match(form.querySelector('.sheet-header').textContent, /Невзгоды/);
      } else {
        const tab = form.querySelector('.sheet-tabs > a[data-tab="powers"], .sheet-tabs > a[data-tab="description"]');
        assert.ok(['Силы', 'Описание'].includes(tab.textContent.trim()), 'Hardcoded tab text must be localized');
        assert.equal(form.querySelector('.editor h3').textContent, 'Powers', 'User description must remain untouched');
      }
    });
  }
}

test('system class in actual DOM identifies a sheet when app metadata omits options.classes and template', async t => {
  const r = await runtime(t);
  const root = r.root(render('actor/actor-character-sheet.hbs', characterContext()));
  r.fire('renderApplication', { options: {}, element: root }, root);
  assert.equal(root.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Силы');
  assert.ok(root.querySelector('form').closest('.pnp-ru-roboto'));
  assert.equal(root.querySelector('.editor h3').textContent, 'Powers');
});

test('app.element wrapper identifies the system sheet when hook html contains only window content', async t => {
  const r = await runtime(t);
  const context = characterContext();
  context.cssClass = '';
  const wrapper = r.root(`<header class="window-header"><h4 class="window-title">Armor</h4></header><section class="window-content">${render('actor/actor-character-sheet.hbs', context)}</section>`);
  wrapper.className = 'app window-app prowlers-and-paragons sheet actor';
  const content = wrapper.querySelector('.window-content');
  r.fire('renderApplication', { options: {}, element: { 0: wrapper } }, { 0: content });
  assert.equal(content.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Силы');
  assert.ok(wrapper.classList.contains('pnp-ru-roboto'), 'Font class must cover the application wrapper and title');
  assert.equal(wrapper.querySelector('.window-title').textContent, 'Armor');
  assert.equal(content.querySelector('.editor h3').textContent, 'Powers');
});

test('rerender after replacing the sheet content localizes newly inserted tabs and retains Roboto', async t => {
  const r = await runtime(t);
  const root = r.root(render('actor/actor-character-sheet.hbs', characterContext()));
  const app = { options: {}, element: { 0: root } };
  r.fire('renderProwlersParagonsActorSheet', app, { 0: root.querySelector('form') });
  const first = root.querySelector('form');
  root.innerHTML = render('actor/actor-character-sheet.hbs', characterContext());
  assert.notEqual(root.querySelector('form'), first);
  r.fire('renderProwlersParagonsActorSheet', app, { 0: root.querySelector('form') });
  const form = root.querySelector('form');
  assert.equal(form.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Силы');
  assert.ok(form.closest('.pnp-ru-roboto'));
  form.querySelector('.sheet-tabs [data-tab="gear"]').textContent = 'Gear';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(form.querySelector('.sheet-tabs [data-tab="gear"]').textContent, 'Снаряжение');
});

for (const registry of ['ui.windows', 'foundry.applications.instances']) {
  test(`ready localizes an already-open system sheet from ${registry}`, async t => {
    const r = await runtime(t, { autoReady: false });
    const wrapper = r.root(render('actor/actor-character-sheet.hbs', characterContext()));
    const app = { options: {}, element: registry === 'ui.windows' ? { 0: wrapper } : wrapper, rendered: true };
    if (registry === 'ui.windows') ui.windows.openSheet = app;
    else foundry.applications.instances.set('openSheet', app);
    assert.equal(wrapper.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Powers');
    r.fire('ready');
    assert.equal(wrapper.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Силы');
    assert.ok(wrapper.querySelector('form').closest('.pnp-ru-roboto'));
    assert.equal(wrapper.querySelector('input[name="name"]').value, 'Armor');
    assert.equal(wrapper.querySelector('.editor h3').textContent, 'Powers');
  });
}

test('a newly attached system window is localized when its renderer dispatches no application hooks', async t => {
  const r = await runtime(t);
  const root = r.root(render('actor/actor-character-sheet.hbs', characterContext()));
  assert.equal(root.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Powers');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(root.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Силы');
  assert.ok(root.querySelector('form').closest('.pnp-ru-roboto'));
  assert.equal(root.querySelector('.editor h3').textContent, 'Powers');
});

test('window attachment fallback handles a shell inserted before its unclassified inner form', async t => {
  const r = await runtime(t);
  const root = r.root('');
  root.className = 'app window-app prowlers-and-paragons sheet actor';
  await new Promise(resolve => setTimeout(resolve, 0));
  const context = characterContext();
  context.cssClass = '';
  root.innerHTML = render('actor/actor-character-sheet.hbs', context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(root.querySelector('.sheet-tabs [data-tab="powers"]').textContent, 'Силы');
  assert.ok(root.classList.contains('pnp-ru-roboto'));
});

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
