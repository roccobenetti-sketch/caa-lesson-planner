/**
 * Modulo di rendering visivo per lezioni e schede didattiche CAA.
 * Supporta editing interattivo di ogni riga/sequenza:
 * - Visualizzazione e modifica diretta del testo scritto per ciascuna riga
 * - Rigenerazione istantanea dei simboli CAA tramite IA/ARASAAC
 * - Spostamento (su/giù), eliminazione ed inserimento di nuove righe
 * - Eliminazione e aggiunta di singoli simboli
 * - Resa ottimizzata per la stampa A4 (tutti i controlli no-print nascosti)
 */

import { ArasaacService } from './arasaacService.js';
import { ConfigManager } from './config.js';
import { GeminiService } from './geminiService.js';

export const LessonRenderer = {
  currentLesson: null,

  /**
   * Arricchisce un singolo token con l'immagine di ARASAAC o con il fallback SVG.
   * @param {Object} token 
   */
  async populateToken(token) {
    if (!token) return token;
    try {
      // Se ha già un'immagine valida, mantienila
      if (token.imageUrl && typeof token.imageUrl === 'string' && token.imageUrl.length > 10 && token.pictogramId !== 'placeholder') {
        return token;
      }

      const picto = await ArasaacService.getBestPictogram(token.displayWord, token.searchTerm);
      if (picto && picto.imageUrl) {
        token.pictogramId = picto.id;
        token.imageUrl = picto.imageUrl;
        token.alternatives = picto.alternatives || [];
        token.source = 'arasaac';
      } else {
        const fallbackSvg = GeminiService.createProceduralSvgDataUri(token.displayWord, token.category);
        token.pictogramId = 'procedural-svg';
        token.imageUrl = fallbackSvg;
        token.alternatives = [];
        token.source = 'procedural-svg';
      }
    } catch (err) {
      console.warn(`Errore caricamento pittogramma per ${token.displayWord}:`, err);
      token.imageUrl = GeminiService.createProceduralSvgDataUri(token.displayWord, token.category);
      token.pictogramId = 'procedural-svg';
    }
    return token;
  },

  /**
   * Arricchisce tutti i token della lezione con i pittogrammi ARASAAC e fallback SVG.
   * @param {Object} lessonData 
   * @param {Function} onProgressCallback 
   */
  async prepareLesson(lessonData, onProgressCallback = null) {
    this.currentLesson = JSON.parse(JSON.stringify(lessonData));
    const cards = this.currentLesson.cards || [];
    
    // Normalizzazione preventiva dei token (conversione garantita in Stampatello Maiuscolo per la CAA)
    cards.forEach(card => {
      card.tokens = (card.tokens || []).map(t => {
        if (typeof t === 'string') {
          const upper = t.toLocaleUpperCase('it-IT');
          return { displayWord: upper, searchTerm: t, category: 'misc' };
        }
        if (t && t.displayWord) {
          t.displayWord = t.displayWord.toLocaleUpperCase('it-IT');
        }
        return t;
      });
    });

    if (this.currentLesson.moral?.tokens) {
      this.currentLesson.moral.tokens = (this.currentLesson.moral.tokens || []).map(t => {
        if (typeof t === 'string') {
          const upper = t.toLocaleUpperCase('it-IT');
          return { displayWord: upper, searchTerm: t, category: 'misc' };
        }
        if (t && t.displayWord) {
          t.displayWord = t.displayWord.toLocaleUpperCase('it-IT');
        }
        return t;
      });
    }

    const moralTokens = this.currentLesson.moral?.tokens || [];
    let totalTokens = moralTokens.length;
    cards.forEach(card => {
      totalTokens += (card.tokens || []).length;
    });

    let loadedTokens = 0;

    const process = async (token) => {
      await this.populateToken(token);
      loadedTokens++;
      if (onProgressCallback && totalTokens > 0) {
        onProgressCallback(Math.round((loadedTokens / totalTokens) * 100));
      }
    };

    for (const card of cards) {
      for (const token of (card.tokens || [])) {
        await process(token);
      }
    }

    for (const token of moralTokens) {
      await process(token);
    }

    return this.currentLesson;
  },

  /**
   * Ritorna la classe CSS del bordo per la categoria Fitzgerald.
   */
  getCategoryBorderClass(category) {
    const cat = (category || 'misc').toLowerCase();
    switch (cat) {
      case 'person':
      case 'persona':
      case 'animale':
      case 'pronome':
        return 'border-cat-person';
      case 'verb':
      case 'verbo':
      case 'azione':
        return 'border-cat-verb';
      case 'noun':
      case 'sostantivo':
      case 'nome':
      case 'oggetto':
        return 'border-cat-noun';
      case 'adjective':
      case 'aggettivo':
      case 'numero':
      case 'colore':
        return 'border-cat-adjective';
      case 'social':
      case 'sociale':
      case 'formula':
        return 'border-cat-social';
      default:
        return 'border-cat-misc';
    }
  },

  /**
   * Alias di compatibilità per il rendering del progetto a video.
   */
  renderLesson(lesson, containerElement = document.getElementById('printableArea')) {
    return this.render(containerElement, lesson);
  },

  /**
   * Esegue il render del progetto all'interno del contenitore DOM.
   * @param {HTMLElement} containerElement 
   * @param {Object} lesson 
   */
  render(containerElement, lesson) {
    if (!lesson || !containerElement) return;
    this.currentLesson = lesson;

    const useUppercase = ConfigManager.state.useUppercase;
    const useColorBorders = ConfigManager.state.useColorBorders;
    const isInfanzia = lesson.targetGrade === 'infanzia';
    const gradeBadgeText = isInfanzia 
      ? "Scuola dell'Infanzia (3-5 anni)" 
      : `Scuola Primaria - Classe ${lesson.primaryClass || '1'}ª`;

    containerElement.className = `space-y-8 ${useUppercase ? 'uppercase-mode' : ''} ${!useColorBorders ? 'monochrome-mode' : ''}`;

    let html = `
      <!-- Intestazione Scheda Stampabile -->
      <div class="print-sheet bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
        <div class="lesson-header-print border-b border-slate-200 pb-4 mb-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div class="flex-1 min-w-0">
              <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full ${isInfanzia ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'} mb-2">
                ${gradeBadgeText}
              </span>
              <!-- Titolo della Lezione Editabile a Video (No-Print) -->
              <div class="no-print">
                <label class="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Titolo del percorso didattico:</label>
                <input type="text"
                       class="w-full text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 bg-slate-50/70 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                       value="${this.escapeHtml(lesson.title || '')}"
                       id="inputLessonTitle"
                       oninput="window.app.updateLessonTitle(this.value)"
                       placeholder="Titolo del percorso didattico..."
                       title="Clicca per modificare il titolo principale" />
              </div>
              <!-- Titolo per la Stampa (Print-Only) -->
              <h1 class="print-only text-2xl md:text-3xl font-bold text-slate-900 caa-text" id="printLessonTitle">${this.escapeHtml(lesson.title || '')}</h1>
            </div>

            <div class="text-xs text-slate-500 no-print flex flex-col items-start md:items-end gap-1">
              <span>Formato: <strong>${lesson.layoutType || 'Sequenza'}</strong></span>
              <span>Simboli: <strong>ARASAAC & IA</strong></span>
            </div>
          </div>

          <!-- Obiettivo Pedagogico Editabile con Checkbox Stampa/PDF -->
          <div class="mt-3 p-3 bg-blue-50/80 rounded-xl text-sm text-blue-900 border border-blue-100 ${lesson.includeContextSummaryInPrint === false ? 'card-excluded-print opacity-75' : ''}" id="containerContextSummary">
            <div class="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <strong class="font-bold text-xs uppercase tracking-wider text-blue-900">Obiettivo Pedagogico:</strong>
              
              <!-- Checkbox Stampa Obiettivo -->
              <label class="no-print flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-semibold cursor-pointer select-none transition ${lesson.includeContextSummaryInPrint !== false ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-slate-100 border-slate-300 text-slate-500'}"
                     title="Spunta per includere l'obiettivo pedagogico nel PDF/stampa, deseleziona per escluderlo">
                <input type="checkbox"
                       class="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-slate-300 cursor-pointer"
                       ${lesson.includeContextSummaryInPrint !== false ? 'checked' : ''}
                       onchange="window.app.toggleContextSummaryPrint(this.checked)" />
                <span>${lesson.includeContextSummaryInPrint !== false ? 'Includi in Stampa / PDF' : 'Escluso da Stampa'}</span>
              </label>
            </div>
            <textarea 
              class="no-print w-full text-xs sm:text-sm font-medium bg-white/90 hover:bg-white border border-blue-200 focus:border-blue-500 rounded-lg p-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
              rows="2"
              id="inputLessonContextSummary"
              oninput="window.app.updateLessonContextSummary(this.value)"
              placeholder="Descrivi l'obiettivo pedagogico di questa attività...">${this.escapeHtml(lesson.contextSummary || '')}</textarea>
            <p class="print-only text-sm text-blue-900" id="printLessonContextSummary">${this.escapeHtml(lesson.contextSummary || '')}</p>
          </div>

          <!-- Guida per l'Educatore Editabile con Checkbox Stampa/PDF -->
          <div class="mt-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-700 border border-slate-200 ${lesson.includeTeacherGuideInPrint === false ? 'card-excluded-print opacity-75' : ''}" id="containerTeacherGuide">
            <div class="flex items-center justify-between mb-1.5 flex-wrap gap-2">
              <strong class="font-bold text-xs uppercase tracking-wider text-slate-700">Guida per l'educatore:</strong>

              <!-- Checkbox Stampa Guida -->
              <label class="no-print flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-semibold cursor-pointer select-none transition ${lesson.includeTeacherGuideInPrint !== false ? 'bg-slate-200 border-slate-400 text-slate-900' : 'bg-slate-100 border-slate-300 text-slate-500'}"
                     title="Spunta per includere la guida per l'educatore nel PDF/stampa, deseleziona per escluderla">
                <input type="checkbox"
                       class="rounded text-slate-700 focus:ring-slate-500 h-3.5 w-3.5 border-slate-300 cursor-pointer"
                       ${lesson.includeTeacherGuideInPrint !== false ? 'checked' : ''}
                       onchange="window.app.toggleTeacherGuidePrint(this.checked)" />
                <span>${lesson.includeTeacherGuideInPrint !== false ? 'Includi in Stampa / PDF' : 'Escluso da Stampa'}</span>
              </label>
            </div>
            <textarea 
              class="no-print w-full text-xs sm:text-sm font-medium bg-white hover:bg-white border border-slate-300 focus:border-blue-500 rounded-lg p-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-800"
              rows="2"
              id="inputLessonTeacherGuide"
              oninput="window.app.updateLessonTeacherGuide(this.value)"
              placeholder="Suggerimenti operativi e modalità di somministrazione della scheda...">${this.escapeHtml(lesson.teacherGuide || '')}</textarea>
            <p class="print-only text-sm text-slate-700" id="printLessonTeacherGuide">${this.escapeHtml(lesson.teacherGuide || '')}</p>
          </div>
        </div>

        <!-- Sezione Contenuto Schede Raggruppate per Fasi -->
        <div class="space-y-6" id="cardsContainer">
    `;

    let lastSectionTitle = null;

    (lesson.cards || []).forEach((card, cardIndex) => {
      // Banner intestazione di fase/sezione se presente
      if (card.sectionTitle && card.sectionTitle !== lastSectionTitle) {
        lastSectionTitle = card.sectionTitle;
        html += `
          <div class="caa-section-header pt-4 pb-2 border-b-2 border-blue-100 mt-6 first:mt-0 flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-600 shrink-0"></span>
            <!-- Input per modificare il titolo della fase a video (No-Print) -->
            <input type="text"
                   class="no-print flex-1 text-base sm:text-lg font-bold text-blue-900 bg-blue-50/50 hover:bg-blue-50 focus:bg-white border border-blue-200 focus:border-blue-500 rounded-lg px-2.5 py-1 transition focus:outline-none focus:ring-1 focus:ring-blue-500"
                   value="${this.escapeHtml(card.sectionTitle)}"
                   id="inputSectionTitle_${cardIndex}"
                   oninput="window.app.updateSectionTitle(${cardIndex}, this.value)"
                   placeholder="Titolo della fase o sezione..."
                   title="Clicca per modificare il titolo di questa fase" />
            <!-- Titolo della fase per la stampa (Print-Only) -->
            <h2 class="print-only text-lg font-bold text-blue-900 tracking-tight" id="printSectionTitle_${cardIndex}">
              ${this.escapeHtml(card.sectionTitle)}
            </h2>
          </div>
        `;
      }

      const currentPhrase = (card.tokens || []).map(t => (typeof t === 'string' ? t : t.displayWord)).join(' ');

      html += `
        <div class="caa-step-card bg-white rounded-xl p-4 border border-slate-200 transition hover:border-slate-300 relative group ${card.includeInPrint === false ? 'opacity-70 bg-slate-50 border-dashed border-slate-300 card-excluded-print' : ''}" data-card-index="${cardIndex}">
          
          <!-- Intestazione del Passaggio (Descrizione editabile dopo il numero) -->
          <div class="flex items-center justify-between gap-2 mb-2 border-b border-slate-100 pb-1.5 flex-wrap sm:flex-nowrap">
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 shadow-sm no-print">${cardIndex + 1}</span>
              <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0 shadow-sm print-only print-step-badge"></span>
              
              <!-- Input per modificare la descrizione del passaggio a video (No-Print) -->
              <input type="text" 
                     class="no-print flex-1 text-sm sm:text-base font-bold text-slate-800 bg-slate-50/70 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg px-2.5 py-1 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                     value="${this.escapeHtml(card.stepLabel || `Passo ${cardIndex + 1}`)}" 
                     id="inputStepLabel_${cardIndex}"
                     oninput="window.app.updateStepLabel(${cardIndex}, this.value)"
                     title="Clicca per modificare la descrizione di questo passaggio"
                     placeholder="Descrizione del passaggio..." />

              <!-- Testo stampato pulito senza elementi input (Print-Only) -->
              <span class="print-only font-bold text-sm sm:text-base text-slate-900 caa-text" id="printStepLabel_${cardIndex}">
                ${this.escapeHtml(card.stepLabel || `Passo ${cardIndex + 1}`)}
              </span>
            </div>

            <!-- CONTROLLI: Checkbox Selezione Stampa + Nota Pedagogica (No-Print) -->
            <div class="no-print flex items-center gap-2 shrink-0">
              
              <!-- Casella di spunta per includere/escludere dal PDF/Stampa -->
              <label class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition select-none ${card.includeInPrint === false ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'}"
                     title="Spunta per includere questo passaggio nella stampa o PDF, togli la spunta per escluderlo">
                <input type="checkbox" 
                       class="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 border-slate-300 cursor-pointer" 
                       ${card.includeInPrint !== false ? 'checked' : ''} 
                       onchange="window.app.toggleCardPrint(${cardIndex}, this.checked)" />
                <span class="hidden sm:inline">${card.includeInPrint !== false ? 'Incluso in Stampa' : 'Escluso da Stampa'}</span>
                <span class="sm:hidden">${card.includeInPrint !== false ? '✓ PDF' : '✕ PDF'}</span>
              </label>

              <!-- Spiegazione pedagogica editabile del passaggio -->
              <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-600">
                <span class="shrink-0 text-amber-500 text-xs">💡</span>
                <input type="text" 
                       class="text-xs italic text-slate-600 bg-transparent border-none focus:outline-none focus:ring-0 w-28 sm:w-56 placeholder-slate-400"
                       value="${this.escapeHtml(card.pedagogicalExplanation || '')}"
                       oninput="window.app.updateCardPedagogicalExplanation(${cardIndex}, this.value)"
                       placeholder="Nota pedagogica..."
                       title="Clicca per modificare la nota pedagogica del passaggio" />
              </div>
            </div>
          </div>

          <!-- BARRA DI MODIFICA DELLA FRASE (No-Print) -->
          <div class="no-print bg-slate-50 p-2.5 rounded-lg border border-slate-200 mb-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <div class="flex-1 flex items-center gap-2">
              <span class="text-xs font-bold text-slate-500 whitespace-nowrap">Testo riga:</span>
              <input type="text" 
                     class="w-full text-xs sm:text-sm font-medium px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900" 
                     value="${this.escapeHtml(currentPhrase)}" 
                     id="inputPhraseCard_${cardIndex}"
                     onkeydown="if(event.key==='Enter') window.app.updateRowFromInput(${cardIndex})"
                     placeholder="Modifica o scrivi la frase di questo passaggio..." />
              <button type="button" 
                      class="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold whitespace-nowrap flex items-center gap-1 shadow-sm transition"
                      onclick="window.app.updateRowFromInput(${cardIndex})"
                      title="Ricrea i simboli CAA per questa frase">
                Aggiorna Simboli 🔄
              </button>
            </div>
            
            <!-- Controlli di riga (Sposta, Aggiungi Simbolo, Elimina) -->
            <div class="flex items-center gap-1 justify-end shrink-0">
              <button type="button" 
                      class="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition"
                      onclick="window.app.moveRow(${cardIndex}, -1)" 
                      ${cardIndex === 0 ? 'disabled' : ''} 
                      title="Sposta su">⬆️</button>
              <button type="button" 
                      class="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition"
                      onclick="window.app.moveRow(${cardIndex}, 1)" 
                      ${cardIndex === (lesson.cards.length - 1) ? 'disabled' : ''} 
                      title="Sposta giù">⬇️</button>
              <button type="button" 
                      class="px-2 py-1 rounded-md hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium flex items-center gap-1 transition"
                      onclick="window.app.promptAddToken(${cardIndex})" 
                      title="Aggiungi una parola a questa riga">
                ➕ Simbolo
              </button>
              <button type="button" 
                      class="p-1.5 rounded-md hover:bg-red-50 text-red-600 border border-red-200 text-xs font-bold transition"
                      onclick="window.app.deleteRow(${cardIndex})" 
                      title="Elimina questo passaggio">🗑️</button>
            </div>
          </div>

          <!-- Striscia di Tessere CAA della Riga -->
          <div class="reading-strip">
      `;

      (card.tokens || []).forEach((token, tokenIndex) => {
        html += this.renderTokenCard(token, cardIndex, tokenIndex);
      });

      html += `
          </div>
        </div>
      `;
    });

    // BARRA PER INSERIRE UNA NUOVA RIGA / PASSAGGIO (No-Print)
    html += `
      <div class="no-print bg-blue-50/70 p-4 rounded-xl border-2 border-dashed border-blue-300 mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
          +
        </div>
        <input type="text" 
               id="inputNewRowPhrase"
               class="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-slate-400 text-slate-900"
               placeholder="Scrivi qui una nuova riga da inserire (es: 'Il terzo porcellino prepara i mattoni con la cazzuola')..."
               onkeydown="if(event.key==='Enter') window.app.handleAddNewRow()" />
        <button type="button" 
                onclick="window.app.handleAddNewRow()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm transition flex items-center justify-center gap-2 shrink-0">
          ➕ Aggiungi e Converti con IA
        </button>
      </div>
    `;

    // Sezione La Morale e l'Insegnamento Chiave (Completamente Modificabile)
    if (lesson.moral) {
      const moralPhrase = (lesson.moral.tokens || []).map(t => (typeof t === 'string' ? t : t.displayWord)).join(' ');
      const moralTitle = lesson.moral.title || "La Morale e l'Insegnamento Chiave";
      const moralExplanation = lesson.moral.explanation || "";

      html += `
        <div class="mt-8 bg-amber-50/90 rounded-2xl p-5 md:p-6 border-2 border-amber-300 shadow-sm relative group" id="moralSection">
          
          <!-- Testata Morale in Stampa (pulita senza input) -->
          <div class="border-b border-amber-200 pb-2 mb-3">
            <div class="flex items-center gap-2">
              <span class="text-2xl">💡</span>
              <div>
                <h2 class="text-base sm:text-lg font-bold text-amber-950">${this.escapeHtml(moralTitle)}</h2>
                ${moralExplanation ? `<p class="no-print text-xs sm:text-sm text-amber-900 mt-0.5">${this.escapeHtml(moralExplanation)}</p>` : ''}
              </div>
            </div>
          </div>

          <!-- PANNELLO DI MODIFICA DELLA MORALE (No-Print) -->
          <div class="no-print bg-amber-100/70 p-3 rounded-xl border border-amber-300/80 mb-4 space-y-3">
            <div class="flex items-center justify-between gap-2 border-b border-amber-200 pb-2">
              <span class="text-xs font-bold text-amber-900 flex items-center gap-1">
                ✏️ Modifica Sezione Morale
              </span>
              <button type="button" 
                      class="px-2 py-1 text-xs text-red-700 hover:bg-red-100 rounded border border-red-300 font-medium transition"
                      onclick="window.app.deleteMoral()" 
                      title="Rimuovi la sezione morale">
                🗑️ Rimuovi Morale
              </button>
            </div>

            <!-- Modifica Titolo e Spiegazione -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label class="block text-[11px] font-bold text-amber-900 mb-1">Titolo Morale:</label>
                <input type="text" 
                       class="w-full text-xs font-medium px-2.5 py-1.5 bg-white border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900"
                       value="${this.escapeHtml(moralTitle)}"
                       oninput="window.app.updateMoralTitle(this.value)"
                       placeholder="Es: La Morale della Storia..." />
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[11px] font-bold text-amber-900 mb-1">Spiegazione Educativa:</label>
                <input type="text" 
                       class="w-full text-xs font-medium px-2.5 py-1.5 bg-white border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900"
                       value="${this.escapeHtml(moralExplanation)}"
                       oninput="window.app.updateMoralExplanation(this.value)"
                       placeholder="Spiegazione dell'insegnamento per il bambino..." />
              </div>
            </div>

            <!-- Modifica Frase e Simboli CAA della Morale -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-amber-200/60">
              <div class="flex-1 flex items-center gap-2">
                <span class="text-xs font-bold text-amber-900 whitespace-nowrap">Frase simboli:</span>
                <input type="text" 
                       class="w-full text-xs sm:text-sm font-medium px-3 py-1.5 bg-white border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none text-slate-900"
                       value="${this.escapeHtml(moralPhrase)}"
                       id="inputPhraseMoral"
                       onkeydown="if(event.key==='Enter') window.app.updateMoralFromInput()"
                       placeholder="Scrivi la frase in simboli per la morale..." />
                <button type="button" 
                        class="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold whitespace-nowrap flex items-center gap-1 shadow-sm transition"
                        onclick="window.app.updateMoralFromInput()"
                        title="Aggiorna i simboli CAA della morale">
                  Aggiorna Simboli 🔄
                </button>
              </div>
              <div class="flex items-center gap-1 justify-end shrink-0">
                <button type="button" 
                        class="px-2 py-1.5 rounded-md hover:bg-amber-200 text-amber-900 border border-amber-300 text-xs font-medium flex items-center gap-1 transition"
                        onclick="window.app.promptAddToken('moral')" 
                        title="Aggiungi una parola ai simboli della morale">
                  ➕ Simbolo
                </button>
              </div>
            </div>
          </div>

          <!-- Striscia CAA della Morale -->
          <div class="reading-strip bg-white/80 border-amber-200">
      `;

      (lesson.moral.tokens || []).forEach((token, tokenIndex) => {
        html += this.renderTokenCard(token, 'moral', tokenIndex);
      });

      html += `
          </div>
        </div>
      `;
    } else {
      // Bottone per aggiungere la morale se assente o rimossa (No-Print)
      html += `
        <div class="no-print mt-6 text-center">
          <button type="button" 
                  class="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl border border-amber-300 text-xs font-semibold shadow-sm transition inline-flex items-center gap-1.5"
                  onclick="window.app.addMoral()">
            💡 ➕ Aggiungi Sezione Morale e Insegnamento Chiave
          </button>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    containerElement.innerHTML = html;
    // Auto-fit dinamico per garantire che ogni testo sia sempre visibile e completo al 100%
    this.adjustAllTokenLabels(containerElement);
  },

  /**
   * Calcola la dimensione del font dell'etichetta CAA in base alla lunghezza
   * per garantire che la parola sia sempre completa e MAI troncata con '..'.
   */
  getWordLabelStyle(text) {
    if (!text) return '';
    const clean = String(text).trim();
    const words = clean.split(/\s+/);
    const maxWordLen = Math.max(...words.map(w => w.length));
    const totalLen = clean.length;

    let fontSize = '0.90rem';
    if (maxWordLen >= 14 || totalLen >= 18) {
      fontSize = '0.58rem';
    } else if (maxWordLen >= 11 || totalLen >= 14) {
      fontSize = '0.66rem';
    } else if (maxWordLen >= 8 || totalLen >= 10) {
      fontSize = '0.78rem';
    }

    return `font-size: ${fontSize};`;
  },

  /**
   * Auto-fit fine-grained: riduce progressivamente il font se il testo supera i limiti della tessera.
   */
  adjustAllTokenLabels(container) {
    if (!container) return;
    const labels = container.querySelectorAll('.caa-word-label');
    labels.forEach(el => {
      let currentSize = parseFloat(window.getComputedStyle(el).fontSize);
      let attempts = 0;
      while ((el.scrollWidth > (el.clientWidth + 1) || el.scrollHeight > (el.clientHeight + 1)) && currentSize > 7.5 && attempts < 25) {
        currentSize -= 0.5;
        el.style.fontSize = `${currentSize}px`;
        attempts++;
      }
    });
  },

  /**
   * Helper per generare l'HTML di una singola tessera CAA.
   */
  renderTokenCard(rawToken, cardRef, tokenIndex) {
    if (!rawToken) return '';
    const token = typeof rawToken === 'string'
      ? { displayWord: rawToken.toLocaleUpperCase('it-IT'), searchTerm: rawToken, category: 'misc' }
      : rawToken;

    if (token.displayWord) {
      token.displayWord = String(token.displayWord).toLocaleUpperCase('it-IT');
    }

    const borderClass = this.getCategoryBorderClass(token.category);
    const imgUrl = (token.imageUrl && typeof token.imageUrl === 'string' && token.imageUrl.length > 5)
      ? token.imageUrl
      : GeminiService.createProceduralSvgDataUri(token.displayWord, token.category);

    return `
      <div class="caa-card ${borderClass} rounded-xl p-2 flex flex-col items-center justify-between w-28 h-36 md:w-32 md:h-40 cursor-pointer relative group select-none"
           onclick="window.app.openPictogramSelector('${cardRef}', ${tokenIndex})"
           title="Clicca per cambiare o cercare un altro simbolo">
        
        <!-- Bottone elimina singolo simbolo (No-Print) -->
        <button type="button" 
                class="no-print absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                onclick="event.stopPropagation(); window.app.deleteToken('${cardRef}', ${tokenIndex})"
                title="Rimuovi questa parola">✕</button>

        <!-- Etichetta testuale superiore (Auto-ridimensionata, Modificabile con click, MAI troncata con '..') -->
        <div class="caa-word-label caa-text px-1 cursor-text" 
             contenteditable="true"
             style="${this.getWordLabelStyle(token.displayWord)}" 
             onclick="event.stopPropagation()"
             onblur="window.app.updateTokenWord('${cardRef}', ${tokenIndex}, this.innerText)"
             onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}"
             title="Clicca direttamente per modificare il testo scritto sopra il simbolo">
          ${this.escapeHtml(token.displayWord)}
        </div>

        <!-- Immagine Pittogramma (Con fallback automatico garantito anti-campo vuoto) -->
        <div class="caa-picto-container w-20 h-20 md:w-24 md:h-24 flex items-center justify-center p-1 bg-white rounded">
          <img src="${imgUrl}" 
               alt="${this.escapeHtml(token.displayWord)}" 
               class="max-w-full max-h-full object-contain pointer-events-none" 
               loading="eager"
               onerror="window.app.handleImageError(this, '${this.escapeHtml(token.displayWord)}', '${token.category}')" />
        </div>

        <!-- Categoria o tooltip cambio -->
        <div class="text-[10px] text-slate-400 no-print flex items-center justify-between w-full px-1">
          <span class="truncate">${token.category || 'misc'}</span>
          <span class="opacity-0 group-hover:opacity-100 text-blue-600 text-xs font-bold">✎</span>
        </div>
      </div>
    `;
  },

  /**
   * Sostituisce il pittogramma di un token specifico.
   */
  updateTokenPictogram(cardRef, tokenIndex, pictogramId, imageUrl, isCustom = false) {
    if (!this.currentLesson) return;
    let token = null;
    if (cardRef === 'moral') {
      token = this.currentLesson.moral?.tokens?.[tokenIndex];
    } else {
      token = this.currentLesson.cards?.[cardRef]?.tokens?.[tokenIndex];
    }
    if (token) {
      token.pictogramId = pictogramId;
      token.imageUrl = imageUrl;
      token.customImage = isCustom;
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
