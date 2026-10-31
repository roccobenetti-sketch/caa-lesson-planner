/**
 * Modulo di configurazione per CAA IN-Book Studio.
 * Gestisce chiavi API Gemini, selezione modello e preferenze di visualizzazione IN-Book.
 */

export const ConfigManager = {
  STORAGE_KEY_API: 'caa_gemini_api_key',
  STORAGE_KEY_MODEL: 'caa_gemini_model',
  STORAGE_KEY_INBOOK_PREFS: 'caa_inbook_preferences',

  state: {
    apiKey: '',
    defaultApiKey: '',
    model: 'gemini-3.1-flash-lite',
    isCustomKey: false,
    preferences: {
      highlightOrigins: true,      // Evidenzia pittogrammi IA (viola), Da verificare (ambra), Personali (blu)
      showGrammarMarkers: true,    // Mostra marcatori IN-Book nel box (+ plurale, <- passato, -> futuro)
      textPosition: 'bottom',      // 'bottom' (standard IN-Book sotto il simbolo) o 'top'
      uppercaseLabels: true,       // Testo rigorosamente in STAMPATO MAIUSCOLO
      defaultAiStyle: 'stylized',  // 'stylized' (CAA ARASAAC), 'storybook' (Fiabesco), 'realistic'
      autoGenerateMissingAi: true  // Genera automaticamente con IA i simboli non presenti in ARASAAC
    },
    availableModels: [
      { id: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite ⚡ (Consigliato)' },
      { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash' },
      { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
      { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
      { id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview' }
    ]
  },

  async init() {
    const savedKey = localStorage.getItem(this.STORAGE_KEY_API);
    const savedModel = localStorage.getItem(this.STORAGE_KEY_MODEL);
    const savedPrefs = localStorage.getItem(this.STORAGE_KEY_INBOOK_PREFS);

    if (savedModel) {
      this.state.model = savedModel;
    }
    if (savedPrefs) {
      try {
        const parsed = JSON.parse(savedPrefs);
        this.state.preferences = { ...this.state.preferences, ...parsed };
      } catch (err) {
        console.warn('Ripristino preferenze IN-Book predefinite:', err);
      }
    }

    try {
      let resp = await fetch('/api/config');
      if (!resp.ok) {
        resp = await fetch('https://caa-api.roccobenetti.workers.dev/api/config');
      }
      if (resp.ok) {
        const data = await resp.json();
        this.state.defaultApiKey = data.defaultApiKey || '';
        if (!savedModel && data.defaultModel) {
          this.state.model = data.defaultModel;
        }
      }
    } catch (err) {
      console.warn('Configurazione remota non raggiungibile, uso storage locale:', err.message);
    }

    if (savedKey && savedKey.trim() !== '') {
      this.state.apiKey = savedKey.trim();
      this.state.isCustomKey = true;
    } else {
      this.state.apiKey = this.state.defaultApiKey;
      this.state.isCustomKey = false;
    }
  },

  getActiveApiKey() {
    return this.state.apiKey || this.state.defaultApiKey || '';
  },

  saveSettings({ apiKey, model }) {
    if (apiKey && apiKey.trim() !== '') {
      this.state.apiKey = apiKey.trim();
      this.state.isCustomKey = true;
      localStorage.setItem(this.STORAGE_KEY_API, this.state.apiKey);
    } else {
      this.state.apiKey = this.state.defaultApiKey;
      this.state.isCustomKey = false;
      localStorage.removeItem(this.STORAGE_KEY_API);
    }

    if (model) {
      this.state.model = model;
      localStorage.setItem(this.STORAGE_KEY_MODEL, model);
    }
  },

  updatePreferences(partialPrefs) {
    this.state.preferences = {
      ...this.state.preferences,
      ...partialPrefs
    };
    localStorage.setItem(this.STORAGE_KEY_INBOOK_PREFS, JSON.stringify(this.state.preferences));
  }
};
