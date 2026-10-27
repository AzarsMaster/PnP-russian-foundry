import { UI_STRINGS, ROLL_TRAITS } from './ui-strings.mjs';

// Never walk rich text or document names: user content can equal a UI label.
const USER_CONTENT = '.editor, .editor-content, .prosemirror, .ProseMirror, [contenteditable], textarea, script, style, .item-description-content, .procon-description, .procon-name, .charname';

function elements(root, selector) {
  const result = Array.from(root.querySelectorAll(selector));
  if (root.matches?.(selector)) result.unshift(root);
  return result;
}

function safe(element) {
  return !element.closest(USER_CONTENT);
}

/** Replace only a direct Text node, preserving controls, icons and listeners. */
function directText(element, translate) {
  if (!safe(element)) return;
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== 3) continue;
    const before = node.nodeValue;
    const trimmed = before.trim();
    if (!trimmed) continue;
    const after = translate(trimmed);
    if (after !== trimmed) {
      node.nodeValue = before.replace(trimmed, after);
    }
  }
}

const exact = text => Object.hasOwn(UI_STRINGS, text) ? UI_STRINGS[text] : text;

const DOCUMENT_LABELS = Object.freeze({
  item: 'предмет', feature: 'особенность', power: 'Сила', perk: 'Преимущество',
  flaw: 'Недостаток', weapon: 'оружие', armor: 'броня', effect: 'эффект'
});

function controlText(text) {
  const match = /^(New|Create|Edit|Update|Delete) (item|feature|power|perk|flaw|weapon|armor|effect)$/i.exec(text);
  if (!match) return exact(text);
  const verbs = { new: 'Создать', create: 'Создать', edit: 'Изменить', update: 'Изменить', delete: 'Удалить' };
  // Use genitive only where Russian grammar requires it.
  const noun = DOCUMENT_LABELS[match[2].toLowerCase()];
  const accusative = { 'особенность': 'особенность', 'Сила': 'Силу', 'броня': 'броню' };
  return `${verbs[match[1].toLowerCase()]} ${accusative[noun] ?? noun}`;
}

function labels(root, selector, translate = exact) {
  for (const element of elements(root, selector)) directText(element, translate);
}

function attributeLabels(root, selector, attribute) {
  for (const element of elements(root, selector)) {
    // charname itself protects the entered name, but its static placeholder is safe.
    if (attribute !== 'placeholder' && !safe(element)) continue;
    const value = element.getAttribute(attribute);
    const translated = exact(value);
    if (value !== translated) element.setAttribute(attribute, translated);
  }
}

function minionRollText(text) {
  return text.replace(/^Threat (\d+) \(group of (\d+)\)$/, 'Угроза $1 (группа: $2)');
}

const WAITING_MESSAGE = 'Please wait while the player controlling your target rolls.';
const WAITING_NODES = '.dialog-content, .window-content, .dialog-content > div, .window-content > div, .dialog-content > form > div';

function isWaitingText(text) {
  return text === WAITING_MESSAGE || text === UI_STRINGS[WAITING_MESSAGE];
}

/** Call only for this system's Actor/Item sheet, when Russian is selected. */
export function localizeSheet(root) {
  labels(root, '.sheet-tabs > a[data-tab], .abilities > h3, .sheet-body .main > h3, .sheet-body .tab > h3');
  for (const element of elements(root, 'label.resource-label, .biography > label')) {
    if (element.closest('[data-item-id], [data-effect-id]')) continue;
    directText(element, exact);
  }
  // Column headings are structural. Item rows below them contain document names.
  for (const header of elements(root, '.items-header')) {
    labels(header, 'div, h3, h4, label, a, b');
    directText(header, exact);
  }
  labels(root, '.item-control, .effect-control', controlText);
  labels(root, '.temporary-buffs-btn, .rollable[data-threat], .tab.options > div, .sheet-header .cost, .sheet-header .kind > strong, .procon-kind');
  // HTML inputs are void elements: upstream checkbox captions become sibling
  // Text nodes. Restrict this to known field names and their own container.
  for (const input of elements(root, 'input[name="system.baseline_scaling_options.half_rank"], input[name="system.baseline_scaling_options.special"], input[name="system.ranged"]')) {
    if (input.parentElement && !input.closest('[data-item-id], [data-effect-id]')) directText(input.parentElement, exact);
  }
  labels(root, '.tab.package > h3', text => text.replace(/^Currently selected package:\s*/, 'Текущий набор: '));
  labels(root, '.target-display', text => text.replace(/^Target:\s*/, 'Цель: '));
  labels(root, 'select[name="system.kind"] > option, select[name="trait"] > option');
  attributeLabels(root, 'optgroup[label]', 'label');
  attributeLabels(root, 'input[name="name"][placeholder], input[name="system.shortDescription"][placeholder], input[name="system.final_cost"][placeholder], input[name="system.charges.value"][placeholder], input[name="system.charges.max"][placeholder]', 'placeholder');
  attributeLabels(root, '.clear-target[title], .item-create[title], .reset-charges[title]', 'title');
  // These two data-labels are fixed UI labels consumed as roll flavor. Numeric
  // data attributes and all user-supplied item labels remain unchanged.
  attributeLabels(root, '.rollable[data-threat][data-label="Threat"], .rollable[data-key="system.body"][data-label="Body"]', 'data-label');
  for (const control of elements(root, '.item-control[title], .effect-control[title]')) {
    if (!safe(control)) continue;
    const before = control.getAttribute('title');
    const after = controlText(before);
    if (after !== before) control.setAttribute('title', after);
  }
}

function dialogKind(root) {
  if (root.matches?.('.trait-selection-dialog') || root.querySelector('.trait-selection-dialog')) return 'opposed';
  if (root.querySelector('input[name="modifier"]') && (
    root.querySelector('select[name="difficulty"], input[name="halveToughness"], input[name="offense"], select[name="trait"]') ||
    Array.from(root.querySelectorAll('legend')).some(legend => /^(Roll Details|Подробности броска)$/.test(legend.textContent.trim()))
  )) return 'roll';
  if (elements(root, WAITING_NODES).some(element =>
    safe(element) && Array.from(element.childNodes).some(node => node.nodeType === 3 && isWaitingText(node.nodeValue.trim()))
  )) return 'waiting';
  return null;
}

/** Structural identification prevents changing unrelated Foundry dialogs. */
export function isSystemDialog(_app, root) {
  return Boolean(dialogKind(root));
}

export function localizeDialog(root) {
  const kind = dialogKind(root);
  if (!kind) return;
  const minion = Boolean(root.querySelector('input[name="offense"]'));
  const translateTitle = text => text.startsWith('Rolling ')
    ? `Бросок: ${minion ? minionRollText(text.slice(8)) : text.slice(8)}`
    : text;
  labels(root, '.window-title', text => exact(translateTitle(text)));
  labels(root, '.dialog-buttons button, .form-footer button, button[data-action="ok"], button[data-action="cancel"]', text => exact(text.replace(/^Roll against\s+/, 'Бросок против ')));
  if (kind === 'waiting') {
    labels(root, WAITING_NODES, text => isWaitingText(text) ? exact(text) : text);
    return;
  }
  if (kind === 'opposed') {
    labels(root, '.trait-selection-dialog b');
    for (const input of elements(root, '.trait-selection-dialog input[value="threat:threat"]')) {
      if (input.parentElement?.tagName === 'LABEL') directText(input.parentElement, exact);
    }
    labels(root, '.dialog-content, .dialog-form, .window-content', text => text
      .replace(/^You're rolling against\s+/, 'Вы делаете бросок против ')
      .replace(/^Choose a trait to roll against\s+/, 'Выберите Черту для броска против '));
    return;
  }
  labels(root, 'legend');
  // Weapon/armor options have fixed internal IDs. An opposed power named Armor
  // is in a different dialog and is deliberately left unchanged.
  for (const option of elements(root, 'select[name="trait"] > option')) {
    const pair = ROLL_TRAITS[option.value];
    if (!pair) continue;
    directText(option, text => text.startsWith(`${pair[0]} (`) ? pair[1] + text.slice(pair[0].length) : text);
  }
  for (const input of elements(root, 'input[name="Attacking/Defending"]')) {
    if (input.parentElement?.tagName === 'LABEL') directText(input.parentElement, exact);
  }
}

/** Localize rendered system dice cards only; never update ChatMessage content. */
export function localizeChat(root, { minion = false } = {}) {
  for (const card of elements(root, '.dice-roll')) {
    if (!card.querySelector('.opposed-roll') || !card.querySelector('.dice-result')) continue;
    if (minion) labels(card, ':scope > .part-flavor', minionRollText);
    labels(card, ':scope > .dice-flavor', text => text.replace(/^Difficulty:\s*/, 'Порог сложности: '));
    labels(card, '.dice-result > h4 > .dice-total', text => text
      .replace(/^Net Successes:\s*/, 'Итоговые успехи: ')
      .replace(/^Narrative Control:\s*/, 'Право описывать происходящее: '));
    labels(card, 'button.apply-damage-btn, button.apply-condition-btn, button.opposed-roll');
    labels(card, '.apply-damage-option, .apply-condition-option', text => text
      .replace(/^Apply to Selected Token \(/, 'Применить к выбранному токену (')
      .replace(/^Apply to Target \(/, 'Применить к цели ('));
  }
}
