/**
 * Servizio per l'integrazione con le API pubbliche di ARASAAC e simboli grammaticali IN-Book.
 * Gestisce ricerca in lingua italiana, disambiguazione grammaticale (evita l'errore "LA" = nota musicale),
 * mappatura sinonimi, rilevamento parole polisemiche da verificare e recupero alternative.
 */

export const ArasaacService = {
  BASE_API_URL: 'https://api.arasaac.org/api/pictograms/it',
  STATIC_IMG_URL: 'https://static.arasaac.org/pictograms',
  cache: new Map(),

  /**
   * Parole italiane ad alta polisemia: vengono segnalate con un indicatore di verifica
   * così l'utente può controllare che il simbolo scelto corrisponda al senso della frase.
   */
  POLYSEMOUS_TERMS: new Set([
    'porta', 'letto', 'pesca', 'piano', 'riso', 'sale', 'stato', 'volta',
    'pianta', 'penna', 'banco', 'foglio', 'corso', 'campo', 'passo', 'punto',
    'tempo', 'terra', 'camera', 'corona', 'operazione', 'radice', 'nucleo'
  ]),

  /**
   * Simboli geometrici standard IN-Book per gli articoli italiani e funtori grammaticali puri
   * (evita che "LA", "MI", "SI" vengano tradotti con note musicali da ARASAAC).
   */
  GRAMMATICAL_SVG_MAP: {
    'il': { type: 'article_def_m_s', label: 'IL' },
    'lo': { type: 'article_def_m_s', label: 'LO' },
    'l\'': { type: 'article_def_s', label: 'L\'' },
    'la': { type: 'article_def_f_s', label: 'LA' },
    'i': { type: 'article_def_m_p', label: 'I' },
    'gli': { type: 'article_def_m_p', label: 'GLI' },
    'le': { type: 'article_def_f_p', label: 'LE' },
    'un': { type: 'article_indef_m', label: 'UN' },
    'uno': { type: 'article_indef_m', label: 'UNO' },
    'una': { type: 'article_indef_f', label: 'UNA' },
    'un\'': { type: 'article_indef_f', label: 'UN\'' },
    'che': { type: 'connector_rel', label: 'CHE' },
    'chi': { type: 'question_who', label: 'CHI' },
    'si': { type: 'reflexive', label: 'SI' },
    'ci': { type: 'place_there', label: 'CI' },
    'ne': { type: 'partitive', label: 'NE' }
  },

  /**
   * Mappa diretta garantita per preposizioni, congiunzioni, ausiliari e avverbi frequenti su ARASAAC.
   */
  DIRECT_MAP: {
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
    'più': 31548,
    'meno': 32158,
    'tutto': 5596,
    'tutti': 5596,
    'tutte': 5596,
    'ogni': 5596,
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
    'è': 36480,
    'era': 36480,
    'erano': 36480,
    'sono': 36480,
    'essere': 36480,
    'c\'era': 36480,
    'c\'erano': 36480,
    'c\'è': 36480,
    'ha': 7015,
    'hanno': 7015,
    'aveva': 7015,
    'avevano': 7015,
    'avere': 7015,
    'fa': 7015,
    'fanno': 7015,
    'faceva': 7015,
    'fare': 7015,
    'va': 32154,
    'vanno': 32154,
    'andava': 32154,
    'andare': 32154,
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

  SYNONYM_MAP: {
    'c\'era una volta': ['fiaba', 'storia', 'libro', 'inizio'],
    'un giorno': ['giorno', 'sole', 'mattina'],
    'all\'improvviso': ['sorpresa', 'subito', 'veloce'],
    'andare a letto': ['dormire', 'letto'],
    'avere fame': ['fame', 'mangiare'],
    'avere sete': ['sete', 'bere'],
    'avere paura': ['paura', 'spaventato'],
    'prendere in giro': ['ridere', 'scherzare'],
    'porcellini': ['maiale', 'maialino'],
    'porcellino': ['maiale', 'maialino'],
    'cagnolino': ['cane', 'cucciolo'],
    'gattino': ['gatto'],
    'uccellino': ['uccello'],
    'bambini': ['bambino', 'ragazzi'],
    'bambine': ['bambina'],
    'camminava': ['camminare', 'passeggiare'],
    'camminavano': ['camminare', 'passeggiare'],
    'correva': ['correre'],
    'guardava': ['guardare', 'vedere', 'osservare'],
    'viveva': ['vivere', 'abitare', 'casa'],
    'abitava': ['abitare', 'casa'],
    'chiamava': ['chiamare', 'nome'],
    'disse': ['dire', 'parlare'],
    'rispose': ['rispondere', 'parlare'],
    'chiese': ['chiedere', 'domanda'],
    'vide': ['vedere', 'guardare'],
    'sentì': ['sentire', 'ascoltare'],
    'arrivò': ['arrivare'],
    'tornò': ['tornare'],
    'iniziò': ['iniziare', 'cominciare'],
    'finì': ['finire', 'terminare'],
    'fotosintesi': ['pianta', 'foglia', 'sole'],
    'clorofilla': ['foglia', 'verde', 'pianta'],
    'ossigeno': ['aria', 'respirare'],
    'anidride carbonica': ['aria', 'fumo'],
    'linfa': ['acqua', 'goccia']
  },

  /**
   * Genera un pittogramma SVG geometrico nello standard IN-Book per articoli e funtori grammaticali.
   */
  createGrammaticalSvgDataUri(type) {
    let shape = '';
    switch (type) {
      case 'article_def_m_s':
        shape = `<polygon points="50,18 82,78 18,78" fill="#1e293b" stroke="#1e293b" stroke-width="3" stroke-linejoin="round"/>`;
        break;
      case 'article_def_f_s':
        shape = `
          <polygon points="50,18 82,78 18,78" fill="#1e293b" stroke="#1e293b" stroke-width="3" stroke-linejoin="round"/>
          <circle cx="50" cy="88" r="5" fill="#1e293b"/>
        `;
        break;
      case 'article_def_s':
        shape = `<polygon points="50,20 80,76 20,76" fill="#334155" stroke="#1e293b" stroke-width="3" stroke-linejoin="round"/>`;
        break;
      case 'article_def_m_p':
        shape = `
          <polygon points="36,24 62,76 12,76" fill="#1e293b" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>
          <polygon points="64,24 88,76 38,76" fill="none" stroke="#1e293b" stroke-width="4" stroke-linejoin="round"/>
        `;
        break;
      case 'article_def_f_p':
        shape = `
          <polygon points="36,22 62,72 12,72" fill="#1e293b" stroke="#1e293b" stroke-width="2.5" stroke-linejoin="round"/>
          <polygon points="64,22 88,72 38,72" fill="none" stroke="#1e293b" stroke-width="4" stroke-linejoin="round"/>
          <circle cx="50" cy="86" r="5" fill="#1e293b"/>
        `;
        break;
      case 'article_indef_m':
        shape = `<polygon points="50,18 82,78 18,78" fill="#ffffff" stroke="#1e293b" stroke-width="5" stroke-linejoin="round"/>`;
        break;
      case 'article_indef_f':
        shape = `
          <polygon points="50,16 80,72 20,72" fill="#ffffff" stroke="#1e293b" stroke-width="5" stroke-linejoin="round"/>
          <circle cx="50" cy="86" r="5" fill="#1e293b"/>
        `;
        break;
      case 'connector_rel':
        shape = `
          <circle cx="32" cy="50" r="14" fill="none" stroke="#1e293b" stroke-width="5"/>
          <circle cx="68" cy="50" r="14" fill="none" stroke="#1e293b" stroke-width="5"/>
          <line x1="46" y1="50" x2="54" y2="50" stroke="#1e293b" stroke-width="5"/>
        `;
        break;
      case 'question_who':
        shape = `
          <circle cx="42" cy="36" r="12" fill="#e2e8f0" stroke="#1e293b" stroke-width="3.5"/>
          <path d="M24 78 Q42 54 60 78 Z" fill="#cbd5e1" stroke="#1e293b" stroke-width="3.5"/>
          <text x="74" y="54" font-family="sans-serif" font-size="38" font-weight="900" fill="#dc2626">?</text>
        `;
        break;
      default:
        shape = `
          <circle cx="50" cy="50" r="22" fill="none" stroke="#1e293b" stroke-width="4.5"/>
          <circle cx="50" cy="50" r="6" fill="#1e293b"/>
        `;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect width="96" height="96" x="2" y="2" rx="10" fill="#ffffff"/>
      ${shape}
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  },

  normalizeTerm(term) {
    if (!term) return '';
    return String(term)
      .trim()
      .toLowerCase()
      .replace(/[.,;:!?()"'«»]/g, '')
      .replace(/\s+/g, ' ');
  },

  generateMorphologicalVariants(term) {
    if (!term || term.length < 3) return [];
    const variants = [];
    const t = term.toLowerCase();

    // Imperfetto e passato remoto comuni in narrativa IN-Book
    if (t.endsWith('avano')) variants.push(t.slice(0, -5) + 'are');
    if (t.endsWith('evano')) variants.push(t.slice(0, -5) + 'ere');
    if (t.endsWith('ivano')) variants.push(t.slice(0, -5) + 'ire');
    if (t.endsWith('ava')) variants.push(t.slice(0, -3) + 'are');
    if (t.endsWith('eva')) variants.push(t.slice(0, -3) + 'ere');
    if (t.endsWith('iva')) variants.push(t.slice(0, -3) + 'ire');
    if (t.endsWith('arono')) variants.push(t.slice(0, -5) + 'are');
    if (t.endsWith('erono')) variants.push(t.slice(0, -5) + 'ere');
    if (t.endsWith('irono')) variants.push(t.slice(0, -5) + 'ire');
    if (t.endsWith('ò') && t.length > 3) variants.push(t.slice(0, -1) + 'are');
    if (t.endsWith('ì') && t.length > 3) variants.push(t.slice(0, -1) + 'ire');

    // Participi passati
    if (t.endsWith('ato') || t.endsWith('ata') || t.endsWith('ati') || t.endsWith('ate')) {
      variants.push(t.slice(0, -3) + 'are');
    }
    if (t.endsWith('uto') || t.endsWith('uta') || t.endsWith('uti') || t.endsWith('ute')) {
      variants.push(t.slice(0, -3) + 'ere');
    }
    if (t.endsWith('ito') || t.endsWith('ita') || t.endsWith('iti') || t.endsWith('ite')) {
      variants.push(t.slice(0, -3) + 'ire');
    }

    // Presente indicativo
    if (t.endsWith('iscono')) variants.push(t.slice(0, -6) + 'ire');
    if (t.endsWith('isce')) variants.push(t.slice(0, -4) + 'ire');
    if (t.endsWith('ano')) variants.push(t.slice(0, -3) + 'are');
    if (t.endsWith('ono')) {
      variants.push(t.slice(0, -3) + 'ere');
      variants.push(t.slice(0, -3) + 'ire');
    }

    // Diminutivi e plurali
    if (t.endsWith('ini') || t.endsWith('ine') || t.endsWith('ino') || t.endsWith('ina')) {
      variants.push(t.slice(0, -3) + 'o');
      variants.push(t.slice(0, -3) + 'a');
    }
    if (t.endsWith('etti') || t.endsWith('ette') || t.endsWith('etto') || t.endsWith('etta')) {
      variants.push(t.slice(0, -4) + 'o');
      variants.push(t.slice(0, -4) + 'a');
    }
    if (t.endsWith('chi') && t.length > 4) variants.push(t.slice(0, -3) + 'co');
    if (t.endsWith('ghi') && t.length > 4) variants.push(t.slice(0, -3) + 'go');
    if (t.endsWith('i') && t.length > 3) {
      variants.push(t.slice(0, -1) + 'o');
      variants.push(t.slice(0, -1) + 'e');
    }
    if (t.endsWith('e') && t.length > 3) {
      variants.push(t.slice(0, -1) + 'a');
    }

    return variants;
  },

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
        throw new Error(`ARASAAC HTTP ${response.status}`);
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

  getPictogramImageUrl(pictogramId, resolution = 500) {
    if (!pictogramId) return null;
    return `${this.STATIC_IMG_URL}/${pictogramId}/${pictogramId}_${resolution}.png`;
  },

  /**
   * Risolve il miglior pittogramma per un token IN-Book.
   * Restituisce anche le alternative trovate e un flag `isAmbiguous` per parole polisemiche.
   */
  async resolveTokenPictogram(word, lemmaTerm = null, posHint = '') {
    const rawTrimmed = String(word || '').trim().toLowerCase();
    const normWord = this.normalizeTerm(word);
    const normLemma = this.normalizeTerm(lemmaTerm);

    // 1. Controlla se è un articolo o funtore grammaticale puro (con SVG IN-Book dedicato)
    const gramEntry = this.GRAMMATICAL_SVG_MAP[rawTrimmed] || this.GRAMMATICAL_SVG_MAP[normWord];
    if (gramEntry && posHint !== 'noun' && posHint !== 'verb') {
      const svgUri = this.createGrammaticalSvgDataUri(gramEntry.type);
      return {
        id: `gram_${gramEntry.type}`,
        imageUrl: svgUri,
        origin: 'arasaac',
        matchedTerm: normWord,
        isAmbiguous: false,
        alternatives: [{ id: `gram_${gramEntry.type}`, imageUrl: svgUri, keyword: gramEntry.label }]
      };
    }

    // 2. Controlla mappa diretta ARASAAC
    const directId = this.DIRECT_MAP[rawTrimmed] || this.DIRECT_MAP[normWord] || (normLemma ? this.DIRECT_MAP[normLemma] : null);
    if (directId) {
      const url = this.getPictogramImageUrl(directId);
      return {
        id: directId,
        imageUrl: url,
        origin: 'arasaac',
        matchedTerm: normWord,
        isAmbiguous: false,
        alternatives: [{ id: directId, imageUrl: url, keyword: normWord }]
      };
    }

    // 3. Costruisci candidati di ricerca
    const candidates = [];
    if (normLemma) candidates.push(normLemma);
    if (normWord && normWord !== normLemma) candidates.push(normWord);

    const mappedSynonyms = [
      ...(this.SYNONYM_MAP[rawTrimmed] || []),
      ...(this.SYNONYM_MAP[normWord] || []),
      ...(this.SYNONYM_MAP[normLemma] || [])
    ];
    for (const syn of mappedSynonyms) {
      const normSyn = this.normalizeTerm(syn);
      if (normSyn && !candidates.includes(normSyn)) {
        candidates.push(normSyn);
      }
    }

    for (const variant of [
      ...this.generateMorphologicalVariants(normWord),
      ...this.generateMorphologicalVariants(normLemma)
    ]) {
      if (variant && !candidates.includes(variant)) {
        candidates.push(variant);
      }
    }

    // 4. Ricerca sequenziale su ARASAAC
    for (const candidate of candidates) {
      if (!candidate) continue;
      const results = await this.searchPictograms(candidate);
      if (results.length > 0) {
        const preferred = results.find(item => item.aacColor === true) || results[0];
        const isPolysemous =
          this.POLYSEMOUS_TERMS.has(normWord) ||
          this.POLYSEMOUS_TERMS.has(normLemma) ||
          results.length >= 6;

        const alternatives = results.slice(0, 12).map(item => ({
          id: item._id,
          imageUrl: this.getPictogramImageUrl(item._id),
          keyword: item.keywords?.[0]?.keyword || candidate
        }));

        return {
          id: preferred._id,
          imageUrl: this.getPictogramImageUrl(preferred._id),
          origin: 'arasaac',
          matchedTerm: candidate,
          isAmbiguous: isPolysemous,
          alternatives
        };
      }
    }

    return null;
  }
};
