/**
 * Servizio per la generazione didattica e CAA tramite API Gemini.
 * Garantisce:
 * - FEDELTÀ ASSOLUTA ALLE ISTRUZIONI DELL'UTENTE: ogni dettaglio, passaggio e condizione
 *   richiesta dall'utente viene rigorosamente trasformata in scheda didattica senza omissioni.
 * - Scomposizione passo-passo completa: nessun passaggio viene accorpato o saltato.
 * - Analisi del "PERCHÉ" e delle motivazioni per ogni fase.
 * - Inclusione della MORALE e insegnamento conclusivo con tessere dedicate.
 * - Generazione vettoriale SVG garantita per termini non presenti nei cataloghi.
 */

import { ConfigManager } from './config.js';

export const GeminiService = {
  svgFallbackCache: new Map(),

  /**
   * Genera un progetto di lezione CAA analizzando contesto, motivazioni e morale.
   * @param {Object} params
   * @param {string} params.promptIdea - Testo descrittivo dell'idea o attività didattica fornita dall'utente
   * @param {string} params.targetGrade - 'infanzia' o 'primaria'
   * @param {number|string} params.primaryClass - Classe primaria (1, 2, 3, 4, 5)
   * @param {string} params.layoutType - 'strip', 'table' o 'routine'
   * @param {string} params.detailLevel - 'detailed' (passaggio per passaggio) o 'compact' (sintetico)
   * @returns {Promise<Object>} Progetto strutturato con sezioni, morale e token CAA
   */
  async generateLesson({ promptIdea, targetGrade = 'infanzia', primaryClass = '1', layoutType = 'routine', detailLevel = 'detailed' }) {
    const activeKey = ConfigManager.getActiveApiKey();
    const model = ConfigManager.state.model || 'gemini-3.1-flash-lite';

    if (!activeKey) {
      throw new Error('Chiave API Gemini mancante. Inserisci la tua chiave nelle impostazioni.');
    }

    const isInfanzia = targetGrade === 'infanzia';
    const gradeLabel = isInfanzia ? "Scuola dell'Infanzia (3-5 anni)" : `Scuola Primaria - Classe ${primaryClass}ª`;
    const isDetailed = detailLevel !== 'compact';

    const systemInstructions = `
Sei un esperto pedagogista clinico e programmatore didattico specializzato in Comunicazione Aumentativa e Alternativa (CAA).

================================================================================
REGOLA AUREA: FEDELTÀ ASSOLUTA ED ESECUZIONE PUNTUALE DELLE RICHIESTE UTENTE
================================================================================
DEVI SEGUIRE RIGOROSAMENTE E PUNTO PER PUNTO TUTTE LE INDICAZIONI FORNITE DALL'UTENTE.
NON DEVI FARE DI TESTA TUA, NON DEVI ACCORPARE PIÙ AZIONI INSIEME E NON DEVI SALTARE NESSUN PASSAGGIO RICHIESTO!

1. SE L'UTENTE FORNISCE INDICAZIONI DETTAGLIATE O PASSAGGI SPECIFICI:
   - Analizza la richiesta dell'utente frase per frase.
   - Ogni singola azione, evento, spiegazione o transizione specificata dall'utente DEVE diventare una scheda CAA autonoma e dedicata.
   - Esempio: se l'utente richiede "spiega le tre case e perché sono diverse, il lupo che soffia sulla paglia e crolla, il porcellino che scappa nell'altra casa, poi quella di legno che crolla e i due che scappano in quella di mattoni che resiste, e poi la morale":
     * Scheda 1: I tre porcellini che devono fare le case.
     * Scheda 2: La casa di paglia e il PERCHÉ (pigrizia/voler giocare subito).
     * Scheda 3: La casa di legno e il PERCHÉ (fretta/voler riposare).
     * Scheda 4: La casa di mattoni e il PERCHÉ (lavoro sodo e sicurezza contro il lupo).
     * Scheda 5: Il lupo soffia sulla casa di paglia.
     * Scheda 6: La casa di paglia crolla a terra.
     * Scheda 7: Il primo porcellino scappa nella casa di legno del fratello per rifugiarsi.
     * Scheda 8: Il lupo soffia sulla casa di legno.
     * Scheda 9: Anche la casa di legno crolla.
     * Scheda 10: I due porcellini scappano disperati nella casa di mattoni dal terzo fratello.
     * Scheda 11: Il terzo fratello accoglie i fratelli e li mette al sicuro.
     * Scheda 12: Il lupo soffia con tutta la forza sulla casa di mattoni.
     * Scheda 13: La casa di mattoni resiste solida e NON crolla.
     * Scheda 14: Il lupo si arrende e scappa via nel bosco.
     * Scheda 15: I tre porcellini sono salvi e felici.
     * Sezione MORALE: spiegazione dell'insegnamento etico/didattico con tessere visive dedicate.

2. SE L'UTENTE FORNISCE UN'IDEA GENERALE (senza specificare tutti i passaggi):
   - In modalità DETTAGLIATA: scompone autonomamente l'argomento in TUTTI i suoi micro-passaggi logici sequenziali (1..N passaggi, nessuno escluso).
   - In modalità SINTETICA: genera solo i punti cardine essenziali.

3. REGOLE FORMATO SCHEDE CAA (FITZGERALD KEY):
   - Ogni scheda deve contenere poche parole chiare (3-5 parole e simboli).
   - Ogni token ha:
     * displayWord: Parola esatta da leggere in italiano.
     * searchTerm: Lemma base / infinito per la ricerca nei simboli ARASAAC (es. per "costruiscono" -> "costruire"; per "case" -> "casa"; per "scappano" -> "scappare"; "mattoni" -> "mattone").
     * category: Categoria sintattica Fitzgerald per il colore del bordo:
       - "person": persone, protagonisti, animali (Giallo)
       - "verb": azioni, verbi (Verde)
       - "noun": oggetti, luoghi, materiali (Arancione)
       - "adjective": qualità, emozioni, materiali (paglia, legno, mattoni) (Blu)
       - "social": formule sociali, sì, no, aiuto (Rosa)
       - "misc": preposizioni, congiunzioni ("perché", "e", "ma", "via") (Grigio)

4. SEZIONE MORALE / INSEGNAMENTO CHIAVE (SEMPRE PRESENTE):
   - title: Titolo della morale o insegnamento.
   - explanation: Spiegazione pedagogica ed empatica del significato profondo.
   - tokens: Frase di sintesi della morale tradotta in simboli CAA.

RISPONDI ESCLUSIVAMENTE CON UN OGGETTO JSON VALIDO (nessun markdown né testo di contorno):
{
  "title": "Titolo fedele alla richiesta",
  "targetGrade": "${targetGrade}",
  "primaryClass": "${primaryClass}",
  "layoutType": "${layoutType}",
  "contextSummary": "Breve sintesi di come sono state rispettate le istruzioni dell'utente",
  "teacherGuide": "Indicazioni pratiche per l'insegnante",
  "moral": {
    "title": "La Morale e l'Insegnamento Chiave",
    "explanation": "Spiegazione chiara per il bambino dell'insegnamento di questo testo",
    "tokens": [
      { "displayWord": "Impegno", "searchTerm": "impegno", "category": "noun" },
      { "displayWord": "porta", "searchTerm": "portare", "category": "verb" },
      { "displayWord": "sicurezza", "searchTerm": "sicurezza", "category": "adjective" }
    ]
  },
  "cards": [
    {
      "sectionTitle": "Fase didattica",
      "stepLabel": "Titolo specifico del passaggio",
      "pedagogicalExplanation": "Spiegazione di cosa accade",
      "tokens": [
        { "displayWord": "Porcellino", "searchTerm": "maiale", "category": "person" },
        { "displayWord": "costruisce", "searchTerm": "costruire", "category": "verb" },
        { "displayWord": "casa", "searchTerm": "casa", "category": "noun" }
      ]
    }
  ]
}
`;

    const userPrompt = `
TESTO E ISTRUZIONI DETTAGLIATE FORNITE DALL'UTENTE (DA ESEGUIRE ALLA LETTERA, PUNTO PER PUNTO):
"""
${promptIdea}
"""

Target Didattico: ${gradeLabel}
Formato Layout: ${layoutType}
Modalità Richiesta: ${isDetailed ? 'DETTAGLIATA (Esegui fedelmente OGNI singolo passaggio e dettaglio richiesto dall\'utente, senza accorparli e senza saltarne nessuno)' : 'SINTETICA (Punti essenziali)'}

IMPORTANTE: Assicurati di includere esplicitamente ogni singolo evento, motivo del perché, crollo, fuga, rifugio e salvezza richiesto, oltre alla morale finale!
`;

    const geminiPayload = {
      systemInstruction: { parts: [{ text: systemInstructions }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    let responseText = '';
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: activeKey,
          model: model,
          geminiPayload: geminiPayload
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
      console.warn('Proxy fallito, tentativo browser diretto:', err.message);
      const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
      const directResponse = await fetch(directUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
      if (!directResponse.ok) {
        const errJson = await directResponse.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Errore Gemini HTTP ${directResponse.status}`);
      }
      const directResult = await directResponse.json();
      responseText = directResult?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!responseText) {
      throw new Error('Nessuna risposta dal modello Gemini.');
    }

    let cleanedText = responseText.trim();
    if (cleanedText.startsWith('```json')) cleanedText = cleanedText.slice(7);
    if (cleanedText.startsWith('```')) cleanedText = cleanedText.slice(3);
    if (cleanedText.endsWith('```')) cleanedText = cleanedText.slice(0, -3);

    return JSON.parse(cleanedText.trim());
  },

  /**
   * Converte una singola frase scritta in token strutturati CAA (parola, lemma, categoria Fitzgerald).
   * Utilizzato quando l'utente aggiunge o modifica manualmente una riga.
   * @param {string} sentence - La frase da convertire
   * @param {string} targetGrade - 'infanzia' o 'primaria'
   * @returns {Promise<Array<Object>>} Lista di token pronti per la ricerca ARASAAC
   */
  async convertSentenceToTokens(sentence, targetGrade = 'primaria') {
    const rawText = (sentence || '').trim();
    if (!rawText) return [];

    const activeKey = ConfigManager.getActiveApiKey();
    const model = ConfigManager.state.model || 'gemini-3.1-flash-lite';

    const systemPrompt = `
Sei un esperto in Comunicazione Aumentativa e Alternativa (CAA).
Converti la seguente frase in una lista di token per schede CAA.

REGOLE FITZGERALD KEY (categorie):
- "person": persone, protagonisti, animali (Giallo)
- "verb": azioni, verbi (Verde)
- "noun": cose, oggetti, luoghi, materiali (Arancione)
- "adjective": qualità, emozioni, colori, materiali (Blu)
- "social": formule sociali, saluti, sì, no, aiuto (Rosa)
- "misc": preposizioni, congiunzioni, articoli (Grigio)

PER OGNI TOKEN FORNISCI:
- displayWord: Parola esatta della frase.
- searchTerm: Lemma base all'infinito o singolare per ARASAAC (es. per "costruiscono" -> "costruire"; per "case" -> "casa"; per "scappa" -> "scappare").
- category: Una tra le categorie sopra.

RISPONDI ESCLUSIVAMENTE CON UN ARRAY JSON (nessun markdown né testo):
[
  { "displayWord": "Il", "searchTerm": "il", "category": "misc" },
  { "displayWord": "lupo", "searchTerm": "lupo", "category": "person" },
  { "displayWord": "soffia", "searchTerm": "soffiare", "category": "verb" }
]
`;

    try {
      if (activeKey) {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: activeKey,
            model: model,
            geminiPayload: {
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ parts: [{ text: `Frase da convertire: "${rawText}"` }] }],
              generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          let jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          jsonText = jsonText.trim();
          if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
          if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
          if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
          const parsed = JSON.parse(jsonText.trim());
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Conversione IA frase fallita, uso tokenizer locale:', e.message);
    }

    // Fallback locale immediato
    const words = rawText.split(/\s+/).filter(w => w.length > 0);
    return words.map(w => {
      const clean = w.replace(/[.,;:!?()"'«»]/g, '');
      let cat = 'noun';
      const lower = clean.toLowerCase();
      if (['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'e', 'ma', 'perché'].includes(lower)) cat = 'misc';
      else if (lower.endsWith('re') || lower.endsWith('no') || lower.endsWith('va') || lower.endsWith('to') || lower.endsWith('sce')) cat = 'verb';
      else if (['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro', 'mamma', 'papà', 'maestra', 'bambino', 'lupo', 'porcellino', 'maiale'].includes(lower)) cat = 'person';
      else if (['bello', 'brutto', 'grande', 'piccolo', 'pigro', 'frettoloso', 'saggio', 'forte', 'duro', 'felice', 'triste', 'rosso', 'blu'].includes(lower)) cat = 'adjective';
      return {
        displayWord: clean,
        searchTerm: clean.toLowerCase(),
        category: cat
      };
    });
  },

  /**
   * Genera un'illustrazione SVG vettoriale pertinente nello stile minimale CAA.
   * Se l'API non risponde o fallisce, crea istantaneamente un SVG procedurale semantico.
   * @param {string} word - La parola non trovata
   * @param {string} category - Categoria sintattica Fitzgerald
   * @returns {Promise<string>} Data URL dell'SVG codificato in Base64
   */
  async generateFallbackPictogramSvg(word, category = 'noun') {
    const termKey = (word || '').trim().toLowerCase();
    if (!termKey) return null;

    if (this.svgFallbackCache.has(termKey)) {
      return this.svgFallbackCache.get(termKey);
    }

    const activeKey = ConfigManager.getActiveApiKey();
    const model = ConfigManager.state.model || 'gemini-3.1-flash-lite';

    if (activeKey) {
      const svgPrompt = `
Crea un pittogramma SVG CAA (stile ARASAAC, figure stilizzate semplici) per la parola: "${word}".
Regole:
1. Solo tag <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">...</svg>
2. Linee nere nette (stroke="#1e293b", stroke-width="3.5", stroke-linecap="round", stroke-linejoin="round")
3. Campiture piatte semplici e contrastanti.
4. Niente testi né tag esterni.
`;

      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: activeKey,
            model: model,
            geminiPayload: {
              contents: [{ parts: [{ text: svgPrompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          let svgCode = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          svgCode = svgCode.trim();
          if (svgCode.includes('<svg')) {
            svgCode = svgCode.substring(svgCode.indexOf('<svg'));
          }
          if (svgCode.includes('</svg>')) {
            svgCode = svgCode.substring(0, svgCode.indexOf('</svg>') + 6);
          }

          if (svgCode.startsWith('<svg') && svgCode.endsWith('</svg>')) {
            if (!svgCode.includes('xmlns=')) {
              svgCode = svgCode.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgCode)));
            this.svgFallbackCache.set(termKey, dataUrl);
            return dataUrl;
          }
        }
      } catch (e) {
        console.warn(`Fallback procedurale per "${word}":`, e.message);
      }
    }

    // Fallback procedurale immediato garantito (disegno vettoriale pulito con icone semantiche)
    const proceduralSvg = this.createProceduralSvg(termKey, category);
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(proceduralSvg)));
    this.svgFallbackCache.set(termKey, dataUrl);
    return dataUrl;
  },

  /**
   * Generatore procedurale di pittogrammi vettoriali CAA istantaneo e garantito al 100%.
   */
  createProceduralSvg(word, category) {
    const isVerb = category === 'verb' || word.endsWith('re') || word.endsWith('no') || word.endsWith('te');
    const isPerson = category === 'person';
    const isMovement = ['partono', 'partire', 'andare', 'camminare', 'scappare', 'fuga', 'correre'].includes(word);

    let innerContent = '';
    if (isMovement) {
      innerContent = `
        <circle cx="45" cy="28" r="10" fill="#fed7aa" stroke="#1e293b" stroke-width="3"/>
        <line x1="45" y1="38" x2="45" y2="65" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="45" y1="46" x2="60" y2="55" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="45" y1="46" x2="30" y2="52" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="45" y1="65" x2="58" y2="85" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round"/>
        <line x1="45" y1="65" x2="32" y2="83" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M68 45 L82 45 M76 39 L82 45 L76 51" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else if (isPerson) {
      innerContent = `
        <circle cx="50" cy="30" r="14" fill="#fef08a" stroke="#1e293b" stroke-width="3.5"/>
        <path d="M30 80 Q50 50 70 80 Z" fill="#e2e8f0" stroke="#1e293b" stroke-width="3.5"/>
      `;
    } else if (isVerb) {
      innerContent = `
        <circle cx="50" cy="50" r="28" fill="#dcfce7" stroke="#22c55e" stroke-width="3.5"/>
        <path d="M40 50 L48 58 L62 42" fill="none" stroke="#15803d" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else {
      innerContent = `
        <rect x="25" y="25" width="50" height="50" rx="12" fill="#eff6ff" stroke="#3b82f6" stroke-width="3.5"/>
        <circle cx="50" cy="50" r="12" fill="#bfdbfe" stroke="#1d4ed8" stroke-width="3"/>
      `;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <rect width="96" height="96" x="2" y="2" rx="14" fill="#ffffff" stroke="#f1f5f9" stroke-width="2"/>
      ${innerContent}
    </svg>`;
  }
};
