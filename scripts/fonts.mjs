const MODULE_ID = 'pnp-russian';
export const DEFAULT_FONT = 'Roboto';
const validFamily = family => typeof family === 'string' && family.trim()
  && !/[\x00-\x1f\x7f]/.test(family)
  && !/^(?:Font\s*Awesome|Material(?: Design)? (?:Icons|Symbols)|IcoMoon)\b/i.test(family);

function fontConfig() {
  return globalThis.foundry?.applications?.settings?.menus?.FontConfig
    ?? globalThis.foundry?.applications?.apps?.FontConfig
    ?? globalThis.FontConfig;
}

function availableChoices() {
  const config = fontConfig();
  for (const method of ['getAvailableFontChoices', 'getAvailableFonts']) {
    if (typeof config?.[method] !== 'function') continue;
    // FontConfig is not initialized yet during some init callbacks. At ready
    // its public list is authoritative: it excludes fonts that failed to load.
    try {
      const available = config[method]();
      if (Array.isArray(available)) return available.map(family => [family, family]);
      if (available && typeof available === 'object') return Object.entries(available);
    } catch { /* Use registered definitions until FontConfig is ready. */ }
  }
  const custom = game.settings.settings?.has('core.fonts') ? game.settings.get('core', 'fonts') : {};
  const definitions = { ...globalThis.CONFIG?.fontDefinitions, ...custom };
  return Object.entries(definitions).filter(([, definition]) => definition?.editor === true)
    .map(([family]) => [family, family]);
}

export function fontChoices() {
  const labelKey = 'PNP_RU.Fonts.RobotoDefault';
  const localized = game.i18n?.localize?.(labelKey);
  const label = localized && localized !== labelKey ? localized : 'Roboto (по умолчанию)';
  const seen = new Set(['roboto', 'pnp roboto']);
  const available = [];
  for (const [family, label] of availableChoices()) {
    if (!validFamily(family)) continue;
    const identity = family.trim().toLocaleLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    available.push([family, typeof label === 'string' ? label : family]);
  }
  available.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries([[DEFAULT_FONT, label], ...available]);
}

export function applyFont(root, choices = fontChoices()) {
  const saved = game.settings.get(MODULE_ID, 'sheetFont');
  const selected = Object.hasOwn(choices, saved) ? saved : DEFAULT_FONT;
  // A CSS string prevents names containing quotes/semicolons becoming CSS.
  // The bundled Cyrillic face also supplies glyphs missing in another family.
  const family = selected === DEFAULT_FONT ? 'PnP Roboto' : selected;
  root.style.setProperty('--pnp-font-family', selected === DEFAULT_FONT
    ? '"PnP Roboto", sans-serif'
    : `${JSON.stringify(family)}, "PnP Roboto", sans-serif`);
  root.classList.add('pnp-ru-font');
}

export function refreshFonts() {
  const choices = fontChoices();
  for (const root of globalThis.document?.querySelectorAll('.pnp-ru') ?? []) applyFont(root, choices);
}

export function refreshFontChoices() {
  const choices = fontChoices();
  const setting = game.settings.settings?.get(`${MODULE_ID}.sheetFont`);
  if (setting) setting.choices = choices;
  return choices;
}

function renderFontSetting(_app, html) {
  const choices = refreshFontChoices();
  refreshFonts();
  const root = html?.nodeType === 1 ? html : html?.[0];
  const select = root?.querySelector(`select[name="${MODULE_ID}.sheetFont"]`);
  if (!select) return;
  const saved = game.settings.get(MODULE_ID, 'sheetFont');
  const selected = Object.hasOwn(choices, saved) ? saved : DEFAULT_FONT;
  // SettingsConfig has already prepared its context by this hook. Update the
  // actual dropdown too, so fonts registered late appear on its first opening.
  const options = Object.entries(choices).map(([family, label]) => {
    const option = select.ownerDocument.createElement('option');
    option.value = family; option.textContent = label;
    option.selected = family === selected;
    return option;
  });
  select.replaceChildren(...options);
}

export function registerFontSettings() {
  game.settings.register(MODULE_ID, 'sheetFont', {
    name: 'PNP_RU.Settings.FontName', hint: 'PNP_RU.Settings.FontHint',
    scope: 'client', config: true, type: String, default: DEFAULT_FONT,
    choices: fontChoices(), onChange: refreshFonts
  });
  for (const hook of ['renderSettingsConfig', 'renderSettingsConfigV2']) Hooks.on(hook, renderFontSetting);
}

export function initializeFonts() {
  refreshFontChoices();
  refreshFonts();
  globalThis.document?.fonts?.addEventListener('loadingdone', () => {
    refreshFontChoices(); refreshFonts();
  });
}
