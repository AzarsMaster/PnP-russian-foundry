import test from 'node:test';
import assert from 'node:assert/strict';
import { localizeSheet, localizeDialog, localizeChat, isSystemDialog } from '../scripts/ui.mjs';
import { ru, upstream, release, flatten, render, dom, hbs, characterContext, persistentAttributes, abilities, difficulty, localize } from './helpers.mjs';

const words = root => root.textContent.replace(/\s+/g, ' ').trim();
const rootOf = window => window.document.querySelector('.window-app');

test('Russian catalog covers released 2.0.1 and main keys without losing substitution tokens', () => {
  const russian = flatten(ru);
  for (const source of [release, upstream]) {
    for (const [key, text] of Object.entries(flatten(source))) {
      assert.equal(typeof russian[key], 'string', `Missing ${key}`);
      assert.ok(russian[key].trim(), `Empty ${key}`);
      const tokens = string => [...string.matchAll(/\{[^}]+\}|_[A-Z_]+_/g)].map(match => match[0]).sort();
      assert.deepEqual(tokens(russian[key]), tokens(text), `Changed placeholders in ${key}`);
    }
  }
  assert.equal(localize('PROWLERS_AND_PARAGONS.Ability.Tgh.long'), 'Прочность');
  assert.equal(localize('PROWLERS_AND_PARAGONS.Ability.Mgt.long'), 'Мощь');
  assert.equal(localize('PROWLERS_AND_PARAGONS.DerivedCharacteristics.Edge'), 'Инициатива');
  assert.equal(localize('PROWLERS_AND_PARAGONS.DerivedCharacteristics.Resolve.Label'), 'Решимость');
  assert.equal(localize('PROWLERS_AND_PARAGONS.Talent.professional'), 'Бизнес');
  assert.equal(localize('PROWLERS_AND_PARAGONS.Roll.DifficultiesForRollMessage.Opposed', { level: 4 }).includes('4'), true);
});

test('actual character sheet translates navigation and column headers while preserving user content', () => {
  const { window } = dom(render('actor/actor-character-sheet.hbs', characterContext()));
  const root = rootOf(window);
  const attributes = persistentAttributes(root);
  const descriptions = [...root.querySelectorAll('.editor, .item-description-content')].map(element => element.innerHTML);
  const names = [...root.querySelectorAll('[data-item-id] .item-name > label')].map(element => element.textContent);
  assert.ok(names.includes('Might') && names.includes('Armor') && names.includes('Power'));
  localizeSheet(root);
  assert.equal(root.querySelector('[data-tab="play"]').textContent, 'Игра');
  assert.equal(root.querySelector('[data-tab="powers"]').textContent, 'Силы');
  assert.equal(root.querySelector('[data-tab="gear"]').textContent, 'Снаряжение');
  assert.match(words(root.querySelector('.abilities')), /Способности.*Ловкость/);
  assert.match(words(root.querySelector('.items-header')), /Имя.*Итоговый Ранг/);
  assert.equal(root.querySelector('input[name="name"]').value, 'Armor');
  assert.equal(root.querySelector('input[name="system.biography.alias"]').value, 'Power');
  assert.equal(root.querySelector('input[name="system.biography.motivation"]').value, 'Might');
  assert.equal(root.querySelector('.target-display').textContent, 'Цель: Target');
  assert.deepEqual([...root.querySelectorAll('[data-item-id] .item-name > label')].map(element => element.textContent), names);
  assert.deepEqual([...root.querySelectorAll('.editor, .item-description-content')].map(element => element.innerHTML), descriptions);
  assert.deepEqual(persistentAttributes(root), attributes);
  const translated = root.innerHTML;
  localizeSheet(root);
  assert.equal(root.innerHTML, translated, 'Second localization should be idempotent');
});

test('actual power sheet translates labels and placeholders without altering values, editors or option IDs', () => {
  const context = {
    cssClass: 'prowlers-and-paragons', item: { name: 'Power', img: 'icons/svg/item-bag.svg' },
    enrichedDescription: '<h3>Powers</h3><p>Armor and Might</p>', effects: [], abilities,
    talents: {}, power_rank_types: { power: 'PROWLERS_AND_PARAGONS.Item.Power.power_rank_type.power', baseline: 'PROWLERS_AND_PARAGONS.Item.Power.power_rank_type.baseline' },
    power_sources: { innate: 'PROWLERS_AND_PARAGONS.Item.Power.source.innate' },
    power_ranges: { touch: 'PROWLERS_AND_PARAGONS.Item.Power.range.touch' },
    system: { rank_type: 'baseline', rank: 5, shortDescription: 'Armor', baseline_scaling_options: { half_rank: true }, source: 'innate', range: 'touch', cost: 2, hasCharges: true, charges: { value: 2, max: 4 } }
  };
  const { window } = dom(render('item/item-power-sheet.hbs', context));
  const root = rootOf(window);
  const attributes = persistentAttributes(root);
  const editor = root.querySelector('.editor').innerHTML;
  localizeSheet(root);
  assert.equal(root.querySelector('[data-tab="attributes"]').textContent, 'Характеристики');
  assert.equal(root.querySelector('[data-tab="effects"]').textContent, 'Эффекты / Плюсы и Минусы');
  assert.match(words(root), /Краткое описание/);
  assert.match(words(root), /Половинное масштабирование/);
  assert.match(words(root), /Особое базовое значение/);
  assert.equal(root.querySelector('optgroup[label]').getAttribute('label'), 'Способности');
  assert.equal(root.querySelector('input[name="name"]').value, 'Power');
  assert.equal(root.querySelector('input[name="system.shortDescription"]').value, 'Armor');
  assert.equal(root.querySelector('input[name="system.rank"]').value, '5');
  assert.equal(root.querySelector('select[name="system.source"]').value, 'innate');
  assert.equal(root.querySelector('.editor').innerHTML, editor);
  assert.deepEqual(persistentAttributes(root), attributes);
});

test('actual weapon checkbox caption and minion roll label are translated without changing roll parameters', () => {
  const weapon = dom(render('item/item-weapon-sheet.hbs', {
    cssClass: 'prowlers-and-paragons', item: { name: 'Might' },
    system: { weapon_bonus: 3, ranged: true }, enrichedDescription: '<p>Ranged</p>'
  }));
  const root = rootOf(weapon.window);
  localizeSheet(root);
  const checkbox = root.querySelector('input[name="system.ranged"]');
  assert.match(words(checkbox.parentElement), /Дальность/);
  assert.equal(checkbox.checked, true);
  assert.equal(root.querySelector('input[name="name"]').value, 'Might');
  assert.equal(root.querySelector('.editor').textContent, 'Ranged');

  const minion = dom(render('actor/actor-minion-sheet.hbs', {
    cssClass: 'prowlers-and-paragons', actor: { type: 'minion', name: 'Threat' },
    system: { threat: 4, count: 6 }, effects: [], enrichedBiography: '<p>Threat</p>'
  }));
  const minionRoot = rootOf(minion.window);
  const minionAttributes = persistentAttributes(minionRoot);
  localizeSheet(minionRoot);
  assert.equal(minionRoot.querySelector('[data-threat]').textContent, 'Бросить');
  assert.equal(minionRoot.querySelector('[data-threat]').dataset.label, 'Угроза');
  assert.equal(minionRoot.querySelector('[data-threat]').dataset.threat, '4');
  assert.equal(minionRoot.querySelector('[data-threat]').dataset.count, '6');
  assert.equal(minionRoot.querySelector('input[name="name"]').value, 'Threat');
  assert.deepEqual(persistentAttributes(minionRoot), minionAttributes);
});

for (const type of ['hq', 'vehicle']) {
  test(`actual ${type} sheet translates feature controls and preserves document names and biography`, () => {
    const { window } = dom(render(`actor/actor-${type}-sheet.hbs`, {
      cssClass: 'prowlers-and-paragons', actor: { type, name: 'Features' },
      system: { body: 5, speed: { land: 6 }, control: { land: 4 }, weapons: 3 },
      enrichedBiography: '<h3>Features</h3><p>Traits Armor Body</p>',
      features: [{ _id: 'feature1', name: 'Powers' }]
    }));
    const root = rootOf(window);
    const attributes = persistentAttributes(root);
    const editor = root.querySelector('.editor').innerHTML;
    localizeSheet(root);
    assert.equal(root.querySelector('[data-tab="description"]').textContent.trim(), 'Описание');
    assert.equal(root.querySelector('[data-tab="features"]').textContent.trim(), 'Особенности');
    assert.equal(root.querySelector('.items-header .item-name').textContent.trim(), 'Имя');
    assert.equal(root.querySelector('.item-create').getAttribute('title'), 'Создать предмет');
    assert.equal(root.querySelector('[data-item-id="feature1"] h4').textContent, 'Powers');
    assert.equal(root.querySelector('input[name="name"]').value, 'Features');
    assert.equal(root.querySelector('.editor').innerHTML, editor);
    if (type === 'vehicle') {
      assert.equal(root.querySelector('[data-tab="traits"]').textContent.trim(), 'Черты');
      const body = root.querySelector('[data-key="system.body"]');
      assert.equal(body.textContent.trim(), 'Корпус');
      assert.equal(body.dataset.label, 'Корпус');
      assert.equal(root.querySelector('input[name="system.body"]').value, '5');
      assert.equal(root.querySelector('input[name="system.weapons"]').value, '3');
    }
    assert.deepEqual(persistentAttributes(root), attributes);
  });
}

test('actual GM sheet localizes resources and talents while preserving the character table', () => {
  const { window } = dom(render('actor/actor-gm-sheet.hbs', {
    cssClass: 'prowlers-and-paragons', system: { adversity: 5 },
    config: { talents: { academics: 'PROWLERS_AND_PARAGONS.Talent.academics' }, adversity_spend_options: [
      { key: 'flaws', label: 'PROWLERS_AND_PARAGONS.GM.SpendAdversityMenu.Options.Flaws' }
    ] }, characters: [{ id: 'p', name: 'Powers', system: { resolve: { value: 3 }, talents: { academics: { value: 4 } } } }]
  }));
  const root = rootOf(window);
  const before = persistentAttributes(root);
  localizeSheet(root);
  assert.equal(root.querySelector('.sheet-header h1').textContent, 'Лист Мастера игры');
  assert.match(words(root.querySelector('.sheet-header')), /Невзгоды/);
  assert.match(words(root.querySelector('thead')), /Powers/);
  assert.equal(root.querySelector('tbody td').textContent.trim(), '4');
  assert.equal(root.querySelector('tbody th').textContent.trim(), 'Академические знания');
  assert.equal(root.querySelector('input[name="system.adversity"]').value, '5');
  assert.equal(root.querySelector('.award-resolve').dataset.charId, 'p');
  assert.deepEqual(persistentAttributes(root), before);
});

for (const [type, caption] of [
  ['armor', 'Бонус брони'], ['condition', 'Эффекты'], ['perk', 'Стоимость'],
  ['flaw', 'Описание'], ['feature', 'Для'], ['procon', 'Стоимость за Ранг']
]) {
  test(`actual ${type} item sheet translates structural UI and preserves document values`, () => {
    const { window } = dom(render(`item/item-${type}-sheet.hbs`, {
      cssClass: 'prowlers-and-paragons', item: { name: 'Armor' },
      system: { cost: 2, armor_bonus: 3, cost_flat: 1, cost_per_rank: 2, kind: 'pro', for: 'vehicle' },
      enrichedDescription: '<h3>Effects</h3><p>Armor Cost Description</p>', effects: [],
      featureFor: { vehicle: 'Vehicle', hq: 'HQ' }, pro_con_choices: { pro: 'Pro', con: 'Con' }
    }));
    const root = rootOf(window);
    const before = persistentAttributes(root);
    const editor = root.querySelector('.editor').innerHTML;
    localizeSheet(root);
    assert.equal(root.querySelector('[data-tab="description"]').textContent.trim(), 'Описание');
    assert.match(words(root), new RegExp(caption));
    assert.equal(root.querySelector('input[name="name"]').value, 'Armor');
    assert.equal(root.querySelector('.editor').innerHTML, editor);
    assert.deepEqual(persistentAttributes(root), before);
    if (type === 'feature') {
      assert.equal(root.querySelector('[value="vehicle"]').textContent, 'Транспортное средство');
      assert.equal(root.querySelector('[value="hq"]').textContent, 'Штаб-квартира');
      assert.equal(root.querySelector('select[name="trait"]').value, 'vehicle');
    }
    if (type === 'procon') {
      assert.equal(root.querySelector('.kind').textContent.trim(), 'Плюс');
      assert.equal(root.querySelector('select[name="system.kind"]').value, 'pro');
      assert.equal(root.querySelector('[value="con"]').textContent, 'Минус');
      assert.doesNotMatch(root.querySelector('.cost').textContent, /flat|rank/);
    }
  });
}

test('actual weapon roll dialog translates controls including regenerated defending trait choices', () => {
  const choices = { ma: 'Martial Arts (6)', might: 'Might (4)' };
  const context = {
    ranged: false, modifier: 0, difficulty: 'easy', rollDifficulties: difficulty,
    attackingMeleeTraits: choices, defendingMeleeTraits: { ma: 'Martial Arts (6)', agility: 'Agility (5)' },
    action_choices: { attacking: 'Attacking', defending: 'Defending' }, chosen_action_type: 'attacking', trait: 'ma'
  };
  const content = render('prowlers-roll-weapon.hbs', context) + '<footer class="dialog-buttons"><button data-button="one"><i class="fas fa-dice"></i>Roll against Armor</button><button data-button="two">Cancel</button></footer>';
  const { window } = dom(content, 'Rolling Power');
  const root = rootOf(window);
  const attributes = persistentAttributes(root);
  let clicks = 0;
  root.querySelector('[data-button="one"]').addEventListener('click', () => clicks++);
  assert.equal(isSystemDialog({}, root), true);
  localizeDialog(root);
  assert.equal(root.querySelector('.window-title').textContent, 'Бросок: Power');
  assert.equal(root.querySelector('[data-button="one"]').textContent, 'Бросок против Armor');
  assert.equal(root.querySelector('[data-button="two"]').textContent, 'Отмена');
  assert.equal(root.querySelector('select[name="trait"] option[value="ma"]').textContent, 'Боевые искусства (6)');
  assert.equal(root.querySelector('select[name="trait"] option[value="might"]').textContent, 'Мощь (4)');
  assert.equal(root.querySelector('select[name="difficulty"]').value, 'easy');
  assert.deepEqual(persistentAttributes(root), attributes);
  root.querySelector('[data-button="one"]').click();
  assert.equal(clicks, 1, 'Translation must preserve the existing listener and icon');
  assert.ok(root.querySelector('[data-button="one"] > i'));
  const select = root.querySelector('select[name="trait"]');
  // This is the same replacement performed by upstream handleRadioChange.
  select.innerHTML = hbs.helpers.selectOptions(context.defendingMeleeTraits, { hash: { selected: 'agility' } }).toString();
  localizeDialog(root);
  assert.equal(select.querySelector('[value="agility"]').textContent, 'Ловкость (5)');
  assert.equal(select.value, 'agility');
});

test('armor roll uses glossary Toughness and keeps internal armor trait values', () => {
  const { window } = dom(render('prowlers-roll-armor.hbs', {
    modifier: 0, difficulty: 'easy', rollDifficulties: difficulty,
    armorTraits: { toughness: 'Toughness (4)', armor: 'Armor (6)' }, trait: 'armor'
  }), 'Rolling Armor');
  const root = rootOf(window);
  localizeDialog(root);
  assert.equal(root.querySelector('[value="toughness"]').textContent, 'Прочность (4)');
  assert.equal(root.querySelector('[value="armor"]').textContent, 'Броня (6)');
  assert.equal(root.querySelector('select[name="trait"]').value, 'armor');
});

test('opposed selection translates headings and instructions while preserving actor and item names', () => {
  const { window } = dom(render('opposed-roll-trait-select.hbs', {
    rollingAgainstName: 'Armor', rollingAgainstTrait: 'Power',
    abilities: { 'ability:might': abilities.might }, talents: {},
    powers: { 'item:p': 'Might', 'item:a': 'Armor' }, showGear: true,
    gear: { weapons: { 'item:w': 'Power' }, armor: {} }, chosen: ''
  }) + '<footer class="form-footer"><button data-action="ok">Make Choice</button></footer>', 'Choose an option');
  const root = rootOf(window);
  const attributes = persistentAttributes(root);
  localizeDialog(root);
  assert.equal(root.querySelector('.window-title').textContent, 'Выберите вариант');
  assert.match(words(root), /Вы делаете бросок против Armor/);
  assert.match(words(root), /Выберите Черту для броска против Power/);
  assert.equal(root.querySelector('input[value="item:p"]').parentElement.textContent, 'Might');
  assert.equal(root.querySelector('input[value="item:a"]').parentElement.textContent, 'Armor');
  assert.equal(root.querySelector('input[value="item:w"]').parentElement.textContent, 'Power');
  assert.deepEqual(persistentAttributes(root), attributes);
});

test('actual opposed-roll waiting template is recognized and translated', () => {
  const { window } = dom(render('please-hold.hbs') + '<footer class="form-footer"><button data-action="ok">Ok</button></footer>', 'Please Hold');
  const root = rootOf(window);
  assert.equal(isSystemDialog({}, root), true);
  localizeDialog(root);
  assert.equal(root.querySelector('.window-title').textContent, 'Подождите');
  assert.match(words(root), /Подождите, пока игрок, управляющий вашей целью, сделает бросок\./);
  assert.equal(root.querySelector('[data-action="ok"]').textContent, 'ОК');
});

test('minion opposed selector translates its fixed Threat caption, keeping selected internal trait ID', () => {
  const { window } = dom(render('opposed-roll-trait-select.hbs', {
    rollingAgainstName: 'Threat', rollingAgainstTrait: 'Armor',
    threat: { 'threat:threat': 'Threat' }, chosen: 'threat:threat'
  }), 'Choose an option');
  const root = rootOf(window);
  const before = persistentAttributes(root);
  localizeDialog(root);
  const radio = root.querySelector('input[name="trait"]');
  assert.equal(radio.value, 'threat:threat');
  assert.equal(radio.checked, true);
  assert.equal(radio.parentElement.textContent, 'Угроза');
  assert.match(words(root), /Вы делаете бросок против Threat/);
  assert.deepEqual(persistentAttributes(root), before);
});

test('minion group roll caption translates only the strict generated numeric pattern', () => {
  const { window } = dom(render('prowlers-roll-trait.hbs', {
    modifier: 0, difficulty: 'easy', rollDifficulties: difficulty, showMinionOffense: true
  }), 'Rolling Threat 4 (group of 6)');
  const root = rootOf(window);
  localizeDialog(root);
  assert.equal(root.querySelector('.window-title').textContent, 'Бросок: Угроза 4 (группа: 6)');
  const chat = dom(render('prowlers-dice-result.hbs', {
    type: 'Threat 4 (group of 6)', difficulty: 'Простой (0)', formula: '(8)dp', total: 5, netSuccess: 5
  }));
  const chatRoot = rootOf(chat.window);
  localizeChat(chatRoot, { minion: true });
  assert.equal(chatRoot.querySelector('.part-flavor').textContent, 'Угроза 4 (группа: 6)');
  assert.equal(chatRoot.querySelector('.dice-formula').textContent, '(8)dp');
  const name = dom(render('prowlers-dice-result.hbs', {
    type: 'Threat', difficulty: 'Простой (0)', formula: '(8)dp', total: 5, netSuccess: 5
  }));
  localizeChat(rootOf(name.window));
  assert.equal(name.window.document.querySelector('.part-flavor').textContent, 'Threat');
  const namedItem = dom(render('prowlers-dice-result.hbs', {
    type: 'Threat 4 (group of 6)', difficulty: 'Простой (0)', formula: '(8)dp', total: 5, netSuccess: 5
  }));
  localizeChat(rootOf(namedItem.window));
  assert.equal(namedItem.window.document.querySelector('.part-flavor').textContent, 'Threat 4 (group of 6)',
    'An item name resembling a minion label needs roll metadata before translation');
});

test('actual dice card localizes results, buttons and dynamic target menus without changing rolls', () => {
  const { window } = dom(render('prowlers-dice-result.hbs', {
    type: 'Armor', difficulty: 'Тяжёлый (2)', formula: '(8)dp', total: 5,
    netSuccess: 3, narrativeControl: 'Персонаж с Приукрашиванием', tooltip: '<ol class="dice-rolls"><li class="roll die d6">6</li></ol>'
  }));
  const root = rootOf(window);
  localizeChat(root);
  assert.equal(root.querySelector('.part-flavor').textContent, 'Armor');
  assert.equal(root.querySelector('.dice-formula').textContent, '(8)dp');
  assert.equal(root.querySelector('.dice-flavor').textContent, 'Порог сложности: Тяжёлый (2)');
  assert.equal(root.querySelector('.narrative-control').textContent, 'Право описывать происходящее: Персонаж с Приукрашиванием');
  assert.equal(root.querySelector('.dice-total').textContent, '5');
  assert.match(words(root), /Итоговые успехи: 3/);
  assert.equal(root.querySelector('.opposed-roll').textContent, 'Бросок противостояния');
  assert.equal(root.querySelector('.apply-damage-btn').textContent, 'Применить Урон');
  const dropdown = root.querySelector('.apply-damage-dropdown');
  dropdown.innerHTML = '<ul><li class="apply-damage-option" data-option="selected">Apply to Selected Token (Armor)</li><li class="apply-damage-option" data-option="target">Apply to Target (Target)</li></ul>';
  localizeChat(root);
  assert.equal(dropdown.querySelector('[data-option="selected"]').textContent, 'Применить к выбранному токену (Armor)');
  assert.equal(dropdown.querySelector('[data-option="target"]').textContent, 'Применить к цели (Target)');
  const translated = root.innerHTML;
  localizeChat(root);
  assert.equal(root.innerHTML, translated);
});

test('unrelated chat and dialogs are untouched even when text resembles system labels', () => {
  const content = '<p>Powers</p><div class="dice-roll"><div class="dice-result">Net Successes: 3</div><button>Apply Damage</button></div><form><input name="modifier"><button>Roll</button></form>';
  const { window } = dom(content, 'Rolling Something');
  const root = rootOf(window);
  const before = root.innerHTML;
  assert.equal(isSystemDialog({}, root), false);
  localizeDialog(root);
  localizeChat(root);
  assert.equal(root.innerHTML, before);
});
