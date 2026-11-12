/**
 * Modulo di configurazione per CAA Lesson Planner.
 * Gestisce chiavi API, modelli Gemini e persistenza locale nel browser.
 */

import { AuthManager } from './authManager.js';

export const ConfigManager = {
  STORAGE_KEY_API: 'caa_gemini_api_key',
  STORAGE_KEY_MODEL: 'caa_gemini_model',
  STORAGE_KEY_UPPERCASE: 'caa_pref_uppercase',
  STORAGE_KEY_COLOR_BORDERS: 'caa_pref_color_borders',
  DEFAULT_FALLBACK_API_KEY: '',

  state: {
    apiKey: '',
    defaultApiKey: '',
    model: 'gemini-3.1-flash-lite',
    isCustomKey: false,
    useUppercase: true,
    useColorBorders: true,
    availableModels: [
      { id: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite ⚡ (Consigliato)" },
      { id: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash Lite" },
      { id: "gemini-flash-lite-latest", displayName: "Gemini Flash Lite Latest" },
      { id: "gemini-flash-latest", displayName: "Gemini Flash Latest" },
      { id: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash (Alta qualità)" },
      { id: "gemini-3.7-flash", displayName: "Gemini 3.7 Flash" },
      { id: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview" }
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
      // Migrazione automatica se nel localStorage dell'utente è rimasto un vecchio modello dismesso da Google (1.5, 2.0, 2.5)
      if (savedModel.includes('1.5') || savedModel.includes('2.0') || savedModel.includes('2.5')) {
        this.state.model = 'gemini-3.1-flash-lite';
        localStorage.setItem(this.STORAGE_KEY_MODEL, 'gemini-3.1-flash-lite');
      } else {
        this.state.model = savedModel;
      }
    }

    // 2. Recupera la configurazione (server locale o Cloud Worker)
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
      console.warn('Funzionamento in modalità standalone.');
    }

    // 3. Determina la chiave effettiva da utilizzare
    if (savedKey) {
      this.state.apiKey = savedKey;
      this.state.isCustomKey = true;
    } else if (this.state.defaultApiKey) {
      this.state.apiKey = this.state.defaultApiKey;
      this.state.isCustomKey = false;
    } else {
      this.state.apiKey = this.DEFAULT_FALLBACK_API_KEY;
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
    if (!key) return this.state.availableModels;

    try {
      const resp = await fetch(`/api/models?key=${encodeURIComponent(key)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.models && data.models.length > 0) {
          this.state.availableModels = data.models;
        }
        return this.state.availableModels;
      }
    } catch (e) {
      // Standalone/GitHub Pages: usa l'elenco statico predefinito
    }
    return this.state.availableModels;
  },

  getActiveApiKey() {
    if (AuthManager.isAuthenticated()) {
      const userKey = AuthManager.getUserApiKey();
      if (userKey && userKey.trim() !== '') {
        return userKey.trim();
      }
    }
    return this.state.apiKey || this.state.defaultApiKey || this.DEFAULT_FALLBACK_API_KEY;
  },

  setApiKey(key) {
    const trimmed = (key || '').trim();
    if (AuthManager.isAuthenticated() && !AuthManager.isAdmin()) {
      AuthManager.setUserApiKey(trimmed);
      this.state.apiKey = trimmed;
      this.state.isCustomKey = Boolean(trimmed);
      return;
    }

    if (trimmed) {
      this.state.apiKey = trimmed;
      this.state.isCustomKey = true;
      localStorage.setItem(this.STORAGE_KEY_API, trimmed);
      if (AuthManager.isAdmin()) {
        AuthManager.setUserApiKey(trimmed);
      }
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
