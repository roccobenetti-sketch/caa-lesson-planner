/**
 * Servizio per l'integrazione con le API pubbliche di ARASAAC.
 * Gestisce ricerca in lingua italiana, mappatura sinonimi, caching e recupero immagini.
 */

export const ArasaacService = {
  BASE_API_URL: 'https://api.arasaac.org/api/pictograms/it',
  STATIC_IMG_URL: 'https://static.arasaac.org/pictograms',
  cache: new Map(),

  // Mappa di lemmatizzazione e sinonimi italiani per termini frequenti in CAA
  SYNONYM_MAP: {
    'partono': ['partire', 'andare via', 'partenza', 'viaggiare', 'uscire'],
    'partire': ['andare via', 'partenza', 'viaggiare', 'uscire'],
    'parte': ['andare via', 'partenza', 'viaggiare', 'uscire'],
    'scappano': ['scappare', 'fuggire', 'correre', 'andare via'],
    'scappa': ['scappare', 'fuggire', 'correre'],
    'fuga': ['scappare', 'fuggire', 'correre'],
    'crolla': ['cadere', 'rompere', 'distruggere'],
    'crollano': ['cadere', 'rompere', 'distruggere'],
    'crollo': ['cadere', 'rompere'],
    'soffia': ['soffiare', 'vento'],
    'soffiano': ['soffiare', 'vento'],
    'resiste': ['forte', 'duro', 'sicuro', 'proteggere'],
    'resistono': ['forte', 'sicuro', 'proteggere'],
    'salvi': ['salvo', 'sicuro', 'felice', 'proteggere'],
    'salvo': ['sicuro', 'felice', 'proteggere'],
    'salvezza': ['sicuro', 'proteggere', 'aiutare'],
    'porcellini': ['maiale', 'maialino'],
    'porcellino': ['maiale', 'maialino'],
    'mattoni': ['mattone', 'costruzione'],
    'paglia': ['paglia', 'fieno'],
    'fretta': ['veloce', 'correre'],
    'frettoloso': ['veloce', 'correre'],
    'pigro': ['dormire', 'stanco', 'riposare'],
    'pigrizia': ['dormire', 'riposare'],
    'saggio': ['pensare', 'intelligente', 'sapere'],
    'protegge': ['proteggere', 'difendere', 'casa'],
    'proteggono': ['proteggere', 'difendere']
  },

  /**
   * Normalizza una parola (rimuove punteggiatura, spazi superflui, minuscole).
   */
  normalizeTerm(term) {
    if (!term) return '';
    return term.trim().toLowerCase().replace(/[.,;:!?()"'«»]/g, '');
  },

  /**
   * Cerca pittogrammi su ARASAAC per un dato termine in lingua italiana.
   * @param {string} rawTerm 
   * @returns {Promise<Array<{id: number, keywords: Array<string>}>>}
   */
  async searchPictograms(rawTerm) {
    const term = this.normalizeTerm(rawTerm);
    if (!term) return [];

    if (this.cache.has(term)) {
      return this.cache.get(term);
    }

    try {
      const response = await fetch(`${this.BASE_API_URL}/search/${encodeURIComponent(term)}`);
      if (!response.ok) {
        if (response.status === 404) {
          this.cache.set(term, []);
          return [];
        }
        throw new Error(`Errore ARASAAC HTTP ${response.status}`);
      }

      const results = await response.json();
      const list = Array.isArray(results) ? results : [];
      this.cache.set(term, list);
      return list;
    } catch (err) {
      console.warn(`Ricerca ARASAAC per "${term}":`, err.message);
      return [];
    }
  },

  /**
   * Restituisce l'URL dell'immagine di un pittogramma a partire dal suo ID.
   * @param {number|string} pictogramId 
   * @param {number} resolution (es. 500 o 300)
   */
  getPictogramImageUrl(pictogramId, resolution = 500) {
    if (!pictogramId) return null;
    return `${this.STATIC_IMG_URL}/${pictogramId}/${pictogramId}_${resolution}.png`;
  },

  /**
   * Trova il miglior pittogramma per una data parola con strategie di espansione sinonimi.
   * @param {string} word 
   * @param {string} lemmaTerm - Lemma o infinito suggerito dall'IA
   */
  async getBestPictogram(word, lemmaTerm = null) {
    const normWord = this.normalizeTerm(word);
    const normLemma = this.normalizeTerm(lemmaTerm);

    const candidates = [];
    if (normLemma) candidates.push(normLemma);
    if (normWord && normWord !== normLemma) candidates.push(normWord);

    // Aggiunta sinonimi mappati
    const synonyms = [
      ...(this.SYNONYM_MAP[normWord] || []),
      ...(this.SYNONYM_MAP[normLemma] || [])
    ];
    for (const syn of synonyms) {
      const normSyn = this.normalizeTerm(syn);
      if (normSyn && !candidates.includes(normSyn)) {
        candidates.push(normSyn);
      }
    }

    for (const term of candidates) {
      if (!term) continue;
      const results = await this.searchPictograms(term);
      if (results.length > 0) {
        // Cerca prima un pittogramma contrassegnato con aacColor o aac
        const preferred = results.find(item => item.aacColor === true) || results[0];
        return {
          id: preferred._id,
          imageUrl: this.getPictogramImageUrl(preferred._id),
          matchedTerm: term,
          alternatives: results.slice(0, 8).map(r => ({
            id: r._id,
            imageUrl: this.getPictogramImageUrl(r._id)
          }))
        };
      }
    }

    return null;
  }
};
