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
    availableModels: [
      { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite ⚡" },
      { id: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
      { id: "gemini-3.7-flash", displayName: "Gemini 3.7 Flash" },
      { id: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash" },
      { id: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite" },
      { id: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview" },
      { id: "gemini-flash-latest", displayName: "Gemini Flash Latest" },
      { id: "gemini-flash-lite-latest", displayName: "Gemini Flash Lite Latest" },
      { id: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash Lite" },
      { id: "gemini-3.1-flash-lite-preview", displayName: "Gemini 3.1 Flash Lite Preview" },
      { id: "gemini-omni-1.1-flash", displayName: "Gemini Omni 1.1 Flash" },
      { id: "gemini-omni-flash-preview", displayName: "Gemini Omni Flash Preview" },
      { id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview" },
      { id: "gemini-3.1-pro-preview-customtools", displayName: "Gemini 3.1 Pro CustomTools" },
      { id: "gemini-pro-latest", displayName: "Gemini Pro Latest" },
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" },
      { id: "deep-research-preview-04-2026", displayName: "Deep Research Preview" },
      { id: "deep-research-pro-preview-12-2025", displayName: "Deep Research Pro" },
      { id: "deep-research-max-preview-04-2026", displayName: "Deep Research Max" },
      { id: "gemini-3.1-flash-image", displayName: "Gemini 3.1 Flash Image" },
      { id: "gemini-3.1-flash-image-preview", displayName: "Gemini 3.1 Flash Image Preview" },
      { id: "gemini-3.1-flash-lite-image", displayName: "Gemini 3.1 Flash Lite Image" },
      { id: "gemini-3-pro-image", displayName: "Gemini 3 Pro Image" },
      { id: "gemini-3-pro-image-preview", displayName: "Gemini 3 Pro Image Preview" },
      { id: "gemini-2.5-flash-image", displayName: "Gemini 2.5 Flash Image" },
      { id: "gemini-4-argon", displayName: "Gemini 4 Argon" },
      { id: "gemini-nano-banana-2.1", displayName: "Gemini Nano Banana 2.1" },
      { id: "nano-banana-pro-preview", displayName: "Nano Banana Pro Preview" },
      { id: "gemini-robotics-er-2-preview", displayName: "Gemini Robotics ER-2" },
      { id: "gemini-2.5-computer-use-preview-10-2025", displayName: "Gemini 2.5 Computer Use" },
      { id: "gemma-4-31b-it", displayName: "Gemma 4 31B IT" },
      { id: "gemma-4-26b-a4b-it", displayName: "Gemma 4 26B IT" },
      { id: "antigravity-preview-latest", displayName: "Antigravity Preview Latest" },
      { id: "antigravity-preview-09-2026", displayName: "Antigravity Preview 09-2026" },
      { id: "antigravity-preview-05-2026", displayName: "Antigravity Preview 05-2026" },
      { id: "gemini-3.5-transcribe", displayName: "Gemini 3.5 Transcribe" },
      { id: "gemini-3.8-flash-tts", displayName: "Gemini 3.8 Flash TTS" },
      { id: "gemini-3.8-flash-lite-tts", displayName: "Gemini 3.8 Flash Lite TTS" },
      { id: "gemini-3.1-flash-tts-preview", displayName: "Gemini 3.1 Flash TTS Preview" },
      { id: "gemini-2.5-flash-preview-tts", displayName: "Gemini 2.5 Flash Preview TTS" },
      { id: "gemini-2.5-pro-preview-tts", displayName: "Gemini 2.5 Pro Preview TTS" },
      { id: "lyria-3.5", displayName: "Lyria 3.5" },
      { id: "lyria-3-pro-preview", displayName: "Lyria 3 Pro Preview" },
      { id: "lyria-3-clip-preview", displayName: "Lyria 3 Clip Preview" }
    ]
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

    // 4. Carica l'elenco di tutti i modelli disponibili
    await this.fetchAvailableModels();
  },

  /**
   * Recupera in tempo reale tutti i modelli supportati dalla chiave API.
   */
  async fetchAvailableModels() {
    const key = this.getActiveApiKey();
    try {
      const resp = await fetch(`/api/models?key=${encodeURIComponent(key)}`);
      if (resp.ok) {
        const data = await resp.json();
        this.state.availableModels = data.models || [];
        return this.state.availableModels;
      }
    } catch (e) {
      console.warn('Recupero elenco modelli live fallito:', e);
    }
    return [];
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
