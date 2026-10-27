const MODULE_ID = 'pnp-russian';
export const THEMES = Object.freeze(['dark', 'light', 'green']);
const PREFERENCES = ['world', ...THEMES];
const validTheme = value => THEMES.includes(value);
const preference = value => PREFERENCES.includes(value) ? value : 'world';

export function selectedSheetTheme() {
  const world = game.settings.get(MODULE_ID, 'worldTheme');
  // Flags belong to the User document. The client setting below is only the
  // settings form's control, synchronized from this flag on login and updates.
  const personal = game.user?.getFlag
    ? preference(game.user.getFlag(MODULE_ID, 'sheetTheme'))
    : preference(game.settings.get(MODULE_ID, 'personalTheme'));
  return validTheme(personal) ? personal : validTheme(world) ? world : 'light';
}

export function applySheetTheme(root) {
  root.classList.add('pnp-ru-sheet');
  root.dataset.pnpTheme = selectedSheetTheme();
}

export function refreshSheetThemes() {
  for (const root of globalThis.document?.querySelectorAll('.pnp-ru-sheet') ?? []) {
    applySheetTheme(root);
  }
}

export async function synchronizePersonalTheme() {
  if (game.user?.getFlag && game.settings.set) {
    const saved = preference(game.user.getFlag(MODULE_ID, 'sheetTheme'));
    if (game.settings.get(MODULE_ID, 'personalTheme') !== saved) {
      await game.settings.set(MODULE_ID, 'personalTheme', saved);
    }
  }
  refreshSheetThemes();
}

export function registerThemeSettings() {
  const choices = Object.fromEntries(THEMES.map(theme => [theme, `PNP_RU.Themes.${theme}`]));
  game.settings.register(MODULE_ID, 'worldTheme', {
    name: 'PNP_RU.Settings.WorldThemeName',
    hint: 'PNP_RU.Settings.WorldThemeHint',
    scope: 'world', config: true, type: String, default: 'light', choices,
    onChange: refreshSheetThemes
  });
  game.settings.register(MODULE_ID, 'personalTheme', {
    name: 'PNP_RU.Settings.PersonalThemeName',
    hint: 'PNP_RU.Settings.PersonalThemeHint',
    scope: 'client', config: true, type: String, default: 'world',
    choices: { world: 'PNP_RU.Themes.world', ...choices },
    onChange: async value => {
      const selected = preference(value);
      const saved = preference(game.user?.getFlag?.(MODULE_ID, 'sheetTheme'));
      if (game.user?.setFlag && selected !== saved) {
        await game.user.setFlag(MODULE_ID, 'sheetTheme', selected);
      }
      refreshSheetThemes();
    }
  });
  // Foundry broadcasts User updates to the user's other connected clients too.
  // Do not respond to another user's personal preference.
  Hooks.on('updateUser', user => {
    if (user.id === game.user?.id) {
      synchronizePersonalTheme().catch(error => console.error(`${MODULE_ID} | Theme update failed`, error));
    }
  });
}
