import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import Handlebars from 'handlebars';
import { JSDOM } from 'jsdom';

export const ru = JSON.parse(readFileSync(new URL('../lang/ru.json', import.meta.url)));
export const upstream = JSON.parse(readFileSync(new URL('./fixtures/upstream/en.json', import.meta.url)));
export const release = JSON.parse(readFileSync(new URL('./fixtures/upstream/en-2.0.1.json', import.meta.url)));
export const templates = fileURLToPath(new URL('./fixtures/upstream/templates/', import.meta.url));
export const hbs = Handlebars.create();

export function lookup(key, source = ru) {
  return key?.split('.').reduce((node, segment) => node?.[segment], source) ?? key;
}

export function localize(key, args = {}) {
  const text = lookup(key);
  if (typeof text !== 'string') return key;
  return text.replace(/\{([^}]+)\}/g, (match, name) => args[name] ?? match);
}

const safe = text => new hbs.SafeString(text);
const escape = text => hbs.escapeExpression(String(text ?? ''));

hbs.registerHelper('localize', (key, options) => localize(key, options.hash));
hbs.registerHelper('eq', (a, b) => a === b);
hbs.registerHelper('ne', (a, b) => a !== b);
hbs.registerHelper('gt', (a, b) => a > b);
hbs.registerHelper('concat', (...parts) => parts.slice(0, -1).join(''));
hbs.registerHelper('ifThen', (condition, yes, no) => condition ? yes : no);
hbs.registerHelper('checked', value => value ? 'checked' : '');
hbs.registerHelper('getCurrentTarget', () => 'Target');
hbs.registerHelper('getDerivedPowerRank', () => 6);
hbs.registerHelper('isDefaultPower', item => item.system.rank_type === 'default');
hbs.registerHelper('needsConnectedAbility', power => ['default', 'baseline'].includes(power.rank_type));
hbs.registerHelper('needsBaselineOptions', power => power.rank_type === 'baseline');
hbs.registerHelper('editor', (content, options) => safe(
  `<div class="editor" data-edit="${escape(options.hash.target)}"><div class="editor-content">${content ?? ''}</div></div>`
));
hbs.registerHelper('selectOptions', (choices, options) => safe(Object.entries(choices ?? {}).map(([value, text]) => {
  const label = options.hash.localize ? localize(text) : text;
  return `<option value="${escape(value)}"${value === options.hash.selected ? ' selected' : ''}>${escape(label)}</option>`;
}).join('')));
hbs.registerHelper('radioBoxes', (name, choices, options) => safe(Object.entries(choices ?? {}).map(([value, text]) => {
  const label = options.hash.localize ? localize(text) : text;
  return `<label class="checkbox"><input type="radio" name="${escape(name)}" value="${escape(value)}"${value === options.hash.checked ? ' checked' : ''}>${escape(label)}</label>`;
}).join('')));

function registerPartials(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) registerPartials(path);
    else if (entry.name.endsWith('.hbs')) {
      const key = `systems/prowlers-and-paragons/templates/${relative(templates, path).replaceAll('\\', '/')}`;
      hbs.registerPartial(key, readFileSync(path, 'utf8'));
    }
  }
}
registerPartials(templates);

export function render(path, context = {}) {
  return hbs.compile(readFileSync(join(templates, path), 'utf8'))(context);
}

export function dom(content, title = '') {
  return new JSDOM(`<section class="window-app"><header><h4 class="window-title">${escape(title)}</h4></header><div class="window-content">${content}</div></section>`);
}

export const abilities = {
  agility: 'PROWLERS_AND_PARAGONS.Ability.Agi.long',
  intellect: 'PROWLERS_AND_PARAGONS.Ability.Int.long',
  might: 'PROWLERS_AND_PARAGONS.Ability.Mgt.long',
  perception: 'PROWLERS_AND_PARAGONS.Ability.Per.long',
  toughness: 'PROWLERS_AND_PARAGONS.Ability.Tgh.long',
  willpower: 'PROWLERS_AND_PARAGONS.Ability.Wil.long'
};

export const difficulty = {
  easy: 'PROWLERS_AND_PARAGONS.Roll.Difficulties.Easy',
  average: 'PROWLERS_AND_PARAGONS.Roll.Difficulties.Average',
  hard: 'PROWLERS_AND_PARAGONS.Roll.Difficulties.Hard'
};

export function characterContext() {
  const values = Object.fromEntries(Object.keys(abilities).map(key => [key, { value: 4 }]));
  const system = {
    health: { value: 10, max: 10 }, edge: { value: 3 }, resolve: { value: 4, starting: 4 },
    abilities: values, talents: { academics: { value: 3 } }, earnedHeroPoints: 5,
    biography: { alias: 'Power', motivation: 'Might', quote: 'Armor', description: '<h3>Powers</h3><p>Gear and Might</p>', details: '<p>Target</p>' }
  };
  const item = (id, name) => ({ _id: id, name, displayName: name, img: 'icons/svg/item-bag.svg', system: {
    rank: 6, rank_type: 'power', description: '<h3>Powers</h3><p>Armor Might Gear</p>', hasCharges: true,
    charges: { value: 2, max: 3 }, armor_bonus: 2, weapon_bonus: 3
  } });
  return {
    actor: { id: 'hero', type: 'character', name: 'Armor', system: { ...system, _source: { abilities: values, talents: system.talents } } },
    system, cssClass: 'prowlers-and-paragons', config: {
      abilities, talents: { academics: 'PROWLERS_AND_PARAGONS.Talent.academics' },
      packages: { hero: 'PROWLERS_AND_PARAGONS.Packages.hero' }
    }, temporaryButtonText: 'Enter Temporary Buffs Mode', totalHeroPointBudget: 130,
    powers: [item('power', 'Might')], weapons: [item('weapon', 'Power')], armor: [item('armor', 'Armor')],
    perks: [], flaws: [], effects: []
  };
}

export function persistentAttributes(root) {
  return [...root.querySelectorAll('*')].map(node => [...node.attributes]
    .filter(({ name }) => {
      // These two attributes are fixed upstream display captions, not IDs.
      // Their localized values are asserted separately in the sheet tests.
      if (name === 'data-label' && node.matches('.rollable[data-threat], .rollable[data-key="system.body"]')) return false;
      return name === 'name' || name === 'value' || name.startsWith('data-');
    })
    .map(({ name, value }) => [name, value]));
}

export function flatten(object, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') result[path] = value;
    else flatten(value, path, result);
  }
  return result;
}
