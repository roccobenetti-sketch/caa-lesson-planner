/**
 * Single State Owner per CAA IN-Book Studio.
 * Centralizza lo stato del libro IN-Book, l'archivio pittogrammi personalizzati,
 * le regole di associazione specifica dell'utente e i listener di aggiornamento UI.
 */

const CUSTOM_PICTO_KEY = 'caa_inbook_custom_pictograms';
const LEGACY_SHARED_KEY = 'caa_custom_pictograms_rocco';
const ASSOCIATIONS_KEY = 'caa_inbook_word_associations';
const CLOUD_PICTO_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/custom-pictograms';

export const StateStore = {
  state: {
    currentBook: {
      id: null,
      title: 'Il Piccolo Drago Curioso',
      subtitle: 'Lettura condivisa IN-Book in simboli',
      category: 'narrativa',
      translationMode: 'faithful', // 'faithful' (integrale parola per parola) o 'adapted' (semplificato in pagine)
      pages: []
    },
    customPictograms: [],
    wordAssociations: {}, // Mappa normalizzata: lemma/parola -> { imageUrl, prompt, source, arasaacId, updatedAt }
    activeTokenRef: null, // { pageIndex, sentenceIndex, tokenIndex }
    modeling: {
      isPlaying: false,
      activePageIndex: 0,
      activeSentenceIndex: -1,
      activeTokenIndex: -1,
      speechRate: 0.88
    }
  },

  listeners: new Set(),

  init() {
    this.loadCustomPictograms();
    this.loadWordAssociations();
    this.syncCloudPictograms();
  },

  subscribe(listenerFn) {
    this.listeners.add(listenerFn);
    return () => this.listeners.delete(listenerFn);
  },

  notify(eventType = 'state_updated') {
    for (const listener of this.listeners) {
      try {
        listener(this.state, eventType);
      } catch (err) {
        console.error('Errore listener StateStore:', err);
      }
    }
  },

  normalizeKey(text) {
    return String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[.,;:!?()"'«»]/g, '');
  },

  /**
   * Carica i pittogrammi personalizzati (unificando quelli creati in IN-Book Studio e nella suite CAA).
   */
  loadCustomPictograms() {
    const mergedMap = new Map();
    const keysToRead = [CUSTOM_PICTO_KEY, LEGACY_SHARED_KEY, 'caa_custom_pictograms'];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('caa_custom_pictograms_') && !keysToRead.includes(k)) {
        keysToRead.push(k);
      }
    }

    for (const key of keysToRead) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.imageUrl && item.name) {
              const uniqueId = item.id || `${item.name}_${item.createdAt || ''}`;
              mergedMap.set(uniqueId, item);
            }
          }
        }
      } catch (err) {
        console.warn(`Impossibile leggere archivio ${key}:`, err);
      }
    }

    this.state.customPictograms = Array.from(mergedMap.values()).sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
  },

  async syncCloudPictograms() {
    try {
      const resp = await fetch(`${CLOUD_PICTO_API}?user=rocco`, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.pictograms) && data.pictograms.length > 0) {
          const map = new Map();
          for (const item of this.state.customPictograms) {
            map.set(item.id || item.name, item);
          }
          for (const cloudItem of data.pictograms) {
            if (cloudItem && cloudItem.imageUrl) {
              map.set(cloudItem.id || cloudItem.name, cloudItem);
            }
          }
          this.state.customPictograms = Array.from(map.values());
          localStorage.setItem(CUSTOM_PICTO_KEY, JSON.stringify(this.state.customPictograms));
          this.notify('pictograms_synced');
        }
      }
    } catch (err) {
      // Silenzioso se offline
    }
  },

  saveCustomPictogram({ name, imageUrl, prompt = '', style = 'stylized', category = 'custom' }) {
    const cleanName = String(name || '').trim().toLocaleUpperCase('it-IT');
    if (!cleanName || !imageUrl) {
      throw new Error('Nome e immagine sono obbligatori per salvare il pittogramma.');
    }

    const newEntry = {
      id: `inbook_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      imageUrl,
      prompt: prompt || cleanName,
      style,
      category,
      createdAt: new Date().toISOString()
    };

    this.state.customPictograms.unshift(newEntry);
    localStorage.setItem(CUSTOM_PICTO_KEY, JSON.stringify(this.state.customPictograms));

    // Sincronizza anche nella chiave condivisa per renderlo visibile in tutta la suite CAA
    try {
      localStorage.setItem(LEGACY_SHARED_KEY, JSON.stringify(this.state.customPictograms));
    } catch (e) {
      console.warn('Quota storage locale quasi piena:', e);
    }

    this.notify('custom_pictogram_saved');
    return newEntry;
  },

  deleteCustomPictogram(id) {
    this.state.customPictograms = this.state.customPictograms.filter(item => item.id !== id);
    localStorage.setItem(CUSTOM_PICTO_KEY, JSON.stringify(this.state.customPictograms));
    this.notify('custom_pictogram_deleted');
  },

  /**
   * Gestione delle Regole di Associazione Specifica Utente (Parola/Lemma -> Simbolo fisso).
   */
  loadWordAssociations() {
    try {
      const raw = localStorage.getItem(ASSOCIATIONS_KEY);
      this.state.wordAssociations = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn('Errore caricamento associazioni parole:', err);
      this.state.wordAssociations = {};
    }
  },

  saveWordAssociation(wordOrLemma, { imageUrl, prompt = '', origin = 'custom', arasaacId = null }) {
    const normKey = this.normalizeKey(wordOrLemma);
    if (!normKey || !imageUrl) return;

    this.state.wordAssociations[normKey] = {
      word: normKey,
      imageUrl,
      prompt,
      origin,
      arasaacId,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(ASSOCIATIONS_KEY, JSON.stringify(this.state.wordAssociations));
    this.notify('associations_updated');
  },

  removeWordAssociation(wordOrLemma) {
    const normKey = this.normalizeKey(wordOrLemma);
    if (this.state.wordAssociations[normKey]) {
      delete this.state.wordAssociations[normKey];
      localStorage.setItem(ASSOCIATIONS_KEY, JSON.stringify(this.state.wordAssociations));
      this.notify('associations_updated');
    }
  },

  getAssociationForToken(word, lemma) {
    const normWord = this.normalizeKey(word);
    const normLemma = this.normalizeKey(lemma);

    if (normWord && this.state.wordAssociations[normWord]) {
      return this.state.wordAssociations[normWord];
    }
    if (normLemma && this.state.wordAssociations[normLemma]) {
      return this.state.wordAssociations[normLemma];
    }

    // Cerca anche nell'archivio personale se c'è un pittogramma con nome identico
    const customMatch = this.state.customPictograms.find(item => {
      const itemNorm = this.normalizeKey(item.name);
      return itemNorm === normWord || (normLemma && itemNorm === normLemma);
    });

    if (customMatch) {
      return {
        word: normWord || normLemma,
        imageUrl: customMatch.imageUrl,
        prompt: customMatch.prompt || customMatch.name,
        origin: 'custom',
        arasaacId: null
      };
    }

    return null;
  },

  /**
   * Aggiorna l'intero libro IN-Book corrente.
   */
  setBook(bookData) {
    this.state.currentBook = {
      id: bookData.id || null,
      title: bookData.title || 'Nuovo IN-Book',
      subtitle: bookData.subtitle || 'Testo in simboli per la lettura condivisa',
      category: bookData.category || 'narrativa',
      translationMode: bookData.translationMode || 'faithful',
      pages: Array.isArray(bookData.pages) ? bookData.pages : [],
      createdAt: bookData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.notify('book_loaded');
  },

  /**
   * Recupera un singolo token alle coordinate specificate.
   */
  getToken(pageIndex, sentenceIndex, tokenIndex) {
    const page = this.state.currentBook.pages[pageIndex];
    if (!page) return null;
    const sentence = page.sentences[sentenceIndex];
    if (!sentence) return null;
    return sentence.tokens[tokenIndex] || null;
  },

  /**
   * Aggiorna un singolo token o propaga la modifica a tutte le occorrenze nel libro.
   * @param {Object} coords - { pageIndex, sentenceIndex, tokenIndex }
   * @param {Object} updates - Campi del token da aggiornare
   * @param {'single'|'book'|'permanent'} [scope='single']
   */
  updateToken(coords, updates, scope = 'single') {
    const targetToken = this.getToken(coords.pageIndex, coords.sentenceIndex, coords.tokenIndex);
    if (!targetToken) return;

    const targetNormLabel = this.normalizeKey(targetToken.label);
    const targetNormLemma = this.normalizeKey(targetToken.lemma);

    // Applica al token selezionato
    Object.assign(targetToken, updates);

    // Se richiesto, propaga a tutte le occorrenze della stessa parola/lemma nel libro
    if (scope === 'book' || scope === 'permanent') {
      for (const page of this.state.currentBook.pages) {
        for (const sentence of page.sentences) {
          for (const token of sentence.tokens) {
            const normL = this.normalizeKey(token.label);
            const normM = this.normalizeKey(token.lemma);
            const isSameWord =
              (targetNormLabel && normL === targetNormLabel) ||
              (targetNormLemma && normM && normM === targetNormLemma);

            if (isSameWord) {
              if (updates.imageUrl !== undefined) token.imageUrl = updates.imageUrl;
              if (updates.origin !== undefined) token.origin = updates.origin;
              if (updates.arasaacId !== undefined) token.arasaacId = updates.arasaacId;
              if (updates.aiPrompt !== undefined) token.aiPrompt = updates.aiPrompt;
              if (updates.needsVerification !== undefined) token.needsVerification = updates.needsVerification;
            }
          }
        }
      }
    }

    // Se richiesto, salva anche come regola di associazione permanente
    if (scope === 'permanent' && updates.imageUrl) {
      this.saveWordAssociation(targetToken.label, {
        imageUrl: updates.imageUrl,
        prompt: updates.aiPrompt || targetToken.label,
        origin: updates.origin || 'custom',
        arasaacId: updates.arasaacId || null
      });
      if (targetToken.lemma && this.normalizeKey(targetToken.lemma) !== targetNormLabel) {
        this.saveWordAssociation(targetToken.lemma, {
          imageUrl: updates.imageUrl,
          prompt: updates.aiPrompt || targetToken.lemma,
          origin: updates.origin || 'custom',
          arasaacId: updates.arasaacId || null
        });
      }
    }

    this.notify('token_updated');
  },

  /**
   * Unisce il token corrente con quello successivo (per creare un'unica unità polirematica IN-Book).
   */
  mergeWithNextToken(pageIndex, sentenceIndex, tokenIndex) {
    const sentence = this.state.currentBook.pages[pageIndex]?.sentences[sentenceIndex];
    if (!sentence || tokenIndex < 0 || tokenIndex >= sentence.tokens.length - 1) return false;

    const current = sentence.tokens[tokenIndex];
    const next = sentence.tokens[tokenIndex + 1];

    current.label = `${current.label} ${next.label}`.trim();
    current.lemma = `${current.lemma || current.label}`.trim();
    current.isCompound = true;
    sentence.tokens.splice(tokenIndex + 1, 1);

    this.notify('token_merged');
    return true;
  },

  /**
   * Divide un token composto (con più parole) in singoli token separati.
   */
  splitCompoundToken(pageIndex, sentenceIndex, tokenIndex) {
    const sentence = this.state.currentBook.pages[pageIndex]?.sentences[sentenceIndex];
    if (!sentence) return false;
    const current = sentence.tokens[tokenIndex];
    if (!current) return false;

    const parts = String(current.label || '').trim().split(/\s+/);
    if (parts.length <= 1) return false;

    const newTokens = parts.map(word => ({
      id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: word.toLocaleUpperCase('it-IT'),
      lemma: word.toLowerCase(),
      pos: current.pos || 'noun',
      tense: 'none',
      plural: false,
      isCompound: false,
      origin: 'verify',
      needsVerification: true,
      imageUrl: current.imageUrl,
      alternatives: current.alternatives || []
    }));

    sentence.tokens.splice(tokenIndex, 1, ...newTokens);
    this.notify('token_split');
    return true;
  },

  /**
   * Inserisce un nuovo box dopo quello selezionato.
   */
  insertTokenAfter(pageIndex, sentenceIndex, tokenIndex, newLabel = 'NUOVA PAROLA') {
    const sentence = this.state.currentBook.pages[pageIndex]?.sentences[sentenceIndex];
    if (!sentence) return null;

    const cleanLabel = String(newLabel || 'PAROLA').trim().toLocaleUpperCase('it-IT');
    const newToken = {
      id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: cleanLabel,
      lemma: cleanLabel.toLowerCase(),
      pos: 'noun',
      tense: 'none',
      plural: false,
      isCompound: cleanLabel.includes(' '),
      origin: 'verify',
      needsVerification: true,
      imageUrl: '',
      alternatives: []
    };

    sentence.tokens.splice(tokenIndex + 1, 0, newToken);
    this.notify('token_inserted');
    return { pageIndex, sentenceIndex, tokenIndex: tokenIndex + 1 };
  },

  /**
   * Elimina un box dalla frase.
   */
  deleteToken(pageIndex, sentenceIndex, tokenIndex) {
    const sentence = this.state.currentBook.pages[pageIndex]?.sentences[sentenceIndex];
    if (!sentence || sentence.tokens.length <= 1) return false;
    sentence.tokens.splice(tokenIndex, 1);
    this.notify('token_deleted');
    return true;
  }
};
