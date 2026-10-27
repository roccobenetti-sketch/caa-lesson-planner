/**
 * Modulo per la gestione dell'archivio personale di pittogrammi CAA personalizzati (creati con IA).
 * Sincronizzazione automatica Cloud KV + Locale associata al profilo utente.
 */

import { AuthManager } from './authManager.js?v=2.5.0';

const STORAGE_KEY = 'caa_custom_pictograms';
const CLOUD_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/custom-pictograms';

export const CustomPictogramsManager = {
  getUsername() {
    return AuthManager.currentUser?.username?.toLowerCase() || 'rocco';
  },

  /**
   * Recupera tutti i pittogrammi personalizzati salvati nell'archivio locale e nel Cloud.
   * @returns {Array<Object>}
   */
  getAll() {
    const user = this.getUsername();
    try {
      const data = localStorage.getItem(`${STORAGE_KEY}_${user}`) || localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Errore recupero simboli personalizzati:', e);
      return [];
    }
  },

  /**
   * Sincronizza i pittogrammi dal Cloud in background.
   */
  async syncFromCloud() {
    const user = this.getUsername();
    try {
      const resp = await fetch(`${CLOUD_API}?user=${encodeURIComponent(user)}`, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        const cloudItems = data.pictograms || [];
        if (cloudItems.length > 0) {
          const localItems = this.getAll();
          const map = new Map();
          for (const item of localItems) map.set(item.id || item.name, item);
          for (const item of cloudItems) map.set(item.id || item.name, item);
          const merged = Array.from(map.values());
          localStorage.setItem(`${STORAGE_KEY}_${user}`, JSON.stringify(merged));
        }
      }
    } catch (e) {}
  },

  /**
   * Salva un nuovo pittogramma personalizzato nell'archivio locale e Cloud.
   */
  save({ name, imageUrl, prompt = '' }) {
    if (!name || !imageUrl) {
      throw new Error('Nome e immagine sono obbligatori per salvare il simbolo.');
    }

    const cleanName = String(name).trim().toLocaleUpperCase('it-IT');
    const items = this.getAll();
    const user = this.getUsername();

    const id = 'custom_' + Date.now();
    const newPicto = {
      id,
      name: cleanName,
      imageUrl,
      prompt: prompt || cleanName,
      createdAt: new Date().toISOString()
    };

    items.unshift(newPicto);
    localStorage.setItem(`${STORAGE_KEY}_${user}`, JSON.stringify(items));

    // Sincronizzazione Cloud in background
    fetch(CLOUD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, picto: newPicto })
    }).catch(() => {});

    return newPicto;
  },

  /**
   * Elimina un pittogramma dall'archivio personale e Cloud.
   * @param {string} id 
   */
  delete(id) {
    let items = this.getAll();
    const user = this.getUsername();
    items = items.filter(item => item.id !== id);
    localStorage.setItem(`${STORAGE_KEY}_${user}`, JSON.stringify(items));

    fetch(`${CLOUD_API}?user=${encodeURIComponent(user)}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }).catch(() => {});
  },

  /**
   * Filtra i pittogrammi per parola chiave.
   * @param {string} query 
   * @returns {Array<Object>}
   */
  search(query) {
    const items = this.getAll();
    if (!query || !query.trim()) return items;
    const q = query.trim().toLocaleUpperCase('it-IT');
    return items.filter(item => 
      (item.name && item.name.toLocaleUpperCase('it-IT').includes(q)) ||
      (item.prompt && item.prompt.toLocaleUpperCase('it-IT').includes(q))
    );
  },

  /**
   * Cerca se esiste un simbolo personalizzato per una specifica parola.
   * @param {string} word 
   * @returns {Object|null}
   */
  findExact(word) {
    if (!word) return null;
    const clean = word.trim().toLocaleUpperCase('it-IT');
    const items = this.getAll();
    return items.find(item => item.name === clean) || null;
  }
};
