/**
 * Modulo di configurazione per CAA Lesson Planner.
 * Gestisce chiavi API, modelli Gemini e persistenza locale nel browser.
 */

export const ConfigManager = {
  STORAGE_KEY_API: 'caa_gemini_api_key',
  STORAGE_KEY_MODEL: 'caa_gemini_model',
  STORAGE_KEY_UPPERCASE: 'caa_pref_uppercase',
  STORAGE_KEY_COLOR_BORDERS: 'caa_pref_color_borders',

  state: {
    apiKey: '',
    defaultApiKey: '',
    model: 'gemini-3.1-flash-lite',
    isCustomKey: false,
    useUppercase: true,
    useColorBorders: true,
  },

  async init() {
    // 1. Legge le impostazioni salvate nel localStorage del browser
    const savedKey = localStorage.getItem(this.STORAGE_KEY_API);
    const savedModel = localStorage.getItem(this.STORAGE_KEY_MODEL);
    const savedUppercase = localStorage.getItem(this.STORAGE_KEY_UPPERCASE);
    const savedColors = localStorage.getItem(this.STORAGE_KEY_COLOR_BORDERS);

    if (savedUppercase !== null) {
      this.state.useUppercase = savedUppercase === 'true';
    }
    if (savedColors !== null) {
      this.state.useColorBorders = savedColors === 'true';
    }
    if (savedModel) {
      this.state.model = savedModel;
    }

    // 2. Interroga il server locale per verificare se è configurata una chiave predefinita
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        this.state.defaultApiKey = data.defaultApiKey || '';
        if (!savedModel && data.defaultModel) {
          this.state.model = data.defaultModel;
        }
      }
    } catch (err) {
      console.warn('Impossibile contattare /api/config. Funzionamento in modalità standalone.');
    }

    // 3. Determina la chiave effettiva da utilizzare
    if (savedKey) {
      this.state.apiKey = savedKey;
      this.state.isCustomKey = true;
    } else if (this.state.defaultApiKey) {
      this.state.apiKey = this.state.defaultApiKey;
      this.state.isCustomKey = false;
    }
  },

  getActiveApiKey() {
    return this.state.apiKey || this.state.defaultApiKey || '';
  },

  setApiKey(key) {
    const trimmed = (key || '').trim();
    if (trimmed) {
      this.state.apiKey = trimmed;
      this.state.isCustomKey = true;
      localStorage.setItem(this.STORAGE_KEY_API, trimmed);
    } else {
      this.resetToDefaultApiKey();
    }
  },

  resetToDefaultApiKey() {
    localStorage.removeItem(this.STORAGE_KEY_API);
    this.state.apiKey = this.state.defaultApiKey;
    this.state.isCustomKey = false;
  },

  setModel(modelName) {
    this.state.model = modelName;
    localStorage.setItem(this.STORAGE_KEY_MODEL, modelName);
  },

  setUppercase(enabled) {
    this.state.useUppercase = enabled;
    localStorage.setItem(this.STORAGE_KEY_UPPERCASE, enabled ? 'true' : 'false');
  },

  setColorBorders(enabled) {
    this.state.useColorBorders = enabled;
    localStorage.setItem(this.STORAGE_KEY_COLOR_BORDERS, enabled ? 'true' : 'false');
  }
};
