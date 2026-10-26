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
      const picto = await ArasaacService.getBestPictogram(token.displayWord, token.searchTerm);
      if (picto && picto.imageUrl) {
        token.pictogramId = picto.id;
        token.imageUrl = picto.imageUrl;
        token.alternatives = picto.alternatives || [];
        token.source = 'arasaac';
      } else {
        const fallbackSvg = await GeminiService.generateFallbackPictogramSvg(token.displayWord, token.category);
        if (fallbackSvg) {
          token.pictogramId = 'ai-generated';
          token.imageUrl = fallbackSvg;
          token.alternatives = [];
          token.source = 'ai-generated';
        } else {
          token.pictogramId = null;
          token.imageUrl = null;
          token.source = 'placeholder';
        }
      }
    } catch (err) {
      console.warn(`Errore caricamento pittogramma per ${token.displayWord}:`, err);
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
    
    // Normalizzazione preventiva dei token
    cards.forEach(card => {
      card.tokens = (card.tokens || []).map(t => {
        if (typeof t === 'string') {
          return { displayWord: t, searchTerm: t, category: 'misc' };
        }
        return t;
      });
    });

    if (this.currentLesson.moral?.tokens) {
      this.currentLesson.moral.tokens = (this.currentLesson.moral.tokens || []).map(t => {
        if (typeof t === 'string') {
          return { displayWord: t, searchTerm: t, category: 'misc' };
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
        <div class="border-b border-slate-200 pb-4 mb-6">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full ${isInfanzia ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'} mb-2">
                ${gradeBadgeText}
              </span>
              <h1 class="text-2xl md:text-3xl font-bold text-slate-900 caa-text">${this.escapeHtml(lesson.title)}</h1>
            </div>
            <div class="text-xs text-slate-500 no-print">
              Formato: <strong>${lesson.layoutType || 'Sequenza'}</strong> • Simboli: <strong>ARASAAC & IA</strong>
            </div>
          </div>
          ${lesson.contextSummary ? `
            <div class="mt-3 p-3 bg-blue-50/80 rounded-lg text-sm text-blue-900 border border-blue-100">
              <strong class="font-semibold">Obiettivo Pedagogico:</strong> ${this.escapeHtml(lesson.contextSummary)}
            </div>
          ` : ''}
          ${lesson.teacherGuide ? `
            <div class="mt-2 p-3 bg-slate-50 rounded-lg text-sm text-slate-600 border border-slate-100">
              <strong class="text-slate-800">Guida per l'educatore:</strong> ${this.escapeHtml(lesson.teacherGuide)}
            </div>
          ` : ''}
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
          <div class="pt-4 pb-2 border-b-2 border-blue-100 mt-6 first:mt-0 flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <h2 class="text-lg font-bold text-blue-900 tracking-tight">${this.escapeHtml(card.sectionTitle)}</h2>
          </div>
        `;
      }

      const currentPhrase = (card.tokens || []).map(t => (typeof t === 'string' ? t : t.displayWord)).join(' ');

      html += `
        <div class="bg-white rounded-xl p-4 border border-slate-200 transition hover:border-slate-300 relative group" data-card-index="${cardIndex}">
          
          <!-- Intestazione del Passaggio (visibile in stampa) -->
          <div class="flex items-center justify-between gap-1 mb-2 border-b border-slate-100 pb-1.5">
            <h3 class="text-sm sm:text-base font-semibold text-slate-800 caa-text flex items-center gap-2">
              <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">${cardIndex + 1}</span>
              ${this.escapeHtml(card.stepLabel || `Passo ${cardIndex + 1}`)}
            </h3>
            ${card.pedagogicalExplanation ? `
              <span class="text-xs text-slate-500 italic bg-slate-50 px-2 py-0.5 rounded border border-slate-100 no-print">
                💡 ${this.escapeHtml(card.pedagogicalExplanation)}
              </span>
            ` : ''}
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
                ${moralExplanation ? `<p class="text-xs sm:text-sm text-amber-900 mt-0.5">${this.escapeHtml(moralExplanation)}</p>` : ''}
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
        <!-- Piede di pagina per le stampe con attribuzione ARASAAC (CC BY-NC-SA) -->
        <div class="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
          Simboli pittografici utilizzati: ARASAAC (http://www.arasaac.org) di Sergio Palao per il Governo di Aragona (licenza CC BY-NC-SA).
          Strutturato e generato con CAA Lesson Planner.
        </div>
      </div>
    `;

    containerElement.innerHTML = html;
  },

  /**
   * Helper per generare l'HTML di una singola tessera CAA.
   */
  renderTokenCard(rawToken, cardRef, tokenIndex) {
    if (!rawToken) return '';
    const token = typeof rawToken === 'string'
      ? { displayWord: rawToken, searchTerm: rawToken, category: 'misc' }
      : rawToken;

    const borderClass = this.getCategoryBorderClass(token.category);
    const imgUrl = token.imageUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23f1f5f9"/><text x="50" y="55" font-size="28" font-family="sans-serif" text-anchor="middle" fill="%2394a3b8">?</text></svg>';

    return `
      <div class="caa-card ${borderClass} rounded-xl p-2 flex flex-col items-center justify-between w-28 h-36 md:w-32 md:h-40 cursor-pointer relative group select-none"
           onclick="window.app.openPictogramSelector('${cardRef}', ${tokenIndex})"
           title="Clicca per cambiare o cercare un altro simbolo">
        
        <!-- Bottone elimina singolo simbolo (No-Print) -->
        <button type="button" 
                class="no-print absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                onclick="event.stopPropagation(); window.app.deleteToken('${cardRef}', ${tokenIndex})"
                title="Rimuovi questa parola">✕</button>

        <!-- Etichetta testuale superiore -->
        <div class="w-full text-center font-bold text-sm md:text-base text-slate-800 caa-text truncate px-1" title="${this.escapeHtml(token.displayWord)}">
          ${this.escapeHtml(token.displayWord)}
        </div>

        <!-- Immagine Pittogramma -->
        <div class="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center p-1 bg-white rounded">
          <img src="${imgUrl}" 
               alt="${this.escapeHtml(token.displayWord)}" 
               class="max-w-full max-h-full object-contain pointer-events-none" 
               loading="lazy" />
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
  updateTokenPictogram(cardRef, tokenIndex, pictogramId, imageUrl) {
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
