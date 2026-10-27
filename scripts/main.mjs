import { isSystemDialog, localizeSheet, localizeDialog, localizeChat } from './ui.mjs';

export const MODULE_ID = 'pnp-russian';
export const SYSTEM_ID = 'prowlers-and-paragons';

export function active() {
  return game.system.id === SYSTEM_ID && /^ru(?:[-_]|$)/i.test(game.i18n.lang);
}

export function elementOf(html) {
  return html?.nodeType === 1 ? html : html?.[0];
}

// Observers are bounded to rendered applications/cards, never the document body.
// Disconnect while changing text to avoid an observer/translation feedback loop.
const observers = new WeakMap();
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

function renderApp(app, html) {
  if (!active()) return;
  const root = elementOf(html) ?? elementOf(app.element);
  if (!root) return;
  const classes = app.options?.classes ?? [];
  const template = app.template ?? app.options?.template ?? '';
  const systemSheet = classes.includes(SYSTEM_ID)
    || template.startsWith(`systems/${SYSTEM_ID}/templates/actor/`)
    || template.startsWith(`systems/${SYSTEM_ID}/templates/item/`);
  if (systemSheet) decorate(root, localizeSheet);
  else if (isSystemDialog(app, root)) decorate(root, localizeDialog);
}

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'roboto', {
    name: 'PNP_RU.Settings.RobotoName',
    hint: 'PNP_RU.Settings.RobotoHint',
    scope: 'client', config: true, type: Boolean, default: true, requiresReload: true
  });
});

// Both Foundry generations use AppV1 system sheets/roll dialogs and DialogV2
// for opposed rolls. Generic render hooks cover both without altering classes.
Hooks.on('renderApplication', renderApp);
Hooks.on('renderApplicationV2', renderApp);
Hooks.on('closeApplication', (_app, html) => {
  const root = elementOf(html) ?? elementOf(_app.element);
  if (root) { observers.get(root)?.disconnect(); observers.delete(root); }
});
Hooks.on('closeApplicationV2', (_app, html) => {
  const root = elementOf(html) ?? elementOf(_app.element);
  if (root) { observers.get(root)?.disconnect(); observers.delete(root); }
});

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
