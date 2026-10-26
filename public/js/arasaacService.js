/**
 * Servizio per l'integrazione con le API pubbliche di ARASAAC.
 * Gestisce ricerca in lingua italiana, mappatura sinonimi, caching e recupero immagini.
 */

export const ArasaacService = {
  BASE_API_URL: 'https://api.arasaac.org/api/pictograms/it',
  STATIC_IMG_URL: 'https://static.arasaac.org/pictograms',
  cache: new Map(),

  // Mappa diretta garantita per parole grammaticali frequenti e particelle CAA
  DIRECT_MAP: {
    // Congiunzioni e avverbi
    'e': 11399,
    'ed': 11399,
    'o': 31550,
    'oppure': 31550,
    'ma': 31549,
    'però': 31549,
    'perché': 31551,
    'poiché': 31551,
    'se': 31552,
    'non': 5526,
    'no': 5526,
    'sì': 5528,
    'anche': 31548,
    'molto': 2503,
    'poco': 2504,
    'subito': 32154,
    'dopo': 7034,
    'prima': 7034,
    'poi': 7034,
    'sempre': 31548,
    
    // Preposizioni semplici e articolate
    'in': 7034,
    'nel': 7034,
    'nello': 7034,
    'nella': 7034,
    'nei': 7034,
    'negli': 7034,
    'nelle': 7034,
    'dentro': 7034,
    'con': 7064,
    'col': 7064,
    'coi': 7064,
    'insieme': 7064,
    'su': 7164,
    'sul': 7164,
    'sullo': 7164,
    'sulla': 7164,
    'sui': 7164,
    'sugli': 7164,
    'sulle': 7164,
    'sopra': 7164,
    'sotto': 7163,
    'di': 31548,
    'del': 31548,
    'dello': 31548,
    'della': 31548,
    'dei': 31548,
    'degli': 31548,
    'delle': 31548,
    'da': 7001,
    'dal': 7001,
    'dallo': 7001,
    'dalla': 7001,
    'dai': 7001,
    'dagli': 7001,
    'dalle': 7001,
    'a': 7034,
    'al': 7034,
    'allo': 7034,
    'alla': 7034,
    'ai': 7034,
    'agli': 7034,
    'alle': 7034,
    'verso': 7034,
    'per': 7034,
    'tra': 7064,
    'fra': 7064,

    // Verbi ausiliari e di stato
    'è': 36480,
    'era': 36480,
    'sono': 36480,
    'essere': 36480,
    'c\'era': 36480,
    'ha': 7015,
    'hanno': 7015,
    'avere': 7015,
    'fa': 7015,
    'fanno': 7015,
    'fare': 7015,
    'va': 32154,
    'vanno': 32154,
    'andare': 32154,

    // Pronomi e numeri
    'tutti': 5596,
    'tutto': 5596,
    'uno': 5456,
    'due': 5457,
    'tre': 5458,
    'quattro': 5459,
    'cinque': 5460,
    'sei': 5461,
    'sette': 5462,
    'otto': 5463,
    'nove': 5464,
    'dieci': 5465
  },

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
    'mattone': ['mattone', 'costruzione'],
    'paglia': ['paglia', 'fieno'],
    'legno': ['legno', 'albero'],
    'fretta': ['veloce', 'correre'],
    'frettoloso': ['veloce', 'correre'],
    'pigro': ['dormire', 'stanco', 'riposare'],
    'pigrizia': ['dormire', 'riposare'],
    'saggio': ['pensare', 'intelligente', 'sapere'],
    'protegge': ['proteggere', 'difendere', 'casa'],
    'proteggono': ['proteggere', 'difendere'],
    'costruisce': ['costruire', 'fare', 'lavorare'],
    'costruiscono': ['costruire', 'fare', 'lavorare'],
    'mangia': ['mangiare', 'cibo'],
    'mangiano': ['mangiare', 'cibo'],
    'dorme': ['dormire', 'letto'],
    'dormono': ['dormire', 'letto'],
    'bacia': ['baciare', 'amore'],
    'bacio': ['baciare', 'amore'],
    'sveglia': ['svegliarsi', 'alzarsi'],
    'svegliano': ['svegliarsi', 'alzarsi'],
    'nani': ['nano', 'gnomo'],
    'bosco': ['foresta', 'albero'],
    'mela': ['mela', 'frutta'],
    'strega': ['strega', 'mago'],
    'regina': ['regina', 'principessa'],
    're': ['re', 'principe']
  },

  /**
   * Normalizza una parola (rimuove punteggiatura, spazi superflui, minuscole).
   */
  normalizeTerm(term) {
    if (!term) return '';
    return term.trim().toLowerCase().replace(/[.,;:!?()"'«»]/g, '');
  },

  /**
   * Genera varianti morfologiche italiane (lemmatizzazione verbi e singolari).
   */
  generateMorphologicalVariants(term) {
    if (!term || term.length < 3) return [];
    const variants = [];
    const t = term.toLowerCase();

    // Verbi coniugati
    if (t.endsWith('iscono')) {
      variants.push(t.slice(0, -6) + 'ire');
    } else if (t.endsWith('isce')) {
      variants.push(t.slice(0, -4) + 'ire');
    } else if (t.endsWith('ano')) {
      variants.push(t.slice(0, -3) + 'are');
    } else if (t.endsWith('ono')) {
      variants.push(t.slice(0, -3) + 'ere');
      variants.push(t.slice(0, -3) + 'ire');
      variants.push(t.slice(0, -3) + 'are');
    } else if (t.endsWith('a') && t.length > 3) {
      variants.push(t.slice(0, -1) + 'are');
    } else if (t.endsWith('e') && t.length > 3) {
      variants.push(t.slice(0, -1) + 'ere');
      variants.push(t.slice(0, -1) + 'ire');
    }

    // Plurali
    if (t.endsWith('ini')) {
      variants.push(t.slice(0, -3) + 'ino');
      variants.push(t.slice(0, -3) + 'o');
    } else if (t.endsWith('etti')) {
      variants.push(t.slice(0, -4) + 'etto');
    } else if (t.endsWith('elli')) {
      variants.push(t.slice(0, -4) + 'ello');
    } else if (t.endsWith('i') && t.length > 3) {
      variants.push(t.slice(0, -1) + 'o');
      variants.push(t.slice(0, -1) + 'e');
    } else if (t.endsWith('e') && t.length > 3) {
      variants.push(t.slice(0, -1) + 'a');
    }

    return variants;
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
   * Trova il miglior pittogramma per una data parola con strategie di espansione sinonimi e lemmatizzazione.
   * @param {string} word 
   * @param {string} lemmaTerm - Lemma o infinito suggerito dall'IA
   */
  async getBestPictogram(word, lemmaTerm = null) {
    const normWord = this.normalizeTerm(word);
    const normLemma = this.normalizeTerm(lemmaTerm);

    // 1. Controllo immediato DIRECT_MAP
    const directId = this.DIRECT_MAP[normWord] || (normLemma ? this.DIRECT_MAP[normLemma] : null);
    if (directId) {
      return {
        id: directId,
        imageUrl: this.getPictogramImageUrl(directId),
        matchedTerm: normWord,
        alternatives: [{ id: directId, imageUrl: this.getPictogramImageUrl(directId) }]
      };
    }

    // 2. Costruzione lista candidati intelligente
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

    // Aggiunta varianti morfologiche (lemmatizzazione verbi e plurali)
    for (const v of [...this.generateMorphologicalVariants(normWord), ...this.generateMorphologicalVariants(normLemma)]) {
      if (v && !candidates.includes(v)) {
        candidates.push(v);
      }
    }

    // Ricerca sequenziale con cache
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
