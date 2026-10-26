/**
 * Modulo per la gestione dell'archivio personale di pittogrammi CAA personalizzati (creati con IA).
 * Permette salvataggio con nome/parola chiave, ricerca, riutilizzo e cancellazione.
 */

const STORAGE_KEY = 'caa_custom_pictograms';

export const CustomPictogramsManager = {
  /**
   * Recupera tutti i pittogrammi personalizzati salvati nell'archivio locale.
   * @returns {Array<Object>}
   */
  getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Errore recupero simboli personalizzati:', e);
      return [];
    }
  },

  /**
   * Salva un nuovo pittogramma personalizzato nell'archivio.
   * @param {Object} params
   * @param {string} params.name - Nome o parola chiave associata (es. 'REGINA TRAVESTITA')
   * @param {string} params.imageUrl - Data URI SVG del simbolo
   * @param {string} [params.prompt] - Prompt testuale usato per la generazione
   * @returns {Object} Il pittogramma salvato
   */
  save({ name, imageUrl, prompt = '' }) {
    if (!name || !imageUrl) {
      throw new Error('Nome e immagine sono obbligatori per salvare il simbolo.');
    }

    const cleanName = String(name).trim().toLocaleUpperCase('it-IT');
    const items = this.getAll();

    // Se esiste già un simbolo con lo stesso ID, aggiorna; altrimenti aggiunge
    const id = 'custom_' + Date.now();
    const newPicto = {
      id,
      name: cleanName,
      imageUrl,
      prompt: prompt || cleanName,
      createdAt: new Date().toISOString()
    };

    // Aggiunge all'inizio della lista
    items.unshift(newPicto);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return newPicto;
  },

  /**
   * Elimina un pittogramma dall'archivio personale.
   * @param {string} id 
   */
  delete(id) {
    let items = this.getAll();
    items = items.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
