import { isSystemDialog, localizeSheet, localizeDialog, localizeChat } from './ui.mjs';

export const MODULE_ID = 'pnp-russian';
export const SYSTEM_ID = 'prowlers-and-paragons';

export function active() {
  return game.system.id === SYSTEM_ID && /^ru(?:[-_]|$)/i.test(game.i18n.lang);
}

export function elementOf(html) {
  return html?.nodeType === 1 ? html : html?.[0];
}

// Text observers are bounded to rendered applications/cards. Disconnect while
// changing text to avoid an observer/translation feedback loop.
const observers = new WeakMap();
const applicationRoots = new WeakMap();
function decorate(root, translate) {
  if (!root?.querySelectorAll || !active()) return;
  const previous = observers.get(root);
  previous?.disconnect();
  root.classList.add('pnp-ru');
  root.classList.toggle('pnp-ru-roboto', game.settings.get(MODULE_ID, 'roboto'));
  translate(root);
  const observer = previous ?? new MutationObserver(() => {
    observer.disconnect();
    if (active()) translate(root);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  observers.set(root, observer);
}

function renderApp(app, html, knownSystemSheet = false) {
  if (!active()) return;
  const content = elementOf(html);
  const outer = elementOf(app.element);
  // Specific sheet hooks sometimes pass only the inner form. Use the enclosing
  // application when available, so its title and replacement forms inherit the
  // font and stay covered after an Actor update rerenders the sheet.
  const root = outer && (!content || outer.contains(content)) ? outer : content;
  if (!root) return;
  const classes = app.options?.classes ?? [];
  const template = app.template ?? app.options?.template ?? '';
  const systemSheet = knownSystemSheet || classes.includes(SYSTEM_ID)
    || template.startsWith(`systems/${SYSTEM_ID}/templates/actor/`)
    || template.startsWith(`systems/${SYSTEM_ID}/templates/item/`)
    || root.classList.contains(SYSTEM_ID)
    || Boolean(root.querySelector(`form.${SYSTEM_ID}`));
  const translate = systemSheet ? localizeSheet : isSystemDialog(app, root) ? localizeDialog : null;
  if (!translate) return;
  const previous = applicationRoots.get(app);
  if (previous && previous !== root) observers.get(previous)?.disconnect();
  applicationRoots.set(app, root);
  decorate(root, translate);
}

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'roboto', {
    name: 'PNP_RU.Settings.RobotoName',
    hint: 'PNP_RU.Settings.RobotoHint',
    scope: 'client', config: true, type: Boolean, default: true, requiresReload: true
  });
});

// Listen to the actual system/base sheet events as well as generic events:
// a generic Application event alone is insufficient for every sheet renderer.
const sheetHooks = [
  'ActorSheet', 'ItemSheet', 'ProwlersParagonsActorSheet',
  'ProwlersParagonsItemSheet', 'ProwlersParagonsGMSheet'
];
for (const name of sheetHooks) {
  Hooks.on(`render${name}`, (app, html) => renderApp(app, html, true));
}
for (const name of ['Application', 'ApplicationV1', 'ApplicationV2', 'Dialog', 'DialogV2']) {
  Hooks.on(`render${name}`, (app, html) => renderApp(app, html));
}
function closeApp(app, html) {
  for (const root of [applicationRoots.get(app), elementOf(app.element), elementOf(html)]) {
    if (!root) continue;
    observers.get(root)?.disconnect();
    observers.delete(root);
  }
  applicationRoots.delete(app);
}
for (const name of [...sheetHooks, 'Application', 'ApplicationV1', 'ApplicationV2', 'Dialog', 'DialogV2']) {
  Hooks.on(`close${name}`, closeApp);
}

function scanSheetWindows(node) {
  if (!node?.querySelectorAll || !active()) return;
  const selector = `.window-app.${SYSTEM_ID}, .application.${SYSTEM_ID}, form.${SYSTEM_ID}`;
  const matches = [...node.querySelectorAll(selector)];
  const ancestor = node.closest?.(selector);
  if (ancestor) matches.unshift(ancestor);
  const roots = new Set(matches.map(sheet => sheet.closest('.window-app, .application') ?? sheet));
  for (const root of roots) {
    if (observers.has(root)) continue;
    if (root.querySelector('.sheet-tabs, .sheet-body, .sheet-header')) decorate(root, localizeSheet);
  }
}

function initializeOpenSheets() {
  const legacy = Object.values(globalThis.ui?.windows ?? {});
  const modern = globalThis.foundry?.applications?.instances;
  const applications = new Set([...legacy, ...(modern?.values?.() ?? [])]);
  for (const app of applications) renderApp(app, app.element);
  const body = globalThis.document?.body;
  if (!body) return;
  scanSheetWindows(body);
  // Some sheet renderers replace/attach their form after dispatching a hook.
  // Watch added elements only, never body text/attributes. Once a system sheet
  // is found its own bounded observer handles text and partial rerenders.
  const windowsObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) scanSheetWindows(node);
      }
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1 || node.isConnected) continue;
        for (const root of [node, ...node.querySelectorAll('.pnp-ru')]) {
          observers.get(root)?.disconnect();
          observers.delete(root);
        }
      }
    }
  });
  windowsObserver.observe(body, { childList: true, subtree: true });
}

function renderMessage(message, html) {
  if (!active()) return;
  // Recognition by the system's CHAT_TEMPLATE, not merely by .dice-roll:
  // core dice messages and unrelated modules have .dice-roll too.
  const root = elementOf(html);
  const minion = message.rolls?.some(roll => roll.options?.count !== undefined
    && typeof roll.options.offense === 'boolean') ?? false;
  for (const card of root?.querySelectorAll('.dice-roll') ?? []) {
    if (card.querySelector('.opposed-roll')) decorate(card, node => localizeChat(node, { minion }));
  }
}
Hooks.on('renderChatMessageHTML', renderMessage);

Hooks.once('ready', () => {
  if (!active()) return;
  initializeOpenSheets();
  // Register after the system adds its menu hooks during init, so its entries
  // exist before we translate them.
  Hooks.on('getChatMessageContextOptions', (_html, options) => {
    if (!active()) return;
    for (const entry of options) {
      if (entry.name === 'Reroll') entry.name = 'PNP_RU.Chat.Reroll';
      if (entry.name === 'Explode 6s') entry.name = 'PNP_RU.Chat.Explode';
    }
  });
  // The system exposes these settings as English literals rather than i18n keys.
  const labels = {
    gearLimit: 'GearLimit', heroPointBudget: 'HeroPointBudget',
    traditionalResults: 'TraditionalResults', randomInitiative: 'RandomInitiative',
    reducedSwinginess: 'ReducedSwinginess'
  };
  for (const [key, label] of Object.entries(labels)) {
    const setting = game.settings.settings.get(`${SYSTEM_ID}.${key}`);
    if (setting) {
      setting.name = `PNP_RU.SystemSettings.${label}.Name`;
      setting.hint = `PNP_RU.SystemSettings.${label}.Hint`;
    }
  }
});
