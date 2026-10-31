/**
 * Servizio IA per l'analisi morfosintattica IN-Book e la generazione di pittogrammi SVG su misura.
 * Integra il database ARASAAC, l'archivio personale dell'utente e la generazione vettoriale Gemini.
 */

import { ConfigManager } from './config.js';
import { ArasaacService } from './arasaacService.js';
import { StateStore } from './stateStore.js';

export const GeminiInbookService = {
  /**
   * Invoca l'API Gemini tramite server locale, worker Cloud o chiamata diretta.
   */
  async callGeminiApi(model, geminiPayload, activeKey) {
    const endpoints = [];
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      endpoints.push('/api/generate');
    }
    endpoints.push('https://caa-api.roccobenetti.workers.dev/api/generate');

    let lastError = null;
    for (const ep of endpoints) {
      try {
        const resp = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: activeKey,
            model,
            geminiPayload
          })
        });
        if (resp.ok) {
          return await resp.json();
        } else if (resp.status !== 404 && resp.status !== 405) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error?.message || errData.error || `HTTP ${resp.status}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (activeKey) {
      const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
      const directResp = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
      if (directResp.ok) {
        return await directResp.json();
      }
      const errJson = await directResp.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Errore Gemini HTTP ${directResp.status}`);
    }

    throw lastError || new Error('Chiave API Gemini mancante o servizio non raggiungibile.');
  },

  /**
   * Analizza un testo (frase, racconto o brano disciplinare) e lo trasforma in struttura IN-Book.
   */
  async analyzeTextToInBook({ rawText, title = '', category = 'narrativa', translationMode = 'faithful', onProgress = null }) {
    const cleanText = String(rawText || '').trim();
    if (!cleanText) {
      throw new Error('Inserisci una frase, un racconto o un brano disciplinare da tradurre in IN-Book.');
    }

    const activeKey = ConfigManager.getActiveApiKey();
    const model = ConfigManager.state.model || 'gemini-3.1-flash-lite';

    let structuredBook = null;

    if (activeKey) {
      try {
        if (onProgress) onProgress('Analisi morfosintattica e strutturazione IN-Book con IA in corso...');
        structuredBook = await this.requestGeminiInBookAnalysis({
          cleanText,
          title,
          category,
          translationMode,
          model,
          activeKey
        });
      } catch (aiErr) {
        console.warn('Fallback su analizzatore morfosintattico locale per errore IA:', aiErr.message);
        structuredBook = this.localFallbackAnalyze({ cleanText, title, category, translationMode });
      }
    } else {
      structuredBook = this.localFallbackAnalyze({ cleanText, title, category, translationMode });
    }

    // Risolve i pittogrammi (Associazioni Utente -> ARASAAC -> Generazione IA per mancanti/specifici)
    await this.hydrateBookTokensWithPictograms(structuredBook, onProgress);
    return structuredBook;
  },

  async requestGeminiInBookAnalysis({ cleanText, title, category, translationMode, model, activeKey }) {
    const isFaithful = translationMode === 'faithful';

    const modeInstruction = isFaithful
      ? `MODALITÀ TRADUZIONE INTEGRALE FEDELE:
- DEVI tradurre INTEGRALMENTE ogni parola del testo fornito dall'utente senza omettere nulla e mantenendo l'ordine esatto delle parole.
- Unisci in un unico token (isCompound: true) SOLO le locuzioni polirematiche inscindibili o i concetti scientifici unitari (es. "C'ERA UNA VOLTA", "ANDARE A LETTO", "AVERE PAURA", "FOTOSINTESI CLOROFILLIANA", "ANIDRIDE CARBONICA", "UN PO'").
- Ogni articolo, preposizione, congiunzione, verbo e nome deve avere il proprio token dedicato.`
      : `MODALITÀ ADATTAMENTO PEDAGOGICO IN-BOOK (MODELING):
- Adatta il testo in frasi chiare, lineari (Soggetto + Verbo + Complemento) ideali per la lettura condivisa (modeling CAA) secondo lo standard del Centro Sovrazonale CAA.
- Mantieni tutti i passaggi narrativi o i concetti disciplinari del brano originale, ma semplifica le subordinate complesse.
- Traduci poi INTEGRALMENTE ogni parola delle frasi adattate in token simbolici (inclusi articoli, preposizioni, verbi, nomi e locuzioni polirematiche).`;

    const systemPrompt = `Sei un linguista computazionale ed esperto del modello IN-Book (libri modificati integralmente in simboli per la lettura condivisa / modeling in CAA).

${modeInstruction}

REGOLE PER OGNI TOKEN SIMBOLICO:
1. "label": Il testo esatto da stampare nel box IN-Book in STAMPATO MAIUSCOLO (es. "CAMMINAVANO", "IL", "C'ERA UNA VOLTA", "CLOROFILLA").
2. "lemma": La parola base al singolare o verbo all'infinito per cercare il pittogramma nel dizionario italiano ARASAAC (es. per "CAMMINAVANO" -> "camminare"; per "PORCELLINI" -> "maiale"; per "C'ERA UNA VOLTA" -> "fiaba"; per "LA" articolo -> "la").
3. "pos": Categoria ("func" per articoli/preposizioni/congiunzioni, "noun" per nomi comuni, "proper" per nomi propri di personaggi/luoghi, "verb" per verbi, "adj" per aggettivi/avverbi, "idiom" per locuzioni).
4. "tense": Per i verbi, indica "past" (passato/imperfetto/passato remoto), "present", "future", oppure "none" per le altre parole.
5. "plural": true se la parola è al plurale (es. "BAMBINI", "CORREVANO", "LE"), altrimenti false.
6. "isAmbiguous": true se la parola in italiano ha più significati molto diversi (polisemia come "porta", "letto", "pesca", "piano", "stato", "sale", "volta", "pianta") e merita una verifica visiva dell'utente.
7. "needsAiSymbol": true SOLO se è un nome proprio specifico (es. "Drago Scintilla", "Mago Pancione"), un concetto disciplinare/scientifico specifico difficilmente presente con chiarezza in ARASAAC (es. "fotosintesi clorofilliana", "feudalesimo", "evaporazione"), o un'espressione metaforica specifica.
8. "aiPrompt": Breve descrizione visiva chiara in italiano per disegnare il pittogramma (es. "Piccolo drago verde sorridente in stile pittogramma CAA", oppure "Foglia verde illuminata dal sole che assorbe luce").

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido con questa struttura:
{
  "title": "Titolo del libro o brano",
  "subtitle": "Sottotitolo descrittivo IN-Book",
  "category": "${category}",
  "pages": [
    {
      "pageNumber": 1,
      "pageTitle": "Titolo pagina o sezione",
      "sentences": [
        {
          "originalText": "Frase intera",
          "tokens": [
            {
              "label": "C'ERA UNA VOLTA",
              "lemma": "fiaba",
              "pos": "idiom",
              "tense": "past",
              "plural": false,
              "isAmbiguous": false,
              "needsAiSymbol": false,
              "aiPrompt": "Libro aperto con castello fiabesco"
            }
          ]
        }
      ]
    }
  ]
}`;

    const geminiPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          parts: [
            {
              text: `Titolo suggerito: "${title || 'Brano IN-Book'}"\nCategoria: ${category}\nTesto da trasformare in IN-Book:\n${cleanText}`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json'
      }
    };

    const response = await this.callGeminiApi(model, geminiPayload, activeKey);
    const rawJsonText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawJsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      throw new Error('Struttura JSON IN-Book restituita non valida.');
    }

    parsed.translationMode = translationMode;
    return parsed;
  },

  /**
   * Analizzatore morfosintattico locale di emergenza (funziona anche senza chiave API).
   */
  localFallbackAnalyze({ cleanText, title, category, translationMode }) {
    const paragraphs = cleanText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean);

    const IDIOMS = [
      { regex: /\bc['’]era una volta\b/gi, lemma: 'fiaba', pos: 'idiom', tense: 'past' },
      { regex: /\bandare a letto\b/gi, lemma: 'dormire', pos: 'idiom', tense: 'none' },
      { regex: /\bavere paura\b/gi, lemma: 'paura', pos: 'idiom', tense: 'none' },
      { regex: /\bavere fame\b/gi, lemma: 'fame', pos: 'idiom', tense: 'none' },
      { regex: /\bfotosintesi clorofilliana\b/gi, lemma: 'pianta', pos: 'idiom', tense: 'none', needsAi: true },
      { regex: /\banidride carbonica\b/gi, lemma: 'aria', pos: 'idiom', tense: 'none', needsAi: true },
      { regex: /\bsali minerali\b/gi, lemma: 'acqua', pos: 'idiom', tense: 'none', needsAi: true }
    ];

    const pages = paragraphs.map((para, idx) => {
      const rawSentences = para
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);

      const sentences = rawSentences.map(sentenceStr => {
        let working = sentenceStr;
        const placeholders = [];

        IDIOMS.forEach((idiom, iIndex) => {
          working = working.replace(idiom.regex, match => {
            const key = `__IDIOM_${iIndex}_${placeholders.length}__`;
            placeholders.push({
              key,
              label: match.toLocaleUpperCase('it-IT'),
              lemma: idiom.lemma,
              pos: idiom.pos,
              tense: idiom.tense,
              needsAiSymbol: Boolean(idiom.needsAi)
            });
            return ` ${key} `;
          });
        });

        // Separa gli apostrofi degli articoli (es. l'albero -> l' + albero)
        working = working.replace(/\b([lLdDuUnN]['’])(\w+)/g, '$1 $2');

        const rawWords = working
          .replace(/[.,;:!?()"«»]/g, ' ')
          .split(/\s+/)
          .filter(Boolean);

        const tokens = rawWords.map(rawW => {
          const foundIdiom = placeholders.find(p => p.key === rawW);
          if (foundIdiom) {
            return {
              id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              label: foundIdiom.label,
              lemma: foundIdiom.lemma,
              pos: foundIdiom.pos,
              tense: foundIdiom.tense,
              plural: false,
              isCompound: true,
              isAmbiguous: false,
              needsAiSymbol: foundIdiom.needsAiSymbol,
              aiPrompt: foundIdiom.label
            };
          }

          const lower = rawW.toLowerCase();
          const isPlural =
            ['i', 'gli', 'le', 'dei', 'degli', 'delle', 'nei', 'sui'].includes(lower) ||
            (lower.length > 3 && (lower.endsWith('i') || lower.endsWith('e') || lower.endsWith('ano') || lower.endsWith('ono')));

          let tense = 'none';
          if (lower.endsWith('ava') || lower.endsWith('avano') || lower.endsWith('eva') || lower.endsWith('evano') || lower.endsWith('ò') || lower.endsWith('ì') || lower === 'era' || lower === 'erano') {
            tense = 'past';
          } else if (lower.endsWith('rà') || lower.endsWith('ranno')) {
            tense = 'future';
          }

          const isFunc = Boolean(ArasaacService.GRAMMATICAL_SVG_MAP[lower] || ArasaacService.DIRECT_MAP[lower]);

          return {
            id: `tok_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            label: rawW.toLocaleUpperCase('it-IT'),
            lemma: lower,
            pos: isFunc ? 'func' : 'noun',
            tense,
            plural: isPlural,
            isCompound: false,
            isAmbiguous: ArasaacService.POLYSEMOUS_TERMS.has(lower),
            needsAiSymbol: false,
            aiPrompt: rawW
          };
        });

        return {
          originalText: sentenceStr,
          tokens
        };
      });

      return {
        pageNumber: idx + 1,
        pageTitle: `Pagina ${idx + 1}`,
        sentences
      };
    });

    return {
      title: title || 'Nuovo IN-Book',
      subtitle: 'Testo tradotto integralmente in simboli per il modeling',
      category,
      translationMode,
      pages
    };
  },

  /**
   * Risolve i pittogrammi per tutti i token del libro secondo la priorità:
   * 1. Regole di Associazione Utente / Archivio Personale (origin: 'custom')
   * 2. Database Ufficiale ARASAAC / Simboli Grammaticali IN-Book (origin: 'arasaac')
   * 3. Generazione Automatica IA per simboli mancanti o specifici (origin: 'ai')
   */
  async hydrateBookTokensWithPictograms(bookData, onProgress = null) {
    const allTokens = [];
    for (const page of bookData.pages || []) {
      for (const sentence of page.sentences || []) {
        for (const token of sentence.tokens || []) {
          if (!token.id) {
            token.id = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          }
          token.label = String(token.label || '').toLocaleUpperCase('it-IT');
          token.isCompound = token.label.includes(' ');
          allTokens.push(token);
        }
      }
    }

    const total = allTokens.length;
    const aiCacheByWord = new Map();
    const autoGenAi = ConfigManager.state.preferences.autoGenerateMissingAi;
    const defaultStyle = ConfigManager.state.preferences.defaultAiStyle || 'stylized';

    for (let i = 0; i < total; i++) {
      const token = allTokens[i];
      if (onProgress && i % 4 === 0) {
        onProgress(`Ricerca e generazione simboli IN-Book (${i + 1} di ${total}): "${token.label}"...`);
      }

      // 1. Controlla se l'utente ha un'associazione personalizzata salvata per questa parola/lemma
      const userAssoc = StateStore.getAssociationForToken(token.label, token.lemma);
      if (userAssoc && userAssoc.imageUrl) {
        token.imageUrl = userAssoc.imageUrl;
        token.origin = 'custom';
        token.arasaacId = userAssoc.arasaacId || null;
        token.needsVerification = false;
        token.alternatives = [];
        continue;
      }

      // 2. Se non è marcato come "needsAiSymbol" obbligatorio (es. nome proprio di personaggio), cerca su ARASAAC
      let arasaacMatch = null;
      if (token.pos !== 'proper') {
        arasaacMatch = await ArasaacService.resolveTokenPictogram(token.label, token.lemma, token.pos);
      }

      if (arasaacMatch && !token.needsAiSymbol) {
        token.imageUrl = arasaacMatch.imageUrl;
        token.arasaacId = arasaacMatch.id;
        token.origin = 'arasaac';
        token.needsVerification = Boolean(token.isAmbiguous || arasaacMatch.isAmbiguous);
        token.alternatives = arasaacMatch.alternatives || [];
        continue;
      }

      // 3. Se manca in ARASAAC oppure richiede un simbolo specifico IA (needsAiSymbol)
      const cacheKey = StateStore.normalizeKey(token.lemma || token.label);
      if (aiCacheByWord.has(cacheKey)) {
        const cachedAiUrl = aiCacheByWord.get(cacheKey);
        token.imageUrl = cachedAiUrl;
        token.origin = 'ai';
        token.needsVerification = true;
        token.alternatives = arasaacMatch ? arasaacMatch.alternatives : [];
        continue;
      }

      if (autoGenAi && ConfigManager.getActiveApiKey()) {
        try {
          if (onProgress) {
            onProgress(`Generazione pittogramma IA per "${token.label}"...`);
          }
          const promptDesc = token.aiPrompt || `${token.label} (${token.lemma || ''})`;
          const aiSvgUrl = await this.generateAiPictogramSvg(promptDesc, defaultStyle);
          aiCacheByWord.set(cacheKey, aiSvgUrl);
          token.imageUrl = aiSvgUrl;
          token.origin = 'ai';
          token.needsVerification = true;
          token.alternatives = arasaacMatch ? arasaacMatch.alternatives : [];
          continue;
        } catch (genErr) {
          console.warn(`Fallback per "${token.label}":`, genErr.message);
        }
      }

      // Fallback se ARASAAC aveva comunque trovato un'approssimazione o usa SVG procedurale
      if (arasaacMatch) {
        token.imageUrl = arasaacMatch.imageUrl;
        token.arasaacId = arasaacMatch.id;
        token.origin = 'arasaac';
        token.needsVerification = true;
        token.alternatives = arasaacMatch.alternatives || [];
      } else {
        const procSvg = this.createProceduralFallbackSvg(token.label, token.pos);
        aiCacheByWord.set(cacheKey, procSvg);
        token.imageUrl = procSvg;
        token.origin = 'ai';
        token.needsVerification = true;
        token.alternatives = [];
      }
    }
  },

  /**
   * Genera un pittogramma vettoriale SVG tramite Gemini IA a partire dalle richieste specifiche dell'utente.
   */
  async generateAiPictogramSvg(description, style = 'stylized') {
    const activeKey = ConfigManager.getActiveApiKey();
    const model = ConfigManager.state.model || 'gemini-3.1-flash-lite';
    const cleanDesc = String(description || '').trim();

    if (!cleanDesc) {
      throw new Error('Inserisci una descrizione valida per generare il pittogramma con IA.');
    }

    if (!activeKey) {
      return this.createProceduralFallbackSvg(cleanDesc, 'noun');
    }

    let styleRules = '';
    if (style === 'storybook') {
      styleRules = `STILE FIABESCO IN-BOOK:
1. Usa <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
2. Sfondo pulito: <rect width="96" height="96" x="2" y="2" rx="10" fill="#fffbeb"/>
3. Disegna un'illustrazione narrativa espressiva, calda, con contorni scuri ben visibili (stroke="#1e293b" stroke-width="2.5") e colori morbidi ma ben contrastati.
4. NON inserire alcun testo o parola dentro l'SVG.`;
    } else if (style === 'realistic') {
      styleRules = `STILE REALISTICO DETTAGLIATO:
1. Usa <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
2. Sfondo pulito: <rect width="96" height="96" x="2" y="2" rx="10" fill="#f8fafc"/>
3. Usa sfumature (<linearGradient>, <radialGradient>), volumi realistici e dettagli accurati del soggetto richiesto.
4. NON inserire alcun testo o parola dentro l'SVG.`;
    } else {
      styleRules = `STILE PITTOGRAMMA CAA / IN-BOOK (ARASAAC / WLS):
1. Usa <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
2. Sfondo bianco: <rect width="96" height="96" x="2" y="2" rx="10" fill="#ffffff"/>
3. Disegna un pittogramma iconico, immediato, al centro del quadrato, con contorni neri nitidi (stroke="#0f172a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round") e campiture piatte ad alto contrasto.
4. Massima leggibilità visiva anche a piccole dimensioni (45x45px) per la lettura condivisa IN-Book.
5. NON inserire MAI testo, lettere o numeri all'interno del disegno SVG.`;
    }

    const systemPrompt = `Sei un illustratore specializzato in simboli per Comunicazione Aumentativa e Alternativa (CAA) e libri IN-Book.
Genera ESCLUSIVAMENTE codice SVG valido (<svg ...>...</svg>) senza blocchi markdown e senza spiegazioni.
${styleRules}`;

    const geminiPayload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          parts: [
            {
              text: `Crea un pittogramma vettoriale SVG chiaro e immediatamente comprensibile che rappresenti esattamente: "${cleanDesc}".`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 3072
      }
    };

    const result = await this.callGeminiApi(model, geminiPayload, activeKey);
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/```(?:xml|svg)?/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
    const validSvg = match ? match[0] : this.createRawProceduralSvg(cleanDesc, 'noun');

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(validSvg)))}`;
  },

  createRawProceduralSvg(label, pos = 'noun') {
    const isProper = pos === 'proper';
    const isVerb = pos === 'verb';
    let inner = '';

    if (isProper) {
      inner = `
        <circle cx="50" cy="36" r="16" fill="#fde047" stroke="#0f172a" stroke-width="3.5"/>
        <circle cx="44" cy="33" r="2.5" fill="#0f172a"/>
        <circle cx="56" cy="33" r="2.5" fill="#0f172a"/>
        <path d="M44 42 Q50 47 56 42" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M26 84 Q50 56 74 84 Z" fill="#60a5fa" stroke="#0f172a" stroke-width="3.5" stroke-linejoin="round"/>
      `;
    } else if (isVerb) {
      inner = `
        <circle cx="42" cy="30" r="10" fill="#fbbf24" stroke="#0f172a" stroke-width="3"/>
        <path d="M42 40 L38 64 L26 82 M38 64 L54 82 M28 50 L56 46" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M64 48 L84 48 M76 40 L84 48 L76 56" fill="none" stroke="#16a34a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else {
      inner = `
        <rect x="22" y="24" width="56" height="52" rx="12" fill="#e0e7ff" stroke="#0f172a" stroke-width="3.5"/>
        <circle cx="40" cy="42" r="7" fill="#fbbf24" stroke="#0f172a" stroke-width="2.5"/>
        <path d="M24 68 L42 52 L56 64 L66 54 L76 68 Z" fill="#86efac" stroke="#0f172a" stroke-width="2.5" stroke-linejoin="round"/>
      `;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect width="96" height="96" x="2" y="2" rx="10" fill="#ffffff"/>
      ${inner}
    </svg>`;
  },

  createProceduralFallbackSvg(label, pos = 'noun') {
    const raw = this.createRawProceduralSvg(label, pos);
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(raw)))}`;
  }
};
